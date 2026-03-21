"use client";

import { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { createTournament } from "@/app/actions/tournaments";

interface CreateTournamentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function CreateTournamentModal({ isOpen, onClose, onSuccess }: CreateTournamentModalProps) {
    const [formData, setFormData] = useState({
        name: "",
        year: new Date().getFullYear().toString(),
        status: "upcoming",
        isSimulation: false,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            await createTournament({
                name: formData.name.trim(),
                year: formData.year,
                status: formData.status as "upcoming" | "ongoing" | "completed",
                isSimulation: formData.isSimulation,
            });

            // Reset form
            setFormData({
                name: "",
                year: new Date().getFullYear().toString(),
                status: "upcoming",
                isSimulation: false,
            });

            onSuccess?.();
            onClose();
        } catch (err) {
            console.error("Error creating tournament:", err);
            setError("Erreur lors de la création du tournoi");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setFormData({
                name: "",
                year: new Date().getFullYear().toString(),
                status: "upcoming",
                isSimulation: false,
            });
            setError(null);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} size="2xl">
            <ModalContent>
                <ModalHeader>Créer un nouveau tournoi</ModalHeader>
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
                            label="Statut initial"
                            selectedKeys={[formData.status]}
                            onSelectionChange={(keys) => {
                                const value = Array.from(keys)[0] as string;
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

                        <Switch
                            isSelected={formData.isSimulation}
                            onValueChange={(v) => setFormData({ ...formData, isSimulation: v })}
                            isDisabled={isSubmitting}
                        >
                            Mode simulation
                        </Switch>

                        {formData.isSimulation && (
                            <div className="p-3 bg-primary-50 border border-primary-200 rounded-lg text-primary-700 text-sm">
                                Le mode simulation débloque des actions d'administration avancées (ajout massif de joueurs et auto-résolution des parties) dans l'interface admin.
                            </div>
                        )}

                        <div className="text-sm text-default-500 mt-2">
                            <p className="font-semibold mb-1">Note:</p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>Un nouveau tournoi sera créé avec le statut sélectionné</li>
                                <li>Les 5 phases standards seront créées automatiquement (avec leurs brackets)</li>
                                <li>Le statut peut être modifié ultérieurement</li>
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
                        Créer le tournoi
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal >
    );
}
