const CHECKMATE_THRESHOLD_BY_BRACKET = {
  challenger: 21,
  master: 18,
  amateur: 18,
} as const;

const FINALS_MAX_GAMES_BY_BRACKET = {
  challenger: 7,
  master: 6,
  amateur: 6,
} as const;

export function getFinalistThresholdByBracket(
  bracketName?: string,
): number | null {
  if (!bracketName) {
    return null;
  }

  return (
    CHECKMATE_THRESHOLD_BY_BRACKET[
      bracketName as keyof typeof CHECKMATE_THRESHOLD_BY_BRACKET
    ] ?? null
  );
}

export function isFinalistByThreshold(
  totalPoints: number,
  bracketName?: string,
): boolean {
  const threshold = getFinalistThresholdByBracket(bracketName);
  return threshold !== null && totalPoints >= threshold;
}

export function getFinalsMaxGamesByBracket(bracketName?: string): number {
  if (!bracketName) {
    return FINALS_MAX_GAMES_BY_BRACKET.master;
  }

  return (
    FINALS_MAX_GAMES_BY_BRACKET[
      bracketName as keyof typeof FINALS_MAX_GAMES_BY_BRACKET
    ] ?? FINALS_MAX_GAMES_BY_BRACKET.master
  );
}

export function getCappedFinalsGamesTotal(
  totalGames: number,
  bracketName: string,
): number {
  return Math.min(totalGames, getFinalsMaxGamesByBracket(bracketName));
}
