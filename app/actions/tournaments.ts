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
  calculatePlayerStatsForPhase,
} from "@/lib/services/scoring-service";
import { startPhase } from "@/lib/services/tournament-service";
import { submitGameResults } from "@/lib/services/game-service";

interface TournamentWithCount extends Tournament {
  registrationsCount: number;
  currentPhase: string | null;
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
 * Créer un nouveau tournoi
 */
export async function createTournament(data: {
  name: string;
  year: string;
  status: "upcoming" | "ongoing" | "completed";
}): Promise<Tournament> {
  try {
    const newTournament: InsertTournament = {
      name: data.name,
      year: data.year,
      status: data.status,
    };

    const result = await db
      .insert(tournament)
      .values(newTournament)
      .returning();
    return result[0];
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
  totalGamesExpected: number; // Nombre de lobbies du Game 1 × total_games
  status: "not_started" | "in_progress" | "completed";
  canEnterResults: boolean;
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

      // Calculer le nombre de lobbies du Game 1 (premier game)
      const game1LobbyCount = phase.brackets.reduce(
        (sum, bracket) =>
          sum + bracket.games.filter((game) => game.game_number === 1).length,
        0,
      );
      // Total attendu = nombre de lobbies × nombre de games par phase
      const totalGamesExpected = game1LobbyCount * phase.total_games;

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
        canEnterResults: totalGamesCreated > 0,
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
export async function createPhase(data: {
  tournament_id: string;
  name: string;
  total_games: number;
}): Promise<{ success: boolean; error?: string; phaseId?: string }> {
  try {
    // Validate input
    if (!data.name || data.name.trim().length < 2) {
      return {
        success: false,
        error: "Le nom de la phase doit contenir au moins 2 caractères",
      };
    }

    if (data.total_games < 1 || data.total_games > 50) {
      return {
        success: false,
        error: "Le nombre de parties doit être entre 1 et 50",
      };
    }

    // Get current max order_index for this tournament
    const existingPhases = await db.query.phase.findMany({
      where: eq(phase.tournament_id, data.tournament_id),
      orderBy: (phase, { desc }) => [desc(phase.order_index)],
      limit: 1,
    });

    const nextOrderIndex =
      existingPhases.length > 0 ? existingPhases[0].order_index + 1 : 1;

    // Create phase and bracket in a transaction
    return await db.transaction(async (tx) => {
      // Create phase
      const [newPhase] = await tx
        .insert(phase)
        .values({
          tournament_id: data.tournament_id,
          name: data.name.trim(),
          order_index: nextOrderIndex,
          total_games: data.total_games,
        })
        .returning();

      // Create default "common" bracket for the phase
      await tx.insert(bracket).values({
        phase_id: newPhase.id,
        name: "common",
      });

      return { success: true, phaseId: newPhase.id };
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
    // Calculer le nombre de lobbies du Game 1
    const game1LobbyCount = gamesData.filter((g) => g.game_number === 1).length;
    // Total attendu = nombre de lobbies × nombre de games par phase
    const totalGamesExpected = game1LobbyCount * phaseData.total_games;

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
