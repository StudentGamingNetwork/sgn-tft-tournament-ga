import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import type { Tournament } from "@/types/tournament";

interface OverviewTabProps {
    tournament: Tournament;
    getStatusColor: (status: string) => "warning" | "success" | "default";
    getStatusLabel: (status: string) => string;
}

export function OverviewTab({ tournament, getStatusColor, getStatusLabel }: OverviewTabProps) {
    return (
        <Card className="p-6 mt-4">
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
    );
}
