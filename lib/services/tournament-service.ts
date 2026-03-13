/**
 * Service for managing tournament lifecycle
 * Handles tournament creation, phase management, and workflow orchestration
 *
 * Workflow du tournoi :
 * - Phase 1 : 128 joueurs (1 bracket common)
 * - Phase 2 : 96 joueurs (96 derniers de P1) (1 bracket common)
 * - Phase 3 : 128 joueurs (2 brackets, RESET points)
 *   - Master: 64 joueurs (Top 32 P1 + Top 32 P2)
 *   - Amateur: 64 joueurs (64 derniers P2)
 * - Phase 4 : 96 joueurs (2 brackets)
 *   - Master: 32 joueurs (Top 32 P3 Master) games 1-2, puis 16 joueurs (Top 16 après games 1-2) games 3-4
 *   - Amateur: 64 joueurs (RESET points) (Top 32 P3 Amateur + 32 derniers P3 Master)
 * - Phase 5 : 24 joueurs (3 brackets)
 *   - Challenger: 8 joueurs (Top 8 P4 Master)
 *   - Master: 8 joueurs (Ranks 9-16 P4 Master)
 *   - Amateur: 8 joueurs (Top 8 P4 Amateur)
 */

import { db } from "@/lib/db";
import { tournament, phase, bracket, game } from "@/models/schema";
import { eq, and } from "drizzle-orm";
import type { BracketType } from "@/types/tournament";
import {
  seedAndCreateFirstGame,
  seedAndCreateFirstGameFromLeaderboard,
  seedPlayersForPhase,
  seedPlayersBasedOnLeaderboard,
  assignPlayersToLobbies,
} from "./seeding-service";
import { getLeaderboard, getCumulativeLeaderboard } from "./scoring-service";

/**
 * Crée un tournoi standard avec la structure de phases correcte :
 * - Phase 1: 128 joueurs, 1 bracket (common)
 * - Phase 2: 96 joueurs, 1 bracket (common)
 * - Phase 3: 128 joueurs, 2 brackets (master 64, amateur 64) - RESET points
 * - Phase 4: 96 joueurs, 2 brackets (master 32, amateur 64) - Amateur RESET
 * - Phase 5: 24 joueurs, 3 brackets (challenger 8, master 8, amateur 8)
 */
export async function createStandardTournament(name: string, year: string) {
  return await createTournament({
    name,
    year,
    phases: [
      {
        name: "Phase 1",
        order_index: 1,
        total_games: 4,
        brackets: ["common"],
      },
      {
        name: "Phase 2",
        order_index: 2,
        total_games: 4,
        brackets: ["common"],
      },
      {
        name: "Phase 3",
        order_index: 3,
        total_games: 4,
        brackets: ["master", "amateur"],
      },
      {
        name: "Phase 4",
        order_index: 4,
        total_games: 4,
        brackets: ["master", "amateur"],
      },
      {
        name: "Phase 5 - Finales",
        order_index: 5,
        total_games: 6,
        brackets: ["challenger", "master", "amateur"],
      },
    ],
  });
}

/**
 * Create a new tournament with phases and brackets
 */
export async function createTournament(data: {
  name: string;
  year: string;
  phases: {
    name: string;
    order_index: number;
    total_games: number;
    brackets: BracketType[];
  }[];
}) {
  return await db.transaction(async (tx) => {
    // Create tournament
    const [newTournament] = await tx
      .insert(tournament)
      .values({
        name: data.name,
        year: data.year,
        status: "upcoming",
      })
      .returning();

    // Create phases and brackets
    for (const phaseData of data.phases) {
      const [newPhase] = await tx
        .insert(phase)
        .values({
          tournament_id: newTournament.id,
          name: phaseData.name,
          order_index: phaseData.order_index,
          total_games: phaseData.total_games,
        })
        .returning();

      // Create brackets for this phase
      for (const bracketType of phaseData.brackets) {
        await tx.insert(bracket).values({
          phase_id: newPhase.id,
          name: bracketType,
        });
      }
    }

    return newTournament;
  });
}

