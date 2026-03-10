"use client";

import { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { updateTournament } from "@/app/actions/tournaments";
import type { Tournament } from "@/types/tournament";

interface EditTournamentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    tournament: Tournament;
}

export function EditTournamentModal({ isOpen, onClose, onSuccess, tournament }: EditTournamentModalProps) {
    const [formData, setFormData] = useState({
        name: tournament.name,
        year: tournament.year,
        status: tournament.status,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form when tournament changes
    useEffect(() => {
        setFormData({
            name: tournament.name,
            year: tournament.year,
            status: tournament.status,
        });
        setError(null);
    }, [tournament]);

    const handleSubmit = async () => {
        // Validation
        if (!formData.name.trim()) {
            setError("Le nom du tournoi est requis");
            return;
        }

        if (!formData.year) {
            setError("L'année est requise");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await updateTournament(tournament.id, {
                name: formData.name.trim(),
                year: formData.year,
                status: formData.status as "upcoming" | "ongoing" | "completed",
            });

            onSuccess?.();
            onClose();
        } catch (err) {
            console.error("Error updating tournament:", err);
            setError("Erreur lors de la modification du tournoi");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            // Reset to original values
            setFormData({
                name: tournament.name,
                year: tournament.year,
                status: tournament.status,
            });
            setError(null);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} size="2xl">
            <ModalContent>
                <ModalHeader>Modifier le tournoi</ModalHeader>
                <ModalBody>
                    <div className="flex flex-col gap-4">
                        {error && (
                            <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg text-danger-600 text-sm">
                                {error}
                            </div>
                        )}

                        <Input
                            label="Nom du tournoi"
                            placeholder="Ex: SGN TFT Tournament 2026"
                            value={formData.name}
                            onValueChange={(v) => setFormData({ ...formData, name: v })}
                            isRequired
                            isDisabled={isSubmitting}
                        />

                        <Input
                            type="number"
                            label="Année"
                            placeholder="2026"
                            value={formData.year}
                            onValueChange={(v) => setFormData({ ...formData, year: v })}
                            isRequired
                            isDisabled={isSubmitting}
                            min="2020"
                            max="2100"
                        />

                        <Select
                            label="Statut"
                            selectedKeys={[formData.status]}
                            onSelectionChange={(keys) => {
                                const value = Array.from(keys)[0] as "upcoming" | "ongoing" | "completed";
                                setFormData({ ...formData, status: value });
                            }}
                            isDisabled={isSubmitting}
                        >
                            <SelectItem key="upcoming">
                                À venir
                            </SelectItem>
                            <SelectItem key="ongoing">
                                En cours
                            </SelectItem>
                            <SelectItem key="completed">
                                Terminé
                            </SelectItem>
                        </Select>

                        <div className="text-sm text-default-500 mt-2">
                            <p className="font-semibold mb-1">Note:</p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>Les modifications seront appliquées immédiatement</li>
                                <li>Changez le statut selon l'avancement du tournoi</li>
                            </ul>
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={handleClose} isDisabled={isSubmitting}>
                        Annuler
                    </Button>
                    <Button
                        color="primary"
                        onPress={handleSubmit}
                        isLoading={isSubmitting}
                    >
                        Enregistrer les modifications
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
