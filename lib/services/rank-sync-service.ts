import { and, eq, isNull, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { player, tournamentRegistration } from "@/models/schema";
import { updatePlayerRank } from "@/lib/services/player-service";
import {
  fetchTftRankByRiotId,
  RiotApiError,
  type RiotRankData,
} from "@/lib/services/riot-service";
import { env } from "@/utils/environment";
import type { TierType } from "@/types/tournament";

interface RankSyncPlayer {
  id: string;
  riot_id: string;
  tier: TierType | null;
  division: string | null;
  league_points: number | null;
}

interface RankSyncStats {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface RankSyncResult {
  scope: "tournament" | "global";
  tournamentId?: string;
  stats: RankSyncStats;
  startedAt: Date;
  endedAt: Date;
  errors: Array<{ playerId: string; riotId: string; message: string }>;
}

export interface RankSyncState {
  isRunning: boolean;
  queueSize: number;
  schedulerEnabled: boolean;
  lastRunAt: Date | null;
  lastError: string | null;
  lastResult: RankSyncResult | null;
}

type SyncScope =
  | { type: "tournament"; tournamentId: string }
  | { type: "global" };

interface SyncQueueItem {
  key: string;
  scope: SyncScope;
}

const TIERS_WITHOUT_DIVISION: TierType[] = [
  "CHALLENGER",
  "GRANDMASTER",
  "MASTER",
  "UNRANKED",
];

const RANK_SYNC_STALE_TIMEOUT_MS = 10 * 60 * 1000;

const globalForRankSync = globalThis as unknown as {
  rankSyncState?: {
    queue: SyncQueueItem[];
    running: boolean;
    runningStartedAt: Date | null;
    schedulerStarted: boolean;
    schedulerTimer?: ReturnType<typeof setInterval>;
    lastRunAt: Date | null;
    lastError: string | null;
    lastResult: RankSyncResult | null;
  };
};

function getThrottleMs(): number {
  const value = Number.parseInt(env.RIOT_RANK_SYNC_THROTTLE_MS, 10);
  if (Number.isNaN(value) || value < 500) {
    return 4000;
  }
  return value;
}

function getScheduleIntervalMs(): number {
  const value = Number.parseInt(env.RIOT_RANK_SYNC_INTERVAL_MS, 10);
  if (Number.isNaN(value) || value < 60000) {
    return 1800000;
  }
  return value;
}

function getState() {
  if (!globalForRankSync.rankSyncState) {
    globalForRankSync.rankSyncState = {
      queue: [],
      running: false,
      runningStartedAt: null,
      schedulerStarted: false,
      lastRunAt: null,
      lastError: null,
      lastResult: null,
    };
  }

  return globalForRankSync.rankSyncState;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPlayerMissingRankData(playerData: RankSyncPlayer): boolean {
  if (!playerData.tier || playerData.league_points === null) {
    return true;
  }

  if (!TIERS_WITHOUT_DIVISION.includes(playerData.tier)) {
    return !playerData.division;
  }

  return false;
}

async function fetchAndApplyPlayerRank(playerData: RankSyncPlayer): Promise<{
  updated: boolean;
  skipped: boolean;
  error?: string;
  fatal?: boolean;
}> {
  if (!isPlayerMissingRankData(playerData)) {
    return { updated: false, skipped: true };
  }

  let rankData: RiotRankData | null = null;

  try {
    rankData = await fetchTftRankByRiotId(playerData.riot_id);
  } catch (error) {
    if (error instanceof RiotApiError) {
      if (error.status === 404) {
        return { updated: false, skipped: true };
      }

      if (error.status === 401 || error.status === 403) {
        return {
          updated: false,
          skipped: false,
          fatal: true,
          error:
            "Authentification Riot invalide (401/403). Vérifiez RIOT_API_KEY puis redémarrez l'application.",
        };
      }

      if (error.status === 429 && error.retryAfterMs) {
        await sleep(error.retryAfterMs);
        try {
          rankData = await fetchTftRankByRiotId(playerData.riot_id);
        } catch (retryError) {
          return {
            updated: false,
            skipped: false,
            error:
              retryError instanceof Error
                ? retryError.message
                : "Erreur Riot inconnue après retry",
          };
        }
      } else {
        return { updated: false, skipped: false, error: error.message };
      }
    } else {
      return {
        updated: false,
        skipped: false,
        error: error instanceof Error ? error.message : "Erreur inconnue",
      };
    }
  }

  if (!rankData) {
    return { updated: false, skipped: true };
  }

  await updatePlayerRank(playerData.id, {
    tier: rankData.tier,
    division: rankData.division,
    league_points: rankData.league_points,
  });

  return { updated: true, skipped: false };
}

async function getPlayersToSyncByTournament(
  tournamentId: string,
): Promise<RankSyncPlayer[]> {
  const registrations = await db.query.tournamentRegistration.findMany({
    where: eq(tournamentRegistration.tournament_id, tournamentId),
    with: {
      player: true,
    },
  });

  return registrations.map((registration) => registration.player);
}

async function getPlayersToSyncGlobal(): Promise<RankSyncPlayer[]> {
  const players = await db.query.player.findMany({
    where: or(
      isNull(player.tier),
      isNull(player.league_points),
      and(
        notInArray(player.tier, TIERS_WITHOUT_DIVISION),
        isNull(player.division),
      ),
    ),
  });

  return players;
}

async function runRankSync(scope: SyncScope): Promise<RankSyncResult> {
  const startedAt = new Date();
  const errors: Array<{ playerId: string; riotId: string; message: string }> =
    [];
  const stats: RankSyncStats = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  const playersToSync =
    scope.type === "tournament"
      ? await getPlayersToSyncByTournament(scope.tournamentId)
      : await getPlayersToSyncGlobal();

  const throttleMs = getThrottleMs();

  for (const currentPlayer of playersToSync) {
    stats.scanned += 1;

    const outcome = await fetchAndApplyPlayerRank(currentPlayer);

    if (outcome.updated) {
      stats.updated += 1;
    } else if (outcome.skipped) {
      stats.skipped += 1;
    } else {
      stats.failed += 1;
      errors.push({
        playerId: currentPlayer.id,
        riotId: currentPlayer.riot_id,
        message: outcome.error || "Erreur de synchronisation",
      });

      if (outcome.fatal) {
        break;
      }
    }

    await sleep(throttleMs);
  }

  return {
    scope: scope.type,
    tournamentId: scope.type === "tournament" ? scope.tournamentId : undefined,
    stats,
    startedAt,
    endedAt: new Date(),
    errors,
  };
}

async function drainQueue(): Promise<void> {
  const state = getState();
  if (state.running) {
    return;
  }

  state.running = true;
  state.runningStartedAt = new Date();

  try {
    while (state.queue.length > 0) {
      const item = state.queue.shift();
      if (!item) {
        continue;
      }

      try {
        const result = await runRankSync(item.scope);
        state.lastResult = result;
        state.lastRunAt = result.endedAt;
        if (result.errors.length > 0) {
          const firstError = result.errors[0];
          state.lastError = `${result.errors.length} joueur(s) en erreur. Exemple ${firstError.riotId}: ${firstError.message}`;
        } else {
          state.lastError = null;
        }
      } catch (error) {
        state.lastError =
          error instanceof Error
            ? error.message
            : "Erreur inconnue lors du job de synchro";
      }
    }
  } finally {
    state.running = false;
    state.runningStartedAt = null;
  }
}

function recoverIfSyncIsStale(): void {
  const state = getState();
  if (!state.running || !state.runningStartedAt) {
    return;
  }

  const runningForMs = Date.now() - state.runningStartedAt.getTime();
  if (runningForMs < RANK_SYNC_STALE_TIMEOUT_MS) {
    return;
  }

  state.running = false;
  state.runningStartedAt = null;
  state.lastError =
    "Le job de synchronisation Riot semblait bloqué et a été réinitialisé automatiquement.";

  if (state.queue.length > 0) {
    void drainQueue();
  }
}

function enqueue(scope: SyncScope): void {
  const state = getState();
  const key =
    scope.type === "global" ? "global" : `tournament:${scope.tournamentId}`;

  if (state.queue.some((item) => item.key === key)) {
    return;
  }

  state.queue.push({ key, scope });
  void drainQueue();
}

export function ensureRankSyncSchedulerStarted(): void {
  const state = getState();
  if (state.schedulerStarted) {
    return;
  }

  const intervalMs = getScheduleIntervalMs();
  state.schedulerTimer = setInterval(() => {
    enqueue({ type: "global" });
  }, intervalMs);

  state.schedulerStarted = true;
}

export async function triggerTournamentRankSync(
  tournamentId: string,
): Promise<RankSyncState> {
  ensureRankSyncSchedulerStarted();
  recoverIfSyncIsStale();
  enqueue({ type: "tournament", tournamentId });
  return getRankSyncState();
}

export async function triggerGlobalRankSync(): Promise<RankSyncState> {
  ensureRankSyncSchedulerStarted();
  recoverIfSyncIsStale();
  enqueue({ type: "global" });
  return getRankSyncState();
}

export function getRankSyncState(): RankSyncState {
  recoverIfSyncIsStale();
  const state = getState();

  return {
    isRunning: state.running,
    queueSize: state.queue.length,
    schedulerEnabled: state.schedulerStarted,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    lastResult: state.lastResult,
  };
}
