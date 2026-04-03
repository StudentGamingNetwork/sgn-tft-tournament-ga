import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/environment", () => ({
  env: {
    RIOT_RANK_SYNC_THROTTLE_MS: "500",
    RIOT_RANK_SYNC_INTERVAL_MS: "60000",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      tournamentRegistration: {
        findMany: vi.fn(),
      },
      player: {
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/services/player-service", () => ({
  updatePlayerRank: vi.fn(),
}));

vi.mock("@/lib/services/riot-service", () => {
  class MockRiotApiError extends Error {
    public readonly status: number;
    public readonly retryAfterMs?: number;

    constructor(message: string, status: number, retryAfterMs?: number) {
      super(message);
      this.name = "RiotApiError";
      this.status = status;
      this.retryAfterMs = retryAfterMs;
    }
  }

  return {
    RiotApiError: MockRiotApiError,
    fetchTftRankByRiotId: vi.fn(),
  };
});

const { db } = await import("@/lib/db");
const { updatePlayerRank } = await import("@/lib/services/player-service");
const { fetchTftRankByRiotId, RiotApiError } = await import(
  "@/lib/services/riot-service"
);
const { triggerTournamentRankSync, getRankSyncState } = await import(
  "./rank-sync-service"
);

async function flushAllTimersAndJobs() {
  await vi.advanceTimersByTimeAsync(3000);
  await Promise.resolve();
}

describe("rankSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete (globalThis as any).rankSyncState;

    (db.query.tournamentRegistration.findMany as any).mockResolvedValue([
      {
        player: {
          id: "p-1",
          riot_id: "PlayerOne#EUW",
          tier: null,
          division: null,
          league_points: null,
        },
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("ignore un joueur quand Riot retourne 404", async () => {
    (fetchTftRankByRiotId as any).mockRejectedValue(
      new RiotApiError("not found", 404),
    );

    await triggerTournamentRankSync("t-1");
    await flushAllTimersAndJobs();

    const state = getRankSyncState();

    expect(updatePlayerRank).not.toHaveBeenCalled();
    expect(state.lastResult?.stats.skipped).toBe(1);
    expect(state.lastResult?.stats.failed).toBe(0);
  });

  it("retry après 429 puis met à jour le rank", async () => {
    (fetchTftRankByRiotId as any)
      .mockRejectedValueOnce(new RiotApiError("rate limited", 429, 1000))
      .mockResolvedValueOnce({
        tier: "DIAMOND",
        division: "II",
        league_points: 42,
      });

    await triggerTournamentRankSync("t-1");
    await flushAllTimersAndJobs();

    const state = getRankSyncState();

    expect(fetchTftRankByRiotId).toHaveBeenCalledTimes(2);
    expect(updatePlayerRank).toHaveBeenCalledWith("p-1", {
      tier: "DIAMOND",
      division: "II",
      league_points: 42,
    });
    expect(state.lastResult?.stats.updated).toBe(1);
    expect(state.lastResult?.stats.failed).toBe(0);
  });

  it("réinitialise automatiquement un état bloqué trop longtemps", async () => {
    (fetchTftRankByRiotId as any).mockResolvedValue({
      tier: "UNRANKED",
      division: null,
      league_points: 0,
    });

    (globalThis as any).rankSyncState = {
      queue: [{ key: "tournament:t-1", scope: { type: "tournament", tournamentId: "t-1" } }],
      running: true,
      runningStartedAt: new Date(Date.now() - 11 * 60 * 1000),
      schedulerStarted: true,
      lastRunAt: null,
      lastError: null,
      lastResult: null,
    };

    const firstState = getRankSyncState();

    expect(firstState.lastError).toContain("bloqué");

    await flushAllTimersAndJobs();

    const state = getRankSyncState();

    expect(state.isRunning).toBe(false);
    expect(state.queueSize).toBe(0);
    expect(state.lastResult?.scope).toBe("tournament");
  });

  it("arrête le job dès une erreur Riot 401", async () => {
    (db.query.tournamentRegistration.findMany as any).mockResolvedValue([
      {
        player: {
          id: "p-1",
          riot_id: "PlayerOne#EUW",
          tier: null,
          division: null,
          league_points: null,
        },
      },
      {
        player: {
          id: "p-2",
          riot_id: "PlayerTwo#EUW",
          tier: null,
          division: null,
          league_points: null,
        },
      },
    ]);

    (fetchTftRankByRiotId as any).mockRejectedValue(
      new RiotApiError("Erreur Riot API (401)", 401),
    );

    await triggerTournamentRankSync("t-1");
    await flushAllTimersAndJobs();

    const state = getRankSyncState();

    expect(fetchTftRankByRiotId).toHaveBeenCalledTimes(1);
    expect(state.lastResult?.stats.failed).toBe(1);
    expect(state.lastResult?.errors[0]?.message).toContain("Authentification Riot invalide");
  });
});
