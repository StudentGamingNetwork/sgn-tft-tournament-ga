import { useState, useMemo } from "react";
import { Card } from "@heroui/card";
import { Tabs, Tab } from "@heroui/tabs";
import { Chip } from "@heroui/chip";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Pagination } from "@heroui/pagination";
import { Trophy, Award, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { PhasePlayerStats, GameWithResults } from "@/app/actions/tournaments";
import { getBracketChipColor } from "@/utils/bracket-colors";

interface OverviewTabProps {
    participants: PhasePlayerStats[];
    games: GameWithResults[];
    phaseOrderIndex: number;
}

const ITEMS_PER_PAGE = 20;

export function OverviewTab({ participants, games, phaseOrderIndex }: OverviewTabProps) {
    const [sortColumn, setSortColumn] = useState<keyof PhasePlayerStats | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedBracket, setSelectedBracket] = useState<string>("all");

    // Extraire les brackets uniques des games
    const brackets = useMemo(() => {
        const uniqueBrackets = Array.from(new Set(games.map(g => g.bracket_name)));
        return uniqueBrackets.filter(b => b !== "unknown");
    }, [games]);

    // Filtrer les participants par bracket
    const filteredParticipants = useMemo(() => {
        if (selectedBracket === "all" || brackets.length <= 1) {
            return participants;
        }

        // Obtenir les IDs des joueurs qui ont joué dans ce bracket
        const bracketPlayerIds = new Set(
            games
                .filter(g => g.bracket_name === selectedBracket)
                .flatMap(g => g.assignedPlayers.map(p => p.player_id))
        );

        return participants.filter(p => bracketPlayerIds.has(p.player_id));
    }, [participants, selectedBracket, brackets, games]);

    const handleSort = (column: keyof PhasePlayerStats) => {
        if (sortColumn === column) {
            // Cycle through: asc -> desc -> null (no sort)
            if (sortDirection === "asc") {
                setSortDirection("desc");
            } else {
                setSortColumn(null);
                setSortDirection("asc");
            }
        } else {
            // New column, default to ascending
            setSortColumn(column);
            setSortDirection("asc");
        }
    };

    const sortedParticipants = useMemo(() => {
        if (!sortColumn) return filteredParticipants;

        return [...filteredParticipants].sort((a, b) => {
            const aValue = a[sortColumn];
            const bValue = b[sortColumn];

            // Handle null/undefined values
            if (aValue == null && bValue == null) return 0;
            if (aValue == null) return 1;
            if (bValue == null) return -1;

            // Compare values
            let comparison = 0;
            if (typeof aValue === "string" && typeof bValue === "string") {
                comparison = aValue.localeCompare(bValue);
            } else if (typeof aValue === "number" && typeof bValue === "number") {
                comparison = aValue - bValue;
            }

            return sortDirection === "asc" ? comparison : -comparison;
        });
    }, [filteredParticipants, sortColumn, sortDirection]);

    const totalPages = Math.ceil(sortedParticipants.length / ITEMS_PER_PAGE);

    const paginatedParticipants = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        return sortedParticipants.slice(start, end);
    }, [sortedParticipants, currentPage]);

    const getSortIcon = (column: keyof PhasePlayerStats) => {
        if (sortColumn !== column) {
            return <ArrowUpDown size={14} className="opacity-40" />;
        }
        return sortDirection === "asc" ?
            <ArrowUp size={14} className="text-primary" /> :
            <ArrowDown size={14} className="text-primary" />;
    };

    const getTopCountColor = (count: number) => {
        if (count >= 5) return "text-success";
        if (count >= 3) return "text-warning";
        return "text-default-500";
    };

    return (
        <Card>
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Trophy className="text-primary" />
                        Classement des Participants
                    </h2>
                    {brackets.length > 1 && (
                        <Chip color={getBracketChipColor(selectedBracket)} variant="flat" size="lg">
                            {selectedBracket === "all" ? "Tous les brackets" : selectedBracket.toUpperCase()}
                        </Chip>
                    )}
                </div>

                {/* Tabs pour les brackets (si plusieurs) */}
                {brackets.length > 1 && (
                    <Tabs
                        selectedKey={selectedBracket}
                        onSelectionChange={(key) => {
                            setSelectedBracket(key as string);
                            setCurrentPage(1);
                        }}
                        aria-label="Brackets"
                        color="primary"
                        variant="underlined"
                        className="mb-4"
                        classNames={{
                            tabList: "gap-6 w-full relative rounded-none p-0 border-b border-divider",
                            cursor: "w-full bg-primary",
                            tab: "max-w-fit px-0 h-12",
                        }}
                    >
                        <Tab
                            key="all"
                            title={
                                <div className="flex items-center gap-2">
                                    <Trophy size={16} />
                                    <span>Tous ({participants.length})</span>
                                </div>
                            }
                        />
                        {brackets.map((bracket) => {
                            const bracketPlayerCount = games
                                .filter(g => g.bracket_name === bracket)
                                .flatMap(g => g.assignedPlayers)
                                .filter((p, idx, arr) => arr.findIndex(p2 => p2.player_id === p.player_id) === idx)
                                .length;

                            return (
                                <Tab
                                    key={bracket}
                                    title={
                                        <div className="flex items-center gap-2">
                                            <Chip
                                                size="sm"
                                                color={getBracketChipColor(bracket)}
                                                variant="dot"
                                            >
                                                {bracket.toUpperCase()}
                                            </Chip>
                                            <span>({bracketPlayerCount})</span>
                                        </div>
                                    }
                                />
                            );
                        })}
                    </Tabs>
                )}

                <Table aria-label="Participants table" className="min-w-full">
                    <TableHeader>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("current_rank")}
                            >
                                RANG {getSortIcon("current_rank")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("player_name")}
                            >
                                JOUEUR {getSortIcon("player_name")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("riot_id")}
                            >
                                RIOT ID {getSortIcon("riot_id")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("team_name")}
                            >
                                ÉQUIPE {getSortIcon("team_name")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("total_points")}
                            >
                                POINTS {getSortIcon("total_points")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("total_games")}
                            >
                                PARTIES {getSortIcon("total_games")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("avg_placement")}
                            >
                                MOY. PLACEMENT {getSortIcon("avg_placement")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top1_count")}
                            >
                                TOP 1 {getSortIcon("top1_count")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top2_count")}
                            >
                                TOP 2 {getSortIcon("top2_count")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top3_count")}
                            >
                                TOP 3 {getSortIcon("top3_count")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top4_count")}
                            >
                                TOP 4 {getSortIcon("top4_count")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top5_count")}
                            >
                                TOP 5 {getSortIcon("top5_count")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top6_count")}
                            >
                                TOP 6 {getSortIcon("top6_count")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top7_count")}
                            >
                                TOP 7 {getSortIcon("top7_count")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top8_count")}
                            >
                                TOP 8 {getSortIcon("top8_count")}
                            </button>
                        </TableColumn>
                        <TableColumn>
                            <button
                                className="flex items-center gap-1 hover:opacity-80"
                                onClick={() => handleSort("top4_or_better_count")}
                            >
                                TOP ≤4 {getSortIcon("top4_or_better_count")}
                            </button>
                        </TableColumn>
                    </TableHeader>
                    <TableBody>
                        {paginatedParticipants.map((participant) => (
                            <TableRow key={participant.player_id}>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {participant.current_rank <= 3 && (
                                            <Award
                                                size={16}
                                                className={
                                                    participant.current_rank === 1
                                                        ? "text-yellow-500"
                                                        : participant.current_rank === 2
                                                            ? "text-gray-400"
                                                            : "text-amber-700"
                                                }
                                            />
                                        )}
                                        <span className="font-bold">#{participant.current_rank}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-medium">{participant.player_name}</TableCell>
                                <TableCell className="text-default-500">{participant.riot_id}</TableCell>
                                <TableCell className="text-default-500">
                                    {participant.team_name || "-"}
                                </TableCell>
                                <TableCell>
                                    <span className="font-bold text-primary">
                                        {participant.total_points}
                                    </span>
                                </TableCell>
                                <TableCell>{participant.total_games}</TableCell>
                                <TableCell>
                                    {participant.avg_placement.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                    <span className={getTopCountColor(participant.top1_count)}>
                                        {participant.top1_count}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className={getTopCountColor(participant.top2_count)}>
                                        {participant.top2_count}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className={getTopCountColor(participant.top3_count)}>
                                        {participant.top3_count}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className={getTopCountColor(participant.top4_count)}>
                                        {participant.top4_count}
                                    </span>
                                </TableCell>
                                <TableCell>{participant.top5_count}</TableCell>
                                <TableCell>{participant.top6_count}</TableCell>
                                <TableCell>{participant.top7_count}</TableCell>
                                <TableCell>{participant.top8_count}</TableCell>
                                <TableCell>
                                    <span className="font-bold text-success">
                                        {participant.top4_or_better_count}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {totalPages > 1 && (
                    <div className="flex justify-center mt-6">
                        <Pagination
                            total={totalPages}
                            page={currentPage}
                            onChange={setCurrentPage}
                            showControls
                            color="primary"
                        />
                    </div>
                )}
            </div>
        </Card>
    );
}
