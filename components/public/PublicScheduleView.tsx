"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import { Input } from "@heroui/input";
import { Tabs, Tab } from "@heroui/tabs";

import {
  getPhaseDetails,
  getTournamentPhases,
  getTournaments,
  type PhaseDetails,
  type PhaseWithDetails,
} from "@/app/actions/tournaments";
import { getBracketChipColor } from "@/utils/bracket-colors";

type PhaseStatus = PhaseWithDetails["status"];

type SectionKey = "upcoming" | PhaseStatus;

type LobbyPlayer = {
  playerName: string;
  riotId: string;
};


type ScheduleGame = {
  phaseId: string;
  phaseName: string;
  phaseOrder: number;
  gameId: string;
  lobbyName: string;
  gameNumber: number;
  bracketName: string;
  playersCount: number;
  players: LobbyPlayer[];
  searchIndex: string;
};

type PhaseParticipantSummary = {
  count: number;
  label: string;
  estimated: boolean;
};

const STATUS_ORDER: PhaseStatus[] = ["in_progress", "completed", "not_started"];

const STATUS_SECTIONS: Array<{ status: PhaseStatus; title: string; emptyMessage: string }> = [
  {
    status: "in_progress",
    title: "Phases en cours",
    emptyMessage: "Aucune phase en cours pour ce tournoi.",
  },
  {
    status: "completed",
    title: "Phases terminees",
    emptyMessage: "Aucune phase terminee pour ce tournoi.",
  },
  {
    status: "not_started",
    title: "Phases a venir",
    emptyMessage: "Aucune phase a venir pour ce tournoi.",
  },
];

const BRACKET_LABELS: Record<string, string> = {
  common: "Commun",
  amateur: "Amateur",
  master: "Master",
  challenger: "Challenger",
};

function toSearchIndex(players: LobbyPlayer[]): string {
  return players.map((player) => player.playerName.toLowerCase()).join(" ");
}

