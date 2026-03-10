/**
 * Dynamic snake draft seeding utilities for TFT tournament
 *
 * This module provides flexible, dynamically generated seeding matrices using the snake draft algorithm.
 * All seeding is now done through generateSnakeDraftMatrix() for consistency and flexibility.
 *
 * The snake draft pattern ensures fair distribution by alternating between ascending and descending
 * seed assignments across lobbies, preventing clusters of strong or weak players.
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
 * Generate a snake draft seeding matrix dynamically for any multiple of 8 players
 *
 * This is the PRIMARY and ONLY method to use for generating seeding matrices.
 * It ensures fair distribution of players across lobbies using the snake draft pattern.
 *
 * @param playerCount - Total number of players (MUST be a multiple of 8)
 * @param startSeed - Starting seed number (default: 1). Use this for non-consecutive seeds (e.g., Phase 2 starts at seed 33)
 * @returns Matrix of seed assignments (lobbyCount × 8) compatible with applySeedingMatrix()
 * @throws Error if playerCount is not a multiple of 8
 *
 * @example
 * // Phase 1: 128 players starting at seed 1 → 16 lobbies
 * const matrix = generateSnakeDraftMatrix(128, 1);
 * // Returns: [[1, 32, 33, 64, 65, 96, 97, 128], [2, 31, 34, 63, ...], ...]
 *
 * @example
 * // Phase 2: 96 players starting at seed 33 → 12 lobbies
 * const matrix = generateSnakeDraftMatrix(96, 33);
 * // Returns: [[33, 56, 57, 80, 81, 104, 105, 128], [34, 55, 58, 79, ...], ...]
 *
 * @example
 * // Phase 3: 64 players per bracket → 8 lobbies
 * const matrix = generateSnakeDraftMatrix(64);
 * // Returns: [[1, 16, 17, 32, 33, 48, 49, 64], [2, 15, 18, 31, ...], ...]
 *
 * @example
 * // Phase 4 Master: 32 players → 4 lobbies
 * const matrix = generateSnakeDraftMatrix(32);
 * // Returns: [[1, 8, 9, 16, 17, 24, 25, 32], [2, 7, 10, 15, ...], ...]
 */
export function generateSnakeDraftMatrix(
  playerCount: number,
  startSeed: number = 1,
): number[][] {
  // Validate input
  if (playerCount < 8) {
    throw new Error(`playerCount must be at least 8, got ${playerCount}`);
  }

  if (playerCount % 8 !== 0) {
    throw new Error(`playerCount must be a multiple of 8, got ${playerCount}`);
  }

  if (startSeed < 1) {
    throw new Error(`startSeed must be at least 1, got ${startSeed}`);
  }

  const lobbyCount = playerCount / 8;
  const matrix: number[][] = [];
  const offset = startSeed - 1; // Offset to add to all seeds

  // Generate matrix using snake draft pattern
  // Pattern: 4 pairs of columns (8 columns total)
  // Each pair alternates between ascending and descending order
  for (let lobbyIndex = 0; lobbyIndex < lobbyCount; lobbyIndex++) {
    const lobby: number[] = [];

    for (let columnIndex = 0; columnIndex < 8; columnIndex++) {
      const pairIndex = Math.floor(columnIndex / 2); // 0, 0, 1, 1, 2, 2, 3, 3
      const isEvenColumn = columnIndex % 2 === 0;

      // Each pair contains 2 * lobbyCount seeds
      const pairStart = pairIndex * 2 * lobbyCount + 1;
      const pairEnd = pairStart + 2 * lobbyCount - 1;

      // Snake draft: even columns ascending, odd columns descending
      const seed = isEvenColumn ? pairStart + lobbyIndex : pairEnd - lobbyIndex;

      // Apply offset for non-consecutive seeds
      lobby.push(seed + offset);
    }

    matrix.push(lobby);
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
