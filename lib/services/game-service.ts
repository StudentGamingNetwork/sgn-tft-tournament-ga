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
  tournamentRegistration,
} from "@/models/schema";
import { eq, and, inArray, sql, gt } from "drizzle-orm";
import type { GameResult, StatusType, SeededPlayer } from "@/types/tournament";
import { calculatePoints } from "@/utils/tie-breakers";
import { getLeaderboard } from "@/lib/services/scoring-service";
import {
  generateSnakeDraftMatrix,
  applySeedingMatrix,
} from "@/utils/seeding-matrices";
import { syncTournamentStatusByPhaseId } from "@/lib/services/tournament-status-service";
import {
  getFinalistThresholdByBracket,
  getFinalsMaxGamesByBracket,
} from "@/lib/services/finals-rules";

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

  const phaseInfo = gameInfo.phase_id
    ? await db.query.phase.findFirst({
        where: eq(phase.id, gameInfo.phase_id),
        columns: {
          tournament_id: true,
        },
      })
    : null;

  // Validation: Check all player_ids are unique
  const playerIds = gameResults.map((r) => r.player_id);
  const uniquePlayerIds = new Set(playerIds);
  if (uniquePlayerIds.size !== gameResults.length) {
    throw new Error("All player_ids must be unique");
  }

  const assignedLobbyPlayers = await db.query.lobbyPlayer.findMany({
    where: eq(lobbyPlayer.game_id, gameId),
  });

  const expectedPlayersCount = assignedLobbyPlayers.length;

  // Validation: Check we have exactly one result per assigned player
  if (gameResults.length !== expectedPlayersCount) {
    throw new Error(
      `Expected ${expectedPlayersCount} results, got ${gameResults.length}`,
    );
  }

  // Validation: Check that all players are assigned to this game
  const assignedPlayerIds = new Set(
    assignedLobbyPlayers.map((lp) => lp.player_id),
  );
  const invalidPlayerIds = playerIds.filter((id) => !assignedPlayerIds.has(id));
  if (invalidPlayerIds.length > 0) {
    throw new Error(
      `Players not assigned to this game: ${invalidPlayerIds.join(", ")}`,
    );
  }

  const normalResults = gameResults.filter((result) => {
    const resultStatus = result.result_status ?? "normal";
    return resultStatus === "normal";
  });
  const zeroPointResults = gameResults.filter((result) => {
    const resultStatus = result.result_status ?? "normal";
    return resultStatus === "forfeit" || resultStatus === "absent";
  });
  const forfeitResults = zeroPointResults.filter(
    (result) => (result.result_status ?? "normal") === "forfeit",
  );
  const forfeitedPlayerIds = forfeitResults.map((result) => result.player_id);

  // Validation: normal placements must be in [1..normalPlayersCount]
  const normalPlayersCount = normalResults.length;
  const invalidPlacements = normalResults
    .map((r) => r.placement)
    .filter((placement) => placement < 1 || placement > normalPlayersCount);
  if (invalidPlacements.length > 0) {
    throw new Error(
      `Invalid placements: ${invalidPlacements.join(", ")}. Must be between 1 and ${normalPlayersCount}.`,
    );
  }

  // Validation: forfeit/absent must use placement 0
  const invalidZeroPlacements = zeroPointResults
    .map((r) => r.placement)
    .filter((placement) => placement !== 0);
  if (invalidZeroPlacements.length > 0) {
    throw new Error("Forfeit or absent results must use placement 0");
  }

  // Validation: normal placements are unique
  const normalPlacements = normalResults.map((r) => r.placement);
  if (new Set(normalPlacements).size !== normalPlacements.length) {
    throw new Error("All non-forfeit placements must be unique");
  }

  // Calculate points for each result (if not provided)
  const resultsWithPoints = gameResults.map((result) => ({
    game_id: gameId,
    player_id: result.player_id,
    placement: result.placement,
    points:
      (result.result_status ?? "normal") !== "normal"
        ? 0
        : (result.points ?? calculatePoints(result.placement)),
    result_status: result.result_status ?? "normal",
  }));

  // Use transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // Delete existing results (if any)
    await tx.delete(results).where(eq(results.game_id, gameId));

    // Insert new results
    await tx.insert(results).values(resultsWithPoints);

    if (phaseInfo?.tournament_id && forfeitedPlayerIds.length > 0) {
      await tx
        .update(tournamentRegistration)
        .set({ forfeited_at: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(tournamentRegistration.tournament_id, phaseInfo.tournament_id),
            inArray(tournamentRegistration.player_id, forfeitedPlayerIds),
          ),
        );
    }

    // Update game status to completed
    await tx
      .update(game)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(game.id, gameId));
  });

  // After successful submission, remove forfeited players from future games and recreate if needed
  if (forfeitedPlayerIds.length > 0 && phaseInfo?.tournament_id) {
    for (const playerId of forfeitedPlayerIds) {
      await forfeitPlayerFromTournament(phaseInfo.tournament_id, playerId);
    }
  }

  // After successful submission, check if we should create the next game
  if (gameInfo.phase_id) {
    await checkAndCreateNextGame(gameInfo.phase_id, gameInfo.game_number);
    await syncTournamentStatusByPhaseId(gameInfo.phase_id);
  }

  return resultsWithPoints;
}

