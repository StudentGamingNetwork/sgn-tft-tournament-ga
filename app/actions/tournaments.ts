"use server";

import { db } from "@/lib/db";
import {
  tournament,
  tournamentRegistration,
  phase,
  player,
  team,
  game,
  results,
  bracket,
} from "@/models/schema";
import { eq, desc, sql, count, inArray } from "drizzle-orm";
import type {
  Tournament,
  InsertTournament,
  TierType,
  DivisionType,
  PlayerWithRegistration,
  RegistrationStatusType,
  PlayerStats,
  LeaderboardEntry,
  GameResult,
} from "@/types/tournament";
import {
  createPlayer,
  getPlayerByRiotId,
  importPlayersFromCSV,
  updatePlayer,
} from "@/lib/services/player-service";
import type { PlayerCSVImport } from "@/types/tournament";
import { validatePlayerData } from "@/utils/validation";
import {
  getLeaderboard,
  getCumulativeLeaderboard,
  calculatePlayerStatsForPhase,
} from "@/lib/services/scoring-service";
import {
  createStandardTournament,
  startPhase,
  startPhase2FromPhase1,
  startPhase3FromPhase1And2,
  startPhase4FromPhase3,
  startPhase5FromPhase4,
} from "@/lib/services/tournament-service";
import { submitGameResults } from "@/lib/services/game-service";

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
    // Récupérer tous les tournois avec le compte d'inscriptions
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

    // Pour chaque tournoi, récupérer la phase actuelle (celle avec le plus grand order_index)
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
 * Récupérer les résultats globaux d'un tournoi (phase active)
 * Le classement est global et respecte la hiérarchie des brackets pour les phases multi-brackets.
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

    // Global ranking must show ALL registered tournament players,
    // including those without games/results in the active phase.
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

    // From Phase 4 onward, enforce bracket hierarchy in global ranking.
    // - Phase 4: master > amateur > common > other
    // - Phase 5: challenger > master > amateur > common > other
    const hierarchyPhase = [...startedPhases]
      .sort((a, b) => b.order_index - a.order_index)
      .find((p) => p.order_index >= 4);

    let globalLeaderboard: LeaderboardEntry[];

    if (hierarchyPhase) {
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

        const rankA = a.rank > 0 ? a.rank : Number.MAX_SAFE_INTEGER;
        const rankB = b.rank > 0 ? b.rank : Number.MAX_SAFE_INTEGER;

        if (rankA !== rankB) {
          return rankA - rankB;
        }

        return a.player_name.localeCompare(b.player_name);
      });

      // Tie-aware rank assignment, but never tie across different hierarchy buckets.
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
 * Créer un nouveau tournoi
 */
export async function createTournament(data: {
  name: string;
  year: string;
  status: "upcoming" | "ongoing" | "completed";
}): Promise<Tournament> {
  try {
    // Always create tournaments with the full standard phase/bracket structure.
    const createdTournament = await createStandardTournament(
      data.name,
      data.year,
    );

    // createStandardTournament defaults to "upcoming"; keep frontend-selected status if different.
    if (data.status !== "upcoming") {
      const updated = await db
        .update(tournament)
        .set({
          status: data.status,
          updatedAt: new Date(),
        })
        .where(eq(tournament.id, createdTournament.id))
        .returning();

      return updated[0];
    }

    return createdTournament;
  } catch (error) {
    console.error("Error creating tournament:", error);
    throw new Error("Impossible de créer le tournoi");
  }
}

/**
 * Mettre à jour un tournoi
 */
