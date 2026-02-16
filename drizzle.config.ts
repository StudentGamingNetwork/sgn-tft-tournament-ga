import { defineConfig } from "drizzle-kit";
import { env } from "@/utils/environment";

export default defineConfig({
    out: "./migrations",
    schema: "./models/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: env.DATABASE_URL ?? "",
    },
    verbose: true,
    strict: true,

});
