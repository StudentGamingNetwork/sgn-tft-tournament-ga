import { useState, useCallback, memo } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card } from "@heroui/card";
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
    onChange: (value: string) => void;
}

const PlayerInputRow = memo(function PlayerInputRow({ player, placement, onChange }: PlayerInputProps) {
    return (
        <div className="flex items-center gap-4">
            <div className="flex-1">
                <p className="font-medium">{player.player_name}</p>
                <p className="text-sm text-default-500">{player.riot_id}</p>
            </div>
            <Input
                type="number"
                label="Placement"
                placeholder="1-8"
                min={1}
                max={8}
                value={placement}
                onChange={(e) => onChange(e.target.value)}
                className="w-32"
                isRequired
            />
        </div>
    );
});

export function EnterResultsModal({ isOpen, onClose, game, onSubmit }: EnterResultsModalProps) {
    const [placements, setPlacements] = useState<Record<string, string>>(
        Object.fromEntries(game.assignedPlayers.map(p => [p.player_id, ""]))
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePlacementChange = useCallback((playerId: string, value: string) => {
        setPlacements(prev => ({ ...prev, [playerId]: value }));
        setError(null);
    }, []);

    const validatePlacements = (): boolean => {
        const values = Object.values(placements);

        // Vérifier que tous les champs sont remplis
        if (values.some(v => v === "")) {
            setError("Tous les placements doivent être remplis");
            return false;
        }

        // Convertir en nombres
        const numbers = values.map(v => parseInt(v, 10));

        // Vérifier que tous sont des nombres valides entre 1 et 8
        if (numbers.some(n => isNaN(n) || n < 1 || n > 8)) {
            setError("Les placements doivent être entre 1 et 8");
            return false;
        }

        // Vérifier qu'il n'y a pas de doublons
        const uniqueNumbers = new Set(numbers);
        if (uniqueNumbers.size !== 8) {
            setError("Tous les placements doivent être uniques (1-8)");
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
            const results: GameResult[] = Object.entries(placements).map(([player_id, placement]) => ({
                player_id,
                placement: parseInt(placement, 10),
            }));

            await onSubmit(results);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de la soumission");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    Saisir les résultats - {game.lobby_name} (Partie #{game.game_number})
                </ModalHeader>
                <ModalBody>
                    <p className="text-sm text-default-500 mb-4">
                        Entrez le placement final de chaque joueur (1 = 1er, 8 = 8ème)
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
                                    onChange={(value) => handlePlacementChange(player.player_id, value)}
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
