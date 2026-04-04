/**
 * Service for managing players
 * Handles CRUD operations and CSV import for players
 */

import { db } from "@/lib/db";
import { player, team } from "@/models/schema";
import { eq, and } from "drizzle-orm";
import type {
  PlayerCSVImport,
  TierType,
  DivisionType,
} from "@/types/tournament";

/**
 * Create a new player
 */
export async function createPlayer(data: {
  name: string;
  riot_id: string;
  tier?: TierType;
  division?: DivisionType;
  league_points?: number;
  discord_tag?: string;
  team_id?: string;
}) {
  const [newPlayer] = await db
    .insert(player)
    .values({
      name: data.name,
      riot_id: data.riot_id,
      tier: data.tier,
      division: data.division ?? null,
      league_points: data.league_points,
      discord_tag: data.discord_tag,
      team_id: data.team_id,
    })
    .returning();

  return newPlayer;
}

/**
 * Update player rank information
 */
export async function updatePlayerRank(
  playerId: string,
  rankData: {
    tier: TierType;
    division?: DivisionType;
    league_points: number;
  },
) {
  const [updated] = await db
    .update(player)
    .set({
      tier: rankData.tier,
      division: rankData.division,
      league_points: rankData.league_points,
      updatedAt: new Date(),
    })
    .where(eq(player.id, playerId))
    .returning();

  return updated;
}

/**
 * Get player by ID with team information
 */
export async function getPlayerWithTeam(playerId: string) {
  const result = await db.query.player.findFirst({
    where: eq(player.id, playerId),
    with: {
      team: true,
    },
  });

  return result;
}

/**
 * Get player by riot ID
 */
export async function getPlayerByRiotId(riotId: string) {
  const result = await db.query.player.findFirst({
    where: eq(player.riot_id, riotId),
  });

  return result;
}

/**
 * Get all players
 */
export async function getAllPlayers() {
  return await db.query.player.findMany({
    with: {
      team: true,
    },
  });
}

/**
 * Import players from CSV data
 * Creates teams if they don't exist
 *
 * @param csvData - Array of player data from CSV
 * @returns Array of created players
 */
export async function importPlayersFromCSV(csvData: PlayerCSVImport[]) {
  const createdPlayers = [];

  for (const playerData of csvData) {
    const effectiveName = (playerData.name || "").trim();
    if (!effectiveName) {
      throw new Error("Le nom du joueur est requis");
    }

    // Check if player already exists
    const existing = await getPlayerByRiotId(playerData.riot_id);
    if (existing) {
      if (existing.name !== effectiveName) {
        await updatePlayer(existing.id, {
          name: effectiveName,
        });
      }

      // Update existing player
      if (playerData.tier !== undefined) {
        const updated = await updatePlayerRank(existing.id, {
          tier: playerData.tier,
          division: playerData.division,
          league_points: playerData.league_points ?? 0,
        });
        createdPlayers.push(updated);
      } else {
        createdPlayers.push(existing);
      }
      continue;
    }

    // Handle team creation/lookup
    let teamId: string | undefined;
    if (playerData.team_name) {
      // Check if team exists
      const existingTeam = await db.query.team.findFirst({
        where: eq(team.name, playerData.team_name),
      });

      if (existingTeam) {
        teamId = existingTeam.id;
      } else {
        // Create new team
        const [newTeam] = await db
          .insert(team)
          .values({
            name: playerData.team_name,
          })
          .returning();
        teamId = newTeam.id;
      }
    }

    // Create player
    const newPlayer = await createPlayer({
      name: effectiveName,
      riot_id: playerData.riot_id,
      tier: playerData.tier,
      division: playerData.division,
      league_points: playerData.league_points,
      discord_tag: playerData.discord_tag,
      team_id: teamId,
    });

    createdPlayers.push(newPlayer);
  }

  return createdPlayers;
}

/**
 * Delete a player
 */
export async function deletePlayer(playerId: string) {
  const [deleted] = await db
    .delete(player)
    .where(eq(player.id, playerId))
    .returning();

  return deleted;
}

/**
 * Get players by team
 */
export async function getPlayersByTeam(teamId: string) {
  return await db.query.player.findMany({
    where: eq(player.team_id, teamId),
  });
}

/**
 * Update player team
 */
export async function updatePlayerTeam(
  playerId: string,
  teamId: string | null,
) {
  const [updated] = await db
    .update(player)
    .set({
      team_id: teamId,
      updatedAt: new Date(),
    })
    .where(eq(player.id, playerId))
    .returning();

  return updated;
}

/**
 * Update player information
 */
export async function updatePlayer(
  playerId: string,
  data: {
    name?: string;
    discord_tag?: string;
    tier?: TierType | null;
    division?: DivisionType;
    league_points?: number | null;
    team_id?: string | null;
  },
) {
  const updateData: any = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.discord_tag !== undefined) updateData.discord_tag = data.discord_tag;
  if (data.tier !== undefined) updateData.tier = data.tier;
  if (data.division !== undefined) updateData.division = data.division ?? null;
  if (data.league_points !== undefined)
    updateData.league_points = data.league_points;
  if (data.team_id !== undefined) updateData.team_id = data.team_id;

  const [updated] = await db
    .update(player)
    .set(updateData)
    .where(eq(player.id, playerId))
    .returning();

  return updated;
}
