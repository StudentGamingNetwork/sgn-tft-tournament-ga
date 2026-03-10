"use client";

import { useState, useEffect, use } from "react";
import { authClient } from "@/lib/auth-client";
import { redirect, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { Tabs, Tab } from "@heroui/tabs";
import {
    ArrowLeft,
    Trophy,
    Gamepad2,
    Users,
    TrendingUp,
    Play,
} from "lucide-react";
import { getPhaseDetails, startPhase1Action, getTournamentPlayers, type PhaseDetails } from "@/app/actions/tournaments";
import { OverviewTab } from "./OverviewTab";
import { GamesTab } from "./GamesTab";

interface PhaseManagePageProps {
    params: Promise<{
        tournamentId: string;
        phaseId: string;
    }>;
}

export default function PhaseManagePage({ params }: PhaseManagePageProps) {
    const { data: session, isPending } = authClient.useSession();
    const router = useRouter();
    const { tournamentId, phaseId } = use(params);
    const [phaseDetails, setPhaseDetails] = useState<PhaseDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedTab, setSelectedTab] = useState("overview");
    const [isStartingPhase, setIsStartingPhase] = useState(false);

    useEffect(() => {
        if (session) {
            loadPhaseDetails();
        }
    }, [session, phaseId]);

    const loadPhaseDetails = async () => {
        setLoading(true);
        try {
            const data = await getPhaseDetails(phaseId);
            if (!data) {
                router.push(`/admin/tournaments/${tournamentId}`);
                return;
            }
            setPhaseDetails(data);
        } catch (error) {
            console.error("Error loading phase details:", error);
            router.push(`/admin/tournaments/${tournamentId}`);
        } finally {
            setLoading(false);
        }
    };

    if (isPending || loading) {
        return <div className="flex items-center justify-center h-96">Chargement...</div>;
    }

    if (!session) {
        redirect("/");
    }

    if (!phaseDetails) {
        return null;
    }

    const { phase, participants, games } = phaseDetails;

    // Calculer les parties restantes
    const partiesRestantes = phase.totalGamesExpected - phase.gamesWithResults;

    const handleStartPhase = async () => {
        if (!phaseDetails) return;

        // Vérifier que c'est la Phase 1
        if (phaseDetails.phase.order_index !== 1) {
            alert("Seule la Phase 1 peut être démarrée via ce bouton. Les autres phases nécessitent les résultats des phases précédentes.");
            return;
        }

        // Vérifier qu'il n'y a pas déjà de games
        if (phaseDetails.games.length > 0) {
            alert("Cette phase a déjà été démarrée. Des parties existent déjà.");
            return;
        }

        // Demander confirmation
        const confirmedPlayers = await getTournamentPlayers(tournamentId);
        const confirmedCount = confirmedPlayers.filter(p => p.registration.status === "confirmed").length;

        if (confirmedCount === 0) {
            alert("Aucun joueur confirmé. Veuillez confirmer les joueurs dans l'onglet Joueurs avant de démarrer la phase.");
            return;
        }

        const lobbyCount = Math.floor(confirmedCount / 8);
        const message = `Démarrer la Phase 1 avec ${confirmedCount} joueurs confirmés ?\n\n` +
            `Cela créera ${lobbyCount} lobby(s) de 8 joueurs pour le Game 1.\n` +
            `Les joueurs seront automatiquement répartis selon leur classement.`;

        if (!confirm(message)) {
            return;
        }

        setIsStartingPhase(true);
        try {
            const result = await startPhase1Action(phaseId, tournamentId);
            if (result.success) {
                alert(`Phase 1 démarrée avec succès ! ${result.lobbyCount} lobby(s) créé(s).`);
                // Recharger les détails de la phase
                await loadPhaseDetails();
            } else {
                alert(`Erreur : ${result.error}`);
            }
        } catch (error) {
            console.error("Error starting phase:", error);
            alert("Erreur lors du démarrage de la phase");
        } finally {
            setIsStartingPhase(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <Button
                        variant="light"
                        isIconOnly
                        onPress={() => router.push(`/admin/tournaments/${tournamentId}`)}
                    >
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-4xl font-bold">{phase.name}</h1>
                        </div>
                        <div className="flex items-center gap-4 text-default-500">
                            <div className="flex items-center gap-2">
                                <Trophy size={16} />
                                <span>{phase.tournament.name} - {phase.tournament.year}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Gamepad2 size={16} />
                                <span>{phase.total_games} parties prévues</span>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Bouton démarrer la phase (Phase 1 uniquement) */}
                {phase.order_index === 1 && games.length === 0 && (
                    <Button
                        color="primary"
                        size="lg"
                        startContent={<Play size={20} />}
                        onPress={handleStartPhase}
                        isLoading={isStartingPhase}
                        className="font-semibold"
                    >
                        {isStartingPhase ? "Démarrage..." : "Démarrer la Phase 1"}
                    </Button>
                )}
            </div>

            {/* Statistiques rapides */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-primary-100 rounded-lg">
                            <Users size={24} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-default-500">Participants</p>
                            <p className="text-2xl font-bold">{phase.participantsCount}</p>
                            <p className="text-xs text-default-400">
                                {phase.totalGamesCreated > 0
                                    ? `${Math.floor(phase.totalGamesCreated / phase.total_games)} lobby(s)`
                                    : "Aucun lobby créé"
                                }
                            </p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-success-100 rounded-lg">
                            <Gamepad2 size={24} className="text-success" />
                        </div>
                        <div>
                            <p className="text-sm text-default-500">Parties jouées</p>
                            <p className="text-2xl font-bold">{phase.gamesWithResults}/{phase.totalGamesExpected}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-warning-100 rounded-lg">
                            <Trophy size={24} className="text-warning" />
                        </div>
                        <div>
                            <p className="text-sm text-default-500">Parties restantes</p>
                            <p className="text-2xl font-bold">{partiesRestantes}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-secondary-100 rounded-lg">
                            <TrendingUp size={24} className="text-secondary" />
                        </div>
                        <div>
                            <p className="text-sm text-default-500">Leader</p>
                            <p className="text-lg font-bold truncate">
                                {participants[0]?.player_name || "N/A"}
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs
                selectedKey={selectedTab}
                onSelectionChange={(key) => setSelectedTab(key as string)}
                aria-label="Phase sections"
                color="primary"
                variant="underlined"
                classNames={{
                    tabList: "gap-6 w-full relative rounded-none p-0 border-b border-divider",
                    cursor: "w-full bg-primary",
                    tab: "max-w-fit px-0 h-12",
                }}
            >
                <Tab
                    key="overview"
                    title={
                        <div className="flex items-center gap-2">
                            <TrendingUp size={18} />
                            <span>Classement Global</span>
                        </div>
                    }
                />
                <Tab
                    key="games"
                    title={
                        <div className="flex items-center gap-2">
                            <Gamepad2 size={18} />
                            <span>Parties</span>
                        </div>
                    }
                />
            </Tabs>

            {/* Tab Content */}
            <div className="flex flex-col gap-4">
                {selectedTab === "overview" && <OverviewTab participants={participants} />}
                {selectedTab === "games" && <GamesTab games={games} onResultsSubmitted={loadPhaseDetails} />}
            </div>
        </div>
    );
}
