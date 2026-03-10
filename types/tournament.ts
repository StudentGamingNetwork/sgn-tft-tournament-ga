/**
 * Tournament-specific types for seeding, lobbies, and scoring
 */

import {
  tournament,
  team,
  player,
  phase,
  bracket,
  game,
  lobbyPlayer,
  results,
  lobbyRotationMatrix,
  tournamentRegistration,
} from "@/models/schema";

// ============================================================================
// DATABASE TYPES - Inferred from Drizzle ORM schema
// ============================================================================

/**
 * Database entity types (SELECT operations)
 */
export type Tournament = typeof tournament.$inferSelect;
export type Team = typeof team.$inferSelect;
export type Player = typeof player.$inferSelect;
export type Phase = typeof phase.$inferSelect;
export type Bracket = typeof bracket.$inferSelect;
export type Game = typeof game.$inferSelect;
export type LobbyPlayer = typeof lobbyPlayer.$inferSelect;
export type Results = typeof results.$inferSelect;
export type LobbyRotationMatrix = typeof lobbyRotationMatrix.$inferSelect;
export type TournamentRegistration = typeof tournamentRegistration.$inferSelect;

/**
 * Database entity types (INSERT operations)
 */
export type InsertTournament = typeof tournament.$inferInsert;
export type InsertTeam = typeof team.$inferInsert;
export type InsertPlayer = typeof player.$inferInsert;
export type InsertPhase = typeof phase.$inferInsert;
export type InsertBracket = typeof bracket.$inferInsert;
export type InsertGame = typeof game.$inferInsert;
export type InsertLobbyPlayer = typeof lobbyPlayer.$inferInsert;
export type InsertResults = typeof results.$inferInsert;
export type InsertLobbyRotationMatrix = typeof lobbyRotationMatrix.$inferInsert;
export type InsertTournamentRegistration =
  typeof tournamentRegistration.$inferInsert;

// ============================================================================
// ENUM TYPES - Matching database enums
// ============================================================================

/**
 * Tournament or game status
 * Corresponds to statusEnum in schema
 */
export type StatusType = "upcoming" | "ongoing" | "completed";

/**
 * Bracket type for phase categorization
 * Corresponds to bracketEnum in schema
 */
export type BracketType = "common" | "amateur" | "master" | "challenger";

/**
 * Player rank tier
 * Corresponds to tierEnum in schema
 */
export type TierType =
  | "CHALLENGER"
  | "GRANDMASTER"
  | "MASTER"
  | "DIAMOND"
  | "EMERALD"
  | "PLATINUM"
  | "GOLD"
  | "SILVER"
  | "BRONZE"
  | "IRON"
  | "UNRANKED";

/**
 * Division within a tier (null for Challenger/Grandmaster/Master)
 */
export type DivisionType = "I" | "II" | "III" | "IV" | null;

// ============================================================================
// BUSINESS LOGIC TYPES - For algorithms and workflows
// ============================================================================

// ============================================================================
// BUSINESS LOGIC TYPES - For algorithms and workflows
// ============================================================================

/**
 * Input for initial seeding algorithm
 * Subset of Player entity focused on ranking data
 */
export interface SeedingInput {
  player_id: string;
  name: string;
  riot_id: string;
  tier: TierType;
  division: DivisionType;
  league_points: number;
}

/**
 * Player with assigned seed
 * Used by lobby assignment algorithms
 */
export interface SeededPlayer extends SeedingInput {
  seed: number; // Global seed number (lower = better rank, e.g., Phase 2 uses 33-128)
}

/**
 * Lobby assignment for a specific game
 * Business logic representation for game organization
 */
export interface LobbyAssignment {
  lobby_index: number; // 0-based (0 = Lobby A, 1 = Lobby B, etc.)
  lobby_name: string; // "Lobby A", "Lobby B", etc.
  players: SeededPlayer[];
  seed_range: [number, number]; // e.g., [1, 8] for first lobby
}

/**
 * Player statistics for tie-breaking
 * Calculated from game results
 */
export interface PlayerStats {
  player_id: string;
  total_points: number;
  total_games: number;
  avg_placement: number;
  top1_count: number; // Number of 1st places
  top2_count: number;
  top3_count: number;
  top4_count: number;
  top5_count: number;
  top6_count: number;
  top7_count: number;
  top8_count: number;
  placements: number[]; // Array of all placements
}

/**
 * Player ranking with tie-breaker info
 * Final standings calculation result
 */
export interface RankedPlayer {
  player_id: string;
  name: string;
  rank: number; // Final rank (1 = winner)
  total_points: number;
  stats: PlayerStats;
}

/**
 * Tie-breaker criteria in order of priority
 */
export enum TieBreakerCriteria {
  TOTAL_POINTS = "total_points",
  TOP1_COUNT = "top1_count",
  TOP4_COUNT = "top4_count",
  TOP2_COUNT = "top2_count",
  TOP3_COUNT = "top3_count",
  TOP5_COUNT = "top5_count",
  TOP6_COUNT = "top6_count",
  TOP7_COUNT = "top7_count",
  TOP8_COUNT = "top8_count",
  INITIAL_SEED = "initial_seed",
}

// ============================================================================
// DTO TYPES - Data Transfer Objects for API/Service layer
// ============================================================================

/**
 * Game result submission input
 * Points are optional and will be calculated if not provided
 */
export interface GameResult {
  player_id: string;
  placement: number; // 1-8
  points?: number; // Optional, can be calculated from placement
}

/**
 * Rotation matrix for a specific game (business logic representation)
 * Note: DB storage uses flattened structure (LobbyRotationMatrix)
 */
export interface RotationMatrix {
  phase_id: string;
  game_number: number;
  lobbies: number[][]; // Array of arrays, each containing seed numbers
}

/**
 * CSV import data for players
 * Input DTO for bulk player creation
 */
export interface PlayerCSVImport {
  name: string;
  riot_id: string;
  tier: TierType;
  division: DivisionType;
  league_points: number;
  discord_tag?: string;
  team_name?: string;
}

/**
 * Leaderboard entry (aggregated view)
 * Combines Player, Results, and Stats data
 */
export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  player_name: string;
  riot_id: string;
  team_name?: string;
  total_points: number;
  games_played: number;
  avg_placement: number;
  top1_count: number;
  top4_count: number;
}

/**
 * Registration status type
 */
export type RegistrationStatusType = "registered" | "confirmed" | "cancelled";

/**
 * Player with registration and team information
 * Used for displaying tournament participants
 */
export interface PlayerWithRegistration extends Player {
  registration: TournamentRegistration;
  team?: Team | null;
}

/**
 * Validation error for player data
 */
export interface PlayerValidationError {
  line: number;
  field: string;
  value: any;
  message: string;
}
