"use server";

import { db } from "@/lib/db";
import {
  tournament,
  tournamentRegistration,
  phase,
  team,
  game,
  bracket,
} from "@/models/schema";
import { eq, desc, sql } from "drizzle-orm";
import { headers } from "next/headers";
import type {
  Tournament,
  InsertTournament,
  TierType,
  DivisionType,
  RegistrationStatusType,
  GameResult,
} from "@/types/tournament";
import {
  createPlayer,
  getPlayerByRiotId,
  updatePlayer,
} from "@/lib/services/player-service";
import type { PlayerCSVImport } from "@/types/tournament";
import { validatePlayerData } from "@/utils/validation";
import {
  createStandardTournament,
  startPhase,
  startPhase2FromPhase1,
  startPhase3FromPhase1And2,
  startPhase4FromPhase3,
  startPhase5FromPhase4,
} from "@/lib/services/tournament-service";
import {
  submitGameResults,
  forfeitPlayerFromTournament,
} from "@/lib/services/game-service";
import { auth } from "@/lib/auth";
import { getTournamentPhases } from "./read";

const SIMULATION_TIERS: TierType[] = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];

const SIMULATION_DIVISIONS: Array<"I" | "II" | "III" | "IV"> = [
  "I",
  "II",
  "III",
  "IV",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildRandomGameResults(playerIds: string[]): GameResult[] {
  const placements = Array.from(
    { length: playerIds.length },
    (_, i) => i + 1,
  ).sort(() => Math.random() - 0.5);

  return playerIds.map((playerId, idx) => ({
    player_id: playerId,
    placement: placements[idx],
  }));
}

async function requireAuthenticatedUser(): Promise<void> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Authentification requise");
  }
}

async function requireTournamentNotStarted(
  tournamentId: string,
): Promise<void> {
  const phases = await getTournamentPhases(tournamentId);
  const hasStartedPhase = phases.some((p) => p.totalGamesCreated > 0);

  if (hasStartedPhase) {
    throw new Error(
      "Le tournoi a deja demarre. Les inscriptions et la structure ne peuvent plus etre modifiees.",
    );
  }
}

async function validatePhaseStartEligibility(
  targetPhaseId: string,
  options?: {
    expectedPreviousPhaseId?: string;
  },
): Promise<
  { valid: true; tournamentId: string } | { valid: false; error: string }
> {
  const targetPhaseData = await db.query.phase.findFirst({
    where: eq(phase.id, targetPhaseId),
  });

  if (!targetPhaseData?.tournament_id) {
    return { valid: false, error: "Phase introuvable" };
  }

  const phases = await getTournamentPhases(targetPhaseData.tournament_id);
  const targetPhase = phases.find((p) => p.id === targetPhaseId);

  if (!targetPhase) {
    return { valid: false, error: "Phase introuvable" };
  }

  if (targetPhase.status !== "not_started") {
    return {
      valid: false,
      error: "Cette phase est déjà démarrée ou terminée",
    };
  }

  if (targetPhase.order_index > 1) {
    const previousPhase = phases.find(
      (p) => p.order_index === targetPhase.order_index - 1,
    );

    if (!previousPhase) {
      return {
        valid: false,
        error: "Phase précédente introuvable",
      };
    }

    if (
      options?.expectedPreviousPhaseId &&
      previousPhase.id !== options.expectedPreviousPhaseId
    ) {
      return {
        valid: false,
        error: "La phase précédente fournie ne correspond pas au tournoi",
      };
    }

    if (previousPhase.status !== "completed") {
      return {
        valid: false,
        error: "La phase précédente n'est pas terminée",
      };
    }
  }

  return { valid: true, tournamentId: targetPhaseData.tournament_id };
}

async function syncTournamentStatusFromPhases(
  tournamentId: string,
): Promise<void> {
  const phases = await getTournamentPhases(tournamentId);
  const hasStartedPhase = phases.some((p) => p.totalGamesCreated > 0);
  const phase5 = phases.find((p) => p.order_index === 5);

  const isCompleted =
    !!phase5 &&
    phase5.totalGamesExpected > 0 &&
    phase5.gamesWithResults >= phase5.totalGamesExpected;

  let expectedStatus: "upcoming" | "ongoing" | "completed" = "upcoming";

  if (isCompleted) {
    expectedStatus = "completed";
  } else if (hasStartedPhase) {
    expectedStatus = "ongoing";
  }

  const currentTournament = await db.query.tournament.findFirst({
    where: eq(tournament.id, tournamentId),
  });

  if (!currentTournament || currentTournament.status === expectedStatus) {
    return;
  }

  await db
    .update(tournament)
    .set({
      status: expectedStatus,
      updatedAt: new Date(),
    })
    .where(eq(tournament.id, tournamentId));
}

