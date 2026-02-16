import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/models/schema";
import { createDbConnection } from "@/utils/dbConnection";
import { env } from "@/utils/environment";


const globalForDb = globalThis as unknown as {
    drizzle: NodePgDatabase<typeof schema>;
};

const db = globalForDb.drizzle || createDbConnection();

// Only store in global during development to prevent hot reload issues
if (env.NODE_ENV !== "production") {
    globalForDb.drizzle = db;
}

export { db };
