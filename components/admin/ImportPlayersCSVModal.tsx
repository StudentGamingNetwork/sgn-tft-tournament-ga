"use client";

import { useCallback, useMemo, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { Checkbox } from "@heroui/checkbox";
import { FileUp, AlertCircle, CheckCircle, Upload } from "lucide-react";
import { importPlayersAndRegisterToTournament } from "@/app/actions/tournaments";
import {
    buildDefaultPlayerCsvMapping,
    extractCsvHeaders,
    parsePlayersCSV,
    type PlayerCsvColumn,
    type PlayerCsvColumnMapping,
    PLAYER_CSV_REQUIRED_COLUMNS,
} from "@/utils/validation";
import type { PlayerCSVImport, PlayerValidationError } from "@/types/tournament";

interface ImportPlayersCSVModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    tournamentId: string;
}

export function ImportPlayersCSVModal({
    isOpen,
    onClose,
    onSuccess,
    tournamentId,
}: ImportPlayersCSVModalProps) {
    const fieldDefinitions: Array<{
        key: PlayerCsvColumn;
        label: string;
        required: boolean;
    }> = [
        { key: "name", label: "name", required: false },
        { key: "riot_id", label: "riot_id", required: true },
        { key: "tier", label: "tier", required: false },
        { key: "division", label: "division", required: false },
        { key: "league_points", label: "league_points", required: false },
        { key: "discord_tag", label: "discord_tag", required: false },
        { key: "team_name", label: "team_name", required: false },
    ];

    const [file, setFile] = useState<File | null>(null);
    const [csvContent, setCsvContent] = useState("");
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<PlayerCsvColumnMapping | null>(null);
    const [csvData, setCsvData] = useState<PlayerCSVImport[]>([]);
    const [validationErrors, setValidationErrors] = useState<PlayerValidationError[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<{
        created: number;
        updated: number;
        registered: number;
        errors: Array<{ player: string; error: string }>;
    } | null>(null);
    const [updateExisting, setUpdateExisting] = useState(true);

    const parseWithMapping = useCallback(
        (content: string, mapping: PlayerCsvColumnMapping) => {
            const parseResult = parsePlayersCSV(content, mapping);

            if (parseResult.success && parseResult.data) {
                setCsvData(parseResult.data);
                setValidationErrors([]);
            } else if (parseResult.errors) {
                setValidationErrors(parseResult.errors);
                setCsvData([]);
            }
        },
        [],
    );

    const hasRequiredMapping = useMemo(() => {
        if (!columnMapping) {
            return false;
        }

        return PLAYER_CSV_REQUIRED_COLUMNS.every((column) => {
            const mappedHeader = columnMapping[column];
            return !!mappedHeader && csvHeaders.includes(mappedHeader);
        });
    }, [columnMapping, csvHeaders]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setCsvContent("");
        setCsvHeaders([]);
        setColumnMapping(null);
        setCsvData([]);
        setImportResult(null);
        setValidationErrors([]);

        // Read and parse CSV
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const headers = extractCsvHeaders(content);
            const defaultMapping = buildDefaultPlayerCsvMapping(headers);

            setCsvContent(content);
            setCsvHeaders(headers);
            setColumnMapping(defaultMapping);
            parseWithMapping(content, defaultMapping);
        };
        reader.readAsText(selectedFile);
    };

    const handleMappingChange = (field: PlayerCsvColumn, header: string) => {
        if (!columnMapping) {
            return;
        }

        const updatedMapping: PlayerCsvColumnMapping = {
            ...columnMapping,
            [field]: header || null,
        };

        setColumnMapping(updatedMapping);

        if (csvContent) {
            parseWithMapping(csvContent, updatedMapping);
        }
    };

    const handleImport = async () => {
        if (csvData.length === 0) return;

        setIsImporting(true);
        try {
            const result = await importPlayersAndRegisterToTournament(tournamentId, csvData);
            setImportResult(result);

            if (result.errors.length === 0) {
                // Success - close modal after short delay
                setTimeout(() => {
                    onSuccess();
                    onClose();
                    resetModal();
                }, 2000);
            }
        } catch (error) {
            console.error("Import error:", error);
        } finally {
            setIsImporting(false);
        }
    };

    const resetModal = () => {
        setFile(null);
        setCsvContent("");
        setCsvHeaders([]);
        setColumnMapping(null);
        setCsvData([]);
        setValidationErrors([]);
        setImportResult(null);
        setUpdateExisting(true);
    };

    const handleClose = () => {
        if (!isImporting) {
            resetModal();
            onClose();
        }
    };

    const downloadTemplate = () => {
        const template = `name,riot_id,tier,division,league_points,discord_tag,team_name
Jean Dupont,JeanDu#1234,DIAMOND,II,45,jeandu#0123,Team Alpha
Marie Martin,MarieMar#5678,MASTER,,120,mariemth#4567,
Pierre Durand,PierreD#9999,PLATINUM,I,67,pierred#1111,Team Beta`;

        const blob = new Blob([template], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "template_joueurs.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            size="3xl"
            scrollBehavior="inside"
            isDismissable={!isImporting}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <FileUp size={24} />
                        <span>Importer des joueurs depuis un CSV</span>
                    </div>
                </ModalHeader>
                <ModalBody>
                    <div className="flex flex-col gap-4">
                        {/* Instructions */}
                        <Card className="p-4 bg-secondary/30 border border-divider">
                            <h3 className="font-semibold mb-2">Format CSV attendu :</h3>
                            <code className="text-xs bg-secondary/50 p-2 rounded block overflow-x-auto">
                                name,riot_id,tier,division,league_points,discord_tag,team_name
                            </code>
                            <ul className="text-sm mt-2 space-y-1 text-default-500">
                                <li>• <strong>name</strong> : Nom du joueur (optionnel, fallback Riot ID)</li>
                                <li>• <strong>riot_id</strong> : Format Nom#TAG (requis)</li>
                                <li>• <strong>tier</strong> : IRON à CHALLENGER (optionnel)</li>
                                <li>
                                    • <strong>division</strong> : I, II, III, IV (vide pour
                                    CHALLENGER/GRANDMASTER/MASTER)
                                </li>
                                <li>• <strong>league_points</strong> : Points de ligue (optionnel, défaut: 0)</li>
                                <li>• <strong>discord_tag</strong> : Pseudo Discord (optionnel)</li>
                                <li>• <strong>team_name</strong> : Nom de l'équipe (optionnel)</li>
                            </ul>
                            <Button
                                size="sm"
                                variant="flat"
                                onPress={downloadTemplate}
                                className="mt-3"
                            >
                                Télécharger un modèle
                            </Button>
                        </Card>

                        {/* File upload */}
                        <div className="flex flex-col gap-2">
                            <label
                                htmlFor="csv-upload"
                                className="flex items-center justify-center gap-2 p-8 border-2 border-dashed border-divider rounded-lg cursor-pointer hover:border-primary transition-colors"
                            >
                                <Upload size={24} className="text-default-400" />
                                <span className="text-default-500">
                                    {file
                                        ? file.name
                                        : "Cliquez pour sélectionner un fichier CSV"}
                                </span>
                                <input
                                    id="csv-upload"
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </label>
                        </div>

                        {/* Mapping des colonnes */}
                        {csvHeaders.length > 0 && columnMapping && (
                            <Card className="p-4 bg-secondary/30 border border-divider">
                                <h3 className="font-semibold mb-2">Mapping des colonnes CSV</h3>
                                <p className="text-sm text-default-500 mb-3">
                                    Associez les colonnes de votre fichier aux colonnes attendues.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {fieldDefinitions.map((field) => (
                                        <div key={field.key} className="flex flex-col gap-1">
                                            <label className="text-sm font-medium">
                                                {field.label} {field.required ? "*" : "(optionnel)"}
                                            </label>
                                            <select
                                                value={columnMapping[field.key] || ""}
                                                onChange={(event) =>
                                                    handleMappingChange(field.key, event.target.value)
                                                }
                                                className="w-full rounded-md border border-divider bg-secondary/50 text-foreground px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            >
                                                <option value="">
                                                    {field.required ? "Sélectionner une colonne" : "Non mappé"}
                                                </option>
                                                {csvHeaders.map((header) => (
                                                    <option key={`${field.key}-${header}`} value={header}>
                                                        {header}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                                {!hasRequiredMapping && (
                                    <p className="text-danger text-sm mt-3">
                                        Les colonnes obligatoires (riot_id) doivent être mappées.
                                    </p>
                                )}
                            </Card>
                        )}

                        {/* Options */}
                        {csvData.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <Checkbox
                                    isSelected={updateExisting}
                                    onValueChange={setUpdateExisting}
                                >
                                    Mettre à jour les joueurs existants
                                </Checkbox>
                            </div>
                        )}

                        {/* Validation errors */}
                        {validationErrors.length > 0 && (
                            <Card className="p-4 bg-danger-50 border border-danger">
                                <div className="flex items-start gap-2 mb-2">
                                    <AlertCircle size={20} className="text-danger mt-0.5" />
                                    <h3 className="font-semibold text-danger">
                                        Erreurs de validation ({validationErrors.length})
                                    </h3>
                                </div>
                                <div className="max-h-40 overflow-y-auto">
                                    <ul className="text-sm space-y-1">
                                        {validationErrors.map((error, index) => (
                                            <li key={index} className="text-danger-600">
                                                Ligne {error.line}, {error.field} : {error.message}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </Card>
                        )}

                        {/* Preview */}
                        {csvData.length > 0 && (
                            <Card className="p-4">
                                <h3 className="font-semibold mb-2">
                                    Aperçu : {csvData.length} joueur(s) à importer
                                </h3>
                                <div className="max-h-60 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-secondary/40 sticky top-0">
                                            <tr>
                                                <th className="p-2 text-left">Nom</th>
                                                <th className="p-2 text-left">Riot ID</th>
                                                <th className="p-2 text-left">Tier</th>
                                                <th className="p-2 text-left">Division</th>
                                                <th className="p-2 text-left">LP</th>
                                                <th className="p-2 text-left">Équipe</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {csvData.map((player, index) => (
                                                <tr
                                                    key={index}
                                                    className="border-b border-divider"
                                                >
                                                    <td className="p-2">{player.name}</td>
                                                    <td className="p-2">{player.riot_id}</td>
                                                    <td className="p-2">{player.tier}</td>
                                                    <td className="p-2">{player.division || "-"}</td>
                                                    <td className="p-2">{player.league_points}</td>
                                                    <td className="p-2">{player.team_name || "-"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {/* Import result */}
                        {importResult && (
                            <Card
                                className={`p-4 ${importResult.errors.length > 0
                                        ? "bg-warning-50 border border-warning"
                                        : "bg-success-50 border border-success"
                                    }`}
                            >
                                <div className="flex items-start gap-2 mb-2">
                                    <CheckCircle
                                        size={20}
                                        className={
                                            importResult.errors.length > 0
                                                ? "text-warning mt-0.5"
                                                : "text-success mt-0.5"
                                        }
                                    />
                                    <div>
                                        <h3 className="font-semibold">Résultat de l'import</h3>
                                        <ul className="text-sm space-y-1 mt-2">
                                            <li>✓ {importResult.created} joueur(s) créé(s)</li>
                                            <li>✓ {importResult.registered} inscription(s)</li>
                                            {importResult.updated > 0 && (
                                                <li>ℹ {importResult.updated} joueur(s) existant(s)</li>
                                            )}
                                            {importResult.errors.length > 0 && (
                                                <li className="text-warning-600 font-semibold">
                                                    ⚠ {importResult.errors.length} erreur(s)
                                                </li>
                                            )}
                                        </ul>
                                        {importResult.errors.length > 0 && (
                                            <div className="mt-2 max-h-32 overflow-y-auto">
                                                <p className="text-sm font-semibold mb-1">Détails des erreurs :</p>
                                                <ul className="text-sm space-y-1">
                                                    {importResult.errors.map((error, index) => (
                                                        <li key={index} className="text-warning-700">
                                                            {error.player} : {error.error}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={handleClose} isDisabled={isImporting}>
                        {importResult && importResult.errors.length === 0 ? "Fermer" : "Annuler"}
                    </Button>
                    {!importResult && (
                        <Button
                            color="primary"
                            onPress={handleImport}
                            isLoading={isImporting}
                            isDisabled={csvData.length === 0 || validationErrors.length > 0 || !hasRequiredMapping}
                            startContent={!isImporting && <FileUp size={18} />}
                        >
                            Importer {csvData.length} joueur(s)
                        </Button>
                    )}
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
