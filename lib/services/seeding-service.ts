/**
 * Service for seeding players and assigning them to lobbies
 * Handles initial seeding, snake draft, and rotation matrix application
 */

import { db } from "@/lib/db";
import {
  player,
  lobbyPlayer,
  game,
  lobbyRotationMatrix,
} from "@/models/schema";
import { eq, and, inArray } from "drizzle-orm";
import { assignSeeds, comparePlayers } from "@/utils/seeding-algorithm";
import {
  generateSnakeDraftMatrix,
  generateSnakeSeedMatrix,
  applySeedingMatrix,
} from "@/utils/seeding-matrices";
import { createGame } from "./game-service";
import type {
  SeedingInput,
  SeededPlayer,
  LobbyAssignment,
} from "@/types/tournament";

/**
 * Get and seed all players for a phase based on their rank
 * Returns seeded players sorted by seed (1 = best)
 */
export async function seedPlayersForPhase(
  phaseId: string,
  playerIds?: string[],
): Promise<SeededPlayer[]> {
  // Get players (either specified IDs or all players)
  const players = await db.query.player.findMany({
    where: playerIds ? inArray(player.id, playerIds) : undefined,
  });

  if (players.length === 0) {
    throw new Error("No players found for seeding");
  }

  // Convert to SeedingInput format.
  // Players without rank data are seeded as UNRANKED with 0 LP.
  const seedingInput: SeedingInput[] = players.map((p) => ({
    player_id: p.id,
    name: p.name,
    riot_id: p.riot_id,
    tier: p.tier || "UNRANKED",
    division: (p.division as any) || null,
    league_points: p.league_points ?? 0,
  }));

  // Assign seeds using the algorithm
  const seededPlayers = assignSeeds(seedingInput);

  return seededPlayers;
}

/**
 * Seed players based on a previous phase's leaderboard results
 * Preserves the original leaderboard rank as the seed (not tier/LP)
 * This ensures Phase 2+ lobbies are balanced based on actual performance
 * and maintains the original ranking context (e.g., Phase 2 players keep ranks 33-128)
 *
 * @param leaderboard - Leaderboard from previous phase(s)
 * @param preserveOriginalRank - If true, keep leaderboard rank as seed. If false, reseed sequentially (1..N) following input order.
 * @returns Seeded players seeded from leaderboard order
 */
export async function seedPlayersBasedOnLeaderboard(
  leaderboard: Array<{
    rank: number;
    player_id: string;
    player_name: string;
    riot_id: string;
  }>,
  preserveOriginalRank: boolean = true,
): Promise<SeededPlayer[]> {
  if (leaderboard.length === 0) {
    throw new Error("Leaderboard is empty");
  }

  // Get player details from database to have tier/division/LP (even if not used for seeding)
  const playerIds = leaderboard.map((entry) => entry.player_id);
  const players = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });

  // Create a map for quick lookup
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Create SeededPlayer objects based on leaderboard rank
  const seededPlayers: SeededPlayer[] = leaderboard.map((entry, index) => {
    const playerData = playerMap.get(entry.player_id);

    if (!playerData) {
      throw new Error(`Player ${entry.player_id} not found in database`);
    }

    return {
      player_id: entry.player_id,
      name: entry.player_name,
      riot_id: entry.riot_id,
      tier: playerData.tier || "UNRANKED",
      division: (playerData.division as any) || null,
      league_points: playerData.league_points || 0,
      seed: preserveOriginalRank ? entry.rank : index + 1,
    };
  });

  return seededPlayers;
}

/**
 * Assign players to lobbies using dynamically generated seeding matrix
 * Creates games and lobby player assignments
 *
 * @param phaseId - Phase ID
 * @param bracketId - Bracket ID
 * @param gameNumber - Game number (1-based)
 * @param seededPlayers - Players with assigned seeds
 * @param useSnakeSeeding - If true, use snake seeding pattern (alternating); if false, use contiguous seeding (default: false)
 * @returns Created games with lobby assignments
 */
