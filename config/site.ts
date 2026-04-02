export type SiteConfig = typeof siteConfig;

const OFFICIAL_RULES_URL =
  "https://backoffice.gamers-assembly.net/sites/default/files/tournament/GA2026%20-%20R%C3%A8glement%20-%20TFT.docx_.pdf";

export const siteConfig = {
  name: "Spatula Tour - Teamfight Tactic",
  description: "Gamers Assembly 2026 : Festival Edition",
  navItems: [
    {
      label: "Accueil",
      href: "/",
    },
    {
      label: "Tournoi",
      href: "/tournament",
    },
    {
      label: "Règlement officiel",
      href: OFFICIAL_RULES_URL,
    },
  ],
  navMenuItems: [
    {
      label: "Accueil",
      href: "/",
    },
    {
      label: "Tournoi",
      href: "/tournament",
    },
    {
      label: "Règlement officiel",
      href: OFFICIAL_RULES_URL,
    },
    {
      label: "Profil",
      href: "/admin/tournaments",
    },
  ],
  links: {
    github: "https://github.com/heroui-inc/heroui",
    twitter: "https://twitter.com/hero_ui",
    docs: "https://heroui.com",
    discord: "https://discord.gg/9b6yyZKmH4",
    sponsor: "https://patreon.com/jrgarciadev",
    rules: OFFICIAL_RULES_URL,
  },
};
