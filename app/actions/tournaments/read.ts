"use server";

import { db } from "@/lib/db";
import {
  tournament,
  tournamentRegistration,
  phase,
  game,
  bracket,
  player,
} from "@/models/schema";
import { eq, desc, sql, count, inArray } from "drizzle-orm";
import type {
  Tournament,
  PlayerWithRegistration,
  PlayerStats,
  LeaderboardEntry,
} from "@/types/tournament";
import { getPlayerByRiotId } from "@/lib/services/player-service";
import {
  fetchTftRankByRiotId,
  RiotApiError,
  type RiotRankData,
} from "@/lib/services/riot-service";
import {
  getLeaderboard,
  getCumulativeLeaderboard,
  calculatePlayerStatsForPhase,
} from "@/lib/services/scoring-service";

export type RiotPlayerLookupState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "found"; message: string; rank: RiotRankData }
  | { status: "unranked"; message: string; rank: RiotRankData }
  | { status: "not_found"; message: string }
  | { status: "invalid"; message: string }
  | { status: "rate_limited"; message: string; retryAfterMs?: number }
  | { status: "error"; message: string };

interface TournamentWithCount extends Tournament {
  registrationsCount: number;
  currentPhase: string | null;
}

export interface TournamentGlobalResults {
  activePhase: {
    id: string;
    name: string;
    order_index: number;
    gamesWithResults: number;
    totalGamesExpected: number;
  } | null;
  filterPhase: {
    id: string;
    name: string;
    order_index: number;
  } | null;
  leaderboard: LeaderboardEntry[];
  leaderboardsByFilter: Record<string, LeaderboardEntry[]>;
  availableFilters: string[];
  updatedAt: string;
}

function areEntriesTied(a: LeaderboardEntry, b: LeaderboardEntry): boolean {
  return (
    a.total_points === b.total_points &&
    a.top1_count === b.top1_count &&
    a.top4_count === b.top4_count &&
    a.games_played === b.games_played &&
    a.avg_placement === b.avg_placement
  );
}

function applyTieAwareRanks(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  if (entries.length === 0) return [];

  let previous: LeaderboardEntry | null = null;
  let currentRank = 0;

  return entries.map((entry, index) => {
    if (index === 0) {
      currentRank = 1;
    } else if (!previous || !areEntriesTied(entry, previous)) {
      currentRank = index + 1;
    }

    const rankedEntry = {
      ...entry,
      rank: currentRank,
    };

    previous = rankedEntry;
    return rankedEntry;
  });
}

function getFinalistThresholdByBracketName(
  bracketName?: string,
): number | null {
  if (bracketName === "challenger") return 21;
  if (bracketName === "master" || bracketName === "amateur") return 18;
  return null;
}

function markFinalistsByThreshold(
  entries: LeaderboardEntry[],
  bracketName?: string,
): LeaderboardEntry[] {
  const threshold = getFinalistThresholdByBracketName(bracketName);

  if (!threshold) {
    return entries.map((entry) => ({ ...entry, is_finalist: false }));
  }

  return entries.map((entry) => ({
    ...entry,
    is_finalist: entry.total_points >= threshold,
  }));
}

/**
 * Récupérer tous les tournois avec le nombre d'inscrits et la phase actuelle
 */
