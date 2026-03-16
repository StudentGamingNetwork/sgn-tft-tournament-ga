import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Link } from "@heroui/link";

import { title, subtitle } from "@/components/primitives";

export default function Home() {
    return (
        <div className="flex flex-col gap-16 py-8 md:py-10">
            {/* Hero Section */}
            <section className="flex flex-col items-center justify-center gap-8 text-center">
                <div className="inline-block max-w-4xl">
                    <h1 className={title({ size: "lg" })}>
                        Tournoi&nbsp;
                    </h1>
                    <h1 className={title({ color: "cyan", size: "lg" })}>
                        TFT&nbsp;
                    </h1>
                    <h1 className={title({ size: "lg" })}>
                        Compétitif
                    </h1>
                </div>

                <p className={subtitle({ class: "text-center" })}>
                    Tournoi officiel de la Gaming Assembly avec 5 phases progressives, brackets elites et systeme de promotion/relégation dynamique.
                </p>

                <div className="flex gap-4">
                    <Button
                        as={Link}
                        color="primary"
                        href="/tournament"
                        size="lg"
                        variant="shadow"
                    >
                        Voir les classements
                    </Button>
                    <Button
                        as={Link}
                        href="/schedule"
                        size="lg"
                        variant="bordered"
                    >
                        Calendrier des matchs
                    </Button>
                </div>
            </section>

            {/* Statistiques Clés */}
            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
                    <CardBody className="text-center py-6">
                        <p className="text-4xl font-bold text-violet-500">64-128</p>
                        <p className="text-sm text-default-500 mt-2">Joueurs au départ</p>
                    </CardBody>
                </Card>

                <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                    <CardBody className="text-center py-6">
                        <p className="text-4xl font-bold text-blue-500">5</p>
                        <p className="text-sm text-default-500 mt-2">Phases de compétition</p>
                    </CardBody>
                </Card>

                <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                    <CardBody className="text-center py-6">
                        <p className="text-4xl font-bold text-green-500">3</p>
                        <p className="text-sm text-default-500 mt-2">Brackets finales</p>
                    </CardBody>
                </Card>

                <Card className="bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border border-orange-500/20">
                    <CardBody className="text-center py-6">
                        <p className="text-4xl font-bold text-orange-500">24</p>
                        <p className="text-sm text-default-500 mt-2">Finalistes</p>
                    </CardBody>
                </Card>
            </section>

            {/* Structure du Tournoi */}
            <section className="flex flex-col gap-6">
                <div className="text-center">
                    <h2 className={title({ size: "md" })}>Structure du&nbsp;</h2>
                    <h2 className={title({ color: "cyan", size: "md" })}>Tournoi</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    {/* Phase 1 */}
                    <Card className="hover:scale-105 transition-transform">
                        <CardHeader className="flex gap-3 pb-0">
                            <Chip color="primary" variant="flat">Phase 1-2</Chip>
                        </CardHeader>
                        <CardBody className="pt-4">
                            <h3 className="text-xl font-bold mb-2">Qualifications</h3>
                            <ul className="text-sm text-default-600 space-y-2">
                                <li>• De 64 à 128 joueurs → lobbies de 8</li>
                                <li>• 6 parties par phase</li>
                                <li>• Top 32 → Bracket Master</li>
                                <li>• Slots manquants retirés par le bas</li>
                            </ul>
                        </CardBody>
                    </Card>

                    {/* Phase 3-4 */}
                    <Card className="hover:scale-105 transition-transform">
                        <CardHeader className="flex gap-3 pb-0">
                            <Chip color="secondary" variant="flat">Phase 3-4</Chip>
                        </CardHeader>
                        <CardBody className="pt-4">
                            <h3 className="text-xl font-bold mb-2">Éliminations</h3>
                            <ul className="text-sm text-default-600 space-y-2">
                                <li>• 2 Brackets séparés</li>
                                <li>• Système de relégation</li>
                                <li>• Reset stratégique des points</li>
                                <li>• Compétition intense</li>
                            </ul>
                        </CardBody>
                    </Card>

                    {/* Phase 5 */}
                    <Card className="hover:scale-105 transition-transform">
                        <CardHeader className="flex gap-3 pb-0">
                            <Chip color="success" variant="flat">Phase 5</Chip>
                        </CardHeader>
                        <CardBody className="pt-4">
                            <h3 className="text-xl font-bold mb-2">Finales</h3>
                            <ul className="text-sm text-default-600 space-y-2">
                                <li>• 24 joueurs → 3 brackets</li>
                                <li>• Challenger (Top 8)</li>
                                <li>• Master (8 joueurs)</li>
                                <li>• Amateur (8 joueurs)</li>
                            </ul>
                        </CardBody>
                    </Card>
                </div>
            </section>

            {/* Caractéristiques Techniques */}
            <section className="flex flex-col gap-6">
                <div className="text-center">
                    <h2 className={title({ size: "md" })}>Caractéristiques&nbsp;</h2>
                    <h2 className={title({ color: "pink", size: "md" })}>Techniques</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <Card>
                        <CardBody className="gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                    <span className="text-2xl">🧩</span>
                                </div>
                                <div>
                                    <h4 className="font-semibold">Seeding Snake</h4>
                                    <p className="text-sm text-default-500">
                                        Algorithme de répartition équitable par serpentage
                                    </p>
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardBody className="gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                    <span className="text-2xl">📊</span>
                                </div>
                                <div>
                                    <h4 className="font-semibold">Système de Points</h4>
                                    <p className="text-sm text-default-500">
                                        8 pts (1er) à 1 pt (8e) + tie-breaks multiples
                                    </p>
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardBody className="gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                                    <span className="text-2xl">🎬</span>
                                </div>
                                <div>
                                    <h4 className="font-semibold">Matchs sur Scène</h4>
                                    <p className="text-sm text-default-500">
                                        Les phases finales diffusées en direct sur scène
                                    </p>
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardBody className="gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                    <span className="text-2xl">🏆</span>
                                </div>
                                <div>
                                    <h4 className="font-semibold">Format Compétitif</h4>
                                    <p className="text-sm text-default-500">
                                        Jusqu'à 7 parties par phase, 8 joueurs par lobby
                                    </p>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            </section>

            {/* Call to Action Final */}
            <section className="flex flex-col items-center justify-center gap-6 py-8">
                <Card className="w-full max-w-3xl bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10 border border-cyan-500/20">
                    <CardBody className="text-center py-10 gap-4">
                        <h3 className={title({ size: "sm" })}>
                            Suivez&nbsp;
                            <span className={title({ color: "cyan", size: "sm" })}>
                                la compétition
                            </span>
                            &nbsp;en direct
                        </h3>
                        <p className="text-default-600 max-w-2xl mx-auto">
                            Consultez les classements en temps réel, les résultats des matchs et suivez la progression de vos joueurs préférés tout au long du tournoi.
                        </p>
                        <div className="flex gap-4 justify-center mt-4">
                            <Button
                                as={Link}
                                color="primary"
                                href="/tournament"
                                size="lg"
                                variant="shadow"
                            >
                                Voir les classements
                            </Button>
                            <Button
                                as={Link}
                                href="/results"
                                size="lg"
                                variant="flat"
                            >
                                Résultats des matchs
                            </Button>
                        </div>
                    </CardBody>
                </Card>
            </section>
        </div>
    );
}
