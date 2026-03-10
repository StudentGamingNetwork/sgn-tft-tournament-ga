/**
 * Pure functions for tie-breaking algorithm
 * Compares players with equal points using secondary criteria
 */

import type { PlayerStats } from "@/types/tournament";

/**
 * Compare two players using tie-breaker rules
 * Returns negative if A should rank higher than B
 * 
 * Tie-breaker order (as specified):
 * 1. Total points (higher is better)
 * 2. Number of Top 1 finishes (higher is better)
 * 3. Number of Top 4 finishes (higher is better)
 * 4. Number of Top 2 finishes (higher is better)
 * 5. Number of Top 3 finishes (higher is better)
 * 6. Number of Top 5 finishes (higher is better)
 * 7. Number of Top 6 finishes (higher is better)
 * 8. Number of Top 7 finishes (higher is better)
 * 9. Number of Top 8 finishes (higher is better)
 * 10. Initial seed (lower is better - original ranking)
 */
export function compareTieBreaker(
    playerA: PlayerStats,
    playerB: PlayerStats,
    initialSeedA?: number,
    initialSeedB?: number
): number {
    // 1. Total points (higher = better)
    if (playerA.total_points !== playerB.total_points) {
        return playerB.total_points - playerA.total_points;
    }
    
    // 2. Top 1 count (higher = better)
    if (playerA.top1_count !== playerB.top1_count) {
        return playerB.top1_count - playerA.top1_count;
    }
    
    // 3. Top 4 count (higher = better)
    if (playerA.top4_count !== playerB.top4_count) {
        return playerB.top4_count - playerA.top4_count;
    }
    
    // 4. Top 2 count (higher = better)
    if (playerA.top2_count !== playerB.top2_count) {
        return playerB.top2_count - playerA.top2_count;
    }
    
    // 5. Top 3 count (higher = better)
    if (playerA.top3_count !== playerB.top3_count) {
        return playerB.top3_count - playerA.top3_count;
    }
    
    // 6. Top 5 count (higher = better)
    if (playerA.top5_count !== playerB.top5_count) {
        return playerB.top5_count - playerA.top5_count;
    }
    
    // 7. Top 6 count (higher = better)
    if (playerA.top6_count !== playerB.top6_count) {
        return playerB.top6_count - playerA.top6_count;
    }
    
    // 8. Top 7 count (higher = better)
    if (playerA.top7_count !== playerB.top7_count) {
        return playerB.top7_count - playerA.top7_count;
    }
    
    // 9. Top 8 count (higher = better)
    if (playerA.top8_count !== playerB.top8_count) {
        return playerB.top8_count - playerA.top8_count;
    }
    
    // 10. Initial seed (lower = better - was ranked higher initially)
    if (initialSeedA !== undefined && initialSeedB !== undefined) {
        return initialSeedA - initialSeedB;
    }
    
    // Complete tie
    return 0;
}

/**
 * Calculate player statistics from placement array
 * @param placements - Array of placements (1-8) for each game
 * @param points - Total accumulated points
 */
export function calculatePlayerStats(
    player_id: string,
    placements: number[],
    points: number
): PlayerStats {
    const totalGames = placements.length;
    const avgPlacement = totalGames > 0 
        ? placements.reduce((sum, p) => sum + p, 0) / totalGames 
        : 0;
    
    // Count placements
    const top1_count = placements.filter(p => p === 1).length;
    const top2_count = placements.filter(p => p === 2).length;
    const top3_count = placements.filter(p => p === 3).length;
    const top4_count = placements.filter(p => p <= 4).length; // Total top 4
    const top5_count = placements.filter(p => p === 5).length;
    const top6_count = placements.filter(p => p === 6).length;
    const top7_count = placements.filter(p => p === 7).length;
    const top8_count = placements.filter(p => p === 8).length;
    
    return {
        player_id,
        total_points: points,
        total_games: totalGames,
        avg_placement: avgPlacement,
        top1_count,
        top2_count,
        top3_count,
        top4_count,
        top5_count,
        top6_count,
        top7_count,
        top8_count,
        placements: [...placements],
    };
}

/**
 * Sort array of player stats using tie-breaker rules
 * @param players - Array of player stats with optional initial seeds
 * @returns Sorted array (best to worst)
 */
export function sortByTieBreakers(
    players: Array<{ stats: PlayerStats; initialSeed?: number }>
): Array<{ stats: PlayerStats; initialSeed?: number }> {
    return [...players].sort((a, b) => 
        compareTieBreaker(a.stats, b.stats, a.initialSeed, b.initialSeed)
    );
}

/**
 * Calculate points from placement using standard TFT scoring
 * 1st = 8 points, 2nd = 7 points, ..., 8th = 1 point
 */
export function calculatePoints(placement: number): number {
    if (placement < 1 || placement > 8) {
        throw new Error(`Invalid placement: ${placement}. Must be between 1 and 8.`);
    }
    return 9 - placement; // 1st = 8, 2nd = 7, ..., 8th = 1
}
