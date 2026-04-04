import { describe, it, expect } from "vitest";
import {
  tierToNumeric,
  divisionToNumeric,
  comparePlayers,
  assignSeeds,
  getPlayersBySeedRange,
} from "./seeding-algorithm";
import type { SeedingInput } from "@/types/tournament";

describe("seedingAlgorithm", () => {
  describe("tierToNumeric", () => {
    it("retourne 1 pour CHALLENGER", () => {
      expect(tierToNumeric("CHALLENGER")).toBe(1);
    });

    it("retourne 2 pour GRANDMASTER", () => {
      expect(tierToNumeric("GRANDMASTER")).toBe(2);
    });

    it("retourne 3 pour MASTER", () => {
      expect(tierToNumeric("MASTER")).toBe(3);
    });

    it("retourne 11 pour UNRANKED", () => {
      expect(tierToNumeric("UNRANKED")).toBe(11);
    });
  });

  describe("divisionToNumeric", () => {
    it("retourne 1 pour Division I", () => {
      expect(divisionToNumeric("I")).toBe(1);
    });

    it("retourne 2 pour Division II", () => {
      expect(divisionToNumeric("II")).toBe(2);
    });

    it("retourne 4 pour Division IV", () => {
      expect(divisionToNumeric("IV")).toBe(4);
    });

    it("retourne 5 pour null", () => {
      expect(divisionToNumeric(null)).toBe(5);
    });
  });

  describe("comparePlayers", () => {
    it("classe CHALLENGER avant GRANDMASTER", () => {
      const challenger: SeedingInput = {
        player_id: "1",
        name: "Player A",
        riot_id: "A#123",
        tier: "CHALLENGER",
        division: null,
        league_points: 1000,
      };
      const grandmaster: SeedingInput = {
        player_id: "2",
        name: "Player B",
        riot_id: "B#123",
        tier: "GRANDMASTER",
        division: null,
        league_points: 1000,
      };

      expect(comparePlayers(challenger, grandmaster)).toBeLessThan(0);
    });

    it("classe Division I avant Division II à tier égal, même avec LP inférieur", () => {
      const divisionI: SeedingInput = {
        player_id: "1",
        name: "Player A",
        riot_id: "A#123",
        tier: "CHALLENGER",
        division: "I",
        league_points: 100,
      };
      const divisionII: SeedingInput = {
        player_id: "2",
        name: "Player B",
        riot_id: "B#123",
        tier: "CHALLENGER",
        division: "II",
        league_points: 500,
      };

      expect(comparePlayers(divisionI, divisionII)).toBeLessThan(0);
    });

    it("classe LP plus élevé avant LP plus bas (même tier et même division)", () => {
      const higher: SeedingInput = {
        player_id: "1",
        name: "Player A",
        riot_id: "A#123",
        tier: "CHALLENGER",
        division: null,
        league_points: 1500,
      };
      const lower: SeedingInput = {
        player_id: "2",
        name: "Player B",
        riot_id: "B#123",
        tier: "CHALLENGER",
        division: null,
        league_points: 1000,
      };

      expect(comparePlayers(higher, lower)).toBeLessThan(0);
    });

    it("utilise le nom pour départager à égalité parfaite", () => {
      const playerA: SeedingInput = {
        player_id: "1",
        name: "Alice",
        riot_id: "A#123",
        tier: "MASTER",
        division: "I",
        league_points: 100,
      };
      const playerB: SeedingInput = {
        player_id: "2",
        name: "Bob",
        riot_id: "B#123",
        tier: "MASTER",
        division: "I",
        league_points: 100,
      };

      expect(comparePlayers(playerA, playerB)).toBeLessThan(0);
    });
  });

  describe("assignSeeds", () => {
    it("assigne seed 1 au meilleur joueur", () => {
      const players: SeedingInput[] = [
        {
          player_id: "1",
          name: "Best",
          riot_id: "Best#1",
          tier: "CHALLENGER",
          division: null,
          league_points: 2000,
        },
        {
          player_id: "2",
          name: "Second",
          riot_id: "Second#1",
          tier: "GRANDMASTER",
          division: null,
          league_points: 1500,
        },
      ];

      const seeded = assignSeeds(players);

      expect(seeded[0].seed).toBe(1);
      expect(seeded[0].player_id).toBe("1");
      expect(seeded[1].seed).toBe(2);
      expect(seeded[1].player_id).toBe("2");
    });

    it("trie correctement par tier, puis division dans le tier, puis LP", () => {
      const players: SeedingInput[] = [
        {
          player_id: "5",
          name: "P5",
          riot_id: "P5#1",
          tier: "DIAMOND",
          division: "I",
          league_points: 100,
        },
        {
          player_id: "1",
          name: "P1",
          riot_id: "P1#1",
          tier: "CHALLENGER",
          division: null,
          league_points: 1500,
        },
        {
          player_id: "3",
          name: "P3",
          riot_id: "P3#1",
          tier: "MASTER",
          division: "I",
          league_points: 200,
        },
        {
          player_id: "2",
          name: "P2",
          riot_id: "P2#1",
          tier: "CHALLENGER",
          division: null,
          league_points: 1000,
        },
        {
          player_id: "4",
          name: "P4",
          riot_id: "P4#1",
          tier: "MASTER",
          division: "II",
          league_points: 500,
        },
        {
          player_id: "6",
          name: "P6",
          riot_id: "P6#1",
          tier: "MASTER",
          division: "I",
          league_points: 50,
        },
      ];

      const seeded = assignSeeds(players);

      // Vérifier l'ordre attendu : tier > division > LP
      expect(seeded[0].player_id).toBe("1"); // Challenger 1500 LP
      expect(seeded[1].player_id).toBe("2"); // Challenger 1000 LP
      expect(seeded[2].player_id).toBe("3"); // Master I 200 LP
      expect(seeded[3].player_id).toBe("6"); // Master I 50 LP
      expect(seeded[4].player_id).toBe("4"); // Master II 500 LP
      expect(seeded[5].player_id).toBe("5"); // Diamond 100 LP
    });

    it("préserve tous les champs des joueurs", () => {
      const players: SeedingInput[] = [
        {
          player_id: "uuid-123",
          name: "Test Player",
          riot_id: "Test#NA1",
          tier: "MASTER",
          division: "II",
          league_points: 350,
        },
      ];

      const seeded = assignSeeds(players);

      expect(seeded[0]).toMatchObject({
        player_id: "uuid-123",
        name: "Test Player",
        riot_id: "Test#NA1",
        tier: "MASTER",
        division: "II",
        league_points: 350,
        seed: 1,
      });
    });
  });

  describe("getPlayersBySeedRange", () => {
    it("retourne les joueurs dans la plage de seeds spécifiée", () => {
      const players = assignSeeds([
        {
          player_id: "1",
          name: "P1",
          riot_id: "P1#1",
          tier: "CHALLENGER",
          division: null,
          league_points: 2000,
        },
        {
          player_id: "2",
          name: "P2",
          riot_id: "P2#1",
          tier: "CHALLENGER",
          division: null,
          league_points: 1900,
        },
        {
          player_id: "3",
          name: "P3",
          riot_id: "P3#1",
          tier: "CHALLENGER",
          division: null,
          league_points: 1800,
        },
        {
          player_id: "4",
          name: "P4",
          riot_id: "P4#1",
          tier: "CHALLENGER",
          division: null,
          league_points: 1700,
        },
      ]);

      const range = getPlayersBySeedRange(players, 2, 3);

      expect(range).toHaveLength(2);
      expect(range[0].seed).toBe(2);
      expect(range[1].seed).toBe(3);
    });

    it("retourne tableau vide si aucun joueur dans la plage", () => {
      const players = assignSeeds([
        {
          player_id: "1",
          name: "P1",
          riot_id: "P1#1",
          tier: "CHALLENGER",
          division: null,
          league_points: 2000,
        },
      ]);

      const range = getPlayersBySeedRange(players, 5, 10);

      expect(range).toHaveLength(0);
    });
  });
});
