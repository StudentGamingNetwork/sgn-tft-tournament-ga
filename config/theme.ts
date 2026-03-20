/**
 * SGN Branding Theme Configuration
 * Tokens HeroUI intégrés pour les thèmes light et dark
 */

export const sgnTheme = {
  dark: {
    colors: {
      background: "#212530",
      foreground: "#FFFFFF",
      primary: "#E56F0B",
      primaryHover: "#F28C2D",
      secondary: "#282D3E",
      surface: "#2D3349",
      success: "#549B33",
      warning: "#CBBD25",
      error: "#CD3333",
      info: "#3299CC",
      border: "#2D3349",
      divider: "rgba(255, 255, 255, 0.1)",
    },
    text: {
      primary: "#FFFFFF",
      secondary: "rgba(255, 255, 255, 0.8)",
      tertiary: "rgba(255, 255, 255, 0.5)",
      disabled: "rgba(255, 255, 255, 0.2)",
    },
  },
  light: {
    colors: {
      background: "#FFFFFF",
      foreground: "#212530",
      primary: "#E56F0B",
      primaryHover: "#F28C2D",
      secondary: "#F5F6F8",
      surface: "#FFFFFF",
      success: "#40732E",
      warning: "#D7C929",
      error: "#9C2727",
      info: "#29749C",
      border: "#E5E7EB",
      divider: "#D1D5DB",
    },
    text: {
      primary: "#212530",
      secondary: "rgba(33, 37, 48, 0.8)",
      tertiary: "rgba(33, 37, 48, 0.5)",
      disabled: "rgba(33, 37, 48, 0.2)",
    },
  },
};

/**
 * Brand Color Palette
 * Réutilisable indépendamment du thème
 */
export const sgnBrand = {
  primary: "#E56F0B",
  primaryHover: "#F28C2D",
  gradient: "linear-gradient(135deg, #EC7400, #F5CC3F)",
  secondary: "#282D3E",
} as const;

/**
 * Semantic Colors
 */
export const sgnSemantic = {
  success: {
    dark: "#549B33",
    light: "#40732E",
  },
  warning: {
    dark: "#CBBD25",
    light: "#D7C929",
  },
  error: {
    dark: "#CD3333",
    light: "#9C2727",
  },
  info: {
    dark: "#3299CC",
    light: "#29749C",
  },
} as const;

/**
 * Utility: Get current theme colors
 * @param isDark - Whether to use dark theme colors
 * @returns Theme colors object
 */
export const getThemeColors = (isDark: boolean) => {
  return isDark ? sgnTheme.dark.colors : sgnTheme.light.colors;
};

/**
 * Utility: Get colors with opacity
 * @param color - Base color hex
 * @param opacity - Opacity percentage (0-100)
 * @returns Color with opacity
 */
export const withOpacity = (color: string, opacity: number): string => {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
};
