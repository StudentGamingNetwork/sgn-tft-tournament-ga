/**
 * Tests pour les workflows de transition entre phases
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createStandardTournament,
  startPhase2FromPhase1,
  startPhase3FromPhase1And2,
  startPhase4FromPhase3,
  startPhase5FromPhase4,
} from "./tournament-service";

// Mock des dépendances
vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(),
    query: {
      tournament: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      phase: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      bracket: {
        findMany: vi.fn(),
      },
      game: {
        findMany: vi.fn(),
      },
      results: {
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  },
}));

vi.mock("./seeding-service", () => ({
  seedPlayersForPhase: vi.fn(),
  seedPlayersBasedOnLeaderboard: vi.fn(),
  assignPlayersToLobbies: vi.fn(),
  seedAndCreateFirstGame: vi.fn(),
  seedAndCreateFirstGameFromLeaderboard: vi.fn(),
}));

vi.mock("./scoring-service", () => ({
  getLeaderboard: vi.fn(),
  getCumulativeLeaderboard: vi.fn(),
}));

describe("Tournament Workflow", () => {
  describe("createStandardTournament", () => {
    it("should create tournament with correct phase structure", async () => {
      const mockDb = await import("@/lib/db");

      // Mock transaction
      mockDb.db.transaction = vi.fn(async (callback) => {
        const mockTx = {
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() => [
                { id: "tournament-1", name: "Test Tournament", year: "2026" },
              ]),
            })),
          })),
        };
        return await callback(mockTx);
      });

      const result = await createStandardTournament("Test Tournament", "2026");

      expect(result).toBeDefined();
      expect(result.name).toBe("Test Tournament");
      expect(mockDb.db.transaction).toHaveBeenCalled();
    });
  });

  describe("Phase Transitions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("Phase 1 → Phase 2", () => {
      it("should eliminate top 32 and keep bottom 96", async () => {
        const { getLeaderboard } = await import("./scoring-service");

        // Mock 128 joueurs en Phase 1
        const mockLeaderboard = Array.from({ length: 128 }, (_, i) => ({
          rank: i + 1,
          player_id: `player-${i + 1}`,
          player_name: `Player ${i + 1}`,
          total_points: 100 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        vi.mocked(getLeaderboard).mockResolvedValue(mockLeaderboard);

        const mockDb = await import("@/lib/db");
        mockDb.db.query.bracket.findMany = vi
          .fn()
          .mockResolvedValue([
            { id: "bracket-1", phase_id: "phase-2", name: "common" },
          ]);

        const { seedAndCreateFirstGameFromLeaderboard } = await import(
          "./seeding-service"
        );
        vi.mocked(seedAndCreateFirstGameFromLeaderboard).mockResolvedValue({
          games: Array(12).fill({ id: "game-1" }),
          seededPlayers: [],
        });

        const result = await startPhase2FromPhase1("phase-1", "phase-2");

        // Vérifications
        expect(result.eliminatedPlayers).toHaveLength(32);
        expect(result.qualifiedPlayers).toHaveLength(96);
        expect(result.eliminatedPlayers[0].rank).toBe(1); // Top 1 éliminé
        expect(result.qualifiedPlayers[0].rank).toBe(33); // Rank 33 qualifié
      });

      it("should support 64 players and keep only 32 in phase 2", async () => {
        const { getLeaderboard } = await import("./scoring-service");

        const mockLeaderboard = Array.from({ length: 64 }, (_, i) => ({
          rank: i + 1,
          player_id: `player-${i + 1}`,
          player_name: `Player ${i + 1}`,
          total_points: 100 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        vi.mocked(getLeaderboard).mockResolvedValue(mockLeaderboard);

        const mockDb = await import("@/lib/db");
        mockDb.db.query.bracket.findMany = vi
          .fn()
          .mockResolvedValue([
            { id: "bracket-1", phase_id: "phase-2", name: "common" },
          ]);

        const { seedAndCreateFirstGameFromLeaderboard } = await import(
          "./seeding-service"
        );
        vi.mocked(seedAndCreateFirstGameFromLeaderboard).mockResolvedValue({
          games: Array(4).fill({ id: "game-1" }),
          seededPlayers: [],
        });

        const result = await startPhase2FromPhase1("phase-1", "phase-2");

        expect(result.eliminatedPlayers).toHaveLength(32);
        expect(result.qualifiedPlayers).toHaveLength(32);
        expect(result.qualifiedPlayers[0].rank).toBe(33);
      });
    });

    describe("Phase 2 → Phase 3", () => {
      it("should split into Master (top32 P1 + top32 P2) and Amateur (bottom64 P2)", async () => {
        const { getLeaderboard } = await import("./scoring-service");

        // Mock Phase 1 leaderboard (128 joueurs)
        const mockP1Leaderboard = Array.from({ length: 128 }, (_, i) => ({
          rank: i + 1,
          player_id: `p1-player-${i + 1}`,
          player_name: `P1 Player ${i + 1}`,
          total_points: 200 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        // Mock Phase 2 leaderboard (96 joueurs)
        const mockP2Leaderboard = Array.from({ length: 96 }, (_, i) => ({
          rank: i + 1,
          player_id: `p2-player-${i + 1}`,
          player_name: `P2 Player ${i + 1}`,
          total_points: 150 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        vi.mocked(getLeaderboard).mockImplementation(
          async (phaseId: string) => {
            if (phaseId === "phase-1") return mockP1Leaderboard;
            if (phaseId === "phase-2") return mockP2Leaderboard;
            return [];
          },
        );

        const mockDb = await import("@/lib/db");
        mockDb.db.query.bracket.findMany = vi.fn().mockResolvedValue([
          { id: "bracket-master", phase_id: "phase-3", name: "master" },
          { id: "bracket-amateur", phase_id: "phase-3", name: "amateur" },
        ]);

        const {
          seedPlayersForPhase,
          seedPlayersBasedOnLeaderboard,
          assignPlayersToLobbies,
        } = await import("./seeding-service");
        vi.mocked(seedPlayersForPhase).mockResolvedValue(
          Array.from({ length: 64 }, (_, i) => ({
            player_id: `a-${i}`,
          })) as any,
        );
        vi.mocked(seedPlayersBasedOnLeaderboard).mockResolvedValue(
          Array.from({ length: 32 }, (_, i) => ({
            player_id: `m-${i}`,
          })) as any,
        );
        vi.mocked(assignPlayersToLobbies).mockResolvedValue([
          { game: { id: "game-1" }, lobbyPlayers: [] },
        ]);

        const result = await startPhase3FromPhase1And2(
          "phase-1",
          "phase-2",
          "phase-3",
          8,
        );

        // Vérifications
        expect(result.masterBracket.players).toBeDefined();
        expect(result.amateurBracket.players).toBeDefined();
        expect(seedPlayersForPhase).toHaveBeenCalledTimes(2);

        // Master doit avoir 64 IDs (32 de P1 + 32 de P2)
        const masterCall = vi
          .mocked(seedPlayersForPhase)
          .mock.calls.find((call) => call[1].length === 64);
        expect(masterCall).toBeDefined();

        // Amateur doit avoir 64 IDs (ranks 33-96 de P2)
        const amateurCall = vi
          .mocked(seedPlayersForPhase)
          .mock.calls.find(
            (call) => call[1].length === 64 && call[1][0].startsWith("p2-"),
          );
        expect(amateurCall).toBeDefined();
      });

      it("should fill master and leave amateur empty for 64 players", async () => {
        const { getLeaderboard } = await import("./scoring-service");

        const mockP1Leaderboard = Array.from({ length: 64 }, (_, i) => ({
          rank: i + 1,
          player_id: `p1-player-${i + 1}`,
          player_name: `P1 Player ${i + 1}`,
          total_points: 200 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        const mockP2Leaderboard = Array.from({ length: 32 }, (_, i) => ({
          rank: i + 1,
          player_id: `p2-player-${i + 1}`,
          player_name: `P2 Player ${i + 1}`,
          total_points: 150 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 33,
        }));

        vi.mocked(getLeaderboard).mockImplementation(
          async (phaseId: string) => {
            if (phaseId === "phase-1") return mockP1Leaderboard;
            if (phaseId === "phase-2") return mockP2Leaderboard;
            return [];
          },
        );

        const mockDb = await import("@/lib/db");
        mockDb.db.query.bracket.findMany = vi.fn().mockResolvedValue([
          { id: "bracket-master", phase_id: "phase-3", name: "master" },
          { id: "bracket-amateur", phase_id: "phase-3", name: "amateur" },
        ]);

        const { seedPlayersForPhase, assignPlayersToLobbies } = await import(
          "./seeding-service"
        );
        vi.mocked(seedPlayersForPhase).mockResolvedValue([]);
        vi.mocked(assignPlayersToLobbies).mockResolvedValue([
          { game: { id: "game-1" }, lobbyPlayers: [] },
        ]);

        const result = await startPhase3FromPhase1And2(
          "phase-1",
          "phase-2",
          "phase-3",
        );

        expect(seedPlayersForPhase).toHaveBeenCalledTimes(1);
        expect(vi.mocked(seedPlayersForPhase).mock.calls[0]?.[1]).toHaveLength(
          64,
        );
        expect(result.amateurBracket.players).toHaveLength(0);
      });
    });

    describe("Phase 3 → Phase 4", () => {
      it("should promote top 32 Master, relegate bottom 32 Master to Amateur", async () => {
        const { getLeaderboard } = await import("./scoring-service");

        const mockP3MasterLeaderboard = Array.from({ length: 64 }, (_, i) => ({
          rank: i + 1,
          player_id: `p3-master-${i + 1}`,
          player_name: `P3 Master ${i + 1}`,
          total_points: 300 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        const mockP3AmateurLeaderboard = Array.from({ length: 64 }, (_, i) => ({
          rank: i + 1,
          player_id: `p3-amateur-${i + 1}`,
          player_name: `P3 Amateur ${i + 1}`,
          total_points: 200 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        vi.mocked(getLeaderboard).mockImplementation(
          async (phaseId, bracketId) => {
            if (bracketId === "bracket-p3-master")
              return mockP3MasterLeaderboard;
            if (bracketId === "bracket-p3-amateur")
              return mockP3AmateurLeaderboard;
            return [];
          },
        );

        const mockDb = await import("@/lib/db");
        let callCount = 0;
        mockDb.db.query.bracket.findMany = vi
          .fn()
          .mockImplementation(async () => {
            callCount++;
            // Premier appel : brackets de Phase 3
            if (callCount === 1) {
              return [
                {
                  id: "bracket-p3-master",
                  phase_id: "phase-3",
                  name: "master",
                },
                {
                  id: "bracket-p3-amateur",
                  phase_id: "phase-3",
                  name: "amateur",
                },
              ];
            }
            // Deuxième appel : brackets de Phase 4
            if (callCount === 2) {
              return [
                {
                  id: "bracket-p4-master",
                  phase_id: "phase-4",
                  name: "master",
                },
                {
                  id: "bracket-p4-amateur",
                  phase_id: "phase-4",
                  name: "amateur",
                },
              ];
            }
            return [];
          });

        const {
          seedPlayersForPhase,
          seedPlayersBasedOnLeaderboard,
          assignPlayersToLobbies,
        } = await import("./seeding-service");
        vi.mocked(seedPlayersForPhase).mockResolvedValue(
          Array.from({ length: 40 }, (_, i) => ({
            player_id: `a-${i}`,
          })) as any,
        );
        vi.mocked(seedPlayersBasedOnLeaderboard).mockResolvedValue(
          Array.from({ length: 32 }, (_, i) => ({
            player_id: `m-${i}`,
          })) as any,
        );
        vi.mocked(assignPlayersToLobbies).mockResolvedValue([
          { game: { id: "game-1" }, lobbyPlayers: [] },
        ]);

        const result = await startPhase4FromPhase3("phase-3", "phase-4");

        // Vérifications
        expect(seedPlayersBasedOnLeaderboard).toHaveBeenCalledTimes(1);
        expect(seedPlayersForPhase).toHaveBeenCalledTimes(1);
        expect(assignPlayersToLobbies).toHaveBeenCalledTimes(2);

        // P4 Master: top 32 de P3 Master via leaderboard (pas de reset)
        const masterLeaderboardCall = vi
          .mocked(seedPlayersBasedOnLeaderboard)
          .mock.calls.find((call) => call[0].length === 32);
        expect(masterLeaderboardCall).toBeDefined();

        // P4 Amateur: 64 joueurs (top 32 P3 Amateur + bottom 32 P3 Master)
        const amateurCall = vi
          .mocked(seedPlayersForPhase)
          .mock.calls.find((call) => call[1].length === 64);
        expect(amateurCall).toBeDefined();
      });

      it("should create a reduced amateur bracket for 72-player structure", async () => {
        const { getLeaderboard } = await import("./scoring-service");

        const mockP3MasterLeaderboard = Array.from({ length: 64 }, (_, i) => ({
          rank: i + 1,
          player_id: `p3-master-${i + 1}`,
          player_name: `P3 Master ${i + 1}`,
          total_points: 300 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        const mockP3AmateurLeaderboard = Array.from({ length: 8 }, (_, i) => ({
          rank: i + 1,
          player_id: `p3-amateur-${i + 1}`,
          player_name: `P3 Amateur ${i + 1}`,
          total_points: 200 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        vi.mocked(getLeaderboard).mockImplementation(
          async (_phaseId, bracketId) => {
            if (bracketId === "bracket-p3-master")
              return mockP3MasterLeaderboard;
            if (bracketId === "bracket-p3-amateur")
              return mockP3AmateurLeaderboard;
            return [];
          },
        );

        const mockDb = await import("@/lib/db");
        let callCount = 0;
        mockDb.db.query.bracket.findMany = vi
          .fn()
          .mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
              return [
                {
                  id: "bracket-p3-master",
                  phase_id: "phase-3",
                  name: "master",
                },
                {
                  id: "bracket-p3-amateur",
                  phase_id: "phase-3",
                  name: "amateur",
                },
              ];
            }

            return [
              { id: "bracket-p4-master", phase_id: "phase-4", name: "master" },
              {
                id: "bracket-p4-amateur",
                phase_id: "phase-4",
                name: "amateur",
              },
            ];
          });

        const {
          seedPlayersForPhase,
          seedPlayersBasedOnLeaderboard,
          assignPlayersToLobbies,
        } = await import("./seeding-service");
        vi.mocked(seedPlayersForPhase).mockResolvedValue([]);
        vi.mocked(seedPlayersBasedOnLeaderboard).mockResolvedValue([]);
        vi.mocked(assignPlayersToLobbies).mockResolvedValue([
          { game: { id: "game-1" }, lobbyPlayers: [] },
        ]);

        await startPhase4FromPhase3("phase-3", "phase-4");

        const amateurCall = vi.mocked(seedPlayersForPhase).mock.calls[0];
        expect(amateurCall?.[1]).toHaveLength(40);
      });
    });

    describe("Phase 4 → Phase 5", () => {
      it("should create 3 finals brackets correctly", async () => {
        const { getLeaderboard } = await import("./scoring-service");

        const mockP4MasterLeaderboard = Array.from({ length: 32 }, (_, i) => ({
          rank: i + 1,
          player_id: `p4-master-${i + 1}`,
          player_name: `P4 Master ${i + 1}`,
          total_points: 400 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        const mockP4AmateurLeaderboard = Array.from({ length: 64 }, (_, i) => ({
          rank: i + 1,
          player_id: `p4-amateur-${i + 1}`,
          player_name: `P4 Amateur ${i + 1}`,
          total_points: 300 - i,
          top1_count: 0,
          top4_count: 0,
          top2_count: 0,
          top3_count: 0,
          top5_count: 0,
          top6_count: 0,
          top7_count: 0,
          top8_count: 0,
          initial_seed: i + 1,
        }));

        vi.mocked(getLeaderboard).mockImplementation(
          async (phaseId, bracketId) => {
            if (bracketId === "bracket-p4-master")
              return mockP4MasterLeaderboard;
            if (bracketId === "bracket-p4-amateur")
              return mockP4AmateurLeaderboard;
            return [];
          },
        );

        const mockDb = await import("@/lib/db");
        let callCount = 0;
        mockDb.db.query.bracket.findMany = vi
          .fn()
          .mockImplementation(async () => {
            callCount++;
            // Premier appel : brackets de Phase 4
            if (callCount === 1) {
              return [
                {
                  id: "bracket-p4-master",
                  phase_id: "phase-4",
                  name: "master",
                },
                {
                  id: "bracket-p4-amateur",
                  phase_id: "phase-4",
                  name: "amateur",
                },
              ];
            }
            // Deuxième appel : brackets de Phase 5
            if (callCount === 2) {
              return [
                {
                  id: "bracket-p5-challenger",
                  phase_id: "phase-5",
                  name: "challenger",
                },
                {
                  id: "bracket-p5-master",
                  phase_id: "phase-5",
                  name: "master",
                },
                {
                  id: "bracket-p5-amateur",
                  phase_id: "phase-5",
                  name: "amateur",
                },
              ];
            }
            return [];
          });

        const { seedPlayersForPhase, assignPlayersToLobbies } = await import(
          "./seeding-service"
        );
        vi.mocked(seedPlayersForPhase).mockResolvedValue([]);
        vi.mocked(assignPlayersToLobbies).mockResolvedValue([
          { game: { id: "game-1" }, lobbyPlayers: [] },
        ]);

        const result = await startPhase5FromPhase4("phase-4", "phase-5");

        // Vérifications
        expect(result.challengerBracket).toBeDefined();
        expect(result.masterBracket).toBeDefined();
        expect(result.amateurBracket).toBeDefined();

        // 3 appels pour les 3 brackets
        expect(seedPlayersForPhase).toHaveBeenCalledTimes(3);

        // Challenger: 8 joueurs (top 8 P4 Master)
        const challengerCall = vi
          .mocked(seedPlayersForPhase)
          .mock.calls.find(
            (call) => call[1].length === 8 && call[1][0] === "p4-master-1",
          );
        expect(challengerCall).toBeDefined();

        // Master: 8 joueurs (ranks 9-16 P4 Master)
        const masterCall = vi
          .mocked(seedPlayersForPhase)
          .mock.calls.find(
            (call) => call[1].length === 8 && call[1][0] === "p4-master-9",
          );
        expect(masterCall).toBeDefined();

        // Amateur: 8 joueurs (top 8 P4 Amateur)
        const amateurCall = vi
          .mocked(seedPlayersForPhase)
          .mock.calls.find(
            (call) => call[1].length === 8 && call[1][0] === "p4-amateur-1",
          );
        expect(amateurCall).toBeDefined();
      });
    });
  });
});
