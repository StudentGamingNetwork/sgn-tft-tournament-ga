"use client";

import { useState, useEffect, use } from "react";
import { authClient } from "@/lib/auth-client";
import { redirect, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Tabs, Tab } from "@heroui/tabs";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import {
    ArrowLeft,
    Calendar,
    Users,
    Trophy,
    Settings,
    Gamepad2,
    TrendingUp,
    Edit,
    Trash2,
} from "lucide-react";
import { getTournamentById, deleteTournament } from "@/app/actions/tournaments";
import { useInvalidateTournamentData, useTournamentPlayers, useTournamentPhases } from "@/lib/hooks/useTournament";
import { EditTournamentModal } from "@/components/admin/EditTournamentModal";
import { RegisterPlayerModal } from "@/components/admin/RegisterPlayerModal";
import { ImportPlayersCSVModal } from "@/components/admin/ImportPlayersCSVModal";
import { EditPlayerModal } from "@/components/admin/EditPlayerModal";
import { CreatePhaseModal } from "@/components/admin/CreatePhaseModal";
import { StatsCard } from "@/components/admin/StatsCard";
import { OverviewTab } from "@/components/admin/tournament-tabs/OverviewTab";
import { PlayersTab } from "@/components/admin/tournament-tabs/PlayersTab";
import { PhasesTab } from "@/components/admin/tournament-tabs/PhasesTab";
import { ResultsTab } from "@/components/admin/tournament-tabs/ResultsTab";
import { SettingsTab } from "@/components/admin/tournament-tabs/SettingsTab";
import type { Tournament, PlayerWithRegistration } from "@/types/tournament";

interface TournamentManagePageProps {
    params: Promise<{
        tournamentId: string;
    }>;
}

