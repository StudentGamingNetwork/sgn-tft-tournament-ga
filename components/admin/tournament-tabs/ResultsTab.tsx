import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Pagination } from "@heroui/pagination";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTournamentGlobalResults } from "@/lib/hooks/useTournament";

interface ResultsTabProps {
    tournamentId: string;
}

export function ResultsTab({ tournamentId }: ResultsTabProps) {
    const { data, isLoading, error } = useTournamentGlobalResults(tournamentId);
    const [selectedFilter, setSelectedFilter] = useState("global");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    const activePhase = data?.activePhase;
    const availableFilters = data?.availableFilters || ["global"];

    const safeSelectedFilter = useMemo(() => {
        if (!availableFilters.includes(selectedFilter)) {
            return "global";
        }
        return selectedFilter;
    }, [availableFilters, selectedFilter]);

    const leaderboard =
        data?.leaderboardsByFilter?.[safeSelectedFilter] || data?.leaderboard || [];

    useEffect(() => {
        setCurrentPage(1);
    }, [safeSelectedFilter, leaderboard.length, pageSize]);

    const totalPages = Math.max(1, Math.ceil(leaderboard.length / pageSize));
    const paginatedLeaderboard = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return leaderboard.slice(startIndex, startIndex + pageSize);
    }, [leaderboard, currentPage, pageSize]);

    const filterLabel: Record<string, string> = {
        global: "Global",
        challenger: "Challenger",
        master: "Master",
        amateur: "Amateur",
        common: "Common",
    };

    const escapeCsvCell = (value: string | number): string => {
        const text = String(value ?? "");
        if (/[",\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    const handleExportCsv = () => {
        if (leaderboard.length === 0) return;

        const header = [
            "rang",
            "joueur",
            "riot_id",
            "points",
            "parties_jouees",
            "top_1",
            "top_4",
            "placement_moyen",
        ];

        const lines = leaderboard.map((entry) => [
            entry.rank,
            entry.player_name,
            entry.riot_id,
            entry.total_points,
            entry.games_played,
            entry.top1_count,
            entry.top4_count,
            entry.games_played > 0 ? entry.avg_placement.toFixed(2) : "-",
        ]);

        const csvContent = [header, ...lines]
            .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
            .join("\n");

        const blob = new Blob([`\uFEFF${csvContent}`], {
            type: "text/csv;charset=utf-8;",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const timestamp = new Date().toISOString().slice(0, 10);

        link.href = url;
        link.download = `classement-${safeSelectedFilter}-${timestamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const getFinalsSectionLabel = (rank: number): string => {
        if (rank <= 8) return "Finales - Challenger (Top 8)";
        if (rank <= 16) return "Finales - Master (Top 9-16)";
        if (rank <= 24) return "Finales - Amateur (Top 17-24)";
        return "Classement général hors finales";
    };

    if (isLoading) {
        return (
            <Card className="p-6 mt-4">
                <h2 className="text-2xl font-bold mb-4">Résultats et classements</h2>
                <p className="text-default-500">Chargement des résultats...</p>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-6 mt-4">
                <h2 className="text-2xl font-bold mb-4">Résultats et classements</h2>
                <p className="text-danger">Erreur lors du chargement des résultats.</p>
            </Card>
        );
    }

    return (
        <Card className="p-6 mt-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Résultats globaux</h2>
                <Chip size="sm" color="primary" variant="dot">
                    Mise à jour auto (5s)
                </Chip>
            </div>

            {!activePhase ? (
                <p className="text-default-500">
                    Les résultats seront disponibles une fois les parties commencées.
                </p>
            ) : (
                <>
                    <div className="mb-4 p-3 bg-default-100 rounded-lg text-sm text-default-700 flex flex-wrap items-center gap-3">
                        <span className="font-semibold">
                            Phase active: {activePhase.name}
                        </span>
                        <span>
                            Progression: {activePhase.gamesWithResults}/{activePhase.totalGamesExpected} parties
                        </span>
                        <span>
                            Dernière actualisation: {new Date(data!.updatedAt).toLocaleTimeString("fr-FR")}
                        </span>
                        {data?.filterPhase && (
                            <span>
                                Filtres bracket basés sur: {data.filterPhase.name}
                            </span>
                        )}
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        {availableFilters.map((filterKey) => (
                            <Button
                                key={filterKey}
                                size="sm"
                                variant={safeSelectedFilter === filterKey ? "solid" : "flat"}
                                color={safeSelectedFilter === filterKey ? "primary" : "default"}
                                onPress={() => setSelectedFilter(filterKey)}
                            >
                                {filterLabel[filterKey] || filterKey}
                            </Button>
                        ))}

                        <div className="ml-auto flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="flat"
                                color="primary"
                                onPress={handleExportCsv}
                                isDisabled={leaderboard.length === 0}
                            >
                                Exporter CSV
                            </Button>
                            {[10, 25, 50].map((size) => (
                                <Button
                                    key={size}
                                    size="sm"
                                    variant={pageSize === size ? "solid" : "flat"}
                                    color={pageSize === size ? "secondary" : "default"}
                                    onPress={() => setPageSize(size)}
                                >
                                    {size}/page
                                </Button>
                            ))}
                        </div>
                    </div>

                    {leaderboard.length === 0 ? (
                        <p className="text-default-500">
                            Aucune partie terminée pour le filtre {filterLabel[safeSelectedFilter] || safeSelectedFilter}.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-default-200 text-left text-default-500">
                                        <th className="py-2 pr-3">#</th>
                                        <th className="py-2 pr-3">Joueur</th>
                                        <th className="py-2 pr-3">Riot ID</th>
                                        <th className="py-2 pr-3">Points</th>
                                        <th className="py-2 pr-3">Parties</th>
                                        <th className="py-2 pr-3">Top 1</th>
                                        <th className="py-2 pr-3">Top 4</th>
                                        <th className="py-2 pr-3">Moy. place</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedLeaderboard.map((entry, index) => {
                                        const showFinalsSections =
                                            safeSelectedFilter === "global" &&
                                            data?.filterPhase?.order_index === 5;

                                        const currentSectionLabel = showFinalsSections
                                            ? getFinalsSectionLabel(entry.rank)
                                            : null;

                                        const previousEntry = index > 0 ? paginatedLeaderboard[index - 1] : null;
                                        const previousSectionLabel =
                                            previousEntry && showFinalsSections
                                                ? getFinalsSectionLabel(previousEntry.rank)
                                                : null;

                                        const shouldShowSectionHeader =
                                            !!currentSectionLabel && currentSectionLabel !== previousSectionLabel;

                                        return (
                                            <Fragment key={entry.player_id}>
                                                {shouldShowSectionHeader && (
                                                    <tr key={`section-${currentSectionLabel}-${entry.player_id}`} className="bg-default-100 border-y border-default-200">
                                                        <td colSpan={8} className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-default-700">
                                                            {currentSectionLabel}
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr className="border-b border-default-100">
                                                    <td className="py-2 pr-3 font-semibold">{entry.rank}</td>
                                                    <td className="py-2 pr-3">{entry.player_name}</td>
                                                    <td className="py-2 pr-3 text-default-500">{entry.riot_id}</td>
                                                    <td className="py-2 pr-3 font-semibold">{entry.total_points}</td>
                                                    <td className="py-2 pr-3">{entry.games_played}</td>
                                                    <td className="py-2 pr-3">{entry.top1_count}</td>
                                                    <td className="py-2 pr-3">{entry.top4_count}</td>
                                                    <td className="py-2 pr-3">{entry.games_played > 0 ? entry.avg_placement.toFixed(2) : "-"}</td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div className="mt-4 flex items-center justify-between gap-3">
                                <p className="text-xs text-default-500">
                                    Affichage {Math.min((currentPage - 1) * pageSize + 1, leaderboard.length)}-
                                    {Math.min(currentPage * pageSize, leaderboard.length)} sur {leaderboard.length}
                                </p>
                                {totalPages > 1 ? (
                                    <Pagination
                                        total={totalPages}
                                        page={currentPage}
                                        onChange={setCurrentPage}
                                        showControls
                                        color="primary"
                                        size="sm"
                                    />
                                ) : (
                                    <span className="text-xs text-default-600">
                                        Page 1 / 1
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </Card>
    );
}
