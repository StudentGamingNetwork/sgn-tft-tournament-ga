"use client";

import { useState, useEffect, use, useCallback } from "react";
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
    WandSparkles,
} from "lucide-react";
import { getPhaseDetails, startPhase1Action, getTournamentPlayers, getTournamentPhases, type PhaseDetails, startPhase2Action, startPhase3Action, startPhase4Action, startPhase5Action, completePhaseGamesAutomaticallyAction } from "@/app/actions/tournaments";
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
    const [isAutoCompleting, setIsAutoCompleting] = useState(false);

    const loadPhaseDetails = useCallback(async (showLoader = true) => {
        if (showLoader) {
            setLoading(true);
        }
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
            if (showLoader) {
                setLoading(false);
            }
        }
    }, [phaseId, router, tournamentId]);

    useEffect(() => {
        if (session) {
            void loadPhaseDetails();
        }
    }, [session, loadPhaseDetails]);

    useEffect(() => {
        if (!session) return;

        const intervalId = setInterval(() => {
            void loadPhaseDetails(false);
        }, 30000);

        return () => clearInterval(intervalId);
    }, [session, loadPhaseDetails]);

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

        const orderIndex = phaseDetails.phase.order_index;

        // Vérifier qu'il n'y a pas déjà de games
        if (phaseDetails.games.length > 0) {
            alert("Cette phase a déjà été démarrée. Des parties existent déjà.");
            return;
        }

        setIsStartingPhase(true);
        try {
            let result: { success: boolean; error?: string; [key: string]: any };

            if (orderIndex === 1) {
                // Phase 1
                const confirmedPlayers = await getTournamentPlayers(tournamentId);
                const confirmedCount = confirmedPlayers.filter(p => p.registration.status === "confirmed").length;

                if (confirmedCount === 0) {
                    alert("Aucun joueur confirmé. Veuillez confirmer les joueurs dans l'onglet Joueurs avant de démarrer la phase.");
                    setIsStartingPhase(false);
                    return;
                }

                const lobbyCount = Math.ceil(confirmedCount / 8);
                const message = `Démarrer la Phase 1 avec ${confirmedCount} joueurs confirmés ?\n\n` +
                    `Cela créera ${lobbyCount} lobby(s) équilibré(s) pour le Game 1 (taille variable possible).\n` +
                    `Les joueurs seront automatiquement répartis selon leur classement.`;

                if (!confirm(message)) {
                    setIsStartingPhase(false);
                    return;
                }

                result = await startPhase1Action(phaseId, tournamentId);
                if (result.success) {
                    alert(`Phase 1 démarrée avec succès ! ${result.lobbyCount} lobby(s) créé(s).`);
                }
            } else if (orderIndex === 2) {
                // Phase 2 - Nécessite la Phase 1
                const phases = await getTournamentPhases(tournamentId);
                const phase1 = phases.find((p: any) => p.order_index === 1);
                
                if (!phase1) {
                    alert("Phase 1 introuvable !");
                    setIsStartingPhase(false);
                    return;
                }

                const message = `Démarrer la Phase 2 ?\n\n` +
                    `Les joueurs qualifiés de la Phase 1 continueront selon le palier.\n` +
                    `Les 32 premiers seront qualifiés directement pour le bracket Master de la Phase 3.`;

                if (!confirm(message)) {
                    setIsStartingPhase(false);
                    return;
                }

                result = await startPhase2Action(phase1.id, phaseId);
                if (result.success && result.stats) {
                    alert(`Phase 2 démarrée avec succès !\n\n` +
                        `✅ ${result.stats.qualifiedCount} joueurs continueront en Phase 2\n` +
                        `🎯 ${result.stats.eliminatedCount} joueurs qualifiés pour P3 Master\n` +
                        `🎮 ${result.stats.lobbyCount} lobbies créés`);
                }
            } else if (orderIndex === 3) {
                // Phase 3 - Nécessite Phases 1 et 2
                const phases = await getTournamentPhases(tournamentId);
                const phase1 = phases.find((p: any) => p.order_index === 1);
                const phase2 = phases.find((p: any) => p.order_index === 2);
                
                if (!phase1 || !phase2) {
                    alert("Phases 1 ou 2 introuvables !");
                    setIsStartingPhase(false);
                    return;
                }

                const message = `Démarrer la Phase 3 ?\n\n` +
                    `RESET des points - Nouveau départ pour tous !\n\n` +
                    `🏅 Bracket MASTER (objectif 32 joueurs):\n` +
                    `   - Top 16 de la Phase 1\n` +
                    `   - Top 16 de la Phase 2\n\n` +
                    `🥈 Bracket AMATEUR (objectif 32 joueurs):\n` +
                    `   - Bottom 32 de la Phase 2\n\n` +
                    `ℹ️ Les quotas sont tronqués automatiquement si l'effectif est insuffisant.`;

                if (!confirm(message)) {
                    setIsStartingPhase(false);
                    return;
                }

                result = await startPhase3Action(phase1.id, phase2.id, phaseId);
                if (result.success && result.stats) {
                    alert(`Phase 3 démarrée avec succès !\n\n` +
                        `🏅 Bracket Master: ${result.stats.masterCount} joueurs\n` +
                        `🥈 Bracket Amateur: ${result.stats.amateurCount} joueurs\n\n` +
                        `Les points ont été réinitialisés !`);
                }
            } else if (orderIndex === 4) {
                // Phase 4 - Nécessite Phase 3
                const phases = await getTournamentPhases(tournamentId);
                const phase3 = phases.find((p: any) => p.order_index === 3);
                
                if (!phase3) {
                    alert("Phase 3 introuvable !");
                    setIsStartingPhase(false);
                    return;
                }

                const message = `Démarrer la Phase 4 ?\n\n` +
                    `🏅 Bracket MASTER (objectif 16 joueurs):\n` +
                    `   - Top 16 du bracket Master P3\n\n` +
                    `   - Top cut actif après les 2 premières parties (réduction à 16)\n\n` +
                    `🥈 Bracket AMATEUR (objectif 32 joueurs - RESET):\n` +
                    `   - Top 16 du bracket Amateur P3\n` +
                    `   - Bottom 16 du bracket Master P3\n\n` +
                    `ℹ️ Les quotas sont tronqués automatiquement si l'effectif est insuffisant.`;

                if (!confirm(message)) {
                    setIsStartingPhase(false);
                    return;
                }

                result = await startPhase4Action(phase3.id, phaseId);
                if (result.success && result.stats) {
                    alert(`Phase 4 démarrée avec succès !\n\n` +
                        `🏅 Bracket Master: ${result.stats.masterCount} joueurs\n` +
                        `🥈 Bracket Amateur: ${result.stats.amateurCount} joueurs (points réinitialisés)`);
                }
            } else if (orderIndex === 5) {
                // Phase 5 - Finales - Nécessite Phase 4
                const phases = await getTournamentPhases(tournamentId);
                const phase4 = phases.find((p: any) => p.order_index === 4);
                
                if (!phase4) {
                    alert("Phase 4 introuvable !");
                    setIsStartingPhase(false);
                    return;
                }

                const message = `Démarrer la Phase 5 - FINALES ?\n\n` +
                    `🏆 Bracket CHALLENGER (8 joueurs):\n` +
                    `   - Top 8 du bracket Master P4\n\n` +
                    `🏅 Bracket MASTER (8 joueurs):\n` +
                    `   - Rangs 9-16 du bracket Master P4\n\n` +
                    `🥈 Bracket AMATEUR (8 joueurs):\n` +
                    `   - Top 8 du bracket Amateur P4\n\n` +
                    `⚡ Règle Checkmate:\n` +
                    `   - Challenger: statut finaliste à 21 points, max 7 games\n` +
                    `   - Master/Amateur: statut finaliste à 18 points, max 6 games\n` +
                    `   - Un finaliste qui gagne une game remporte le bracket.`;

                if (!confirm(message)) {
                    setIsStartingPhase(false);
                    return;
                }

                result = await startPhase5Action(phase4.id, phaseId);
                if (result.success && result.stats) {
                    alert(`Phase 5 - FINALES démarrée avec succès !\n\n` +
                        `🏆 Challenger: ${result.stats.challengerCount} joueurs\n` +
                        `🏅 Master: ${result.stats.masterCount} joueurs\n` +
                        `🥈 Amateur: ${result.stats.amateurCount} joueurs`);
                }
            } else {
                alert("Phase non prise en charge.");
                setIsStartingPhase(false);
                return;
            }

            if (!result.success) {
                alert(`Erreur : ${result.error}`);
            } else {
                // Recharger les détails de la phase
                await loadPhaseDetails();
            }
        } catch (error) {
            console.error("Error starting phase:", error);
            alert("Erreur lors du démarrage de la phase");
        } finally {
            setIsStartingPhase(false);
        }
    };

    const handleAutoCompletePhaseGames = async () => {
        if (!phaseDetails) return;

        const pendingGames = phaseDetails.games.filter((g) => !g.hasResults).length;
        if (pendingGames === 0) {
            alert("Toutes les parties ont déjà des résultats.");
            return;
        }

        const confirmed = confirm(
            `Compléter automatiquement ${pendingGames} partie(s) sans résultat ?\n\nCette action génère des placements aléatoires pour chaque lobby.`,
        );

        if (!confirmed) return;

        setIsAutoCompleting(true);
        try {
            const result = await completePhaseGamesAutomaticallyAction(phaseId);

            if (!result.success) {
                alert(`Erreur : ${result.error}`);
                return;
            }

            alert(`Terminé : ${result.completed} partie(s) complétée(s), ${result.skipped} ignorée(s).`);
            await loadPhaseDetails();
        } catch (error) {
            console.error("Error auto-completing phase games:", error);
            alert("Erreur lors de la complétion automatique des parties");
        } finally {
            setIsAutoCompleting(false);
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
                {/* Bouton démarrer la phase */}
                <div className="flex items-center gap-2">
                    {phase.tournament.is_simulation && games.length > 0 && (
                        <div className="flex items-center gap-2">
                            {partiesRestantes > 0 && (
                                <Button
                                    color="secondary"
                                    variant="flat"
                                    size="lg"
                                    startContent={<WandSparkles size={20} />}
                                    onPress={handleAutoCompletePhaseGames}
                                    isLoading={isAutoCompleting}
                                >
                                    Auto-résoudre la manche
                                </Button>
                            )}
                        </div>
                    )}
                    {games.length === 0 && (
                        <Button
                            color="primary"
                            size="lg"
                            startContent={<Play size={20} />}
                            onPress={handleStartPhase}
                            isLoading={isStartingPhase}
                        >
                            Démarrer {phase.name}
                        </Button>
                    )}
                </div>
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
                {selectedTab === "overview" && <OverviewTab participants={participants} games={games} phaseOrderIndex={phase.order_index} />}
                {selectedTab === "games" && (
                    <GamesTab
                        tournamentId={tournamentId}
                        games={games}
                        onResultsSubmitted={loadPhaseDetails}
                    />
                )}
            </div>
        </div>
    );
}