export async function getTournaments(): Promise<TournamentWithCount[]> {
  try {
    let tournamentsData = await db
      .select({
        id: tournament.id,
        name: tournament.name,
        year: tournament.year,
        status: tournament.status,
        is_simulation: tournament.is_simulation,
        structure_image_url: tournament.structure_image_url,
        rules_url: tournament.rules_url,
        createdAt: tournament.createdAt,
        updatedAt: tournament.updatedAt,
        registrationsCount: count(tournamentRegistration.id),
      })
      .from(tournament)
      .leftJoin(
        tournamentRegistration,
        eq(tournament.id, tournamentRegistration.tournament_id),
      )
      .groupBy(tournament.id)
      .orderBy(desc(tournament.createdAt));

    if (!tournamentsData) {
      tournamentsData = [];
    }

    const tournamentsWithPhase = await Promise.all(
      tournamentsData.map(async (t) => {
        const currentPhaseResult = await db
          .select({
            name: phase.name,
          })
          .from(phase)
          .where(eq(phase.tournament_id, t.id))
          .orderBy(desc(phase.order_index))
          .limit(1);

        return {
          ...t,
          currentPhase: currentPhaseResult[0]?.name || null,
        };
      }),
    );

    return tournamentsWithPhase;
  } catch (error) {
    const pgErrorCode = (error as { cause?: { code?: string } })?.cause?.code;

    if (pgErrorCode === "42703") {
      const tournamentsData = await db
        .select({
          id: tournament.id,
          name: tournament.name,
          year: tournament.year,
          status: tournament.status,
          is_simulation: tournament.is_simulation,
          createdAt: tournament.createdAt,
          updatedAt: tournament.updatedAt,
          registrationsCount: count(tournamentRegistration.id),
        })
        .from(tournament)
        .leftJoin(
          tournamentRegistration,
          eq(tournament.id, tournamentRegistration.tournament_id),
        )
        .groupBy(tournament.id)
        .orderBy(desc(tournament.createdAt));

      const tournamentsWithPhase = await Promise.all(
        tournamentsData.map(async (t) => {
          const currentPhaseResult = await db
            .select({
              name: phase.name,
            })
            .from(phase)
            .where(eq(phase.tournament_id, t.id))
            .orderBy(desc(phase.order_index))
            .limit(1);

          return {
            ...t,
            structure_image_url: null,
            rules_url: null,
            currentPhase: currentPhaseResult[0]?.name || null,
          };
        }),
      );

      return tournamentsWithPhase;
    }

    console.error("Error fetching tournaments:", error);
    throw new Error("Impossible de récupérer les tournois");
  }
}

/**
 * Récupérer un tournoi par son ID
 */
export async function getTournamentById(
  id: string,
): Promise<Tournament | null> {
  try {
    const result = await db
      .select()
      .from(tournament)
      .where(eq(tournament.id, id))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("Error fetching tournament:", error);
    throw new Error("Impossible de récupérer le tournoi");
  }
}

/**
 * Interface pour une phase avec ses détails (brackets, games, etc.)
 */
export interface PhaseWithDetails {
  id: string;
  tournament_id: string | null;
  name: string;
  order_index: number;
  total_games: number;
  createdAt: Date;
  updatedAt: Date;
  brackets: Array<{
    id: string;
    name: string;
    gamesCount: number;
  }>;
  totalGamesCreated: number;
  gamesWithResults: number;
  totalGamesExpected: number;
  status: "not_started" | "in_progress" | "completed";
  canEnterResults: boolean;
}

function calculateExpectedGamesForBracket(
  phaseOrderIndex: number,
  totalGames: number,
  bracketName: string,
  game1LobbyCount: number,
): number {
  if (game1LobbyCount === 0 || totalGames === 0) {
    return 0;
  }

  if (phaseOrderIndex === 4 && bracketName === "master" && totalGames > 2) {
    const reducedLobbyCount = Math.floor(game1LobbyCount / 2);
    return game1LobbyCount * 2 + reducedLobbyCount * (totalGames - 2);
  }

  if (phaseOrderIndex === 5) {
    const cappedTotalGames =
      bracketName === "challenger"
        ? Math.min(totalGames, 7)
        : Math.min(totalGames, 6);
    return game1LobbyCount * cappedTotalGames;
  }

  return game1LobbyCount * totalGames;
}

/**
 * Récupérer les phases d'un tournoi avec leurs détails
 */
export async function getTournamentPhases(
  tournamentId: string,
): Promise<PhaseWithDetails[]> {
  try {
    const phases = await db.query.phase.findMany({
      where: eq(phase.tournament_id, tournamentId),
      orderBy: (phase, { asc }) => [asc(phase.order_index)],
      with: {
        brackets: {
          with: {
            games: {
              with: {
                results: true,
              },
            },
          },
        },
      },
    });

    return phases.map((phase): PhaseWithDetails => {
      const totalGamesCreated = phase.brackets.reduce(
        (sum, bracket) => sum + bracket.games.length,
        0,
      );
      const gamesWithResults = phase.brackets.reduce(
        (sum, bracket) =>
          sum + bracket.games.filter((game) => game.results.length > 0).length,
        0,
      );

      // Expected games must reflect the current real schedule (after forfait-driven deletions/recreations).
      const totalGamesExpected = totalGamesCreated;

      let status: "not_started" | "in_progress" | "completed" = "not_started";
      if (totalGamesCreated === 0) {
        status = "not_started";
      } else if (gamesWithResults < totalGamesExpected) {
        status = "in_progress";
      } else {
        status = "completed";
      }

      return {
        id: phase.id,
        tournament_id: phase.tournament_id,
        name: phase.name,
        order_index: phase.order_index,
        total_games: phase.total_games,
        createdAt: phase.createdAt,
        updatedAt: phase.updatedAt,
        brackets: phase.brackets.map((bracket) => ({
          id: bracket.id,
          name: bracket.name,
          gamesCount: bracket.games.length,
        })),
        totalGamesCreated,
        gamesWithResults,
        totalGamesExpected,
        status,
        canEnterResults:
          totalGamesCreated > 0 && gamesWithResults < totalGamesExpected,
      } satisfies PhaseWithDetails;
    });
  } catch (error) {
    console.error("Error fetching tournament phases:", error);
    throw new Error("Impossible de récupérer les phases du tournoi");
  }
}

