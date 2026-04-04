/**
 * Dynamic Swiss-style contiguous seeding utilities for TFT tournament
 *
 * This module provides flexible, dynamically generated seeding matrices using contiguous seed blocks.
 * All seeding is now done through generateSnakeDraftMatrix() for consistency and flexibility.
 *
 * Seeds remain contiguous by lobby while lobby sizes stay balanced (size difference <= 1).
 */

/**
 * Applique une matrice de seeding aux joueurs
 * @param seededPlayers - Joueurs triés par seed (1 = meilleur)
 * @param matrix - Matrice définissant quels seeds vont dans quel lobby
 * @returns Assignments de lobbies avec les joueurs correspondants
 */
export function applySeedingMatrix(
  seededPlayers: any[],
  matrix: number[][],
): any[] {
  const playersBySeed = new Map(seededPlayers.map((p) => [p.seed, p]));

  return matrix.map((seedsInLobby, lobbyIndex) => {
    const lobbyPlayers = seedsInLobby
      .map((seed) => playersBySeed.get(seed))
      .filter((p) => p !== undefined);

    return {
      lobby_index: lobbyIndex,
      lobby_name: getLobbyName(lobbyIndex),
      players: lobbyPlayers,
      seed_range:
        seedsInLobby.length > 0
          ? [Math.min(...seedsInLobby), Math.max(...seedsInLobby)]
          : [0, 0],
    };
  });
}

/**
 * Generate a Swiss-style contiguous seeding matrix dynamically for any positive player count
 *
 * This is the PRIMARY and ONLY method to use for generating seeding matrices.
 * It ensures contiguous seed ranges per lobby and balanced lobby sizes.
 *
 * @param playerCount - Total number of players (> 0)
 * @param startSeed - Starting seed number (default: 1). Use this for non-consecutive seeds (e.g., Phase 2 starts at seed 33)
 * @returns Matrix of seed assignments with balanced lobby sizes (difference <= 1)
 *
 * @example
 * // Phase 1: 128 players starting at seed 1 → 16 lobbies
 * const matrix = generateSnakeDraftMatrix(128, 1);
 * // Returns lobbies of size 8 for this exact case
 *
 * @example
 * // Phase 2: 96 players starting at seed 33 → 12 lobbies
 * const matrix = generateSnakeDraftMatrix(96, 33);
 * // Returns lobbies of size 8 for this exact case
 *
 * @example
 * // Phase 3: 64 players per bracket → 8 lobbies
 * const matrix = generateSnakeDraftMatrix(64);
 * // Returns lobbies of size 8 for this exact case
 *
 * @example
 * // Phase 4 Master: 32 players → 4 lobbies
 * const matrix = generateSnakeDraftMatrix(32);
 * // Returns lobbies of size 8 for this exact case
 */
export function generateSnakeDraftMatrix(
  playerCount: number,
  startSeed: number = 1,
): number[][] {
  // Validate input
  if (playerCount < 1) {
    throw new Error(`playerCount must be at least 1, got ${playerCount}`);
  }

  if (startSeed < 1) {
    throw new Error(`startSeed must be at least 1, got ${startSeed}`);
  }

  const lobbyCount = Math.ceil(playerCount / 8);
  const baseLobbySize = Math.floor(playerCount / lobbyCount);
  const extraPlayers = playerCount % lobbyCount;

  const lobbySizes = Array.from(
    { length: lobbyCount },
    (_, index) => baseLobbySize + (index < extraPlayers ? 1 : 0),
  );

  const matrix: number[][] = Array.from({ length: lobbyCount }, () => []);

  let nextSeed = startSeed;
  for (let lobbyIndex = 0; lobbyIndex < lobbyCount; lobbyIndex++) {
    for (let slot = 0; slot < lobbySizes[lobbyIndex]; slot++) {
      matrix[lobbyIndex].push(nextSeed);
      nextSeed++;
    }
  }

  return matrix;
}

/**
 * Generate a snake-style seeding matrix for TFT tournament bracket master phases
 *
 * This creates an alternating pattern where seeds are distributed across lobbies
 * in a snake/zigzag pattern. Useful for more balanced matchups across lobbies.
 *
 * Algorithm:
 * - Divides seeds into groups of size = lobbyCount
 * - Even-numbered groups (0, 2, 4...): seeds distributed forward to lobbies
 * - Odd-numbered groups (1, 3, 5...): seeds distributed in reverse to lobbies
 *
 * @param playerCount - Total number of players (> 0)
 * @param startSeed - Starting seed number (default: 1)
 * @returns Matrix of seed assignments with snake/zigzag pattern
 *
 * @example
 * // Phase 3 Master: 32 players → 4 lobbies with snake pattern
 * const matrix = generateSnakeSeedMatrix(32);
 * // Returns:
 * // [
 * //   [1, 8, 9, 16, 17, 24, 25, 32],    // Lobby A
 * //   [2, 7, 10, 15, 18, 23, 26, 31],   // Lobby B
 * //   [3, 6, 11, 14, 19, 22, 27, 30],   // Lobby C
 * //   [4, 5, 12, 13, 20, 21, 28, 29],   // Lobby D
 * // ]
 *
 * @example
 * // Phase 4 Master: 16 players → 2 lobbies with snake pattern
 * const matrix = generateSnakeSeedMatrix(16);
 * // Returns:
 * // [
 * //   [1, 8, 9, 16],  // Lobby A
 * //   [2, 7, 10, 15], // Lobby B
 * // ]
 */
export function generateSnakeSeedMatrix(
  playerCount: number,
  startSeed: number = 1,
): number[][] {
  // Validate input
  if (playerCount < 1) {
    throw new Error(`playerCount must be at least 1, got ${playerCount}`);
  }

  if (startSeed < 1) {
    throw new Error(`startSeed must be at least 1, got ${startSeed}`);
  }

  const lobbyCount = Math.ceil(playerCount / 8);
  const baseLobbySize = Math.floor(playerCount / lobbyCount);
  const extraPlayers = playerCount % lobbyCount;

  // Initialize empty matrix
  const matrix: number[][] = Array.from({ length: lobbyCount }, () => []);

  let currentSeed = startSeed;

  // Calculate total number of groups (each group has lobbyCount seeds)
  const totalGroups = Math.ceil(playerCount / lobbyCount);

  // Process each group of seeds
  for (let groupIdx = 0; groupIdx < totalGroups; groupIdx++) {
    const groupSeeds: number[] = [];

    // Collect seeds for this group
    for (
      let i = 0;
      i < lobbyCount && currentSeed < startSeed + playerCount;
      i++
    ) {
      groupSeeds.push(currentSeed);
      currentSeed++;
    }

    // Apply snake pattern: reverse if group index is odd
    if (groupIdx % 2 === 1) {
      groupSeeds.reverse();
    }

    // Distribute seeds to lobbies
    for (let lobbyIdx = 0; lobbyIdx < groupSeeds.length; lobbyIdx++) {
      matrix[lobbyIdx].push(groupSeeds[lobbyIdx]);
    }
  }

  return matrix;
}

/**
 * Convert lobby index to name (0 = A, 1 = B, etc.)
 */
function getLobbyName(index: number): string {
  if (index < 0 || index > 25) {
    return `Lobby ${index + 1}`;
  }
  return `Lobby ${String.fromCharCode(65 + index)}`; // 65 = 'A'
}