/**
 * Start a phase (change status to ongoing and trigger seeding if first phase)
 */
export async function startPhase(
  phaseId: string,
  options?: {
    autoSeed?: boolean;
    playerIds?: string[];
  },
) {
  // Update phase status (not directly available, but we can update tournament status)
  // For now, we'll just trigger seeding if requested

  if (options?.autoSeed) {
    // Get first bracket for this phase
    const brackets = await db.query.bracket.findMany({
      where: eq(bracket.phase_id, phaseId),
    });

    if (brackets.length === 0) {
      throw new Error("No brackets found for this phase");
    }

    const firstBracket = brackets[0];

    // Seed players and create first game (matrix generated automatically)
    const result = await seedAndCreateFirstGame(
      phaseId,
      firstBracket.id,
      options.playerIds,
    );

    return result;
  }

  return { phaseId };
}

/**
 * Get tournament overview with phases, brackets, and game counts
 */
export async function getTournamentOverview(tournamentId: string) {
  const tournamentData = await db.query.tournament.findFirst({
    where: eq(tournament.id, tournamentId),
    with: {
      phases: {
        with: {
          brackets: {
            with: {
              games: true,
            },
          },
        },
      },
    },
  });

  return tournamentData;
}

/**
 * Advance players to next phase based on cutoff rules
 * E.g., Top 32 to Master bracket, 33-64 to Amateur bracket
 */
export async function advanceToNextPhase(
  currentPhaseId: string,
  nextPhaseId: string,
  cutoffRules: {
    masterBracket: { topN: number };
    amateurBracket: { range: [number, number] };
  },
) {
  // Get leaderboard for current phase
  const leaderboard = await getLeaderboard(currentPhaseId);

  // Split players according to cutoff rules
  const masterPlayers = leaderboard.slice(0, cutoffRules.masterBracket.topN);
  const amateurPlayers = leaderboard.slice(
    cutoffRules.amateurBracket.range[0] - 1,
    cutoffRules.amateurBracket.range[1],
  );

  return {
    masterPlayers: masterPlayers.map((p) => p.player_id),
    amateurPlayers: amateurPlayers.map((p) => p.player_id),
  };
}

/**
 * PHASE 1 → PHASE 2
 * Élimine les 32 meilleurs joueurs de Phase 1
 * Les 96 derniers continuent en Phase 2
 */
export async function startPhase2FromPhase1(
  phase1Id: string,
  phase2Id: string,
) {
  // Obtenir le classement de Phase 1
  const phase1Leaderboard = await getLeaderboard(phase1Id);

  if (phase1Leaderboard.length < 128) {
    throw new Error(
      `Phase 1 should have 128 players, found ${phase1Leaderboard.length}`,
    );
  }

  // Prendre les 96 derniers (éliminer les 32 premiers)
  const phase2Leaderboard = phase1Leaderboard.slice(32); // Skip les 32 premiers

  // Obtenir le bracket de Phase 2
  const brackets = await db.query.bracket.findMany({
    where: eq(bracket.phase_id, phase2Id),
  });

  if (brackets.length === 0) {
    throw new Error("Phase 2 must have a bracket");
  }

  // Seed et créer les games basé sur les résultats de Phase 1
  const result = await seedAndCreateFirstGameFromLeaderboard(
    phase2Id,
    brackets[0].id,
    phase2Leaderboard,
  );

  return {
    eliminatedPlayers: phase1Leaderboard.slice(0, 32),
    qualifiedPlayers: phase1Leaderboard.slice(32),
    games: result.games,
    seededPlayers: result.seededPlayers,
  };
}

/**
 * PHASE 2 → PHASE 3
 * Phase 3 a 2 brackets avec RESET des points :
 * - Master: Top 32 P1 + Top 32 P2 = 64 joueurs
 * - Amateur: 64 derniers de P2 = 64 joueurs
 */
