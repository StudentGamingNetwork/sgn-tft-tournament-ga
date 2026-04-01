export interface TournamentStructure {
  totalPlayers: number;
  phase1: {
    totalPlayers: number;
  };
  phase2: {
    totalPlayers: number;
    eliminatedFromPhase1: number;
  };
  phase3: {
    masterPlayers: number;
    amateurPlayers: number;
    phase1MasterQualifiers: number;
    phase2MasterQualifiers: number;
  };
  phase4: {
    masterPlayers: number;
    amateurPlayers: number;
    masterTopCut: number;
    masterRelegatedToAmateur: number;
    amateurQualifiedToPhase4: number;
  };
  phase5: {
    challengerPlayers: number;
    masterPlayers: number;
    amateurPlayers: number;
  };
}

export function isSupportedTournamentPlayerCount(playerCount: number): boolean {
  return playerCount >= 8 && playerCount <= 128;
}

export function validateTournamentPlayerCount(playerCount: number): void {
  if (playerCount < 8) {
    throw new Error("Le tournoi doit avoir au moins 8 joueurs confirmes");
  }

  if (playerCount > 128) {
    throw new Error("Le tournoi supporte au maximum 128 joueurs confirmes");
  }
}

export function getTournamentStructureForPlayerCount(
  playerCount: number,
): TournamentStructure {
  validateTournamentPlayerCount(playerCount);

  const phase2EliminatedFromPhase1 = Math.min(32, playerCount);
  const phase2Players = Math.min(48, Math.max(playerCount - phase2EliminatedFromPhase1, 0));

  const phase3Phase1MasterQualifiers = Math.min(16, playerCount);
  const phase3Phase2MasterQualifiers = Math.min(16, phase2Players);
  const phase3MasterPlayers =
    phase3Phase1MasterQualifiers + phase3Phase2MasterQualifiers;
  const phase3AmateurPlayers = Math.min(
    32,
    Math.max(phase2Players - phase3Phase2MasterQualifiers, 0),
  );

  const phase4MasterPlayers = Math.min(16, phase3MasterPlayers);
  const phase4MasterRelegatedToAmateur = Math.min(
    16,
    Math.max(phase3MasterPlayers - phase4MasterPlayers, 0),
  );
  const phase4AmateurQualifiedToPhase4 = Math.min(16, phase3AmateurPlayers);
  const phase4AmateurPlayers =
    phase4AmateurQualifiedToPhase4 + phase4MasterRelegatedToAmateur;

  const phase5ChallengerPlayers = Math.min(8, phase4MasterPlayers);
  const phase5MasterPlayers = Math.min(
    8,
    Math.max(phase4MasterPlayers - phase5ChallengerPlayers, 0),
  );
  const phase5AmateurPlayers = Math.min(8, phase4AmateurPlayers);

  return {
    totalPlayers: playerCount,
    phase1: {
      totalPlayers: playerCount,
    },
    phase2: {
      totalPlayers: phase2Players,
      eliminatedFromPhase1: phase2EliminatedFromPhase1,
    },
    phase3: {
      masterPlayers: phase3MasterPlayers,
      amateurPlayers: phase3AmateurPlayers,
      phase1MasterQualifiers: phase3Phase1MasterQualifiers,
      phase2MasterQualifiers: phase3Phase2MasterQualifiers,
    },
    phase4: {
      masterPlayers: phase4MasterPlayers,
      amateurPlayers: phase4AmateurPlayers,
      masterTopCut: Math.min(16, phase4MasterPlayers),
      masterRelegatedToAmateur: phase4MasterRelegatedToAmateur,
      amateurQualifiedToPhase4: phase4AmateurQualifiedToPhase4,
    },
    phase5: {
      challengerPlayers: phase5ChallengerPlayers,
      masterPlayers: phase5MasterPlayers,
      amateurPlayers: phase5AmateurPlayers,
    },
  };
}

export function getTournamentStructureFromLeaderboardSize(
  leaderboardSize: number,
): TournamentStructure {
  return getTournamentStructureForPlayerCount(leaderboardSize);
}

export function getSupportedTournamentPlayerCounts(): number[] {
  return Array.from({ length: 25 }, (_, i) => 32 + i * 4);
}
