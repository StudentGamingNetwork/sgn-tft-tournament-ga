export type SiteConfig = typeof siteConfig;

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
      href: "/rules",
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
      href: "/rules",
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
    rules: "https://www.gamersassembly.gg",
  },
};
