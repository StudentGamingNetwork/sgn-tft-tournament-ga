"use client";

import { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { Checkbox } from "@heroui/checkbox";
import { FileUp, AlertCircle, CheckCircle, Upload } from "lucide-react";
import { importPlayersAndRegisterToTournament } from "@/app/actions/tournaments";
import { parsePlayersCSV } from "@/utils/validation";
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
    const [file, setFile] = useState<File | null>(null);
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setImportResult(null);
        setValidationErrors([]);

        // Read and parse CSV
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const parseResult = parsePlayersCSV(content);

            if (parseResult.success && parseResult.data) {
                setCsvData(parseResult.data);
                setValidationErrors([]);
            } else if (parseResult.errors) {
                setValidationErrors(parseResult.errors);
                setCsvData([]);
            }
        };
        reader.readAsText(selectedFile);
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
                        <Card className="p-4 bg-default-50">
                            <h3 className="font-semibold mb-2">Format CSV attendu :</h3>
                            <code className="text-xs bg-default-100 p-2 rounded block overflow-x-auto">
                                name,riot_id,tier,division,league_points,discord_tag,team_name
                            </code>
                            <ul className="text-sm mt-2 space-y-1 text-default-600">
                                <li>• <strong>name</strong> : Nom du joueur (requis)</li>
                                <li>• <strong>riot_id</strong> : Format Nom#TAG (requis)</li>
                                <li>• <strong>tier</strong> : IRON à CHALLENGER (requis)</li>
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
                                className="flex items-center justify-center gap-2 p-8 border-2 border-dashed border-default-300 rounded-lg cursor-pointer hover:border-primary transition-colors"
                            >
                                <Upload size={24} className="text-default-400" />
                                <span className="text-default-600">
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
                                        <thead className="bg-default-100 sticky top-0">
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
                                                    className="border-b border-default-200"
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
                            isDisabled={csvData.length === 0 || validationErrors.length > 0}
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
