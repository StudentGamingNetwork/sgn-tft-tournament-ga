/**
 * Validation utilities for player data
 */

import type {
  TierType,
  DivisionType,
  PlayerCSVImport,
} from "@/types/tournament";

export const PLAYER_CSV_COLUMNS = [
  "name",
  "riot_id",
  "tier",
  "division",
  "league_points",
  "discord_tag",
  "team_name",
] as const;

export type PlayerCsvColumn = (typeof PLAYER_CSV_COLUMNS)[number];

export const PLAYER_CSV_REQUIRED_COLUMNS: PlayerCsvColumn[] = ["riot_id"];

export type PlayerCsvColumnMapping = Record<PlayerCsvColumn, string | null>;

const HEADER_ALIASES: Record<PlayerCsvColumn, string[]> = {
  name: ["name", "nom", "playername", "player_name"],
  riot_id: ["riot_id", "riotid", "riot id", "summoner", "summoner_name"],
  tier: ["tier", "rank", "rang"],
  division: ["division", "div", "rank_division"],
  league_points: [
    "league_points",
    "lp",
    "points",
    "points_ligue",
    "leaguepoints",
  ],
  discord_tag: ["discord_tag", "discord", "discord_id", "discordtag"],
  team_name: ["team_name", "team", "equipe", "teamname"],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function extractCsvHeaders(csvContent: string): string[] {
  const firstLine = csvContent.split(/\r?\n/)[0] || "";
  return firstLine
    .split(",")
    .map((header) => header.trim())
    .filter((header) => header.length > 0);
}

export function buildDefaultPlayerCsvMapping(
  headers: string[],
): PlayerCsvColumnMapping {
  const normalizedToOriginal = new Map<string, string>();
  headers.forEach((header) => {
    normalizedToOriginal.set(normalizeHeader(header), header);
  });

  const mapping = {} as PlayerCsvColumnMapping;
  for (const column of PLAYER_CSV_COLUMNS) {
    let matchedHeader: string | null = null;
    for (const alias of HEADER_ALIASES[column]) {
      const candidate = normalizedToOriginal.get(normalizeHeader(alias));
      if (candidate) {
        matchedHeader = candidate;
        break;
      }
    }
    mapping[column] = matchedHeader;
  }

  return mapping;
}

/**
 * Validate Riot ID format (name#tag)
 * Example: PlayerName#1234
 */
export function validateRiotId(riotId: string): {
  valid: boolean;
  error?: string;
} {
  if (!riotId || typeof riotId !== "string") {
    return { valid: false, error: "Le Riot ID est requis" };
  }

  const riotIdRegex = /^.+#[A-Z0-9]+$/i;

  if (!riotIdRegex.test(riotId)) {
    return {
      valid: false,
      error: "Format invalide. Utilisez le format : Nom#TAG",
    };
  }

  const parts = riotId.split("#");
  if (parts[0].length < 3 || parts[0].length > 16) {
    return {
      valid: false,
      error: "Le nom doit contenir entre 3 et 16 caractères",
    };
  }

  if (parts[1].length < 3 || parts[1].length > 5) {
    return {
      valid: false,
      error: "Le tag doit contenir entre 3 et 5 caractères",
    };
  }

  return { valid: true };
}

/**
 * Validate tier and division consistency
 * Challenger, Grandmaster, Master, and Unranked tiers don't have divisions
 */
export function validateTierDivision(
  tier: TierType,
  division: DivisionType,
): { valid: boolean; error?: string } {
  const tiersWithoutDivision: TierType[] = [
    "CHALLENGER",
    "GRANDMASTER",
    "MASTER",
    "UNRANKED",
  ];

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
  tier: TierType,
): { valid: boolean; error?: string } {
  if (typeof leaguePoints !== "number" || isNaN(leaguePoints)) {
    return {
      valid: false,
      error: "Les points de ligue doivent être un nombre",
    };
  }

  if (leaguePoints < 0) {
    return {
      valid: false,
      error: "Les points de ligue ne peuvent pas être négatifs",
    };
  }

  // Challenger, Grandmaster, and Master can have LP > 100
  const highLPTiers: TierType[] = ["CHALLENGER", "GRANDMASTER", "MASTER"];

  if (!highLPTiers.includes(tier) && leaguePoints > 100) {
    return {
      valid: false,
      error: "Les points de ligue ne peuvent pas dépasser 100 pour ce tier",
    };
  }

  if (highLPTiers.includes(tier) && leaguePoints > 9999) {
    return {
      valid: false,
      error: "Les points de ligue ne peuvent pas dépasser 9999",
    };
  }

  return { valid: true };
}

/**
 * Validate player name
 */
export function validatePlayerName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Le nom est requis" };
  }

  const trimmedName = name.trim();

  if (trimmedName.length < 2) {
    return {
      valid: false,
      error: "Le nom doit contenir au moins 2 caractères",
    };
  }

  if (trimmedName.length > 50) {
    return { valid: false, error: "Le nom ne peut pas dépasser 50 caractères" };
  }

  return { valid: true };
}

