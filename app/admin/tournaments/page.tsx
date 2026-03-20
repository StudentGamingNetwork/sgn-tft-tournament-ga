"use client";

import { useState, useEffect, useOptimistic, startTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { redirect, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import {
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
} from "@heroui/table";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Trash2, Plus, Edit, Users, AlertCircle } from "lucide-react";
import { CreateTournamentModal } from "@/components/admin/CreateTournamentModal";
import { getTournaments, deleteTournament } from "@/app/actions/tournaments";
import type { Tournament } from "@/types/tournament";

interface TournamentWithCount extends Tournament {
    registrationsCount: number;
    currentPhase: string | null;
}

export default function TournamentsPage() {
    const { data: session, isPending } = authClient.useSession();
    const router = useRouter();
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [tournaments, setTournaments] = useState<TournamentWithCount[]>([]);
    const [optimisticTournaments, setOptimisticTournaments] = useOptimistic(
        tournaments,
        (state, action: { type: string; tournamentId?: string }) => {
            switch (action.type) {
                case "remove":
                    return state.filter((t) => t.id !== action.tournamentId);
                default:
                    return state;
            }
        }
    );
    const [loading, setLoading] = useState(true);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; tournamentId: string | null }>({
        isOpen: false,
        tournamentId: null,
    });

    useEffect(() => {
        if (session) {
            loadTournaments();
        }
    }, [session]);

    const loadTournaments = async () => {
        setLoading(true);
        try {
            const data = await getTournaments();
            setTournaments(data);
        } catch (error) {
            console.error("Error loading tournaments:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (tournamentId: string) => {
        startTransition(() => {
            setOptimisticTournaments({ type: "remove", tournamentId });
        });
        try {
            await deleteTournament(tournamentId);
            await loadTournaments();
            setDeleteModal({ isOpen: false, tournamentId: null });
        } catch (error) {
            console.error("Error deleting tournament:", error);
            await loadTournaments();
        }
    };

    if (isPending || loading) {
        return <div className="flex items-center justify-center h-96">Chargement...</div>;
    }

    if (!session) {
        redirect("/");
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

    const getPhaseLabel = (phase: string | null) => {
        if (!phase) return "Inscription";
        const phases: Record<string, string> = {
            registration: "Inscription",
            swiss: "Phase Suisse",
            playoffs: "Playoffs",
            finals: "Finale",
        };
        return phases[phase] || phase;
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-bold">Gestion des Tournois</h1>
                    <p className="text-default-500 mt-2">
                        Créer et gérer les tournois TFT
                    </p>
                </div>
                <Button
                    color="primary"
                    startContent={<Plus size={20} />}
                    onPress={onOpen}
                >
                    Nouveau Tournoi
                </Button>
            </div>

            {/* Statistiques rapides */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 border-2 border-divider rounded-lg bg-secondary/40">
                    <p className="text-sm text-default-500">Total Tournois</p>
                    <p className="text-2xl font-bold">{optimisticTournaments.length}</p>
                </div>
                <div className="p-4 border-2 border-divider rounded-lg bg-secondary/40">
                    <p className="text-sm text-default-500">En Cours</p>
                    <p className="text-2xl font-bold text-success">
                        {optimisticTournaments.filter(t => t.status === "ongoing").length}
                    </p>
                </div>
                <div className="p-4 border-2 border-divider rounded-lg bg-secondary/40">
                    <p className="text-sm text-default-500">À Venir</p>
                    <p className="text-2xl font-bold text-warning">
                        {optimisticTournaments.filter(t => t.status === "upcoming").length}
                    </p>
                </div>
                <div className="p-4 border-2 border-divider rounded-lg bg-secondary/40">
                    <p className="text-sm text-default-500">Terminés</p>
                    <p className="text-2xl font-bold text-default-400">
                        {optimisticTournaments.filter(t => t.status === "completed").length}
                    </p>
                </div>
            </div>

            {/* Tableau des tournois */}
            {optimisticTournaments.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-divider rounded-lg bg-secondary/30">
                    <AlertCircle size={48} className="text-default-300 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Aucun tournoi</h3>
                    <p className="text-default-500 mb-4">Créez votre premier tournoi pour commencer</p>
                    <Button color="primary" startContent={<Plus size={20} />} onPress={onOpen}>
                        Créer un tournoi
                    </Button>
                </div>
            ) : (
                <Table aria-label="Tableau des tournois">
                    <TableHeader>
                        <TableColumn>NOM</TableColumn>
                        <TableColumn>ANNÉE</TableColumn>
                        <TableColumn>PHASE</TableColumn>
                        <TableColumn>INSCRITS</TableColumn>
                        <TableColumn>STATUS</TableColumn>
                        <TableColumn>ACTIONS</TableColumn>
                    </TableHeader>
                    <TableBody>
                        {optimisticTournaments.map((tournament) => (
                            <TableRow key={tournament.id}>
                                <TableCell className="font-semibold">{tournament.name}</TableCell>
                                <TableCell>{tournament.year}</TableCell>
                                <TableCell>
                                    <Chip size="sm" variant="flat">
                                        {getPhaseLabel(tournament.currentPhase)}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Users size={16} className="text-default-400" />
                                        {tournament.registrationsCount}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Chip color={getStatusColor(tournament.status)} variant="dot" size="sm">
                                        {getStatusLabel(tournament.status)}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="light"
                                            isIconOnly
                                            onPress={() => router.push(`/admin/tournaments/${tournament.id}`)}
                                        >
                                            <Edit size={16} />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="light"
                                            color="danger"
                                            isIconOnly
                                            onPress={() => setDeleteModal({ isOpen: true, tournamentId: tournament.id })}
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {/* Modal de création */}
            <CreateTournamentModal
                isOpen={isOpen}
                onClose={onClose}
                onSuccess={loadTournaments}
            />

            {/* Modal de confirmation de suppression */}
            <Modal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, tournamentId: null })}
            >
                <ModalContent>
                    <ModalHeader>Confirmer la suppression</ModalHeader>
                    <ModalBody>
                        <p>Êtes-vous sûr de vouloir supprimer ce tournoi ? Cette action est irréversible.</p>
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            variant="light"
                            onPress={() => setDeleteModal({ isOpen: false, tournamentId: null })}
                        >
                            Annuler
                        </Button>
                        <Button
                            color="danger"
                            onPress={() => deleteModal.tournamentId && handleDelete(deleteModal.tournamentId)}
                        >
                            Supprimer
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}