export async function updateTournament(
  id: string,
  data: Partial<InsertTournament>,
): Promise<Tournament> {
  try {
    const result = await db
      .update(tournament)
      .set(data)
      .where(eq(tournament.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error("Tournoi non trouvé");
    }

    return result[0];
  } catch (error) {
    console.error("Error updating tournament:", error);
    throw new Error("Impossible de mettre à jour le tournoi");
  }
}

/**
 * Supprimer un tournoi
 */
export async function deleteTournament(id: string): Promise<void> {
  try {
    await db.delete(tournament).where(eq(tournament.id, id));
  } catch (error) {
    console.error("Error deleting tournament:", error);
    throw new Error("Impossible de supprimer le tournoi");
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
 * Inscrire un joueur à un tournoi
 */
export async function registerPlayerToTournament(
  tournamentId: string,
  playerId: string,
): Promise<void> {
  try {
    await db.insert(tournamentRegistration).values({
      tournament_id: tournamentId,
      player_id: playerId,
      status: "registered",
    });
  } catch (error) {
    console.error("Error registering player:", error);
    throw new Error("Impossible d'inscrire le joueur");
  }
}

/**
 * Désinscrire un joueur d'un tournoi
 */
export async function unregisterPlayerFromTournament(
  tournamentId: string,
  playerId: string,
): Promise<void> {
  try {
    await db
      .delete(tournamentRegistration)
      .where(
        sql`${tournamentRegistration.tournament_id} = ${tournamentId} AND ${tournamentRegistration.player_id} = ${playerId}`,
      );
  } catch (error) {
    console.error("Error unregistering player:", error);
    throw new Error("Impossible de désinscrire le joueur");
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
 * Créer un joueur et l'inscrire au tournoi
 */
export async function createPlayerAndRegister(
  tournamentId: string,
  playerData: {
    name: string;
    riot_id: string;
    tier: TierType;
    division?: DivisionType | null;
    league_points: number;
    discord_tag?: string;
    team_name?: string;
  },
): Promise<{ success: boolean; error?: string; playerId?: string }> {
  try {
    // Validate player data
    const validation = validatePlayerData({
      name: playerData.name,
      riot_id: playerData.riot_id,
      tier: playerData.tier,
      division: playerData.division || null,
      league_points: playerData.league_points,
      discord_tag: playerData.discord_tag,
    });

    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      return { success: false, error: firstError };
    }

    // Check if player already exists
    const existingPlayer = await getPlayerByRiotId(playerData.riot_id);
    if (existingPlayer) {
      // Check if already registered to this tournament
      const existingRegistration =
        await db.query.tournamentRegistration.findFirst({
          where: sql`${tournamentRegistration.tournament_id} = ${tournamentId} AND ${tournamentRegistration.player_id} = ${existingPlayer.id}`,
        });

      if (existingRegistration) {
        return {
          success: false,
          error: "Ce joueur est déjà inscrit à ce tournoi",
        };
      }

      // Register existing player
      await registerPlayerToTournament(tournamentId, existingPlayer.id);
      return { success: true, playerId: existingPlayer.id };
    }

    // Handle team creation/lookup if team_name is provided
    let teamId: string | undefined;
    if (playerData.team_name) {
      const existingTeam = await db.query.team.findFirst({
        where: eq(team.name, playerData.team_name),
      });

      if (existingTeam) {
        teamId = existingTeam.id;
      } else {
        const [newTeam] = await db
          .insert(team)
          .values({
            name: playerData.team_name,
          })
          .returning();
        teamId = newTeam.id;
      }
    }

    // Create new player
    const newPlayer = await createPlayer({
      name: playerData.name,
      riot_id: playerData.riot_id,
      tier: playerData.tier,
      division: playerData.division || null,
      league_points: playerData.league_points,
      discord_tag: playerData.discord_tag,
      team_id: teamId,
    });

    // Register to tournament
    await registerPlayerToTournament(tournamentId, newPlayer.id);

    return { success: true, playerId: newPlayer.id };
  } catch (error) {
    console.error("Error creating and registering player:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de l'inscription du joueur",
    };
  }
}

/**
 * Importer plusieurs joueurs depuis un CSV et les inscrire au tournoi
 */
export async function importPlayersAndRegisterToTournament(
  tournamentId: string,
  csvData: PlayerCSVImport[],
): Promise<{
  success: boolean;
  created: number;
  updated: number;
  registered: number;
  errors: Array<{ player: string; error: string }>;
}> {
  const result = {
    success: true,
    created: 0,
    updated: 0,
    registered: 0,
    errors: [] as Array<{ player: string; error: string }>,
  };

  try {
    for (const playerData of csvData) {
      try {
        // Check if player exists
        const existingPlayer = await getPlayerByRiotId(playerData.riot_id);

        if (existingPlayer) {
          // Player exists, just register to tournament
          const existingRegistration =
            await db.query.tournamentRegistration.findFirst({
              where: sql`${tournamentRegistration.tournament_id} = ${tournamentId} AND ${tournamentRegistration.player_id} = ${existingPlayer.id}`,
            });

          if (!existingRegistration) {
            await registerPlayerToTournament(tournamentId, existingPlayer.id);
            result.registered++;
          }
          result.updated++;
        } else {
          // Create and register new player
          const createResult = await createPlayerAndRegister(
            tournamentId,
            playerData,
          );

          if (createResult.success) {
            result.created++;
            result.registered++;
          } else {
            result.errors.push({
              player: playerData.riot_id,
              error: createResult.error || "Erreur inconnue",
            });
          }
        }
      } catch (error) {
        result.errors.push({
          player: playerData.riot_id,
          error: error instanceof Error ? error.message : "Erreur inconnue",
        });
      }
    }

    return result;
  } catch (error) {
    console.error("Error importing players:", error);
    return {
      success: false,
      created: 0,
      updated: 0,
      registered: 0,
      errors: [{ player: "all", error: "Erreur lors de l'import" }],
    };
  }
}

/**
 * Mettre à jour le statut d'une inscription
 */
export async function updateRegistrationStatus(
  tournamentId: string,
  playerId: string,
  status: RegistrationStatusType,
): Promise<void> {
  try {
    await db
      .update(tournamentRegistration)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(
        sql`${tournamentRegistration.tournament_id} = ${tournamentId} AND ${tournamentRegistration.player_id} = ${playerId}`,
      );
  } catch (error) {
    console.error("Error updating registration status:", error);
    throw new Error("Impossible de mettre à jour le statut");
  }
}

/**
 * Confirmer tous les joueurs d'un tournoi
 */
export async function confirmAllPlayersInTournament(
  tournamentId: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const result = await db
      .update(tournamentRegistration)
      .set({
        status: "confirmed",
        updatedAt: new Date(),
      })
      .where(eq(tournamentRegistration.tournament_id, tournamentId))
      .returning();

    return { success: true, count: result.length };
  } catch (error) {
    console.error("Error confirming all players:", error);
    return {
      success: false,
      count: 0,
      error: "Impossible de confirmer tous les joueurs",
    };
  }
}

/**
 * Dévalider tous les joueurs d'un tournoi (passer à "registered")
 */
export async function unconfirmAllPlayersInTournament(
  tournamentId: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const result = await db
      .update(tournamentRegistration)
      .set({
        status: "registered",
        updatedAt: new Date(),
      })
      .where(eq(tournamentRegistration.tournament_id, tournamentId))
      .returning();

    return { success: true, count: result.length };
  } catch (error) {
    console.error("Error unconfirming all players:", error);
    return {
      success: false,
      count: 0,
      error: "Impossible de dévalider tous les joueurs",
    };
  }
}

/**
 * Désinscrire tous les joueurs d'un tournoi
 */
export async function unregisterAllPlayersFromTournament(
  tournamentId: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const result = await db
      .delete(tournamentRegistration)
      .where(eq(tournamentRegistration.tournament_id, tournamentId))
      .returning();

    return { success: true, count: result.length };
  } catch (error) {
    console.error("Error unregistering all players:", error);
    return {
      success: false,
      count: 0,
      error: "Impossible de désinscrire tous les joueurs",
    };
  }
}

/**
 * Mettre à jour les informations d'un joueur
 */
export async function updatePlayerInfo(
  playerId: string,
  playerData: {
    name: string;
    discord_tag?: string;
    tier: TierType;
    division?: DivisionType | null;
    league_points: number;
    team_name?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate player data
    const validation = validatePlayerData({
      name: playerData.name,
      riot_id: "dummy#0000", // Riot ID is not updated
      tier: playerData.tier,
      division: playerData.division || null,
      league_points: playerData.league_points,
      discord_tag: playerData.discord_tag,
    });

    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      return { success: false, error: firstError };
    }

    // Handle team creation/lookup if team_name is provided
    let teamId: string | null = null;
    if (playerData.team_name) {
      const existingTeam = await db.query.team.findFirst({
        where: eq(team.name, playerData.team_name),
      });

      if (existingTeam) {
        teamId = existingTeam.id;
      } else {
        const [newTeam] = await db
          .insert(team)
          .values({
            name: playerData.team_name,
          })
          .returning();
        teamId = newTeam.id;
      }
    }

    // Update player
    await updatePlayer(playerId, {
      name: playerData.name,
      discord_tag: playerData.discord_tag || undefined,
      tier: playerData.tier,
      division: playerData.division || null,
      league_points: playerData.league_points,
      team_id: teamId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating player:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la mise à jour du joueur",
    };
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
  totalGamesExpected: number; // Calcul adapte par bracket (Phase 4 Master top16 sur games 3+)
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

  // Phase 4 Master format:
  // - games 1-2 with full lobbies
  // - games 3+ with top16 (half the lobbies)
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

    // Enrichir les phases avec les informations calculées
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
 * Créer une phase pour un tournoi
 */
export async function createPhase(data: { tournament_id: string }): Promise<{
  success: boolean;
  error?: string;
  phaseId?: string;
  phaseName?: string;
}> {
  try {
    const standardPhaseTemplates = [
      {
        order_index: 1,
        name: "Phase 1",
        total_games: 4,
        brackets: ["common"] as const,
      },
      {
        order_index: 2,
        name: "Phase 2",
        total_games: 4,
        brackets: ["common"] as const,
      },
      {
        order_index: 3,
        name: "Phase 3",
        total_games: 4,
        brackets: ["master", "amateur"] as const,
      },
      {
        order_index: 4,
        name: "Phase 4",
        total_games: 4,
        brackets: ["master", "amateur"] as const,
      },
      {
        order_index: 5,
        name: "Phase 5 - Finales",
        total_games: 6,
        brackets: ["challenger", "master", "amateur"] as const,
      },
    ];

    const existingPhases = await db.query.phase.findMany({
      where: eq(phase.tournament_id, data.tournament_id),
      orderBy: (phase, { asc }) => [asc(phase.order_index)],
    });

    const existingOrderIndexes = new Set(
      existingPhases.map((p) => p.order_index),
    );
    const missingTemplate = standardPhaseTemplates.find(
      (template) => !existingOrderIndexes.has(template.order_index),
    );

    if (!missingTemplate) {
      return {
        success: false,
        error: "Aucune phase manquante à créer (les 5 phases existent déjà)",
      };
    }

    // Create missing standard phase and its brackets in a transaction.
    return await db.transaction(async (tx) => {
      const [newPhase] = await tx
        .insert(phase)
        .values({
          tournament_id: data.tournament_id,
          name: missingTemplate.name,
          order_index: missingTemplate.order_index,
          total_games: missingTemplate.total_games,
        })
        .returning();

      await tx.insert(bracket).values(
        missingTemplate.brackets.map((bracketName) => ({
          phase_id: newPhase.id,
          name: bracketName,
        })),
      );

      return {
        success: true,
        phaseId: newPhase.id,
        phaseName: missingTemplate.name,
      };
    });
  } catch (error) {
    console.error("Error creating phase:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la création de la phase",
    };
  }
}

/**
 * Supprimer une phase
 */
export async function deletePhase(phaseId: string): Promise<void> {
  try {
    await db.delete(phase).where(eq(phase.id, phaseId));
  } catch (error) {
    console.error("Error deleting phase:", error);
    throw new Error("Impossible de supprimer la phase");
  }
}

/**
 * Mettre à jour une phase
 */
export async function updatePhase(
  phaseId: string,
  data: {
    name?: string;
    total_games?: number;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      if (data.name.trim().length < 2) {
        return {
          success: false,
          error: "Le nom de la phase doit contenir au moins 2 caractères",
        };
      }
      updateData.name = data.name.trim();
    }

    if (data.total_games !== undefined) {
      if (data.total_games < 1 || data.total_games > 50) {
        return {
          success: false,
          error: "Le nombre de parties doit être entre 1 et 50",
        };
      }
      updateData.total_games = data.total_games;
    }

    await db.update(phase).set(updateData).where(eq(phase.id, phaseId));

    return { success: true };
  } catch (error) {
    console.error("Error updating phase:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la mise à jour de la phase",
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
 * Démarrer une phase (Phase 1 uniquement pour le moment)
 * Crée les lobbies et assigne les joueurs confirmés
 */
export async function startPhase1Action(
  phaseId: string,
  tournamentId: string,
): Promise<{ success: boolean; error?: string; lobbyCount?: number }> {
  try {
    // 1. Vérifier que c'est bien la Phase 1
    const phaseData = await db.query.phase.findFirst({
      where: eq(phase.id, phaseId),
    });

    if (!phaseData) {
      return { success: false, error: "Phase non trouvée" };
    }

    if (phaseData.order_index !== 1) {
      return {
        success: false,
        error: "Seule la Phase 1 peut être démarrée avec cette action",
      };
    }

    // 2. Récupérer les joueurs confirmés
    const confirmedPlayers = await db.query.tournamentRegistration.findMany({
      where: sql`${tournamentRegistration.tournament_id} = ${tournamentId} AND ${tournamentRegistration.status} = 'confirmed'`,
    });

    if (confirmedPlayers.length === 0) {
      return {
        success: false,
        error:
          "Aucun joueur confirmé. Veuillez confirmer les joueurs avant de démarrer la phase.",
      };
    }

    if (confirmedPlayers.length < 8) {
      return {
        success: false,
        error: `Pas assez de joueurs confirmés (minimum 8, actuellement ${confirmedPlayers.length})`,
      };
    }

    // 3. Calculer le nombre de lobbies (8 joueurs par lobby)
    const lobbyCount = Math.floor(confirmedPlayers.length / 8);
    const playerIds = confirmedPlayers.map((p) => p.player_id);

    // 4. Vérifier qu'il existe un bracket, sinon en créer un
    const existingBrackets = await db.query.bracket.findMany({
      where: eq(bracket.phase_id, phaseId),
    });

    if (existingBrackets.length === 0) {
      // Créer un bracket "common" par défaut
      await db.insert(bracket).values({
        phase_id: phaseId,
        name: "common",
      });
    }

    // 5. Démarrer la phase avec seeding automatique
    await startPhase(phaseId, {
      autoSeed: true,
      playerIds: playerIds,
    });

    return { success: true, lobbyCount };
  } catch (error) {
    console.error("Error starting phase:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors du démarrage de la phase",
    };
  }
}

/**
 * Démarrer la Phase 2 à partir de la Phase 1
 * Sélectionne les 96 derniers joueurs de la Phase 1
 */
export async function startPhase2Action(
  phase1Id: string,
  phase2Id: string,
): Promise<{
  success: boolean;
  error?: string;
  stats?: {
    eliminatedCount: number;
    qualifiedCount: number;
    lobbyCount: number;
  };
}> {
  try {
    const result = await startPhase2FromPhase1(phase1Id, phase2Id);

    return {
      success: true,
      stats: {
        eliminatedCount: result.eliminatedPlayers.length,
        qualifiedCount: result.qualifiedPlayers.length,
        lobbyCount: result.games.length,
      },
    };
  } catch (error) {
    console.error("Error starting phase 2:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors du démarrage de la phase 2",
    };
  }
}

/**
 * Démarrer la Phase 3 à partir des Phases 1 et 2
 * Crée 2 brackets (Master et Amateur) avec reset des points
 */
export async function startPhase3Action(
  phase1Id: string,
  phase2Id: string,
  phase3Id: string,
): Promise<{
  success: boolean;
  error?: string;
  stats?: { masterCount: number; amateurCount: number };
}> {
  try {
    const result = await startPhase3FromPhase1And2(
      phase1Id,
      phase2Id,
      phase3Id,
      8, // 64 joueurs / 8 = 8 lobbies par bracket
    );

    return {
      success: true,
      stats: {
        masterCount: result.masterBracket.players.length,
        amateurCount: result.amateurBracket.players.length,
      },
    };
  } catch (error) {
    console.error("Error starting phase 3:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors du démarrage de la phase 3",
    };
  }
}

/**
 * Démarrer la Phase 4 à partir de la Phase 3
 * Crée 2 brackets (Master et Amateur) avec reset pour Amateur
 */
export async function startPhase4Action(
  phase3Id: string,
  phase4Id: string,
): Promise<{
  success: boolean;
  error?: string;
  stats?: { masterCount: number; amateurCount: number };
}> {
  try {
    const result = await startPhase4FromPhase3(phase3Id, phase4Id);

    return {
      success: true,
      stats: {
        masterCount: result.masterBracket.players.length,
        amateurCount: result.amateurBracket.players.length,
      },
    };
  } catch (error) {
    console.error("Error starting phase 4:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors du démarrage de la phase 4",
    };
  }
}

/**
 * Démarrer la Phase 5 (Finales) à partir de la Phase 4
 * Crée 3 brackets (Challenger, Master, Amateur)
 */
export async function startPhase5Action(
  phase4Id: string,
  phase5Id: string,
): Promise<{
  success: boolean;
  error?: string;
  stats?: {
    challengerCount: number;
    masterCount: number;
    amateurCount: number;
  };
}> {
  try {
    const result = await startPhase5FromPhase4(phase4Id, phase5Id);

    return {
      success: true,
      stats: {
        challengerCount: result.challengerBracket.players.length,
        masterCount: result.masterBracket.players.length,
        amateurCount: result.amateurBracket.players.length,
      },
    };
  } catch (error) {
    console.error("Error starting phase 5:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors du démarrage de la phase 5",
    };
  }
}

/**
 * Démarrer automatiquement la prochaine phase éligible du tournoi
 */
export async function startNextPhaseAction(tournamentId: string): Promise<{
  success: boolean;
  error?: string;
  startedPhaseId?: string;
  startedPhaseName?: string;
  startedPhaseOrder?: number;
}> {
  try {
    const phases = await getTournamentPhases(tournamentId);

    if (phases.length === 0) {
      return { success: false, error: "Aucune phase trouvée pour ce tournoi" };
    }

    const sortedPhases = [...phases].sort(
      (a, b) => a.order_index - b.order_index,
    );

    const nextPhase = sortedPhases.find((current) => {
      if (current.status !== "not_started") return false;
      if (current.order_index === 1) return true;

      const previousPhase = sortedPhases.find(
        (p) => p.order_index === current.order_index - 1,
      );

      return previousPhase?.status === "completed";
    });

    if (!nextPhase) {
      return {
        success: false,
        error:
          "Aucune phase éligible à démarrer (vérifiez que la phase précédente est terminée)",
      };
    }

    let result:
      | Awaited<ReturnType<typeof startPhase1Action>>
      | Awaited<ReturnType<typeof startPhase2Action>>
      | Awaited<ReturnType<typeof startPhase3Action>>
      | Awaited<ReturnType<typeof startPhase4Action>>
      | Awaited<ReturnType<typeof startPhase5Action>>;

    if (nextPhase.order_index === 1) {
      result = await startPhase1Action(nextPhase.id, tournamentId);
    } else if (nextPhase.order_index === 2) {
      const phase1 = sortedPhases.find((p) => p.order_index === 1);
      if (!phase1) {
        return { success: false, error: "Phase 1 introuvable" };
      }
      result = await startPhase2Action(phase1.id, nextPhase.id);
    } else if (nextPhase.order_index === 3) {
      const phase1 = sortedPhases.find((p) => p.order_index === 1);
      const phase2 = sortedPhases.find((p) => p.order_index === 2);
      if (!phase1 || !phase2) {
        return { success: false, error: "Phases 1 ou 2 introuvables" };
      }
      result = await startPhase3Action(phase1.id, phase2.id, nextPhase.id);
    } else if (nextPhase.order_index === 4) {
      const phase3 = sortedPhases.find((p) => p.order_index === 3);
      if (!phase3) {
        return { success: false, error: "Phase 3 introuvable" };
      }
      result = await startPhase4Action(phase3.id, nextPhase.id);
    } else if (nextPhase.order_index === 5) {
      const phase4 = sortedPhases.find((p) => p.order_index === 4);
      if (!phase4) {
        return { success: false, error: "Phase 4 introuvable" };
      }
      result = await startPhase5Action(phase4.id, nextPhase.id);
    } else {
      return {
        success: false,
        error: `Phase ${nextPhase.order_index} non prise en charge`,
      };
    }

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      startedPhaseId: nextPhase.id,
      startedPhaseName: nextPhase.name,
      startedPhaseOrder: nextPhase.order_index,
    };
  } catch (error) {
    console.error("Error starting next phase:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors du démarrage de la prochaine phase",
    };
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
  seed?: number; // Seeding/classement initial
  current_rank: number; // Classement actuel dans la phase
  top4_or_better_count: number; // Nombre de top 4 ou mieux
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
    // 1. Récupérer les infos de la phase
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

    // 2. Récupérer toutes les games de cette phase avec leurs résultats et joueurs assignés
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

    // 3. Récupérer le leaderboard de la phase
    const leaderboard = await getLeaderboard(phaseId);

    // 4. Construire les statistiques des participants
    const participantsMap = new Map<string, PhasePlayerStats>();

    if (leaderboard.length > 0) {
      // Il y a des résultats, utiliser le leaderboard
      for (const [index, entry] of leaderboard.entries()) {
        const stats = await calculatePlayerStatsForPhase(
          entry.player_id,
          phaseId,
        );

        // Calculer le nombre de top 4 ou mieux
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
      // Aucun résultat, récupérer tous les joueurs assignés aux lobbies
      const allLobbyPlayers = gamesData.flatMap((g) => g.lobbyPlayers || []);
      const uniquePlayers = new Map<string, any>();

      for (const lp of allLobbyPlayers) {
        if (lp.player && lp.player_id && !uniquePlayers.has(lp.player_id)) {
          uniquePlayers.set(lp.player_id, lp.player);
        }
      }

      // Créer des entrées avec des stats vides, triées par seed (ordre initial)
      const playersWithSeeds = Array.from(uniquePlayers.entries()).map(
        ([playerId, player]) => {
          // Trouver le seed du joueur dans le Game 1
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

      // Trier par seed (classement initial)
      playersWithSeeds.sort((a, b) => a.seed - b.seed);

      // Créer les participants avec des stats vides
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

    // 5. Formater les games avec leurs résultats et joueurs assignés
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

    // 6. Calculer les statistiques
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

    // Compter tous les joueurs confirmés du tournoi (pas seulement ceux assignés)
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

/**
 * Soumettre les résultats d'une partie
 */
export async function submitGameResultsAction(
  gameId: string,
  gameResults: GameResult[],
): Promise<{ success: boolean; error?: string }> {
  try {
    await submitGameResults(gameId, gameResults);
    return { success: true };
  } catch (error) {
    console.error("Error submitting game results:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la soumission des résultats",
    };
  }
}
