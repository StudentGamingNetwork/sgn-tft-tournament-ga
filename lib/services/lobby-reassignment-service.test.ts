import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
    query: {
      game: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      phase: {
        findFirst: vi.fn(),
      },
      bracket: {
        findFirst: vi.fn(),
      },
      tournamentRegistration: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      lobbyPlayer: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    transaction: vi.fn(),
  },
}));

const { db } = await import("@/lib/db");
const { addTournamentPlayerToLobby } = await import(
  "./lobby-reassignment-service"
);

describe("lobby-reassignment-service addTournamentPlayerToLobby", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (db.query.game.findFirst as any).mockResolvedValue({
      id: "game-1",
      phase_id: "phase-5",
      bracket_id: "bracket-master",
      game_number: 2,
      status: "upcoming",
      results: [],
    });

    (db.query.bracket.findFirst as any).mockResolvedValue({
      id: "bracket-master",
      phase: {
        order_index: 5,
        tournament_id: "t-1",
      },
    });

    (db.query.tournamentRegistration.findFirst as any).mockResolvedValue({
      id: "reg-1",
      status: "confirmed",
      forfeited_at: null,
    });

    (db.query.lobbyPlayer.findMany as any).mockResolvedValue([
      { id: "lp-1", seed: 1, player_id: "p-1" },
      { id: "lp-2", seed: 2, player_id: "p-2" },
    ]);

    (db.query.game.findMany as any).mockResolvedValue([
      {
        id: "game-1",
        lobbyPlayers: [{ player_id: "p-1" }, { player_id: "p-2" }],
      },
      {
        id: "game-2",
        lobbyPlayers: [{ player_id: "p-3" }],
      },
    ]);

    const valuesMock = vi.fn().mockResolvedValue(undefined);
    (db.insert as any).mockReturnValue({ values: valuesMock });
  });

  it("ajoute un joueur inscrit en finale avec le prochain seed", async () => {
    await addTournamentPlayerToLobby("game-1", "player-new");

    expect(db.insert).toHaveBeenCalledTimes(1);
    const insertValues = (db.insert as any).mock.results[0].value.values;
    expect(insertValues).toHaveBeenCalledWith({
      game_id: "game-1",
      player_id: "player-new",
      seed: 3,
    });
  });

  it("refuse un joueur deja present dans la meme manche", async () => {
    (db.query.game.findMany as any).mockResolvedValue([
      {
        id: "game-1",
        lobbyPlayers: [{ player_id: "p-1" }],
      },
      {
        id: "game-2",
        lobbyPlayers: [{ player_id: "player-new" }],
      },
    ]);

    await expect(
      addTournamentPlayerToLobby("game-1", "player-new"),
    ).rejects.toThrow(
      "Le joueur est deja assigne dans un lobby de cette manche",
    );

    expect(db.insert).not.toHaveBeenCalled();
  });
});
