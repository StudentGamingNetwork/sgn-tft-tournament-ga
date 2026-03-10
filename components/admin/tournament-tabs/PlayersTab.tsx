import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Pagination } from "@heroui/pagination";
import { UserPlus, FileUp, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { SortableTableHeader } from "@/components/admin/SortableTableHeader";
import { PlayerActionButtons } from "@/components/admin/PlayerActionButtons";
import {
    useTournamentPlayers,
    useUnregisterPlayer,
    useUpdateRegistrationStatus,
    useConfirmAllPlayers,
    useUnconfirmAllPlayers,
    useUnregisterAllPlayers,
} from "@/lib/hooks/useTournament";
import type { PlayerWithRegistration } from "@/types/tournament";

// Fonctions pures hors du composant pour éviter les recréations
const getTierRank = (tier: string | null): number => {
    const tierOrder: Record<string, number> = {
        "CHALLENGER": 11,
        "GRANDMASTER": 10,
        "MASTER": 9,
        "DIAMOND": 8,
        "EMERALD": 7,
        "PLATINUM": 6,
        "GOLD": 5,
        "SILVER": 4,
        "BRONZE": 3,
        "IRON": 2,
        "UNRANKED": 1,
    };
    return tierOrder[tier?.toUpperCase() || "UNRANKED"] || 0;
};

const getDivisionRank = (division: string | null): number => {
    const divisionOrder: Record<string, number> = {
        "I": 4,
        "II": 3,
        "III": 2,
        "IV": 1,
    };
    return divisionOrder[division || ""] || 0;
};

interface PlayersTabProps {
    tournamentId: string;
    onImportOpen: () => void;
    onRegisterOpen: () => void;
    onEditPlayerOpen: (player: PlayerWithRegistration) => void;
}

export function PlayersTab({
    tournamentId,
    onImportOpen,
    onRegisterOpen,
    onEditPlayerOpen,
}: PlayersTabProps) {
    // TanStack Query hooks
    const { data: players = [], isLoading } = useTournamentPlayers(tournamentId);
    const unregisterPlayer = useUnregisterPlayer(tournamentId);
    const updateStatus = useUpdateRegistrationStatus(tournamentId);
    const confirmAll = useConfirmAllPlayers(tournamentId);
    const unconfirmAll = useUnconfirmAllPlayers(tournamentId);
    const unregisterAll = useUnregisterAllPlayers(tournamentId);

    // États locaux pour le tri uniquement
    const [sortColumn, setSortColumn] = useState<keyof PlayerWithRegistration | "team_name" | "registration_status" | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const playersPerPage = 10;

    // Handlers avec useCallback pour éviter recréation
    const handleEditPlayer = useCallback((player: PlayerWithRegistration) => {
        onEditPlayerOpen(player);
    }, [onEditPlayerOpen]);

    const handleUnregister = useCallback(async (playerId: string) => {
        if (!confirm("Êtes-vous sûr de vouloir désinscrire ce joueur ?")) {
            return;
        }
        try {
            await unregisterPlayer.mutateAsync(playerId);
        } catch (error) {
            console.error("Error unregistering player:", error);
            alert("Erreur lors de la désinscription");
        }
    }, [unregisterPlayer]);

    const handleConfirmRegistration = useCallback(async (playerId: string) => {
        try {
            await updateStatus.mutateAsync({ playerId, status: "confirmed" });
        } catch (error) {
            console.error("Error confirming registration:", error);
            alert("Erreur lors de la confirmation");
        }
    }, [updateStatus]);

    const handleUnconfirmRegistration = useCallback(async (playerId: string) => {
        try {
            await updateStatus.mutateAsync({ playerId, status: "registered" });
        } catch (error) {
            console.error("Error unconfirming registration:", error);
            alert("Erreur lors de l'annulation de la confirmation");
        }
    }, [updateStatus]);

    const handleConfirmAllPlayers = useCallback(async () => {
        if (!confirm(`Êtes-vous sûr de vouloir confirmer les ${players.length} joueurs ?`)) {
            return;
        }
        try {
            const result = await confirmAll.mutateAsync();
            if (result.success) {
                alert(`${result.count} joueur(s) confirmé(s) avec succès`);
            } else {
                alert(result.error || "Erreur lors de la confirmation");
            }
        } catch (error) {
            console.error("Error confirming all players:", error);
            alert("Erreur lors de la confirmation de tous les joueurs");
        }
    }, [players.length, confirmAll]);

    const handleUnconfirmAllPlayers = useCallback(async () => {
        if (!confirm(`Êtes-vous sûr de vouloir dévalider les ${players.length} joueurs ?`)) {
            return;
        }
        try {
            const result = await unconfirmAll.mutateAsync();
            if (result.success) {
                alert(`${result.count} joueur(s) dévalidé(s) avec succès`);
            } else {
                alert(result.error || "Erreur lors de la dévalidation");
            }
        } catch (error) {
            console.error("Error unconfirming all players:", error);
            alert("Erreur lors de la dévalidation de tous les joueurs");
        }
    }, [players.length, unconfirmAll]);

    const handleUnregisterAllPlayers = useCallback(async () => {
        if (!confirm(`⚠️ ATTENTION : Êtes-vous sûr de vouloir SUPPRIMER les ${players.length} joueurs du tournoi ?\n\nCette action est IRRÉVERSIBLE !`)) {
            return;
        }
        if (!confirm("Confirmez-vous vraiment vouloir supprimer TOUS les joueurs ?")) {
            return;
        }
        try {
            const result = await unregisterAll.mutateAsync();
            if (result.success) {
                alert(`${result.count} joueur(s) supprimé(s) avec succès`);
            } else {
                alert(result.error || "Erreur lors de la suppression");
            }
        } catch (error) {
            console.error("Error unregistering all players:", error);
            alert("Erreur lors de la suppression de tous les joueurs");
        }
    }, [players.length, unregisterAll]);

    const handleSort = useCallback((column: keyof PlayerWithRegistration | "team_name" | "registration_status") => {
        if (sortColumn === column) {
            // Cycle through: asc -> desc -> null (no sort)
            if (sortDirection === "asc") {
                setSortDirection("desc");
            } else {
                setSortColumn(null);
                setSortDirection("asc");
            }
        } else {
            setSortColumn(column);
            setSortDirection("asc");
        }
        // Réinitialiser à la page 1 quand le tri change
        setPage(1);
    }, [sortColumn, sortDirection]);

    // Tri optimisé avec useMemo direct
    const sortedPlayers = useMemo(() => {
        if (!sortColumn) return players;

        return [...players].sort((a, b) => {
            let aValue: any;
            let bValue: any;

            if (sortColumn === "team_name") {
                aValue = a.team?.name;
                bValue = b.team?.name;
            } else if (sortColumn === "registration_status") {
                aValue = a.registration.status;
                bValue = b.registration.status;
            } else if (sortColumn === "tier") {
                // Special handling for tier (rank) - compare by tier, then division, then LP
                const aTierRank = getTierRank(a.tier);
                const bTierRank = getTierRank(b.tier);

                if (aTierRank !== bTierRank) {
                    return sortDirection === "asc" ? aTierRank - bTierRank : bTierRank - aTierRank;
                }

                // If same tier, compare by division
                const aDivisionRank = getDivisionRank(a.division);
                const bDivisionRank = getDivisionRank(b.division);

                if (aDivisionRank !== bDivisionRank) {
                    return sortDirection === "asc" ? aDivisionRank - bDivisionRank : bDivisionRank - aDivisionRank;
                }

                // If same tier and division, compare by LP
                const aLP = a.league_points || 0;
                const bLP = b.league_points || 0;
                return sortDirection === "asc" ? aLP - bLP : bLP - aLP;
            } else {
                aValue = a[sortColumn];
                bValue = b[sortColumn];
            }

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
    }, [players, sortColumn, sortDirection]);

    // Pagination : calculer le nombre de pages
    const totalPages = useMemo(
        () => Math.ceil(sortedPlayers.length / playersPerPage),
        [sortedPlayers.length, playersPerPage]
    );

    const paginatedPlayers = useMemo(() => {
        const start = (page - 1) * playersPerPage;
        const end = start + playersPerPage;
        return sortedPlayers.slice(start, end);
    }, [sortedPlayers, page, playersPerPage]);

    // Réinitialiser la page si elle devient invalide après un changement de données
    useEffect(() => {
        if (page > totalPages && totalPages > 0) {
            setPage(totalPages);
        }
    }, [totalPages, page]);

    const isBulkActionLoading =
        confirmAll.isPending || unconfirmAll.isPending || unregisterAll.isPending;
    return (
        <Card className="p-6 mt-4">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-2xl font-bold">Gestion des joueurs</h2>
                    {players.length > 0 && (
                        <p className="text-sm text-default-500 mt-1">
                            {sortedPlayers.length} joueur{sortedPlayers.length > 1 ? 's' : ''} au total
                            {totalPages > 1 && ` • Page ${page}/${totalPages}`}
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button
                        color="secondary"
                        variant="flat"
                        startContent={<FileUp size={18} />}
                        onPress={onImportOpen}
                    >
                        Importer CSV
                    </Button>
                    <Button
                        color="primary"
                        startContent={<UserPlus size={18} />}
                        onPress={onRegisterOpen}
                    >
                        Inscrire un joueur
                    </Button>
                </div>
            </div>

            {players.length > 0 && (
                <div className="mb-4 p-4 bg-default-100 rounded-lg">
                    <p className="text-sm font-semibold mb-2">Actions en masse :</p>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            color="success"
                            variant="flat"
                            startContent={<CheckCircle size={16} />}
                            onPress={handleConfirmAllPlayers}
                            isDisabled={isBulkActionLoading}
                            isLoading={isBulkActionLoading}
                        >
                            Confirmer tous
                        </Button>
                        <Button
                            size="sm"
                            color="warning"
                            variant="flat"
                            startContent={<XCircle size={16} />}
                            onPress={handleUnconfirmAllPlayers}
                            isDisabled={isBulkActionLoading}
                            isLoading={isBulkActionLoading}
                        >
                            Dévalider tous
                        </Button>
                        <Button
                            size="sm"
                            color="danger"
                            variant="flat"
                            startContent={<Trash2 size={16} />}
                            onPress={handleUnregisterAllPlayers}
                            isDisabled={isBulkActionLoading}
                            isLoading={isBulkActionLoading}
                        >
                            Supprimer tous
                        </Button>
                    </div>
                </div>
            )}

            {isLoading && players.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                    <p className="text-default-500">Chargement des joueurs...</p>
                </div>
            ) : players.length === 0 ? (
                <p className="text-default-500 text-center py-8">
                    Aucun joueur inscrit pour le moment.
                </p>
            ) : (
                <Table aria-label="Liste des joueurs inscrits">
                    <TableHeader>
                        <TableColumn>
                            <SortableTableHeader
                                label="NOM"
                                columnKey="name"
                                currentSortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                            />
                        </TableColumn>
                        <TableColumn>
                            <SortableTableHeader
                                label="RIOT ID"
                                columnKey="riot_id"
                                currentSortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                            />
                        </TableColumn>
                        <TableColumn>
                            <SortableTableHeader
                                label="RANG"
                                columnKey="tier"
                                currentSortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                            />
                        </TableColumn>
                        <TableColumn>
                            <SortableTableHeader
                                label="DISCORD"
                                columnKey="discord_tag"
                                currentSortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                            />
                        </TableColumn>
                        <TableColumn>
                            <SortableTableHeader
                                label="ÉQUIPE"
                                columnKey="team_name"
                                currentSortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                            />
                        </TableColumn>
                        <TableColumn>
                            <SortableTableHeader
                                label="STATUT"
                                columnKey="registration_status"
                                currentSortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                            />
                        </TableColumn>
                        <TableColumn>ACTIONS</TableColumn>
                    </TableHeader>
                    <TableBody>
                        {paginatedPlayers.map((player) => (
                            <TableRow key={player.id}>
                                <TableCell>{player.name}</TableCell>
                                <TableCell>
                                    <code className="text-xs bg-default-100 px-2 py-1 rounded">
                                        {player.riot_id}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-semibold">{player.tier}</span>
                                        {player.division && (
                                            <span className="text-xs text-default-500">
                                                {player.division} - {player.league_points} LP
                                            </span>
                                        )}
                                        {!player.division && player.league_points ? (
                                            <span className="text-xs text-default-500">
                                                {player.league_points} LP
                                            </span>
                                        ) : null}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {player.discord_tag || (
                                        <span className="text-default-400">-</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {player.team?.name || (
                                        <span className="text-default-400">-</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        size="sm"
                                        color={
                                            player.registration.status === "confirmed"
                                                ? "success"
                                                : player.registration.status === "cancelled"
                                                    ? "danger"
                                                    : "warning"
                                        }
                                        variant="flat"
                                    >
                                        {player.registration.status === "confirmed"
                                            ? "Confirmé"
                                            : player.registration.status === "cancelled"
                                                ? "Annulé"
                                                : "Inscrit"}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    <PlayerActionButtons
                                        player={player}
                                        onConfirm={handleConfirmRegistration}
                                        onUnconfirm={handleUnconfirmRegistration}
                                        onEdit={handleEditPlayer}
                                        onUnregister={handleUnregister}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center mt-4">
                    <Pagination
                        total={totalPages}
                        page={page}
                        onChange={setPage}
                        showControls
                        color="primary"
                    />
                </div>
            )}
        </Card>
    );
}
