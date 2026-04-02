import { env } from "@/utils/environment";
import type { DivisionType, TierType } from "@/types/tournament";

const RIOT_RATE_LIMIT_SHORT_WINDOW_MS = 1000;
const RIOT_RATE_LIMIT_LONG_WINDOW_MS = 120000;
const RIOT_RATE_LIMIT_SHORT_MAX = 20;
const RIOT_RATE_LIMIT_LONG_MAX = 100;

interface RiotAccountResponse {
  puuid: string;
  gameName: string;
  tagLine: string;
}

interface RiotLeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
}

export interface RiotRankData {
  tier: TierType;
  division: DivisionType;
  league_points: number;
}

export class RiotApiError extends Error {
  public readonly status: number;
  public readonly retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = "RiotApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const TIERS_WITHOUT_DIVISION: TierType[] = [
  "CHALLENGER",
  "GRANDMASTER",
  "MASTER",
  "UNRANKED",
];

function ensureRiotConfig() {
  if (!env.RIOT_API_KEY) {
    throw new RiotApiError("RIOT_API_KEY n'est pas configurée", 500);
  }
}

function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const sanitizedRiotId = riotId
    .replace(/＃/g, "#")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  const separatorIndex = sanitizedRiotId.lastIndexOf("#");
  if (separatorIndex <= 0 || separatorIndex === sanitizedRiotId.length - 1) {
    throw new RiotApiError("Riot ID invalide", 400);
  }

  const gameName = sanitizedRiotId.slice(0, separatorIndex).trim();
  const tagLine = sanitizedRiotId.slice(separatorIndex + 1).trim();

  if (!gameName || !tagLine) {
    throw new RiotApiError("Riot ID invalide", 400);
  }

  return {
    gameName,
    tagLine,
  };
}

function normalizeTier(value: string): TierType | null {
  const tier = value.toUpperCase();
  const validTiers = new Set<TierType>([
    "CHALLENGER",
    "GRANDMASTER",
    "MASTER",
    "DIAMOND",
    "EMERALD",
    "PLATINUM",
    "GOLD",
    "SILVER",
    "BRONZE",
    "IRON",
    "UNRANKED",
  ]);

  return validTiers.has(tier as TierType) ? (tier as TierType) : null;
}

function normalizeDivision(tier: TierType, value: string): DivisionType {
  if (TIERS_WITHOUT_DIVISION.includes(tier)) {
    return null;
  }

  const division = value.toUpperCase() as DivisionType;
  const validDivisions: DivisionType[] = ["I", "II", "III", "IV"];

  return validDivisions.includes(division) ? division : null;
}

function buildRiotHeaders() {
  return {
    "X-Riot-Token": env.RIOT_API_KEY,
  };
}

const globalForRiotRateLimit = globalThis as unknown as {
  riotRateLimitTimestamps?: Map<string, number[]>;
};

function getRiotRateLimitStore(): Map<string, number[]> {
  if (!globalForRiotRateLimit.riotRateLimitTimestamps) {
    globalForRiotRateLimit.riotRateLimitTimestamps = new Map();
  }

  return globalForRiotRateLimit.riotRateLimitTimestamps;
}

function getRoutingValueFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForRiotRateLimit(url: string): Promise<void> {
  const routingValue = getRoutingValueFromUrl(url);
  const store = getRiotRateLimitStore();
  const timestamps = store.get(routingValue) || [];

  while (true) {
    const now = Date.now();

    const withinLongWindow = timestamps.filter(
      (timestamp) => now - timestamp < RIOT_RATE_LIMIT_LONG_WINDOW_MS,
    );

    timestamps.length = 0;
    timestamps.push(...withinLongWindow);

    const shortWindowTimestamps = timestamps.filter(
      (timestamp) => now - timestamp < RIOT_RATE_LIMIT_SHORT_WINDOW_MS,
    );

    const shortWindowExceeded =
      shortWindowTimestamps.length >= RIOT_RATE_LIMIT_SHORT_MAX;
    const longWindowExceeded = timestamps.length >= RIOT_RATE_LIMIT_LONG_MAX;

    if (!shortWindowExceeded && !longWindowExceeded) {
      timestamps.push(now);
      store.set(routingValue, timestamps);
      return;
    }

    const oldestShortWindowTimestamp = shortWindowTimestamps[0];
    const oldestLongWindowTimestamp = timestamps[0];

    const waitForShortWindow = oldestShortWindowTimestamp
      ? Math.max(
          0,
          RIOT_RATE_LIMIT_SHORT_WINDOW_MS - (now - oldestShortWindowTimestamp),
        )
      : 0;

    const waitForLongWindow = oldestLongWindowTimestamp
      ? Math.max(
          0,
          RIOT_RATE_LIMIT_LONG_WINDOW_MS - (now - oldestLongWindowTimestamp),
        )
      : 0;

    await sleep(Math.max(waitForShortWindow, waitForLongWindow, 50));
  }
}

async function riotFetch<T>(url: string): Promise<T> {
  await waitForRiotRateLimit(url);

  const response = await fetch(url, {
    headers: buildRiotHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const endpointLabel = (() => {
      try {
        const parsedUrl = new URL(url);
        return `${parsedUrl.hostname}${parsedUrl.pathname}`;
      } catch {
        return url;
      }
    })();

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10) * 1000
      : undefined;

    if (response.status === 404) {
      throw new RiotApiError("Ressource Riot introuvable", 404);
    }

    if (response.status === 400) {
      throw new RiotApiError(
        `Erreur Riot API (400) sur ${endpointLabel}`,
        400,
        retryAfterMs,
      );
    }

    throw new RiotApiError(
      `Erreur Riot API (${response.status})`,
      response.status,
      retryAfterMs,
    );
  }

  return (await response.json()) as T;
}

async function fetchRiotAccount(riotId: string): Promise<RiotAccountResponse> {
  const { gameName, tagLine } = parseRiotId(riotId);
  const accountRegion = env.RIOT_API_ACCOUNT_REGION;
  const url = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

  try {
    return await riotFetch<RiotAccountResponse>(url);
  } catch (error) {
    if (error instanceof RiotApiError && error.status === 400) {
      throw new RiotApiError(
        `${error.message} (gameName="${gameName}", tagLine="${tagLine}", region="${accountRegion}")`,
        400,
        error.retryAfterMs,
      );
    }

    throw error;
  }
}

async function fetchLeagueEntriesByPuuid(
  puuid: string,
): Promise<RiotLeagueEntry[]> {
  const platformRegion = env.RIOT_API_PLATFORM_REGION;
  const url = `https://${platformRegion}.api.riotgames.com/tft/league/v1/by-puuid/${encodeURIComponent(puuid)}`;

  return riotFetch<RiotLeagueEntry[]>(url);
}

export async function fetchTftRankByRiotId(
  riotId: string,
): Promise<RiotRankData | null> {
  ensureRiotConfig();

  const account = await fetchRiotAccount(riotId);
  if (!account.puuid) {
    throw new RiotApiError("PUUID Riot introuvable pour ce compte", 404);
  }

  const entries = await fetchLeagueEntriesByPuuid(account.puuid);

  const rankedEntry = entries.find((entry) => entry.queueType === "RANKED_TFT");

  if (!rankedEntry) {
    return {
      tier: "UNRANKED",
      division: null,
      league_points: 0,
    };
  }

  const tier = normalizeTier(rankedEntry.tier);
  if (!tier) {
    return null;
  }

  return {
    tier,
    division: normalizeDivision(tier, rankedEntry.rank),
    league_points: rankedEntry.leaguePoints ?? 0,
  };
}
