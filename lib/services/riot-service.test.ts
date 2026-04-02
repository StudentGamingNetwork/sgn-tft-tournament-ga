import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/environment", () => ({
  env: {
    RIOT_API_KEY: "test-api-key",
    RIOT_API_ACCOUNT_REGION: "europe",
    RIOT_API_PLATFORM_REGION: "euw1",
  },
}));

const { fetchTftRankByRiotId, RiotApiError } = await import("./riot-service");

describe("riotService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("propage une 404 Riot en RiotApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: vi.fn().mockReturnValue(null) },
      }),
    );

    await expect(fetchTftRankByRiotId("PlayerOne#EUW")).rejects.toMatchObject({
      name: "RiotApiError",
      status: 404,
    });
  });

  it("extrait retry-after sur une 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: vi
            .fn()
            .mockImplementation((key: string) =>
              key === "retry-after" ? "3" : null,
            ),
        },
      }),
    );

    try {
      await fetchTftRankByRiotId("PlayerOne#EUW");
      throw new Error("Expected RiotApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(RiotApiError);
      const riotError = error as { status: number; retryAfterMs?: number };
      expect(riotError.status).toBe(429);
      expect(riotError.retryAfterMs).toBe(3000);
    }
  });

  it("normalise le Riot ID avant appel account et expose les params en cas de 400", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: vi.fn().mockReturnValue(null) },
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchTftRankByRiotId("  ATC Panthera＃ATC  "),
    ).rejects.toMatchObject({
      status: 400,
    });

    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain(
      "/riot/account/v1/accounts/by-riot-id/ATC%20Panthera/ATC",
    );
  });

  it("utilise l'endpoint league by-puuid pour récupérer le rank TFT", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue({
          puuid: "test-puuid-123",
          gameName: "ATC Panthera",
          tagLine: "ATC",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([
          {
            queueType: "RANKED_TFT",
            tier: "DIAMOND",
            rank: "II",
            leaguePoints: 44,
          },
        ]),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTftRankByRiotId("ATC Panthera#ATC");

    expect(result).toEqual({
      tier: "DIAMOND",
      division: "II",
      league_points: 44,
    });

    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain("/tft/league/v1/by-puuid/test-puuid-123");
  });
});
