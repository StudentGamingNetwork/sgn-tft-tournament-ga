/**
 * Validation utilities for player data
 */

import type { TierType, DivisionType, PlayerCSVImport } from "@/types/tournament";

/**
 * Validate Riot ID format (name#tag)
 * Example: PlayerName#1234
 */
export function validateRiotId(riotId: string): { valid: boolean; error?: string } {
    if (!riotId || typeof riotId !== "string") {
        return { valid: false, error: "Le Riot ID est requis" };
    }

    const riotIdRegex = /^.+#[A-Z0-9]+$/i;

    if (!riotIdRegex.test(riotId)) {
        return { valid: false, error: "Format invalide. Utilisez le format : Nom#TAG" };
    }

    const parts = riotId.split("#");
    if (parts[0].length < 3 || parts[0].length > 16) {
        return { valid: false, error: "Le nom doit contenir entre 3 et 16 caractères" };
    }

    if (parts[1].length < 3 || parts[1].length > 5) {
        return { valid: false, error: "Le tag doit contenir entre 3 et 5 caractères" };
    }

    return { valid: true };
}

/**
 * Validate tier and division consistency
 * Challenger, Grandmaster, Master, and Unranked tiers don't have divisions
 */
export function validateTierDivision(
    tier: TierType,
    division: DivisionType
): { valid: boolean; error?: string } {
    const tiersWithoutDivision: TierType[] = ["CHALLENGER", "GRANDMASTER", "MASTER", "UNRANKED"];

    if (tiersWithoutDivision.includes(tier)) {
        if (division !== null && division !== undefined) {
            return {
                valid: false,
                error: `Le tier ${tier} ne peut pas avoir de division`,
            };
        }
    } else {
        if (!division) {
            return {
                valid: false,
                error: `Une division est requise pour le tier ${tier}`,
            };
        }

        const validDivisions: DivisionType[] = ["I", "II", "III", "IV"];
        if (!validDivisions.includes(division)) {
            return {
                valid: false,
                error: `Division invalide. Valeurs acceptées : I, II, III, IV`,
            };
        }
    }

    return { valid: true };
}

/**
 * Validate league points
 */
export function validateLeaguePoints(
    leaguePoints: number,
    tier: TierType
): { valid: boolean; error?: string } {
    if (typeof leaguePoints !== "number" || isNaN(leaguePoints)) {
        return { valid: false, error: "Les points de ligue doivent être un nombre" };
    }

    if (leaguePoints < 0) {
        return { valid: false, error: "Les points de ligue ne peuvent pas être négatifs" };
    }

    // Challenger, Grandmaster, and Master can have LP > 100
    const highLPTiers: TierType[] = ["CHALLENGER", "GRANDMASTER", "MASTER"];

    if (!highLPTiers.includes(tier) && leaguePoints > 100) {
        return { valid: false, error: "Les points de ligue ne peuvent pas dépasser 100 pour ce tier" };
    }

    if (highLPTiers.includes(tier) && leaguePoints > 9999) {
        return { valid: false, error: "Les points de ligue ne peuvent pas dépasser 9999" };
    }

    return { valid: true };
}

/**
 * Validate player name
 */
export function validatePlayerName(name: string): { valid: boolean; error?: string } {
    if (!name || typeof name !== "string") {
        return { valid: false, error: "Le nom est requis" };
    }

    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
        return { valid: false, error: "Le nom doit contenir au moins 2 caractères" };
    }

    if (trimmedName.length > 50) {
        return { valid: false, error: "Le nom ne peut pas dépasser 50 caractères" };
    }

    return { valid: true };
}

/**
 * Validate Discord tag format
 */
