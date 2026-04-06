import { db } from "@/lib/db";
import {
  game,
  bracket,
  lobbyPlayer,
  tournamentRegistration,
  phase,
} from "@/models/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

type ReassignmentGameContext = {
  id: string;
  phase_id: string | null;
  bracket_id: string | null;
  game_number: number;
  status: string;
  hasResults: boolean;
};

async function getGameContext(
  gameId: string,
): Promise<ReassignmentGameContext> {
  const gameData = await db.query.game.findFirst({
    where: eq(game.id, gameId),
    with: {
      results: true,
    },
  });

  if (!gameData) {
    throw new Error("Partie introuvable");
  }

  return {
    id: gameData.id,
    phase_id: gameData.phase_id,
    bracket_id: gameData.bracket_id,
    game_number: gameData.game_number,
    status: gameData.status,
    hasResults: gameData.results.length > 0,
  };
}

async function assertPlayersNotForfeited(
  phaseId: string,
  playerIds: string[],
): Promise<void> {
  const phaseData = await db.query.phase.findFirst({
    where: eq(phase.id, phaseId),
    columns: {
      tournament_id: true,
    },
  });

  if (!phaseData?.tournament_id) {
    throw new Error("Phase introuvable");
  }

  const forfeitedEntries = await db.query.tournamentRegistration.findMany({
    where: and(
      eq(tournamentRegistration.tournament_id, phaseData.tournament_id),
      inArray(tournamentRegistration.player_id, playerIds),
      sql`${tournamentRegistration.forfeited_at} is not null`,
    ),
    columns: {
      player_id: true,
    },
  });

  if (forfeitedEntries.length > 0) {
    throw new Error("Impossible de reassigner un joueur forfait");
  }
}

function assertEditablePair(
  source: ReassignmentGameContext,
  target: ReassignmentGameContext,
): void {
  if (source.id === target.id) {
    throw new Error(
      "La partie source et la partie cible doivent etre differentes",
    );
  }

  if (
    !source.phase_id ||
    !target.phase_id ||
    source.phase_id !== target.phase_id
  ) {
    throw new Error(
      "Le deplacement est autorise uniquement dans la meme phase",
    );
  }

  if (
    !source.bracket_id ||
    !target.bracket_id ||
    source.bracket_id !== target.bracket_id
  ) {
    throw new Error(
      "Le deplacement est autorise uniquement dans le meme bracket",
    );
  }

  if (source.game_number !== target.game_number) {
    throw new Error(
      "Le deplacement est autorise uniquement dans le meme numero de partie",
    );
  }

  if (source.status === "completed" || target.status === "completed") {
    throw new Error("Impossible de modifier une partie terminee");
  }

  if (source.hasResults || target.hasResults) {
    throw new Error(
      "Impossible de modifier la repartition apres saisie des resultats",
    );
  }
}

export async function movePlayerBetweenLobbies(
  sourceGameId: string,
  targetGameId: string,
  playerId: string,
): Promise<void> {
  const sourceGame = await getGameContext(sourceGameId);
  const targetGame = await getGameContext(targetGameId);
  assertEditablePair(sourceGame, targetGame);

  const sourceLobbyPlayer = await db.query.lobbyPlayer.findFirst({
    where: and(
      eq(lobbyPlayer.game_id, sourceGameId),
      eq(lobbyPlayer.player_id, playerId),
    ),
  });

  if (!sourceLobbyPlayer) {
    throw new Error("Le joueur n'est pas assigne a la partie source");
  }

  const alreadyInTarget = await db.query.lobbyPlayer.findFirst({
    where: and(
      eq(lobbyPlayer.game_id, targetGameId),
      eq(lobbyPlayer.player_id, playerId),
    ),
    columns: {
      id: true,
    },
  });

  if (alreadyInTarget) {
    throw new Error("Le joueur est deja assigne a la partie cible");
  }

  const targetLobbyPlayers = await db.query.lobbyPlayer.findMany({
    where: eq(lobbyPlayer.game_id, targetGameId),
    columns: {
      id: true,
    },
  });

  if (targetLobbyPlayers.length >= 8) {
    throw new Error("La partie cible est deja pleine (8 joueurs)");
  }

  await assertPlayersNotForfeited(sourceGame.phase_id!, [playerId]);

  await db.transaction(async (tx) => {
    await tx
      .delete(lobbyPlayer)
      .where(eq(lobbyPlayer.id, sourceLobbyPlayer.id));

    await tx.insert(lobbyPlayer).values({
      game_id: targetGameId,
      player_id: playerId,
      seed: sourceLobbyPlayer.seed,
    });
  });
}

