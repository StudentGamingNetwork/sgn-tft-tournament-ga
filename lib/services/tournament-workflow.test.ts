import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createStandardTournament,
  startPhase2FromPhase1,
  startPhase3FromPhase1And2,
  startPhase4FromPhase3,
  startPhase5FromPhase4,
} from "./tournament-service";

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
      lobbyPlayer: {
        findMany: vi.fn(),
      },
      results: {
        findMany: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
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

function buildLeaderboard(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    player_id: `${prefix}-${i + 1}`,
    player_name: `Player ${i + 1}`,
    total_points: 500 - i,
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
}

describe("Tournament Workflow", () => {
  describe("createStandardTournament", () => {
    it("should create tournament with correct phase structure", async () => {
      const mockDb = await import("@/lib/db");

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

    it("Phase 1 -> Phase 2: eliminate top 16 and keep up to bottom 36", async () => {
      const { getLeaderboard } = await import("./scoring-service");
      vi.mocked(getLeaderboard).mockResolvedValue(buildLeaderboard("p1", 128));

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
        games: Array(6).fill({ id: "game-1" }),
        seededPlayers: [],
      });

      const result = await startPhase2FromPhase1("phase-1", "phase-2");

      expect(result.eliminatedPlayers).toHaveLength(16);
      expect(result.qualifiedPlayers).toHaveLength(36);
      expect(result.qualifiedPlayers[0].rank).toBe(17);
      expect(
        result.qualifiedPlayers[result.qualifiedPlayers.length - 1].rank,
      ).toBe(52);
    });

    it("Phase 1 -> Phase 2: truncates for smaller field (52 -> 36)", async () => {
      const { getLeaderboard } = await import("./scoring-service");
      vi.mocked(getLeaderboard).mockResolvedValue(buildLeaderboard("p1", 52));

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
        games: Array(3).fill({ id: "game-1" }),
        seededPlayers: [],
      });

      const result = await startPhase2FromPhase1("phase-1", "phase-2");

      expect(result.eliminatedPlayers).toHaveLength(16);
      expect(result.qualifiedPlayers).toHaveLength(36);
      expect(result.qualifiedPlayers[0].rank).toBe(17);
    });

    it("Phase 2 -> Phase 3: Master 16+16 and Amateur bottom 20 from P2", async () => {
      const { getLeaderboard } = await import("./scoring-service");
      vi.mocked(getLeaderboard).mockImplementation(async (phaseId: string) => {
        if (phaseId === "phase-1") return buildLeaderboard("p1", 80);
        if (phaseId === "phase-2") return buildLeaderboard("p2", 48);
        return [];
      });

      const mockDb = await import("@/lib/db");
      mockDb.db.query.bracket.findMany = vi.fn().mockResolvedValue([
        { id: "bracket-master", phase_id: "phase-3", name: "master" },
        { id: "bracket-amateur", phase_id: "phase-3", name: "amateur" },
      ]);
      mockDb.db.query.game.findMany = vi.fn().mockResolvedValue([
        {
          id: "phase2-game-1",
          phase_id: "phase-2",
          game_number: 1,
          lobbyPlayers: [
            { player_id: "p2-1", seed: 17 },
            { player_id: "p2-2", seed: 18 },
            { player_id: "p2-3", seed: 19 },
            { player_id: "p2-4", seed: 20 },
            { player_id: "p2-5", seed: 21 },
            { player_id: "p2-6", seed: 22 },
            { player_id: "p2-7", seed: 23 },
            { player_id: "p2-8", seed: 29 },
            { player_id: "p2-9", seed: 24 },
            { player_id: "p2-10", seed: 25 },
            { player_id: "p2-11", seed: 26 },
            { player_id: "p2-12", seed: 27 },
            { player_id: "p2-13", seed: 28 },
            { player_id: "p2-14", seed: 30 },
            { player_id: "p2-15", seed: 31 },
            { player_id: "p2-16", seed: 32 },
          ],
        },
      ]);
      mockDb.db.query.lobbyPlayer.findMany = vi.fn().mockResolvedValue(
        Array.from({ length: 32 }, (_, i) => ({
          game_id: "game-1",
          player_id: i < 16 ? `p1-${i + 1}` : `p2-${i - 15}`,
          seed: i + 1,
        })),
      );

      const { seedPlayersBasedOnLeaderboard, assignPlayersToLobbies } =
        await import("./seeding-service");
      vi.mocked(seedPlayersBasedOnLeaderboard)
        .mockResolvedValueOnce([
          ...Array.from({ length: 16 }, (_, i) => ({
            player_id: `p1-${i + 1}`,
            seed: i + 1,
          })),
          ...Array.from({ length: 16 }, (_, i) => ({
            player_id: `p2-${i + 1}`,
            seed: i + 17,
          })),
        ] as any)
        .mockResolvedValueOnce(
          Array.from({ length: 20 }, (_, i) => ({
            player_id: `p2-${i + 17}`,
            seed: i + 1,
          })) as any,
        );
      vi.mocked(assignPlayersToLobbies).mockImplementation(
        async (_phaseId, _bracketId, _gameNumber, seededPlayers) => [
          {
            game: { id: "game-1" },
            assignment: { players: seededPlayers as any[] },
          } as any,
        ],
      );

      const result = await startPhase3FromPhase1And2(
        "phase-1",
        "phase-2",
        "phase-3",
      );

      expect(result.masterBracket.players).toHaveLength(32);
      expect(result.amateurBracket.players).toHaveLength(20);
      expect(
        vi.mocked(seedPlayersBasedOnLeaderboard).mock.calls[0]?.[0],
      ).toHaveLength(32);
      expect(
        vi.mocked(seedPlayersBasedOnLeaderboard).mock.calls[1]?.[0],
      ).toHaveLength(20);
      const phase3MasterInput = vi.mocked(seedPlayersBasedOnLeaderboard).mock
        .calls[0]?.[0] as Array<{ player_id: string }>;
      const phase3AmateurInput = vi.mocked(seedPlayersBasedOnLeaderboard).mock
        .calls[1]?.[0] as Array<{ player_id: string }>;

      expect(phase3MasterInput[0]?.player_id).toBe("p1-1");
      expect(phase3MasterInput[15]?.player_id).toBe("p1-16");
      expect(phase3MasterInput[16]?.player_id).toBe("p2-1");
      expect(phase3MasterInput[31]?.player_id).toBe("p2-16");
      expect(phase3AmateurInput[0]?.player_id).toBe("p2-17");
      expect(phase3AmateurInput[19]?.player_id).toBe("p2-36");
      const preservedSeedPlayer = result.masterBracket.players.find(
        (player) => player.player_id === "p2-8",
      );
      expect(preservedSeedPlayer?.seed).toBe(29);
      expect(mockDb.db.update).toHaveBeenCalled();
      expect(vi.mocked(seedPlayersBasedOnLeaderboard).mock.calls[0]?.[1]).toBe(
        false,
      );
      expect(vi.mocked(seedPlayersBasedOnLeaderboard).mock.calls[1]?.[1]).toBe(
        false,
      );
      expect(vi.mocked(assignPlayersToLobbies).mock.calls[0]?.[4]).toBe(true);
      expect(vi.mocked(assignPlayersToLobbies).mock.calls[1]?.[4]).toBe(false);
    });

    it("Phase 3 -> Phase 4: Master top 16, Amateur bottom16+top8", async () => {
      const { getLeaderboard } = await import("./scoring-service");
      vi.mocked(getLeaderboard).mockImplementation(
        async (_phaseId, bracketId) => {
          if (bracketId === "bracket-p3-master")
            return buildLeaderboard("p3m", 32);
          if (bracketId === "bracket-p3-amateur")
            return buildLeaderboard("p3a", 32);
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
              { id: "bracket-p3-master", phase_id: "phase-3", name: "master" },
              {
                id: "bracket-p3-amateur",
                phase_id: "phase-3",
                name: "amateur",
              },
            ];
          }
          return [
            { id: "bracket-p4-master", phase_id: "phase-4", name: "master" },
            { id: "bracket-p4-amateur", phase_id: "phase-4", name: "amateur" },
          ];
        });

      const { seedPlayersBasedOnLeaderboard, assignPlayersToLobbies } =
        await import("./seeding-service");
      vi.mocked(seedPlayersBasedOnLeaderboard)
        .mockResolvedValueOnce(
          Array.from({ length: 16 }, (_, i) => ({
            player_id: `m-${i}`,
          })) as any,
        )
        .mockResolvedValueOnce(
          Array.from({ length: 24 }, (_, i) => ({
            player_id: `a-${i}`,
          })) as any,
        );
      vi.mocked(assignPlayersToLobbies).mockResolvedValue([
        { game: { id: "game-1" }, lobbyPlayers: [] },
      ]);

      const result = await startPhase4FromPhase3("phase-3", "phase-4");

      expect(result.masterBracket.players).toHaveLength(16);
      expect(result.amateurBracket.players).toHaveLength(24);
      expect(
        vi.mocked(seedPlayersBasedOnLeaderboard).mock.calls[0]?.[0],
      ).toHaveLength(16);
      expect(
        vi.mocked(seedPlayersBasedOnLeaderboard).mock.calls[1]?.[0],
      ).toHaveLength(24);
      expect(vi.mocked(seedPlayersBasedOnLeaderboard).mock.calls[1]?.[1]).toBe(
        false,
      );
      expect(vi.mocked(assignPlayersToLobbies).mock.calls[0]?.[4]).toBe(true);
      expect(vi.mocked(assignPlayersToLobbies).mock.calls[1]?.[4]).toBe(false);
    });

    it("Phase 4 -> Phase 5: creates 8/8/8 brackets", async () => {
      const { getLeaderboard } = await import("./scoring-service");
      vi.mocked(getLeaderboard).mockImplementation(
        async (_phaseId, bracketId) => {
          if (bracketId === "bracket-p4-master")
            return buildLeaderboard("p4m", 16);
          if (bracketId === "bracket-p4-amateur")
            return buildLeaderboard("p4a", 32);
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
              { id: "bracket-p4-master", phase_id: "phase-4", name: "master" },
              {
                id: "bracket-p4-amateur",
                phase_id: "phase-4",
                name: "amateur",
              },
            ];
          }
          return [
            {
              id: "bracket-p5-challenger",
              phase_id: "phase-5",
              name: "challenger",
            },
            { id: "bracket-p5-master", phase_id: "phase-5", name: "master" },
            { id: "bracket-p5-amateur", phase_id: "phase-5", name: "amateur" },
          ];
        });

      const { seedPlayersBasedOnLeaderboard, assignPlayersToLobbies } =
        await import("./seeding-service");
      vi.mocked(seedPlayersBasedOnLeaderboard).mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({ player_id: `x-${i}` })) as any,
      );
      vi.mocked(assignPlayersToLobbies).mockResolvedValue([
        { game: { id: "game-1" }, lobbyPlayers: [] },
      ]);

      const result = await startPhase5FromPhase4("phase-4", "phase-5");

      expect(result.challengerBracket.players).toHaveLength(8);
      expect(result.masterBracket.players).toHaveLength(8);
      expect(result.amateurBracket.players).toHaveLength(8);
      expect(vi.mocked(seedPlayersBasedOnLeaderboard)).toHaveBeenCalledTimes(3);
      const phase5ChallengerInput = vi.mocked(seedPlayersBasedOnLeaderboard)
        .mock.calls[0]?.[0] as Array<{ player_id: string }>;
      const phase5MasterInput = vi.mocked(seedPlayersBasedOnLeaderboard).mock
        .calls[1]?.[0] as Array<{ player_id: string }>;
      const phase5AmateurInput = vi.mocked(seedPlayersBasedOnLeaderboard).mock
        .calls[2]?.[0] as Array<{ player_id: string }>;

      expect(phase5ChallengerInput[0]?.player_id).toBe("p4m-1");
      expect(phase5ChallengerInput[7]?.player_id).toBe("p4m-8");
      expect(phase5MasterInput[0]?.player_id).toBe("p4m-9");
      expect(phase5MasterInput[7]?.player_id).toBe("p4m-16");
      expect(phase5AmateurInput[0]?.player_id).toBe("p4a-1");
      expect(phase5AmateurInput[7]?.player_id).toBe("p4a-8");
      expect(
        vi
          .mocked(seedPlayersBasedOnLeaderboard)
          .mock.calls.every((call) => call[1] === false),
      ).toBe(true);
    });

    it("Phase 4 -> Phase 5: supports underfilled brackets (<8 players)", async () => {
      const { getLeaderboard } = await import("./scoring-service");
      vi.mocked(getLeaderboard).mockImplementation(
        async (_phaseId, bracketId) => {
          if (bracketId === "bracket-p4-master")
            return buildLeaderboard("p4m", 12);
          if (bracketId === "bracket-p4-amateur")
            return buildLeaderboard("p4a", 5);
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
              { id: "bracket-p4-master", phase_id: "phase-4", name: "master" },
              {
                id: "bracket-p4-amateur",
                phase_id: "phase-4",
                name: "amateur",
              },
            ];
          }
          return [
            {
              id: "bracket-p5-challenger",
              phase_id: "phase-5",
              name: "challenger",
            },
            { id: "bracket-p5-master", phase_id: "phase-5", name: "master" },
            { id: "bracket-p5-amateur", phase_id: "phase-5", name: "amateur" },
          ];
        });

      const { seedPlayersBasedOnLeaderboard, assignPlayersToLobbies } =
        await import("./seeding-service");
      vi.mocked(seedPlayersBasedOnLeaderboard)
        .mockResolvedValueOnce(
          Array.from({ length: 8 }, (_, i) => ({ player_id: `c-${i}` })) as any,
        )
        .mockResolvedValueOnce(
          Array.from({ length: 4 }, (_, i) => ({ player_id: `m-${i}` })) as any,
        )
        .mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => ({ player_id: `a-${i}` })) as any,
        );
      vi.mocked(assignPlayersToLobbies).mockResolvedValue([
        { game: { id: "game-1" }, lobbyPlayers: [] },
      ]);

      const result = await startPhase5FromPhase4("phase-4", "phase-5");

      expect(result.challengerBracket.players).toHaveLength(8);
      expect(result.masterBracket.players).toHaveLength(4);
      expect(result.amateurBracket.players).toHaveLength(5);
      expect(vi.mocked(seedPlayersBasedOnLeaderboard)).toHaveBeenCalledTimes(3);
      expect(vi.mocked(assignPlayersToLobbies)).toHaveBeenCalledTimes(3);
    });
  });
});
