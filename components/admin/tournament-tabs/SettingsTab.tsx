"use client";

import { useState } from "react";
import { Card } from "@heroui/card";
import { Switch } from "@heroui/switch";
import { Button } from "@heroui/button";
import { updateTournament } from "@/app/actions/tournaments";

interface SettingsTabProps {
    tournamentId: string;
    isSimulation: boolean;
    onSimulationChanged?: () => Promise<void> | void;
}

export function SettingsTab({ tournamentId, isSimulation, onSimulationChanged }: SettingsTabProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [simulationEnabled, setSimulationEnabled] = useState(isSimulation);

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

    return (
        <Card className="p-6 mt-4">
            <h2 className="text-2xl font-bold mb-4">Paramètres du tournoi</h2>
            <div className="flex flex-col gap-4">
                <p className="text-default-500">
                    Configuration avancée du tournoi.
                </p>

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
