"use client";

import {
    Navbar as HeroNavbar,
    NavbarBrand,
    NavbarContent,
    NavbarItem,
    NavbarMenu,
    NavbarMenuItem,
    NavbarMenuToggle,
} from "@heroui/navbar";
import { Button } from "@heroui/button";
import { Link } from "@heroui/link";
import { link as linkStyles } from "@heroui/theme";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import Image from "next/image";
import { ShieldCheck, LogOut } from "lucide-react";
import { useState } from "react";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import { authClient } from "@/lib/auth-client";
import { env } from "@/utils/environment";

export const Navbar = () => {
    const router = useRouter();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { data: session } = authClient.useSession();

    const isLoggedIn = !!session;
    console.log(env.NEXT_PUBLIC_FRONTEND_URL);

    const handleAdminClick = () => {
        if (isLoggedIn) {
            router.push("/admin/tournaments");
        }
        else {
            authClient.signIn.oauth2({
                providerId: "keycloak",
                callbackURL: `${env.NEXT_PUBLIC_FRONTEND_URL}/admin/tournaments`,
            });
        }
    };

    return (
        <HeroNavbar
            maxWidth="xl"
            position="sticky"
            isMenuOpen={isMenuOpen}
            onMenuOpenChange={setIsMenuOpen}
            className="border-b border-divider bg-background/90 backdrop-blur"
        >
            {/* Toggle menu mobile */}
            <NavbarContent className="sm:hidden" justify="start">
                <NavbarMenuToggle
                    aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
                />
            </NavbarContent>

            {/* Logos à gauche */}
            <NavbarContent className="gap-3" justify="start">
                <NavbarBrand className="gap-3 max-w-fit">
                    <NextLink className="flex items-center gap-3" href="/">
                        <Image
                            src="/logos/sgn_light.svg"
                            alt="Logo SGN"
                            width={40}
                            height={40}
                            className="h-10 w-auto dark:hidden"
                        />
                        <Image
                            src="/logos/sgn_dark.svg"
                            alt="Logo SGN"
                            width={40}
                            height={40}
                            className="hidden h-10 w-auto dark:block"
                        />
                        <Image
                            src="/logos/ga.png"
                            alt="Logo GA"
                            width={40}
                            height={40}
                            className="h-10 w-auto"
                        />
                        <Image
                            src="/logos/spatula_tour.svg"
                            alt="Logo Spatula Tour"
                            width={40}
                            height={40}
                            className="h-10 w-auto text-yellow-500"
                        />
                    </NextLink>
                </NavbarBrand>
            </NavbarContent>

            {/* Liens de navigation au centre (desktop uniquement) */}
            <NavbarContent className="hidden sm:flex gap-6" justify="center">
                {siteConfig.navItems.map((item) => (
                    <NavbarItem key={item.href}>
                        <NextLink
                            className={clsx(
                                linkStyles({ color: "foreground" }),
                                "data-[active=true]:text-primary data-[active=true]:font-medium"
                            )}
                            href={item.href}
                        >
                            {item.label}
                        </NextLink>
                    </NavbarItem>
                ))}
            </NavbarContent>

            {/* Boutons à droite */}
            <NavbarContent justify="end">
                <NavbarItem>
                    <ThemeSwitch />
                </NavbarItem>
                <NavbarItem>
                    <Button
                        color="primary"
                        variant="solid"
                        radius="sm"
                        className="font-medium"
                        startContent={<ShieldCheck size={24} />}
                        onPress={handleAdminClick}
                    >
                        Admin
                    </Button>
                </NavbarItem>
                {isLoggedIn && (<NavbarItem>
                    <Button
                        color="danger"
                        variant="flat"
                        radius="sm"
                        startContent={<LogOut size={16} />}
                        onPress={() => authClient.signOut()}
                    >
                        Déconnexion
                    </Button>
                </NavbarItem>
                )}
            </NavbarContent>

            {/* Menu mobile */}
            <NavbarMenu>
                {siteConfig.navMenuItems.map((item, index) => (
                    <NavbarMenuItem key={`${item.label}-${index}`}>
                        <NextLink
                            className={clsx(
                                "w-full transition-colors",
                                linkStyles({ color: "foreground" }),
                                "hover:text-primary"
                            )}
                            href={item.href}
                            onClick={() => setIsMenuOpen(false)}
                        >
                            {item.label}
                        </NextLink>
                    </NavbarMenuItem>
                ))}
            </NavbarMenu>
        </HeroNavbar>
    );
};
