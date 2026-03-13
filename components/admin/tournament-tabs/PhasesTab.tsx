import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Play, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useTournamentPlayers, useTournamentPhases, useDeletePhase, useStartPhase, useStartNextPhase } from "@/lib/hooks/useTournament";
import type { PhaseWithDetails } from "@/app/actions/tournaments";

interface PhasesTabProps {
    tournamentId: string;
    onCreatePhaseOpen: () => void;
    onPhaseDetailsClick: (phaseId: string) => void;
}

export function PhasesTab({
    tournamentId,
    onCreatePhaseOpen,
    onPhaseDetailsClick,
}: PhasesTabProps) {
    // TanStack Query hooks
    const { data: phases = [], isLoading } = useTournamentPhases(tournamentId);
    const { data: players = [] } = useTournamentPlayers(tournamentId);
    const deletePhase = useDeletePhase(tournamentId);
    const startPhase = useStartPhase(tournamentId);
    const startNextPhase = useStartNextPhase(tournamentId);

    const handleDeletePhase = async (phaseId: string) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer cette phase ? Cela supprimera aussi tous les brackets, parties et résultats associés.")) {
            return;
        }
        try {
            await deletePhase.mutateAsync(phaseId);
        } catch (error) {
            console.error("Error deleting phase:", error);
            alert("Erreur lors de la suppression de la phase");
        }
    };

    const handleStartPhase = async (phase: PhaseWithDetails) => {
        // Seule la Phase 1 peut être démarrée pour le moment
        if (phase.order_index !== 1) {
            alert("Seule la Phase 1 peut être démarrée via ce bouton. Les autres phases nécessitent les résultats des phases précédentes.");
            return;
        }

        // Vérifier qu'il y a des joueurs confirmés
        const confirmedCount = players.filter(p => p.registration.status === "confirmed").length;

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

        try {
            const result = await startPhase.mutateAsync(phase.id);
            if (result.success) {
                alert(`Phase 1 démarrée avec succès ! ${result.lobbyCount} lobby(s) créé(s).`);
            } else {
                alert(`Erreur : ${result.error}`);
            }
        } catch (error) {
            console.error("Error starting phase:", error);
            alert("Erreur lors du démarrage de la phase");
        }
    };

    const getStatusInfo = (phase: PhaseWithDetails) => {
        switch (phase.status) {
            case "not_started":
                return {
                    label: "Non démarrée",
                    color: "default" as const,
                    icon: <Clock size={16} />,
                };
            case "in_progress":
                return {
                    label: "En cours",
                    color: "primary" as const,
                    icon: <Play size={16} />,
                };
            case "completed":
                return {
                    label: "Terminée",
                    color: "success" as const,
                    icon: <CheckCircle size={16} />,
                };
        }
    };

    const sortedPhases = [...phases].sort((a, b) => a.order_index - b.order_index);
    const nextStartablePhase = sortedPhases.find((current) => {
        if (current.status !== "not_started") return false;
        if (current.order_index === 1) return true;

        const previousPhase = sortedPhases.find(
            (p) => p.order_index === current.order_index - 1,
        );

        return previousPhase?.status === "completed";
    });

    const handleStartNextPhase = async () => {
        if (!nextStartablePhase) {
            alert("Aucune phase éligible à démarrer pour le moment.");
            return;
        }

        const message = `Démarrer la prochaine phase (${nextStartablePhase.name}) ?`;
        if (!confirm(message)) {
            return;
        }

        try {
            const result = await startNextPhase.mutateAsync();
            if (!result.success) {
                alert(`Erreur : ${result.error}`);
                return;
            }

            alert(
                `✅ ${result.startedPhaseName} démarrée avec succès !`,
            );
        } catch (error) {
            console.error("Error starting next phase:", error);
            alert("Erreur lors du démarrage de la prochaine phase");
        }
    };

    return (
        <Card className="p-6 mt-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Phases du tournoi</h2>
                <div className="flex items-center gap-2">
                    <Button
                        color="success"
                        onPress={handleStartNextPhase}
                        isLoading={startNextPhase.isPending}
                        isDisabled={!nextStartablePhase}
                        startContent={!startNextPhase.isPending && <Play size={16} />}
                    >
                        Démarrer la prochaine phase
                    </Button>
                    <Button color="primary" onPress={onCreatePhaseOpen}>
                        Créer une phase manquante
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <p className="text-default-500">Chargement des phases...</p>
                </div>
            ) : phases.length === 0 ? (
                <p className="text-default-500 text-center py-8">
                    Aucune phase créée pour le moment.
                </p>
            ) : (
                <div className="space-y-4">
                    {phases.map((phase) => {
                        const statusInfo = getStatusInfo(phase);
                        const isStarting = startPhase.isPending;
                        const canStart = phase.order_index === 1 && phase.status === "not_started";

                        return (
                            <Card key={phase.id} className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="flex items-center justify-center w-12 h-12 bg-primary-100 rounded-lg">
                                            <span className="text-xl font-bold text-primary">
                                                {phase.order_index}
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-lg font-semibold">{phase.name}</h3>
                                                <Chip
                                                    size="sm"
                                                    color={statusInfo.color}
                                                    variant="flat"
                                                    startContent={statusInfo.icon}
                                                >
                                                    {statusInfo.label}
                                                </Chip>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-default-500">
                                                <span>
                                                    {phase.gamesWithResults} / {phase.totalGamesExpected} partie{phase.totalGamesExpected > 1 ? "s" : ""} jouée{phase.gamesWithResults > 1 ? "s" : ""}
                                                </span>
                                                {phase.brackets.length > 0 && (
                                                    <span>
                                                        {phase.brackets.length} bracket{phase.brackets.length > 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {phase.canEnterResults && (
                                                    <Chip size="sm" color="success" variant="dot">
                                                        Peut saisir les résultats
                                                    </Chip>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {canStart && (
                                            <Button
                                                size="sm"
                                                color="success"
                                                variant="flat"
                                                startContent={<Play size={16} />}
                                                onPress={() => handleStartPhase(phase)}
                                                isLoading={isStarting}
                                            >
                                                {isStarting ? "Démarrage..." : "Démarrer"}
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            color="primary"
                                            variant="flat"
                                            onPress={() => onPhaseDetailsClick(phase.id)}
                                        >
                                            Voir détails
                                        </Button>
                                        <Button
                                            size="sm"
                                            color="danger"
                                            variant="light"
                                            onPress={() => handleDeletePhase(phase.id)}
                                        >
                                            Supprimer
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