export async function startPhase3FromPhase1And2(
  phase1Id: string,
  phase2Id: string,
  phase3Id: string,
  lobbyCount: number = 8, // 64 joueurs / 8 = 8 lobbies par bracket
) {
  // Get classements
  const phase1Leaderboard = await getLeaderboard(phase1Id);
  const phase2Leaderboard = await getLeaderboard(phase2Id);

  // Master bracket: Top 32 P1 + Top 32 P2
  const top32Phase1 = phase1Leaderboard.slice(0, 32).map((p) => p.player_id);
  const top32Phase2 = phase2Leaderboard.slice(0, 32).map((p) => p.player_id);
  const masterPlayerIds = [...top32Phase1, ...top32Phase2]; // 64 joueurs

  // Amateur bracket: 64 derniers de P2
  const amateurPlayerIds = phase2Leaderboard
    .slice(32, 96)
    .map((p) => p.player_id); // 64 joueurs

  // Obtenir les brackets de Phase 3
  const brackets = await db.query.bracket.findMany({
    where: eq(bracket.phase_id, phase3Id),
  });

  const masterBracket = brackets.find((b) => b.name === "master");
  const amateurBracket = brackets.find((b) => b.name === "amateur");

  if (!masterBracket || !amateurBracket) {
    throw new Error('Phase 3 must have both "master" and "amateur" brackets');
  }

  // Seed Master (basé sur le tier/LP initial, pas sur les points P1/P2 car RESET)
  const masterSeededPlayers = await seedPlayersForPhase(
    phase3Id,
    masterPlayerIds,
  );
  const masterGames = await assignPlayersToLobbies(
    phase3Id,
    masterBracket.id,
    1,
    masterSeededPlayers,
  );

  // Seed Amateur
  const amateurSeededPlayers = await seedPlayersForPhase(
    phase3Id,
    amateurPlayerIds,
  );
  const amateurGames = await assignPlayersToLobbies(
    phase3Id,
    amateurBracket.id,
    1,
    amateurSeededPlayers,
  );

  return {
    masterBracket: {
      bracket: masterBracket,
      players: masterSeededPlayers,
      games: masterGames.map((g) => g.game),
      source: "Top 32 P1 + Top 32 P2",
    },
    amateurBracket: {
      bracket: amateurBracket,
      players: amateurSeededPlayers,
      games: amateurGames.map((g) => g.game),
      source: "64 derniers P2",
    },
  };
}

/**
 * PHASE 3 → PHASE 4
 * Phase 4 a 2 brackets :
 * - Master: Top 32 de P3 Master = 32 joueurs
 * - Amateur: Top 32 P3 Amateur + 32 derniers P3 Master = 64 joueurs (RESET points)
 */
