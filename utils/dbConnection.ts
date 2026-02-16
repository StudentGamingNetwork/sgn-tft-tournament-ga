import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/utils/environment";
import * as schema from "@/models/schema";

// Need a database for production? Just claim it by running `npm run neon:claim`.
// Tested and compatible with Next.js Boilerplate
export const createDbConnection = () => {
    const pool = new Pool({
        connectionString: env.DATABASE_URL,
        max: 1,
    });

    return drizzle({
        client: pool,
        schema,
    });
};
