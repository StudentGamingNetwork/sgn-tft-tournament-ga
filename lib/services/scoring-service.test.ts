import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      phase: {
        findFirst: vi.fn(),
      },
      bracket: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      game: {
        findMany: vi.fn(),
      },
      results: {
        findMany: vi.fn(),
      },
      lobbyPlayer: {
        findMany: vi.fn(),
      },
      tournament: {
        findFirst: vi.fn(),
      },
    },
  },
}));

const { db } = await import("@/lib/db");
const { calculatePlayerScores, getLeaderboard } = await import(
  "./scoring-service",
);

function buildResult(params: {
  playerId: string;
  placement: number;
  points: number;
  name: string;
  riotId?: string;
}) {
  return {
    player_id: params.playerId,
    placement: params.placement,
    points: params.points,
    player: {
      name: params.name,
      riot_id: params.riotId || `${params.name}#EUW`,
      team: null,
    },
  };
}

describe("calculatePlayerScores", () => {
  it("calcule correctement le score pour un seul joueur", () => {
    const scores = calculatePlayerScores([
      { player_id: "player-1", placement: 1 },
    ]);

    expect(scores).toEqual({
      "player-1": 8,
    });
  });

  it("accumule correctement les scores pour le meme joueur", () => {
    const scores = calculatePlayerScores([
      { player_id: "player-1", placement: 1 },
      { player_id: "player-1", placement: 3 },
      { player_id: "player-1", placement: 2 },
    ]);

    expect(scores["player-1"]).toBe(21);
  });
});

describe("getLeaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("conserve les points de la phase 3 master sur le leaderboard de phase 4 master", async () => {
    vi.mocked(db.query.phase.findFirst)
      .mockResolvedValueOnce({
        tournament_id: "t-1",
        order_index: 4,
      } as any)
      .mockResolvedValueOnce({
        id: "phase-3",
        tournament_id: "t-1",
        order_index: 3,
      } as any);

    vi.mocked(db.query.bracket.findFirst)
      .mockResolvedValueOnce({ name: "master" } as any)
      .mockResolvedValueOnce({ id: "bracket-p3-master" } as any);

    vi.mocked(db.query.game.findMany)
      .mockResolvedValueOnce([
        { id: "phase4-game-1", game_number: 1 },
        { id: "phase4-game-2", game_number: 2 },
      ] as any)
      .mockResolvedValueOnce([
        { id: "phase3-game-1", game_number: 1 },
      ] as any);

    vi.mocked(db.query.lobbyPlayer.findMany).mockResolvedValueOnce([
      { player_id: "p1" },
      { player_id: "p2" },
    ] as any);

    vi.mocked(db.query.results.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([
        buildResult({ playerId: "p1", placement: 1, points: 8, name: "P1" }),
        buildResult({ playerId: "p2", placement: 2, points: 7, name: "P2" }),
      ] as any);

    const leaderboard = await getLeaderboard("phase-4", "bracket-p4-master");

    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0]?.player_id).toBe("p1");
    expect(leaderboard[0]?.total_points).toBe(8);
    expect(leaderboard[1]?.player_id).toBe("p2");
    expect(leaderboard[1]?.total_points).toBe(7);
  });

  it("additionne les points phase 3 et phase 4 pour le classement master", async () => {
    vi.mocked(db.query.phase.findFirst)
      .mockResolvedValueOnce({
        tournament_id: "t-1",
        order_index: 4,
      } as any)
      .mockResolvedValueOnce({
        id: "phase-3",
        tournament_id: "t-1",
        order_index: 3,
      } as any);

    vi.mocked(db.query.bracket.findFirst)
      .mockResolvedValueOnce({ name: "master" } as any)
      .mockResolvedValueOnce({ id: "bracket-p3-master" } as any);

    vi.mocked(db.query.game.findMany)
      .mockResolvedValueOnce([
        { id: "phase4-game-1", game_number: 1 },
      ] as any)
      .mockResolvedValueOnce([
        { id: "phase3-game-1", game_number: 1 },
      ] as any);

    vi.mocked(db.query.lobbyPlayer.findMany).mockResolvedValueOnce([
      { player_id: "p1" },
      { player_id: "p2" },
    ] as any);

    vi.mocked(db.query.results.findMany)
      .mockResolvedValueOnce([
        buildResult({ playerId: "p1", placement: 8, points: 1, name: "P1" }),
        buildResult({ playerId: "p2", placement: 1, points: 8, name: "P2" }),
      ] as any)
      .mockResolvedValueOnce([
        buildResult({ playerId: "p1", placement: 1, points: 8, name: "P1" }),
        buildResult({ playerId: "p2", placement: 2, points: 7, name: "P2" }),
      ] as any);

    const leaderboard = await getLeaderboard("phase-4", "bracket-p4-master");

    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0]?.player_id).toBe("p2");
    expect(leaderboard[0]?.total_points).toBe(15);
    expect(leaderboard[1]?.player_id).toBe("p1");
    expect(leaderboard[1]?.total_points).toBe(9);
  });

  it("ignore les joueurs de phase 3 absents du master phase 4", async () => {
    vi.mocked(db.query.phase.findFirst)
      .mockResolvedValueOnce({
        tournament_id: "t-1",
        order_index: 4,
      } as any)
      .mockResolvedValueOnce({
        id: "phase-3",
        tournament_id: "t-1",
        order_index: 3,
      } as any);

    vi.mocked(db.query.bracket.findFirst)
      .mockResolvedValueOnce({ name: "master" } as any)
      .mockResolvedValueOnce({ id: "bracket-p3-master" } as any);

    vi.mocked(db.query.game.findMany)
      .mockResolvedValueOnce([
        { id: "phase4-game-1", game_number: 1 },
      ] as any)
      .mockResolvedValueOnce([
        { id: "phase3-game-1", game_number: 1 },
      ] as any);

    vi.mocked(db.query.lobbyPlayer.findMany).mockResolvedValueOnce([
      { player_id: "p1" },
      { player_id: "p2" },
    ] as any);

    vi.mocked(db.query.results.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([
        buildResult({ playerId: "p1", placement: 1, points: 8, name: "P1" }),
        buildResult({ playerId: "p2", placement: 2, points: 7, name: "P2" }),
        buildResult({ playerId: "p3", placement: 3, points: 6, name: "P3" }),
      ] as any);

    const leaderboard = await getLeaderboard("phase-4", "bracket-p4-master");

    expect(leaderboard).toHaveLength(2);
    expect(leaderboard.map((entry) => entry.player_id)).toEqual(["p1", "p2"]);
  });
});
