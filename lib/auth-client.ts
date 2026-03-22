import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";
import { env } from "@/utils/environment";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_FRONTEND_URL,
  plugins: [genericOAuthClient()],
});
