/**
 * Service for calculating scores, rankings, and leaderboards
 * Includes tie-breaker logic and player statistics
 */

import { db } from "@/lib/db";
import {
  results,
  game,
  bracket,
  tournament,
  lobbyPlayer,
} from "@/models/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  calculatePlayerStats as calculateStatsUtil,
  sortByTieBreakers,
} from "@/utils/tie-breakers";
import type { PlayerStats, LeaderboardEntry } from "@/types/tournament";

export function calculatePlayerScores(
  results: { player_id: string; placement: number }[],
) {
  const scores: Record<string, number> = {};
  const maxScore = 8; // Assuming 8 players in a game, so the first place gets 8 points

  results.forEach((result) => {
    const { player_id, placement } = result;
    scores[player_id] = (scores[player_id] || 0) + (maxScore - placement + 1);
  });

  return scores;
}

export function calculateRanking(scores: Record<string, number>) {
  const ranking = Object.entries(scores)
    .map(([player_id, score]) => ({ player_id, score }))
    .sort((a, b) => b.score - a.score);

  return ranking;
}

/**
 * Calculate player statistics for a specific phase
 * Includes total points, placements, top counts, etc.
 */
export async function calculatePlayerStatsForPhase(
  playerId: string,
  phaseId: string,
): Promise<PlayerStats> {
  // Query games first to avoid unsupported nested `where` in relation include.
  const phaseGames = await db.query.game.findMany({
    where: eq(game.phase_id, phaseId),
    columns: {
      id: true,
    },
  });

  const phaseGameIds = phaseGames.map((g) => g.id);

  if (phaseGameIds.length === 0) {
    return {
      player_id: playerId,
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
    };
  }

  const phaseResults = await db.query.results.findMany({
    where: and(
      eq(results.player_id, playerId),
      inArray(results.game_id, phaseGameIds),
    ),
  });

  if (phaseResults.length === 0) {
    return {
      player_id: playerId,
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
    };
  }

  const placements = phaseResults.map((r) => r.placement);
  const totalPoints = phaseResults.reduce((sum, r) => sum + r.points, 0);

  return calculateStatsUtil(playerId, placements, totalPoints);
}

/**
 * Get leaderboard for a phase with tie-breakers applied
 * Optionally filter by bracket
 */
