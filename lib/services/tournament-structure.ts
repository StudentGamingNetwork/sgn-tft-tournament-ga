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

const SUPPORTED_PLAYER_COUNTS = [
  64, 72, 80, 88, 96, 104, 112, 120, 128,
] as const;

type SupportedPlayerCount = (typeof SUPPORTED_PLAYER_COUNTS)[number];

const TOURNAMENT_STRUCTURE_TABLE: Record<
  SupportedPlayerCount,
  TournamentStructure
> = {
  64: {
    totalPlayers: 64,
    phase1: { totalPlayers: 64 },
    phase2: { totalPlayers: 32, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 0,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 32,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 0,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
  72: {
    totalPlayers: 72,
    phase1: { totalPlayers: 72 },
    phase2: { totalPlayers: 40, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 8,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 40,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 8,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
  80: {
    totalPlayers: 80,
    phase1: { totalPlayers: 80 },
    phase2: { totalPlayers: 48, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 16,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 48,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 16,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
  88: {
    totalPlayers: 88,
    phase1: { totalPlayers: 88 },
    phase2: { totalPlayers: 56, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 24,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 56,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 24,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
  96: {
    totalPlayers: 96,
    phase1: { totalPlayers: 96 },
    phase2: { totalPlayers: 64, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 32,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 64,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 32,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
  104: {
    totalPlayers: 104,
    phase1: { totalPlayers: 104 },
    phase2: { totalPlayers: 72, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 40,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 64,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 32,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
  112: {
    totalPlayers: 112,
    phase1: { totalPlayers: 112 },
    phase2: { totalPlayers: 80, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 48,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 64,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 32,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
  120: {
    totalPlayers: 120,
    phase1: { totalPlayers: 120 },
    phase2: { totalPlayers: 88, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 56,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 64,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 32,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
  128: {
    totalPlayers: 128,
    phase1: { totalPlayers: 128 },
    phase2: { totalPlayers: 96, eliminatedFromPhase1: 32 },
    phase3: {
      masterPlayers: 64,
      amateurPlayers: 64,
      phase1MasterQualifiers: 32,
      phase2MasterQualifiers: 32,
    },
    phase4: {
      masterPlayers: 32,
      amateurPlayers: 64,
      masterTopCut: 16,
      masterRelegatedToAmateur: 32,
      amateurQualifiedToPhase4: 32,
    },
    phase5: { challengerPlayers: 8, masterPlayers: 8, amateurPlayers: 8 },
  },
};

export function isSupportedTournamentPlayerCount(playerCount: number): boolean {
  return SUPPORTED_PLAYER_COUNTS.includes(playerCount as SupportedPlayerCount);
}

export function validateTournamentPlayerCount(playerCount: number): void {
  if (playerCount < 64) {
    throw new Error("Le tournoi doit avoir au moins 64 joueurs confirmes");
  }

  if (playerCount > 128) {
    throw new Error("Le tournoi supporte au maximum 128 joueurs confirmes");
  }

  if (playerCount % 8 !== 0) {
    throw new Error("Le tournoi doit avoir un nombre de joueurs multiple de 8");
  }

  if (!isSupportedTournamentPlayerCount(playerCount)) {
    throw new Error(
      `Aucune structure de tournoi n'est definie pour ${playerCount} joueurs`,
    );
  }
}

export function getTournamentStructureForPlayerCount(
  playerCount: number,
): TournamentStructure {
  validateTournamentPlayerCount(playerCount);
  return TOURNAMENT_STRUCTURE_TABLE[playerCount as SupportedPlayerCount];
}

export function getTournamentStructureFromLeaderboardSize(
  leaderboardSize: number,
): TournamentStructure {
  return getTournamentStructureForPlayerCount(leaderboardSize);
}

export function getSupportedTournamentPlayerCounts(): number[] {
  return [...SUPPORTED_PLAYER_COUNTS];
}
