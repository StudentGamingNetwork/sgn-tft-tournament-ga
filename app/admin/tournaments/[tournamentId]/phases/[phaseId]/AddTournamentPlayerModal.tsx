import { useMemo, useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import type { GameWithResults } from "@/app/actions/tournaments";

type CandidatePlayer = {
  id: string;
  name: string;
  riot_id: string;
  registration: {
    status: "registered" | "confirmed" | "cancelled";
    forfeited_at?: Date | null;
  };
};

interface AddTournamentPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetGame: GameWithResults | null;
  candidates: CandidatePlayer[];
  onAddPlayer: (playerId: string) => Promise<void>;
}

export function AddTournamentPlayerModal({
  isOpen,
  onClose,
  targetGame,
  candidates,
  onAddPlayer,
}: AddTournamentPlayerModalProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedPlayerId("");
    }
  }, [isOpen]);

  const selectedPlayer = useMemo(
    () => candidates.find((player) => player.id === selectedPlayerId) || null,
    [candidates, selectedPlayerId],
  );

  const canSubmit = !!targetGame && !!selectedPlayerId;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddPlayer(selectedPlayerId);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader>Ajouter un joueur du tournoi</ModalHeader>
        <ModalBody>
          {!targetGame ? (
            <p className="text-default-500">Selection invalide.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-divider p-3 text-sm">
                <p>
                  <strong>Lobby cible:</strong> {targetGame.lobby_name}
                </p>
                <p>
                  <strong>Remplissage:</strong> {targetGame.assignedPlayers.length}/8
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Joueur a ajouter</label>
                <select
                  value={selectedPlayerId}
                  onChange={(event) => setSelectedPlayerId(event.target.value)}
                  className="w-full rounded-md border border-divider bg-content1 px-3 py-2 text-sm"
                >
                  <option value="">Selectionner un joueur inscrit</option>
                  {candidates.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} ({player.riot_id})
                    </option>
                  ))}
                </select>
              </div>

              {selectedPlayer && (
                <div className="rounded-lg border border-divider p-3 text-sm">
                  <p>
                    <strong>Pseudo:</strong> {selectedPlayer.name}
                  </p>
                  <p>
                    <strong>Riot ID:</strong> {selectedPlayer.riot_id}
                  </p>
                  <p>
                    <strong>Statut inscription:</strong> {selectedPlayer.registration.status}
                  </p>
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
            Ajouter
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
