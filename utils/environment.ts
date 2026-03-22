export const env = {
  NEXT_PUBLIC_FRONTEND_URL:
    process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://ga.sgnw.fr",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/sgn-tft-tournamnent-ga",
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID ?? "",
  KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
  KEYCLOAK_ISSUER_URL: process.env.KEYCLOAK_ISSUER_URL ?? "",
  NODE_ENV: process.env.NODE_ENV ?? "development",
};
