import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";
import { env } from "@/utils/environment";

export const authClient = createAuthClient({
  baseURL: env.FRONTEND_URL,
  plugins: [genericOAuthClient()],
});
