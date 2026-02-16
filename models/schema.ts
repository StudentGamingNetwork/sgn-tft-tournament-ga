import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, uuid, pgEnum, integer, check, unique } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const session = pgTable(
    "session",
    {
        id: text("id").primaryKey(),
        expiresAt: timestamp("expires_at").notNull(),
        token: text("token").notNull().unique(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
    },
    (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
    "account",
    {
        id: text("id").primaryKey(),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        accessTokenExpiresAt: timestamp("access_token_expires_at"),
        refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
        scope: text("scope"),
        password: text("password"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
    "verification",
    {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestamp("expires_at").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
    sessions: many(session),
    accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, {
        fields: [session.userId],
        references: [user.id],
    }),
}));

export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, {
        fields: [account.userId],
        references: [user.id],
    }),
}));


// Application-specific models

export const statusEnum = pgEnum("status", ["upcoming", "ongoing", "completed"]);
export const bracketEnum = pgEnum("bracket_type", ["common", "amateur", "master", "challenger"]);

export const tournament = pgTable("tournament", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    year: text("year").notNull(),
    status: statusEnum("status").notNull().default("upcoming"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const team = pgTable("team", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const player = pgTable("player", {
    id: uuid("id").primaryKey().defaultRandom(),
    team_id: uuid("team_id")
        .references(() => team.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    riot_id: text("riot_id").notNull().unique(),
    discord_tag: text("discord_tag"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const phase = pgTable("phase", {
    id: uuid("id").primaryKey().defaultRandom(),
    tournament_id: uuid("tournament_id")
        .references(() => tournament.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order_index: integer("order_index").notNull(),
    total_games: integer("total_games").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const bracket = pgTable("bracket", {
    id: uuid("id").primaryKey().defaultRandom(),
    phase_id: uuid("phase_id")
        .references(() => phase.id, { onDelete: "cascade" }),
    name: bracketEnum("bracket_type").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const game = pgTable("game", {
    id: uuid("id").primaryKey().defaultRandom(),
    bracket_id: uuid("bracket_id")
        .references(() => bracket.id, { onDelete: "cascade" }),
    phase_id: uuid("phase_id")
        .references(() => phase.id, { onDelete: "cascade" }),
    lobby_name: text("lobby_name").notNull(),
    game_number: integer("game_number").notNull(),
    status: statusEnum("status").notNull().default("upcoming"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const lobbyPlayer = pgTable("lobby_player", {
    id: uuid("id").primaryKey().defaultRandom(),
    game_id: uuid("game_id")
        .references(() => game.id, { onDelete: "cascade" }),
    player_id: uuid("player_id")
        .references(() => player.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
}, (table) => [unique("unique_game_player").on(table.game_id, table.player_id)]);

export const results = pgTable("results", {
    id: uuid("id").primaryKey().defaultRandom(),
    game_id: uuid("game_id")
        .references(() => game.id, { onDelete: "cascade" }),
    player_id: uuid("player_id")
        .references(() => player.id, { onDelete: "cascade" }),
    placement: integer("placement").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
}, (table) => [check("placement_valid", sql`${table.placement} >= 1 AND ${table.placement} <= 8`), unique("unique_game_player").on(table.game_id, table.player_id)]);