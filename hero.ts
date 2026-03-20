import { heroui } from "@heroui/theme";

export default heroui({
  themes: {
    dark: {
      colors: {
        background: "#212530",
        foreground: "#FFFFFF",
        primary: {
          DEFAULT: "#E56F0B",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#282D3E",
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: "#549B33",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#CBBD25",
          foreground: "#212530",
        },
        danger: {
          DEFAULT: "#CD3333",
          foreground: "#FFFFFF",
        },
        focus: "#E56F0B",
        divider: "rgba(255,255,255,0.1)",
      },
    },
    light: {
      colors: {
        background: "#FFFFFF",
        foreground: "#212530",
        primary: {
          DEFAULT: "#E56F0B",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#F5F6F8",
          foreground: "#212530",
        },
        success: {
          DEFAULT: "#40732E",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#D7C929",
          foreground: "#212530",
        },
        danger: {
          DEFAULT: "#9C2727",
          foreground: "#FFFFFF",
        },
        focus: "#E56F0B",
        divider: "#D1D5DB",
      },
    },
  },
});