async function syncTournamentStatusFromPhaseId(phaseId: string): Promise<void> {
  const phaseData = await db.query.phase.findFirst({
    where: eq(phase.id, phaseId),
  });

  if (!phaseData?.tournament_id) {
    return;
  }

  await syncTournamentStatusFromPhases(phaseData.tournament_id);
}

/**
 * Créer un nouveau tournoi
 */
export async function createTournament(data: {
  name: string;
  year: string;
  status: "upcoming" | "ongoing" | "completed";
  isSimulation?: boolean;
  structureImageUrl: string;
  rulesUrl?: string | null;
}): Promise<Tournament> {
  try {
    await requireAuthenticatedUser();

    const structureImageUrl = data.structureImageUrl?.trim();
    if (!structureImageUrl) {
      throw new Error("L'image de structure est obligatoire");
    }

    const normalizedRulesUrl = data.rulesUrl?.trim() || null;

    const createdTournament = await createStandardTournament(
      data.name,
      data.year,
    );

    if (
      data.status !== "upcoming" ||
      data.isSimulation ||
      structureImageUrl ||
      normalizedRulesUrl
    ) {
      const updateData: {
        status?: "upcoming" | "ongoing" | "completed";
        is_simulation?: boolean;
        structure_image_url?: string;
        rules_url?: string | null;
        updatedAt: Date;
      } = {
        structure_image_url: structureImageUrl,
        rules_url: normalizedRulesUrl,
        updatedAt: new Date(),
      };

      if (data.status !== "upcoming") {
        updateData.status = data.status;
      }

      if (data.isSimulation) {
        updateData.is_simulation = true;
      }

      const updated = await db
        .update(tournament)
        .set(updateData)
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
    await requireAuthenticatedUser();

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
    await requireAuthenticatedUser();

    await db.delete(tournament).where(eq(tournament.id, id));
  } catch (error) {
    console.error("Error deleting tournament:", error);
    throw new Error("Impossible de supprimer le tournoi");
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
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

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
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

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
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

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

    const existingPlayer = await getPlayerByRiotId(playerData.riot_id);
    if (existingPlayer) {
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

      await registerPlayerToTournament(tournamentId, existingPlayer.id);
      return { success: true, playerId: existingPlayer.id };
    }

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

    const newPlayer = await createPlayer({
      name: playerData.name,
      riot_id: playerData.riot_id,
      tier: playerData.tier,
      division: playerData.division || null,
      league_points: playerData.league_points,
      discord_tag: playerData.discord_tag,
      team_id: teamId,
    });

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
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

    for (const playerData of csvData) {
      try {
        const existingPlayer = await getPlayerByRiotId(playerData.riot_id);

        if (existingPlayer) {
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
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

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
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

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
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

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
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

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
    await requireAuthenticatedUser();

    const validation = validatePlayerData({
      name: playerData.name,
      riot_id: "dummy#0000",
      tier: playerData.tier,
      division: playerData.division || null,
      league_points: playerData.league_points,
      discord_tag: playerData.discord_tag,
    });

    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      return { success: false, error: firstError };
    }

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
 * Créer une phase pour un tournoi
 */
export async function createPhase(data: { tournament_id: string }): Promise<{
  success: boolean;
  error?: string;
  phaseId?: string;
  phaseName?: string;
}> {
  try {
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(data.tournament_id);

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
    await requireAuthenticatedUser();

    const phaseData = await db.query.phase.findFirst({
      where: eq(phase.id, phaseId),
    });

    if (!phaseData || !phaseData.tournament_id) {
      throw new Error("Phase introuvable");
    }

    await requireTournamentNotStarted(phaseData.tournament_id);

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
    await requireAuthenticatedUser();

    const phaseData = await db.query.phase.findFirst({
      where: eq(phase.id, phaseId),
    });

    if (!phaseData || !phaseData.tournament_id) {
      return {
        success: false,
        error: "Phase introuvable",
      };
    }

    await requireTournamentNotStarted(phaseData.tournament_id);

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
 * Démarrer une phase (Phase 1 uniquement pour le moment)
 */
export async function startPhase1Action(
  phaseId: string,
  tournamentId: string,
): Promise<{ success: boolean; error?: string; lobbyCount?: number }> {
  try {
    await requireAuthenticatedUser();

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

    if (phaseData.tournament_id !== tournamentId) {
      return {
        success: false,
        error: "La phase ne correspond pas au tournoi",
      };
    }

    const eligibility = await validatePhaseStartEligibility(phaseId);
    if (!eligibility.valid) {
      return { success: false, error: eligibility.error };
    }

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

    const lobbyCount = Math.ceil(confirmedPlayers.length / 8);
    const playerIds = confirmedPlayers.map((p) => p.player_id);

    const existingBrackets = await db.query.bracket.findMany({
      where: eq(bracket.phase_id, phaseId),
    });

    if (existingBrackets.length === 0) {
      await db.insert(bracket).values({
        phase_id: phaseId,
        name: "common",
      });
    }

    await startPhase(phaseId, {
      autoSeed: true,
      playerIds: playerIds,
    });

    await syncTournamentStatusFromPhases(tournamentId);

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
    await requireAuthenticatedUser();

    const eligibility = await validatePhaseStartEligibility(phase2Id, {
      expectedPreviousPhaseId: phase1Id,
    });
    if (!eligibility.valid) {
      return { success: false, error: eligibility.error };
    }

    const result = await startPhase2FromPhase1(phase1Id, phase2Id);

    await syncTournamentStatusFromPhaseId(phase2Id);

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
    await requireAuthenticatedUser();

    const eligibility = await validatePhaseStartEligibility(phase3Id, {
      expectedPreviousPhaseId: phase2Id,
    });
    if (!eligibility.valid) {
      return { success: false, error: eligibility.error };
    }

    const result = await startPhase3FromPhase1And2(
      phase1Id,
      phase2Id,
      phase3Id,
    );

    await syncTournamentStatusFromPhaseId(phase3Id);

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
    await requireAuthenticatedUser();

    const eligibility = await validatePhaseStartEligibility(phase4Id, {
      expectedPreviousPhaseId: phase3Id,
    });
    if (!eligibility.valid) {
      return { success: false, error: eligibility.error };
    }

    const result = await startPhase4FromPhase3(phase3Id, phase4Id);

    await syncTournamentStatusFromPhaseId(phase4Id);

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
    await requireAuthenticatedUser();

    const eligibility = await validatePhaseStartEligibility(phase5Id, {
      expectedPreviousPhaseId: phase4Id,
    });
    if (!eligibility.valid) {
      return { success: false, error: eligibility.error };
    }

    const result = await startPhase5FromPhase4(phase4Id, phase5Id);

    await syncTournamentStatusFromPhaseId(phase5Id);

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
    await requireAuthenticatedUser();

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
 * Soumettre les résultats d'une partie
 */
export async function submitGameResultsAction(
  gameId: string,
  gameResults: GameResult[],
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuthenticatedUser();

    await submitGameResults(gameId, gameResults);

    const gameData = await db.query.game.findFirst({
      where: eq(game.id, gameId),
    });

    if (gameData?.phase_id) {
      await syncTournamentStatusFromPhaseId(gameData.phase_id);
    }

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

/**
 * Déclarer le forfait d'un joueur sur un tournoi.
 */
export async function forfeitPlayerAction(
  tournamentId: string,
  playerId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuthenticatedUser();
    await forfeitPlayerFromTournament(tournamentId, playerId);
    await syncTournamentStatusFromPhases(tournamentId);
    return { success: true };
  } catch (error) {
    console.error("Error forfeiting player:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors du forfait du joueur",
    };
  }
}

/**
 * Ajouter des joueurs simulés à un tournoi (option CLI 2)
 */
export async function createSimulationPlayersAction(
  tournamentId: string,
  playerCount: number,
): Promise<{ success: boolean; created: number; error?: string }> {
  try {
    await requireAuthenticatedUser();
    await requireTournamentNotStarted(tournamentId);

    if (!Number.isInteger(playerCount) || playerCount <= 0) {
      return {
        success: false,
        created: 0,
        error: "Le nombre de joueurs doit etre un entier positif",
      };
    }

    if (playerCount % 8 !== 0) {
      return {
        success: false,
        created: 0,
        error: "Le nombre de joueurs doit etre un multiple de 8",
      };
    }

    const tournamentData = await db.query.tournament.findFirst({
      where: eq(tournament.id, tournamentId),
    });

    if (!tournamentData) {
      return { success: false, created: 0, error: "Tournoi introuvable" };
    }

    if (!tournamentData.is_simulation) {
      return {
        success: false,
        created: 0,
        error: "Cette action est reservee aux tournois en mode simulation",
      };
    }

    const idPrefix = tournamentId.slice(0, 8);
    const timestamp = Date.now();
    let created = 0;

    for (let i = 0; i < playerCount; i++) {
      const tier = SIMULATION_TIERS[randomInt(0, SIMULATION_TIERS.length - 1)];
      const division =
        tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER"
          ? null
          : SIMULATION_DIVISIONS[randomInt(0, SIMULATION_DIVISIONS.length - 1)];

      const playerIndex = i + 1;
      const uniqueSuffix = `${timestamp}-${playerIndex}-${randomInt(100, 999)}`;

      const newPlayer = await createPlayer({
        name: `Sim Player ${playerIndex}`,
        riot_id: `sim-${idPrefix}-${uniqueSuffix}#${randomInt(1000, 9999)}`,
        tier,
        division,
        league_points: randomInt(0, 100),
        discord_tag: `sim-${idPrefix}-${uniqueSuffix}`,
      });

      await db.insert(tournamentRegistration).values({
        tournament_id: tournamentId,
        player_id: newPlayer.id,
        status: "confirmed",
      });

      created++;
    }

    return { success: true, created };
  } catch (error) {
    console.error("Error creating simulation players:", error);
    return {
      success: false,
      created: 0,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la creation des joueurs simules",
    };
  }
}

/**
 * Completer automatiquement tous les jeux d'un game number spécifique (option CLI A)
 */
export async function completeGameNumberAutomaticallyAction(
  phaseId: string,
  gameNumber: number,
): Promise<{
  success: boolean;
  completed: number;
  skipped: number;
  error?: string;
}> {
  try {
    await requireAuthenticatedUser();

    const phaseData = await db.query.phase.findFirst({
      where: eq(phase.id, phaseId),
      with: {
        tournament: true,
      },
    });

    if (!phaseData?.tournament) {
      return {
        success: false,
        completed: 0,
        skipped: 0,
        error: "Phase introuvable",
      };
    }

    if (!phaseData.tournament.is_simulation) {
      return {
        success: false,
        completed: 0,
        skipped: 0,
        error: "Cette action est reservee aux tournois en mode simulation",
      };
    }

    const games = await db.query.game.findMany({
      where: sql`${game.phase_id} = ${phaseId} AND ${game.game_number} = ${gameNumber}`,
      with: {
        results: true,
        lobbyPlayers: true,
      },
    });

    let completed = 0;
    let skipped = 0;

    for (const currentGame of games) {
      if (currentGame.results.length > 0) {
        skipped++;
        continue;
      }

      const playerIds = currentGame.lobbyPlayers
        .map((lp) => lp.player_id)
        .filter((id): id is string => !!id);

      if (playerIds.length === 0) {
        skipped++;
        continue;
      }

      const results = buildRandomGameResults(playerIds);
      await submitGameResults(currentGame.id, results);
      completed++;
    }

    await syncTournamentStatusFromPhaseId(phaseId);

    return { success: true, completed, skipped };
  } catch (error) {
    console.error("Error auto-completing game number:", error);
    return {
      success: false,
      completed: 0,
      skipped: 0,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la completion automatique du game number",
    };
  }
}

/**
 * Completer automatiquement tous les jeux sans resultats d'une phase (option CLI 9)
 */
export async function completePhaseGamesAutomaticallyAction(
  phaseId: string,
): Promise<{
  success: boolean;
  completed: number;
  skipped: number;
  error?: string;
}> {
  try {
    await requireAuthenticatedUser();

    const phaseData = await db.query.phase.findFirst({
      where: eq(phase.id, phaseId),
      with: {
        tournament: true,
      },
    });

    if (!phaseData?.tournament) {
      return {
        success: false,
        completed: 0,
        skipped: 0,
        error: "Phase introuvable",
      };
    }

    if (!phaseData.tournament.is_simulation) {
      return {
        success: false,
        completed: 0,
        skipped: 0,
        error: "Cette action est reservee aux tournois en mode simulation",
      };
    }

    const games = await db.query.game.findMany({
      where: eq(game.phase_id, phaseId),
      with: {
        results: true,
        lobbyPlayers: true,
      },
    });

    let completed = 0;
    let skipped = 0;

    for (const currentGame of games) {
      if (currentGame.results.length > 0) {
        skipped++;
        continue;
      }

      const playerIds = currentGame.lobbyPlayers
        .map((lp) => lp.player_id)
        .filter((id): id is string => !!id);

      if (playerIds.length === 0) {
        skipped++;
        continue;
      }

      const results = buildRandomGameResults(playerIds);
      await submitGameResults(currentGame.id, results);
      completed++;
    }

    await syncTournamentStatusFromPhaseId(phaseId);

    return { success: true, completed, skipped };
  } catch (error) {
    console.error("Error auto-completing phase games:", error);
    return {
      success: false,
      completed: 0,
      skipped: 0,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la completion automatique des parties",
    };
  }
}
