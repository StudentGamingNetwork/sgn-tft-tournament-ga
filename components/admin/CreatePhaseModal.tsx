"use client";

import { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
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
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setErrors({});
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setErrors({});

        try {
            const result = await createPhase({
                tournament_id: tournamentId,
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
                        <div className="p-3 bg-secondary/40 border border-divider rounded-lg">
                            <p className="text-sm text-default-500">
                                <strong>📝 Note :</strong> Cette action crée automatiquement la première
                                phase manquante dans la structure standard (Phase 1 à 5), avec les
                                brackets et le nombre de games configurés pour le format du tournoi.
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
                        Créer la phase manquante
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
