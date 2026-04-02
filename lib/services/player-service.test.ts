import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PlayerCSVImport } from "@/types/tournament";

// Mock de la base de données
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      player: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      team: {
        findFirst: vi.fn(),
      },
    },
  },
}));

// Import des fonctions à tester après le mock
const { db } = await import("@/lib/db");
const {
  createPlayer,
  updatePlayerRank,
  getPlayerByRiotId,
  importPlayersFromCSV,
} = await import("./player-service");

describe("playerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPlayer", () => {
    it("crée un joueur avec les données fournies", async () => {
      const mockPlayer = {
        id: "player-uuid-1",
        name: "Test Player",
        riot_id: "TestPlayer#NA1",
        tier: "MASTER",
        division: "II",
        league_points: 350,
        discord_tag: "testplayer#1234",
        team_id: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock insert chain
      const returningMock = vi.fn().mockResolvedValue([mockPlayer]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      (db.insert as any).mockReturnValue({ values: valuesMock });

      const result = await createPlayer({
        name: "Test Player",
        riot_id: "TestPlayer#NA1",
        tier: "MASTER",
        division: "II",
        league_points: 350,
        discord_tag: "testplayer#1234",
      });

      expect(result).toEqual(mockPlayer);
      expect(db.insert).toHaveBeenCalled();
    });

    it("laisse league_points à null si non fourni", async () => {
      const mockPlayer = {
        id: "player-uuid-1",
        name: "Test Player",
        riot_id: "TestPlayer#NA1",
        tier: "GOLD",
        division: "IV",
        league_points: null,
        discord_tag: null,
        team_id: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const returningMock = vi.fn().mockResolvedValue([mockPlayer]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      (db.insert as any).mockReturnValue({ values: valuesMock });

      await createPlayer({
        name: "Test Player",
        riot_id: "TestPlayer#NA1",
        tier: "GOLD",
        division: "IV",
      });

      const insertCall = valuesMock.mock.calls[0][0];
      expect(insertCall.league_points).toBeUndefined();
    });
  });

  describe("updatePlayerRank", () => {
    it("met à jour le rang d'un joueur", async () => {
      const updatedPlayer = {
        id: "player-uuid-1",
        name: "Test Player",
        riot_id: "TestPlayer#NA1",
        tier: "CHALLENGER",
        division: null,
        league_points: 1500,
        discord_tag: null,
        team_id: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const returningMock = vi.fn().mockResolvedValue([updatedPlayer]);
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      (db.update as any).mockReturnValue({ set: setMock });

      const result = await updatePlayerRank("player-uuid-1", {
        tier: "CHALLENGER",
        division: null,
        league_points: 1500,
      });

      expect(result).toEqual(updatedPlayer);
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("getPlayerByRiotId", () => {
    it("retourne un joueur par son riot ID", async () => {
      const mockPlayer = {
        id: "player-uuid-1",
        name: "Test Player",
        riot_id: "TestPlayer#NA1",
        tier: "MASTER",
        division: "I",
        league_points: 500,
        discord_tag: null,
        team_id: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.query.player.findFirst as any).mockResolvedValue(mockPlayer);

      const result = await getPlayerByRiotId("TestPlayer#NA1");

      expect(result).toEqual(mockPlayer);
      expect(db.query.player.findFirst).toHaveBeenCalled();
    });

    it("retourne undefined si le joueur n'existe pas", async () => {
      (db.query.player.findFirst as any).mockResolvedValue(undefined);

      const result = await getPlayerByRiotId("NonExistent#NA1");

      expect(result).toBeUndefined();
    });
  });

  describe("importPlayersFromCSV", () => {
    it("importe plusieurs joueurs depuis des données CSV", async () => {
      const csvData: PlayerCSVImport[] = [
        {
          name: "Player 1",
          riot_id: "Player1#NA1",
          tier: "CHALLENGER",
          division: null,
          league_points: 2000,
        },
        {
          name: "Player 2",
          riot_id: "Player2#NA1",
          tier: "GRANDMASTER",
          division: null,
          league_points: 1500,
        },
      ];

      // Mock pour les vérifications d'existence (joueurs n'existent pas)
      (db.query.player.findFirst as any).mockResolvedValue(undefined);

      // Mock pour la création de joueurs
      const returningMock = vi
        .fn()
        .mockResolvedValueOnce([{ id: "p1", ...csvData[0] }])
        .mockResolvedValueOnce([{ id: "p2", ...csvData[1] }]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      (db.insert as any).mockReturnValue({ values: valuesMock });

      const result = await importPlayersFromCSV(csvData);

      expect(result).toHaveLength(2);
      expect(db.insert).toHaveBeenCalled();
    });

    it("met à jour un joueur existant au lieu de le créer", async () => {
      const csvData: PlayerCSVImport[] = [
        {
          name: "Existing Player",
          riot_id: "Existing#NA1",
          tier: "MASTER",
          division: "I",
          league_points: 600,
        },
      ];

      const existingPlayer = {
        id: "existing-id",
        name: "Existing Player",
        riot_id: "Existing#NA1",
        tier: "DIAMOND",
        division: "II",
        league_points: 300,
        discord_tag: null,
        team_id: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock pour trouver le joueur existant
      (db.query.player.findFirst as any).mockResolvedValue(existingPlayer);

      // Mock pour l'update
      const returningMock = vi
        .fn()
        .mockResolvedValue([{ ...existingPlayer, ...csvData[0] }]);
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      (db.update as any).mockReturnValue({ set: setMock });

      const result = await importPlayersFromCSV(csvData);

      expect(result).toHaveLength(1);
      expect(db.update).toHaveBeenCalled();
      expect(result[0].tier).toBe("MASTER");
    });

    it("crée une nouvelle équipe si elle n'existe pas", async () => {
      const csvData: PlayerCSVImport[] = [
        {
          name: "Team Player",
          riot_id: "TeamPlayer#NA1",
          tier: "MASTER",
          division: "I",
          league_points: 500,
          team_name: "New Team",
        },
      ];

      // Mock pour vérifier que le joueur n'existe pas
      (db.query.player.findFirst as any).mockResolvedValue(undefined);

      // Mock pour vérifier que l'équipe n'existe pas
      (db.query.team.findFirst as any).mockResolvedValue(undefined);

      // Mock pour la création de l'équipe et du joueur
      const teamReturningMock = vi
        .fn()
        .mockResolvedValue([{ id: "team-id", name: "New Team" }]);
      const playerReturningMock = vi.fn().mockResolvedValue([
        {
          id: "player-id",
          ...csvData[0],
          team_id: "team-id",
        },
      ]);

      const teamValuesMock = vi
        .fn()
        .mockReturnValue({ returning: teamReturningMock });
      const playerValuesMock = vi
        .fn()
        .mockReturnValue({ returning: playerReturningMock });

      (db.insert as any)
        .mockReturnValueOnce({ values: teamValuesMock }) // Premier appel pour team
        .mockReturnValueOnce({ values: playerValuesMock }); // Second appel pour player

      const result = await importPlayersFromCSV(csvData);

      expect(result).toHaveLength(1);
      expect(result[0].team_id).toBe("team-id");
    });

    it("utilise le Riot ID comme fallback si name est absent", async () => {
      const csvData: PlayerCSVImport[] = [
        {
          riot_id: "NoNamePlayer#NA1",
          tier: "MASTER",
          division: "I",
          league_points: 500,
        },
      ];

      (db.query.player.findFirst as any).mockResolvedValue(undefined);

      const returningMock = vi.fn().mockResolvedValue([
        {
          id: "player-id",
          name: "NoNamePlayer",
          ...csvData[0],
        },
      ]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      (db.insert as any).mockReturnValue({ values: valuesMock });

      await importPlayersFromCSV(csvData);

      const insertCall = valuesMock.mock.calls[0][0];
      expect(insertCall.name).toBe("NoNamePlayer");
    });
  });
});
