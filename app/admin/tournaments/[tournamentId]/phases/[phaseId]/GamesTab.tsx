import { useState, useMemo, useEffect } from "react";
import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Tabs, Tab } from "@heroui/tabs";
import { Gamepad2, Target, Award, Edit, RotateCcw } from "lucide-react";
import type { GameWithResults } from "@/app/actions/tournaments";
import type { GameResult } from "@/types/tournament";
import {
    addTournamentPlayerToLobbyAction,
    forfeitPlayerAction,
    getTournamentPlayers,
    repechagePlayerAction,
    deleteGameAction,
    resetGameSeedingAction,
    renameLobbyAction,
    submitGameResultsAction,
    reassignPlayerBetweenLobbiesAction,
    swapPlayersBetweenLobbiesAction,
} from "@/app/actions/tournaments";
import { EnterResultsModal } from "./EnterResultsModal";
import { ReassignPlayersModal } from "./ReassignPlayersModal";
import { AddTournamentPlayerModal } from "./AddTournamentPlayerModal";
import { getBracketChipColor } from "@/utils/bracket-colors";

interface GamesTabProps {
    tournamentId: string;
    phaseOrderIndex: number;
    games: GameWithResults[];
    onResultsSubmitted?: () => void;
}

type TournamentPlayerOption = {
    id: string;
    name: string;
    riot_id: string;
    registration: {
        status: "registered" | "confirmed" | "cancelled";
        forfeited_at?: Date | null;
    };
};

const RESULTS_DRAFT_PREFIX = "tft-results-draft:";
const RESULTS_DRAFT_DISABLE_AUTOOPEN_PREFIX = "tft-results-draft-disable-autoopen:";

const BRACKET_DISPLAY_ORDER = ["common", "challenger", "master", "amateur"] as const;

