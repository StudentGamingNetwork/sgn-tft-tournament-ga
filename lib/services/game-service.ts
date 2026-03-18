/**
 * Service for managing games
 * Handles game lifecycle, results submission, and queries
 */

import { db } from "@/lib/db";
import {
  game,
  lobbyPlayer,
  results,
  player,
  phase,
  bracket,
} from "@/models/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { GameResult, StatusType, SeededPlayer } from "@/types/tournament";
import { calculatePoints } from "@/utils/tie-breakers";
import { getLeaderboard } from "@/lib/services/scoring-service";
import {
  generateSnakeDraftMatrix,
  applySeedingMatrix,
} from "@/utils/seeding-matrices";
import { syncTournamentStatusByPhaseId } from "@/lib/services/tournament-status-service";

/**
 * Create a new game
 */
export async function createGame(data: {
  bracket_id: string;
  phase_id: string;
  lobby_name: string;
  game_number: number;
}) {
  const [newGame] = await db
    .insert(game)
    .values({
      bracket_id: data.bracket_id,
      phase_id: data.phase_id,
      lobby_name: data.lobby_name,
      game_number: data.game_number,
      status: "upcoming",
    })
    .returning();

  return newGame;
}

/**
 * Update game status
 */
export async function updateGameStatus(gameId: string, status: StatusType) {
  const [updated] = await db
    .update(game)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(game.id, gameId))
    .returning();

  return updated;
}

/**
 * Get game details with lobby players and results
 */
export async function getGameDetails(gameId: string) {
  const gameData = await db.query.game.findFirst({
    where: eq(game.id, gameId),
    with: {
      lobbyPlayers: {
        with: {
          player: {
            with: {
              team: true,
            },
          },
        },
      },
      results: {
        with: {
          player: true,
        },
      },
    },
  });

  return gameData;
}

/**
 * Submit game results
 * Validates that placements are 1-8 and unique
 * Automatically calculates and stores points
 * After successful submission, checks if all games of this number are complete
 * and automatically creates the next game if needed
 *
 * @throws Error if validation fails
 */
export async function submitGameResults(
  gameId: string,
  gameResults: GameResult[],
) {
  // Get game info first to know phase_id and game_number
  const gameInfo = await db.query.game.findFirst({
    where: eq(game.id, gameId),
  });

  if (!gameInfo) {
    throw new Error("Game not found");
  }

  // Validation: Check we have exactly 8 results
  if (gameResults.length !== 8) {
    throw new Error(`Expected 8 results, got ${gameResults.length}`);
  }

  // Validation: Check all placements are 1-8
  const placements = gameResults.map((r) => r.placement);
  const invalidPlacements = placements.filter((p) => p < 1 || p > 8);
  if (invalidPlacements.length > 0) {
    throw new Error(
      `Invalid placements: ${invalidPlacements.join(", ")}. Must be between 1 and 8.`,
    );
  }

  // Validation: Check all placements are unique
  const uniquePlacements = new Set(placements);
  if (uniquePlacements.size !== 8) {
    throw new Error("All placements must be unique (1-8)");
  }

  // Validation: Check all player_ids are valid
  const playerIds = gameResults.map((r) => r.player_id);
  const uniquePlayerIds = new Set(playerIds);
  if (uniquePlayerIds.size !== 8) {
    throw new Error("All player_ids must be unique");
  }

  // Validation: Check that all players are assigned to this game
  const lobbyPlayers = await db.query.lobbyPlayer.findMany({
    where: eq(lobbyPlayer.game_id, gameId),
  });

  const assignedPlayerIds = new Set(lobbyPlayers.map((lp) => lp.player_id));
  const invalidPlayerIds = playerIds.filter((id) => !assignedPlayerIds.has(id));
  if (invalidPlayerIds.length > 0) {
    throw new Error(
      `Players not assigned to this game: ${invalidPlayerIds.join(", ")}`,
    );
  }

  // Calculate points for each result (if not provided)
  const resultsWithPoints = gameResults.map((result) => ({
    game_id: gameId,
    player_id: result.player_id,
    placement: result.placement,
    points: result.points ?? calculatePoints(result.placement),
  }));

  // Use transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // Delete existing results (if any)
    await tx.delete(results).where(eq(results.game_id, gameId));

    // Insert new results
    await tx.insert(results).values(resultsWithPoints);

    // Update game status to completed
    await tx
      .update(game)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(game.id, gameId));
  });

  // After successful submission, check if we should create the next game
  if (gameInfo.phase_id) {
    await checkAndCreateNextGame(gameInfo.phase_id, gameInfo.game_number);
    await syncTournamentStatusByPhaseId(gameInfo.phase_id);
  }

  return resultsWithPoints;
}

