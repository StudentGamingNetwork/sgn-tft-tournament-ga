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
import {
  getCumulativeLeaderboard,
  getLeaderboard,
} from "@/lib/services/scoring-service";
import {
  generateSnakeDraftMatrix,
  generateSnakeSeedMatrix,
  applySeedingMatrix,
} from "@/utils/seeding-matrices";
import { syncTournamentStatusByPhaseId } from "@/lib/services/tournament-status-service";
import {
  getFinalistThresholdByBracket,
  getFinalsMaxGamesByBracket,
} from "@/lib/services/finals-rules";
import {
  PHASE3_MASTER_FROM_P1,
  PHASE3_MASTER_FROM_P2,
  PHASE4_MASTER_FROM_P3_MASTER,
  PHASE4_AMATEUR_FROM_P3_MASTER,
  PHASE4_AMATEUR_FROM_P3_AMATEUR,
} from "@/lib/services/phase-constants";

function shouldUseMasterSnakeSeeding(
  phaseOrderIndex?: number,
  bracketName?: string,
): boolean {
  return (
    bracketName === "master" && (phaseOrderIndex === 3 || phaseOrderIndex === 4)
  );
}

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
 * Rename a lobby for a specific game
 */
export async function renameGameLobby(gameId: string, lobbyName: string) {
  const trimmedName = lobbyName.trim();

  if (trimmedName.length < 2) {
    throw new Error("Le nom du lobby doit contenir au moins 2 caracteres");
  }

  if (trimmedName.length > 40) {
    throw new Error("Le nom du lobby ne peut pas depasser 40 caracteres");
  }

  const [updated] = await db
    .update(game)
    .set({
      lobby_name: trimmedName,
      updatedAt: new Date(),
    })
    .where(eq(game.id, gameId))
    .returning();

  if (!updated) {
    throw new Error("Lobby introuvable");
  }

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
  const nonForfeitedPlayerIds = gameResults
    .filter((result) => (result.result_status ?? "normal") !== "forfeit")
    .map((result) => result.player_id);

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

    if (phaseInfo?.tournament_id) {
      if (nonForfeitedPlayerIds.length > 0) {
        await tx
          .update(tournamentRegistration)
          .set({ forfeited_at: null, updatedAt: new Date() })
          .where(
            and(
              eq(tournamentRegistration.tournament_id, phaseInfo.tournament_id),
              inArray(tournamentRegistration.player_id, nonForfeitedPlayerIds),
            ),
          );
      }

      if (forfeitedPlayerIds.length > 0) {
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
  useSnakeSeeding?: boolean;
}): Promise<number> {
  const {
    phaseId,
    bracketId,
    gameNumber,
    seededPlayers,
    useSnakeSeeding = false,
  } = params;

  if (seededPlayers.length === 0) {
    return 0;
  }

  const assignments = buildLobbyAssignmentsFromSeededPlayers(
    seededPlayers,
    useSnakeSeeding,
  );

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

function buildLobbyAssignmentsFromSeededPlayers(
  seededPlayers: SeededPlayer[],
  useSnakeSeeding: boolean,
) {
  if (seededPlayers.length === 0) {
    return [];
  }

  const startSeed = Math.min(...seededPlayers.map((p) => p.seed));
  const seedingMatrix = useSnakeSeeding
    ? generateSnakeSeedMatrix(seededPlayers.length, startSeed)
    : generateSnakeDraftMatrix(seededPlayers.length, startSeed);

  return applySeedingMatrix(seededPlayers, seedingMatrix);
}

async function getBracketGameOnePlayerPool(
  phaseId: string,
  bracketId: string,
): Promise<Array<{ playerId: string; seed: number }>> {
  const gameOneLobbiesRaw = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, phaseId),
      eq(game.bracket_id, bracketId),
      eq(game.game_number, 1),
    ),
    with: {
      lobbyPlayers: {
        columns: {
          player_id: true,
          seed: true,
        },
      },
    },
  });
  const gameOneLobbies = Array.isArray(gameOneLobbiesRaw)
    ? gameOneLobbiesRaw
    : [];

  const bestSeedByPlayer = new Map<string, number>();

  for (const lobby of gameOneLobbies) {
    for (const assignment of lobby.lobbyPlayers ?? []) {
      if (!assignment.player_id) {
        continue;
      }

      const currentSeed = bestSeedByPlayer.get(assignment.player_id);
      if (currentSeed === undefined || assignment.seed < currentSeed) {
        bestSeedByPlayer.set(assignment.player_id, assignment.seed);
      }
    }
  }

  return Array.from(bestSeedByPlayer.entries())
    .map(([playerId, seed]) => ({ playerId, seed }))
    .sort((a, b) => a.seed - b.seed);
}

