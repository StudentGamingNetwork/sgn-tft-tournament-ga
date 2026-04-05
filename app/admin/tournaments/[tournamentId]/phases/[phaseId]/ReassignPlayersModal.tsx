import { useMemo, useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import type { GameWithResults } from "@/app/actions/tournaments";

type LobbyPlayer = GameWithResults["assignedPlayers"][number];

type ReassignMode = "move" | "swap";

interface ReassignPlayersModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: ReassignMode;
  sourceGame: GameWithResults | null;
  sourcePlayer: LobbyPlayer | null;
  candidateGames: GameWithResults[];
  onMovePlayer: (targetGameId: string) => Promise<void>;
  onSwapPlayers: (targetGameId: string, targetPlayerId: string) => Promise<void>;
}

export function ReassignPlayersModal({
  isOpen,
  onClose,
  mode,
  sourceGame,
  sourcePlayer,
  candidateGames,
  onMovePlayer,
  onSwapPlayers,
}: ReassignPlayersModalProps) {
  const [targetGameId, setTargetGameId] = useState("");
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTargetGameId("");
      setTargetPlayerId("");
    }
  }, [isOpen]);

  const selectedTargetGame = useMemo(
    () => candidateGames.find((g) => g.game_id === targetGameId) || null,
    [candidateGames, targetGameId],
  );

  const targetPlayers = useMemo(() => {
    if (!selectedTargetGame) {
      return [] as LobbyPlayer[];
    }

    return selectedTargetGame.assignedPlayers;
  }, [selectedTargetGame]);

  const canSubmit =
    !!sourceGame &&
    !!sourcePlayer &&
    !!targetGameId &&
    (mode === "move" || !!targetPlayerId);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "move") {
        await onMovePlayer(targetGameId);
      } else {
        await onSwapPlayers(targetGameId, targetPlayerId);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader>
          {mode === "move" ? "Deplacer un joueur" : "Echanger deux joueurs"}
        </ModalHeader>
        <ModalBody>
          {!sourceGame || !sourcePlayer ? (
            <p className="text-default-500">Selection invalide.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-divider p-3 text-sm">
                <p>
                  <strong>Joueur:</strong> {sourcePlayer.player_name || "-"}
                </p>
                <p>
                  <strong>Lobby source:</strong> {sourceGame.lobby_name}
                </p>
                <p>
                  <strong>Seed:</strong> #{sourcePlayer.display_seed ?? sourcePlayer.seed}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Lobby cible</label>
                <select
                  value={targetGameId}
                  onChange={(event) => {
                    setTargetGameId(event.target.value);
                    setTargetPlayerId("");
                  }}
                  className="w-full rounded-md border border-divider bg-content1 px-3 py-2 text-sm"
                >
                  <option value="">Selectionner un lobby</option>
                  {candidateGames.map((candidate) => (
                    <option key={candidate.game_id} value={candidate.game_id}>
                      {candidate.lobby_name} ({candidate.assignedPlayers.length}/8)
                    </option>
                  ))}
                </select>
              </div>

              {mode === "swap" && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Joueur cible</label>
                  <select
                    value={targetPlayerId}
                    onChange={(event) => setTargetPlayerId(event.target.value)}
                    className="w-full rounded-md border border-divider bg-content1 px-3 py-2 text-sm"
                    disabled={!selectedTargetGame}
                  >
                    <option value="">Selectionner un joueur</option>
                    {targetPlayers.map((player) => (
                      <option key={player.player_id} value={player.player_id}>
                        {player.player_name || "-"} (Seed #{player.display_seed ?? player.seed})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={isSubmitting}>
            Annuler
          </Button>
          <Button
            color="primary"
            onPress={handleSubmit}
            isDisabled={!canSubmit}
            isLoading={isSubmitting}
          >
            {mode === "move" ? "Deplacer" : "Echanger"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
