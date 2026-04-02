import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Image } from "@heroui/image";
import { Link } from "@heroui/link";
import { count, desc, eq } from "drizzle-orm";

import { title } from "@/components/primitives";
import { db } from "@/lib/db";
import { tournament, tournamentRegistration } from "@/models/schema";
import { env } from "@/utils/environment";

async function getFeaturedTournament() {
    let tournaments: Array<{
        id: string;
        status: "upcoming" | "ongoing" | "completed";
        structureImageUrl: string | null;
        registrationsCount: number;
    }> = [];

    try {
        tournaments = await db
            .select({
                id: tournament.id,
                status: tournament.status,
                structureImageUrl: tournament.structure_image_url,
                registrationsCount: count(tournamentRegistration.id),
            })
            .from(tournament)
            .leftJoin(
                tournamentRegistration,
                eq(tournament.id, tournamentRegistration.tournament_id),
            )
            .groupBy(tournament.id)
            .orderBy(desc(tournament.createdAt));
    } catch (error) {
        const pgErrorCode = (error as { cause?: { code?: string } })?.cause?.code;
        if (pgErrorCode !== "42703") {
            throw error;
        }

        tournaments = await db
            .select({
                id: tournament.id,
                status: tournament.status,
                registrationsCount: count(tournamentRegistration.id),
            })
            .from(tournament)
            .leftJoin(
                tournamentRegistration,
                eq(tournament.id, tournamentRegistration.tournament_id),
            )
            .groupBy(tournament.id)
            .orderBy(desc(tournament.createdAt))
            .then((rows) =>
                rows.map((row) => ({
                    ...row,
                    structureImageUrl: null,
                })),
            );
    }

    const featuredTournament =
        tournaments.find((item) => item.status === "ongoing") || tournaments[0] || null;

    return {
        participantsCount: featuredTournament?.registrationsCount || 0,
        structureImageUrl: featuredTournament?.structureImageUrl || null,
    };
}

export default async function Home() {
    const featuredTournament = await getFeaturedTournament();
    const twitchParent = (() => {
        try {
            return new URL(env.NEXT_PUBLIC_FRONTEND_URL).hostname;
        } catch {
            return "localhost";
        }
    })();
    const twitchPlayerUrl = `https://player.twitch.tv/?channel=merci_raph&parent=${twitchParent}&autoplay=false&muted=true`;

    return (
        <div className="flex flex-col gap-16 py-8 md:py-10">
            {/* Hero Section */}
            <section className="flex flex-col items-center justify-center gap-8 text-center">
                {/* Spatula Tour Logo */}
                <Image
                    src="/logos/SpatulaTour_RGB_horizontale-YELLOW_1.png"
                    alt="Logo Spatula Tour"
                    className=" text-yellow-500 h-32"
                />
                
                <div className="inline-block max-w-4xl">
                    <h1 className={title({ size: "lg" })}>
                        Gamers Assembly 2026 : &nbsp;
                    </h1>
                    <h1 className={title({ size: "lg" })}>
                        Festival Edition
                    </h1>
                    <br/><br/>
                    <h1 className={title({ color: "yellow", size: "md" })}>
                        Spatula Tour - Teamfight Tactic
                    </h1>
                </div>

                <div className="flex gap-4">
                    <Button
                        as={Link}
                        color="primary"
                        href="/tournament"
                        size="lg"
                        variant="shadow"
                    >
                        Voir les résultats
                    </Button>
                </div>
            </section>

            {/* Statistiques Clés */}
            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-primary/10 border border-primary/20">
                    <CardBody className="text-center py-6">
                        <p className="text-4xl font-bold text-primary">{featuredTournament.participantsCount}</p>
                        <p className="text-sm text-default-500 mt-2">Participants</p>
                    </CardBody>
                </Card>

                <Card className="bg-info/10 border border-info/20">
                    <CardBody className="text-center py-6">
                        <p className="text-4xl font-bold text-info">5</p>
                        <p className="text-sm text-default-500 mt-2">Phases de compétition</p>
                    </CardBody>
                </Card>

                <Card className="bg-success/10 border border-success/20">
                    <CardBody className="text-center py-6">
                        <p className="text-4xl font-bold text-success">2</p>
                        <p className="text-sm text-default-500 mt-2">Brackets</p>
                    </CardBody>
                </Card>

                <Card className="bg-warning/10 border border-warning/20">
                    <CardBody className="text-center py-6">
                        <p className="text-4xl font-bold text-warning">3</p>
                        <p className="text-sm text-default-500 mt-2">Finales</p>
                    </CardBody>
                </Card>
            </section>

            {/* Structure du Tournoi */}
            <section className="flex flex-col gap-6">
                <div className="text-center">
                    <h2 className={title({ size: "md" })}>Structure du&nbsp;</h2>
                    <h2 className={title({ color: "yellow", size: "md" })}>Tournoi</h2>
                </div>

               
                    <Card className="mt-4 flex justify-center">
                        <CardBody className="p-2 md:p-4 flex justify-center items-center w-full">
                            <Image
                                src="/Structure_GAFE_2026.png"
                                alt="Structure du tournoi"
                                className="w-full h-auto max-h-[720px] object-contain"
                            />
                        </CardBody>
                    </Card>
            </section>

            {/* Call to Action Final */}
            <section className="flex flex-col items-center justify-center gap-6 py-8">
                <Card className="w-full max-w-3xl bg-primary/10 border border-primary/20">
                    <CardBody className="text-center py-10 gap-4">
                        <h3 className={title({ size: "sm" })}>
                            Suivez&nbsp;
                            <span className={title({ color: "yellow", size: "sm" })}>
                                la compétition
                            </span>
                            &nbsp;en direct
                        </h3>
                        <p className="text-default-500 max-w-2xl mx-auto">
                            Consultez les classements en temps réel, les résultats des matchs et suivez la progression de vos joueurs préférés tout au long du tournoi.
                        </p>
                        <div className="w-full max-w-2xl mx-auto mt-2 rounded-xl overflow-hidden border border-primary/20 bg-black">
                            <div className="aspect-video w-full">
                                <iframe
                                    src={twitchPlayerUrl}
                                    title="Stream Twitch Merci Raph"
                                    allowFullScreen
                                    className="h-full w-full"
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 justify-center mt-4">
                            <Button
                                as={Link}
                                color="primary"
                                href="/tournament"
                                size="lg"
                                variant="shadow"
                            >
                                Voir les résultats
                            </Button>
                            <Button
                                as={Link}
                                href="https://www.twitch.tv/merci_raph"
                                size="lg"
                                variant="bordered"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Ouvrir Twitch
                            </Button>
                        </div>
                    </CardBody>
                </Card>
            </section>
        </div>
    );
}
