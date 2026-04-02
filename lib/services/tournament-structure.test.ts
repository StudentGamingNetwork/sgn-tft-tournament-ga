import { describe, expect, it } from "vitest";

import {
  getTournamentStructureForPlayerCount,
  validateTournamentPlayerCount,
} from "./tournament-structure";

describe("tournament structure", () => {
  it("retourne la structure attendue pour 64 joueurs", () => {
    const structure = getTournamentStructureForPlayerCount(64);

    expect(structure.phase2.totalPlayers).toBe(48);
    expect(structure.phase3.masterPlayers).toBe(32);
    expect(structure.phase3.amateurPlayers).toBe(32);
    expect(structure.phase4.masterPlayers).toBe(16);
    expect(structure.phase4.amateurPlayers).toBe(32);
    expect(structure.phase5.challengerPlayers).toBe(8);
  });

  it("retourne la structure attendue pour 52 joueurs", () => {
    const structure = getTournamentStructureForPlayerCount(52);

    expect(structure.phase2.totalPlayers).toBe(36);
    expect(structure.phase3.masterPlayers).toBe(32);
    expect(structure.phase3.amateurPlayers).toBe(20);
    expect(structure.phase4.masterPlayers).toBe(16);
    expect(structure.phase4.amateurPlayers).toBe(32);
    expect(structure.phase4.amateurQualifiedToPhase4).toBe(16);
  });

  it("refuse les tailles non supportees", () => {
    expect(() => validateTournamentPlayerCount(4)).toThrow(
      "au moins 8 joueurs",
    );
    expect(() => validateTournamentPlayerCount(136)).toThrow(
      "au maximum 128 joueurs",
    );
  });
});