async function createGamesFromSeededPlayers(params: {
  phaseId: string;
  bracketId: string;
  gameNumber: number;
  seededPlayers: SeededPlayer[];
}): Promise<number> {
  const { phaseId, bracketId, gameNumber, seededPlayers } = params;

  if (seededPlayers.length === 0) {
    return 0;
  }

  const startSeed = Math.min(...seededPlayers.map((p) => p.seed));
  const seedingMatrix = generateSnakeDraftMatrix(
    seededPlayers.length,
    startSeed,
  );
  const assignments = applySeedingMatrix(seededPlayers, seedingMatrix);

  let gamesCreated = 0;
  for (const assignment of assignments) {
    if (assignment.players.length === 0) {
      continue;
    }

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

  return gamesCreated;
}

/**
 * Reset seeding for a pending game number after previous game edits.
 * Recreates all lobbies for the same phase/bracket/game_number.
 */
export async function resetGameSeeding(gameId: string) {
  const targetGame = await db.query.game.findFirst({
    where: eq(game.id, gameId),
  });

  if (!targetGame?.phase_id || !targetGame.bracket_id) {
    throw new Error("Game not found");
  }

  if (targetGame.game_number <= 1) {
    throw new Error(
      "Le reset de seeding n'est disponible qu'a partir de la partie 2",
    );
  }

  const siblingGames = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, targetGame.phase_id),
      eq(game.bracket_id, targetGame.bracket_id),
      eq(game.game_number, targetGame.game_number),
    ),
    with: {
      results: true,
    },
  });

  if (siblingGames.length === 0) {
    throw new Error("Aucune partie a reset pour ce bracket");
  }

  const hasAnyResult = siblingGames.some((g) => g.results.length > 0);
  if (hasAnyResult) {
    throw new Error(
      "Impossible de reset le seeding: des resultats existent deja sur cette partie",
    );
  }

  const followingGames = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, targetGame.phase_id),
      eq(game.bracket_id, targetGame.bracket_id),
      gt(game.game_number, targetGame.game_number),
    ),
  });

  if (followingGames.length > 0) {
    throw new Error(
      "Impossible de reset cette partie: des parties suivantes existent deja dans ce bracket",
    );
  }

  const previousGames = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, targetGame.phase_id),
      eq(game.bracket_id, targetGame.bracket_id),
      eq(game.game_number, targetGame.game_number - 1),
    ),
    with: {
      results: true,
      bracket: true,
    },
  });

  if (previousGames.length === 0) {
    throw new Error("Partie precedente introuvable pour recalculer le seeding");
  }

  const allPreviousCompleted = previousGames.every((g) => g.results.length > 0);
  if (!allPreviousCompleted) {
    throw new Error(
      "La partie precedente doit etre completement terminee avant un reset de seeding",
    );
  }

  const bracketLeaderboard = await getLeaderboard(
    targetGame.phase_id,
    targetGame.bracket_id,
  );
  const forfeitedPlayerIds = await getForfeitedPlayerIdsForPhase(
    targetGame.phase_id,
  );
  const filteredLeaderboard = bracketLeaderboard.filter(
    (entry) => !forfeitedPlayerIds.has(entry.player_id),
  );

  if (filteredLeaderboard.length === 0) {
    throw new Error("Impossible de recalculer le seeding sans leaderboard");
  }

  const playerIds = filteredLeaderboard.map((entry) => entry.player_id);
  const playersData = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });
  const playersMap = new Map(playersData.map((p) => [p.id, p]));

  const seededPlayers: SeededPlayer[] = filteredLeaderboard.map(
    (entry, index) => {
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
    },
  );

  await db.delete(game).where(
    inArray(
      game.id,
      siblingGames.map((g) => g.id),
    ),
  );

  const gamesCreated = await createGamesFromSeededPlayers({
    phaseId: targetGame.phase_id,
    bracketId: targetGame.bracket_id,
    gameNumber: targetGame.game_number,
    seededPlayers,
  });

  return {
    reset: gamesCreated > 0,
    gamesCreated,
  };
}