export async function assignPlayersToLobbies(
  phaseId: string,
  bracketId: string,
  gameNumber: number,
  seededPlayers: SeededPlayer[],
  useSnakeSeeding: boolean = false,
): Promise<{ game: any; assignment: LobbyAssignment }[]> {
  // Generate seeding matrix based on mode
  const seedingMatrix = useSnakeSeeding
    ? generateSnakeSeedMatrix(seededPlayers.length)
    : generateSnakeDraftMatrix(seededPlayers.length);

  // Apply seeding matrix
  const assignments = applySeedingMatrix(seededPlayers, seedingMatrix);

  const createdGames = [];

  for (const assignment of assignments) {
    // Create game for this lobby
    const newGame = await createGame({
      bracket_id: bracketId,
      phase_id: phaseId,
      lobby_name: assignment.lobby_name,
      game_number: gameNumber,
    });

    // Assign players to this lobby
    const lobbyPlayerAssignments = assignment.players.map(
      (player: SeededPlayer) => ({
        game_id: newGame.id,
        player_id: player.player_id,
        // Keep the global seed (not 1-8 local lobby position) so reseeding across games works.
        seed: player.seed,
      }),
    );

    await db.insert(lobbyPlayer).values(lobbyPlayerAssignments);

    createdGames.push({
      game: newGame,
      assignment,
    });
  }

  return createdGames;
}

/**
 * Load rotation matrix from database for a specific phase and game number
 */
export async function loadRotationMatrix(
  phaseId: string,
  gameNumber: number,
): Promise<number[][] | null> {
  const matrices = await db.query.lobbyRotationMatrix.findMany({
    where: and(
      eq(lobbyRotationMatrix.phase_id, phaseId),
      eq(lobbyRotationMatrix.game_number, gameNumber),
    ),
  });

  if (matrices.length === 0) {
    return null;
  }

  // Sort by lobby_index and parse seed assignments
  const sortedMatrices = matrices.sort((a, b) => a.lobby_index - b.lobby_index);
  const matrix = sortedMatrices.map((m) => JSON.parse(m.seed_assignments));

  return matrix;
}

/**
 * Save rotation matrix to database
 */
export async function saveRotationMatrix(
  phaseId: string,
  gameNumber: number,
  matrix: number[][],
): Promise<void> {
  const matrixRecords = matrix.map((seedArray, lobbyIndex) => ({
    phase_id: phaseId,
    game_number: gameNumber,
    lobby_index: lobbyIndex,
    seed_assignments: JSON.stringify(seedArray),
  }));

  // Delete existing matrix for this phase/game (if any)
  await db
    .delete(lobbyRotationMatrix)
    .where(
      and(
        eq(lobbyRotationMatrix.phase_id, phaseId),
        eq(lobbyRotationMatrix.game_number, gameNumber),
      ),
    );

  // Insert new matrix
  await db.insert(lobbyRotationMatrix).values(matrixRecords);
}

/**
 * Assign players to lobbies using a rotation matrix
 * Used for subsequent games in a phase (e.g., games 2-6)
 */
export async function assignPlayersWithRotation(
  phaseId: string,
  bracketId: string,
  gameNumber: number,
  seededPlayers: SeededPlayer[],
  matrix: number[][],
): Promise<{ game: any; assignment: LobbyAssignment }[]> {
  // Apply rotation matrix to get lobby assignments
  const assignments = applySeedingMatrix(seededPlayers, matrix);

  const createdGames = [];

  for (const assignment of assignments) {
    // Create game for this lobby
    const newGame = await createGame({
      bracket_id: bracketId,
      phase_id: phaseId,
      lobby_name: assignment.lobby_name,
      game_number: gameNumber,
    });

    // Assign players to this lobby
    const lobbyPlayerAssignments = assignment.players.map(
      (player: SeededPlayer) => ({
        game_id: newGame.id,
        player_id: player.player_id,
        seed: player.seed, // Global seed in tournament
      }),
    );

    await db.insert(lobbyPlayer).values(lobbyPlayerAssignments);

    createdGames.push({
      game: newGame,
      assignment,
    });
  }

  return createdGames;
}

