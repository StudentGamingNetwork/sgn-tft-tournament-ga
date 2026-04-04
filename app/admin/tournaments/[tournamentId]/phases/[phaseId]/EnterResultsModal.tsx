import { useState, useCallback, memo, useMemo, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card } from "@heroui/card";
import { Checkbox } from "@heroui/checkbox";
import type { GameWithResults, LobbyPlayerInfo } from "@/app/actions/tournaments";
import type { GameResult } from "@/types/tournament";

interface EnterResultsModalProps {
    isOpen: boolean;
    onClose: () => void;
    game: GameWithResults;
    onSubmit: (results: GameResult[]) => Promise<void>;
}

interface PlayerInputProps {
    player: LobbyPlayerInfo;
    placement: string;
    isForfeit: boolean;
    maxPlacement: number;
    onChange: (value: string) => void;
    onForfeitChange: (value: boolean) => void;
}


const PlayerInputRow = memo(function PlayerInputRow({
    player,
    placement,
    isForfeit,
    maxPlacement,
    onChange,
    onForfeitChange,
}: PlayerInputProps) {
    return (
        <div className="flex items-center gap-4">
            <div className="flex-1">
                <p className="font-medium">{player.player_name || "-"}</p>
            </div>
            <Checkbox isSelected={isForfeit} onValueChange={onForfeitChange}>
                Forfait
            </Checkbox>
            <Input
                type="number"
                label="Placement"
                placeholder={`1-${maxPlacement}`}
                min={1}
                max={maxPlacement}
                value={placement}
                onChange={(e) => onChange(e.target.value)}
                className="w-32"
                isDisabled={isForfeit}
                isRequired
            />
        </div>
    );
});

export function EnterResultsModal({ isOpen, onClose, game, onSubmit }: EnterResultsModalProps) {
    const initialState = useCallback(() => {
        const resultMap = new Map(game.results.map((result) => [result.player_id, result]));

        return {
            placements: Object.fromEntries(
                game.assignedPlayers.map((player) => {
                    const existing = resultMap.get(player.player_id);
                    return [
                        player.player_id,
                        existing && existing.result_status !== "forfeit"
                            ? String(existing.placement)
                            : "",
                    ];
                }),
            ),
            forfeits: Object.fromEntries(
                game.assignedPlayers.map((player) => {
                    const existing = resultMap.get(player.player_id);
                    return [player.player_id, existing?.result_status === "forfeit"];
                }),
            ),
        };
    }, [game.assignedPlayers, game.results]);

    const [placements, setPlacements] = useState<Record<string, string>>(() => initialState().placements);
    const [forfeits, setForfeits] = useState<Record<string, boolean>>(() => initialState().forfeits);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const next = initialState();
        setPlacements(next.placements);
        setForfeits(next.forfeits);
        setError(null);
    }, [initialState, isOpen]);

    const handlePlacementChange = useCallback((playerId: string, value: string) => {
        setPlacements(prev => ({ ...prev, [playerId]: value }));
        setError(null);
    }, []);

    const handleForfeitChange = useCallback((playerId: string, value: boolean) => {
        setForfeits((prev) => ({ ...prev, [playerId]: value }));
        if (value) {
            setPlacements((prev) => ({ ...prev, [playerId]: "" }));
        }
        setError(null);
    }, []);

    const activePlayersCount = useMemo(
        () => game.assignedPlayers.filter((player) => !forfeits[player.player_id]).length,
        [forfeits, game.assignedPlayers],
    );

    const validatePlacements = (): boolean => {
        const activePlacements = game.assignedPlayers
            .filter((player) => !forfeits[player.player_id])
            .map((player) => placements[player.player_id]);

        if (activePlacements.some((value) => value === "")) {
            setError("Tous les placements des joueurs actifs doivent être remplis");
            return false;
        }

        const numbers = activePlacements.map((value) => parseInt(value, 10));

        if (numbers.some((number) => isNaN(number) || number < 1 || number > activePlayersCount)) {
            setError(`Les placements doivent être entre 1 et ${activePlayersCount}`);
            return false;
        }

        const uniqueNumbers = new Set(numbers);
        if (uniqueNumbers.size !== activePlayersCount) {
            setError("Tous les placements des joueurs actifs doivent être uniques");
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validatePlacements()) {
            return;
        }

        setIsSubmitting(true);
        try {
            const results: GameResult[] = game.assignedPlayers.map((player) => {
                const isForfeit = forfeits[player.player_id];
                return {
                    player_id: player.player_id,
                    placement: isForfeit ? 0 : parseInt(placements[player.player_id], 10),
                    result_status: isForfeit ? "forfeit" : "normal",
                };
            });

            await onSubmit(results);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de la soumission");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="3xl"
            scrollBehavior="inside"
            isDismissable={false}
            isKeyboardDismissDisabled
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    {game.hasResults ? "Modifier" : "Saisir"} les résultats - {game.lobby_name} (Partie #{game.game_number})
                </ModalHeader>
                <ModalBody>
                    <p className="text-sm text-default-500 mb-4">
                        Entrez le placement final des joueurs actifs ({activePlayersCount} joueurs actifs).
                    </p>
                    {error && (
                        <Card className="p-3 bg-danger-50 border border-danger-200 mb-4">
                            <p className="text-danger text-sm">{error}</p>
                        </Card>
                    )}
                    <div className="flex flex-col gap-3">
                        {game.assignedPlayers
                            .sort((a, b) => a.seed - b.seed)
                            .map((player) => (
                                <PlayerInputRow
                                    key={player.player_id}
                                    player={player}
                                    placement={placements[player.player_id]}
                                    isForfeit={forfeits[player.player_id]}
                                    maxPlacement={Math.max(activePlayersCount, 1)}
                                    onChange={(value) => handlePlacementChange(player.player_id, value)}
                                    onForfeitChange={(value) => handleForfeitChange(player.player_id, value)}
                                />
                            ))}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button color="danger" variant="light" onPress={onClose}>
                        Annuler
                    </Button>
                    <Button
                        color="primary"
                        onPress={handleSubmit}
                        isLoading={isSubmitting}
                    >
                        Enregistrer les résultats
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
