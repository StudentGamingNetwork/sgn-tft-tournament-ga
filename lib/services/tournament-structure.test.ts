import { describe, expect, it } from "vitest";

import {
  getTournamentStructureForPlayerCount,
  validateTournamentPlayerCount,
} from "./tournament-structure";

describe("tournament structure", () => {
  it("retourne la structure attendue pour 64 joueurs", () => {
    const structure = getTournamentStructureForPlayerCount(64);

    expect(structure.phase2.totalPlayers).toBe(32);
    expect(structure.phase3.masterPlayers).toBe(64);
    expect(structure.phase3.amateurPlayers).toBe(0);
    expect(structure.phase4.masterPlayers).toBe(32);
    expect(structure.phase4.amateurPlayers).toBe(32);
    expect(structure.phase5.challengerPlayers).toBe(8);
  });

  it("retourne la structure attendue pour 72 joueurs", () => {
    const structure = getTournamentStructureForPlayerCount(72);

    expect(structure.phase2.totalPlayers).toBe(40);
    expect(structure.phase3.masterPlayers).toBe(64);
    expect(structure.phase3.amateurPlayers).toBe(8);
    expect(structure.phase4.amateurPlayers).toBe(40);
    expect(structure.phase4.amateurQualifiedToPhase4).toBe(8);
  });

  it("refuse les tailles non supportees", () => {
    expect(() => validateTournamentPlayerCount(56)).toThrow(
      "au moins 64 joueurs",
    );
    expect(() => validateTournamentPlayerCount(66)).toThrow("multiple de 8");
    expect(() => validateTournamentPlayerCount(136)).toThrow(
      "au maximum 128 joueurs",
    );
  });
});