export async function swapPlayersBetweenLobbies(
  sourceGameId: string,
  sourcePlayerId: string,
  targetGameId: string,
  targetPlayerId: string,
): Promise<void> {
  if (sourcePlayerId === targetPlayerId) {
    throw new Error("Selectionnez deux joueurs differents pour l'echange");
  }

  const sourceGame = await getGameContext(sourceGameId);
  const targetGame = await getGameContext(targetGameId);
  assertEditablePair(sourceGame, targetGame);

  const sourceLobbyPlayer = await db.query.lobbyPlayer.findFirst({
    where: and(
      eq(lobbyPlayer.game_id, sourceGameId),
      eq(lobbyPlayer.player_id, sourcePlayerId),
    ),
  });

  if (!sourceLobbyPlayer) {
    throw new Error("Le joueur source n'est pas assigne a sa partie");
  }

  const targetLobbyPlayer = await db.query.lobbyPlayer.findFirst({
    where: and(
      eq(lobbyPlayer.game_id, targetGameId),
      eq(lobbyPlayer.player_id, targetPlayerId),
    ),
  });

  if (!targetLobbyPlayer) {
    throw new Error("Le joueur cible n'est pas assigne a sa partie");
  }

  await assertPlayersNotForfeited(sourceGame.phase_id!, [
    sourcePlayerId,
    targetPlayerId,
  ]);

  await db.transaction(async (tx) => {
    await tx
      .delete(lobbyPlayer)
      .where(eq(lobbyPlayer.id, sourceLobbyPlayer.id));
    await tx
      .delete(lobbyPlayer)
      .where(eq(lobbyPlayer.id, targetLobbyPlayer.id));

    await tx.insert(lobbyPlayer).values([
      {
        game_id: targetGameId,
        player_id: sourcePlayerId,
        seed: sourceLobbyPlayer.seed,
      },
      {
        game_id: sourceGameId,
        player_id: targetPlayerId,
        seed: targetLobbyPlayer.seed,
      },
    ]);
  });
}

export async function addTournamentPlayerToLobby(
  targetGameId: string,
  playerId: string,
): Promise<void> {
  const targetGame = await getGameContext(targetGameId);

  if (!targetGame.phase_id || !targetGame.bracket_id) {
    throw new Error("Partie cible invalide");
  }

  if (targetGame.status === "completed" || targetGame.hasResults) {
    throw new Error("Impossible d'ajouter un joueur sur une partie terminee");
  }

  const bracketData = await db.query.bracket.findFirst({
    where: eq(bracket.id, targetGame.bracket_id),
    with: {
      phase: {
        columns: {
          order_index: true,
          tournament_id: true,
        },
      },
    },
  });

  if (!bracketData?.phase?.tournament_id) {
    throw new Error("Impossible de retrouver le tournoi de la partie cible");
  }

  if (bracketData.phase.order_index !== 5) {
    throw new Error("L'ajout manuel est autorise uniquement en phase finale");
  }

  const registration = await db.query.tournamentRegistration.findFirst({
    where: and(
      eq(tournamentRegistration.tournament_id, bracketData.phase.tournament_id),
      eq(tournamentRegistration.player_id, playerId),
    ),
    columns: {
      id: true,
      status: true,
      forfeited_at: true,
    },
  });

  if (!registration || registration.status === "cancelled") {
    throw new Error("Le joueur n'est pas inscrit a ce tournoi");
  }

  const targetLobbyPlayers = await db.query.lobbyPlayer.findMany({
    where: eq(lobbyPlayer.game_id, targetGameId),
    columns: {
      id: true,
      seed: true,
      player_id: true,
    },
  });

  if (targetLobbyPlayers.some((lp) => lp.player_id === playerId)) {
    throw new Error("Le joueur est deja assigne a cette partie");
  }

  if (targetLobbyPlayers.length >= 8) {
    throw new Error("La partie cible est deja pleine (8 joueurs)");
  }

  const sameRoundGames = await db.query.game.findMany({
    where: and(
      eq(game.phase_id, targetGame.phase_id),
      eq(game.bracket_id, targetGame.bracket_id),
      eq(game.game_number, targetGame.game_number),
    ),
    with: {
      lobbyPlayers: {
        columns: {
          player_id: true,
        },
      },
    },
  });

  const alreadyAssignedInRound = sameRoundGames.some((g) =>
    g.lobbyPlayers.some((lp) => lp.player_id === playerId),
  );

  if (alreadyAssignedInRound) {
    throw new Error("Le joueur est deja assigne dans un lobby de cette manche");
  }

  const nextSeed =
    targetLobbyPlayers.length === 0
      ? 1
      : Math.max(...targetLobbyPlayers.map((lp) => lp.seed)) + 1;

  await db.transaction(async (tx) => {
    await tx
      .update(tournamentRegistration)
      .set({
        forfeited_at: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(
            tournamentRegistration.tournament_id,
            bracketData.phase.tournament_id,
          ),
          eq(tournamentRegistration.player_id, playerId),
        ),
      );

    await tx.insert(lobbyPlayer).values({
      game_id: targetGameId,
      player_id: playerId,
      seed: nextSeed,
    });
  });
}
