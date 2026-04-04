import { describe, expect, it } from "vitest";

import {
  parsePlayersCSV,
  validateDiscordTag,
  validateLeaguePoints,
  validatePlayerData,
  validatePlayerName,
  validateRiotId,
  validateTierDivision,
} from "./validation";

describe("validation utils", () => {
  describe("validateRiotId", () => {
    it("accepte un Riot ID valide", () => {
      expect(validateRiotId("PlayerName#EUW").valid).toBe(true);
    });

    it("refuse un format sans #", () => {
      const result = validateRiotId("PlayerNameEUW");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Format invalide");
    });

    it("refuse un nom trop court", () => {
      const result = validateRiotId("AB#EUW");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("entre 3 et 16");
    });

    it("refuse un tag trop long", () => {
      const result = validateRiotId("PlayerName#EUWEST");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("entre 3 et 5");
    });
  });

  describe("validateTierDivision", () => {
    it("refuse une division pour MASTER", () => {
      const result = validateTierDivision("MASTER", "I");
      expect(result.valid).toBe(false);
    });

    it("refuse une division manquante pour GOLD", () => {
      const result = validateTierDivision("GOLD", null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("division est requise");
    });

    it("accepte GOLD + II", () => {
      const result = validateTierDivision("GOLD", "II");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateLeaguePoints", () => {
    it("refuse des LP negatifs", () => {
      const result = validateLeaguePoints(-1, "GOLD");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("négatifs");
    });

    it("refuse >100 LP pour un tier non high elo", () => {
      const result = validateLeaguePoints(101, "PLATINUM");
      expect(result.valid).toBe(false);
    });

    it("accepte 1500 LP pour CHALLENGER", () => {
      const result = validateLeaguePoints(1500, "CHALLENGER");
      expect(result.valid).toBe(true);
    });
  });

  describe("validatePlayerName and validateDiscordTag", () => {
    it("accepte un nom joueur valide", () => {
      expect(validatePlayerName("MonJoueur").valid).toBe(true);
    });

    it("accepte Discord vide (optionnel)", () => {
      expect(validateDiscordTag("").valid).toBe(true);
    });

    it("refuse un Discord au format invalide", () => {
      const result = validateDiscordTag("a");
      expect(result.valid).toBe(false);
    });
  });

  describe("validatePlayerData", () => {
    it("retourne valid true pour des données cohérentes", () => {
      const result = validatePlayerData({
        name: "Player One",
        riot_id: "PlayerOne#EUW",
        tier: "GOLD",
        division: "I",
        league_points: 25,
        discord_tag: "player.one",
      });

      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it("retourne les erreurs attendues pour données invalides", () => {
      const result = validatePlayerData({
        name: "A",
        riot_id: "bad-format",
        tier: "MASTER",
        division: "I",
        league_points: -2,
        discord_tag: "#",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.name).toBeDefined();
      expect(result.errors.riot_id).toBeDefined();
      expect(result.errors.division).toBeDefined();
      expect(result.errors.league_points).toBeDefined();
      expect(result.errors.discord_tag).toBeDefined();
    });

    it("accepte des données sans tier/division/lp", () => {
      const result = validatePlayerData({
        name: "Player One",
        riot_id: "PlayerOne#EUW",
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("parsePlayersCSV", () => {
    it("parse un CSV valide", () => {
      const csv = [
        "name,riot_id,tier,division,league_points,discord_tag,team_name",
        "Player One,PlayerOne#EUW,GOLD,I,50,player.one,Team A",
        "Player Two,PlayerTwo#EUW,MASTER,,500,,",
      ].join("\n");

      const result = parsePlayersCSV(csv);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].team_name).toBe("Team A");
      expect(result.data?.[1].division).toBe(null);
    });

    it("retourne une erreur si colonnes requises absentes", () => {
      const csv = ["division,league_points", "I,50"].join("\n");
      const result = parsePlayersCSV(csv);

      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain("Colonnes manquantes");
      expect(result.errors?.[0].message).toContain("name");
      expect(result.errors?.[0].message).toContain("riot_id");
    });

    it("retourne des erreurs de ligne pour un CSV invalide", () => {
      const csv = [
        "name,riot_id,tier,division,league_points",
        "P,bad-format,GOLD,,101",
      ].join("\n");

      const result = parsePlayersCSV(csv);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "name")).toBe(true);
      expect(result.errors?.some((e) => e.field === "riot_id")).toBe(true);
      expect(result.errors?.some((e) => e.field === "division")).toBe(true);
      expect(result.errors?.some((e) => e.field === "league_points")).toBe(
        true,
      );
    });

    it("accepte un CSV sans tier/division/league_points", () => {
      const csv = [
        "name,riot_id,discord_tag",
        "Player One,PlayerOne#EUW,player.one",
      ].join("\n");

      const result = parsePlayersCSV(csv);

      expect(result.success).toBe(true);
      expect(result.data?.[0].tier).toBeUndefined();
      expect(result.data?.[0].league_points).toBeUndefined();
    });

    it("refuse un CSV sans colonne name", () => {
      const csv = ["riot_id,discord_tag", "PlayerOne#EUW,player.one"].join(
        "\n",
      );

      const result = parsePlayersCSV(csv);

      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain("name");
    });
  });
});
