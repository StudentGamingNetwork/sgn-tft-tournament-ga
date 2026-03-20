"use server";

import { db } from "@/lib/db";
import {
  tournament,
  tournamentRegistration,
  phase,
  game,
  bracket,
} from "@/models/schema";
import { eq, desc, sql, count } from "drizzle-orm";
import type {
  Tournament,
  PlayerWithRegistration,
  PlayerStats,
  LeaderboardEntry,
} from "@/types/tournament";
import { getPlayerByRiotId } from "@/lib/services/player-service";
import {
  getLeaderboard,
  getCumulativeLeaderboard,
  calculatePlayerStatsForPhase,
} from "@/lib/services/scoring-service";

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

/**
 * Récupérer tous les tournois avec le nombre d'inscrits et la phase actuelle
 */
export async function getTournaments(): Promise<TournamentWithCount[]> {
  try {
    const tournamentsData = await db
      .select({
        id: tournament.id,
        name: tournament.name,
        year: tournament.year,
        status: tournament.status,
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
          currentPhase: currentPhaseResult[0]?.name || null,
        };
      }),
    );

    return tournamentsWithPhase;
  } catch (error) {
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

      const totalGamesExpected = phase.brackets.reduce((sum, bracket) => {
        const game1LobbyCount = bracket.games.filter(
          (game) => game.game_number === 1,
        ).length;

        return (
          sum +
          calculateExpectedGamesForBracket(
            phase.order_index,
            phase.total_games,
            bracket.name,
            game1LobbyCount,
          )
        );
      }, 0);

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
          top4_count: 0,
        }),
      )
      .sort((a, b) => a.player_name.localeCompare(b.player_name));

    const globalWithAllPlayers = [...leaderboard, ...missingPlayers];

    const hierarchyPhase = [...startedPhases]
      .sort((a, b) => b.order_index - a.order_index)
      .find((p) => p.order_index >= 4);

    let globalLeaderboard: LeaderboardEntry[];

    if (hierarchyPhase) {
      const hierarchyPhaseLeaderboard = await getLeaderboard(hierarchyPhase.id);
      const hierarchyRankByPlayerId = new Map(
        hierarchyPhaseLeaderboard.map((entry) => [entry.player_id, entry.rank]),
      );

      const hierarchyGames = await db.query.game.findMany({
        where: eq(game.phase_id, hierarchyPhase.id),
        with: {
          bracket: true,
          lobbyPlayers: true,
        },
      });

      const playerBucket = new Map<string, string>();
      for (const g of hierarchyGames) {
        const bucket = g.bracket?.name || "other";
        for (const lp of g.lobbyPlayers) {
          if (!lp.player_id) continue;
          if (!playerBucket.has(lp.player_id)) {
            playerBucket.set(lp.player_id, bucket);
          }
        }
      }

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
      leaderboardsByFilter[bracketName] = applyTieAwareRanks(
        await getLeaderboard(bracketFilterPhase.id, bracketId),
      );
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
}

/**
 * Interface pour un joueur assigné à un lobby
 */
export interface LobbyPlayerInfo {
  player_id: string;
  player_name: string;
  riot_id: string;
  seed: number;
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

    const leaderboard = await getLeaderboard(phaseId);

    const participantsMap = new Map<string, PhasePlayerStats>();

    if (leaderboard.length > 0) {
      for (const [index, entry] of leaderboard.entries()) {
        const stats = await calculatePlayerStatsForPhase(
          entry.player_id,
          phaseId,
        );

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
          current_rank: index + 1,
          top4_or_better_count: top4OrBetterCount,
        });
      }
    } else {
      const allLobbyPlayers = gamesData.flatMap((g) => g.lobbyPlayers || []);
      const uniquePlayers = new Map<string, any>();

      for (const lp of allLobbyPlayers) {
        if (lp.player && lp.player_id && !uniquePlayers.has(lp.player_id)) {
          uniquePlayers.set(lp.player_id, lp.player);
        }
      }

      const playersWithSeeds = Array.from(uniquePlayers.entries()).map(
        ([playerId, player]) => {
          const game1Player = gamesData
            .filter((g) => g.game_number === 1)
            .flatMap((g) => g.lobbyPlayers || [])
            .find((lp) => lp.player_id === playerId);

          return {
            player_id: playerId,
            player_name: player.name,
            riot_id: player.riot_id,
            team_name: player.team?.name,
            seed: game1Player?.seed || 999,
          };
        },
      );

      playersWithSeeds.sort((a, b) => a.seed - b.seed);

      playersWithSeeds.forEach((p, index) => {
        participantsMap.set(p.player_id, {
          player_id: p.player_id,
          player_name: p.player_name,
          riot_id: p.riot_id,
          team_name: p.team_name,
          current_rank: index + 1,
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
    }

    const participants = Array.from(participantsMap.values());

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
        }))
        .sort((a, b) => a.placement - b.placement),
      assignedPlayers: (g.lobbyPlayers || [])
        .filter((lp: any) => lp.player && lp.player_id)
        .map((lp: any) => ({
          player_id: lp.player_id as string,
          player_name: lp.player.name,
          riot_id: lp.player.riot_id,
          seed: lp.seed,
        }))
        .sort((a: any, b: any) => a.seed - b.seed),
    }));

    const totalGamesCreated = gamesData.length;
    const gamesWithResults = gamesData.filter(
      (g) => g.results.length > 0,
    ).length;
    const game1LobbyCountByBracket = new Map<string, number>();
    for (const g of gamesData) {
      if (g.game_number !== 1) continue;
      const bracketName = g.bracket?.name || "unknown";
      game1LobbyCountByBracket.set(
        bracketName,
        (game1LobbyCountByBracket.get(bracketName) || 0) + 1,
      );
    }

    const totalGamesExpected = Array.from(game1LobbyCountByBracket.entries())
      .map(([bracketName, game1LobbyCount]) =>
        calculateExpectedGamesForBracket(
          phaseData.order_index,
          phaseData.total_games,
          bracketName,
          game1LobbyCount,
        ),
      )
      .reduce((sum, value) => sum + value, 0);

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