/**
 * Create first game with pre-seeded players
 * Used when players are already seeded (e.g., based on previous phase results)
 *
 * @param phaseId - Phase ID
 * @param bracketId - Bracket ID
 * @param seededPlayers - Players already seeded (seed determines lobby assignment)
 * @returns Created games with lobby assignments
 */
export async function createFirstGameWithSeededPlayers(
  phaseId: string,
  bracketId: string,
  seededPlayers: SeededPlayer[],
): Promise<{ games: any[]; seededPlayers: SeededPlayer[] }> {
  // Determine the starting seed (for Phase 2+, this may be 33 instead of 1)
  const startSeed =
    seededPlayers.length > 0
      ? Math.min(...seededPlayers.map((p) => p.seed))
      : 1;

  // 1. Generate snake draft matrix dynamically based on player count and starting seed
  const seedingMatrix = generateSnakeDraftMatrix(
    seededPlayers.length,
    startSeed,
  );

  // 2. Apply seeding matrix to get lobby assignments
  const assignments = applySeedingMatrix(seededPlayers, seedingMatrix);

  const createdGames = [];

  // 3. Create games and assign players
  for (const assignment of assignments) {
    // Skip empty lobbies
    if (assignment.players.length === 0) {
      continue;
    }

    // Create game for this lobby
    const newGame = await createGame({
      bracket_id: bracketId,
      phase_id: phaseId,
      lobby_name: assignment.lobby_name,
      game_number: 1, // Game number 1
    });

    // Assign players to this lobby
    const lobbyPlayerAssignments = assignment.players.map(
      (player: SeededPlayer) => ({
        game_id: newGame.id,
        player_id: player.player_id,
        seed: player.seed, // Global seed in tournament
      }),
    );

    await db.insert(lobbyPlayer).values(lobbyPlayerAssignments);

    createdGames.push({
      game: newGame,
      assignment,
    });
  }

  return {
    games: createdGames.map((g) => g.game),
    seededPlayers,
  };
}

/**
 * Complete workflow: Seed players and create first game with dynamically generated snake draft matrix
 * Automatically generates the matrix based on the number of players (must be multiple of 8)
 */
export async function seedAndCreateFirstGame(
  phaseId: string,
  bracketId: string,
  playerIds?: string[],
): Promise<{ games: any[]; seededPlayers: SeededPlayer[] }> {
  // 1. Seed all players based on their TFT rank
  const seededPlayers = await seedPlayersForPhase(phaseId, playerIds);

  // 2. Create first game with seeded players
  return createFirstGameWithSeededPlayers(phaseId, bracketId, seededPlayers);
}

/**
 * Complete workflow: Seed players based on leaderboard and create first game
 * Used for subsequent phases where seeding is based on previous phase performance
 *
 * @param phaseId - Phase ID
 * @param bracketId - Bracket ID
 * @param leaderboard - Leaderboard entries from previous phase
 * @returns Created games with lobby assignments
 */
export async function seedAndCreateFirstGameFromLeaderboard(
  phaseId: string,
  bracketId: string,
  leaderboard: Array<{
    rank: number;
    player_id: string;
    player_name: string;
    riot_id: string;
  }>,
): Promise<{ games: any[]; seededPlayers: SeededPlayer[] }> {
  // 1. Seed players based on leaderboard rankings
  const seededPlayers = await seedPlayersBasedOnLeaderboard(leaderboard);

  // 2. Create first game with seeded players
  return createFirstGameWithSeededPlayers(phaseId, bracketId, seededPlayers);
}
