export type SiteConfig = typeof siteConfig;

export const siteConfig = {
    name: "SGN TFT Tournament",
    description: "Plateforme de gestion de tournois Teamfight Tactics",
    navItems: [
        {
            label: "Accueil",
            href: "/",
        },
        {
            label: "Tournois",
            href: "/tournaments",
        },
        {
            label: "Règles",
            href: "/rules",
        },
        {
            label: "Classement",
            href: "/leaderboard",
        },
    ],
    navMenuItems: [
        {
            label: "Accueil",
            href: "/",
        },
        {
            label: "Tournois",
            href: "/tournaments",
        },
        {
            label: "Règles",
            href: "/rules",
        },
        {
            label: "Classement",
            href: "/leaderboard",
        },
        {
            label: "Profil",
            href: "/profile",
        },
    ],
    links: {
        github: "https://github.com/heroui-inc/heroui",
        twitter: "https://twitter.com/hero_ui",
        docs: "https://heroui.com",
        discord: "https://discord.gg/9b6yyZKmH4",
        sponsor: "https://patreon.com/jrgarciadev",
    },
};
