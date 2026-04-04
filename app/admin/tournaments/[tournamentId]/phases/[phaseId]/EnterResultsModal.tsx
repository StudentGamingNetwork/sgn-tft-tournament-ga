import { useState, useCallback, memo, useMemo, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card } from "@heroui/card";
import type { GameWithResults, LobbyPlayerInfo } from "@/app/actions/tournaments";
import type { GameResult } from "@/types/tournament";

type PlayerResultStatus = "normal" | "absent" | "forfeit";
const RESULTS_DRAFT_PREFIX = "tft-results-draft:";

interface ResultsDraftPayload {
    placements: Record<string, string>;
    statuses: Record<string, PlayerResultStatus>;
    updatedAt: number;
}

interface EnterResultsModalProps {
    isOpen: boolean;
    onClose: () => void;
    game: GameWithResults;
    onSubmit: (results: GameResult[]) => Promise<void>;
}

interface PlayerInputProps {
    player: LobbyPlayerInfo;
    placement: string;
    status: PlayerResultStatus;
    maxPlacement: number;
    onChange: (value: string) => void;
    onStatusChange: (value: PlayerResultStatus) => void;
}


const PlayerInputRow = memo(function PlayerInputRow({
    player,
    placement,
    status,
    maxPlacement,
    onChange,
    onStatusChange,
}: PlayerInputProps) {
    return (
        <div className="flex items-center gap-4">
            <div className="flex-1">
                <p className="font-medium">{player.player_name || "-"}</p>
            </div>
            <div className="w-40">
                <label className="text-xs text-default-500">Statut</label>
                <select
                    className="w-full rounded-md border border-default-200 bg-content1 px-2 py-1 text-sm"
                    value={status}
                    onChange={(e) => onStatusChange(e.target.value as PlayerResultStatus)}
                >
                    <option value="normal">Normal</option>
                    <option value="absent">Absent (0 pt)</option>
                    <option value="forfeit">Forfait (sort du tournoi)</option>
                </select>
            </div>
            <Input
                type="number"
                label="Placement"
                placeholder={`1-${maxPlacement}`}
                min={1}
                max={maxPlacement}
                value={placement}
                onChange={(e) => onChange(e.target.value)}
                className="w-32"
                isDisabled={status !== "normal"}
                isRequired
            />
        </div>
    );
});

export function EnterResultsModal({ isOpen, onClose, game, onSubmit }: EnterResultsModalProps) {
    const draftStorageKey = `${RESULTS_DRAFT_PREFIX}${game.game_id}`;

    const getStoredDraft = useCallback((): ResultsDraftPayload | null => {
        if (typeof window === "undefined") {
            return null;
        }

        const raw = window.localStorage.getItem(draftStorageKey);
        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw) as ResultsDraftPayload;
            if (!parsed || typeof parsed !== "object") {
                return null;
            }
            return {
                placements: parsed.placements ?? {},
                statuses: parsed.statuses ?? {},
                updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
            };
        } catch {
            return null;
        }
    }, [draftStorageKey]);

    const persistDraft = useCallback((next: { placements: Record<string, string>; statuses: Record<string, PlayerResultStatus> }) => {
        if (typeof window === "undefined") {
            return;
        }

        const payload: ResultsDraftPayload = {
            placements: next.placements,
            statuses: next.statuses,
            updatedAt: Date.now(),
        };
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
    }, [draftStorageKey]);

    const clearDraft = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.localStorage.removeItem(draftStorageKey);
    }, [draftStorageKey]);

    const buildState = useCallback((includeDraft: boolean) => {
        const resultMap = new Map(game.results.map((result) => [result.player_id, result]));
        const storedDraft = includeDraft ? getStoredDraft() : null;

        return {
            placements: Object.fromEntries(
                game.assignedPlayers.map((player) => {
                    const draftPlacement = storedDraft?.placements?.[player.player_id];
                    if (typeof draftPlacement === "string") {
                        return [player.player_id, draftPlacement];
                    }

                    const existing = resultMap.get(player.player_id);
                    return [
                        player.player_id,
                        existing && existing.result_status === "normal"
                            ? String(existing.placement)
                            : "",
                    ];
                }),
            ),
            statuses: Object.fromEntries(
                game.assignedPlayers.map((player) => {
                    const draftStatus = storedDraft?.statuses?.[player.player_id];
                    if (
                        draftStatus === "normal" ||
                        draftStatus === "absent" ||
                        draftStatus === "forfeit"
                    ) {
                        return [player.player_id, draftStatus];
                    }

                    const existing = resultMap.get(player.player_id);
                    return [player.player_id, (existing?.result_status ?? "normal") as PlayerResultStatus];
                }),
            ),
        };
    }, [game.assignedPlayers, game.results, getStoredDraft]);

    const [placements, setPlacements] = useState<Record<string, string>>(() => buildState(true).placements);
    const [statuses, setStatuses] = useState<Record<string, PlayerResultStatus>>(() => buildState(true).statuses);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const next = buildState(true);
        setPlacements(next.placements);
        setStatuses(next.statuses);
        setError(null);
    }, [buildState, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        persistDraft({ placements, statuses });
    }, [isOpen, placements, statuses, persistDraft]);

    const handlePlacementChange = useCallback((playerId: string, value: string) => {
        setPlacements(prev => ({ ...prev, [playerId]: value }));
        setError(null);
    }, []);

    const handleStatusChange = useCallback((playerId: string, value: PlayerResultStatus) => {
        setStatuses((prev) => ({ ...prev, [playerId]: value }));
        if (value !== "normal") {
            setPlacements((prev) => ({ ...prev, [playerId]: "" }));
        }
        setError(null);
    }, []);

    const activePlayersCount = useMemo(
        () => game.assignedPlayers.filter((player) => statuses[player.player_id] === "normal").length,
        [statuses, game.assignedPlayers],
    );

    const validatePlacements = (): boolean => {
        const activePlacements = game.assignedPlayers
            .filter((player) => statuses[player.player_id] === "normal")
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
                const status = statuses[player.player_id] ?? "normal";
                return {
                    player_id: player.player_id,
                    placement: status === "normal" ? parseInt(placements[player.player_id], 10) : 0,
                    result_status: status,
                };
            });

            await onSubmit(results);
            clearDraft();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de la soumission");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClearDraft = useCallback(() => {
        clearDraft();
        const next = buildState(false);
        setPlacements(next.placements);
        setStatuses(next.statuses);
        setError(null);
    }, [buildState, clearDraft]);

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
                        Entrez le placement final des joueurs en statut normal ({activePlayersCount} joueurs actifs).
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
                                    status={statuses[player.player_id] ?? "normal"}
                                    maxPlacement={Math.max(activePlayersCount, 1)}
                                    onChange={(value) => handlePlacementChange(player.player_id, value)}
                                    onStatusChange={(value) => handleStatusChange(player.player_id, value)}
                                />
                            ))}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button color="warning" variant="light" onPress={handleClearDraft}>
                        Effacer brouillon
                    </Button>
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
