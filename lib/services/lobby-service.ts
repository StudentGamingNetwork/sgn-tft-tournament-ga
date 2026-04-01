/**
 * Service for managing lobby compositions and validations
 */

import { db } from "@/lib/db";
import { lobbyPlayer, game, player } from "@/models/schema";
import { eq } from "drizzle-orm";
import type { LobbyAssignment } from "@/types/tournament";

/**
 * Get lobby composition for a specific game
 * Returns players with their seeds
 */
export async function getLobbyComposition(gameId: string) {
    const composition = await db.query.lobbyPlayer.findMany({
        where: eq(lobbyPlayer.game_id, gameId),
        with: {
            player: {
                with: {
                    team: true,
                },
            },
        },
    });

    return composition.sort((a, b) => a.seed - b.seed);
}

/**
 * Validate lobby balance for a game
 * Checks:
 * - At least 2 players
 * - Seeds are unique and positive
 */
export async function validateLobbyBalance(gameId: string): Promise<{
    valid: boolean;
    errors: string[];
}> {
    const composition = await getLobbyComposition(gameId);
    const errors: string[] = [];

    // Check player count
    if (composition.length < 2) {
        errors.push(`Expected at least 2 players, found ${composition.length}`);
    }

    // Check seeds
    const seeds = composition.map(c => c.seed);
    const uniqueSeeds = new Set(seeds);

    if (uniqueSeeds.size !== seeds.length) {
        errors.push('Duplicate seeds found');
    }

    const invalidSeeds = seeds.filter(s => s < 1);
    if (invalidSeeds.length > 0) {
        errors.push(`Invalid seeds: ${invalidSeeds.join(', ')}`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Get all lobbies for a specific game number in a phase
 */
export async function getLobbiesForGame(
    phaseId: string,
    gameNumber: number
) {
    const games = await db.query.game.findMany({
        where: eq(game.phase_id, phaseId),
        with: {
            lobbyPlayers: {
                with: {
                    player: true,
                },
            },
        },
    });

    return games.filter(g => g.game_number === gameNumber);
}
