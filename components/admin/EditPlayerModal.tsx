"use client";

import { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Edit } from "lucide-react";
import { updatePlayerInfo } from "@/app/actions/tournaments";
import type { TierType, DivisionType, PlayerWithRegistration } from "@/types/tournament";
import {
    validatePlayerName,
    validateDiscordTag,
    validateTierDivision,
    validateLeaguePoints,
} from "@/utils/validation";

interface EditPlayerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    player: PlayerWithRegistration;
}

const TIERS: TierType[] = [
    "CHALLENGER",
    "GRANDMASTER",
    "MASTER",
    "DIAMOND",
    "EMERALD",
    "PLATINUM",
    "GOLD",
    "SILVER",
    "BRONZE",
    "IRON",
    "UNRANKED",
];

const DIVISIONS: DivisionType[] = ["I", "II", "III", "IV"];

const TIERS_WITHOUT_DIVISION: TierType[] = ["CHALLENGER", "GRANDMASTER", "MASTER", "UNRANKED"];

export function EditPlayerModal({
    isOpen,
    onClose,
    onSuccess,
    player,
}: EditPlayerModalProps) {
    const [formData, setFormData] = useState({
        name: "",
        discord_tag: "",
        tier: null as TierType | null,
        division: "IV" as DivisionType | null,
        league_points: "",
        team_name: "",
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Initialize form with player data when modal opens
    useEffect(() => {
        if (isOpen && player) {
            setFormData({
                name: player.name,
                discord_tag: player.discord_tag || "",
                tier: (player.tier as TierType) || null,
                division: player.division as DivisionType | null,
                league_points:
                    player.league_points !== null &&
                        player.league_points !== undefined
                        ? String(player.league_points)
                        : "",
                team_name: player.team?.name || "",
            });
            setErrors({});
        }
    }, [isOpen, player]);

    // Auto-disable division for certain tiers
    useEffect(() => {
        if (formData.tier && TIERS_WITHOUT_DIVISION.includes(formData.tier)) {
            setFormData((prev) => ({ ...prev, division: null }));
        } else if (formData.tier && formData.division === null) {
            setFormData((prev) => ({ ...prev, division: "IV" }));
        } else if (!formData.tier) {
            setFormData((prev) => ({ ...prev, division: null }));
        }
    }, [formData.tier]);

    const handleChange = (field: string, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear error for this field
        if (errors[field]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        const nameValidation = validatePlayerName(formData.name);
        if (!nameValidation.valid) {
            newErrors.name = nameValidation.error!;
        }

        if (formData.discord_tag) {
            const discordValidation = validateDiscordTag(formData.discord_tag);
            if (!discordValidation.valid) {
                newErrors.discord_tag = discordValidation.error!;
            }
        }

        if (formData.tier) {
            const tierDivisionValidation = validateTierDivision(formData.tier, formData.division);
            if (!tierDivisionValidation.valid) {
                newErrors.division = tierDivisionValidation.error!;
            }
        }

        if (formData.league_points.length > 0) {
            const parsedLeaguePoints = parseInt(formData.league_points, 10);
            if (!formData.tier) {
                newErrors.league_points = "Le tier est requis quand des points de ligue sont renseignés";
            } else {
                const lpValidation = validateLeaguePoints(parsedLeaguePoints, formData.tier);
                if (!lpValidation.valid) {
                    newErrors.league_points = lpValidation.error!;
                }
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await updatePlayerInfo(player.id, {
                name: formData.name,
                tier: formData.tier || undefined,
                division: formData.tier ? formData.division : null,
                league_points:
                    formData.league_points.length > 0
                        ? parseInt(formData.league_points, 10)
                        : undefined,
                discord_tag: formData.discord_tag || undefined,
                team_name: formData.team_name || undefined,
            });

            if (result.success) {
                onSuccess();
                onClose();
            } else {
                setErrors({ submit: result.error || "Erreur lors de la mise à jour" });
            }
        } catch (error) {
            setErrors({ submit: "Une erreur est survenue" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Edit size={24} />
                        <span>Modifier le joueur</span>
                    </div>
                </ModalHeader>
                <ModalBody>
                    <div className="flex flex-col gap-4">
                        {/* Riot ID (read-only) */}
                        <Input
                            label="Riot ID"
                            value={player.riot_id}
                            isReadOnly
                            description="Le Riot ID ne peut pas être modifié"
                            classNames={{
                                base: "opacity-60",
                            }}
                        />

                        {/* Nom du joueur */}
                        <Input
                            label="Nom du joueur"
                            placeholder="Jean Dupont"
                            value={formData.name}
                            onValueChange={(value) => handleChange("name", value)}
                            isRequired
                            errorMessage={errors.name}
                            isInvalid={!!errors.name}
                        />

                        {/* Discord Tag */}
                        <Input
                            label="Discord Tag"
                            placeholder="username#1234"
                            value={formData.discord_tag}
                            onValueChange={(value) => handleChange("discord_tag", value)}
                            errorMessage={errors.discord_tag}
                            isInvalid={!!errors.discord_tag}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            {/* Tier */}
                            <Select
                                label="Tier"
                                placeholder="Sélectionner un tier"
                                selectedKeys={formData.tier ? [formData.tier] : []}
                                onSelectionChange={(keys) => {
                                    const tier = (Array.from(keys)[0] as TierType) || null;
                                    handleChange("tier", tier);
                                }}
                            >
                                {TIERS.map((tier) => (
                                    <SelectItem key={tier}>
                                        {tier}
                                    </SelectItem>
                                ))}
                            </Select>

                            {/* Division */}
                            <Select
                                label="Division"
                                placeholder="Sélectionner"
                                selectedKeys={formData.division ? [formData.division] : []}
                                onSelectionChange={(keys) => {
                                    const division = Array.from(keys)[0] as DivisionType;
                                    handleChange("division", division || null);
                                }}
                                isDisabled={!formData.tier || TIERS_WITHOUT_DIVISION.includes(formData.tier)}
                                errorMessage={errors.division}
                                isInvalid={!!errors.division}
                                description={
                                    !formData.tier
                                        ? "Renseignez un tier pour sélectionner une division"
                                        : TIERS_WITHOUT_DIVISION.includes(formData.tier)
                                        ? "Aucune division pour ce tier"
                                        : ""
                                }
                            >
                                {DIVISIONS.map((div) => (
                                    <SelectItem key={div}>
                                        {div}
                                    </SelectItem>
                                ))}
                            </Select>
                        </div>

                        {/* League Points */}
                        <Input
                            label="Points de ligue"
                            type="number"
                            value={formData.league_points}
                            onValueChange={(value) => handleChange("league_points", value)}
                            min={0}
                            max={formData.tier && ["CHALLENGER", "GRANDMASTER", "MASTER"].includes(formData.tier) ? 9999 : 100}
                            errorMessage={errors.league_points}
                            isInvalid={!!errors.league_points}
                            description="Optionnel"
                        />

                        {/* Nom d'équipe */}
                        <Input
                            label="Nom d'équipe (optionnel)"
                            placeholder="Team Alpha"
                            value={formData.team_name}
                            onValueChange={(value) => handleChange("team_name", value)}
                            description="Laissez vide si le joueur n'a pas d'équipe"
                        />

                        {/* Error message */}
                        {errors.submit && (
                            <div className="p-3 bg-danger-50 border border-danger rounded-lg">
                                <p className="text-danger text-sm">{errors.submit}</p>
                            </div>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} isDisabled={isSubmitting}>
                        Annuler
                    </Button>
                    <Button
                        color="primary"
                        onPress={handleSubmit}
                        isLoading={isSubmitting}
                        startContent={!isSubmitting && <Edit size={18} />}
                    >
                        Mettre à jour
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
