"use client";

import { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Plus } from "lucide-react";
import { createPhase } from "@/app/actions/tournaments";

interface CreatePhaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    tournamentId: string;
}

export function CreatePhaseModal({
    isOpen,
    onClose,
    onSuccess,
    tournamentId,
}: CreatePhaseModalProps) {
    const [formData, setFormData] = useState({
        name: "",
        total_games: 4,
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setFormData({
                name: "",
                total_games: 4,
            });
            setErrors({});
        }
    }, [isOpen]);

    const handleChange = (field: string, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear error for this field
        if (errors[field]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.name || formData.name.trim().length < 2) {
            newErrors.name = "Le nom doit contenir au moins 2 caractères";
        }

        if (formData.total_games < 1) {
            newErrors.total_games = "Le nombre de parties doit être au moins 1";
        }

        if (formData.total_games > 50) {
            newErrors.total_games = "Le nombre de parties ne peut pas dépasser 50";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await createPhase({
                tournament_id: tournamentId,
                name: formData.name,
                total_games: formData.total_games,
            });

            if (result.success) {
                onSuccess();
                onClose();
            } else {
                setErrors({ submit: result.error || "Erreur lors de la création" });
            }
        } catch (error) {
            setErrors({ submit: "Une erreur est survenue" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg">
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Plus size={24} />
                        <span>Créer une phase</span>
                    </div>
                </ModalHeader>
                <ModalBody>
                    <div className="flex flex-col gap-4">
                        {/* Nom de la phase */}
                        <Input
                            label="Nom de la phase"
                            placeholder="Phase 1 - Qualifications"
                            value={formData.name}
                            onValueChange={(value) => handleChange("name", value)}
                            isRequired
                            errorMessage={errors.name}
                            isInvalid={!!errors.name}
                            description="Ex: Phase 1, Qualifications, Demi-finales..."
                        />

                        {/* Nombre de parties */}
                        <Input
                            label="Nombre de parties"
                            type="number"
                            value={formData.total_games.toString()}
                            onValueChange={(value) =>
                                handleChange("total_games", parseInt(value) || 1)
                            }
                            min={1}
                            max={50}
                            isRequired
                            errorMessage={errors.total_games}
                            isInvalid={!!errors.total_games}
                            description="Nombre total de parties à jouer dans cette phase"
                        />

                        {/* Informations complémentaires */}
                        <div className="p-3 bg-default-100 rounded-lg">
                            <p className="text-sm text-default-600">
                                <strong>📝 Note :</strong> L'ordre de la phase sera automatiquement
                                défini comme la suivante dans la liste des phases existantes.
                            </p>
                        </div>

                        {/* Error message */}
                        {errors.submit && (
                            <div className="p-3 bg-danger-50 border border-danger rounded-lg">
                                <p className="text-danger text-sm">{errors.submit}</p>
                            </div>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} isDisabled={isSubmitting}>
                        Annuler
                    </Button>
                    <Button
                        color="primary"
                        onPress={handleSubmit}
                        isLoading={isSubmitting}
                        startContent={!isSubmitting && <Plus size={18} />}
                    >
                        Créer la phase
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