/**
 * Get all games for a phase
 */
export async function getGamesByPhase(phaseId: string) {
  return await db.query.game.findMany({
    where: eq(game.phase_id, phaseId),
    with: {
      bracket: true,
    },
  });
}

/**
 * Get all games for a bracket
 */
export async function getGamesByBracket(bracketId: string) {
  return await db.query.game.findMany({
    where: eq(game.bracket_id, bracketId),
  });
}

/**
 * Delete a game (cascades to lobby players and results)
 */
export async function deleteGame(gameId: string) {
  const [deleted] = await db
    .delete(game)
    .where(eq(game.id, gameId))
    .returning();

  return deleted;
}

/**
 * Get all results for a game
 */
export async function getGameResults(gameId: string) {
  return await db.query.results.findMany({
    where: eq(results.game_id, gameId),
    with: {
      player: {
        with: {
          team: true,
        },
      },
    },
  });
}

/**
 * Check if a game has results submitted
 */
export async function hasResults(gameId: string): Promise<boolean> {
  const gameResults = await db.query.results.findMany({
    where: eq(results.game_id, gameId),
  });

  return gameResults.length > 0;
}

/**
 * Automatically create the next game for a phase if all current games have results
 * Handles phases with multiple brackets (Master/Amateur/Challenger) correctly
 */
export async function checkAndCreateNextGame(
  phaseId: string,
  currentGameNumber: number,
): Promise<{ created: boolean; gamesCreated?: number }> {
  // 1. Get phase info to know total_games and order_index
  const phaseData = await db.query.phase.findFirst({
    where: eq(phase.id, phaseId),
  });

  if (!phaseData) {
    throw new Error("Phase not found");
  }

  // 2. Check if we've reached the max games for this phase
  if (currentGameNumber >= phaseData.total_games) {
    return { created: false }; // No more games to create
  }

  // 3. Get all games for the current game number
  const currentGames = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, phaseId),
      eq(game.game_number, currentGameNumber),
    ),
    with: {
      results: true,
      lobbyPlayers: true,
      bracket: true,
    },
  });

  if (currentGames.length === 0) {
    return { created: false }; // No games found
  }

  // 4. Group games by bracket to handle each bracket separately
  const gamesByBracket = new Map<string, typeof currentGames>();
  for (const game of currentGames) {
    if (!game.bracket_id) continue;

    if (!gamesByBracket.has(game.bracket_id)) {
      gamesByBracket.set(game.bracket_id, []);
    }
    gamesByBracket.get(game.bracket_id)!.push(game);
  }

  // 5. Create next game for each bracket separately
  let totalGamesCreated = 0;

  for (const [bracketId, bracketGames] of gamesByBracket) {
    // Only progress a bracket when all lobbies of that bracket are completed.
    const bracketAllHaveResults = bracketGames.every(
      (g) => g.results.length > 0,
    );

    if (!bracketAllHaveResults) {
      continue;
    }

    // Phase 4 Master special flow:
    // - Game 2 is auto-created after Game 1
    // - Games 3-4 are auto-created with top 16 after Game 2 is fully completed
    const bracketName = bracketGames[0]?.bracket?.name;
    if (
      phaseData.order_index === 4 &&
      bracketName === "master" &&
      currentGameNumber === 2
    ) {
      const result = await createPhase4MasterTop16Games(phaseId, bracketId);
      if (result.created && result.gamesCreated) {
        totalGamesCreated += result.gamesCreated;
      }
      continue;
    }

    if (
      phaseData.order_index === 4 &&
      bracketName === "master" &&
      currentGameNumber >= 3
    ) {
      continue;
    }

    const result = await createNextGameWithReseed(
      phaseId,
      bracketId,
      currentGameNumber,
      bracketGames,
      phaseData.order_index,
    );

    if (result.created && result.gamesCreated) {
      totalGamesCreated += result.gamesCreated;
    }
  }

  return {
    created: totalGamesCreated > 0,
    gamesCreated: totalGamesCreated,
  };
}

