import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameResult } from "@/types/tournament";

// Mock de la base de données
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    query: {
      game: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      lobbyPlayer: {
        findMany: vi.fn(),
      },
      results: {
        findMany: vi.fn(),
      },
      phase: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  },
}));

const { db } = await import("@/lib/db");
const { createGame, updateGameStatus, submitGameResults, hasResults } =
  await import("./game-service");

describe("gameService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGame", () => {
    it('crée une nouvelle game avec status "upcoming"', async () => {
      const mockGame = {
        id: "game-id",
        bracket_id: "bracket-id",
        phase_id: "phase-id",
        lobby_name: "Lobby A",
        game_number: 1,
        status: "upcoming",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const returningMock = vi.fn().mockResolvedValue([mockGame]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      (db.insert as any).mockReturnValue({ values: valuesMock });

      const result = await createGame({
        bracket_id: "bracket-id",
        phase_id: "phase-id",
        lobby_name: "Lobby A",
        game_number: 1,
      });

      expect(result).toEqual(mockGame);
      expect(result.status).toBe("upcoming");
    });
  });

  describe("updateGameStatus", () => {
    it("met à jour le status d'une game", async () => {
      const updatedGame = {
        id: "game-id",
        status: "completed",
        updatedAt: new Date(),
      };

      const returningMock = vi.fn().mockResolvedValue([updatedGame]);
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      (db.update as any).mockReturnValue({ set: setMock });

      const result = await updateGameStatus("game-id", "completed");

      expect(result.status).toBe("completed");
    });
  });

  describe("submitGameResults", () => {
    const validGameId = "game-id";
    const validPlayers = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

    const validResults: GameResult[] = [
      { player_id: "p1", placement: 1 },
      { player_id: "p2", placement: 2 },
      { player_id: "p3", placement: 3 },
      { player_id: "p4", placement: 4 },
      { player_id: "p5", placement: 5 },
      { player_id: "p6", placement: 6 },
      { player_id: "p7", placement: 7 },
      { player_id: "p8", placement: 8 },
    ];

    beforeEach(() => {
      // Mock game.findFirst pour retourner les infos du jeu
      (db.query.game.findFirst as any).mockResolvedValue({
        id: validGameId,
        phase_id: "phase-id",
        bracket_id: "bracket-id",
        game_number: 1,
        lobby_name: "Lobby A",
        status: "upcoming",
      });

      // Mock phase.findFirst pour checkAndCreateNextGame
      // On simule que c'est le dernier jeu de la phase (game_number >= total_games)
      (db.query.phase.findFirst as any).mockResolvedValue({
        id: "phase-id",
        tournament_id: "tournament-id",
        name: "Phase 1",
        total_games: 1, // Un seul jeu, donc pas de création de nouveau jeu
        order_index: 1,
      });

      // Mock lobbyPlayer query (valide que joueurs sont assignés)
      (db.query.lobbyPlayer.findMany as any).mockResolvedValue(
        validPlayers.map((id) => ({ game_id: validGameId, player_id: id })),
      );

      // Mock transaction
      (db.transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          delete: vi
            .fn()
            .mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
          insert: vi
            .fn()
            .mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
        return callback(tx);
      });
    });

    it("accepte 8 résultats valides", async () => {
      const results = await submitGameResults(validGameId, validResults);

      expect(results).toHaveLength(8);
      expect(db.transaction).toHaveBeenCalled();
    });

    it("calcule automatiquement les points si non fournis", async () => {
      const results = await submitGameResults(validGameId, validResults);

      expect(results[0].points).toBe(8); // 1ère place = 8 pts
      expect(results[1].points).toBe(7); // 2ème place = 7 pts
      expect(results[7].points).toBe(1); // 8ème place = 1 pt
    });

    it("utilise les points fournis si présents", async () => {
      const resultsWithPoints: GameResult[] = validResults.map((r) => ({
        ...r,
        points: 10, // Points custom
      }));

      const results = await submitGameResults(validGameId, resultsWithPoints);

      results.forEach((r) => {
        expect(r.points).toBe(10);
      });
    });

    it("rejette si nombre de résultats != 8", async () => {
      const invalidResults = validResults.slice(0, 7); // Seulement 7

      await expect(
        submitGameResults(validGameId, invalidResults),
      ).rejects.toThrow("Expected 8 results, got 7");
    });

    it("rejette si placement invalide (< 1 ou > 8)", async () => {
      const invalidResults = [...validResults];
      invalidResults[0] = { player_id: "p1", placement: 0 }; // Invalid

      await expect(
        submitGameResults(validGameId, invalidResults),
      ).rejects.toThrow("Invalid placements");
    });

    it("rejette si placements non uniques", async () => {
      const duplicateResults = [...validResults];
      duplicateResults[1] = { player_id: "p2", placement: 1 }; // Duplicate 1st place

      await expect(
        submitGameResults(validGameId, duplicateResults),
      ).rejects.toThrow("All placements must be unique");
    });

    it("rejette si player_ids non uniques", async () => {
      const duplicatePlayerResults = [...validResults];
      duplicatePlayerResults[1] = { player_id: "p1", placement: 2 }; // Duplicate player

      await expect(
        submitGameResults(validGameId, duplicatePlayerResults),
      ).rejects.toThrow("All player_ids must be unique");
    });

    it("rejette si un joueur n'est pas assigné au game", async () => {
      const invalidResults = [...validResults];
      invalidResults[0] = { player_id: "unknown-player", placement: 1 };

      await expect(
        submitGameResults(validGameId, invalidResults),
      ).rejects.toThrow("Players not assigned to this game");
    });
  });

  describe("hasResults", () => {
    it("retourne true si la game a des résultats", async () => {
      (db.query.results.findMany as any).mockResolvedValue([
        {
          id: "r1",
          game_id: "game-id",
          player_id: "p1",
          placement: 1,
          points: 8,
        },
      ]);

      const result = await hasResults("game-id");

      expect(result).toBe(true);
    });

    it("retourne false si la game n'a pas de résultats", async () => {
      (db.query.results.findMany as any).mockResolvedValue([]);

      const result = await hasResults("game-id");

      expect(result).toBe(false);
    });
  });
});
