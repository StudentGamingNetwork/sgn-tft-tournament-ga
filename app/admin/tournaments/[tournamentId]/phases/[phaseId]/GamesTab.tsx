import { useState, useMemo, useEffect } from "react";
import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Tabs, Tab } from "@heroui/tabs";
import { Gamepad2, Target, Award, Edit } from "lucide-react";
import type { GameWithResults } from "@/app/actions/tournaments";
import type { GameResult } from "@/types/tournament";
import { forfeitPlayerAction, submitGameResultsAction } from "@/app/actions/tournaments";
import { EnterResultsModal } from "./EnterResultsModal";
import { getBracketChipColor } from "@/utils/bracket-colors";

interface GamesTabProps {
    tournamentId: string;
    games: GameWithResults[];
    onResultsSubmitted?: () => void;
}

const getTrPseudo = (
    riotId: string | null | undefined,
    fallbackName?: string | null,
): string => {
    const pseudo = riotId?.split("#")[0]?.trim();
    return pseudo || fallbackName || "-";
};

export function GamesTab({ tournamentId, games, onResultsSubmitted }: GamesTabProps) {
    const [selectedGame, setSelectedGame] = useState<GameWithResults | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedBracket, setSelectedBracket] = useState<string>("all");
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

    const handleForfeitPlayer = async (playerId: string, playerName: string) => {
        const accepted = window.confirm(
            `Confirmer le forfait de ${playerName} ?\n\nUtiliser ce bouton uniquement si le joueur apparaît encore dans un match alors qu'il a déjà forfait.\nCette action le retire des matchs non terminés, sans modifier les matchs déjà terminés.`,
        );

        if (!accepted) {
            return;
        }

        const result = await forfeitPlayerAction(tournamentId, playerId);
        if (!result.success) {
            throw new Error(result.error || "Erreur lors du forfait joueur");
        }

        if (onResultsSubmitted) {
            onResultsSubmitted();
        }
    };

    const bracketTabs = useMemo(() => {
        const bracketOrder = ["master", "amateur", "challenger", "common"];
        const bracketNames = Array.from(new Set(games.map((g) => g.bracket_name)));

        const sortedBracketNames = bracketNames.sort((a, b) => {
            const indexA = bracketOrder.indexOf(a);
            const indexB = bracketOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) {
                return a.localeCompare(b);
            }
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        return ["all", ...sortedBracketNames];
    }, [games]);

    const gamesForSelectedBracket = useMemo(() => {
        if (selectedBracket === "all") {
            return games;
        }
        return games.filter((g) => g.bracket_name === selectedBracket);
    }, [games, selectedBracket]);

    // Calculer les numéros de game uniques et trier (dans le bracket sélectionné)
    const gameNumbers = useMemo(() => {
        const numbers = Array.from(
            new Set(gamesForSelectedBracket.map((g) => g.game_number)),
        ).sort((a, b) => a - b);
        return numbers;
    }, [gamesForSelectedBracket]);

    useEffect(() => {
        if (gameNumbers.length === 0) {
            setSelectedGameNumber(1);
            return;
        }

        if (!gameNumbers.includes(selectedGameNumber)) {
            setSelectedGameNumber(gameNumbers[0]);
        }
    }, [gameNumbers, selectedGameNumber]);

    // Filtrer les games par le numéro sélectionné
    const filteredGames = useMemo(() => {
        return gamesForSelectedBracket.filter(g => g.game_number === selectedGameNumber).sort((a, b) => {
            // Trier par lobby name pour un affichage cohérent
            return a.lobby_name.localeCompare(b.lobby_name);
        });
    }, [gamesForSelectedBracket, selectedGameNumber]);

    // Calculer les stats pour chaque game number
    const gameStats = useMemo(() => {
        return gameNumbers.map(num => {
            const gamesForNumber = gamesForSelectedBracket.filter(g => g.game_number === num);
            const withResults = gamesForNumber.filter(g => g.hasResults).length;
            const total = gamesForNumber.length;
            return { gameNumber: num, withResults, total };
        });
    }, [gamesForSelectedBracket, gameNumbers]);

    const bracketStats = useMemo(() => {
        return bracketTabs
            .filter((bracket) => bracket !== "all")
            .map((bracket) => {
                const bracketGames = games.filter((g) => g.bracket_name === bracket);
                const withResults = bracketGames.filter((g) => g.hasResults).length;
                return {
                    bracket,
                    withResults,
                    total: bracketGames.length,
                };
            });
    }, [games, bracketTabs]);

    const totalGamesWithResults = useMemo(
        () => games.filter((g) => g.hasResults).length,
        [games],
    );

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
            {/* Tabs pour filtrer par bracket */}
            <Card>
                <div className="p-4">
                    <Tabs
                        selectedKey={selectedBracket}
                        onSelectionChange={(key) => setSelectedBracket(String(key))}
                        aria-label="Brackets"
                        color="primary"
                        variant="underlined"
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
                                    <span>Tous</span>
                                    <Chip
                                        size="sm"
                                        variant="flat"
                                        color={totalGamesWithResults === games.length ? "success" : "secondary"}
                                    >
                                        {totalGamesWithResults}/{games.length}
                                    </Chip>
                                </div>
                            }
                        />
                        {bracketStats.map((stat) => (
                            <Tab
                                key={stat.bracket}
                                title={
                                    <div className="flex items-center gap-2">
                                        <Chip
                                            size="sm"
                                            color={getBracketChipColor(stat.bracket)}
                                            variant="flat"
                                        >
                                            {stat.bracket.toUpperCase()}
                                        </Chip>
                                        <Chip
                                            size="sm"
                                            variant="flat"
                                            color={stat.withResults === stat.total ? "success" : "secondary"}
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
                        {gameStats.length === 0 && (
                            <Tab
                                key="0"
                                title={<span>Aucune partie</span>}
                                isDisabled
                            />
                        )}
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
                        <p>Aucune partie trouvée pour ce bracket et ce numéro de game.</p>
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
                                    color={getBracketChipColor(game.bracket_name)}
                                    variant="flat"
                                >
                                    {game.bracket_name.toUpperCase()}
                                </Chip>
                                <Button
                                    color={game.hasResults ? "warning" : "primary"}
                                    size="sm"
                                    startContent={<Edit size={16} />}
                                    onPress={() => handleOpenModal(game)}
                                >
                                    {game.hasResults ? "Modifier résultats" : "Saisir résultats"}
                                </Button>
                            </div>
                        </div>
                        {game.hasResults ? (
                            <Table aria-label={`Results for game ${game.game_number}`}>
                                <TableHeader>
                                    <TableColumn>PLACEMENT</TableColumn>
                                    <TableColumn>PSEUDO TR</TableColumn>
                                    <TableColumn>POINTS</TableColumn>
                                </TableHeader>
                                <TableBody>
                                    {game.results.map((result) => (
                                        <TableRow key={result.player_id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {result.result_status !== "forfeit" && result.placement === 1 && (
                                                        <Award size={16} className="text-yellow-500" />
                                                    )}
                                                    {result.result_status !== "forfeit" && result.placement === 2 && (
                                                        <Award size={16} className="text-default-400" />
                                                    )}
                                                    {result.result_status !== "forfeit" && result.placement === 3 && (
                                                        <Award size={16} className="text-amber-700" />
                                                    )}
                                                    <span className="font-bold">
                                                        {result.result_status === "forfeit" ? "FORFAIT" : `#${result.placement}`}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span>{getTrPseudo(result.riot_id, result.player_name)}</span>
                                                    {result.is_finalist && (
                                                        <Chip size="sm" color="warning" variant="flat">
                                                            Finaliste
                                                        </Chip>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={
                                                        result.result_status === "forfeit"
                                                            ? "font-semibold text-danger"
                                                            : result.placement <= 4
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
                                    <TableColumn>PSEUDO TR</TableColumn>
                                    <TableColumn>STATUT</TableColumn>
                                    <TableColumn>ACTION</TableColumn>
                                </TableHeader>
                                <TableBody>
                                    {game.assignedPlayers.map((player) => (
                                        <TableRow key={player.player_id}>
                                            <TableCell>
                                                <span className="text-default-400">Seed #{player.seed}</span>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span>{getTrPseudo(player.riot_id, player.player_name)}</span>
                                                    {player.is_finalist && (
                                                        <Chip size="sm" color="warning" variant="flat">
                                                            Finaliste
                                                        </Chip>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-default-400 italic">En attente</span>
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    size="sm"
                                                    color="danger"
                                                    variant="flat"
                                                    onPress={async () => {
                                                        try {
                                                            await handleForfeitPlayer(
                                                                player.player_id,
                                                                getTrPseudo(player.riot_id, player.player_name),
                                                            );
                                                        } catch (error) {
                                                            alert(
                                                                error instanceof Error
                                                                    ? error.message
                                                                    : "Erreur lors du forfait",
                                                            );
                                                        }
                                                    }}
                                                >
                                                    Forfait
                                                </Button>
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
