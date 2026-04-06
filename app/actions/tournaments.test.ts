import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
    query: {
      tournament: {
        findFirst: vi.fn(),
      },
      phase: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      game: {
        findFirst: vi.fn(),
      },
      tournamentRegistration: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      bracket: {
        findMany: vi.fn(),
      },
      team: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/services/tournament-service", () => ({
  createStandardTournament: vi.fn(),
  startPhase: vi.fn(),
  startPhase2FromPhase1: vi.fn(),
  startPhase3FromPhase1And2: vi.fn(),
  startPhase4FromPhase3: vi.fn(),
  startPhase5FromPhase4: vi.fn(),
}));

vi.mock("@/lib/services/game-service", () => ({
  submitGameResults: vi.fn(),
  forfeitPlayerFromTournament: vi.fn(),
  repechagePlayerFromGame: vi.fn(),
  resetGameSeeding: vi.fn(),
  renameGameLobby: vi.fn(),
  deleteGame: vi.fn(),
}));

vi.mock("@/lib/services/player-service", () => ({
  createPlayer: vi.fn(),
  getPlayerByRiotId: vi.fn(),
  importPlayersFromCSV: vi.fn(),
  updatePlayer: vi.fn(),
}));

vi.mock("@/lib/services/rank-sync-service", () => ({
  ensureRankSyncSchedulerStarted: vi.fn(),
  triggerTournamentRankSync: vi.fn(),
  getRankSyncState: vi.fn(),
}));

vi.mock("@/lib/services/lobby-reassignment-service", () => ({
  movePlayerBetweenLobbies: vi.fn(),
  swapPlayersBetweenLobbies: vi.fn(),
  addTournamentPlayerToLobby: vi.fn(),
}));

const tournamentsActions = await import("@/app/actions/tournaments");
const { auth } = await import("@/lib/auth");
const { db } = await import("@/lib/db");
const { createStandardTournament } = await import(
  "@/lib/services/tournament-service"
);
const { submitGameResults, repechagePlayerFromGame } = await import(
  "@/lib/services/game-service"
);
const { getPlayerByRiotId } = await import("@/lib/services/player-service");
const { triggerTournamentRankSync, getRankSyncState } = await import(
  "@/lib/services/rank-sync-service"
);
const { addTournamentPlayerToLobby } = await import(
  "@/lib/services/lobby-reassignment-service"
);
const {
  startPhase,
  startPhase2FromPhase1,
  startPhase3FromPhase1And2,
  startPhase4FromPhase3,
  startPhase5FromPhase4,
} = await import("@/lib/services/tournament-service");

const mockGetSession = vi.mocked(auth.api.getSession);
const mockCreateStandardTournament = vi.mocked(createStandardTournament);
const mockSubmitGameResults = vi.mocked(submitGameResults);
const mockRepechagePlayerFromGame = vi.mocked(repechagePlayerFromGame);
const mockGetPlayerByRiotId = vi.mocked(getPlayerByRiotId);
const mockTriggerTournamentRankSync = vi.mocked(triggerTournamentRankSync);
const mockGetRankSyncState = vi.mocked(getRankSyncState);
const mockAddTournamentPlayerToLobby = vi.mocked(addTournamentPlayerToLobby);
const mockStartPhase = vi.mocked(startPhase);
const mockStartPhase2FromPhase1 = vi.mocked(startPhase2FromPhase1);
const mockStartPhase3FromPhase1And2 = vi.mocked(startPhase3FromPhase1And2);
const mockStartPhase4FromPhase3 = vi.mocked(startPhase4FromPhase3);
const mockStartPhase5FromPhase4 = vi.mocked(startPhase5FromPhase4);