/**
 * Récupérer les résultats globaux d'un tournoi (phase active)
 */
export async function getTournamentGlobalResults(
  tournamentId: string,
): Promise<TournamentGlobalResults> {
  try {
    const phases = await getTournamentPhases(tournamentId);

    const startedPhases = phases.filter((p) => p.totalGamesCreated > 0);
    if (startedPhases.length === 0) {
      return {
        activePhase: null,
        filterPhase: null,
        leaderboard: [],
        leaderboardsByFilter: {
          global: [],
        },
        availableFilters: ["global"],
        updatedAt: new Date().toISOString(),
      };
    }

    const activePhase = [...startedPhases].sort(
      (a, b) => b.order_index - a.order_index,
    )[0];

    const finalsPhase = startedPhases.find((p) => p.order_index === 5);
    const bracketFilterPhase = finalsPhase || activePhase;

    const startedPhaseIds = startedPhases
      .sort((a, b) => a.order_index - b.order_index)
      .map((p) => p.id);

    const leaderboard =
      startedPhaseIds.length > 1
        ? await getCumulativeLeaderboard(startedPhaseIds)
        : await getLeaderboard(activePhase.id);

    const tournamentPlayers = await getTournamentPlayers(tournamentId);
    const forfeitedPlayerIds = new Set(
      tournamentPlayers
        .filter((p) => Boolean(p.registration.forfeited_at))
        .map((p) => p.id),
    );
    const leaderboardByPlayerId = new Map(
      leaderboard.map((entry) => [entry.player_id, entry]),
    );

    const missingPlayers = tournamentPlayers
      .filter((p) => !leaderboardByPlayerId.has(p.id))
      .map(
        (p): LeaderboardEntry => ({
          rank: 0,
          player_id: p.id,
          player_name: p.name,
          riot_id: p.riot_id,
          team_name: p.team?.name,
          total_points: 0,
          games_played: 0,
          avg_placement: 0,
          top1_count: 0,
          top2_count: 0,
          top3_count: 0,
          top4_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          is_forfeited: forfeitedPlayerIds.has(p.id),
        }),
      )
      .sort((a, b) => a.player_name.localeCompare(b.player_name));

    const rankedPlayers = leaderboard.map((entry) => ({
      ...entry,
      is_forfeited: forfeitedPlayerIds.has(entry.player_id),
    }));

    const globalWithAllPlayers = [...rankedPlayers, ...missingPlayers];

    const hierarchyPhase = [...startedPhases]
      .sort((a, b) => b.order_index - a.order_index)
      .find((p) => p.order_index >= 4);

    let globalLeaderboard: LeaderboardEntry[];
    let hierarchyPlayerBucket = new Map<string, string>();

    if (hierarchyPhase) {
      const hierarchyPhaseLeaderboard = await getLeaderboard(hierarchyPhase.id);
      const hierarchyRankByPlayerId = new Map(
        hierarchyPhaseLeaderboard.map((entry) => [entry.player_id, entry.rank]),
      );

      const playerBucket = new Map<string, string>();

      const phasesForBucketFallback = [...startedPhases]
        .sort((a, b) => b.order_index - a.order_index)
        .map((p) => p.id);

      for (const phaseIdForBucket of phasesForBucketFallback) {
        const phaseGames = await db.query.game.findMany({
          where: eq(game.phase_id, phaseIdForBucket),
          with: {
            bracket: true,
            lobbyPlayers: true,
            results: true,
          },
        });

        for (const g of phaseGames) {
          const bucket = g.bracket?.name || "other";

          for (const lp of g.lobbyPlayers) {
            if (!lp.player_id || playerBucket.has(lp.player_id)) {
              continue;
            }

            playerBucket.set(lp.player_id, bucket);
          }

          for (const resultEntry of g.results) {
            if (!resultEntry.player_id || playerBucket.has(resultEntry.player_id)) {
              continue;
            }

            playerBucket.set(resultEntry.player_id, bucket);
          }
        }
      }
      hierarchyPlayerBucket = playerBucket;

      const priorityOrder =
        hierarchyPhase.order_index >= 5
          ? ["challenger", "master", "amateur", "common", "other"]
          : ["master", "amateur", "common", "other"];

      const priorityMap = new Map(
        priorityOrder.map((name, idx) => [name, idx]),
      );

      const ordered = [...globalWithAllPlayers].sort((a, b) => {
        const bucketA = playerBucket.get(a.player_id) || "other";
        const bucketB = playerBucket.get(b.player_id) || "other";

        const prioA = priorityMap.get(bucketA) ?? Number.MAX_SAFE_INTEGER;
        const prioB = priorityMap.get(bucketB) ?? Number.MAX_SAFE_INTEGER;

        if (prioA !== prioB) {
          return prioA - prioB;
        }

        const hierarchyRankA = hierarchyRankByPlayerId.get(a.player_id);
        const hierarchyRankB = hierarchyRankByPlayerId.get(b.player_id);

        const rankA =
          hierarchyRankA ?? (a.rank > 0 ? a.rank : Number.MAX_SAFE_INTEGER);
        const rankB =
          hierarchyRankB ?? (b.rank > 0 ? b.rank : Number.MAX_SAFE_INTEGER);

        if (rankA !== rankB) {
          return rankA - rankB;
        }

        return a.player_name.localeCompare(b.player_name);
      });

      let previous: LeaderboardEntry | null = null;
      let previousBucket: string | null = null;
      let currentRank = 0;

      globalLeaderboard = ordered.map((entry, index) => {
        const currentBucket = playerBucket.get(entry.player_id) || "other";

        if (index === 0) {
          currentRank = 1;
        } else if (
          !previous ||
          currentBucket !== previousBucket ||
          !areEntriesTied(entry, previous)
        ) {
          currentRank = index + 1;
        }

        previous = { ...entry, rank: currentRank };
        previousBucket = currentBucket;

        return {
          ...entry,
          rank: currentRank,
        };
      });
    } else {
      globalLeaderboard = applyTieAwareRanks(globalWithAllPlayers);
    }

    if (bracketFilterPhase.order_index === 5) {
      globalLeaderboard = globalLeaderboard.map((entry) => {
        const bucket = hierarchyPlayerBucket.get(entry.player_id);
        const threshold = getFinalistThresholdByBracketName(bucket);
        return {
          ...entry,
          is_finalist: threshold ? entry.total_points >= threshold : false,
        };
      });
    }

    globalLeaderboard = globalLeaderboard.map((entry) => ({
      ...entry,
      is_forfeited: forfeitedPlayerIds.has(entry.player_id),
    }));

    const bracketNameToId = new Map(
      bracketFilterPhase.brackets.map((b) => [b.name, b.id]),
    );

    const preferredOrder = ["challenger", "master", "amateur", "common"];
    const orderedBracketNames = preferredOrder.filter((name) =>
      bracketNameToId.has(name),
    );

    const leaderboardsByFilter: Record<string, LeaderboardEntry[]> = {
      global: globalLeaderboard,
    };

    for (const bracketName of orderedBracketNames) {
      const bracketId = bracketNameToId.get(bracketName);
      if (!bracketId) continue;
      const bracketLeaderboard = applyTieAwareRanks(
        await getLeaderboard(bracketFilterPhase.id, bracketId),
      );
      const bracketWithFinalists =
        bracketFilterPhase.order_index === 5
          ? markFinalistsByThreshold(bracketLeaderboard, bracketName)
          : bracketLeaderboard;

      leaderboardsByFilter[bracketName] = bracketWithFinalists.map((entry) => ({
        ...entry,
        is_forfeited: forfeitedPlayerIds.has(entry.player_id),
      }));
    }

    const availableFilters = ["global", ...orderedBracketNames];

    return {
      activePhase: {
        id: activePhase.id,
        name: activePhase.name,
        order_index: activePhase.order_index,
        gamesWithResults: activePhase.gamesWithResults,
        totalGamesExpected: activePhase.totalGamesExpected,
      },
      filterPhase: {
        id: bracketFilterPhase.id,
        name: bracketFilterPhase.name,
        order_index: bracketFilterPhase.order_index,
      },
      leaderboard: globalLeaderboard,
      leaderboardsByFilter,
      availableFilters,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching global tournament results:", error);
    throw new Error("Impossible de récupérer les résultats globaux du tournoi");
  }
}

/**
 * Récupérer le nombre d'inscrits pour un tournoi
 */
export async function getTournamentRegistrationsCount(
  tournamentId: string,
): Promise<number> {
  try {
    const result = await db
      .select({ count: count() })
      .from(tournamentRegistration)
      .where(eq(tournamentRegistration.tournament_id, tournamentId));

    return result[0]?.count || 0;
  } catch (error) {
    console.error("Error fetching registrations count:", error);
    throw new Error("Impossible de récupérer le nombre d'inscrits");
  }
}

/**
 * Récupérer les joueurs inscrits à un tournoi
 */
export async function getTournamentPlayers(
  tournamentId: string,
): Promise<PlayerWithRegistration[]> {
  try {
    const registrations = await db.query.tournamentRegistration.findMany({
      where: eq(tournamentRegistration.tournament_id, tournamentId),
      with: {
        player: {
          with: {
            team: true,
          },
        },
      },
      orderBy: desc(tournamentRegistration.registered_at),
    });

    return registrations.map((reg) => ({
      ...reg.player,
      registration: {
        id: reg.id,
        tournament_id: reg.tournament_id,
        player_id: reg.player_id,
        status: reg.status,
        forfeited_at: reg.forfeited_at,
        registered_at: reg.registered_at,
        createdAt: reg.createdAt,
        updatedAt: reg.updatedAt,
      },
      team: reg.player.team,
    }));
  } catch (error) {
    console.error("Error fetching tournament players:", error);
    throw new Error("Impossible de récupérer les joueurs du tournoi");
  }
}

/**
 * Rechercher un joueur par son Riot ID
 */
export async function searchPlayerByRiotId(riotId: string) {
  try {
    return await getPlayerByRiotId(riotId);
  } catch (error) {
    console.error("Error searching player:", error);
    return null;
  }
}

/**
 * Vérifier en direct l'état d'un joueur côté API Riot.
 */
export async function lookupRiotPlayerStatusByRiotId(
  riotId: string,
): Promise<RiotPlayerLookupState> {
  try {
    if (!riotId || !riotId.includes("#")) {
      return {
        status: "invalid",
        message: "Format attendu: Nom#TAG",
      };
    }

    const rankData = await fetchTftRankByRiotId(riotId);

    if (!rankData) {
      return {
        status: "error",
        message: "Impossible de déterminer le rank Riot",
      };
    }

    if (rankData.tier === "UNRANKED") {
      return {
        status: "unranked",
        message: "Compte Riot trouvé: joueur non classé (UNRANKED)",
        rank: rankData,
      };
    }

    return {
      status: "found",
      message: `Compte Riot trouvé: ${rankData.tier} ${rankData.division ?? ""} (${rankData.league_points} LP)`,
      rank: rankData,
    };
  } catch (error) {
    if (error instanceof RiotApiError) {
      if (error.status === 404) {
        return {
          status: "not_found",
          message: "Compte Riot introuvable",
        };
      }

      if (error.status === 400) {
        return {
          status: "invalid",
          message: "Riot ID invalide",
        };
      }

      if (error.status === 429) {
        return {
          status: "rate_limited",
          message: "Limite Riot atteinte, réessayez dans quelques instants",
          retryAfterMs: error.retryAfterMs,
        };
      }

      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Erreur inconnue côté Riot API",
    };
  }
}

/**
 * Récupérer une phase par son ID
 */
export async function getPhaseById(phaseId: string) {
  try {
    const phaseData = await db.query.phase.findFirst({
      where: eq(phase.id, phaseId),
      with: {
        tournament: true,
      },
    });
    return phaseData || null;
  } catch (error) {
    console.error("Error fetching phase:", error);
    throw new Error("Impossible de récupérer la phase");
  }
}

/**
 * Interface pour les statistiques d'un joueur sur une phase avec les infos de placement
 */
export interface PhasePlayerStats extends PlayerStats {
  player_id: string;
  player_name: string;
  riot_id: string;
  team_name?: string;
  seed?: number;
  current_rank: number;
  top4_or_better_count: number;
  is_finalist?: boolean;
}

/**
 * Interface pour les résultats d'une game
 */
export interface GamePlayerResult {
  player_id: string;
  player_name: string;
  riot_id: string;
  placement: number;
  points: number;
  result_status: "normal" | "forfeit" | "absent";
  is_finalist?: boolean;
}

/**
 * Interface pour un joueur assigné à un lobby
 */
export interface LobbyPlayerInfo {
  player_id: string;
  player_name: string;
  riot_id: string;
  seed: number;
  display_seed: number;
  is_finalist?: boolean;
}

/**
 * Interface pour une game avec ses résultats
 */
export interface GameWithResults {
  game_id: string;
  lobby_name: string;
  game_number: number;
  bracket_name: string;
  status: string;
  results: GamePlayerResult[];
  assignedPlayers: LobbyPlayerInfo[];
  hasResults: boolean;
}

/**
 * Interface pour les détails complets d'une phase
 */
export interface PhaseDetails {
  phase: {
    id: string;
    name: string;
    order_index: number;
    total_games: number;
    createdAt: Date;
    updatedAt: Date;
    tournament: {
      id: string;
      name: string;
      year: string;
      status: "upcoming" | "ongoing" | "completed";
      is_simulation: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    totalGamesCreated: number;
    gamesWithResults: number;
    totalGamesExpected: number;
    participantsCount: number;
  };
  participants: PhasePlayerStats[];
  games: GameWithResults[];
}

/**
 * Récupérer les détails complets d'une phase avec statistiques
 */
export async function getPhaseDetails(
  phaseId: string,
): Promise<PhaseDetails | null> {
  try {
    const phaseData = await db.query.phase.findFirst({
      where: eq(phase.id, phaseId),
      with: {
        tournament: true,
      },
    });

    if (!phaseData) {
      return null;
    }

    if (!phaseData.tournament) {
      throw new Error("Tournoi associé non trouvé");
    }

    const gamesData = await db.query.game.findMany({
      where: eq(game.phase_id, phaseId),
      with: {
        bracket: true,
        results: {
          with: {
            player: true,
          },
        },
        lobbyPlayers: {
          with: {
            player: true,
          },
        },
      },
      orderBy: (game, { asc }) => [asc(game.game_number)],
    });

    let leaderboard = await getLeaderboard(phaseId);

    // Phase 2 public ranking must include Phase 1 points/tie-breakers and full global ordering.
    if (phaseData.order_index === 2) {
      const phase1 = await db.query.phase.findFirst({
        where: sql`${phase.tournament_id} = ${phaseData.tournament.id} AND ${phase.order_index} = 1`,
      });

      if (phase1) {
        const phase1Leaderboard = await getLeaderboard(phase1.id);
        const cumulativeLeaderboard = await getCumulativeLeaderboard([
          phase1.id,
          phaseId,
        ]);

        const phase2Players = new Set(
          gamesData
            .flatMap((g) => g.lobbyPlayers || [])
            .map((lp) => lp.player_id)
            .filter((playerId): playerId is string => Boolean(playerId)),
        );

        // Keep Phase 1 top16 locked at global ranks 1..16 for Phase 2 global ranking.
        const fixedTop16 = phase1Leaderboard.slice(0, 16);
        const fixedTop16Ids = new Set(
          fixedTop16.map((entry) => entry.player_id),
        );

        const orderedPhase2Players = cumulativeLeaderboard.filter(
          (entry) =>
            phase2Players.has(entry.player_id) &&
            !fixedTop16Ids.has(entry.player_id),
        );

        const fullGlobalLeaderboard = [
          ...fixedTop16,
          ...orderedPhase2Players,
        ].map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));

        // Public phase 2 view only shows players actually in phase 2, with preserved global ranks.
        leaderboard = fullGlobalLeaderboard.filter((entry) =>
          phase2Players.has(entry.player_id),
        );
      }
    }

    const participantsMap = new Map<string, PhasePlayerStats>();

    const allLobbyPlayers = gamesData.flatMap((g) => g.lobbyPlayers || []);
    const uniquePlayers = new Map<string, any>();

    for (const lp of allLobbyPlayers) {
      if (lp.player && lp.player_id && !uniquePlayers.has(lp.player_id)) {
        uniquePlayers.set(lp.player_id, lp.player);
      }
    }

    // Phase 3 global ranking should always include the full qualified pool,
    // even if some players have no current lobby assignment/results.
    if (phaseData.order_index === 3) {
      const [phase1, phase2] = await Promise.all([
        db.query.phase.findFirst({
          where: sql`${phase.tournament_id} = ${phaseData.tournament.id} AND ${phase.order_index} = 1`,
        }),
        db.query.phase.findFirst({
          where: sql`${phase.tournament_id} = ${phaseData.tournament.id} AND ${phase.order_index} = 2`,
        }),
      ]);

      if (phase1 && phase2) {
        const [phase1Leaderboard, phase2Leaderboard] = await Promise.all([
          getLeaderboard(phase1.id),
          getLeaderboard(phase2.id),
        ]);

        const expectedPhase3PlayerIds = new Set<string>([
          ...phase1Leaderboard.slice(0, 16).map((entry) => entry.player_id),
          ...phase2Leaderboard.map((entry) => entry.player_id),
        ]);

        const missingExpectedIds = Array.from(expectedPhase3PlayerIds).filter(
          (playerId) => !uniquePlayers.has(playerId),
        );

        if (missingExpectedIds.length > 0) {
          const missingPlayers = await db.query.player.findMany({
            where: inArray(player.id, missingExpectedIds),
            with: {
              team: true,
            },
          });

          for (const missingPlayer of missingPlayers) {
            uniquePlayers.set(missingPlayer.id, missingPlayer);
          }
        }
      }
    }

    const game1SeedByPlayerId = new Map<string, number>();
    for (const g of gamesData) {
      if (g.game_number !== 1) {
        continue;
      }

      for (const lp of g.lobbyPlayers || []) {
        if (!lp.player_id || !lp.seed) {
          continue;
        }

        const existingSeed = game1SeedByPlayerId.get(lp.player_id);
        if (existingSeed === undefined || lp.seed < existingSeed) {
          game1SeedByPlayerId.set(lp.player_id, lp.seed);
        }
      }
    }

    if (leaderboard.length > 0) {
      for (const [index, entry] of leaderboard.entries()) {
        const stats =
          phaseData.order_index === 2
            ? {
                player_id: entry.player_id,
                total_points: entry.total_points,
                total_games: entry.games_played,
                avg_placement: entry.avg_placement,
                top1_count: entry.top1_count,
                top2_count: entry.top2_count,
                top3_count: entry.top3_count,
                top4_count: entry.top4_count,
                top5_count: entry.top5_count,
                top6_count: entry.top6_count,
                top7_count: entry.top7_count,
                top8_count: entry.top8_count,
                placements: [],
              }
            : await calculatePlayerStatsForPhase(entry.player_id, phaseId);

        const top4OrBetterCount =
          stats.top1_count +
          stats.top2_count +
          stats.top3_count +
          stats.top4_count;

        participantsMap.set(entry.player_id, {
          ...stats,
          player_name: entry.player_name,
          riot_id: entry.riot_id,
          team_name: entry.team_name,
          current_rank: phaseData.order_index === 2 ? entry.rank : index + 1,
          top4_or_better_count: top4OrBetterCount,
        });
      }
    }

    const playersWithoutStats = Array.from(uniquePlayers.entries())
      .filter(([playerId]) => !participantsMap.has(playerId))
      .map(([playerId, player]) => ({
        player_id: playerId,
        player_name: player.name,
        riot_id: player.riot_id,
        team_name: player.team?.name,
        seed: game1SeedByPlayerId.get(playerId) ?? 999,
      }))
      .sort((a, b) => a.seed - b.seed);

    const nextRankStart =
      participantsMap.size === 0
        ? 1
        : Math.max(...Array.from(participantsMap.values()).map((p) => p.current_rank)) + 1;

    playersWithoutStats.forEach((p, index) => {
      participantsMap.set(p.player_id, {
        player_id: p.player_id,
        player_name: p.player_name,
        riot_id: p.riot_id,
        team_name: p.team_name,
        current_rank: nextRankStart + index,
        total_points: 0,
        total_games: 0,
        avg_placement: 0,
        top1_count: 0,
        top2_count: 0,
        top3_count: 0,
        top4_count: 0,
        top5_count: 0,
        top6_count: 0,
        top7_count: 0,
        top8_count: 0,
        placements: [],
        top4_or_better_count: 0,
      });
    });

    const participants = Array.from(participantsMap.values());

    const finalistByPlayerId = new Map<string, boolean>();
    if (phaseData.order_index === 5) {
      const phase5PlayerBucket = new Map<string, string>();
      for (const g of gamesData) {
        const bracketName = g.bracket?.name;
        for (const lp of g.lobbyPlayers) {
          if (
            !lp.player_id ||
            !bracketName ||
            phase5PlayerBucket.has(lp.player_id)
          ) {
            continue;
          }
          phase5PlayerBucket.set(lp.player_id, bracketName);
        }
      }

      for (const participant of participants) {
        const bucket = phase5PlayerBucket.get(participant.player_id);
        const threshold = getFinalistThresholdByBracketName(bucket);
        const isFinalist = threshold
          ? participant.total_points >= threshold
          : false;
        participant.is_finalist = isFinalist;
        finalistByPlayerId.set(participant.player_id, isFinalist);
      }
    }

    const globalRankByPlayerId = new Map<string, number>(
      participants.map((participant) => [
        participant.player_id,
        participant.current_rank,
      ]),
    );

    const games: GameWithResults[] = gamesData.map((g) => ({
      game_id: g.id,
      lobby_name: g.lobby_name,
      game_number: g.game_number,
      bracket_name: g.bracket?.name || "unknown",
      status: g.status,
      hasResults: g.results.length > 0,
      results: g.results
        .filter((r) => r.player && r.player_id)
        .map((r) => ({
          player_id: r.player_id as string,
          player_name: r.player!.name,
          riot_id: r.player!.riot_id,
          placement: r.placement,
          points: r.points,
          result_status: r.result_status,
          is_finalist: finalistByPlayerId.get(r.player_id as string) ?? false,
        }))
        .sort((a, b) => {
          const statusOrder: Record<GamePlayerResult["result_status"], number> =
            {
              normal: 0,
              absent: 1,
              forfeit: 2,
            };

          if (statusOrder[a.result_status] !== statusOrder[b.result_status]) {
            return statusOrder[a.result_status] - statusOrder[b.result_status];
          }

          return a.placement - b.placement;
        }),
      assignedPlayers: (g.lobbyPlayers || [])
        .filter((lp: any) => lp.player && lp.player_id)
        .map((lp: any) => {
          const playerId = lp.player_id as string;
          const technicalSeed = lp.seed;

          return {
            player_id: playerId,
          player_name: lp.player.name,
          riot_id: lp.player.riot_id,
          seed: technicalSeed,
          // Display seed follows global phase ranking across all phases.
          display_seed: globalRankByPlayerId.get(playerId) ?? technicalSeed,
          is_finalist: finalistByPlayerId.get(playerId) ?? false,
          };
        })
        .sort((a: any, b: any) => {
          if (a.display_seed !== b.display_seed) {
            return a.display_seed - b.display_seed;
          }

          return a.seed - b.seed;
        }),
    }));

    const totalGamesCreated = gamesData.length;
    const gamesWithResults = gamesData.filter(
      (g) => g.results.length > 0,
    ).length;
    // Expected games must reflect the current real schedule (after forfait-driven deletions/recreations).
    const totalGamesExpected = totalGamesCreated;

    const confirmedPlayersCount = await db
      .select({ count: count() })
      .from(tournamentRegistration)
      .where(
        sql`${tournamentRegistration.tournament_id} = ${phaseData.tournament.id} AND ${tournamentRegistration.status} = 'confirmed'`,
      );
    const participantsCount = confirmedPlayersCount[0]?.count || 0;

    return {
      phase: {
        id: phaseData.id,
        name: phaseData.name,
        order_index: phaseData.order_index,
        total_games: phaseData.total_games,
        createdAt: phaseData.createdAt,
        updatedAt: phaseData.updatedAt,
        tournament: phaseData.tournament,
        totalGamesCreated,
        gamesWithResults,
        totalGamesExpected,
        participantsCount,
      },
      participants,
      games,
    };
  } catch (error) {
    console.error("Error fetching phase details:", error);
    throw new Error("Impossible de récupérer les détails de la phase");
  }
}