export async function startPhase4FromPhase3(
  phase3Id: string,
  phase4Id: string,
) {
  // Obtenir les brackets de Phase 3
  const phase3Brackets = await db.query.bracket.findMany({
    where: eq(bracket.phase_id, phase3Id),
  });

  const phase3Master = phase3Brackets.find((b) => b.name === "master");
  const phase3Amateur = phase3Brackets.find((b) => b.name === "amateur");

  if (!phase3Master || !phase3Amateur) {
    throw new Error("Phase 3 must have both master and amateur brackets");
  }

  // Classements de Phase 3
  const masterLeaderboard = await getLeaderboard(phase3Id, phase3Master.id);
  const amateurLeaderboard = await getLeaderboard(phase3Id, phase3Amateur.id);

  // Phase 4 Master: Top 32 de P3 Master
  const phase4MasterPlayerIds = masterLeaderboard
    .slice(0, 32)
    .map((p) => p.player_id);

  // Phase 4 Amateur: Top 32 P3 Amateur + 32 derniers P3 Master (RESET)
  const top32Amateur = amateurLeaderboard.slice(0, 32).map((p) => p.player_id);
  const bottom32Master = masterLeaderboard
    .slice(32, 64)
    .map((p) => p.player_id);
  const phase4AmateurPlayerIds = [...top32Amateur, ...bottom32Master]; // 64 joueurs

  // Obtenir les brackets de Phase 4
  const phase4Brackets = await db.query.bracket.findMany({
    where: eq(bracket.phase_id, phase4Id),
  });

  const phase4Master = phase4Brackets.find((b) => b.name === "master");
  const phase4Amateur = phase4Brackets.find((b) => b.name === "amateur");

  if (!phase4Master || !phase4Amateur) {
    throw new Error("Phase 4 must have both master and amateur brackets");
  }

  // Seed et créer game 1 pour Master (32 joueurs / 8 = 4 lobbies)
  // PAS DE RESET : on utilise le classement de Phase 3 Master pour le seeding des lobbies
  // Game 2 sera créée automatiquement quand toutes les lobbies de la game 1 seront terminées.
  // Games 3-4 seront créées plus tard avec seulement le top 16 via continuePhase4MasterBracket().
  const top32MasterLeaderboard = masterLeaderboard.slice(0, 32);
  const masterSeededPlayers = await seedPlayersBasedOnLeaderboard(
    top32MasterLeaderboard,
  );

  // Créer seulement la game 1
  const masterGames = await assignPlayersToLobbies(
    phase4Id,
    phase4Master.id,
    1,
    masterSeededPlayers,
  );

  // Seed et créer games pour Amateur (64 joueurs / 8 = 8 lobbies)
  // RESET : on utilise le rank Riot initial pour le seeding des lobbies
  const amateurSeededPlayers = await seedPlayersForPhase(
    phase4Id,
    phase4AmateurPlayerIds,
  );
  const amateurGames = await assignPlayersToLobbies(
    phase4Id,
    phase4Amateur.id,
    1,
    amateurSeededPlayers,
  );

  return {
    masterBracket: {
      bracket: phase4Master,
      players: masterSeededPlayers,
      games: masterGames.map((g) => g.game),
      source: "Top 32 P3 Master",
    },
    amateurBracket: {
      bracket: phase4Amateur,
      players: amateurSeededPlayers,
      games: amateurGames.map((g) => g.game),
      source: "Top 32 P3 Amateur + 32 derniers P3 Master (RESET)",
    },
  };
}

/**
 * PHASE 4 MASTER - CONTINUATION
 * Cr\u00e9e les games 3 et 4 du bracket Master avec seulement le top 16 apr\u00e8s les games 1-2
 * \u00c0 appeler apr\u00e8s que les games 1 et 2 du bracket Master soient termin\u00e9es
 */
export async function continuePhase4MasterBracket(phase4Id: string) {
  // Obtenir le bracket Master de Phase 4
  const phase4Brackets = await db.query.bracket.findMany({
    where: eq(bracket.phase_id, phase4Id),
  });

  const phase4Master = phase4Brackets.find((b) => b.name === "master");

  if (!phase4Master) {
    throw new Error("Phase 4 Master bracket not found");
  }

  // V\u00e9rifier que les games 1 et 2 existent
  const existingGames = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, phase4Id),
      eq(game.bracket_id, phase4Master.id),
    ),
  });

  const game1Exists = existingGames.some((g) => g.game_number === 1);
  const game2Exists = existingGames.some((g) => g.game_number === 2);
  const game3Exists = existingGames.some((g) => g.game_number === 3);

  if (!game1Exists || !game2Exists) {
    throw new Error("Games 1 and 2 must be created first");
  }

  if (game3Exists) {
    throw new Error("Games 3-4 already exist for Phase 4 Master bracket");
  }

  // R\u00e9cup\u00e9rer le leaderboard apr\u00e8s les games 1-2
  const leaderboard = await getLeaderboard(phase4Id, phase4Master.id);

  // Garder seulement le top 16
  const top16Leaderboard = leaderboard.slice(0, 16);

  if (top16Leaderboard.length < 16) {
    throw new Error(
      `Only ${top16Leaderboard.length} players found in leaderboard, need 16`,
    );
  }

  // Seed les 16 joueurs
  const seededPlayers = await seedPlayersBasedOnLeaderboard(top16Leaderboard);

  // Cr\u00e9er games 3 et 4 (16 joueurs / 8 = 2 lobbies par game)
  const games3 = await assignPlayersToLobbies(
    phase4Id,
    phase4Master.id,
    3,
    seededPlayers,
  );

  const games4 = await assignPlayersToLobbies(
    phase4Id,
    phase4Master.id,
    4,
    seededPlayers,
  );

  return {
    bracket: phase4Master,
    players: seededPlayers,
    games: [...games3, ...games4].map((g) => g.game),
    source: "Top 16 P4 Master apr\u00e8s games 1-2",
  };
}