export async function getLeaderboard(
  phaseId: string,
  bracketId?: string,
): Promise<LeaderboardEntry[]> {
  // Global leaderboard for multi-bracket phases follows bracket hierarchy.
  if (!bracketId) {
    const phaseBrackets = await db.query.bracket.findMany({
      where: eq(bracket.phase_id, phaseId),
    });

    if (phaseBrackets.length > 1) {
      const bracketPriority = ["challenger", "master", "amateur", "common"];

      const orderedBrackets = [...phaseBrackets].sort((a, b) => {
        const aIndex = bracketPriority.indexOf(a.name);
        const bIndex = bracketPriority.indexOf(b.name);
        const aPriority = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
        const bPriority = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
        return aPriority - bPriority;
      });

      const groupedLeaderboard = await Promise.all(
        orderedBrackets.map(async (b) => ({
          bracketName: b.name,
          entries: await getLeaderboard(phaseId, b.id),
        })),
      );

      const merged = groupedLeaderboard.flatMap((group) => group.entries);

      return merged.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
    }
  }

  // Get all games for this phase (optionally filtered by bracket)
  const games = await db.query.game.findMany({
    where: bracketId
      ? and(eq(game.phase_id, phaseId), eq(game.bracket_id, bracketId))
      : eq(game.phase_id, phaseId),
  });

  const gameIds = games.map((g) => g.id);

  if (gameIds.length === 0) {
    return [];
  }

  // Get all results for these games
  const allResults = await db.query.results.findMany({
    where: inArray(results.game_id, gameIds),
    with: {
      player: {
        with: {
          team: true,
        },
      },
    },
  });

  // If games are created but no results are submitted yet, expose an initial ranking
  // based on game 1 seeding so the leaderboard reflects the configured phase seeding.
  if (allResults.length === 0) {
    const firstGameNumber = Math.min(...games.map((g) => g.game_number));
    const firstGameIds = games
      .filter((g) => g.game_number === firstGameNumber)
      .map((g) => g.id);

    const seededAssignments = await db.query.lobbyPlayer.findMany({
      where: inArray(lobbyPlayer.game_id, firstGameIds),
      with: {
        player: {
          with: {
            team: true,
          },
        },
      },
    });

    const bestSeedByPlayer = new Map<string, { seed: number; player: any }>();

    for (const assignment of seededAssignments) {
      if (!assignment.player_id || !assignment.player) {
        continue;
      }

      const current = bestSeedByPlayer.get(assignment.player_id);
      if (!current || assignment.seed < current.seed) {
        bestSeedByPlayer.set(assignment.player_id, {
          seed: assignment.seed,
          player: assignment.player,
        });
      }
    }

    const ordered = Array.from(bestSeedByPlayer.entries())
      .sort((a, b) => a[1].seed - b[1].seed)
      .map(([playerId, value]) => ({ playerId, ...value }));

    return ordered.map((entry, index) => ({
      rank: index + 1,
      player_id: entry.playerId,
      player_name: entry.player.name,
      riot_id: entry.player.riot_id,
      team_name: entry.player.team?.name,
      total_points: 0,
      games_played: 0,
      avg_placement: 0,
      top1_count: 0,
      top2_count: 0,
      top3_count: 0,
      top4_count: 0,
      top5_count: 0,
      top6_count: 0,
      top7_count: 0,
      top8_count: 0,
    }));
  }

  // Group results by player
  const playerResultsMap = new Map<string, typeof allResults>();
  allResults.forEach((result) => {
    if (!result.player_id) {
      return;
    }

    const existing = playerResultsMap.get(result.player_id) || [];
    playerResultsMap.set(result.player_id, [...existing, result]);
  });

  // Calculate stats for each player
  const playerStatsArray = Array.from(playerResultsMap.entries())
    .map(([playerId, playerResults]) => {
      const firstPlayer = playerResults[0]?.player;

      if (!firstPlayer) {
        return null;
      }

      const placements = playerResults.map((r) => r.placement);
      const totalPoints = playerResults.reduce((sum, r) => sum + r.points, 0);
      const stats = calculateStatsUtil(playerId, placements, totalPoints);

      return {
        stats,
        player: firstPlayer,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        stats: PlayerStats;
        player: NonNullable<(typeof allResults)[number]["player"]>;
      } => entry !== null,
    );

  // Sort by tie-breakers
  const sorted = sortByTieBreakers(
    playerStatsArray.map((p) => ({ stats: p.stats })),
  );

  // Build leaderboard
  const leaderboard: LeaderboardEntry[] = sorted.map((item, index) => {
    const playerData = playerStatsArray.find(
      (p) => p.stats.player_id === item.stats.player_id,
    );
    if (!playerData) {
      throw new Error(`Player data not found for ${item.stats.player_id}`);
    }

    return {
      rank: index + 1,
      player_id: item.stats.player_id,
      player_name: playerData.player.name,
      riot_id: playerData.player.riot_id,
      team_name: playerData.player.team?.name,
      total_points: item.stats.total_points,
      games_played: item.stats.total_games,
      avg_placement: item.stats.avg_placement,
      top1_count: item.stats.top1_count,
      top2_count: item.stats.top2_count,
      top3_count: item.stats.top3_count,
      top4_count: item.stats.top4_count,
      top5_count: item.stats.top5_count,
      top6_count: item.stats.top6_count,
      top7_count: item.stats.top7_count,
      top8_count: item.stats.top8_count,
    };
  });

  return leaderboard;
}

/**
 * Get cumulative leaderboard across multiple phases
 * Used for Phase 1+2 combined ranking before Phase 3 split
 */
export async function getCumulativeLeaderboard(
  phaseIds: string[],
): Promise<LeaderboardEntry[]> {
  // Get all results from all phases
  const allResults: any[] = [];

  for (const phaseId of phaseIds) {
    const games = await db.query.game.findMany({
      where: eq(game.phase_id, phaseId),
    });

    const gameIds = games.map((g) => g.id);

    if (gameIds.length > 0) {
      const phaseResults = await db.query.results.findMany({
        where: inArray(results.game_id, gameIds),
        with: {
          player: {
            with: {
              team: true,
            },
          },
        },
      });

      allResults.push(...phaseResults);
    }
  }

  // Group results by player
  const playerResultsMap = new Map<string, typeof allResults>();
  allResults.forEach((result) => {
    if (!result.player_id) {
      return;
    }

    const existing = playerResultsMap.get(result.player_id) || [];
    playerResultsMap.set(result.player_id, [...existing, result]);
  });

  // Calculate cumulative stats for each player
  const playerStatsArray = Array.from(playerResultsMap.entries())
    .map(([playerId, playerResults]) => {
      const firstPlayer = playerResults[0]?.player;

      if (!firstPlayer) {
        return null;
      }

      const placements = playerResults.map((r) => r.placement);
      const totalPoints = playerResults.reduce((sum, r) => sum + r.points, 0);
      const stats = calculateStatsUtil(playerId, placements, totalPoints);

      return {
        stats,
        player: firstPlayer,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        stats: PlayerStats;
        player: NonNullable<(typeof allResults)[number]["player"]>;
      } => entry !== null,
    );

  // Sort by tie-breakers
  const sorted = sortByTieBreakers(
    playerStatsArray.map((p) => ({ stats: p.stats })),
  );

  // Build leaderboard
  const leaderboard: LeaderboardEntry[] = sorted.map((item, index) => {
    const playerData = playerStatsArray.find(
      (p) => p.stats.player_id === item.stats.player_id,
    );
    if (!playerData) {
      throw new Error(`Player data not found for ${item.stats.player_id}`);
    }

    return {
      rank: index + 1,
      player_id: item.stats.player_id,
      player_name: playerData.player.name,
      riot_id: playerData.player.riot_id,
      team_name: playerData.player.team?.name,
      total_points: item.stats.total_points,
      games_played: item.stats.total_games,
      avg_placement: item.stats.avg_placement,
      top1_count: item.stats.top1_count,
      top2_count: item.stats.top2_count,
      top3_count: item.stats.top3_count,
      top4_count: item.stats.top4_count,
      top5_count: item.stats.top5_count,
      top6_count: item.stats.top6_count,
      top7_count: item.stats.top7_count,
      top8_count: item.stats.top8_count,
    };
  });

  return leaderboard;
}

/**
 * Calculate cumulative points for a player across all phases in a tournament
 */
export async function calculateCumulativePoints(
  playerId: string,
  tournamentId: string,
): Promise<number> {
  // Get all phases for this tournament
  const tournamentData = await db.query.tournament.findFirst({
    where: eq(tournament.id, tournamentId),
    with: {
      phases: true,
    },
  });

  if (!tournamentData) {
    return 0;
  }

  let cumulativePoints = 0;

  for (const phase of tournamentData.phases) {
    const stats = await calculatePlayerStatsForPhase(playerId, phase.id);
    cumulativePoints += stats.total_points;
  }

  return cumulativePoints;
}

/**
 * Get all player stats for a phase (for all players)
 */
export async function getAllPlayerStatsForPhase(
  phaseId: string,
): Promise<Map<string, PlayerStats>> {
  const leaderboard = await getLeaderboard(phaseId);
  const statsMap = new Map<string, PlayerStats>();

  for (const entry of leaderboard) {
    const stats = await calculatePlayerStatsForPhase(entry.player_id, phaseId);
    statsMap.set(entry.player_id, stats);
  }

  return statsMap;
}