describe("tournaments actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.phase.findMany).mockResolvedValue([] as any);
    vi.mocked(db.query.phase.findFirst).mockResolvedValue({
      id: "phase-default",
      tournament_id: "t-1",
      order_index: 1,
    } as any);
    vi.mocked(db.query.bracket.findMany).mockResolvedValue([] as any);
    vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as any);
    vi.mocked(db.query.tournament.findFirst).mockResolvedValue(
      undefined as any,
    );
  });

  describe("startPhase1Action", () => {
    it("accepte un nombre variable de joueurs confirmes", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      vi.mocked(db.query.phase.findFirst).mockResolvedValue({
        id: "p1",
        order_index: 1,
        tournament_id: "t-1",
      } as any);
      vi.mocked(db.query.tournamentRegistration.findMany).mockResolvedValue(
        Array.from({ length: 56 }, (_, index) => ({
          player_id: `p-${index}`,
        })) as any,
      );
      vi.mocked(db.query.bracket.findMany).mockResolvedValue([
        { id: "b1", phase_id: "p1", name: "common" },
      ] as any);
      mockStartPhase.mockResolvedValue({ phaseId: "p1" } as any);
      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p1",
          tournament_id: "t-1",
          name: "Phase 1",
          order_index: 1,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [{ id: "b1", name: "common", games: [] }],
        },
      ] as any);

      const result = await tournamentsActions.startPhase1Action("p1", "t-1");

      expect(result.success).toBe(true);
      expect(result.lobbyCount).toBe(7);
    });

    it("accepte un nombre de joueurs non multiple de 8", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      vi.mocked(db.query.phase.findFirst).mockResolvedValue({
        id: "p1",
        order_index: 1,
        tournament_id: "t-1",
      } as any);
      vi.mocked(db.query.tournamentRegistration.findMany).mockResolvedValue(
        Array.from({ length: 66 }, (_, index) => ({
          player_id: `p-${index}`,
        })) as any,
      );
      vi.mocked(db.query.bracket.findMany).mockResolvedValue([
        { id: "b1", phase_id: "p1", name: "common" },
      ] as any);
      mockStartPhase.mockResolvedValue({ phaseId: "p1" } as any);
      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p1",
          tournament_id: "t-1",
          name: "Phase 1",
          order_index: 1,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [{ id: "b1", name: "common", games: [] }],
        },
      ] as any);

      const result = await tournamentsActions.startPhase1Action("p1", "t-1");

      expect(result.success).toBe(true);
      expect(result.lobbyCount).toBe(9);
    });

    it("passe le tournoi en ongoing quand la phase 1 démarre", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      vi.mocked(db.query.phase.findFirst).mockResolvedValue({
        id: "p1",
        order_index: 1,
        tournament_id: "t-1",
      } as any);
      vi.mocked(db.query.tournamentRegistration.findMany).mockResolvedValue(
        Array.from({ length: 64 }, (_, index) => ({
          player_id: `p-${index}`,
        })) as any,
      );
      vi.mocked(db.query.bracket.findMany).mockResolvedValue([
        { id: "b1", phase_id: "p1", name: "common" },
      ] as any);
      mockStartPhase.mockResolvedValue({ phaseId: "p1" } as any);

      vi.mocked(db.query.phase.findMany)
        .mockResolvedValueOnce([
          {
            id: "p1",
            tournament_id: "t-1",
            name: "Phase 1",
            order_index: 1,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [{ id: "b1", name: "common", games: [] }],
          },
          {
            id: "p5",
            tournament_id: "t-1",
            name: "Phase 5",
            order_index: 5,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [{ id: "b5", name: "challenger", games: [] }],
          },
        ] as any)
        .mockResolvedValueOnce([
          {
            id: "p1",
            tournament_id: "t-1",
            name: "Phase 1",
            order_index: 1,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [
              {
                id: "b1",
                name: "common",
                games: [{ id: "g1", game_number: 1, results: [] }],
              },
            ],
          },
          {
            id: "p5",
            tournament_id: "t-1",
            name: "Phase 5",
            order_index: 5,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [{ id: "b5", name: "challenger", games: [] }],
          },
        ] as any);

      vi.mocked(db.query.tournament.findFirst).mockResolvedValue({
        id: "t-1",
        status: "upcoming",
      } as any);

      const whereMock = vi.fn().mockResolvedValue([]);
      const setMock = vi.fn(() => ({ where: whereMock }));
      vi.mocked(db.update).mockReturnValue({ set: setMock } as any);

      const result = await tournamentsActions.startPhase1Action("p1", "t-1");

      expect(result.success).toBe(true);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ongoing" }),
      );
    });

    it("refuse de redémarrer une phase déjà démarrée", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);

      vi.mocked(db.query.phase.findFirst)
        .mockResolvedValueOnce({
          id: "p1",
          order_index: 1,
          tournament_id: "t-1",
        } as any)
        .mockResolvedValueOnce({
          id: "p1",
          order_index: 1,
          tournament_id: "t-1",
        } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p1",
          tournament_id: "t-1",
          name: "Phase 1",
          order_index: 1,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b1",
              name: "common",
              games: [{ id: "g1", game_number: 1, results: [{ id: "r1" }] }],
            },
          ],
        },
      ] as any);

      const result = await tournamentsActions.startPhase1Action("p1", "t-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("déjà démarrée");
      expect(mockStartPhase).not.toHaveBeenCalled();
    });
  });

  describe("auth guard", () => {
    it("refuse createTournament sans session", async () => {
      mockGetSession.mockResolvedValue(null as any);

      await expect(
        tournamentsActions.createTournament({
          name: "Test",
          year: "2026",
          status: "upcoming",
        }),
      ).rejects.toThrow("Impossible de créer le tournoi");
    });

    it("autorise createTournament avec session", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      const returningMock = vi.fn().mockResolvedValue([
        {
          id: "t-1",
          name: "Test",
          year: "2026",
          status: "upcoming",
          structure_image_url: "https://example.com/structure.png",
          rules_url: null,
          is_simulation: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: returningMock,
          })),
        })),
      } as any);

      mockCreateStandardTournament.mockResolvedValue({
        id: "t-1",
        name: "Test",
        year: "2026",
        status: "upcoming",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await tournamentsActions.createTournament({
        name: "Test",
        year: "2026",
        status: "upcoming",
      });

      expect(result.id).toBe("t-1");
      expect(mockCreateStandardTournament).toHaveBeenCalledWith("Test", "2026");
    });

    it("refuse submitGameResultsAction sans session", async () => {
      mockGetSession.mockResolvedValue(null as any);

      const result = await tournamentsActions.submitGameResultsAction("g-1", [
        { player_id: "p1", placement: 1 },
        { player_id: "p2", placement: 2 },
        { player_id: "p3", placement: 3 },
        { player_id: "p4", placement: 4 },
        { player_id: "p5", placement: 5 },
        { player_id: "p6", placement: 6 },
        { player_id: "p7", placement: 7 },
        { player_id: "p8", placement: 8 },
      ]);

      expect(result.success).toBe(false);
      expect(mockSubmitGameResults).not.toHaveBeenCalled();
    });

    it("refuse repechagePlayerAction sans session", async () => {
      mockGetSession.mockResolvedValue(null as any);

      const result = await tournamentsActions.repechagePlayerAction(
        "g-1",
        "p-1",
        4,
      );

      expect(result.success).toBe(false);
      expect(mockRepechagePlayerFromGame).not.toHaveBeenCalled();
    });

    it("execute repechagePlayerAction avec session", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as any);

      const result = await tournamentsActions.repechagePlayerAction(
        "g-1",
        "p-1",
        3,
      );

      expect(result.success).toBe(true);
      expect(mockRepechagePlayerFromGame).toHaveBeenCalledWith("g-1", "p-1", 3);
    });

    it("refuse updateRegistrationStatus sans session", async () => {
      mockGetSession.mockResolvedValue(null as any);

      await expect(
        tournamentsActions.updateRegistrationStatus("t-1", "p-1", "confirmed"),
      ).rejects.toThrow("Impossible de mettre à jour le statut");
    });
  });

  describe("importPlayersAndRegisterToTournament", () => {
    it("retourne une erreur globale si non authentifié", async () => {
      mockGetSession.mockResolvedValue(null as any);

      const result =
        await tournamentsActions.importPlayersAndRegisterToTournament("t-1", [
          {
            name: "Player One",
            riot_id: "PlayerOne#EUW",
            tier: "GOLD",
            division: "I",
            league_points: 50,
          },
        ]);

      expect(result.success).toBe(false);
      expect(result.errors[0]?.player).toBe("all");
    });

    it("met a jour/inscrit un joueur existant", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockGetPlayerByRiotId.mockResolvedValue({ id: "p-1" } as any);
      vi.mocked(db.query.tournamentRegistration.findFirst).mockResolvedValue(
        undefined as any,
      );

      const insertValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: insertValues } as any);

      const result =
        await tournamentsActions.importPlayersAndRegisterToTournament("t-1", [
          {
            name: "Player One",
            riot_id: "PlayerOne#EUW",
            tier: "GOLD",
            division: "I",
            league_points: 50,
          },
        ]);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.registered).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("rank sync actions", () => {
    it("lance la synchronisation des ranks pour un tournoi", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockTriggerTournamentRankSync.mockResolvedValue({
        isRunning: true,
        queueSize: 1,
        schedulerEnabled: true,
        lastRunAt: null,
        lastError: null,
        lastResult: null,
      } as any);
      mockGetRankSyncState.mockReturnValue({
        isRunning: true,
        queueSize: 1,
        schedulerEnabled: true,
        lastRunAt: null,
        lastError: null,
        lastResult: null,
      } as any);

      const result =
        await tournamentsActions.triggerTournamentRanksSyncAction("t-1");

      expect(result.success).toBe(true);
      expect(mockTriggerTournamentRankSync).toHaveBeenCalledWith("t-1");
      expect(result.state?.isRunning).toBe(true);
    });

    it("retourne une erreur si triggerTournamentRankSync echoue", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockTriggerTournamentRankSync.mockRejectedValue(
        new Error("sync indisponible"),
      );

      const result =
        await tournamentsActions.triggerTournamentRanksSyncAction("t-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("sync indisponible");
    });

    it("recupere l'etat du job de synchronisation", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockGetRankSyncState.mockReturnValue({
        isRunning: false,
        queueSize: 0,
        schedulerEnabled: true,
        lastRunAt: null,
        lastError: null,
        lastResult: null,
      } as any);

      const result =
        await tournamentsActions.getTournamentRanksSyncStateAction();

      expect(result.success).toBe(true);
      expect(mockGetRankSyncState).toHaveBeenCalled();
      expect(result.state?.schedulerEnabled).toBe(true);
    });
  });

  describe("phase transition action wrappers", () => {
    it("startPhase2Action mappe correctement les stats", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockStartPhase2FromPhase1.mockResolvedValue({
        eliminatedPlayers: Array.from({ length: 32 }, (_, i) => ({
          player_id: `e-${i}`,
          rank: i + 1,
        })),
        qualifiedPlayers: Array.from({ length: 48 }, (_, i) => ({
          player_id: `q-${i}`,
          rank: i + 33,
        })),
        games: Array.from({ length: 6 }, (_, i) => ({ id: `g-${i}` })),
      } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p1",
          tournament_id: "t-1",
          name: "Phase 1",
          order_index: 1,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b1",
              name: "common",
              games: [{ id: "g1", game_number: 1, results: [{ id: "r1" }] }],
            },
          ],
        },
        {
          id: "p2",
          tournament_id: "t-1",
          name: "Phase 2",
          order_index: 2,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [{ id: "b2", name: "common", games: [] }],
        },
      ] as any);

      const result = await tournamentsActions.startPhase2Action("p1", "p2");

      expect(result.success).toBe(true);
      expect(result.stats?.eliminatedCount).toBe(32);
      expect(result.stats?.qualifiedCount).toBe(48);
      expect(result.stats?.lobbyCount).toBe(6);
    });

    it("startPhase3Action mappe correctement les stats", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockStartPhase3FromPhase1And2.mockResolvedValue({
        masterBracket: { players: Array.from({ length: 32 }, () => ({})) },
        amateurBracket: { players: Array.from({ length: 32 }, () => ({})) },
      } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p2",
          tournament_id: "t-1",
          name: "Phase 2",
          order_index: 2,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b2",
              name: "common",
              games: [{ id: "g2", game_number: 1, results: [{ id: "r2" }] }],
            },
          ],
        },
        {
          id: "p3",
          tournament_id: "t-1",
          name: "Phase 3",
          order_index: 3,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [{ id: "b3", name: "master", games: [] }],
        },
      ] as any);

      const result = await tournamentsActions.startPhase3Action(
        "p1",
        "p2",
        "p3",
      );

      expect(result.success).toBe(true);
      expect(result.stats?.masterCount).toBe(32);
      expect(result.stats?.amateurCount).toBe(32);
    });

    it("startPhase4Action mappe correctement les stats", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockStartPhase4FromPhase3.mockResolvedValue({
        masterBracket: { players: Array.from({ length: 16 }, () => ({})) },
        amateurBracket: { players: Array.from({ length: 32 }, () => ({})) },
      } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p3",
          tournament_id: "t-1",
          name: "Phase 3",
          order_index: 3,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b3",
              name: "master",
              games: [{ id: "g3", game_number: 1, results: [{ id: "r3" }] }],
            },
          ],
        },
        {
          id: "p4",
          tournament_id: "t-1",
          name: "Phase 4",
          order_index: 4,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [{ id: "b4", name: "master", games: [] }],
        },
      ] as any);

      const result = await tournamentsActions.startPhase4Action("p3", "p4");

      expect(result.success).toBe(true);
      expect(result.stats?.masterCount).toBe(16);
      expect(result.stats?.amateurCount).toBe(32);
    });

    it("startPhase5Action mappe correctement les stats", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockStartPhase5FromPhase4.mockResolvedValue({
        challengerBracket: { players: Array.from({ length: 8 }, () => ({})) },
        masterBracket: { players: Array.from({ length: 8 }, () => ({})) },
        amateurBracket: { players: Array.from({ length: 8 }, () => ({})) },
      } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p4",
          tournament_id: "t-1",
          name: "Phase 4",
          order_index: 4,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b4",
              name: "master",
              games: [{ id: "g4", game_number: 1, results: [{ id: "r4" }] }],
            },
          ],
        },
        {
          id: "p5",
          tournament_id: "t-1",
          name: "Phase 5",
          order_index: 5,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [{ id: "b5", name: "challenger", games: [] }],
        },
      ] as any);

      const result = await tournamentsActions.startPhase5Action("p4", "p5");

      expect(result.success).toBe(true);
      expect(result.stats?.challengerCount).toBe(8);
      expect(result.stats?.masterCount).toBe(8);
      expect(result.stats?.amateurCount).toBe(8);
    });

    it("retourne success=false quand le service de transition lève une erreur", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockStartPhase4FromPhase3.mockRejectedValue(new Error("transition ko"));

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p3",
          tournament_id: "t-1",
          name: "Phase 3",
          order_index: 3,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b3",
              name: "master",
              games: [{ id: "g3", game_number: 1, results: [{ id: "r3" }] }],
            },
          ],
        },
        {
          id: "p4",
          tournament_id: "t-1",
          name: "Phase 4",
          order_index: 4,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [{ id: "b4", name: "master", games: [] }],
        },
      ] as any);

      const result = await tournamentsActions.startPhase4Action("p3", "p4");

      expect(result.success).toBe(false);
      expect(result.error).toContain("transition ko");
    });

    it("refuse startPhase2Action quand la phase 1 n'est pas terminée", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);

      vi.mocked(db.query.phase.findFirst).mockResolvedValue({
        id: "p2",
        tournament_id: "t-1",
      } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p1",
          tournament_id: "t-1",
          name: "Phase 1",
          order_index: 1,
          total_games: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b1",
              name: "common",
              games: [{ id: "g1", game_number: 1, results: [] }],
            },
          ],
        },
        {
          id: "p2",
          tournament_id: "t-1",
          name: "Phase 2",
          order_index: 2,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b2",
              name: "common",
              games: [],
            },
          ],
        },
      ] as any);

      const result = await tournamentsActions.startPhase2Action("p1", "p2");

      expect(result.success).toBe(false);
      expect(result.error).toContain("phase précédente n'est pas terminée");
      expect(mockStartPhase2FromPhase1).not.toHaveBeenCalled();
    });
  });

  describe("startNextPhaseAction", () => {
    it("retourne une erreur si aucune phase n'existe", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([] as any);

      const result = await tournamentsActions.startNextPhaseAction("t-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Aucune phase trouvée");
    });

    it("démarre la phase 2 quand la phase 1 est completed", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p1",
          tournament_id: "t-1",
          name: "Phase 1",
          order_index: 1,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b1",
              name: "common",
              games: [{ id: "g1", game_number: 1, results: [{ id: "r1" }] }],
            },
          ],
        },
        {
          id: "p2",
          tournament_id: "t-1",
          name: "Phase 2",
          order_index: 2,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b2",
              name: "common",
              games: [],
            },
          ],
        },
      ] as any);

      mockStartPhase2FromPhase1.mockResolvedValue({
        eliminatedPlayers: Array.from({ length: 32 }, (_, i) => ({
          player_id: `e-${i}`,
          rank: i + 1,
        })),
        qualifiedPlayers: Array.from({ length: 96 }, (_, i) => ({
          player_id: `q-${i}`,
          rank: i + 33,
        })),
        games: Array.from({ length: 12 }, (_, i) => ({ id: `g-${i}` })),
      } as any);

      const result = await tournamentsActions.startNextPhaseAction("t-1");

      expect(result.success).toBe(true);
      expect(result.startedPhaseId).toBe("p2");
      expect(result.startedPhaseOrder).toBe(2);
      expect(mockStartPhase2FromPhase1).toHaveBeenCalledWith("p1", "p2");
    });

    it("retourne une erreur quand aucune phase n'est éligible", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p1",
          tournament_id: "t-1",
          name: "Phase 1",
          order_index: 1,
          total_games: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b1",
              name: "common",
              games: [{ id: "g1", game_number: 1, results: [] }],
            },
          ],
        },
        {
          id: "p2",
          tournament_id: "t-1",
          name: "Phase 2",
          order_index: 2,
          total_games: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b2",
              name: "common",
              games: [],
            },
          ],
        },
      ] as any);

      const result = await tournamentsActions.startNextPhaseAction("t-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Aucune phase éligible");
    });

    it("propage l'erreur de startPhase2Action", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p1",
          tournament_id: "t-1",
          name: "Phase 1",
          order_index: 1,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b1",
              name: "common",
              games: [{ id: "g1", game_number: 1, results: [{ id: "r1" }] }],
            },
          ],
        },
        {
          id: "p2",
          tournament_id: "t-1",
          name: "Phase 2",
          order_index: 2,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b2",
              name: "common",
              games: [],
            },
          ],
        },
      ] as any);

      mockStartPhase2FromPhase1.mockRejectedValue(
        new Error("phase 2 impossible"),
      );

      const result = await tournamentsActions.startNextPhaseAction("t-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("phase 2 impossible");
    });
  });

  describe("submitGameResultsAction status sync", () => {
    it("passe le tournoi en completed quand la phase 5 est entièrement saisie", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockSubmitGameResults.mockResolvedValue(undefined as any);

      vi.mocked(db.query.game.findFirst).mockResolvedValue({
        id: "g-final",
        phase_id: "p5",
      } as any);

      vi.mocked(db.query.phase.findFirst).mockResolvedValue({
        id: "p5",
        tournament_id: "t-1",
      } as any);

      vi.mocked(db.query.phase.findMany).mockResolvedValue([
        {
          id: "p5",
          tournament_id: "t-1",
          name: "Phase 5",
          order_index: 5,
          total_games: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          brackets: [
            {
              id: "b5",
              name: "challenger",
              games: [
                { id: "g-final", game_number: 1, results: [{ id: "r1" }] },
              ],
            },
          ],
        },
      ] as any);

      vi.mocked(db.query.tournament.findFirst).mockResolvedValue({
        id: "t-1",
        status: "ongoing",
      } as any);

      const whereMock = vi.fn().mockResolvedValue([]);
      const setMock = vi.fn(() => ({ where: whereMock }));
      vi.mocked(db.update).mockReturnValue({ set: setMock } as any);

      const result = await tournamentsActions.submitGameResultsAction(
        "g-final",
        [
          { player_id: "p1", placement: 1 },
          { player_id: "p2", placement: 2 },
          { player_id: "p3", placement: 3 },
          { player_id: "p4", placement: 4 },
          { player_id: "p5", placement: 5 },
          { player_id: "p6", placement: 6 },
          { player_id: "p7", placement: 7 },
          { player_id: "p8", placement: 8 },
        ],
      );

      expect(result.success).toBe(true);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
      );
    });

    it("enchaîne ongoing puis completed sur le flux phase 1 puis finale", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockStartPhase.mockResolvedValue({ phaseId: "p1" } as any);
      mockSubmitGameResults.mockResolvedValue(undefined as any);

      vi.mocked(db.query.phase.findFirst)
        .mockResolvedValueOnce({
          id: "p1",
          order_index: 1,
          tournament_id: "t-1",
        } as any)
        .mockResolvedValueOnce({
          id: "p5",
          tournament_id: "t-1",
        } as any);

      vi.mocked(db.query.tournamentRegistration.findMany).mockResolvedValue(
        Array.from({ length: 64 }, (_, index) => ({
          player_id: `p-${index}`,
        })) as any,
      );

      vi.mocked(db.query.bracket.findMany).mockResolvedValue([
        { id: "b1", phase_id: "p1", name: "common" },
      ] as any);

      vi.mocked(db.query.game.findFirst).mockResolvedValue({
        id: "g-final",
        phase_id: "p5",
      } as any);

      vi.mocked(db.query.phase.findMany)
        .mockResolvedValueOnce([
          {
            id: "p1",
            tournament_id: "t-1",
            name: "Phase 1",
            order_index: 1,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [{ id: "b1", name: "common", games: [] }],
          },
          {
            id: "p5",
            tournament_id: "t-1",
            name: "Phase 5",
            order_index: 5,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [{ id: "b5", name: "challenger", games: [] }],
          },
        ] as any)
        .mockResolvedValueOnce([
          {
            id: "p1",
            tournament_id: "t-1",
            name: "Phase 1",
            order_index: 1,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [
              {
                id: "b1",
                name: "common",
                games: [{ id: "g1", game_number: 1, results: [] }],
              },
            ],
          },
          {
            id: "p5",
            tournament_id: "t-1",
            name: "Phase 5",
            order_index: 5,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [{ id: "b5", name: "challenger", games: [] }],
          },
        ] as any)
        .mockResolvedValueOnce([
          {
            id: "p5",
            tournament_id: "t-1",
            name: "Phase 5",
            order_index: 5,
            total_games: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            brackets: [
              {
                id: "b5",
                name: "challenger",
                games: [
                  { id: "g-final", game_number: 1, results: [{ id: "r1" }] },
                ],
              },
            ],
          },
        ] as any);

      vi.mocked(db.query.tournament.findFirst)
        .mockResolvedValueOnce({ id: "t-1", status: "upcoming" } as any)
        .mockResolvedValueOnce({ id: "t-1", status: "ongoing" } as any);

      const whereMock = vi.fn().mockResolvedValue([]);
      const setMock = vi.fn(() => ({ where: whereMock }));
      vi.mocked(db.update).mockReturnValue({ set: setMock } as any);

      const startResult = await tournamentsActions.startPhase1Action(
        "p1",
        "t-1",
      );
      expect(startResult.success).toBe(true);

      const submitResult = await tournamentsActions.submitGameResultsAction(
        "g-final",
        [
          { player_id: "p1", placement: 1 },
          { player_id: "p2", placement: 2 },
          { player_id: "p3", placement: 3 },
          { player_id: "p4", placement: 4 },
          { player_id: "p5", placement: 5 },
          { player_id: "p6", placement: 6 },
          { player_id: "p7", placement: 7 },
          { player_id: "p8", placement: 8 },
        ],
      );

      expect(submitResult.success).toBe(true);
      expect(setMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ status: "ongoing" }),
      );
      expect(setMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ status: "completed" }),
      );
    });
  });
  describe("addTournamentPlayerToLobbyAction", () => {
    it("ajoute un joueur quand l'utilisateur est authentifie", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockAddTournamentPlayerToLobby.mockResolvedValue(undefined);

      const result = await tournamentsActions.addTournamentPlayerToLobbyAction(
        "game-1",
        "player-1",
      );

      expect(result).toEqual({ success: true });
      expect(mockAddTournamentPlayerToLobby).toHaveBeenCalledWith(
        "game-1",
        "player-1",
      );
    });

    it("retourne un message metier quand l'ajout echoue", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "admin-1" } } as any);
      mockAddTournamentPlayerToLobby.mockRejectedValue(
        new Error("La partie cible est deja pleine (8 joueurs)"),
      );

      const result = await tournamentsActions.addTournamentPlayerToLobbyAction(
        "game-1",
        "player-1",
      );

      expect(result).toEqual({
        success: false,
        error: "La partie cible est deja pleine (8 joueurs)",
      });
    });
  });
});