async function buildSeededPlayersFromLeaderboard(
  leaderboard: Array<{
    rank: number;
    player_id: string;
    player_name: string;
    riot_id: string;
  }>,
  preserveOriginalRank: boolean,
): Promise<SeededPlayer[]> {
  if (leaderboard.length === 0) {
    return [];
  }

  const playerIds = leaderboard.map((entry) => entry.player_id);
  const playersData = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });
  const playersMap = new Map(playersData.map((p) => [p.id, p]));

  return leaderboard.map((entry, index) => {
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
      seed: preserveOriginalRank ? entry.rank : index + 1,
    };
  });
}

async function getInitialGameOneSeeding(
  phaseId: string,
  bracketId: string,
): Promise<{
  seededPlayers: SeededPlayer[];
  useSnakeSeeding: boolean;
} | null> {
  const currentPhase = await db.query.phase.findFirst({
    where: eq(phase.id, phaseId),
    columns: {
      order_index: true,
      tournament_id: true,
    },
  });

  const currentBracket = await db.query.bracket.findFirst({
    where: eq(bracket.id, bracketId),
    columns: {
      name: true,
    },
  });

  if (!currentPhase || !currentBracket || !currentPhase.tournament_id) {
    return null;
  }

  const forfeitedPlayerIds = await getForfeitedPlayerIdsForPhase(phaseId);

  const tournamentPhases = await db.query.phase.findMany({
    where: eq(phase.tournament_id, currentPhase.tournament_id),
    columns: {
      id: true,
      order_index: true,
    },
  });

  if (currentPhase.order_index === 3) {
    const phase1 = tournamentPhases.find((p) => p.order_index === 1);
    const phase2 = tournamentPhases.find((p) => p.order_index === 2);

    if (!phase1 || !phase2) {
      return null;
    }

    const phase1Leaderboard = await getLeaderboard(phase1.id);
    const phase2RawLeaderboard = await getLeaderboard(phase2.id);
    const phase2PlayerIds = new Set(
      phase2RawLeaderboard.map((entry) => entry.player_id),
    );
    const cumulativePhase1And2 = await getCumulativeLeaderboard([
      phase1.id,
      phase2.id,
    ]);
    const phase2Leaderboard = cumulativePhase1And2.filter((entry) =>
      phase2PlayerIds.has(entry.player_id),
    );

    if (currentBracket.name === "master") {
      const phase1MasterQualifiers = phase1Leaderboard
        .slice(0, PHASE3_MASTER_FROM_P1)
        .filter((entry) => !forfeitedPlayerIds.has(entry.player_id));
      const phase2MasterQualifiers = phase2Leaderboard
        .slice(0, PHASE3_MASTER_FROM_P2)
        .filter((entry) => !forfeitedPlayerIds.has(entry.player_id));
      const ordered = [...phase1MasterQualifiers, ...phase2MasterQualifiers];

      return {
        seededPlayers: await buildSeededPlayersFromLeaderboard(ordered, false),
        useSnakeSeeding: true,
      };
    }

    if (currentBracket.name === "amateur") {
      const ordered = phase2Leaderboard
        .slice(PHASE3_MASTER_FROM_P2)
        .filter((entry) => !forfeitedPlayerIds.has(entry.player_id));

      return {
        seededPlayers: await buildSeededPlayersFromLeaderboard(ordered, false),
        useSnakeSeeding: false,
      };
    }
  }

  if (currentPhase.order_index === 4) {
    const phase3 = tournamentPhases.find((p) => p.order_index === 3);
    if (!phase3) {
      return null;
    }

    const phase3Brackets = await db.query.bracket.findMany({
      where: eq(bracket.phase_id, phase3.id),
      columns: {
        id: true,
        name: true,
      },
    });

    const phase3Master = phase3Brackets.find((b) => b.name === "master");
    const phase3Amateur = phase3Brackets.find((b) => b.name === "amateur");

    if (!phase3Master || !phase3Amateur) {
      return null;
    }

    const masterLeaderboard = await getLeaderboard(phase3.id, phase3Master.id);
    const amateurLeaderboard = await getLeaderboard(
      phase3.id,
      phase3Amateur.id,
    );

    if (currentBracket.name === "master") {
      const availableMaster = masterLeaderboard.filter(
        (entry) => !forfeitedPlayerIds.has(entry.player_id),
      );
      const ordered = availableMaster.slice(0, PHASE4_MASTER_FROM_P3_MASTER);
      return {
        seededPlayers: await buildSeededPlayersFromLeaderboard(ordered, true),
        useSnakeSeeding: true,
      };
    }

    if (currentBracket.name === "amateur") {
      const availableMaster = masterLeaderboard.filter(
        (entry) => !forfeitedPlayerIds.has(entry.player_id),
      );
      const availableAmateur = amateurLeaderboard.filter(
        (entry) => !forfeitedPlayerIds.has(entry.player_id),
      );

      const topMaster = availableMaster.slice(0, PHASE4_MASTER_FROM_P3_MASTER);
      const topAmateur = availableAmateur.slice(
        0,
        PHASE4_AMATEUR_FROM_P3_AMATEUR,
      );
      const relegatedMaster = availableMaster.slice(
        topMaster.length,
        topMaster.length + PHASE4_AMATEUR_FROM_P3_MASTER,
      );

      const ordered = [...relegatedMaster, ...topAmateur];

      return {
        seededPlayers: await buildSeededPlayersFromLeaderboard(ordered, false),
        useSnakeSeeding: false,
      };
    }
  }

  return null;
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

  const siblingGames = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, targetGame.phase_id),
      eq(game.bracket_id, targetGame.bracket_id),
      eq(game.game_number, targetGame.game_number),
    ),
    with: {
      results: true,
      lobbyPlayers: true,
    },
  });

  if (siblingGames.length === 0) {
    throw new Error("Aucune partie a reset pour ce bracket");
  }

  const isFirstGame = targetGame.game_number === 1;

  const hasAnyResult = siblingGames.some((g) => g.results.length > 0);
  if (hasAnyResult && !isFirstGame) {
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

  if (isFirstGame) {
    const initialSeeding = await getInitialGameOneSeeding(
      targetGame.phase_id,
      targetGame.bracket_id,
    );

    if (initialSeeding && initialSeeding.seededPlayers.length > 0) {
      if (!hasAnyResult) {
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
          seededPlayers: initialSeeding.seededPlayers,
          useSnakeSeeding: initialSeeding.useSnakeSeeding,
        });

        return {
          reset: gamesCreated > 0,
          gamesCreated,
        };
      }

      const completedGames = siblingGames.filter((g) => g.results.length > 0);
      const pendingGames = siblingGames.filter((g) => g.results.length === 0);

      if (pendingGames.length === 0) {
        throw new Error(
          "Toutes les lobbies de cette partie ont deja des resultats",
        );
      }

      const lockedPlayerIds = new Set(
        completedGames.flatMap((g) =>
          g.lobbyPlayers
            .map((lp) => lp.player_id)
            .filter((playerId): playerId is string => !!playerId),
        ),
      );

      const assignments = buildLobbyAssignmentsFromSeededPlayers(
        initialSeeding.seededPlayers,
        initialSeeding.useSnakeSeeding,
      );

      const pendingAssignments = assignments
        .map((assignment) => ({
          ...assignment,
          players: assignment.players.filter(
            (seededPlayer: any) => !lockedPlayerIds.has(seededPlayer.player_id),
          ),
        }))
        .filter((assignment) => assignment.players.length > 0);

      await db.delete(game).where(
        inArray(
          game.id,
          pendingGames.map((g) => g.id),
        ),
      );

      let gamesCreated = 0;
      for (const assignment of pendingAssignments) {
        const newGame = await createGame({
          bracket_id: targetGame.bracket_id,
          phase_id: targetGame.phase_id,
          lobby_name: assignment.lobby_name,
          game_number: targetGame.game_number,
        });

        const lobbyPlayerAssignments = assignment.players.map(
          (seededPlayer: any) => ({
            game_id: newGame.id,
            player_id: seededPlayer.player_id,
            seed: seededPlayer.seed,
          }),
        );

        await db.insert(lobbyPlayer).values(lobbyPlayerAssignments);
        gamesCreated++;
      }

      return {
        reset: gamesCreated > 0,
        gamesCreated,
      };
    }
  }

  const previousGames = isFirstGame
    ? []
    : await db.query.game.findMany({
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

  if (!isFirstGame && previousGames.length === 0) {
    throw new Error("Partie precedente introuvable pour recalculer le seeding");
  }

  if (!isFirstGame) {
    const allPreviousCompleted = previousGames.every(
      (g) => g.results.length > 0,
    );
    if (!allPreviousCompleted) {
      throw new Error(
        "La partie precedente doit etre completement terminee avant un reset de seeding",
      );
    }
  }

  let bracketLeaderboard = await getLeaderboard(
    targetGame.phase_id,
    targetGame.bracket_id,
  );

  // Phase 2 reset must use the same cumulative P1+P2 ordering as next-game auto reseeding.
  const currentPhase = await db.query.phase.findFirst({
    where: eq(phase.id, targetGame.phase_id),
    columns: {
      order_index: true,
      tournament_id: true,
    },
  });

  if (currentPhase?.order_index === 2 && currentPhase.tournament_id) {
    const phase1 = await db.query.phase.findFirst({
      where: and(
        eq(phase.tournament_id, currentPhase.tournament_id),
        eq(phase.order_index, 1),
      ),
    });

    if (phase1) {
      const bracketPlayerIds = new Set(
        bracketLeaderboard.map((entry) => entry.player_id),
      );
      const cumulativeLeaderboard = await getCumulativeLeaderboard([
        phase1.id,
        targetGame.phase_id,
      ]);

      bracketLeaderboard = cumulativeLeaderboard.filter((entry) =>
        bracketPlayerIds.has(entry.player_id),
      );
    }
  }

  const forfeitedPlayerIds = await getForfeitedPlayerIdsForPhase(
    targetGame.phase_id,
  );
  const filteredLeaderboard = bracketLeaderboard.filter(
    (entry) => !forfeitedPlayerIds.has(entry.player_id),
  );

  const previousGamePlayerIds = isFirstGame
    ? Array.from(
        new Set(
          siblingGames
            .flatMap((g) => g.lobbyPlayers ?? [])
            .map((lp) => lp.player_id)
            .filter((playerId): playerId is string => !!playerId),
        ),
      ).filter((playerId) => !forfeitedPlayerIds.has(playerId))
    : Array.from(
        new Set(
          previousGames
            .flatMap((g) => g.results ?? [])
            .map((result) => result.player_id)
            .filter((playerId): playerId is string => !!playerId),
        ),
      ).filter((playerId) => !forfeitedPlayerIds.has(playerId));

  if (filteredLeaderboard.length === 0 && previousGamePlayerIds.length === 0) {
    throw new Error("Impossible de recalculer le seeding sans leaderboard");
  }

  const leaderboardPlayerIdSet = new Set(
    filteredLeaderboard.map((entry) => entry.player_id),
  );
  const missingFromLeaderboardIds = previousGamePlayerIds.filter(
    (playerId) => !leaderboardPlayerIdSet.has(playerId),
  );

  const playerIds = Array.from(
    new Set([
      ...filteredLeaderboard.map((entry) => entry.player_id),
      ...missingFromLeaderboardIds,
    ]),
  );
  const playersData = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });
  const playersMap = new Map(playersData.map((p) => [p.id, p]));

  const seededPlayersFromLeaderboard: SeededPlayer[] = filteredLeaderboard.map(
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

  const seededPlayersMissingFromLeaderboard: SeededPlayer[] =
    missingFromLeaderboardIds.map((playerId, index) => {
      const playerData = playersMap.get(playerId);
      if (!playerData) {
        throw new Error(`Player ${playerId} not found`);
      }

      return {
        player_id: playerId,
        name: playerData.name,
        riot_id: playerData.riot_id,
        tier: playerData.tier!,
        division: playerData.division as any,
        league_points: playerData.league_points!,
        // If leaderboard misses a player from previous completed game, append at the end.
        seed: seededPlayersFromLeaderboard.length + index + 1,
      };
    });

  const seededPlayers: SeededPlayer[] = [
    ...seededPlayersFromLeaderboard,
    ...seededPlayersMissingFromLeaderboard,
  ];

  const currentBracketName = isFirstGame
    ? undefined
    : previousGames[0]?.bracket?.name;

  const useSnakeSeeding = shouldUseMasterSnakeSeeding(
    currentPhase?.order_index,
    currentBracketName,
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
    useSnakeSeeding,
  });

  return {
    reset: gamesCreated > 0,
    gamesCreated,
  };
}