/**
 * PHASE 4 → PHASE 5
 * Phase 5 a 3 brackets (finales) :
 * - Challenger: Top 8 de P4 Master = 8 joueurs
 * - Master: Ranks 9-16 de P4 Master = 8 joueurs
 * - Amateur: Top 8 de P4 Amateur = 8 joueurs
 */
export async function startPhase5FromPhase4(
  phase4Id: string,
  phase5Id: string,
) {
  // Obtenir les brackets de Phase 4
  const phase4Brackets = await db.query.bracket.findMany({
    where: eq(bracket.phase_id, phase4Id),
  });

  const phase4Master = phase4Brackets.find((b) => b.name === "master");
  const phase4Amateur = phase4Brackets.find((b) => b.name === "amateur");

  if (!phase4Master || !phase4Amateur) {
    throw new Error("Phase 4 must have both master and amateur brackets");
  }

  // Classements de Phase 4
  const masterLeaderboard = await getLeaderboard(phase4Id, phase4Master.id);
  const amateurLeaderboard = await getLeaderboard(phase4Id, phase4Amateur.id);

  // Phase 5 Challenger: Top 8 P4 Master
  const challengerPlayerIds = masterLeaderboard
    .slice(0, 8)
    .map((p) => p.player_id);

  // Phase 5 Master: Ranks 9-16 P4 Master
  const phase5MasterPlayerIds = masterLeaderboard
    .slice(8, 16)
    .map((p) => p.player_id);

  // Phase 5 Amateur: Top 8 P4 Amateur
  const phase5AmateurPlayerIds = amateurLeaderboard
    .slice(0, 8)
    .map((p) => p.player_id);

  // Obtenir les brackets de Phase 5
  const phase5Brackets = await db.query.bracket.findMany({
    where: eq(bracket.phase_id, phase5Id),
  });

  const challengerBracket = phase5Brackets.find((b) => b.name === "challenger");
  const masterBracket = phase5Brackets.find((b) => b.name === "master");
  const amateurBracket = phase5Brackets.find((b) => b.name === "amateur");

  if (!challengerBracket || !masterBracket || !amateurBracket) {
    throw new Error(
      "Phase 5 must have challenger, master, and amateur brackets",
    );
  }

  // Seed et créer games (8 joueurs = 1 lobby chacun)
  const challengerSeededPlayers = await seedPlayersForPhase(
    phase5Id,
    challengerPlayerIds,
  );
  const challengerGames = await assignPlayersToLobbies(
    phase5Id,
    challengerBracket.id,
    1,
    challengerSeededPlayers,
  );

  const masterSeededPlayers = await seedPlayersForPhase(
    phase5Id,
    phase5MasterPlayerIds,
  );
  const masterGames = await assignPlayersToLobbies(
    phase5Id,
    masterBracket.id,
    1,
    masterSeededPlayers,
  );

  const amateurSeededPlayers = await seedPlayersForPhase(
    phase5Id,
    phase5AmateurPlayerIds,
  );
  const amateurGames = await assignPlayersToLobbies(
    phase5Id,
    amateurBracket.id,
    1,
    amateurSeededPlayers,
  );

  return {
    challengerBracket: {
      bracket: challengerBracket,
      players: challengerSeededPlayers,
      games: challengerGames.map((g) => g.game),
      source: "Top 8 P4 Master",
    },
    masterBracket: {
      bracket: masterBracket,
      players: masterSeededPlayers,
      games: masterGames.map((g) => g.game),
      source: "Ranks 9-16 P4 Master",
    },
    amateurBracket: {
      bracket: amateurBracket,
      players: amateurSeededPlayers,
      games: amateurGames.map((g) => g.game),
      source: "Top 8 P4 Amateur",
    },
  };
}
