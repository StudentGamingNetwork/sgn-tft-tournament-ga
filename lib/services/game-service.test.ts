import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameResult } from "@/types/tournament";
import { game as gameTable } from "@/models/schema";

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
      player: {
        findMany: vi.fn(),
      },
      tournamentRegistration: {
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/services/scoring-service", () => ({
  getLeaderboard: vi.fn(),
}));

const { db } = await import("@/lib/db");
const { getLeaderboard } = await import("@/lib/services/scoring-service");
const {
  createGame,
  updateGameStatus,
  submitGameResults,
  hasResults,
  checkAndCreateNextGame,
  forfeitPlayerFromTournament,
} = await import("./game-service");

describe("gameService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (db.insert as any).mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }));

    (db.query.tournamentRegistration.findMany as any).mockResolvedValue([]);
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
      (db.query.phase.findMany as any).mockResolvedValue([{ id: "phase-id" }]);

      // Mock transaction
      (db.transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          query: {
            game: {
              findMany: vi.fn().mockResolvedValue([]),
            },
          },
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
      ).rejects.toThrow("All non-forfeit placements must be unique");
    });

    it("accepte un lobby de 7 joueurs avec placements 1..7", async () => {
      const sevenPlayers = validPlayers.slice(0, 7);
      const sevenResults: GameResult[] = sevenPlayers.map(
        (playerId, index) => ({
          player_id: playerId,
          placement: index + 1,
        }),
      );

      (db.query.lobbyPlayer.findMany as any).mockResolvedValue(
        sevenPlayers.map((id) => ({ game_id: validGameId, player_id: id })),
      );

      const results = await submitGameResults(validGameId, sevenResults);

      expect(results).toHaveLength(7);
      expect(results[0].points).toBe(8);
      expect(results[6].points).toBe(2);
    });

    it("rejette un placement hors borne pour lobby de 7 joueurs", async () => {
      const sevenPlayers = validPlayers.slice(0, 7);
      const invalidResults: GameResult[] = sevenPlayers.map(
        (playerId, index) => ({
          player_id: playerId,
          placement: index === 6 ? 8 : index + 1,
        }),
      );

      (db.query.lobbyPlayer.findMany as any).mockResolvedValue(
        sevenPlayers.map((id) => ({ game_id: validGameId, player_id: id })),
      );

      await expect(
        submitGameResults(validGameId, invalidResults),
      ).rejects.toThrow("Must be between 1 and 7");
    });

    it("accepte les forfaits avec placement 0", async () => {
      const resultsWithForfeit: GameResult[] = [
        { player_id: "p1", placement: 1 },
        { player_id: "p2", placement: 2 },
        { player_id: "p3", placement: 3 },
        { player_id: "p4", placement: 4 },
        { player_id: "p5", placement: 5 },
        { player_id: "p6", placement: 0, result_status: "forfeit" },
        { player_id: "p7", placement: 6 },
        { player_id: "p8", placement: 7 },
      ];

      const results = await submitGameResults(validGameId, resultsWithForfeit);

      const forfeited = results.find((r) => r.player_id === "p6");
      expect(forfeited?.result_status).toBe("forfeit");
      expect(forfeited?.points).toBe(0);
    });

    it("accepte un absent avec 0 point sans forfeit", async () => {
      const resultsWithAbsent: GameResult[] = [
        { player_id: "p1", placement: 1 },
        { player_id: "p2", placement: 2 },
        { player_id: "p3", placement: 3 },
        { player_id: "p4", placement: 4 },
        { player_id: "p5", placement: 5 },
        { player_id: "p6", placement: 0, result_status: "absent" },
        { player_id: "p7", placement: 6 },
        { player_id: "p8", placement: 7 },
      ];

      const submitted = await submitGameResults(validGameId, resultsWithAbsent);

      const absent = submitted.find((r) => r.player_id === "p6");
      expect(absent?.result_status).toBe("absent");
      expect(absent?.points).toBe(0);
    });

    it("marque le joueur forfait dans l'inscription du tournoi", async () => {
      const resultsWithForfeit: GameResult[] = [
        { player_id: "p1", placement: 1 },
        { player_id: "p2", placement: 2 },
        { player_id: "p3", placement: 3 },
        { player_id: "p4", placement: 4 },
        { player_id: "p5", placement: 5 },
        { player_id: "p6", placement: 0, result_status: "forfeit" },
        { player_id: "p7", placement: 6 },
        { player_id: "p8", placement: 7 },
      ];

      const txUpdateWhere = vi.fn().mockResolvedValue([]);
      const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
      const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });

      (db.transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          query: {
            game: {
              findMany: vi.fn().mockResolvedValue([]),
            },
          },
          delete: vi
            .fn()
            .mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
          insert: vi
            .fn()
            .mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
          update: txUpdate,
        };
        return callback(tx);
      });

      await submitGameResults(validGameId, resultsWithForfeit);

      expect(txUpdate).toHaveBeenCalledTimes(3);
      expect(txUpdateWhere).toHaveBeenCalledTimes(3);
    });

    it("rejette un forfait avec placement non nul", async () => {
      const invalidForfeit: GameResult[] = [
        { player_id: "p1", placement: 1 },
        { player_id: "p2", placement: 2 },
        { player_id: "p3", placement: 3 },
        { player_id: "p4", placement: 4 },
        { player_id: "p5", placement: 5 },
        { player_id: "p6", placement: 1, result_status: "forfeit" },
        { player_id: "p7", placement: 6 },
        { player_id: "p8", placement: 7 },
      ];

      await expect(
        submitGameResults(validGameId, invalidForfeit),
      ).rejects.toThrow("Forfeit or absent results must use placement 0");
    });

    describe("forfeitPlayerFromTournament", () => {
      it("retire le joueur des parties non terminées", async () => {
        (db.query.phase.findMany as any).mockResolvedValue([
          { id: "phase-1" },
          { id: "phase-2" },
        ]);

        const transactionUpdateWhere = vi.fn().mockResolvedValue(undefined);
        const transactionUpdateSet = vi
          .fn()
          .mockReturnValue({ where: transactionUpdateWhere });
        const transactionUpdate = vi
          .fn()
          .mockReturnValue({ set: transactionUpdateSet });

        const transactionDeleteWhere = vi.fn().mockResolvedValue(undefined);
        const transactionDelete = vi
          .fn()
          .mockReturnValue({ where: transactionDeleteWhere });

        const pendingGames = [
          {
            id: "game-1",
            phase_id: "phase-1",
            bracket_id: "bracket-1",
            game_number: 2,
            lobby_name: "Lobby A",
            status: "upcoming",
            lobbyPlayers: [{ player_id: "p2" }, { player_id: "p1" }],
          },
          {
            id: "game-2",
            phase_id: "phase-1",
            bracket_id: "bracket-1",
            game_number: 2,
            lobby_name: "Lobby B",
            status: "ongoing",
            lobbyPlayers: [{ player_id: "p3" }],
          },
        ];

        vi.mocked(getLeaderboard as any).mockResolvedValue([
          {
            player_id: "p2",
            player_name: "P2",
            riot_id: "riot#2",
            rank: 1,
            total_points: 10,
          },
        ]);
        (db.query.player.findMany as any).mockResolvedValue([
          {
            id: "p2",
            tier: "GOLD",
            division: "I",
            league_points: 50,
          },
        ]);

        (db.insert as any).mockImplementation(() => ({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "new-game-1",
                phase_id: "phase-1",
                bracket_id: "bracket-1",
                lobby_name: "Lobby A",
                game_number: 2,
                status: "upcoming",
              },
            ]),
          }),
        }));

        (db.transaction as any).mockImplementation(async (callback: any) => {
          const tx = {
            query: {
              game: {
                findMany: vi.fn().mockResolvedValue(pendingGames),
              },
            },
            update: transactionUpdate,
            delete: transactionDelete,
          };

          return callback(tx);
        });

        await forfeitPlayerFromTournament("tournament-1", "p1");

        expect(transactionUpdate).toHaveBeenCalled();
        expect(transactionDelete).toHaveBeenCalled();
        expect(transactionDeleteWhere).toHaveBeenCalled();
      });

      it("recree les games non terminees impactees sans le joueur forfait", async () => {
        (db.query.phase.findMany as any).mockResolvedValue([{ id: "phase-1" }]);

        const pendingGames = [
          {
            id: "g2-a",
            phase_id: "phase-1",
            bracket_id: "bracket-1",
            game_number: 2,
            lobby_name: "Lobby A",
            status: "upcoming",
            lobbyPlayers: [
              { player_id: "p1" },
              { player_id: "p2" },
              { player_id: "p3" },
              { player_id: "p4" },
            ],
          },
          {
            id: "g2-b",
            phase_id: "phase-1",
            bracket_id: "bracket-1",
            game_number: 2,
            lobby_name: "Lobby B",
            status: "upcoming",
            lobbyPlayers: [
              { player_id: "p5" },
              { player_id: "p6" },
              { player_id: "p7" },
              { player_id: "p8" },
            ],
          },
        ];

        (db.transaction as any).mockImplementation(async (callback: any) => {
          const tx = {
            query: {
              game: {
                findMany: vi.fn().mockResolvedValue(pendingGames),
              },
            },
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          };

          return callback(tx);
        });

        vi.mocked(getLeaderboard as any).mockResolvedValue([
          {
            player_id: "p2",
            player_name: "P2",
            riot_id: "riot#2",
            rank: 1,
            total_points: 12,
          },
          {
            player_id: "p3",
            player_name: "P3",
            riot_id: "riot#3",
            rank: 2,
            total_points: 10,
          },
          {
            player_id: "p4",
            player_name: "P4",
            riot_id: "riot#4",
            rank: 3,
            total_points: 8,
          },
        ]);

        (db.query.player.findMany as any).mockResolvedValue([
          { id: "p2", tier: "GOLD", division: "I", league_points: 50 },
          { id: "p3", tier: "GOLD", division: "II", league_points: 40 },
          { id: "p4", tier: "SILVER", division: "I", league_points: 70 },
        ]);

        let createdGameCounter = 0;
        (db.insert as any).mockImplementation(() => ({
          values: vi.fn().mockImplementation((values: any) => ({
            returning: vi.fn().mockResolvedValue([
              {
                id: `new-game-${++createdGameCounter}`,
                ...(Array.isArray(values) ? {} : values),
                status: "upcoming",
              },
            ]),
          })),
        }));

        await forfeitPlayerFromTournament("tournament-1", "p1");

        expect(getLeaderboard).toHaveBeenCalledWith("phase-1", "bracket-1");
        expect(db.query.player.findMany).toHaveBeenCalled();
      });

      it("recree aussi les games en game 1 quand le leaderboard est vide", async () => {
        (db.query.phase.findMany as any).mockResolvedValue([{ id: "phase-1" }]);

        const pendingGames = [
          {
            id: "g1-a",
            phase_id: "phase-1",
            bracket_id: "bracket-1",
            game_number: 1,
            lobby_name: "Lobby A",
            status: "upcoming",
            lobbyPlayers: [
              { player_id: "p1", seed: 1 },
              { player_id: "p2", seed: 2 },
              { player_id: "p3", seed: 3 },
              { player_id: "p4", seed: 4 },
            ],
          },
        ];

        (db.transaction as any).mockImplementation(async (callback: any) => {
          const tx = {
            query: {
              game: {
                findMany: vi.fn().mockResolvedValue(pendingGames),
              },
            },
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          };

          return callback(tx);
        });

        vi.mocked(getLeaderboard as any).mockResolvedValue([]);
        (db.query.player.findMany as any).mockResolvedValue([
          {
            id: "p2",
            name: "P2",
            riot_id: "riot#2",
            tier: "GOLD",
            division: "I",
            league_points: 50,
          },
          {
            id: "p3",
            name: "P3",
            riot_id: "riot#3",
            tier: "GOLD",
            division: "II",
            league_points: 40,
          },
          {
            id: "p4",
            name: "P4",
            riot_id: "riot#4",
            tier: "SILVER",
            division: "I",
            league_points: 70,
          },
        ]);

        let createdGameCounter = 0;
        const insertValues = vi.fn().mockImplementation((values: any) => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: `new-game-${++createdGameCounter}`,
              ...(Array.isArray(values) ? {} : values),
              status: "upcoming",
            },
          ]),
        }));

        (db.insert as any).mockImplementation(() => ({
          values: insertValues,
        }));

        await forfeitPlayerFromTournament("tournament-1", "p1");

        expect(insertValues).toHaveBeenCalled();
      });
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

  describe("checkAndCreateNextGame - finals progression", () => {
    const phaseId = "phase-5";
    const bracketId = "bracket-final";
    const phase5Players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

    const currentGames = [
      {
        id: "game-2",
        phase_id: phaseId,
        bracket_id: bracketId,
        game_number: 2,
        lobby_name: "Final Lobby A",
        status: "completed",
        bracket: { name: "master" },
        results: [
          { player_id: "p1", placement: 1, points: 8 },
          { player_id: "p2", placement: 2, points: 7 },
          { player_id: "p3", placement: 3, points: 6 },
          { player_id: "p4", placement: 4, points: 5 },
          { player_id: "p5", placement: 5, points: 4 },
          { player_id: "p6", placement: 6, points: 3 },
          { player_id: "p7", placement: 7, points: 2 },
          { player_id: "p8", placement: 8, points: 1 },
        ],
      },
    ];

    const playerData = phase5Players.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      riot_id: `p${index + 1}#1`,
      tier: "GOLD",
      division: "I",
      league_points: 50,
    }));

    const setupGameCreationMocks = (
      leaderboard: Array<{
        player_id: string;
        player_name: string;
        riot_id: string;
        total_points: number;
      }>,
    ) => {
      (db.query.phase.findFirst as any).mockResolvedValue({
        id: phaseId,
        tournament_id: "tournament-1",
        total_games: 6,
        order_index: 5,
      });

      (db.query.game.findMany as any)
        .mockResolvedValueOnce(currentGames)
        .mockResolvedValueOnce([]);

      vi.mocked(getLeaderboard as any).mockResolvedValue(leaderboard);
      (db.query.player.findMany as any).mockResolvedValue(playerData);

      (db.insert as any).mockImplementation((table: any) => {
        if (table === gameTable) {
          return {
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "new-final-game",
                  bracket_id: bracketId,
                  phase_id: phaseId,
                  lobby_name: "Lobby 1",
                  game_number: 3,
                  status: "upcoming",
                },
              ]),
            }),
          };
        }

        return {
          values: vi.fn().mockResolvedValue([]),
        };
      });
    };

    it("crée la game suivante quand le vainqueur n'était pas finaliste avant la game", async () => {
      setupGameCreationMocks([
        {
          player_id: "p1",
          player_name: "Player 1",
          riot_id: "p1#1",
          total_points: 18,
        },
        {
          player_id: "p2",
          player_name: "Player 2",
          riot_id: "p2#1",
          total_points: 15,
        },
      ]);

      const result = await checkAndCreateNextGame(phaseId, 2);

      expect(result.created).toBe(true);
      expect(db.insert).toHaveBeenCalledWith(gameTable);
    });

    it("n'arrête pas la suite quand un joueur déjà finaliste gagne", async () => {
      setupGameCreationMocks([
        {
          player_id: "p1",
          player_name: "Player 1",
          riot_id: "p1#1",
          total_points: 26,
        },
        {
          player_id: "p2",
          player_name: "Player 2",
          riot_id: "p2#1",
          total_points: 15,
        },
      ]);

      const result = await checkAndCreateNextGame(phaseId, 2);

      expect(result.created).toBe(false);
      expect(db.insert).not.toHaveBeenCalledWith(gameTable);
    });
  });
});
