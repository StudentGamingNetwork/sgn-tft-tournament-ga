import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import { useMemo, useState } from "react";

import {
    getSupportedTournamentPlayerCounts,
    getTournamentStructureForPlayerCount,
} from "@/lib/services/tournament-structure";
import type { Tournament } from "@/types/tournament";

interface OverviewTabProps {
    tournament: Tournament;
    confirmedPlayersCount: number;
    getStatusColor: (status: string) => "warning" | "success" | "default";
    getStatusLabel: (status: string) => string;
}

function getDefaultSupportedCount(confirmedPlayersCount: number): number {
    const supportedCounts = getSupportedTournamentPlayerCounts();
    const normalized = Math.max(64, Math.min(128, confirmedPlayersCount));

    const exact = supportedCounts.find((count) => count === normalized);
    if (exact) return exact;

    const floored = Math.floor(normalized / 8) * 8;
    return supportedCounts.find((count) => count === floored) || 64;
}

export function OverviewTab({ tournament, confirmedPlayersCount, getStatusColor, getStatusLabel }: OverviewTabProps) {
    const supportedCounts = useMemo(() => getSupportedTournamentPlayerCounts(), []);
    const [selectedPlayersCount, setSelectedPlayersCount] = useState<number>(
        getDefaultSupportedCount(confirmedPlayersCount),
    );
    const selectedPlayersCountKeys = useMemo(
        () => new Set([String(selectedPlayersCount)]),
        [selectedPlayersCount],
    );

    const selectedStructure = useMemo(
        () => getTournamentStructureForPlayerCount(selectedPlayersCount),
        [selectedPlayersCount],
    );

    const halfPlayersCount = selectedPlayersCount / 2;
    const hasHalfScenario = supportedCounts.includes(halfPlayersCount);
    const halfStructure = hasHalfScenario
        ? getTournamentStructureForPlayerCount(halfPlayersCount)
        : null;

    return (
        <div className="space-y-4 mt-4">
            <Card className="p-6">
                <h2 className="text-2xl font-bold mb-4">Vue d'ensemble</h2>
                <div className="space-y-4">
                    <div>
                        <p className="text-sm text-default-500">Nom du tournoi</p>
                        <p className="text-lg font-semibold">{tournament.name}</p>
                    </div>
                    <div>
                        <p className="text-sm text-default-500">Année</p>
                        <p className="text-lg font-semibold">{tournament.year}</p>
                    </div>
                    <div>
                        <p className="text-sm text-default-500">Statut</p>
                        <Chip color={getStatusColor(tournament.status)} variant="dot">
                            {getStatusLabel(tournament.status)}
                        </Chip>
                    </div>
                    <div>
                        <p className="text-sm text-default-500">Joueurs confirmés</p>
                        <p className="text-lg font-semibold">{confirmedPlayersCount}</p>
                    </div>
                    <div>
                        <p className="text-sm text-default-500">Créé le</p>
                        <p className="text-lg font-semibold">
                            {new Date(tournament.createdAt).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                            })}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-default-500">Dernière modification</p>
                        <p className="text-lg font-semibold">
                            {new Date(tournament.updatedAt).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                            })}
                        </p>
                    </div>
                </div>
            </Card>

            <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">Prévisualisation du format</h3>
                <div className="space-y-4">
                    <Select
                        label="Hypothèse de participants"
                        selectedKeys={selectedPlayersCountKeys}
                        onSelectionChange={(keys) => {
                            if (keys === "all") return;
                            const value = Array.from(keys)[0] as string | undefined;
                            if (!value) return;
                            setSelectedPlayersCount(Number(value));
                        }}
                    >
                        {supportedCounts.map((count) => (
                            <SelectItem key={String(count)} textValue={`${count} joueurs`}>
                                {count} joueurs
                            </SelectItem>
                        ))}
                    </Select>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border border-divider">
                            <p className="text-sm text-default-500">Phase 3</p>
                            <p className="font-semibold">
                                Master {selectedStructure.phase3.masterPlayers} / Amateur {selectedStructure.phase3.amateurPlayers}
                            </p>
                        </div>
                        <div className="p-3 rounded-lg border border-divider">
                            <p className="text-sm text-default-500">Phase 4</p>
                            <p className="font-semibold">
                                Master {selectedStructure.phase4.masterPlayers} (top cut {selectedStructure.phase4.masterTopCut}) / Amateur {selectedStructure.phase4.amateurPlayers}
                            </p>
                        </div>
                        <div className="p-3 rounded-lg border border-divider md:col-span-2">
                            <p className="text-sm text-default-500">Phase 5 - Finale</p>
                            <p className="font-semibold">
                                Challenger {selectedStructure.phase5.challengerPlayers} / Master {selectedStructure.phase5.masterPlayers} / Amateur {selectedStructure.phase5.amateurPlayers}
                            </p>
                        </div>
                    </div>

                    <div className="p-3 rounded-lg bg-warning-50 border border-warning-200">
                        <p className="font-semibold">Règle clé</p>
                        <p className="text-sm text-default-600">
                            Le top cut est appliqué en Phase 4 Master (réduction après les deux premières parties). La finale reste sur 3 brackets de 8 joueurs.
                        </p>
                    </div>

                    {halfStructure ? (
                        <div className="p-3 rounded-lg bg-primary-50 border border-primary-200">
                            <p className="font-semibold">Scénario "2x moins de joueurs" ({halfPlayersCount})</p>
                            <p className="text-sm text-default-600 mt-1">
                                Phase 3: Master {halfStructure.phase3.masterPlayers} / Amateur {halfStructure.phase3.amateurPlayers}.
                                Phase 4: Master {halfStructure.phase4.masterPlayers} / Amateur {halfStructure.phase4.amateurPlayers}.
                                Finale inchangée: 3 brackets de 8 joueurs.
                            </p>
                        </div>
                    ) : null}
                </div>
            </Card>
        </div>
    );
}
