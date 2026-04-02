import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import { env } from "@/utils/environment";
import { genericOAuth, keycloak } from "better-auth/plugins";

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_FRONTEND_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET || "sgn-tft-tournament-ga-build-secret",
  database: drizzleAdapter(db, { provider: "pg" }),

  plugins: [
    genericOAuth({
      config: [
        keycloak({
          clientId: env.KEYCLOAK_CLIENT_ID,
          clientSecret: env.KEYCLOAK_CLIENT_SECRET,
          issuer: env.KEYCLOAK_ISSUER_URL,
          redirectURI: `${env.NEXT_PUBLIC_FRONTEND_URL}/api/auth/callback/keycloak`,
          pkce: true,
        }),
      ],
    }),
  ],

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
  },

  trustedOrigins: ["http://localhost:3000", env.NEXT_PUBLIC_FRONTEND_URL],
});