async function createPhase4MasterTop16Games(
  phaseId: string,
  bracketId: string,
): Promise<{ created: boolean; gamesCreated?: number }> {
  const existingGames3 = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, phaseId),
      eq(game.bracket_id, bracketId),
      eq(game.game_number, 3),
    ),
  });

  if (existingGames3.length > 0) {
    return { created: false, gamesCreated: 0 };
  }

  const leaderboard = await getLeaderboard(phaseId, bracketId);
  const top16 = leaderboard.slice(0, 16);

  if (top16.length < 16) {
    throw new Error(
      `Phase 4 master requires 16 players for games 3-4, found ${top16.length}`,
    );
  }

  const playerIds = top16.map((entry) => entry.player_id);
  const playersData = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });
  const playersMap = new Map(playersData.map((p) => [p.id, p]));

  const seededPlayers: SeededPlayer[] = top16.map((entry, index) => {
    const playerData = playersMap.get(entry.player_id);
    if (!playerData) {
      throw new Error(`Player ${entry.player_id} not found`);
    }

    return {
      player_id: entry.player_id,
      name: entry.player_name,
      riot_id: entry.riot_id,
      tier: playerData.tier!,
      division: playerData.division as any,
      league_points: playerData.league_points!,
      seed: index + 1,
    };
  });

  const seedingMatrix = generateSnakeDraftMatrix(16, 1);
  const assignments = applySeedingMatrix(seededPlayers, seedingMatrix);

  let gamesCreated = 0;
  for (const gameNumber of [3, 4]) {
    for (const assignment of assignments) {
      const newGame = await createGame({
        bracket_id: bracketId,
        phase_id: phaseId,
        lobby_name: assignment.lobby_name,
        game_number: gameNumber,
      });

      const lobbyPlayerAssignments = assignment.players.map((player: any) => ({
        game_id: newGame.id,
        player_id: player.player_id,
        seed: player.seed,
      }));

      await db.insert(lobbyPlayer).values(lobbyPlayerAssignments);
      gamesCreated++;
    }
  }

  return { created: gamesCreated > 0, gamesCreated };
}

/**
 * Create next game by re-seeding players based on current standings.
 * Uses contiguous seeds (1..N) from current leaderboard rank for robustness.
 * Handles brackets separately for phases with multiple brackets (Master/Amateur/Challenger).
 */
async function createNextGameWithReseed(
  phaseId: string,
  bracketId: string,
  currentGameNumber: number,
  currentGames: any[],
  phaseOrderIndex: number,
): Promise<{ created: boolean; gamesCreated?: number }> {
  const nextGameNumber = currentGameNumber + 1;

  // Guard against duplicate next-game creation.
  const existingNextGames = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, phaseId),
      eq(game.bracket_id, bracketId),
      eq(game.game_number, nextGameNumber),
    ),
  });

  if (existingNextGames.length > 0) {
    return { created: false, gamesCreated: 0 };
  }

  // 1. Get current leaderboard for THIS BRACKET ONLY
  const leaderboard = await getLeaderboard(phaseId, bracketId);

  if (leaderboard.length === 0) {
    throw new Error(`No leaderboard data found for bracket ${bracketId}`);
  }

  // 2. Get all players with their rank data to create SeededPlayer objects
  const playerIds = leaderboard.map((entry) => entry.player_id);
  const playersData = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });

  const playersMap = new Map(playersData.map((p) => [p.id, p]));

  // 3. Transform leaderboard to SeededPlayer[] with contiguous seeds (1..N)
  const seededPlayers: SeededPlayer[] = leaderboard.map((entry, index) => {
    const playerData = playersMap.get(entry.player_id);
    if (!playerData) {
      throw new Error(`Player ${entry.player_id} not found`);
    }

    return {
      player_id: entry.player_id,
      name: entry.player_name,
      riot_id: entry.riot_id,
      tier: playerData.tier!,
      division: playerData.division as any,
      league_points: playerData.league_points!,
      seed: index + 1,
    };
  });

  // 4. Determine starting seed
  const playerCount = seededPlayers.length;
  const startSeed =
    seededPlayers.length > 0
      ? Math.min(...seededPlayers.map((p) => p.seed))
      : 1;

  // 5. Generate seeding matrix dynamically based on player count and starting seed
  const seedingMatrix = generateSnakeDraftMatrix(playerCount, startSeed);

  // 6. Apply seeding matrix to get lobby assignments
  const newAssignments = applySeedingMatrix(seededPlayers, seedingMatrix);

  // 7. Create new games with re-seeded player assignments for this bracket
  let gamesCreated = 0;

  for (const assignment of newAssignments) {
    // Skip empty lobbies
    if (assignment.players.length === 0) {
      continue;
    }

    // Create the game for this specific bracket
    const newGame = await createGame({
      bracket_id: bracketId,
      phase_id: phaseId,
      lobby_name: assignment.lobby_name,
      game_number: nextGameNumber,
    });

    // Assign players to this lobby
    const lobbyPlayerAssignments = assignment.players.map((player: any) => ({
      game_id: newGame.id,
      player_id: player.player_id,
      seed: player.seed, // Preserve seed (1-128 for Phase 1, 33-128 for Phase 2, etc.)
    }));

    await db.insert(lobbyPlayer).values(lobbyPlayerAssignments);
    gamesCreated++;
  }

  return { created: gamesCreated > 0, gamesCreated };
}