export default function TournamentManagePage({ params }: TournamentManagePageProps) {
    const { data: session, isPending } = authClient.useSession();
    const router = useRouter();
    const { tournamentId } = use(params);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedTab, setSelectedTab] = useState("overview");
    const [openModal, setOpenModal] = useState<"edit" | "delete" | "register" | "import" | "editPlayer" | "createPhase" | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithRegistration | null>(null);

    // Hooks TanStack Query pour récupérer les joueurs et phases
    const { data: players = [] } = useTournamentPlayers(tournamentId);
    const { data: phases = [] } = useTournamentPhases(tournamentId);

    // Hook pour invalider les caches TanStack Query
    const { invalidatePlayers, invalidatePhases } = useInvalidateTournamentData(tournamentId);

    // Calculer les counts à partir des données
    const playersCount = players.length;
    const phasesCount = phases.length;

    useEffect(() => {
        if (session) {
            loadTournament();
        }
    }, [session, tournamentId]);

    const loadTournament = async () => {
        setLoading(true);
        try {
            const data = await getTournamentById(tournamentId);
            if (!data) {
                router.push("/admin/tournaments");
                return;
            }
            setTournament(data);
        } catch (error) {
            console.error("Error loading tournament:", error);
            router.push("/admin/tournaments");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteTournament(tournamentId);
            router.push("/admin/tournaments");
        } catch (error) {
            console.error("Error deleting tournament:", error);
            setIsDeleting(false);
            setOpenModal(null);
        }
    };

    if (isPending || loading) {
        return <div className="flex items-center justify-center h-96">Chargement...</div>;
    }

    if (!session) {
        redirect("/");
    }

    if (!tournament) {
        return null;
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "upcoming":
                return "warning";
            case "ongoing":
                return "success";
            case "completed":
                return "default";
            default:
                return "default";
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case "upcoming":
                return "À venir";
            case "ongoing":
                return "En cours";
            case "completed":
                return "Terminé";
            default:
                return status;
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
                        onPress={() => router.push("/admin/tournaments")}
                    >
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-4xl font-bold">{tournament.name}</h1>
                            <Chip color={getStatusColor(tournament.status)} variant="dot" size="lg">
                                {getStatusLabel(tournament.status)}
                            </Chip>
                        </div>
                        <div className="flex items-center gap-4 text-default-500">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} />
                                <span>Année {tournament.year}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Trophy size={16} />
                                <span>ID: {tournament.id}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        color="primary"
                        variant="flat"
                        startContent={<Edit size={18} />}
                        onPress={() => setOpenModal("edit")}
                    >
                        Modifier
                    </Button>
                    <Button
                        color="danger"
                        variant="light"
                        startContent={<Trash2 size={18} />}
                        onPress={() => setOpenModal("delete")}
                    >
                        Supprimer
                    </Button>
                </div>
            </div>

            {/* Statistiques rapides */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatsCard
                    icon={Users}
                    label="Joueurs inscrits"
                    value={playersCount}
                    colorClass="primary"
                />
                <StatsCard
                    icon={Gamepad2}
                    label="Parties jouées"
                    value={0}
                    colorClass="success"
                />
                <StatsCard
                    icon={Trophy}
                    label="Phases"
                    value={phasesCount}
                    colorClass="warning"
                />
                <StatsCard
                    icon={TrendingUp}
                    label="Progression"
                    value="0%"
                    colorClass="secondary"
                />
            </div>

            {/* Onglets de gestion */}
            <Tabs
                aria-label="Gestion du tournoi"
                selectedKey={selectedTab}
                onSelectionChange={(key) => setSelectedTab(key as string)}
                size="lg"
                color="primary"
            >
                <Tab
                    key="overview"
                    title={
                        <div className="flex items-center gap-2">
                            <Trophy size={18} />
                            <span>Vue d'ensemble</span>
                        </div>
                    }
                >
                    <OverviewTab
                        tournament={tournament}
                        getStatusColor={getStatusColor}
                        getStatusLabel={getStatusLabel}
                    />
                </Tab>

                <Tab
                    key="players"
                    title={
                        <div className="flex items-center gap-2">
                            <Users size={18} />
                            <span>Joueurs ({playersCount})</span>
                        </div>
                    }
                >
                    <PlayersTab
                        tournamentId={tournamentId}
                        onImportOpen={() => setOpenModal("import")}
                        onRegisterOpen={() => setOpenModal("register")}
                        onEditPlayerOpen={(player) => {
                            setSelectedPlayer(player);
                            setOpenModal("editPlayer");
                        }}
                    />
                </Tab>

                <Tab
                    key="phases"
                    title={
                        <div className="flex items-center gap-2">
                            <Gamepad2 size={18} />
                            <span>Phases ({phasesCount})</span>
                        </div>
                    }
                >
                    <PhasesTab
                        tournamentId={tournamentId}
                        onCreatePhaseOpen={() => setOpenModal("createPhase")}
                        onPhaseDetailsClick={(phaseId) => router.push(`/admin/tournaments/${tournamentId}/phases/${phaseId}`)}
                    />
                </Tab>

                <Tab
                    key="results"
                    title={
                        <div className="flex items-center gap-2">
                            <TrendingUp size={18} />
                            <span>Résultats</span>
                        </div>
                    }
                >
                    <ResultsTab tournamentId={tournamentId} />
                </Tab>

                <Tab
                    key="settings"
                    title={
                        <div className="flex items-center gap-2">
                            <Settings size={18} />
                            <span>Paramètres</span>
                        </div>
                    }
                >
                    <SettingsTab />
                </Tab>
            </Tabs>

            {/* Modal d'édition */}
            {tournament && (
                <EditTournamentModal
                    isOpen={openModal === "edit"}
                    onClose={() => setOpenModal(null)}
                    onSuccess={loadTournament}
                    tournament={tournament}
                />
            )}

            {/* Modal d'inscription de joueur */}
            <RegisterPlayerModal
                isOpen={openModal === "register"}
                onClose={() => setOpenModal(null)}
                onSuccess={() => {
                    setOpenModal(null);
                    invalidatePlayers();
                }}
                tournamentId={tournamentId}
            />

            {/* Modal d'import CSV */}
            <ImportPlayersCSVModal
                isOpen={openModal === "import"}
                onClose={() => setOpenModal(null)}
                onSuccess={() => {
                    setOpenModal(null);
                    invalidatePlayers();
                }}
                tournamentId={tournamentId}
            />

            {/* Modal d'édition de joueur */}
            {selectedPlayer && (
                <EditPlayerModal
                    isOpen={openModal === "editPlayer"}
                    onClose={() => setOpenModal(null)}
                    onSuccess={() => {
                        setOpenModal(null);
                        invalidatePlayers();
                    }}
                    player={selectedPlayer}
                />
            )}

            {/* Modal de création de phase */}
            <CreatePhaseModal
                isOpen={openModal === "createPhase"}
                onClose={() => setOpenModal(null)}
                onSuccess={() => {
                    setOpenModal(null);
                    invalidatePhases();
                }}
                tournamentId={tournamentId}
            />

            {/* Modal de confirmation de suppression */}
            <Modal isOpen={openModal === "delete"} onClose={() => setOpenModal(null)}>
                <ModalContent>
                    <ModalHeader>Confirmer la suppression</ModalHeader>
                    <ModalBody>
                        <p>
                            Êtes-vous sûr de vouloir supprimer le tournoi <strong>{tournament?.name}</strong> ?
                        </p>
                        <p className="text-danger mt-2">
                            Cette action est irréversible et supprimera toutes les données associées
                            (joueurs inscrits, phases, parties, résultats).
                        </p>
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            variant="light"
                            onPress={() => setOpenModal(null)}
                            isDisabled={isDeleting}
                        >
                            Annuler
                        </Button>
                        <Button
                            color="danger"
                            onPress={handleDelete}
                            isLoading={isDeleting}
                        >
                            Supprimer définitivement
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}
