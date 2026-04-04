/**
 * Pure functions for initial seeding algorithm
 * Sorts players by tier, division, LP, and name to assign global seeds
 */

import type {
  TierType,
  DivisionType,
  SeedingInput,
  SeededPlayer,
} from "@/types/tournament";

/**
 * Convert tier to numeric value for sorting (lower = better)
 * CHALLENGER = 1, GRANDMASTER = 2, MASTER = 3, etc.
 */
export function tierToNumeric(tier: TierType): number {
  const tierMap: Record<TierType, number> = {
    CHALLENGER: 1,
    GRANDMASTER: 2,
    MASTER: 3,
    DIAMOND: 4,
    EMERALD: 5,
    PLATINUM: 6,
    GOLD: 7,
    SILVER: 8,
    BRONZE: 9,
    IRON: 10,
    UNRANKED: 11,
  };
  return tierMap[tier];
}

/**
 * Convert division to numeric value for sorting (lower = better)
 * I = 1, II = 2, III = 3, IV = 4, null/unknown = 5
 */
export function divisionToNumeric(division: DivisionType): number {
  const divisionMap: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
  };
  return divisionMap[division ?? ""] ?? 5;
}

/**
 * Compare two players for seeding (sorting)
 * Returns negative if A should be ranked higher (better) than B
 *
 * Sort order:
 * 1. Tier (ascending numeric: CHALLENGER=1 comes before MASTER=3)
 * 2. Division within the tier (ascending numeric: I=1 comes before II=2)
 * 3. LP (descending: higher LP is better)
 * 4. Name (alphabetical, for deterministic ties)
 */
export function comparePlayers(a: SeedingInput, b: SeedingInput): number {
  // First compare by tier (lower tier number = better)
  const tierA = tierToNumeric(a.tier);
  const tierB = tierToNumeric(b.tier);

  if (tierA !== tierB) {
    return tierA - tierB;
  }

  // Same tier, compare by division within the tier (lower division number = better)
  const divisionA = divisionToNumeric(a.division);
  const divisionB = divisionToNumeric(b.division);

  if (divisionA !== divisionB) {
    return divisionA - divisionB;
  }

  // Same tier and division, compare by LP (higher = better, so reverse order)
  if (a.league_points !== b.league_points) {
    return b.league_points - a.league_points;
  }

  // Same tier and LP, compare by name for deterministic ordering
  return a.name.localeCompare(b.name);
}

/**
 * Assign seeds to players based on their rank
 * Returns new array with seed field added (1-based, 1 = best player)
 */
export function assignSeeds(players: SeedingInput[]): SeededPlayer[] {
  // Sort players by comparePlayers function
  const sorted = [...players].sort(comparePlayers);

  // Assign seeds (1-based index)
  return sorted.map((player, index) => ({
    ...player,
    seed: index + 1,
  }));
}

/**
 * Get players by seed range (inclusive)
 * @param players - Array of seeded players
 * @param startSeed - Start seed (1-based, inclusive)
 * @param endSeed - End seed (1-based, inclusive)
 */
export function getPlayersBySeedRange(
  players: SeededPlayer[],
  startSeed: number,
  endSeed: number,
): SeededPlayer[] {
  return players.filter((p) => p.seed >= startSeed && p.seed <= endSeed);
}
