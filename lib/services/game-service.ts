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
 * For Phase 1: Re-seeds players based on current standings and applies snake draft
 * For other phases: Would use rotation matrices (not yet implemented)
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
    },
  });

  if (currentGames.length === 0) {
    return { created: false }; // No games found
  }

  // 4. Check if ALL current games have results
  const allHaveResults = currentGames.every((g) => g.results.length > 0);

  if (!allHaveResults) {
    return { created: false }; // Some games still need results
  }

  // 5. Re-seed based on current standings for all phases
  return await createNextGameWithReseed(
    phaseId,
    currentGameNumber,
    currentGames,
    phaseData.order_index,
  );
}

/**
 * Create next game by re-seeding players based on current standings
 * For Phase 1: Re-numbers seeds starting at 1 based on current leaderboard rank
 * For Phase 2+: Preserves original seeds from game 1 to maintain ranking context (e.g., 33-128 for Phase 2)
 */
async function createNextGameWithReseed(
  phaseId: string,
  currentGameNumber: number,
  currentGames: any[],
  phaseOrderIndex: number,
): Promise<{ created: boolean; gamesCreated?: number }> {
  const nextGameNumber = currentGameNumber + 1;

  // 1. Get current leaderboard (sorted by points, tie-breakers, etc.)
  const leaderboard = await getLeaderboard(phaseId);

  if (leaderboard.length === 0) {
    throw new Error("No leaderboard data found");
  }

  // 2. Get original seeds from game 1 for this phase
  const game1 = await db.query.game.findMany({
    where: and(eq(game.phase_id, phaseId), eq(game.game_number, 1)),
    with: {
      lobbyPlayers: true,
    },
  });

  // Build map of player_id -> original seed from game 1
  const originalSeedsMap = new Map<string, number>();
  game1.forEach((g) => {
    g.lobbyPlayers.forEach((lp) => {
      originalSeedsMap.set(lp.player_id, lp.seed);
    });
  });

  // 3. Get all players with their rank data to create SeededPlayer objects
  const playerIds = leaderboard.map((entry) => entry.player_id);
  const playersData = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });

  const playersMap = new Map(playersData.map((p) => [p.id, p]));

  // 4. Transform leaderboard to SeededPlayer[]
  // Phase 1: Use current rank as new seed (1-based)
  // Phase 2+: Preserve original seed from game 1
  const seededPlayers: SeededPlayer[] = leaderboard.map((entry, index) => {
    const playerData = playersMap.get(entry.player_id);
    if (!playerData) {
      throw new Error(`Player ${entry.player_id} not found`);
    }

    // For Phase 1, renumber seeds starting at 1 based on current rank
    // For Phase 2+, use original seed from game 1 to preserve context (e.g., 33-128)
    const seed =
      phaseOrderIndex === 1
        ? index + 1 // Phase 1: Current rank becomes new seed
        : originalSeedsMap.get(entry.player_id) || index + 1; // Phase 2+: Keep original seed

    return {
      player_id: entry.player_id,
      name: entry.player_name,
      riot_id: entry.riot_id,
      tier: playerData.tier!,
      division: playerData.division as any,
      league_points: playerData.league_points!,
      seed,
    };
  });

  // 5. Calculate lobby count (same as Game 1) and determine starting seed
  const lobbyCount = currentGames.length;
  const playerCount = seededPlayers.length;
  const startSeed =
    seededPlayers.length > 0
      ? Math.min(...seededPlayers.map((p) => p.seed))
      : 1;

  // 6. Generate seeding matrix dynamically based on player count and starting seed
  const seedingMatrix = generateSnakeDraftMatrix(playerCount, startSeed);

  // 7. Apply seeding matrix to get lobby assignments
  const newAssignments = applySeedingMatrix(seededPlayers, seedingMatrix);

  // 8. Get bracket info
  const firstGame = currentGames[0];
  if (!firstGame.bracket_id) {
    return { created: false };
  }

  // 9. Create new games with re-seeded player assignments
  let gamesCreated = 0;

  for (const assignment of newAssignments) {
    // Skip empty lobbies
    if (assignment.players.length === 0) {
      continue;
    }

    // Create the game
    const newGame = await createGame({
      bracket_id: firstGame.bracket_id,
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
