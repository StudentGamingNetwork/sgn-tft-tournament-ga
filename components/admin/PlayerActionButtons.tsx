import { Button } from "@heroui/button";
import { CheckCircle, XCircle, Edit } from "lucide-react";
import type { PlayerWithRegistration } from "@/types/tournament";

interface PlayerActionButtonsProps {
    player: PlayerWithRegistration;
    onConfirm: (playerId: string) => void;
    onUnconfirm: (playerId: string) => void;
    onEdit: (player: PlayerWithRegistration) => void;
    onUnregister: (playerId: string) => void;
}

export function PlayerActionButtons({
    player,
    onConfirm,
    onUnconfirm,
    onEdit,
    onUnregister,
}: PlayerActionButtonsProps) {
    return (
        <div className="flex gap-1">
            {player.registration.status === "registered" && (
                <Button
                    size="sm"
                    color="success"
                    variant="light"
                    isIconOnly
                    onPress={() => onConfirm(player.id)}
                    title="Confirmer"
                >
                    <CheckCircle size={18} />
                </Button>
            )}
            {player.registration.status === "confirmed" && (
                <Button
                    size="sm"
                    color="warning"
                    variant="light"
                    isIconOnly
                    onPress={() => onUnconfirm(player.id)}
                    title="Annuler la confirmation"
                >
                    <XCircle size={18} />
                </Button>
            )}
            <Button
                size="sm"
                color="primary"
                variant="light"
                isIconOnly
                onPress={() => onEdit(player)}
                title="Modifier"
            >
                <Edit size={18} />
            </Button>
            <Button
                size="sm"
                color="danger"
                variant="light"
                isIconOnly
                onPress={() => onUnregister(player.id)}
                title="Désinscrire"
            >
                <XCircle size={18} />
            </Button>
        </div>
    );
}
