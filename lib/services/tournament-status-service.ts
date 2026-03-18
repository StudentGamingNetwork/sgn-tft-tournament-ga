import { db } from "@/lib/db";
import { tournament, phase } from "@/models/schema";
import { eq } from "drizzle-orm";

function calculateExpectedGamesForBracket(
  phaseOrderIndex: number,
  totalGames: number,
  bracketName: string,
  game1LobbyCount: number,
): number {
  if (game1LobbyCount === 0 || totalGames === 0) {
    return 0;
  }

  // Phase 4 master format:
  // - games 1-2 with full lobbies
  // - games 3+ with top16 (half the lobbies)
  if (phaseOrderIndex === 4 && bracketName === "master" && totalGames > 2) {
    const reducedLobbyCount = Math.floor(game1LobbyCount / 2);
    return game1LobbyCount * 2 + reducedLobbyCount * (totalGames - 2);
  }

  return game1LobbyCount * totalGames;
}

type TournamentStatus = "upcoming" | "ongoing" | "completed";

export async function syncTournamentStatusByTournamentId(
  tournamentId: string,
): Promise<TournamentStatus | null> {
  const phases = await db.query.phase.findMany({
    where: eq(phase.tournament_id, tournamentId),
    orderBy: (phase, { asc }) => [asc(phase.order_index)],
    with: {
      brackets: {
        with: {
          games: {
            with: {
              results: true,
            },
          },
        },
      },
    },
  });

  const safePhases = phases || [];

  const phasesWithSafeRelations = safePhases.map((currentPhase) => ({
    ...currentPhase,
    brackets: (currentPhase.brackets || []).map((currentBracket) => ({
      ...currentBracket,
      games: (currentBracket.games || []).map((currentGame) => ({
        ...currentGame,
        results: currentGame.results || [],
      })),
    })),
  }));

  const hasStartedPhase = phasesWithSafeRelations.some((currentPhase) =>
    currentPhase.brackets.some(
      (currentBracket) => currentBracket.games.length > 0,
    ),
  );

  const phase5 = phasesWithSafeRelations.find(
    (currentPhase) => currentPhase.order_index === 5,
  );

  const phase5GamesWithResults = phase5
    ? phase5.brackets.reduce(
        (sum, currentBracket) =>
          sum +
          currentBracket.games.filter(
            (currentGame) => currentGame.results.length > 0,
          ).length,
        0,
      )
    : 0;

  const phase5TotalGamesExpected = phase5
    ? phase5.brackets.reduce((sum, currentBracket) => {
        const game1LobbyCount = currentBracket.games.filter(
          (currentGame) => currentGame.game_number === 1,
        ).length;

        return (
          sum +
          calculateExpectedGamesForBracket(
            phase5.order_index,
            phase5.total_games,
            currentBracket.name,
            game1LobbyCount,
          )
        );
      }, 0)
    : 0;

  const isCompleted =
    !!phase5 &&
    phase5TotalGamesExpected > 0 &&
    phase5GamesWithResults >= phase5TotalGamesExpected;

  let expectedStatus: TournamentStatus = "upcoming";
  if (isCompleted) {
    expectedStatus = "completed";
  } else if (hasStartedPhase) {
    expectedStatus = "ongoing";
  }

  const currentTournament = await db.query.tournament?.findFirst?.({
    where: eq(tournament.id, tournamentId),
  });

  if (!currentTournament) {
    return expectedStatus;
  }

  if (currentTournament.status !== expectedStatus) {
    await db
      .update(tournament)
      .set({
        status: expectedStatus,
        updatedAt: new Date(),
      })
      .where(eq(tournament.id, tournamentId));
  }

  return expectedStatus;
}

export async function syncTournamentStatusByPhaseId(
  phaseId: string,
): Promise<TournamentStatus | null> {
  const phaseData = await db.query.phase.findFirst({
    where: eq(phase.id, phaseId),
  });

  if (!phaseData?.tournament_id) {
    return null;
  }

  return await syncTournamentStatusByTournamentId(phaseData.tournament_id);
}
