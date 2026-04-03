"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import { Tab, Tabs } from "@heroui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";

import {
  getPhaseDetails,
  getTournamentPhases,
  getTournaments,
} from "@/app/actions/tournaments";
import type { PhaseDetails } from "@/app/actions/tournaments";
import { getBracketChipColor } from "@/utils/bracket-colors";

function getSortedTournaments(
  tournaments: Awaited<ReturnType<typeof getTournaments>> | undefined,
) {
  if (!tournaments) return [];

  return [...tournaments].sort((a, b) => {
    if (a.status === "ongoing" && b.status !== "ongoing") return -1;
    if (a.status !== "ongoing" && b.status === "ongoing") return 1;
    return Number(b.year) - Number(a.year);
  });
}

export function PublicTournamentPhasesView() {
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [selectedPhaseId, setSelectedPhaseId] = useState("");
  const [selectedSubTab, setSelectedSubTab] = useState("rank");
  const [selectedBracketFilter, setSelectedBracketFilter] = useState<string | null>(null);

  const {
    data: tournaments,
    isLoading: tournamentsLoading,
    error: tournamentsError,
  } = useQuery({
    queryKey: ["public", "tournaments"],
    queryFn: () => getTournaments(),
    refetchInterval: 30000,
  });

  const sortedTournaments = useMemo(
    () => getSortedTournaments(tournaments),
    [tournaments],
  );

  useEffect(() => {
    if (!sortedTournaments.length || selectedTournamentId) {
      return;
    }

    const ongoing = sortedTournaments.find((t) => t.status === "ongoing");
    setSelectedTournamentId((ongoing || sortedTournaments[0]).id);
  }, [sortedTournaments, selectedTournamentId]);

  const {
    data: phases,
    isLoading: phasesLoading,
    error: phasesError,
  } = useQuery({
    queryKey: ["public", "phases", selectedTournamentId],
    queryFn: () => getTournamentPhases(selectedTournamentId),
    enabled: !!selectedTournamentId,
    refetchInterval: 15000,
  });

  const startedPhases = useMemo(() => {
    if (!phases) return [];
    return phases
      .filter((phase) => phase.totalGamesCreated > 0)
      .sort((a, b) => a.order_index - b.order_index);
  }, [phases]);

  useEffect(() => {
    if (!startedPhases.length) {
      setSelectedPhaseId("");
      return;
    }

    const phaseExists = startedPhases.some((phase) => phase.id === selectedPhaseId);
    if (phaseExists) {
      return;
    }

    setSelectedPhaseId(startedPhases[0].id);
  }, [startedPhases, selectedPhaseId]);

  const {
    data: phaseDetails,
    isLoading: detailsLoading,
    error: detailsError,
  } = useQuery({
    queryKey: ["public", "phase-details", selectedPhaseId],
    queryFn: () => getPhaseDetails(selectedPhaseId),
    enabled: !!selectedPhaseId,
    refetchInterval: 5000,
  });

  const gamesByNumber = useMemo(() => {
    if (!phaseDetails) return [] as Array<{
      gameNumber: number;
      games: PhaseDetails["games"];
    }>;

    const grouped = new Map<number, PhaseDetails["games"]>();

    for (const game of phaseDetails.games) {
      const list = grouped.get(game.game_number) || [];
      list.push(game);
      grouped.set(game.game_number, list);
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([gameNumber, games]) => ({
        gameNumber,
        games: [...games].sort((a, b) => a.lobby_name.localeCompare(b.lobby_name)),
      }));
  }, [phaseDetails]);

  const availableBrackets = useMemo(() => {
    if (!phaseDetails) return [];
    const brackets = new Set<string>();
    for (const game of phaseDetails.games) {
      brackets.add(game.bracket_name);
    }
    return Array.from(brackets).sort();
  }, [phaseDetails]);

  const filteredGamesByNumber = useMemo(() => {
    if (!selectedBracketFilter) return gamesByNumber;

    return gamesByNumber
      .map((group) => ({
        gameNumber: group.gameNumber,
        games: group.games.filter(
          (game) => game.bracket_name === selectedBracketFilter,
        ),
      }))
      .filter((group) => group.games.length > 0);
  }, [gamesByNumber, selectedBracketFilter]);

  const selectedTournamentKeys = useMemo(
    () =>
      selectedTournamentId
        ? new Set([selectedTournamentId])
        : new Set<string>(),
    [selectedTournamentId],
  );

  useEffect(() => {
    const hasTab =
      selectedSubTab === "rank" ||
      filteredGamesByNumber.some((group) => `game-${group.gameNumber}` === selectedSubTab);

    if (hasTab) {
      return;
    }

    // Si le tab sélectionné n'existe pas, vérifier si on peut sélectionner "game-1"
    if (filteredGamesByNumber.some((group) => group.gameNumber === 1)) {
      setSelectedSubTab("game-1");
    } else if (filteredGamesByNumber.length > 0) {
      // Sinon, sélectionner la première partie disponible
      setSelectedSubTab(`game-${filteredGamesByNumber[0].gameNumber}`);
    } else {
      // Sinon, revenir au classement
      setSelectedSubTab("rank");
    }
  }, [filteredGamesByNumber, selectedSubTab]);

  if (tournamentsLoading) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Tournoi public</h1>
        <p className="text-default-500 mt-3">Chargement des tournois...</p>
      </Card>
    );
  }

  if (tournamentsError) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Tournoi public</h1>
        <p className="text-danger mt-3">Erreur lors du chargement des tournois.</p>
      </Card>
    );
  }

  if (!sortedTournaments.length) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Tournoi public</h1>
        <p className="text-default-500 mt-3">Aucun tournoi disponible.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2 w-full">
      <Card className="p-4 border border-divider bg-secondary w-full mx-auto">
        <div className="grid w-full grid-cols-3 gap-4 items-center">
          <Select
            label="Tournoi"
            selectedKeys={selectedTournamentKeys}
            disallowEmptySelection
            className="w-60"
            renderValue={(items) =>
              items
                .map((item) => item.textValue)
                .filter(Boolean)
                .join(", ")
            }
            onSelectionChange={(keys) => {
              if (keys === "all") return;
              const value = Array.from(keys)[0] as string | undefined;
              setSelectedTournamentId(value || "");
              setSelectedPhaseId("");
              setSelectedSubTab("rank");
            }}
          >
            {sortedTournaments.map((tournament) => (
              <SelectItem key={tournament.id} textValue={`${tournament.name} (${tournament.year})`}>
                {tournament.name} ({tournament.year})
              </SelectItem>
            ))}
          </Select>

          
            <h1 className="text-2xl font-bold flex-1 text-center">Vue publique par phase</h1>
            
  
          {phaseDetails ? (
              <Chip color="primary" variant="dot" size="sm" className="ml-auto">
                {phaseDetails.phase.gamesWithResults}/{phaseDetails.phase.totalGamesExpected} parties jouees
              </Chip>
            ) : null}
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

      {!phasesLoading && !startedPhases.length ? (
        <Card className="p-6 border border-divider">
          <p className="text-default-500">Aucune phase demarree pour ce tournoi.</p>
        </Card>
      ) : null}

      {startedPhases.length > 0 ? (
        <Tabs
          aria-label="Phases publiques"
          selectedKey={selectedPhaseId}
          onSelectionChange={(key) => {
            setSelectedPhaseId(String(key));
            setSelectedSubTab("game-1");
            setSelectedBracketFilter(null);
          }}
          color="primary"
          variant="underlined"
        >
          {startedPhases.map((phase) => (
            <Tab
              key={phase.id}
              title={phase.name}
            >
              {detailsLoading ? (
                <Card className="p-6 border border-divider">
                  <p className="text-default-500">Chargement des details de phase...</p>
                </Card>
              ) : null}

              {detailsError ? (
                <Card className="p-6 border border-divider">
                  <p className="text-danger">Erreur lors du chargement de la phase.</p>
                </Card>
              ) : null}

              {phaseDetails && phaseDetails.phase.id === phase.id ? (
                <div className="flex flex-col gap-4">
                  <Card className="p-4 border border-divider">
                    <p className="text-sm text-default-500 text-center">
                      {phaseDetails.phase.participantsCount} participants
                    </p>
                  </Card>

                  {phaseDetails.phase.order_index >= 3 && availableBrackets.length > 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-sm text-default-500">Filtrer par bracket</span>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button
                          size="sm"
                          variant={selectedBracketFilter === null ? "solid" : "flat"}
                          color="primary"
                          onPress={() => setSelectedBracketFilter(null)}
                        >
                          Tous les brackets
                        </Button>
                        {availableBrackets.map((bracket) => {
                          const label = bracket.charAt(0).toUpperCase() + bracket.slice(1);

                          return (
                            <Button
                              key={bracket}
                              size="sm"
                              variant={selectedBracketFilter === bracket ? "solid" : "flat"}
                              color="primary"
                              onPress={() => setSelectedBracketFilter(bracket)}
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <Tabs
                    aria-label="Sous-onglets phase"
                    selectedKey={selectedSubTab}
                    defaultSelectedKey={`game-1`}
                    onSelectionChange={(key) => setSelectedSubTab(String(key))}
                    color="secondary"
                    variant="bordered"
                  >
                    <Tab key="rank" title="Rank">
                      <Card className="p-4 border border-divider">
                        {phaseDetails.participants.length === 0 ? (
                          <p className="text-default-500">Aucun classement disponible.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table aria-label="Classement de la phase" className="min-w-[1100px] whitespace-nowrap">
                              <TableHeader>
                                <TableColumn>RANK</TableColumn>
                                <TableColumn>JOUEUR</TableColumn>
                                <TableColumn>RIOT ID</TableColumn>
                                <TableColumn>POINTS</TableColumn>
                                <TableColumn>TOP 1</TableColumn>
                                <TableColumn>TOP 4+</TableColumn>
                                <TableColumn>TOP 2</TableColumn>
                                <TableColumn>TOP 3</TableColumn>
                                <TableColumn>TOP 4</TableColumn>
                                <TableColumn>TOP 5</TableColumn>
                                <TableColumn>TOP 6</TableColumn>
                                <TableColumn>TOP 7</TableColumn>
                                <TableColumn>TOP 8</TableColumn>
                              </TableHeader>
                              <TableBody>
                                {phaseDetails.participants.map((player) => (
                                  <TableRow key={player.player_id}>
                                    <TableCell>#{player.current_rank}</TableCell>
                                    <TableCell>{player.player_name}</TableCell>
                                    <TableCell>{player.riot_id}</TableCell>
                                    <TableCell>{player.total_points}</TableCell>
                                    <TableCell>{player.top1_count}</TableCell>
                                    <TableCell>{player.top4_or_better_count}</TableCell>
                                    <TableCell>{player.top2_count}</TableCell>
                                    <TableCell>{player.top3_count}</TableCell>
                                    <TableCell>{player.top4_count}</TableCell>
                                    <TableCell>{player.top5_count}</TableCell>
                                    <TableCell>{player.top6_count}</TableCell>
                                    <TableCell>{player.top7_count}</TableCell>
                                    <TableCell>{player.top8_count}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </Card>
                    </Tab>

                    {filteredGamesByNumber.map((group) => (
                      <Tab
                        key={`game-${group.gameNumber}`}
                        title={`Partie ${group.gameNumber}`}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {group.games.map((game) => (
                            <Card key={game.game_id} className="p-4 border border-divider">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <h3 className="font-semibold">{game.lobby_name}</h3>
                                <Chip
                                  size="sm"
                                  color={getBracketChipColor(game.bracket_name)}
                                  variant="flat"
                                >
                                  {game.bracket_name.toUpperCase()}
                                </Chip>
                              </div>

                              {game.hasResults ? (
                                <Table aria-label={`Resultats ${game.lobby_name}`}>
                                  <TableHeader>
                                    <TableColumn>PLACEMENT</TableColumn>
                                    <TableColumn>JOUEUR</TableColumn>
                                    <TableColumn>RIOT ID</TableColumn>
                                    <TableColumn>POINTS</TableColumn>
                                  </TableHeader>
                                  <TableBody>
                                    {game.results.map((result) => (
                                      <TableRow key={result.player_id}>
                                        <TableCell>#{result.placement}</TableCell>
                                        <TableCell>{result.player_name}</TableCell>
                                        <TableCell>{result.riot_id}</TableCell>
                                        <TableCell>{result.points}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : (
                                <Table aria-label={`Lobby ${game.lobby_name}`}>
                                  <TableHeader>
                                    <TableColumn>SEED</TableColumn>
                                    <TableColumn>JOUEUR</TableColumn>
                                    <TableColumn>RIOT ID</TableColumn>
                                  </TableHeader>
                                  <TableBody>
                                    {game.assignedPlayers.map((player) => (
                                      <TableRow key={player.player_id}>
                                        <TableCell>#{player.seed}</TableCell>
                                        <TableCell>{player.player_name}</TableCell>
                                        <TableCell>{player.riot_id}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </Card>
                          ))}
                        </div>
                      </Tab>
                    ))}
                  </Tabs>
                </div>
              ) : null}
            </Tab>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}
