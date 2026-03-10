import { useState, useMemo } from "react";
import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Tabs, Tab } from "@heroui/tabs";
import { Gamepad2, Target, Award, Edit } from "lucide-react";
import type { GameWithResults } from "@/app/actions/tournaments";
import type { GameResult } from "@/types/tournament";
import { submitGameResultsAction } from "@/app/actions/tournaments";
import { EnterResultsModal } from "./EnterResultsModal";

interface GamesTabProps {
    games: GameWithResults[];
    onResultsSubmitted?: () => void;
}

export function GamesTab({ games, onResultsSubmitted }: GamesTabProps) {
    const [selectedGame, setSelectedGame] = useState<GameWithResults | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedGameNumber, setSelectedGameNumber] = useState<number>(1);

    const handleOpenModal = (game: GameWithResults) => {
        setSelectedGame(game);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setSelectedGame(null);
        setIsModalOpen(false);
    };

    const handleSubmitResults = async (results: GameResult[]) => {
        if (!selectedGame) return;

        const result = await submitGameResultsAction(selectedGame.game_id, results);

        if (result.success) {
            handleCloseModal();
            // Recharger les données
            if (onResultsSubmitted) {
                onResultsSubmitted();
            }
        } else {
            throw new Error(result.error || "Erreur lors de la soumission");
        }
    };

    // Calculer les numéros de game uniques et trier
    const gameNumbers = useMemo(() => {
        const numbers = Array.from(new Set(games.map(g => g.game_number))).sort((a, b) => a - b);
        return numbers;
    }, [games]);

    // Filtrer les games par le numéro sélectionné
    const filteredGames = useMemo(() => {
        return games.filter(g => g.game_number === selectedGameNumber).sort((a, b) => {
            // Trier par lobby name pour un affichage cohérent
            return a.lobby_name.localeCompare(b.lobby_name);
        });
    }, [games, selectedGameNumber]);

    // Calculer les stats pour chaque game number
    const gameStats = useMemo(() => {
        return gameNumbers.map(num => {
            const gamesForNumber = games.filter(g => g.game_number === num);
            const withResults = gamesForNumber.filter(g => g.hasResults).length;
            const total = gamesForNumber.length;
            return { gameNumber: num, withResults, total };
        });
    }, [games, gameNumbers]);

    if (games.length === 0) {
        return (
            <Card>
                <div className="p-8 text-center text-default-500">
                    <Gamepad2 size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Aucune partie jouée pour cette phase.</p>
                </div>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Tabs pour filtrer par numéro de game */}
            <Card>
                <div className="p-4">
                    <Tabs
                        selectedKey={selectedGameNumber.toString()}
                        onSelectionChange={(key) => setSelectedGameNumber(Number(key))}
                        aria-label="Game numbers"
                        color="primary"
                        variant="underlined"
                        classNames={{
                            tabList: "gap-6 w-full relative rounded-none p-0 border-b border-divider",
                            cursor: "w-full bg-primary",
                            tab: "max-w-fit px-0 h-12",
                        }}
                    >
                        {gameStats.map((stat) => (
                            <Tab
                                key={stat.gameNumber.toString()}
                                title={
                                    <div className="flex items-center gap-2">
                                        <Gamepad2 size={16} />
                                        <span>Partie {stat.gameNumber}</span>
                                        <Chip
                                            size="sm"
                                            variant="flat"
                                            color={stat.withResults === stat.total ? "success" : "warning"}
                                        >
                                            {stat.withResults}/{stat.total}
                                        </Chip>
                                    </div>
                                }
                            />
                        ))}
                    </Tabs>
                </div>
            </Card>

            {/* Liste des games filtrées */}
            {filteredGames.length === 0 && (
                <Card>
                    <div className="p-8 text-center text-default-500">
                        <Gamepad2 size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Aucune partie trouvée pour ce numéro de game.</p>
                    </div>
                </Card>
            )}

            {filteredGames.map((game) => (
                <Card key={game.game_id}>
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Target className="text-primary" />
                                {game.lobby_name}
                            </h3>
                            <div className="flex items-center gap-2">
                                <Chip
                                    color={game.bracket_name === "challenger" ? "success" : game.bracket_name === "master" ? "primary" : "warning"}
                                    variant="flat"
                                >
                                    {game.bracket_name.toUpperCase()}
                                </Chip>
                                {!game.hasResults && (
                                    <Button
                                        color="primary"
                                        size="sm"
                                        startContent={<Edit size={16} />}
                                        onPress={() => handleOpenModal(game)}
                                    >
                                        Saisir résultats
                                    </Button>
                                )}
                            </div>
                        </div>
                        {game.hasResults ? (
                            <Table aria-label={`Results for game ${game.game_number}`}>
                                <TableHeader>
                                    <TableColumn>PLACEMENT</TableColumn>
                                    <TableColumn>JOUEUR</TableColumn>
                                    <TableColumn>RIOT ID</TableColumn>
                                    <TableColumn>POINTS</TableColumn>
                                </TableHeader>
                                <TableBody>
                                    {game.results.map((result) => (
                                        <TableRow key={result.player_id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {result.placement === 1 && (
                                                        <Award size={16} className="text-yellow-500" />
                                                    )}
                                                    {result.placement === 2 && (
                                                        <Award size={16} className="text-gray-400" />
                                                    )}
                                                    {result.placement === 3 && (
                                                        <Award size={16} className="text-amber-700" />
                                                    )}
                                                    <span className="font-bold">#{result.placement}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {result.player_name}
                                            </TableCell>
                                            <TableCell className="text-default-500">
                                                {result.riot_id}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={
                                                        result.placement <= 4
                                                            ? "font-bold text-success"
                                                            : "text-default-500"
                                                    }
                                                >
                                                    {result.points} pts
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <Table aria-label={`Assigned players for game ${game.game_number}`}>
                                <TableHeader>
                                    <TableColumn>SEED</TableColumn>
                                    <TableColumn>JOUEUR</TableColumn>
                                    <TableColumn>RIOT ID</TableColumn>
                                    <TableColumn>STATUT</TableColumn>
                                </TableHeader>
                                <TableBody>
                                    {game.assignedPlayers.map((player) => (
                                        <TableRow key={player.player_id}>
                                            <TableCell>
                                                <span className="text-default-400">Seed #{player.seed}</span>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {player.player_name}
                                            </TableCell>
                                            <TableCell className="text-default-500">
                                                {player.riot_id}
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-default-400 italic">En attente</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Card>
            ))}

            {selectedGame && (
                <EnterResultsModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    game={selectedGame}
                    onSubmit={handleSubmitResults}
                />
            )}
        </div>
    );
}