async function getForfeitedPlayerIdsForPhase(
  phaseId: string,
): Promise<Set<string>> {
  const currentPhase = await db.query.phase.findFirst({
    where: eq(phase.id, phaseId),
    columns: {
      tournament_id: true,
    },
  });

  if (!currentPhase?.tournament_id) {
    return new Set<string>();
  }

  const forfeitedRegistrations = await db.query.tournamentRegistration.findMany(
    {
      where: and(
        eq(tournamentRegistration.tournament_id, currentPhase.tournament_id),
        sql`${tournamentRegistration.forfeited_at} is not null`,
      ),
      columns: {
        player_id: true,
      },
    },
  );

  return new Set(
    forfeitedRegistrations.map((registration) => registration.player_id),
  );
}

/**
 * Mark a player as forfeited in a tournament and remove them from non-completed games.
 */
export async function forfeitPlayerFromTournament(
  tournamentId: string,
  playerId: string,
) {
  const phaseRows = await db.query.phase.findMany({
    where: eq(phase.tournament_id, tournamentId),
    columns: { id: true },
  });

  const phaseIds = phaseRows.map((p) => p.id);

  const impactedPendingGroups = await db.transaction(async (tx) => {
    await tx
      .update(tournamentRegistration)
      .set({ forfeited_at: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tournamentRegistration.tournament_id, tournamentId),
          eq(tournamentRegistration.player_id, playerId),
        ),
      );

    if (phaseIds.length === 0) {
      return [] as Array<{
        phaseId: string;
        bracketId: string;
        pendingGameNumbers: number[];
        activePlayerIds: string[];
        fallbackSeedOrder: Array<{ player_id: string; seed: number }>;
      }>;
    }

    const pendingGames = await tx.query.game.findMany({
      where: and(
        inArray(game.phase_id, phaseIds),
        sql`${game.status} != 'completed'`,
      ),
      with: {
        lobbyPlayers: true,
      },
    });

    const targetGameIds = pendingGames
      .filter((g) => g.lobbyPlayers.some((lp) => lp.player_id === playerId))
      .map((g) => g.id);

    if (targetGameIds.length === 0) {
      return [] as Array<{
        phaseId: string;
        bracketId: string;
        pendingGameNumbers: number[];
        activePlayerIds: string[];
        fallbackSeedOrder: Array<{ player_id: string; seed: number }>;
      }>;
    }

    const impactedGroups = new Map<
      string,
      {
        phaseId: string;
        bracketId: string;
        pendingGameNumbers: number[];
        activePlayerIds: string[];
        fallbackSeedOrder: Array<{ player_id: string; seed: number }>;
        pendingGameIds: string[];
      }
    >();

    for (const g of pendingGames) {
      if (!g.phase_id || !g.bracket_id) continue;
      if (!g.lobbyPlayers.some((lp) => lp.player_id === playerId)) continue;

      const key = `${g.phase_id}:${g.bracket_id}`;
      if (!impactedGroups.has(key)) {
        impactedGroups.set(key, {
          phaseId: g.phase_id,
          bracketId: g.bracket_id,
          pendingGameNumbers: [],
          activePlayerIds: [],
          fallbackSeedOrder: [],
          pendingGameIds: [],
        });
      }

      impactedGroups.get(key)!.pendingGameIds.push(g.id);
    }

    for (const group of impactedGroups.values()) {
      const bracketPendingGames = pendingGames
        .filter(
          (g) =>
            g.phase_id === group.phaseId &&
            g.bracket_id === group.bracketId &&
            g.status !== "completed",
        )
        .sort((a, b) => a.game_number - b.game_number);

      const pendingNumbers = [
        ...new Set(bracketPendingGames.map((g) => g.game_number)),
      ];
      group.pendingGameNumbers = pendingNumbers;

      const firstPendingGameNumber = pendingNumbers[0];
      if (!firstPendingGameNumber) continue;

      const firstPendingGames = bracketPendingGames.filter(
        (g) => g.game_number === firstPendingGameNumber,
      );

      const activePlayers = new Set<string>();
      const seedByPlayer = new Map<string, number>();
      for (const pendingGame of firstPendingGames) {
        for (const lp of pendingGame.lobbyPlayers) {
          if (!lp.player_id || lp.player_id === playerId) {
            continue;
          }

          activePlayers.add(lp.player_id);
          const lobbySeed =
            typeof lp.seed === "number" ? lp.seed : Number.MAX_SAFE_INTEGER;
          const currentSeed = seedByPlayer.get(lp.player_id);
          if (currentSeed === undefined || lobbySeed < currentSeed) {
            seedByPlayer.set(lp.player_id, lobbySeed);
          }
        }
      }
      group.activePlayerIds = Array.from(activePlayers);
      group.fallbackSeedOrder = Array.from(seedByPlayer.entries())
        .map(([player_id, seed]) => ({ player_id, seed }))
        .sort((a, b) => a.seed - b.seed);

      const pendingIds = bracketPendingGames.map((g) => g.id);
      if (pendingIds.length > 0) {
        await tx.delete(game).where(inArray(game.id, pendingIds));
      }
    }

    return Array.from(impactedGroups.values()).map((g) => ({
      phaseId: g.phaseId,
      bracketId: g.bracketId,
      pendingGameNumbers: g.pendingGameNumbers,
      activePlayerIds: g.activePlayerIds,
      fallbackSeedOrder: g.fallbackSeedOrder,
    }));
  });

  // Recreate pending games without the forfeited player, based on current standings.
  for (const group of impactedPendingGroups) {
    if (
      group.pendingGameNumbers.length === 0 ||
      group.activePlayerIds.length === 0
    ) {
      continue;
    }

    const forfeitedPlayerIds = await getForfeitedPlayerIdsForPhase(
      group.phaseId,
    );
    const activePlayerIds = group.activePlayerIds.filter(
      (id) => !forfeitedPlayerIds.has(id),
    );

    if (activePlayerIds.length === 0) {
      continue;
    }

    const bracketLeaderboard = await getLeaderboard(
      group.phaseId,
      group.bracketId,
    );
    const filteredLeaderboard = bracketLeaderboard.filter(
      (entry) =>
        !forfeitedPlayerIds.has(entry.player_id) &&
        activePlayerIds.includes(entry.player_id),
    );

    const fallbackSeedOrder = group.fallbackSeedOrder.filter(
      (entry) => !forfeitedPlayerIds.has(entry.player_id),
    );

    const sourcePlayerIds =
      filteredLeaderboard.length > 0
        ? filteredLeaderboard.map((entry) => entry.player_id)
        : fallbackSeedOrder.map((entry) => entry.player_id);

    if (sourcePlayerIds.length === 0) {
      continue;
    }

    const playersData = await db.query.player.findMany({
      where: inArray(player.id, sourcePlayerIds),
    });

    const playersMap = new Map(playersData.map((p) => [p.id, p]));

    const seededPlayers: SeededPlayer[] =
      filteredLeaderboard.length > 0
        ? filteredLeaderboard.map((entry, index) => {
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
          })
        : fallbackSeedOrder.map((entry, index) => {
            const playerData = playersMap.get(entry.player_id);
            if (!playerData) {
              throw new Error(`Player ${entry.player_id} not found`);
            }

            return {
              player_id: entry.player_id,
              name: playerData.name,
              riot_id: playerData.riot_id,
              tier: playerData.tier!,
              division: playerData.division as any,
              league_points: playerData.league_points!,
              seed: index + 1,
            };
          });

    const seedingMatrix = generateSnakeDraftMatrix(seededPlayers.length, 1);
    const assignments = applySeedingMatrix(seededPlayers, seedingMatrix);

    for (const gameNumber of group.pendingGameNumbers) {
      for (const assignment of assignments) {
        if (assignment.players.length === 0) {
          continue;
        }

        const newGame = await createGame({
          bracket_id: group.bracketId,
          phase_id: group.phaseId,
          lobby_name: assignment.lobby_name,
          game_number: gameNumber,
        });

        const lobbyAssignments = assignment.players.map((p: any) => ({
          game_id: newGame.id,
          player_id: p.player_id,
          seed: p.seed,
        }));

        await db.insert(lobbyPlayer).values(lobbyAssignments);
      }
    }
  }
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
  const forfeitedPlayerIds = await getForfeitedPlayerIdsForPhase(phaseId);
  const top16 = leaderboard
    .filter((entry) => !forfeitedPlayerIds.has(entry.player_id))
    .slice(0, 16);

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
  const bracketName = currentGames[0]?.bracket?.name;

  if (phaseOrderIndex === 5) {
    const finalsMaxGames = getFinalsMaxGamesByBracket(bracketName);
    if (currentGameNumber >= finalsMaxGames) {
      return { created: false, gamesCreated: 0 };
    }

    const checkmateThreshold = getFinalistThresholdByBracket(bracketName);
    if (checkmateThreshold) {
      const currentGamePointsByPlayer = new Map<string, number>();
      for (const currentGame of currentGames) {
        for (const result of currentGame.results ?? []) {
          if (!result.player_id) {
            continue;
          }

          currentGamePointsByPlayer.set(
            result.player_id,
            (currentGamePointsByPlayer.get(result.player_id) ?? 0) +
              (result.points ?? calculatePoints(result.placement)),
          );
        }
      }

      const bracketLeaderboard = await getLeaderboard(phaseId, bracketId);
      const finalists = new Set(
        bracketLeaderboard
          .filter((entry) => {
            const previousPoints =
              entry.total_points -
              (currentGamePointsByPlayer.get(entry.player_id) ?? 0);

            return previousPoints >= checkmateThreshold;
          })
          .map((entry) => entry.player_id),
      );

      if (finalists.size > 0) {
        const finalistWonCurrentGame = currentGames.some((g) =>
          g.results.some(
            (result: { player_id: string | null; placement: number }) =>
              !!result.player_id &&
              result.placement === 1 &&
              finalists.has(result.player_id),
          ),
        );

        if (finalistWonCurrentGame) {
          return { created: false, gamesCreated: 0 };
        }
      }
    }
  }

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
  const forfeitedPlayerIds = await getForfeitedPlayerIdsForPhase(phaseId);
  const filteredLeaderboard = leaderboard.filter(
    (entry) => !forfeitedPlayerIds.has(entry.player_id),
  );

  if (filteredLeaderboard.length === 0) {
    throw new Error(`No leaderboard data found for bracket ${bracketId}`);
  }

  // 2. Get all players with their rank data to create SeededPlayer objects
  const playerIds = filteredLeaderboard.map((entry) => entry.player_id);
  const playersData = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });

  const playersMap = new Map(playersData.map((p) => [p.id, p]));

  // 3. Transform leaderboard to SeededPlayer[] with contiguous seeds (1..N)
  const seededPlayers: SeededPlayer[] = filteredLeaderboard.map(
    (entry, index) => {
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
    },
  );

  const gamesCreated = await createGamesFromSeededPlayers({
    phaseId,
    bracketId,
    gameNumber: nextGameNumber,
    seededPlayers,
  });

  return { created: gamesCreated > 0, gamesCreated };
}