function getGamePlayers(detailsGame: PhaseDetails["games"][number]): LobbyPlayer[] {
  const source = detailsGame.hasResults ? detailsGame.results : detailsGame.assignedPlayers;

  return source
    .map((player) => ({
      playerName: player.player_name || "-",
      riotId: player.riot_id,
    }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
}

function getStatusChip(status: PhaseStatus): {
  label: string;
  color: "warning" | "success" | "default";
} {
  if (status === "completed") {
    return { label: "Terminee", color: "success" };
  }

  if (status === "in_progress") {
    return { label: "En cours", color: "warning" };
  }

  return { label: "A venir", color: "default" };
}

function getPhaseFormatInfo(phase: PhaseWithDetails): string {
  if (phase.order_index === 4) {
    return "Master: top 16 a partir de la game 3";
  }

  if (phase.order_index === 5) {
    return "Finales sur 3 brackets: Challenger, Master, Amateur";
  }

  if (phase.order_index === 3) {
    return "Split Master / Amateur avec reset des points";
  }

  if (phase.order_index === 2) {
    return "Qualification de la seconde vague";
  }

  return "Phase de qualification initiale";
}

function getEstimatedParticipantsCount(
  phaseOrder: number,
  registrationsCount: number,
): number {
  const cappedRegistrations = Math.min(registrationsCount, 128);

  if (phaseOrder === 1) {
    return cappedRegistrations;
  }

  if (phaseOrder === 2) {
    return Math.max(cappedRegistrations - 32, 0);
  }

  if (phaseOrder === 3) {
    return cappedRegistrations;
  }

  if (phaseOrder === 4) {
    return Math.min(cappedRegistrations, 96);
  }

  return Math.min(cappedRegistrations, 24);
}

function getPhaseParticipantSummary(
  phase: PhaseWithDetails,
  details: PhaseDetails | null,
  registrationsCount: number,
): PhaseParticipantSummary {
  if (details) {
    return {
      count: details.participants.length,
      label: `${details.participants.length} joueurs`,
      estimated: false,
    };
  }

  const estimatedCount = getEstimatedParticipantsCount(
    phase.order_index,
    registrationsCount,
  );

  return {
    count: estimatedCount,
    label: `${estimatedCount} joueurs prevus`,
    estimated: true,
  };
}

function getPendingGamesCount(phase: PhaseWithDetails): number {
  return Math.max(phase.totalGamesExpected - phase.gamesWithResults, 0);
}

function getBracketLabel(bracketName: string): string {
  return BRACKET_LABELS[bracketName] || bracketName;
}

export function PublicScheduleView() {
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [selectedSection, setSelectedSection] = useState<SectionKey>("upcoming");
  const [playerSearch, setPlayerSearch] = useState("");

  const {
    data: tournaments,
    isLoading: tournamentsLoading,
    error: tournamentsError,
  } = useQuery({
    queryKey: ["public", "tournaments"],
    queryFn: () => getTournaments(),
    refetchInterval: 30000,
  });

  const sortedTournaments = useMemo(() => {
    if (!tournaments) {
      return [];
    }

    return [...tournaments].sort((a, b) => {
      if (a.status === "ongoing" && b.status !== "ongoing") return -1;
      if (a.status !== "ongoing" && b.status === "ongoing") return 1;
      return Number(b.year) - Number(a.year);
    });
  }, [tournaments]);

  const selectedTournament = useMemo(
    () =>
      sortedTournaments.find((tournament) => tournament.id === selectedTournamentId) ||
      null,
    [selectedTournamentId, sortedTournaments],
  );

  const selectedTournamentKeys = useMemo(
    () =>
      selectedTournamentId
        ? new Set([selectedTournamentId])
        : new Set<string>(),
    [selectedTournamentId],
  );

  useEffect(() => {
    if (!sortedTournaments.length || selectedTournamentId) {
      return;
    }

    const ongoingTournament = sortedTournaments.find(
      (tournament) => tournament.status === "ongoing",
    );
    setSelectedTournamentId((ongoingTournament || sortedTournaments[0]).id);
  }, [selectedTournamentId, sortedTournaments]);

  const {
    data: phases,
    isLoading: phasesLoading,
    error: phasesError,
  } = useQuery({
    queryKey: ["public", "schedule", "phases", selectedTournamentId],
    queryFn: () => getTournamentPhases(selectedTournamentId),
    enabled: !!selectedTournamentId,
    refetchInterval: 15000,
  });

  const startedPhaseIds = useMemo(() => {
    if (!phases) {
      return [] as string[];
    }

    return phases
      .filter((phase) => phase.totalGamesCreated > 0)
      .map((phase) => phase.id);
  }, [phases]);

  const {
    data: phaseDetailsMap,
    isLoading: detailsLoading,
    error: detailsError,
  } = useQuery({
    queryKey: ["public", "schedule", "details", ...startedPhaseIds],
    queryFn: async () => {
      const details = await Promise.all(
        startedPhaseIds.map(async (phaseId) => [phaseId, await getPhaseDetails(phaseId)] as const),
      );

      return Object.fromEntries(details) as Record<string, PhaseDetails | null>;
    },
    enabled: startedPhaseIds.length > 0,
    refetchInterval: 10000,
  });

  const phasesByStatus = useMemo(() => {
    const grouped: Record<PhaseStatus, PhaseWithDetails[]> = {
      not_started: [],
      in_progress: [],
      completed: [],
    };

    if (!phases) {
      return grouped;
    }

    for (const phase of [...phases].sort((a, b) => a.order_index - b.order_index)) {
      grouped[phase.status].push(phase);
    }

    return grouped;
  }, [phases]);

  const upcomingGames = useMemo<ScheduleGame[]>(() => {
    if (!phases || !phaseDetailsMap) {
      return [];
    }

    return phases
      .filter((phase) => phase.status === "in_progress")
      .sort((a, b) => a.order_index - b.order_index)
      .flatMap((phase) => {
        const details = phaseDetailsMap[phase.id];

        if (!details) {
          return [];
        }

        return details.games
          .filter((game) => !game.hasResults)
          .sort((a, b) => {
            if (a.game_number !== b.game_number) {
              return a.game_number - b.game_number;
            }

            return a.lobby_name.localeCompare(b.lobby_name);
          })
          .map((game) => {
            const players = getGamePlayers(game);

            return {
              phaseId: phase.id,
              phaseName: phase.name,
              phaseOrder: phase.order_index,
              gameId: game.game_id,
              lobbyName: game.lobby_name,
              gameNumber: game.game_number,
              bracketName: game.bracket_name,
              playersCount: players.length,
              players,
              searchIndex: toSearchIndex(players),
            };
          });
      });
  }, [phaseDetailsMap, phases]);

  const normalizedPlayerSearch = useMemo(
    () => playerSearch.trim().toLowerCase(),
    [playerSearch],
  );

  const filteredUpcomingGames = useMemo(() => {
    if (!normalizedPlayerSearch) {
      return upcomingGames;
    }

    return upcomingGames.filter((game) => game.searchIndex.includes(normalizedPlayerSearch));
  }, [normalizedPlayerSearch, upcomingGames]);

  const nextInProgressPhase = useMemo(() => {
    if (!phases) {
      return null;
    }

    return (
      [...phases]
        .filter((phase) => phase.status === "in_progress")
        .sort((a, b) => a.order_index - b.order_index)[0] || null
    );
  }, [phases]);

  if (tournamentsLoading) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Calendrier du tournoi</h1>
        <p className="text-default-500 mt-3">Chargement des tournois...</p>
      </Card>
    );
  }

  if (tournamentsError) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Calendrier du tournoi</h1>
        <p className="text-danger mt-3">Erreur lors du chargement des tournois.</p>
      </Card>
    );
  }

  if (!sortedTournaments.length) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Calendrier du tournoi</h1>
        <p className="text-default-500 mt-3">Aucun tournoi disponible.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <Card className="p-6 border border-divider bg-secondary">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Calendrier du tournoi</h1>
            <p className="text-default-500">
              Suivi des phases, progression du tournoi et prochains lobbies sans resultat.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4 items-start">
            <Select
              label="Tournoi"
              selectedKeys={selectedTournamentKeys}
              disallowEmptySelection
              renderValue={(items) =>
                items
                  .map((item) => item.textValue)
                  .filter(Boolean)
                  .join(", ")
              }
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  return;
                }

                const value = Array.from(keys)[0] as string | undefined;
                setSelectedTournamentId(value || "");
              }}
            >
              {sortedTournaments.map((tournament) => (
                <SelectItem
                  key={tournament.id}
                  textValue={`${tournament.name} (${tournament.year})`}
                >
                  {tournament.name} ({tournament.year})
                </SelectItem>
              ))}
            </Select>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-4 shadow-none border border-divider">
                <p className="text-sm text-default-500">Statut tournoi</p>
                <p className="text-lg font-semibold mt-1">
                  {selectedTournament?.status === "ongoing"
                    ? "En cours"
                    : selectedTournament?.status === "completed"
                      ? "Termine"
                      : "A venir"}
                </p>
              </Card>

              <Card className="p-4 shadow-none border border-divider">
                <p className="text-sm text-default-500">Tour actuel</p>
                <p className="text-lg font-semibold mt-1">
                  {nextInProgressPhase?.name || "Aucune phase active"}
                </p>
              </Card>

              <Card className="p-4 shadow-none border border-divider">
                <p className="text-sm text-default-500">Lobbies a jouer</p>
                <p className="text-lg font-semibold mt-1">{upcomingGames.length}</p>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
            <Input
              label="Filtrer par pseudo TR"
              placeholder="Pseudo TR"
              value={playerSearch}
              onValueChange={setPlayerSearch}
            />
            <Chip color="primary" variant="flat" size="sm" className="h-fit">
              {normalizedPlayerSearch ? "Filtre actif" : "Tous les joueurs"}
            </Chip>
          </div>
        </div>
      </Card>

      {phasesLoading ? (
        <Card className="p-6 border border-divider">
          <p className="text-default-500">Chargement des phases...</p>
        </Card>
      ) : null}

      {phasesError ? (
        <Card className="p-6 border border-divider">
          <p className="text-danger">Erreur lors du chargement des phases.</p>
        </Card>
      ) : null}

      {detailsError ? (
        <Card className="p-6 border border-divider">
          <p className="text-danger">Erreur lors du chargement des prochaines parties.</p>
        </Card>
      ) : null}

      {!phasesLoading && phases && phases.length === 0 ? (
        <Card className="p-6 border border-divider">
          <p className="text-default-500">Aucune phase configuree pour ce tournoi.</p>
        </Card>
      ) : null}

      <Card className="p-6 border border-divider">
        <Tabs
          selectedKey={selectedSection}
          onSelectionChange={(key) => setSelectedSection(key as SectionKey)}
          aria-label="Sections du calendrier"
          color="primary"
          variant="underlined"
        >
          <Tab
            key="upcoming"
            title={`Prochaines parties (${filteredUpcomingGames.length})`}
          >
            <div className="pt-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-semibold">Prochaines parties</h2>
                  <p className="text-sm text-default-500 mt-1">
                    Lobbies crées sans resultat saisi, classes par phase puis par manche.
                  </p>
                </div>
                <Chip color="primary" variant="flat" size="sm">
                  {filteredUpcomingGames.length} lobby{filteredUpcomingGames.length > 1 ? "s" : ""}
                </Chip>
              </div>

              {detailsLoading && startedPhaseIds.length > 0 ? (
                <p className="text-default-500">Chargement des lobbies...</p>
              ) : filteredUpcomingGames.length === 0 ? (
                <p className="text-default-500">
                  {normalizedPlayerSearch
                    ? "Aucun lobby ne correspond à ce joueur."
                    : "Aucun lobby en attente pour les phases en cours."}
                </p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {filteredUpcomingGames.map((game) => (
                    <Card key={game.gameId} className="p-4 shadow-none border border-divider">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip size="sm" color="default" variant="flat">
                              {game.phaseName}
                            </Chip>
                            <Chip
                              size="sm"
                              color={getBracketChipColor(game.bracketName)}
                              variant="flat"
                            >
                              {getBracketLabel(game.bracketName)}
                            </Chip>
                          </div>
                          <h3 className="text-lg font-semibold">
                            {game.lobbyName} - Partie {game.gameNumber}
                          </h3>
                          <p className="text-sm text-default-500">
                            {game.playersCount} joueurs assignes
                          </p>
                        </div>

                        <Chip size="sm" color="warning" variant="dot">
                          En attente de resultat
                        </Chip>
                      </div>

                      <div className="mt-3 pt-3 border-t border-divider">
                        <p className="text-xs uppercase tracking-wide text-default-500 mb-2">
                          Joueurs du lobby
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {game.players.map((player) => {
                            const playerMatch =
                              !!normalizedPlayerSearch &&
                              `${player.playerName} ${player.riotId}`
                                .toLowerCase()
                                .includes(normalizedPlayerSearch);

                            return (
                              <div
                                key={`${game.gameId}-${player.riotId}`}
                                className={`text-sm rounded px-2 py-1 ${
                                  playerMatch
                                    ? "bg-primary/10 border border-primary/30"
                                    : "border border-transparent"
                                }`}
                              >
                                <span className="font-medium">{player.playerName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Tab>

          {STATUS_SECTIONS.map((section) => {
            const sectionPhases = phasesByStatus[section.status]
              .slice()
              .sort(
                (a, b) =>
                  STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
                  a.order_index - b.order_index,
              );

            return (
              <Tab
                key={section.status}
                title={`${section.title} (${sectionPhases.length})`}
              >
                <div className="pt-4">
                  {sectionPhases.length === 0 ? (
                    <Card className="p-6 border border-divider">
                      <p className="text-default-500">{section.emptyMessage}</p>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {sectionPhases.map((phase) => {
                        const details = phaseDetailsMap?.[phase.id] || null;
                        const participantSummary = getPhaseParticipantSummary(
                          phase,
                          details,
                          selectedTournament?.registrationsCount || 0,
                        );
                        const pendingGamesCount = getPendingGamesCount(phase);
                        const phaseChip = getStatusChip(phase.status);

                        const phaseGames = details
                          ? [...details.games]
                              .sort((a, b) => {
                                if (a.game_number !== b.game_number) {
                                  return a.game_number - b.game_number;
                                }

                                return a.lobby_name.localeCompare(b.lobby_name);
                              })
                              .map((game) => {
                                const players = getGamePlayers(game);

                                return {
                                  gameId: game.game_id,
                                  lobbyName: game.lobby_name,
                                  gameNumber: game.game_number,
                                  bracketName: game.bracket_name,
                                  hasResults: game.hasResults,
                                  players,
                                  searchIndex: toSearchIndex(players),
                                };
                              })
                          : [];

                        const filteredPhaseGames = !normalizedPlayerSearch
                          ? phaseGames
                          : phaseGames.filter((game) =>
                              game.searchIndex.includes(normalizedPlayerSearch),
                            );

                        return (
                          <Card key={phase.id} className="p-5 border border-divider">
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-lg font-semibold">{phase.name}</h3>
                                    <Chip size="sm" color="primary" variant="flat">
                                      Phase {phase.order_index}
                                    </Chip>
                                  </div>
                                  <p className="text-sm text-default-500 mt-1">
                                    {getPhaseFormatInfo(phase)}
                                  </p>
                                </div>

                                <Chip size="sm" color={phaseChip.color} variant="flat">
                                  {phaseChip.label}
                                </Chip>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Card className="p-3 shadow-none border border-divider">
                                  <p className="text-xs uppercase tracking-wide text-default-500">
                                    Participants
                                  </p>
                                  <p className="text-lg font-semibold mt-1">{participantSummary.count}</p>
                                  <p className="text-xs text-default-400 mt-1">
                                    {participantSummary.estimated ? "projection" : "confirmes"}
                                  </p>
                                </Card>

                                <Card className="p-3 shadow-none border border-divider">
                                  <p className="text-xs uppercase tracking-wide text-default-500">
                                    Brackets
                                  </p>
                                  <p className="text-lg font-semibold mt-1">{phase.brackets.length}</p>
                                  <p className="text-xs text-default-400 mt-1">
                                    {phase.brackets.map((bracket) => getBracketLabel(bracket.name)).join(", ")}
                                  </p>
                                </Card>

                                <Card className="p-3 shadow-none border border-divider">
                                  <p className="text-xs uppercase tracking-wide text-default-500">
                                    Progression
                                  </p>
                                  <p className="text-lg font-semibold mt-1">
                                    {phase.gamesWithResults}/{phase.totalGamesExpected}
                                  </p>
                                  <p className="text-xs text-default-400 mt-1">resultats saisis</p>
                                </Card>

                                <Card className="p-3 shadow-none border border-divider">
                                  <p className="text-xs uppercase tracking-wide text-default-500">
                                    Restant
                                  </p>
                                  <p className="text-lg font-semibold mt-1">{pendingGamesCount}</p>
                                  <p className="text-xs text-default-400 mt-1">lobbies sans resultat</p>
                                </Card>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {phase.brackets.map((phaseBracket) => (
                                  <Chip
                                    key={phaseBracket.id}
                                    size="sm"
                                    color={getBracketChipColor(phaseBracket.name)}
                                    variant="flat"
                                  >
                                    {getBracketLabel(phaseBracket.name)} · {phaseBracket.gamesCount} lobbies
                                  </Chip>
                                ))}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-default-500">
                                <div>
                                  <span className="font-medium text-foreground">Format :</span>{" "}
                                  {phase.total_games} parties prevues par bracket.
                                </div>
                                <div>
                                  <span className="font-medium text-foreground">Vue rapide :</span>{" "}
                                  {phase.status === "completed"
                                    ? "tous les resultats attendus ont ete saisis"
                                    : phase.status === "in_progress"
                                      ? `${pendingGamesCount} lobby${pendingGamesCount > 1 ? "s" : ""} restent a jouer ou a renseigner`
                                      : participantSummary.label}
                                </div>
                              </div>

                              {details ? (
                                <div className="pt-3 border-t border-divider">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="text-xs uppercase tracking-wide text-default-500">
                                      Lobbies de la phase
                                    </p>
                                    <Chip size="sm" variant="flat" color="default">
                                      {filteredPhaseGames.length}/{phaseGames.length}
                                    </Chip>
                                  </div>

                                  {filteredPhaseGames.length === 0 ? (
                                    <p className="text-sm text-default-500">
                                      {normalizedPlayerSearch
                                        ? "Aucun lobby de cette phase ne correspond au filtre joueur."
                                        : "Aucun lobby disponible."}
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {filteredPhaseGames.map((game) => (
                                        <Card
                                          key={game.gameId}
                                          className="p-3 shadow-none border border-divider"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                              <p className="font-medium text-sm">
                                                {game.lobbyName} - Partie {game.gameNumber}
                                              </p>
                                              <p className="text-xs text-default-500">
                                                {game.players.length} joueurs
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Chip
                                                size="sm"
                                                color={getBracketChipColor(game.bracketName)}
                                                variant="flat"
                                              >
                                                {getBracketLabel(game.bracketName)}
                                              </Chip>
                                              <Chip
                                                size="sm"
                                                color={game.hasResults ? "success" : "warning"}
                                                variant="dot"
                                              >
                                                {game.hasResults ? "Resultat saisi" : "En attente"}
                                              </Chip>
                                            </div>
                                          </div>
                                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1">
                                            {game.players.map((player) => {
                                              const playerMatch =
                                                !!normalizedPlayerSearch &&
                                                `${player.playerName} ${player.riotId}`
                                                  .toLowerCase()
                                                  .includes(normalizedPlayerSearch);

                                              return (
                                                <p
                                                  key={`${game.gameId}-${player.riotId}`}
                                                  className={`text-sm rounded px-2 py-1 ${
                                                    playerMatch
                                                      ? "bg-primary/10 border border-primary/30"
                                                      : "border border-transparent"
                                                  }`}
                                                >
                                                  <span className="font-medium">{player.playerName}</span>
                                                </p>
                                              );
                                            })}
                                          </div>
                                        </Card>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Tab>
            );
          })}
        </Tabs>
      </Card>
    </div>
  );
}