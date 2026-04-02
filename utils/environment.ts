export const env = {
  NEXT_PUBLIC_FRONTEND_URL:
    process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://ga.sgnw.fr",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/sgn-tft-tournamnent-ga",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID ?? "",
  KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
  KEYCLOAK_ISSUER_URL: process.env.KEYCLOAK_ISSUER_URL ?? "",
  RIOT_API_KEY: process.env.RIOT_API_KEY ?? "",
  RIOT_API_ACCOUNT_REGION: process.env.RIOT_API_ACCOUNT_REGION ?? "europe",
  RIOT_API_PLATFORM_REGION: process.env.RIOT_API_PLATFORM_REGION ?? "euw1",
  RIOT_RANK_SYNC_THROTTLE_MS: process.env.RIOT_RANK_SYNC_THROTTLE_MS ?? "4000",
  RIOT_RANK_SYNC_INTERVAL_MS:
    process.env.RIOT_RANK_SYNC_INTERVAL_MS ?? "1800000",
  NODE_ENV: process.env.NODE_ENV ?? "development",
};
