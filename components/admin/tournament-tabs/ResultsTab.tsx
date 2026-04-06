import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Pagination } from "@heroui/pagination";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTournamentGlobalResults } from "@/lib/hooks/useTournament";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 60] as const;

interface ResultsTabProps {
    tournamentId: string;
}


export function ResultsTab({ tournamentId }: ResultsTabProps) {
    const { data, isLoading, error } = useTournamentGlobalResults(tournamentId);
    const [selectedFilter, setSelectedFilter] = useState("global");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState<number | "all">(50);

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

    const totalPages = pageSize === "all"
        ? 1
        : Math.max(1, Math.ceil(leaderboard.length / pageSize));
    const paginatedLeaderboard = useMemo(() => {
        if (pageSize === "all") {
            return leaderboard;
        }

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
            "top_2",
            "top_3",
            "top_4",
            "top_5",
            "top_6",
            "top_7",
            "top_8",
            "placement_moyen",
        ];

        const lines = leaderboard.map((entry) => [
            entry.rank,
            entry.player_name,
            entry.riot_id,
            entry.total_points,
            entry.games_played,
            entry.top1_count,
            entry.top2_count,
            entry.top3_count,
            entry.top4_count,
            entry.top5_count,
            entry.top6_count,
            entry.top7_count,
            entry.top8_count,
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
            <Card className="p-6 mt-4 border border-divider">
                <h2 className="text-2xl font-bold mb-4">Résultats et classements</h2>
                <p className="text-default-500">Chargement des résultats...</p>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-6 mt-4 border border-divider">
                <h2 className="text-2xl font-bold mb-4">Résultats et classements</h2>
                <p className="text-danger">Erreur lors du chargement des résultats.</p>
            </Card>
        );
    }

    return (
        <Card className="p-6 mt-4 border border-divider">
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
                    <div className="mb-4 p-3 bg-secondary/40 border border-divider rounded-lg text-sm text-default-700 flex flex-wrap items-center gap-3">
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
                            {PAGE_SIZE_OPTIONS.map((size) => (
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
                            <Button
                                size="sm"
                                variant={pageSize === "all" ? "solid" : "flat"}
                                color={pageSize === "all" ? "secondary" : "default"}
                                onPress={() => setPageSize("all")}
                            >
                                Tous
                            </Button>
                        </div>
                    </div>

                    {leaderboard.length === 0 ? (
                        <p className="text-default-500">
                            Aucune partie terminée pour le filtre {filterLabel[safeSelectedFilter] || safeSelectedFilter}.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-[1200px] w-full text-sm whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-divider text-left text-default-500">
                                        <th className="py-2 pr-3">#</th>
                                        <th className="py-2 pr-3">Pseudo TR</th>
                                        <th className="py-2 pr-3">Points</th>
                                        <th className="py-2 pr-3">Parties</th>
                                        <th className="py-2 pr-3">Top 1</th>
                                        <th className="py-2 pr-3">Top 2</th>
                                        <th className="py-2 pr-3">Top 3</th>
                                        <th className="py-2 pr-3">Top 4</th>
                                        <th className="py-2 pr-3">Top 5</th>
                                        <th className="py-2 pr-3">Top 6</th>
                                        <th className="py-2 pr-3">Top 7</th>
                                        <th className="py-2 pr-3">Top 8</th>
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
                                                    <tr key={`section-${currentSectionLabel}-${entry.player_id}`} className="bg-secondary/40 border-y border-divider">
                                                        <td colSpan={13} className="py-2 px-2 text-xs font-semibold uppercase tracking-wide text-default-700">
                                                            {currentSectionLabel}
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr className="border-b border-default-100">
                                                    <td className="py-2 pr-3 font-semibold">{entry.rank}</td>
                                                    <td className="py-2 pr-3">
                                                        <div className="flex items-center gap-2">
                                                            <span>{entry.player_name || "-"}</span>
                                                            {entry.is_forfeited && (
                                                                <Chip size="sm" color="danger" variant="flat">
                                                                    Forfait
                                                                </Chip>
                                                            )}
                                                            {entry.used_phase34_tie_break && (
                                                                <Chip size="sm" color="secondary" variant="flat">
                                                                    TB P3+P4
                                                                </Chip>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-2 pr-3 font-semibold">{entry.total_points}</td>
                                                    <td className="py-2 pr-3">{entry.games_played}</td>
                                                    <td className="py-2 pr-3">{entry.top1_count}</td>
                                                    <td className="py-2 pr-3">{entry.top2_count}</td>
                                                    <td className="py-2 pr-3">{entry.top3_count}</td>
                                                    <td className="py-2 pr-3">{entry.top4_count}</td>
                                                    <td className="py-2 pr-3">{entry.top5_count}</td>
                                                    <td className="py-2 pr-3">{entry.top6_count}</td>
                                                    <td className="py-2 pr-3">{entry.top7_count}</td>
                                                    <td className="py-2 pr-3">{entry.top8_count}</td>
                                                    <td className="py-2 pr-3">{entry.games_played > 0 ? entry.avg_placement.toFixed(2) : "-"}</td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div className="mt-4 flex items-center justify-between gap-3">
                                <p className="text-xs text-default-500">
                                    {pageSize === "all"
                                        ? `Affichage 1-${leaderboard.length} sur ${leaderboard.length}`
                                        : `Affichage ${Math.min((currentPage - 1) * pageSize + 1, leaderboard.length)}-${Math.min(currentPage * pageSize, leaderboard.length)} sur ${leaderboard.length}`}
                                </p>
                                {pageSize !== "all" && totalPages > 1 ? (
                                    <Pagination
                                        total={totalPages}
                                        page={currentPage}
                                        onChange={setCurrentPage}
                                        showControls
                                        color="primary"
                                        size="sm"
                                    />
                                ) : (
                                    <span className="text-xs text-default-500">
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