/**
 * Validate Discord tag format
 */
export function validateDiscordTag(discordTag: string): {
  valid: boolean;
  error?: string;
} {
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
};
export function parsePlayersCSV(
  csvContent: string,
  mapping: PlayerCsvColumnMapping,
): {
  success: boolean;
  data?: PlayerCSVImport[];
  errors?: PlayerValidationError[];
};
export function parsePlayersCSV(
  csvContent: string,
  mapping?: PlayerCsvColumnMapping,
): {
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
        errors: [
          {
            line: 0,
            field: "file",
            value: "",
            message: "Le fichier CSV est vide",
          },
        ],
      };
    }

    // Parse header
    const header = lines[0].split(",").map((h) => h.trim());
    const effectiveMapping: PlayerCsvColumnMapping = mapping || {
      name: header.includes("name") ? "name" : null,
      riot_id: header.includes("riot_id") ? "riot_id" : null,
      tier: header.includes("tier") ? "tier" : null,
      division: header.includes("division") ? "division" : null,
      league_points: header.includes("league_points") ? "league_points" : null,
      discord_tag: header.includes("discord_tag") ? "discord_tag" : null,
      team_name: header.includes("team_name") ? "team_name" : null,
    };

    const missingColumns = PLAYER_CSV_REQUIRED_COLUMNS.filter((column) => {
      const mappedHeader = effectiveMapping[column];
      return !mappedHeader || !header.includes(mappedHeader);
    });

    if (missingColumns.length > 0) {
      return {
        success: false,
        errors: [
          {
            line: 0,
            field: "header",
            value: JSON.stringify(effectiveMapping),
            message: `Colonnes manquantes : ${missingColumns.join(", ")}`,
          },
        ],
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

      const mappedValue = (column: PlayerCsvColumn): string => {
        const mappedHeader = effectiveMapping[column];
        if (!mappedHeader) {
          return "";
        }
        return row[mappedHeader] || "";
      };

      const lineNumber = i + 1;

      // Validate riot_id
      const riotId = mappedValue("riot_id");
      const riotIdValidation = validateRiotId(riotId);
      if (!riotIdValidation.valid) {
        errors.push({
          line: lineNumber,
          field: "riot_id",
          value: riotId,
          message: riotIdValidation.error!,
        });
      }

      // Validate name only when provided
      const rawPlayerName = mappedValue("name");
      if (rawPlayerName) {
        const nameValidation = validatePlayerName(rawPlayerName);
        if (!nameValidation.valid) {
          errors.push({
            line: lineNumber,
            field: "name",
            value: rawPlayerName,
            message: nameValidation.error!,
          });
        }
      }

      const fallbackName = riotId.split("#")[0]?.trim();
      const playerName = rawPlayerName || fallbackName;

      const rawTier = mappedValue("tier");
      const tier = rawTier ? (rawTier.toUpperCase() as TierType) : undefined;
      const validTiers: TierType[] = [
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
      ];

      if (tier && !validTiers.includes(tier)) {
        errors.push({
          line: lineNumber,
          field: "tier",
          value: mappedValue("tier"),
          message: `Tier invalide. Valeurs acceptées : ${validTiers.join(", ")}`,
        });
      }

      // Validate division only when a tier is provided
      const rawDivision = mappedValue("division");
      const division = rawDivision
        ? (rawDivision.toUpperCase() as DivisionType)
        : null;
      if (tier) {
        const tierDivisionValidation = validateTierDivision(tier, division);
        if (!tierDivisionValidation.valid) {
          errors.push({
            line: lineNumber,
            field: "division",
            value: mappedValue("division"),
            message: tierDivisionValidation.error!,
          });
        }
      } else if (rawDivision) {
        errors.push({
          line: lineNumber,
          field: "division",
          value: mappedValue("division"),
          message: "Le tier est requis quand une division est renseignée",
        });
      }

      // Validate league_points only when provided
      const rawLeaguePoints = mappedValue("league_points");
      const hasLeaguePoints = rawLeaguePoints.length > 0;
      const leaguePoints = hasLeaguePoints
        ? parseInt(rawLeaguePoints, 10)
        : undefined;
      if (hasLeaguePoints) {
        if (!tier) {
          errors.push({
            line: lineNumber,
            field: "league_points",
            value: mappedValue("league_points"),
            message:
              "Le tier est requis quand des points de ligue sont renseignés",
          });
        } else {
          const lpValidation = validateLeaguePoints(
            leaguePoints as number,
            tier,
          );
          if (!lpValidation.valid) {
            errors.push({
              line: lineNumber,
              field: "league_points",
              value: mappedValue("league_points"),
              message: lpValidation.error!,
            });
          }
        }
      }

      // Validate discord_tag if provided
      const discordTag = mappedValue("discord_tag");
      if (discordTag) {
        const discordValidation = validateDiscordTag(discordTag);
        if (!discordValidation.valid) {
          errors.push({
            line: lineNumber,
            field: "discord_tag",
            value: discordTag,
            message: discordValidation.error!,
          });
        }
      }

      // If no errors for this row, add to data
      if (!errors.some((e) => e.line === lineNumber)) {
        data.push({
          name: playerName,
          riot_id: riotId,
          tier,
          division,
          league_points: leaguePoints,
          discord_tag: discordTag || undefined,
          team_name: mappedValue("team_name") || undefined,
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
      errors: [
        {
          line: 0,
          field: "file",
          value: "",
          message: `Erreur de parsing : ${error instanceof Error ? error.message : "Erreur inconnue"}`,
        },
      ],
    };
  }
}

/**
 * Validate complete player data
 */
export function validatePlayerData(data: {
  name?: string;
  riot_id: string;
  tier?: TierType;
  division?: DivisionType;
  league_points?: number;
  discord_tag?: string;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (data.name !== undefined && data.name.trim().length > 0) {
    const nameValidation = validatePlayerName(data.name);
    if (!nameValidation.valid) {
      errors.name = nameValidation.error!;
    }
  }

  const riotIdValidation = validateRiotId(data.riot_id);
  if (!riotIdValidation.valid) {
    errors.riot_id = riotIdValidation.error!;
  }

  if (data.tier) {
    const tierDivisionValidation = validateTierDivision(
      data.tier,
      data.division || null,
    );
    if (!tierDivisionValidation.valid) {
      errors.division = tierDivisionValidation.error!;
    }
  } else if (data.division) {
    errors.division = "Le tier est requis quand une division est renseignée";
  }

  if (data.league_points !== undefined && data.league_points !== null) {
    if (!data.tier) {
      errors.league_points =
        "Le tier est requis quand des points de ligue sont renseignés";
    } else {
      const lpValidation = validateLeaguePoints(data.league_points, data.tier);
      if (!lpValidation.valid) {
        errors.league_points = lpValidation.error!;
      }
    }
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
