"use client";

import { useState } from "react";
import { Card } from "@heroui/card";
import { Switch } from "@heroui/switch";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { updateTournament } from "@/app/actions/tournaments";

interface SettingsTabProps {
    tournamentId: string;
    isSimulation: boolean;
    structureImageUrl?: string | null;
    rulesUrl?: string | null;
    onSimulationChanged?: () => Promise<void> | void;
}

export function SettingsTab({ tournamentId, isSimulation, structureImageUrl, rulesUrl, onSimulationChanged }: SettingsTabProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [simulationEnabled, setSimulationEnabled] = useState(isSimulation);
    const [contentSubmitting, setContentSubmitting] = useState(false);
    const [contentError, setContentError] = useState<string | null>(null);
    const [formState, setFormState] = useState({
        structureImageUrl: structureImageUrl || "",
        rulesUrl: rulesUrl || "",
    });

    const handleSimulationToggle = async (enabled: boolean) => {
        setSimulationEnabled(enabled);
        setIsSubmitting(true);

        try {
            await updateTournament(tournamentId, {
                is_simulation: enabled,
            });
            await onSimulationChanged?.();
        } catch (error) {
            console.error("Error updating simulation mode:", error);
            setSimulationEnabled((prev) => !prev);
            alert("Erreur lors de la mise a jour du mode simulation");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleContentSave = async () => {
        if (!formState.structureImageUrl.trim()) {
            setContentError("L'image de structure est obligatoire.");
            return;
        }

        setContentSubmitting(true);
        setContentError(null);

        try {
            await updateTournament(tournamentId, {
                structure_image_url: formState.structureImageUrl.trim(),
                rules_url: formState.rulesUrl.trim() || null,
            });
            await onSimulationChanged?.();
        } catch (error) {
            console.error("Error updating tournament content settings:", error);
            setContentError("Erreur lors de la mise a jour des contenus publics.");
        } finally {
            setContentSubmitting(false);
        }
    };

    return (
        <Card className="p-6 mt-4">
            <h2 className="text-2xl font-bold mb-4">Paramètres du tournoi</h2>
            <div className="flex flex-col gap-4">
                <p className="text-default-500">
                    Configuration avancée du tournoi.
                </p>

                <div className="flex flex-col gap-3 p-4 border border-divider rounded-lg">
                    <p className="font-semibold">Contenus publics</p>
                    <Input
                        label="Image de structure (URL)"
                        placeholder="https://.../structure.png"
                        value={formState.structureImageUrl}
                        onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, structureImageUrl: value }))
                        }
                        isDisabled={contentSubmitting}
                        isRequired
                    />
                    <Input
                        label="Lien externe règlement"
                        placeholder="https://..."
                        value={formState.rulesUrl}
                        onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, rulesUrl: value }))
                        }
                        isDisabled={contentSubmitting}
                    />
                    {contentError && (
                        <p className="text-sm text-danger">{contentError}</p>
                    )}
                    <div className="flex justify-end">
                        <Button
                            color="primary"
                            onPress={handleContentSave}
                            isLoading={contentSubmitting}
                            isDisabled={isSubmitting}
                        >
                            Enregistrer les contenus publics
                        </Button>
                    </div>
                </div>

                <div className="flex items-start justify-between gap-4 p-4 border border-divider rounded-lg">
                    <div>
                        <p className="font-semibold">Mode simulation</p>
                        <p className="text-sm text-default-500 mt-1">
                            Active ou desactive les actions d'administration de simulation
                            (generation de joueurs et auto-resolution des parties).
                        </p>
                    </div>
                    <Switch
                        isSelected={simulationEnabled}
                        onValueChange={handleSimulationToggle}
                        isDisabled={isSubmitting}
                    />
                </div>
            </div>
        </Card>
    );
}