export async function getForfeitedPlayerIdsForPhase(
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

  const impactedPendingGroups: Array<{
    phaseId: string;
    bracketId: string;
    bracketName?: string;
    pendingGameNumbers: number[];
    activePlayerIds: string[];
    fallbackSeedOrder: Array<{ player_id: string; seed: number }>;
    lobbyNamesByGameNumber: Map<number, string[]>;
  }> = await db.transaction(async (tx) => {
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
        bracketName?: string;
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
        bracket: {
          columns: {
            name: true,
          },
        },
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
        bracketName?: string;
        pendingGameNumbers: number[];
        activePlayerIds: string[];
        fallbackSeedOrder: Array<{ player_id: string; seed: number }>;
        lobbyNamesByGameNumber: Map<number, string[]>;
      }>;
    }

    const impactedGroups = new Map<
      string,
      {
        phaseId: string;
        bracketId: string;
        bracketName?: string;
        pendingGameNumbers: number[];
        activePlayerIds: string[];
        fallbackSeedOrder: Array<{ player_id: string; seed: number }>;
        pendingGameIds: string[];
        lobbyNamesByGameNumber: Map<number, string[]>;
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
          bracketName: g.bracket?.name,
          pendingGameNumbers: [],
          activePlayerIds: [],
          fallbackSeedOrder: [],
          pendingGameIds: [],
          lobbyNamesByGameNumber: new Map<number, string[]>(),
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

      group.lobbyNamesByGameNumber = new Map<number, string[]>();
      for (const pendingGame of bracketPendingGames) {
        const existingNames =
          group.lobbyNamesByGameNumber.get(pendingGame.game_number) ?? [];
        existingNames.push(pendingGame.lobby_name);
        group.lobbyNamesByGameNumber.set(
          pendingGame.game_number,
          existingNames,
        );
      }

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
      bracketName: g.bracketName,
      pendingGameNumbers: g.pendingGameNumbers,
      activePlayerIds: g.activePlayerIds,
      fallbackSeedOrder: g.fallbackSeedOrder,
      lobbyNamesByGameNumber: g.lobbyNamesByGameNumber,
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

    const groupPhase = await db.query.phase.findFirst({
      where: eq(phase.id, group.phaseId),
      columns: {
        order_index: true,
      },
    });

    const useSnakeSeeding = shouldUseMasterSnakeSeeding(
      groupPhase?.order_index,
      group.bracketName,
    );

    const seedingMatrix = useSnakeSeeding
      ? generateSnakeSeedMatrix(seededPlayers.length, 1)
      : generateSnakeDraftMatrix(seededPlayers.length, 1);
    const assignments = applySeedingMatrix(seededPlayers, seedingMatrix);

    for (const gameNumber of group.pendingGameNumbers) {
      const lobbyNames = group.lobbyNamesByGameNumber.get(gameNumber) ?? [];

      for (const [assignmentIndex, assignment] of assignments.entries()) {
        if (assignment.players.length === 0) {
          continue;
        }

        const newGame = await createGame({
          bracket_id: group.bracketId,
          phase_id: group.phaseId,
          lobby_name: lobbyNames[assignmentIndex] ?? assignment.lobby_name,
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
 * Repêche un joueur forfait sur une game donnée, lève son forfait global
 * et reconstruit les games futures du meme bracket/phase.
 */
export async function repechagePlayerFromGame(
  gameId: string,
  playerId: string,
  placement: number,
) {
  if (!Number.isInteger(placement) || placement < 1 || placement > 8) {
    throw new Error("Le placement doit etre un entier entre 1 et 8");
  }

  const targetGame = await db.query.game.findFirst({
    where: eq(game.id, gameId),
    columns: {
      id: true,
      phase_id: true,
      bracket_id: true,
      game_number: true,
    },
  });

  if (!targetGame || !targetGame.phase_id || !targetGame.bracket_id) {
    throw new Error("Game introuvable");
  }

  const phaseInfo = await db.query.phase.findFirst({
    where: eq(phase.id, targetGame.phase_id),
    columns: {
      tournament_id: true,
    },
  });

  if (!phaseInfo?.tournament_id) {
    throw new Error("Phase introuvable");
  }

  const gameResults = await db.query.results.findMany({
    where: eq(results.game_id, gameId),
    columns: {
      player_id: true,
      placement: true,
      result_status: true,
    },
  });

  const playerResult = gameResults.find(
    (result) => result.player_id === playerId,
  );

  if (!playerResult) {
    throw new Error("Joueur introuvable dans les resultats de la game");
  }

  if (playerResult.result_status !== "forfeit") {
    throw new Error("Seul un joueur marque forfait peut etre repeche");
  }

  const currentNormalResults = gameResults.filter(
    (result) => result.result_status === "normal",
  );
  const maxPlacement = Math.min(8, currentNormalResults.length + 1);

  if (placement > maxPlacement) {
    throw new Error(
      `Le placement doit etre compris entre 1 et ${maxPlacement} pour cette game`,
    );
  }

  const placementAlreadyUsed = currentNormalResults.some(
    (result) => result.placement === placement,
  );

  if (placementAlreadyUsed) {
    throw new Error("Ce placement est deja attribue a un autre joueur actif");
  }

  const tournamentId = phaseInfo.tournament_id;
  const phaseId = targetGame.phase_id;
  const bracketId = targetGame.bracket_id;
  const gameNumber = targetGame.game_number;

  await db.transaction(async (tx) => {
    await tx
      .update(results)
      .set({
        placement,
        points: calculatePoints(placement),
        result_status: "normal",
        updatedAt: new Date(),
      })
      .where(and(eq(results.game_id, gameId), eq(results.player_id, playerId)));

    await tx
      .update(tournamentRegistration)
      .set({
        forfeited_at: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tournamentRegistration.tournament_id, tournamentId),
          eq(tournamentRegistration.player_id, playerId),
        ),
      );

    const pendingGames = await tx.query.game.findMany({
      where: and(
        eq(game.phase_id, phaseId),
        eq(game.bracket_id, bracketId),
        gt(game.game_number, gameNumber),
        sql`${game.status} != 'completed'`,
      ),
      columns: {
        id: true,
      },
    });

    const pendingGameIds = pendingGames.map((g) => g.id);
    if (pendingGameIds.length > 0) {
      await tx.delete(game).where(inArray(game.id, pendingGameIds));
    }
  });

  await checkAndCreateNextGame(phaseId, gameNumber);
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
  const gameData = await db.query.game.findFirst({
    where: eq(game.id, gameId),
    with: {
      results: true,
    },
  });

  if (!gameData) {
    return null;
  }

  if (gameData.results.length > 0) {
    throw new Error("Impossible de supprimer une partie avec des resultats");
  }

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

  const seedingMatrix = generateSnakeSeedMatrix(16, 1);
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
  let leaderboard = await getLeaderboard(phaseId, bracketId);

  // Phase 2 special case: reseeding for next games must follow cumulative P1+P2 order
  // (same ordering basis used by public ranking), restricted to players still in this bracket.
  if (phaseOrderIndex === 2) {
    const currentPhase = await db.query.phase.findFirst({
      where: eq(phase.id, phaseId),
    });

    if (currentPhase?.tournament_id) {
      const phase1 = await db.query.phase.findFirst({
        where: and(
          eq(phase.tournament_id, currentPhase.tournament_id),
          eq(phase.order_index, 1),
        ),
      });

      if (phase1) {
        const bracketPlayerIds = new Set(leaderboard.map((e) => e.player_id));
        const cumulativeLeaderboard = await getCumulativeLeaderboard([
          phase1.id,
          phaseId,
        ]);

        leaderboard = cumulativeLeaderboard.filter((entry) =>
          bracketPlayerIds.has(entry.player_id),
        );
      }
    }
  }
  const forfeitedPlayerIds = await getForfeitedPlayerIdsForPhase(phaseId);
  const gameOnePool = await getBracketGameOnePlayerPool(phaseId, bracketId);
  const currentRoundPool = new Map<string, number>();
  for (const currentGame of currentGames) {
    for (const assignedPlayer of currentGame.lobbyPlayers ?? []) {
      if (!assignedPlayer.player_id) {
        continue;
      }

      const playerSeed =
        typeof assignedPlayer.seed === "number"
          ? assignedPlayer.seed
          : Number.MAX_SAFE_INTEGER;
      const existingSeed = currentRoundPool.get(assignedPlayer.player_id);
      if (existingSeed === undefined || playerSeed < existingSeed) {
        currentRoundPool.set(assignedPlayer.player_id, playerSeed);
      }
    }
  }

  const mergedPoolByPlayer = new Map<string, number>();
  for (const entry of gameOnePool) {
    mergedPoolByPlayer.set(entry.playerId, entry.seed);
  }
  for (const [playerId, seed] of currentRoundPool.entries()) {
    const existingSeed = mergedPoolByPlayer.get(playerId);
    if (existingSeed === undefined || seed < existingSeed) {
      mergedPoolByPlayer.set(playerId, seed);
    }
  }

  const activeGameOnePool = Array.from(mergedPoolByPlayer.entries())
    .map(([playerId, seed]) => ({ playerId, seed }))
    .filter((entry) => !forfeitedPlayerIds.has(entry.playerId))
    .sort((a, b) => a.seed - b.seed);

  const orderedLeaderboard = leaderboard.filter(
    (entry) =>
      !forfeitedPlayerIds.has(entry.player_id) &&
      (activeGameOnePool.length === 0 ||
        activeGameOnePool.some((p) => p.playerId === entry.player_id)),
  );

  const leaderboardPlayerIds = new Set(
    orderedLeaderboard.map((entry) => entry.player_id),
  );
  const missingPlayerIdsFromPool = activeGameOnePool
    .map((entry) => entry.playerId)
    .filter((playerId) => !leaderboardPlayerIds.has(playerId));

  const orderedPlayerIds = [
    ...orderedLeaderboard.map((entry) => entry.player_id),
    ...missingPlayerIdsFromPool,
  ];

  if (orderedPlayerIds.length === 0) {
    throw new Error(`No eligible players found for bracket ${bracketId}`);
  }

  // 2. Get all players with their rank data to create SeededPlayer objects
  const playerIds = orderedPlayerIds;
  const playersData = await db.query.player.findMany({
    where: inArray(player.id, playerIds),
  });

  const playersMap = new Map(playersData.map((p) => [p.id, p]));

  // 3. Transform leaderboard to SeededPlayer[] with contiguous seeds (1..N)
  const seededPlayers: SeededPlayer[] = orderedPlayerIds.map(
    (playerId, index) => {
      const playerData = playersMap.get(playerId);
      if (!playerData) {
        throw new Error(`Player ${playerId} not found`);
      }

      return {
        player_id: playerId,
        name: playerData.name,
        riot_id: playerData.riot_id,
        tier: playerData.tier!,
        division: playerData.division as any,
        league_points: playerData.league_points!,
        seed: index + 1,
      };
    },
  );

  const useSnakeSeeding = shouldUseMasterSnakeSeeding(
    phaseOrderIndex,
    bracketName,
  );

  const gamesCreated = await createGamesFromSeededPlayers({
    phaseId,
    bracketId,
    gameNumber: nextGameNumber,
    seededPlayers,
    useSnakeSeeding,
  });

  return { created: gamesCreated > 0, gamesCreated };
}
