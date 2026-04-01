import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uuid,
  pgEnum,
  integer,
  check,
  unique,
} from "drizzle-orm/pg-core";

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

export const statusEnum = pgEnum("status", [
  "upcoming",
  "ongoing",
  "completed",
]);
export const bracketEnum = pgEnum("bracket_type", [
  "common",
  "amateur",
  "master",
  "challenger",
]);
export const tierEnum = pgEnum("tier", [
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

export const tournament = pgTable("tournament", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  year: text("year").notNull(),
  status: statusEnum("status").notNull().default("upcoming"),
  is_simulation: boolean("is_simulation").notNull().default(false),
  structure_image_url: text("structure_image_url"),
  rules_url: text("rules_url"),
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
  team_id: uuid("team_id").references(() => team.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  riot_id: text("riot_id").notNull().unique(),
  discord_tag: text("discord_tag"),
  tier: tierEnum("tier"),
  division: text("division"), // "I", "II", "III", "IV" - null for Challenger/Grandmaster
  league_points: integer("league_points"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const phase = pgTable("phase", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournament_id: uuid("tournament_id").references(() => tournament.id, {
    onDelete: "cascade",
  }),
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
  phase_id: uuid("phase_id").references(() => phase.id, {
    onDelete: "cascade",
  }),
  name: bracketEnum("bracket_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const game = pgTable("game", {
  id: uuid("id").primaryKey().defaultRandom(),
  bracket_id: uuid("bracket_id").references(() => bracket.id, {
    onDelete: "cascade",
  }),
  phase_id: uuid("phase_id").references(() => phase.id, {
    onDelete: "cascade",
  }),
  lobby_name: text("lobby_name").notNull(),
  game_number: integer("game_number").notNull(),
  status: statusEnum("status").notNull().default("upcoming"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const lobbyPlayer = pgTable(
  "lobby_player",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    game_id: uuid("game_id").references(() => game.id, { onDelete: "cascade" }),
    player_id: uuid("player_id").references(() => player.id, {
      onDelete: "cascade",
    }),
    seed: integer("seed").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_game_player_lobby").on(table.game_id, table.player_id),
  ],
);

export const results = pgTable(
  "results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    game_id: uuid("game_id").references(() => game.id, { onDelete: "cascade" }),
    player_id: uuid("player_id").references(() => player.id, {
      onDelete: "cascade",
    }),
    placement: integer("placement").notNull(),
    points: integer("points").notNull(), // Calculated based on placement
    result_status: resultStatusEnum("result_status").notNull().default("normal"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    check(
      "placement_valid",
      sql`${table.placement} >= 0 AND ${table.placement} <= 8`,
    ),
    unique("unique_game_player_result").on(table.game_id, table.player_id),
  ],
);

export const lobbyRotationMatrix = pgTable(
  "lobby_rotation_matrix",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phase_id: uuid("phase_id").references(() => phase.id, {
      onDelete: "cascade",
    }),
    game_number: integer("game_number").notNull(),
    lobby_index: integer("lobby_index").notNull(), // 0-based lobby index (0 = Lobby A, 1 = Lobby B, etc.)
    seed_assignments: text("seed_assignments").notNull(), // JSON array of seed numbers for this lobby
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_phase_game_lobby").on(
      table.phase_id,
      table.game_number,
      table.lobby_index,
    ),
  ],
);

export const registrationStatusEnum = pgEnum("registration_status", [
  "registered",
  "confirmed",
  "cancelled",
]);

export const resultStatusEnum = pgEnum("result_status", ["normal", "forfeit"]);

export const tournamentRegistration = pgTable(
  "tournament_registration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournament_id: uuid("tournament_id")
      .references(() => tournament.id, { onDelete: "cascade" })
      .notNull(),
    player_id: uuid("player_id")
      .references(() => player.id, { onDelete: "cascade" })
      .notNull(),
    status: registrationStatusEnum("status").notNull().default("registered"),
    registered_at: timestamp("registered_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    forfeited_at: timestamp("forfeited_at"),
  },
  (table) => [
    unique("unique_tournament_player").on(table.tournament_id, table.player_id),
  ],
);

export const tournamentRelations = relations(tournament, ({ many }) => ({
  phases: many(phase),
  registrations: many(tournamentRegistration),
}));

export const phaseRelations = relations(phase, ({ one, many }) => ({
  tournament: one(tournament, {
    fields: [phase.tournament_id],
    references: [tournament.id],
  }),
  brackets: many(bracket),
  games: many(game),
  rotationMatrices: many(lobbyRotationMatrix),
}));

export const bracketRelations = relations(bracket, ({ one, many }) => ({
  phase: one(phase, {
    fields: [bracket.phase_id],
    references: [phase.id],
  }),
  games: many(game),
}));

export const gameRelations = relations(game, ({ one, many }) => ({
  phase: one(phase, {
    fields: [game.phase_id],
    references: [phase.id],
  }),
  bracket: one(bracket, {
    fields: [game.bracket_id],
    references: [bracket.id],
  }),
  lobbyPlayers: many(lobbyPlayer),
  results: many(results),
}));

export const playerRelations = relations(player, ({ one, many }) => ({
  team: one(team, {
    fields: [player.team_id],
    references: [team.id],
  }),
  lobbyPlayers: many(lobbyPlayer),
  results: many(results),
  tournamentRegistrations: many(tournamentRegistration),
}));

export const teamRelations = relations(team, ({ many }) => ({
  players: many(player),
}));

export const resultsRelations = relations(results, ({ one }) => ({
  game: one(game, {
    fields: [results.game_id],
    references: [game.id],
  }),
  player: one(player, {
    fields: [results.player_id],
    references: [player.id],
  }),
}));

export const lobbyPlayerRelations = relations(lobbyPlayer, ({ one }) => ({
  game: one(game, {
    fields: [lobbyPlayer.game_id],
    references: [game.id],
  }),
  player: one(player, {
    fields: [lobbyPlayer.player_id],
    references: [player.id],
  }),
}));

export const lobbyRotationMatrixRelations = relations(
  lobbyRotationMatrix,
  ({ one }) => ({
    phase: one(phase, {
      fields: [lobbyRotationMatrix.phase_id],
      references: [phase.id],
    }),
  }),
);

export const tournamentRegistrationRelations = relations(
  tournamentRegistration,
  ({ one }) => ({
    tournament: one(tournament, {
      fields: [tournamentRegistration.tournament_id],
      references: [tournament.id],
    }),
    player: one(player, {
      fields: [tournamentRegistration.player_id],
      references: [player.id],
    }),
  }),
);
