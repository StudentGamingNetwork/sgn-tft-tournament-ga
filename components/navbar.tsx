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
import { Shield } from "lucide-react";
import { useState } from "react";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import { authClient } from "@/lib/auth-client";

export const Navbar = () => {
    const router = useRouter();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { data: session } = authClient.useSession();

    const isLoggedIn = !!session;

    const handleAdminClick = () => {
        if (isLoggedIn) {
            router.push("/admin");
        }
        else {
            authClient.signIn.oauth2({
                providerId: "keycloak",
                callbackURL: "http://localhost:3000/admin",
            });
        }
    };

    return (
        <HeroNavbar
            maxWidth="xl"
            position="sticky"
            isMenuOpen={isMenuOpen}
            onMenuOpenChange={setIsMenuOpen}
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
                            src="/logos/sgn.svg"
                            alt="Logo SGN"
                            width={40}
                            height={40}
                            className="h-10 w-auto"
                        />
                        <Image
                            src="/logos/ga.png"
                            alt="Logo GA"
                            width={40}
                            height={40}
                            className="h-10 w-auto"
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
                        variant="flat"
                        startContent={<Shield size={18} />}
                        onPress={handleAdminClick}
                    >
                        Admin
                    </Button>
                </NavbarItem>
                {isLoggedIn && (<NavbarItem>
                    <Button
                        color="danger"
                        variant="flat"
                        startContent={<Shield size={18} />}
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
                            className="w-full"
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