export function validateDiscordTag(discordTag: string): { valid: boolean; error?: string } {
    if (!discordTag) {
        return { valid: true }; // Discord tag is optional
    }

    // Discord username format (new format without #discriminator or old format with #1234)
    const discordRegex = /^.{2,32}(#\d{4})?$/;

    if (!discordRegex.test(discordTag)) {
        return { valid: false, error: "Format Discord invalide" };
    }

    return { valid: true };
}

/**
 * Validation error for CSV import
 */
export interface PlayerValidationError {
    line: number;
    field: string;
    value: any;
    message: string;
}

/**
 * Parse and validate CSV content for player import
 * Returns parsed data or validation errors
 */
export function parsePlayersCSV(csvContent: string): {
    success: boolean;
    data?: PlayerCSVImport[];
    errors?: PlayerValidationError[];
} {
    const errors: PlayerValidationError[] = [];
    const data: PlayerCSVImport[] = [];

    try {
        const lines = csvContent.trim().split("\n");

        if (lines.length === 0) {
            return {
                success: false,
                errors: [{ line: 0, field: "file", value: "", message: "Le fichier CSV est vide" }],
            };
        }

        // Parse header
        const header = lines[0].split(",").map((h) => h.trim());
        const requiredColumns = ["name", "riot_id", "tier"];

        const missingColumns = requiredColumns.filter((col) => !header.includes(col));
        if (missingColumns.length > 0) {
            return {
                success: false,
                errors: [{
                    line: 0,
                    field: "header",
                    value: header.join(","),
                    message: `Colonnes manquantes : ${missingColumns.join(", ")}`,
                }],
            };
        }

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue; // Skip empty lines

            const values = line.split(",").map((v) => v.trim());
            const row: Record<string, string> = {};

            header.forEach((col, index) => {
                row[col] = values[index] || "";
            });

            const lineNumber = i + 1;

            // Validate name
            const nameValidation = validatePlayerName(row.name);
            if (!nameValidation.valid) {
                errors.push({
                    line: lineNumber,
                    field: "name",
                    value: row.name,
                    message: nameValidation.error!,
                });
            }

            // Validate riot_id
            const riotIdValidation = validateRiotId(row.riot_id);
            if (!riotIdValidation.valid) {
                errors.push({
                    line: lineNumber,
                    field: "riot_id",
                    value: row.riot_id,
                    message: riotIdValidation.error!,
                });
            }

            // Validate tier
            const tier = row.tier?.toUpperCase() as TierType;
            const validTiers: TierType[] = [
                "CHALLENGER", "GRANDMASTER", "MASTER", "DIAMOND", "EMERALD",
                "PLATINUM", "GOLD", "SILVER", "BRONZE", "IRON", "UNRANKED",
            ];

            if (!validTiers.includes(tier)) {
                errors.push({
                    line: lineNumber,
                    field: "tier",
                    value: row.tier,
                    message: `Tier invalide. Valeurs acceptées : ${validTiers.join(", ")}`,
                });
            }

            // Validate division
            const division = (row.division?.toUpperCase() || null) as DivisionType;
            const tierDivisionValidation = validateTierDivision(tier, division);
            if (!tierDivisionValidation.valid) {
                errors.push({
                    line: lineNumber,
                    field: "division",
                    value: row.division,
                    message: tierDivisionValidation.error!,
                });
            }

            // Validate league_points
            const leaguePoints = parseInt(row.league_points || "0", 10);
            const lpValidation = validateLeaguePoints(leaguePoints, tier);
            if (!lpValidation.valid) {
                errors.push({
                    line: lineNumber,
                    field: "league_points",
                    value: row.league_points,
                    message: lpValidation.error!,
                });
            }

            // Validate discord_tag if provided
            if (row.discord_tag) {
                const discordValidation = validateDiscordTag(row.discord_tag);
                if (!discordValidation.valid) {
                    errors.push({
                        line: lineNumber,
                        field: "discord_tag",
                        value: row.discord_tag,
                        message: discordValidation.error!,
                    });
                }
            }

            // If no errors for this row, add to data
            if (!errors.some((e) => e.line === lineNumber)) {
                data.push({
                    name: row.name,
                    riot_id: row.riot_id,
                    tier,
                    division,
                    league_points: leaguePoints,
                    discord_tag: row.discord_tag || undefined,
                    team_name: row.team_name || undefined,
                });
            }
        }

        if (errors.length > 0) {
            return { success: false, errors };
        }

        return { success: true, data };
    } catch (error) {
        return {
            success: false,
            errors: [{
                line: 0,
                field: "file",
                value: "",
                message: `Erreur de parsing : ${error instanceof Error ? error.message : "Erreur inconnue"}`,
            }],
        };
    }
}

/**
 * Validate complete player data
 */
export function validatePlayerData(data: {
    name: string;
    riot_id: string;
    tier: TierType;
    division?: DivisionType;
    league_points: number;
    discord_tag?: string;
}): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    const nameValidation = validatePlayerName(data.name);
    if (!nameValidation.valid) {
        errors.name = nameValidation.error!;
    }

    const riotIdValidation = validateRiotId(data.riot_id);
    if (!riotIdValidation.valid) {
        errors.riot_id = riotIdValidation.error!;
    }

    const tierDivisionValidation = validateTierDivision(data.tier, data.division || null);
    if (!tierDivisionValidation.valid) {
        errors.division = tierDivisionValidation.error!;
    }

    const lpValidation = validateLeaguePoints(data.league_points, data.tier);
    if (!lpValidation.valid) {
        errors.league_points = lpValidation.error!;
    }

    if (data.discord_tag) {
        const discordValidation = validateDiscordTag(data.discord_tag);
        if (!discordValidation.valid) {
            errors.discord_tag = discordValidation.error!;
        }
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
    };
}
