"use client";

import { useState, useEffect, useRef } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Chip } from "@heroui/chip";
import { UserPlus } from "lucide-react";
import {
    createPlayerAndRegister,
    lookupRiotPlayerStatusByRiotId,
    searchPlayerByRiotId,
} from "@/app/actions/tournaments";
import type { RiotPlayerLookupState } from "@/app/actions/tournaments";
import type { TierType, DivisionType } from "@/types/tournament";
import {
    validateRiotId,
    validatePlayerName,
    validateDiscordTag,
    validateTierDivision,
    validateLeaguePoints,
} from "@/utils/validation";

interface RegisterPlayerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    tournamentId: string;
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

export function RegisterPlayerModal({
    isOpen,
    onClose,
    onSuccess,
    tournamentId,
}: RegisterPlayerModalProps) {
    const [formData, setFormData] = useState({
        name: "",
        riot_id: "",
        discord_tag: "",
        tier: null as TierType | null,
        division: null as DivisionType | null,
        league_points: "",
        team_name: "",
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchingPlayer, setSearchingPlayer] = useState(false);
    const [existingPlayerFound, setExistingPlayerFound] = useState(false);
    const [riotLookupState, setRiotLookupState] = useState<RiotPlayerLookupState>({
        status: "idle",
    });
    const lookupRequestIdRef = useRef(0);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setFormData({
                name: "",
                riot_id: "",
                discord_tag: "",
                tier: null,
                division: null,
                league_points: "",
                team_name: "",
            });
            setErrors({});
            setExistingPlayerFound(false);
            setRiotLookupState({ status: "idle" });
        }
    }, [isOpen]);

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

    // Search for existing player when Riot ID changes
    useEffect(() => {
        const searchPlayer = async () => {
            const riotId = formData.riot_id.trim();
            if (!riotId) {
                setExistingPlayerFound(false);
                setRiotLookupState({ status: "idle" });
                return;
            }

            const validation = validateRiotId(riotId);
            if (!validation.valid) {
                setExistingPlayerFound(false);
                setRiotLookupState({
                    status: "invalid",
                    message: "Format attendu: Nom#TAG",
                });
                return;
            }

            const currentRequestId = ++lookupRequestIdRef.current;

            setSearchingPlayer(true);
            setRiotLookupState({
                status: "loading",
                message: "Interrogation API Riot en cours...",
            });

            const player = await searchPlayerByRiotId(riotId);
            if (currentRequestId !== lookupRequestIdRef.current) {
                return;
            }

            if (player) {
                setExistingPlayerFound(true);
                setFormData((prev) => ({
                    ...prev,
                    name: player.name,
                    tier: (player.tier as TierType) || null,
                    division: (player.division as DivisionType) || null,
                    league_points:
                        player.league_points !== null &&
                        player.league_points !== undefined
                            ? String(player.league_points)
                            : "",
                    discord_tag: player.discord_tag || "",
                }));
            } else {
                setExistingPlayerFound(false);
            }

            const riotState = await lookupRiotPlayerStatusByRiotId(riotId);
            if (currentRequestId !== lookupRequestIdRef.current) {
                return;
            }

            setRiotLookupState(riotState);

            // Pré-remplir les infos de rank uniquement pour un nouveau joueur.
            if (!player && (riotState.status === "found" || riotState.status === "unranked")) {
                setFormData((prev) => ({
                    ...prev,
                    tier: riotState.rank.tier,
                    division: riotState.rank.division,
                    league_points: String(riotState.rank.league_points),
                }));
            }

            setSearchingPlayer(false);
        };

        const timeoutId = setTimeout(searchPlayer, 500);
        return () => clearTimeout(timeoutId);
        }, [formData.riot_id]);

        const riotStateColor =
                riotLookupState.status === "found" || riotLookupState.status === "unranked"
                        ? "success"
                        : riotLookupState.status === "loading"
                            ? "warning"
                            : riotLookupState.status === "idle"
                                ? "default"
                                : "danger";

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

        if (formData.name.trim().length > 0) {
            const nameValidation = validatePlayerName(formData.name);
            if (!nameValidation.valid) {
                newErrors.name = nameValidation.error!;
            }
        }

        const riotIdValidation = validateRiotId(formData.riot_id);
        if (!riotIdValidation.valid) {
            newErrors.riot_id = riotIdValidation.error!;
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
            const result = await createPlayerAndRegister(tournamentId, {
                name: formData.name,
                riot_id: formData.riot_id,
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
                setErrors({ submit: result.error || "Erreur lors de l'inscription" });
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
                        <UserPlus size={24} />
                        <span>Inscrire un joueur</span>
                    </div>
                    {existingPlayerFound && (
                        <p className="text-sm text-success font-normal">
                            ✓ Joueur existant trouvé - Les informations ont été pré-remplies
                        </p>
                    )}
                </ModalHeader>
                <ModalBody>
                    <div className="flex flex-col gap-4">
                        {/* Nom du joueur */}
                        <Input
                            label="Nom du joueur"
                            placeholder="Jean Dupont"
                            value={formData.name}
                            onValueChange={(value) => handleChange("name", value)}
                            errorMessage={errors.name}
                            isInvalid={!!errors.name}
                            isDisabled={existingPlayerFound}
                            description="Optionnel: si vide, le nom du Riot ID sera utilisé"
                        />

                        {/* Riot ID */}
                        <Input
                            label="Riot ID"
                            placeholder="PlayerName#1234"
                            value={formData.riot_id}
                            onValueChange={(value) => handleChange("riot_id", value)}
                            isRequired
                            errorMessage={errors.riot_id}
                            isInvalid={!!errors.riot_id}
                            description="Format : Nom#TAG"
                            endContent={
                                searchingPlayer && (
                                    <div className="text-default-400 text-sm">Recherche...</div>
                                )
                            }
                        />

                        {riotLookupState.status !== "idle" && (
                            <Chip color={riotStateColor} variant="flat" size="sm">
                                {riotLookupState.message}
                            </Chip>
                        )}

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
                        startContent={!isSubmitting && <UserPlus size={18} />}
                    >
                        {existingPlayerFound ? "Inscrire au tournoi" : "Créer et inscrire"}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