function getBracketDisplayName(bracketName: string): string {
    const normalized = bracketName.toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getBracketOrder(bracketName: string): number {
    const normalized = bracketName.toLowerCase();
    const index = BRACKET_DISPLAY_ORDER.indexOf(
        normalized as (typeof BRACKET_DISPLAY_ORDER)[number],
    );

    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}


export function GamesTab({ tournamentId, phaseOrderIndex, games, onResultsSubmitted }: GamesTabProps) {
    const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
    const [reassignMode, setReassignMode] = useState<"move" | "swap">("move");
    const [reassignSourceGame, setReassignSourceGame] = useState<GameWithResults | null>(null);
    const [reassignSourcePlayer, setReassignSourcePlayer] = useState<GameWithResults["assignedPlayers"][number] | null>(null);
    const [selectedGame, setSelectedGame] = useState<GameWithResults | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedBracket, setSelectedBracket] = useState<string>("all");
    const [selectedGameNumber, setSelectedGameNumber] = useState<number>(1);
    const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
    const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayerOption[]>([]);
    const [isLoadingTournamentPlayers, setIsLoadingTournamentPlayers] = useState(false);
    const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false);
    const [addPlayerTargetGame, setAddPlayerTargetGame] = useState<GameWithResults | null>(null);

    const isFinalsPhase = phaseOrderIndex === 5;

    const setDraftAutoOpenDisabled = (gameId: string, disabled: boolean) => {
        if (typeof window === "undefined") {
            return;
        }

        const key = `${RESULTS_DRAFT_DISABLE_AUTOOPEN_PREFIX}${gameId}`;
        if (disabled) {
            window.localStorage.setItem(key, "1");
        } else {
            window.localStorage.removeItem(key);
        }
    };

    const handleOpenModal = (game: GameWithResults) => {
        setDraftAutoOpenDisabled(game.game_id, false);
        setSelectedGame(game);
        setIsModalOpen(true);
    };

    const handleCloseModal = (reason: "cancel" | "submit" = "cancel") => {
        if (reason === "cancel" && selectedGame) {
            setDraftAutoOpenDisabled(selectedGame.game_id, true);
        }

        setSelectedGame(null);
        setIsModalOpen(false);
    };

    const handleSubmitResults = async (results: GameResult[]) => {
        if (!selectedGame) return;

        const result = await submitGameResultsAction(selectedGame.game_id, results);

        if (result.success) {
            handleCloseModal("submit");
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

    const handleRepechagePlayer = async (
        gameData: GameWithResults,
        playerId: string,
        playerName: string,
    ) => {
        const activePlayersCount = gameData.results.filter(
            (result) => result.result_status === "normal",
        ).length;
        const maxPlacement = Math.min(8, activePlayersCount + 1);

        const placementInput = window.prompt(
            `Placement pour repêcher ${playerName} (1-${maxPlacement})`,
            String(maxPlacement),
        );

        if (placementInput === null) {
            return;
        }

        const placement = Number.parseInt(placementInput, 10);
        if (!Number.isInteger(placement) || placement < 1 || placement > maxPlacement) {
            throw new Error(`Placement invalide. Valeur attendue: 1-${maxPlacement}`);
        }

        const accepted = window.confirm(
            `Confirmer le repêchage de ${playerName} ?\n\n` +
            "Le joueur passe en resultat normal sur cette game,\n" +
            "son forfait global est retire,\n" +
            "et les games futures non terminees du bracket seront regenerees.",
        );

        if (!accepted) {
            return;
        }

        const result = await repechagePlayerAction(gameData.game_id, playerId, placement);
        if (!result.success) {
            throw new Error(result.error || "Erreur lors du repechage joueur");
        }

        if (onResultsSubmitted) {
            onResultsSubmitted();
        }
    };

    const handleOpenReassignModal = (
        mode: "move" | "swap",
        sourceGame: GameWithResults,
        sourcePlayer: GameWithResults["assignedPlayers"][number],
    ) => {
        setReassignMode(mode);
        setReassignSourceGame(sourceGame);
        setReassignSourcePlayer(sourcePlayer);
        setIsReassignModalOpen(true);
    };

    const handleOpenAddPlayerModal = (targetGame: GameWithResults) => {
        setAddPlayerTargetGame(targetGame);
        setIsAddPlayerModalOpen(true);
    };

    const handleCloseAddPlayerModal = () => {
        setIsAddPlayerModalOpen(false);
        setAddPlayerTargetGame(null);
    };

    const handleResetSeeding = async (game: GameWithResults) => {
        const accepted = window.confirm(
            `Reset le seeding de ${game.lobby_name} (partie #${game.game_number}) ?\n\n` +
            "Cette action recree toutes les lobbies de cette partie pour le meme bracket.\n" +
            "Les resultats existants sur cette partie doivent etre vides.",
        );

        if (!accepted) {
            return;
        }

        const result = await resetGameSeedingAction(game.game_id);
        if (!result.success) {
            throw new Error(result.error || "Erreur lors du reset du seeding");
        }

        if (onResultsSubmitted) {
            onResultsSubmitted();
        }
    };

    const handleDeleteGame = async (game: GameWithResults) => {
        const accepted = window.confirm(
            `Supprimer ${game.lobby_name} (partie #${game.game_number}) ?\n\n` +
            "Cette action supprime uniquement une partie sans resultats.\n" +
            "Utilise-la pour retirer une game creee par erreur avant de reseeder.",
        );

        if (!accepted) {
            return;
        }

        const result = await deleteGameAction(game.game_id);
        if (!result.success) {
            throw new Error(result.error || "Erreur lors de la suppression de la partie");
        }

        if (onResultsSubmitted) {
            onResultsSubmitted();
        }
    };

    const handleRenameLobby = async (game: GameWithResults) => {
        const nextLobbyName = window.prompt("Nouveau nom du lobby", game.lobby_name);

        if (nextLobbyName === null) {
            return;
        }

        const result = await renameLobbyAction(game.game_id, nextLobbyName);
        if (!result.success) {
            throw new Error(result.error || "Erreur lors du renommage du lobby");
        }

        if (onResultsSubmitted) {
            onResultsSubmitted();
        }
    };

    const handleCloseReassignModal = () => {
        setIsReassignModalOpen(false);
        setReassignSourceGame(null);
        setReassignSourcePlayer(null);
    };

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        if (hasRestoredDraft || isModalOpen || games.length === 0) {
            return;
        }

        const candidates: Array<{ gameId: string; updatedAt: number }> = [];

        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key || !key.startsWith(RESULTS_DRAFT_PREFIX)) {
                continue;
            }

            const gameId = key.slice(RESULTS_DRAFT_PREFIX.length);
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                continue;
            }

            try {
                const parsed = JSON.parse(raw) as { updatedAt?: number };
                candidates.push({
                    gameId,
                    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
                });
            } catch {
                // Ignore invalid draft payloads
            }
        }

        if (candidates.length === 0) {
            setHasRestoredDraft(true);
            return;
        }

        const sortedCandidates = candidates.sort((a, b) => b.updatedAt - a.updatedAt);
        let draftGame: GameWithResults | null = null;

        for (const candidate of sortedCandidates) {
            const matchedGame = games.find((g) => g.game_id === candidate.gameId);
            const autoOpenDisabled = window.localStorage.getItem(
                `${RESULTS_DRAFT_DISABLE_AUTOOPEN_PREFIX}${candidate.gameId}`,
            ) === "1";

            if (!matchedGame || matchedGame.hasResults) {
                window.localStorage.removeItem(`${RESULTS_DRAFT_PREFIX}${candidate.gameId}`);
                window.localStorage.removeItem(
                    `${RESULTS_DRAFT_DISABLE_AUTOOPEN_PREFIX}${candidate.gameId}`,
                );
                continue;
            }

            if (autoOpenDisabled) {
                continue;
            }

            draftGame = matchedGame;
            break;
        }

        if (!draftGame) {
            setHasRestoredDraft(true);
            return;
        }

        setSelectedBracket(draftGame.bracket_name);
        setSelectedGameNumber(draftGame.game_number);
        setSelectedGame(draftGame);
        setIsModalOpen(true);
        setHasRestoredDraft(true);
    }, [games, hasRestoredDraft, isModalOpen]);

    const bracketTabs = useMemo(() => {
        const bracketNames = Array.from(new Set(games.map((g) => g.bracket_name)));

        const sortedBracketNames = bracketNames.sort((a, b) => {
            const orderDiff = getBracketOrder(a) - getBracketOrder(b);
            if (orderDiff !== 0) {
                return orderDiff;
            }

            const indexA = getBracketOrder(a);
            const indexB = getBracketOrder(b);
            if (indexA === Number.MAX_SAFE_INTEGER && indexB === Number.MAX_SAFE_INTEGER) {
                return a.localeCompare(b);
            }

            return a.localeCompare(b);
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

    const reassignCandidateGames = useMemo(() => {
        if (!reassignSourceGame) {
            return [] as GameWithResults[];
        }

        return filteredGames.filter((candidate) =>
            candidate.game_id !== reassignSourceGame.game_id &&
            candidate.bracket_name === reassignSourceGame.bracket_name &&
            candidate.game_number === reassignSourceGame.game_number &&
            !candidate.hasResults,
        );
    }, [filteredGames, reassignSourceGame]);

    const addPlayerCandidates = useMemo(() => {
        if (!addPlayerTargetGame) {
            return [] as TournamentPlayerOption[];
        }

        const assignedPlayerIdsForRound = new Set(
            filteredGames
                .flatMap((g) => g.assignedPlayers)
                .map((player) => player.player_id),
        );

        return tournamentPlayers.filter((player) => {
            if (player.registration.status === "cancelled") {
                return false;
            }

            if (player.registration.forfeited_at) {
                return false;
            }

            return !assignedPlayerIdsForRound.has(player.id);
        });
    }, [addPlayerTargetGame, filteredGames, tournamentPlayers]);

    const handleMovePlayer = async (targetGameId: string) => {
        if (!reassignSourceGame || !reassignSourcePlayer) {
            return;
        }

        const result = await reassignPlayerBetweenLobbiesAction(
            reassignSourceGame.game_id,
            targetGameId,
            reassignSourcePlayer.player_id,
        );

        if (!result.success) {
            throw new Error(result.error || "Erreur lors du deplacement du joueur");
        }

        if (onResultsSubmitted) {
            onResultsSubmitted();
        }
    };

    const handleSwapPlayers = async (targetGameId: string, targetPlayerId: string) => {
        if (!reassignSourceGame || !reassignSourcePlayer) {
            return;
        }

        const result = await swapPlayersBetweenLobbiesAction(
            reassignSourceGame.game_id,
            reassignSourcePlayer.player_id,
            targetGameId,
            targetPlayerId,
        );

        if (!result.success) {
            throw new Error(result.error || "Erreur lors de l'echange des joueurs");
        }

        if (onResultsSubmitted) {
            onResultsSubmitted();
        }
    };

    const handleAddPlayerToLobby = async (playerId: string) => {
        if (!addPlayerTargetGame) {
            return;
        }

        const result = await addTournamentPlayerToLobbyAction(
            addPlayerTargetGame.game_id,
            playerId,
        );

        if (!result.success) {
            throw new Error(result.error || "Erreur lors de l'ajout du joueur");
        }

        if (onResultsSubmitted) {
            onResultsSubmitted();
        }
    };

    useEffect(() => {
        let isMounted = true;

        const loadTournamentPlayers = async () => {
            if (!isFinalsPhase) {
                return;
            }

            setIsLoadingTournamentPlayers(true);
            try {
                const players = await getTournamentPlayers(tournamentId);
                if (!isMounted) {
                    return;
                }
                setTournamentPlayers(players as TournamentPlayerOption[]);
            } catch {
                if (!isMounted) {
                    return;
                }
                setTournamentPlayers([]);
            } finally {
                if (isMounted) {
                    setIsLoadingTournamentPlayers(false);
                }
            }
        };

        void loadTournamentPlayers();

        return () => {
            isMounted = false;
        };
    }, [isFinalsPhase, tournamentId]);

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
                                            {getBracketDisplayName(stat.bracket)}
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
                                    {getBracketDisplayName(game.bracket_name)}
                                </Chip>
                                <Button
                                    color="secondary"
                                    size="sm"
                                    variant="flat"
                                    startContent={<Edit size={16} />}
                                    onPress={async () => {
                                        try {
                                            await handleRenameLobby(game);
                                        } catch (error) {
                                            alert(error instanceof Error ? error.message : "Erreur lors du renommage");
                                        }
                                    }}
                                >
                                    Renommer lobby
                                </Button>
                                <Button
                                    color={game.hasResults ? "warning" : "primary"}
                                    size="sm"
                                    startContent={<Edit size={16} />}
                                    onPress={() => handleOpenModal(game)}
                                >
                                    {game.hasResults ? "Modifier résultats" : "Saisir résultats"}
                                </Button>
                                {!game.hasResults && (
                                    <>
                                        <Button
                                            color="secondary"
                                            size="sm"
                                            variant="flat"
                                            startContent={<RotateCcw size={16} />}
                                            onPress={async () => {
                                                try {
                                                    await handleResetSeeding(game);
                                                } catch (error) {
                                                    alert(error instanceof Error ? error.message : "Erreur lors du reset");
                                                }
                                            }}
                                        >
                                            Reset seeding
                                        </Button>
                                        <Button
                                            color="danger"
                                            size="sm"
                                            variant="flat"
                                            onPress={async () => {
                                                try {
                                                    await handleDeleteGame(game);
                                                } catch (error) {
                                                    alert(error instanceof Error ? error.message : "Erreur lors de la suppression");
                                                }
                                            }}
                                        >
                                            Supprimer
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                        {game.hasResults ? (
                            <Table aria-label={`Results for game ${game.game_number}`}>
                                <TableHeader>
                                    <TableColumn>PLACEMENT</TableColumn>
                                    <TableColumn>PSEUDO TR</TableColumn>
                                    <TableColumn>POINTS</TableColumn>
                                    <TableColumn>ACTION</TableColumn>
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
                                                        {result.result_status === "forfeit"
                                                            ? "FORFAIT"
                                                            : result.result_status === "absent"
                                                            ? "ABSENT"
                                                            : `#${result.placement}`}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span>{result.player_name || "-"}</span>
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
                                                        result.result_status !== "normal"
                                                            ? "font-semibold text-danger"
                                                            : result.placement <= 4
                                                            ? "font-bold text-success"
                                                            : "text-default-500"
                                                    }
                                                >
                                                    {result.points} pts
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {result.result_status === "forfeit" ? (
                                                    <Button
                                                        size="sm"
                                                        color="warning"
                                                        variant="flat"
                                                        onPress={async () => {
                                                            try {
                                                                await handleRepechagePlayer(
                                                                    game,
                                                                    result.player_id,
                                                                    result.player_name || "-",
                                                                );
                                                            } catch (error) {
                                                                alert(
                                                                    error instanceof Error
                                                                        ? error.message
                                                                        : "Erreur lors du repechage",
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        Repecher
                                                    </Button>
                                                ) : (
                                                    <span className="text-default-400">-</span>
                                                )}
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
                                                <span className="text-default-400">Seed #{player.display_seed ?? player.seed}</span>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span>{player.player_name || "-"}</span>
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
                                                <div className="flex flex-wrap gap-2">
                                                    {isFinalsPhase && (
                                                        <Button
                                                            size="sm"
                                                            color="success"
                                                            variant="flat"
                                                            isDisabled={
                                                                game.hasResults ||
                                                                game.assignedPlayers.length >= 8 ||
                                                                isLoadingTournamentPlayers
                                                            }
                                                            onPress={() => handleOpenAddPlayerModal(game)}
                                                        >
                                                            Ajouter joueur
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        color="primary"
                                                        variant="flat"
                                                        isDisabled={filteredGames.filter((g) =>
                                                            g.game_id !== game.game_id &&
                                                            g.bracket_name === game.bracket_name &&
                                                            g.game_number === game.game_number &&
                                                            !g.hasResults &&
                                                            g.assignedPlayers.length < 8,
                                                        ).length === 0}
                                                        onPress={() => handleOpenReassignModal("move", game, player)}
                                                    >
                                                        Deplacer
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        color="secondary"
                                                        variant="flat"
                                                        isDisabled={filteredGames.filter((g) =>
                                                            g.game_id !== game.game_id &&
                                                            g.bracket_name === game.bracket_name &&
                                                            g.game_number === game.game_number &&
                                                            !g.hasResults &&
                                                            g.assignedPlayers.length > 0,
                                                        ).length === 0}
                                                        onPress={() => handleOpenReassignModal("swap", game, player)}
                                                    >
                                                        Echanger
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        color="danger"
                                                        variant="flat"
                                                        onPress={async () => {
                                                            try {
                                                                await handleForfeitPlayer(
                                                                    player.player_id,
                                                                    player.player_name || "-",
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
                                                </div>
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
                    onClose={() => handleCloseModal("cancel")}
                    game={selectedGame}
                    onSubmit={handleSubmitResults}
                />
            )}

            <ReassignPlayersModal
                isOpen={isReassignModalOpen}
                onClose={handleCloseReassignModal}
                mode={reassignMode}
                sourceGame={reassignSourceGame}
                sourcePlayer={reassignSourcePlayer}
                candidateGames={
                    reassignMode === "move"
                        ? reassignCandidateGames.filter((candidate) => candidate.assignedPlayers.length < 8)
                        : reassignCandidateGames
                }
                onMovePlayer={async (targetGameId) => {
                    try {
                        await handleMovePlayer(targetGameId);
                    } catch (error) {
                        alert(error instanceof Error ? error.message : "Erreur lors du deplacement");
                        throw error;
                    }
                }}
                onSwapPlayers={async (targetGameId, targetPlayerId) => {
                    try {
                        await handleSwapPlayers(targetGameId, targetPlayerId);
                    } catch (error) {
                        alert(error instanceof Error ? error.message : "Erreur lors de l'echange");
                        throw error;
                    }
                }}
            />

            <AddTournamentPlayerModal
                isOpen={isAddPlayerModalOpen}
                onClose={handleCloseAddPlayerModal}
                targetGame={addPlayerTargetGame}
                candidates={addPlayerCandidates}
                onAddPlayer={async (playerId) => {
                    try {
                        await handleAddPlayerToLobby(playerId);
                        handleCloseAddPlayerModal();
                    } catch (error) {
                        alert(error instanceof Error ? error.message : "Erreur lors de l'ajout");
                        throw error;
                    }
                }}
            />
        </div>
    );
}
