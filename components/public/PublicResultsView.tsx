"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { Select, SelectItem } from "@heroui/select";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
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
  getTournamentGlobalResults,
  getTournamentPhases,
  getTournaments,
} from "@/app/actions/tournaments";
import { getBracketChipColor } from "@/utils/bracket-colors";

const ALL_BRACKETS = ["common", "amateur", "master", "challenger"] as const;


export function PublicResultsView() {
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [selectedBrackets, setSelectedBrackets] = useState<Set<string>>(
    () => new Set(ALL_BRACKETS),
  );
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const selectedTournamentKeys = useMemo(
    () => (selectedTournamentId ? new Set([selectedTournamentId]) : new Set<string>()),
    [selectedTournamentId],
  );
  const selectedPhaseKeys = useMemo(
    () => (selectedPhaseId ? new Set([selectedPhaseId]) : new Set<string>()),
    [selectedPhaseId],
  );

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
    if (!tournaments) return [];

    return [...tournaments].sort((a, b) => {
      if (a.status === "ongoing" && b.status !== "ongoing") return -1;
      if (a.status !== "ongoing" && b.status === "ongoing") return 1;
      return Number(b.year) - Number(a.year);
    });
  }, [tournaments]);

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
    return phases.filter((p) => p.totalGamesCreated > 0);
  }, [phases]);

  useEffect(() => {
    if (!startedPhases.length) {
      setSelectedPhaseId("");
      return;
    }

    const hasCurrent = startedPhases.some((p) => p.id === selectedPhaseId);
    if (hasCurrent) {
      return;
    }

    const latest = [...startedPhases].sort((a, b) => b.order_index - a.order_index)[0];
    setSelectedPhaseId(latest.id);
  }, [startedPhases, selectedPhaseId]);

  const {
    data: phaseDetails,
    isLoading: detailsLoading,
    error: detailsError,
  } = useQuery({
    queryKey: ["public", "phaseDetails", selectedPhaseId],
    queryFn: () => getPhaseDetails(selectedPhaseId),
    enabled: !!selectedPhaseId,
    refetchInterval: 5000,
  });

  const {
    data: globalResults,
    isLoading: globalResultsLoading,
    error: globalResultsError,
  } = useQuery({
    queryKey: ["public", "tournament-global-results", selectedTournamentId],
    queryFn: () => getTournamentGlobalResults(selectedTournamentId),
    enabled: !!selectedTournamentId,
    refetchInterval: 5000,
  });

  const finalsTop24 = useMemo(() => {
    const isFinalsRankingAvailable = globalResults?.filterPhase?.order_index === 5;
    if (!globalResults || !isFinalsRankingAvailable) {
      return [];
    }

    return globalResults.leaderboardsByFilter.global.slice(0, 24);
  }, [globalResults]);

  const top24ByBracket = useMemo(() => {
    return {
      challenger: finalsTop24.filter((entry) => entry.rank >= 1 && entry.rank <= 8),
      master: finalsTop24.filter((entry) => entry.rank >= 9 && entry.rank <= 16),
      amateur: finalsTop24.filter((entry) => entry.rank >= 17 && entry.rank <= 24),
    };
  }, [finalsTop24]);

  const indexedGames = useMemo(() => {
    if (!phaseDetails) return [];

    return phaseDetails.games.map((game) => {
      const bracketKey = game.bracket_name.toLowerCase();
      const players = game.hasResults ? game.results : game.assignedPlayers;
      const searchIndex = players
        .map((player) => `${player.player_name} ${player.riot_id}`.toLowerCase())
        .join(" ");

      return {
        game,
        bracketKey,
        searchIndex,
      };
    });
  }, [phaseDetails]);

  const availableBrackets = useMemo(() => {
    return Array.from(
      new Set(
        indexedGames
          .map(({ bracketKey }) => bracketKey)
          .filter((bracket) => ALL_BRACKETS.includes(bracket as (typeof ALL_BRACKETS)[number])),
      ),
    );
  }, [indexedGames]);

  const filteredGamesByBracket = useMemo(() => {
    return indexedGames.filter(({ bracketKey }) => selectedBrackets.has(bracketKey));
  }, [indexedGames, selectedBrackets]);

  const displayedGames = useMemo(() => {
    const normalizedSearch = deferredSearchText.trim().toLowerCase();

    if (!normalizedSearch) {
      return filteredGamesByBracket.map(({ game }) => game);
    }

    return filteredGamesByBracket
      .filter(({ searchIndex }) => searchIndex.includes(normalizedSearch))
      .map(({ game }) => game);
  }, [deferredSearchText, filteredGamesByBracket]);

  const toggleBracket = (bracketName: string) => {
    setSelectedBrackets((previous) => {
      const next = new Set(previous);

      if (next.has(bracketName)) {
        next.delete(bracketName);
      } else {
        next.add(bracketName);
      }

      return next;
    });
  };

  const resetFilters = () => {
    setSelectedBrackets(new Set(ALL_BRACKETS));
    setSearchText("");
  };

  if (tournamentsLoading) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Résultats des parties</h1>
        <p className="text-default-500 mt-3">Chargement des tournois...</p>
      </Card>
    );
  }

  if (tournamentsError) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Résultats des parties</h1>
        <p className="text-danger mt-3">Erreur lors du chargement des tournois.</p>
      </Card>
    );
  }

  if (!sortedTournaments.length) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Résultats des parties</h1>
        <p className="text-default-500 mt-3">Aucun tournoi disponible.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 border border-divider bg-secondary">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              if (keys === "all") return;
              const value = Array.from(keys)[0] as string | undefined;
              setSelectedTournamentId(value || "");
              setSelectedPhaseId("");
            }}
          >
            {sortedTournaments.map((t) => (
              <SelectItem key={t.id} textValue={`${t.name} (${t.year})`}>
                {t.name} ({t.year})
              </SelectItem>
            ))}
          </Select>

          <Select
            label="Phase"
            selectedKeys={selectedPhaseKeys}
            onSelectionChange={(keys) => {
              if (keys === "all") return;
              const value = Array.from(keys)[0] as string | undefined;
              setSelectedPhaseId(value || "");
            }}
            isDisabled={phasesLoading || startedPhases.length === 0}
          >
            {startedPhases.map((p) => (
              <SelectItem key={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </Select>
        </div>
      </Card>

      {phasesError ? (
        <Card className="p-6 border border-divider">
          <p className="text-danger">Erreur lors du chargement des phases.</p>
        </Card>
      ) : null}

      {!phasesLoading && !startedPhases.length ? (
        <Card className="p-6 border border-divider">
          <p className="text-default-500">
            Aucune phase démarrée pour ce tournoi.
          </p>
        </Card>
      ) : null}

      {detailsLoading ? (
        <Card className="p-6 border border-divider">
          <p className="text-default-500">Chargement des résultats...</p>
        </Card>
      ) : null}

      {detailsError ? (
        <Card className="p-6 border border-divider">
          <p className="text-danger">
            Erreur lors du chargement des détails de phase.
          </p>
        </Card>
      ) : null}

      <Card className="p-4 border border-divider">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">Top 24 du tournoi</h2>
            <Chip size="sm" color="primary" variant="flat">
              Basé sur les résultats de finale
            </Chip>
          </div>

          {globalResultsLoading ? (
            <p className="text-default-500">Chargement du Top 24...</p>
          ) : null}

          {globalResultsError ? (
            <p className="text-danger">Erreur lors du chargement du Top 24.</p>
          ) : null}

          {!globalResultsLoading && !globalResultsError && globalResults?.filterPhase?.order_index !== 5 ? (
            <p className="text-default-500">
              Le Top 24 sera affiché dès que la phase finale sera démarrée.
            </p>
          ) : null}

          {!globalResultsLoading && !globalResultsError && globalResults?.filterPhase?.order_index === 5 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {([
                ["challenger", "Challenger (Top 8)"],
                ["master", "Master (Top 9-16)"],
                ["amateur", "Amateur (Top 17-24)"],
              ] as const).map(([bucket, title]) => (
                <Card key={bucket} className="p-3 border border-divider">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{title}</h3>
                    <Chip size="sm" color={getBracketChipColor(bucket)} variant="flat">
                      {top24ByBracket[bucket].length}/8
                    </Chip>
                  </div>

                  <Table aria-label={`Top 24 ${bucket}`}>
                    <TableHeader>
                      <TableColumn>RANG</TableColumn>
                      <TableColumn>PSEUDO TR</TableColumn>
                      <TableColumn>PTS</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {top24ByBracket[bucket].map((entry) => (
                        <TableRow key={`${bucket}-${entry.player_id}`}>
                          <TableCell>#{entry.rank}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{entry.player_name || "-"}</span>
                              {entry.is_finalist ? (
                                <Chip size="sm" color="warning" variant="flat">
                                  Finaliste
                                </Chip>
                              ) : null}
                              {entry.used_phase34_tie_break ? (
                                <Chip size="sm" color="secondary" variant="flat">
                                  TB P3+P4
                                </Chip>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>{entry.total_points}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      {phaseDetails ? (
        <>
          <Card className="p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">{phaseDetails.phase.name}</h2>
                <Chip color="primary" size="sm" variant="dot">
                  {phaseDetails.phase.gamesWithResults}/{phaseDetails.phase.totalGamesExpected} parties
                </Chip>
                <Chip color="default" size="sm" variant="flat">
                  {displayedGames.length}/{phaseDetails.games.length} lobbies affichés
                </Chip>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                <Input
                  label="Recherche pseudo TR"
                  placeholder="Pseudo TR"
                  value={searchText}
                  onValueChange={setSearchText}
                />

                <Button color="primary" variant="flat" onPress={resetFilters}>
                  Réinitialiser
                </Button>
              </div>

              {availableBrackets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableBrackets.map((bracket) => {
                    const isSelected = selectedBrackets.has(bracket);

                    return (
                      <Button
                        key={bracket}
                        size="sm"
                        color={getBracketChipColor(bracket)}
                        variant={isSelected ? "solid" : "flat"}
                        onPress={() => toggleBracket(bracket)}
                      >
                        {bracket.toUpperCase()}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </Card>

          {displayedGames.length === 0 ? (
            <Card className="p-6 border border-divider">
              <p className="text-default-500">
                Aucune partie ne correspond aux critères sélectionnés.
              </p>
            </Card>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedGames.map((game) => (
              <Card key={game.game_id} className="p-4 border border-divider">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="font-semibold">
                    {game.lobby_name} - Partie {game.game_number}
                  </h3>
                  <Chip size="sm" color={getBracketChipColor(game.bracket_name)} variant="flat">
                    {game.bracket_name.toUpperCase()}
                  </Chip>
                </div>

                {game.hasResults ? (
                  <Table aria-label={`Résultats ${game.lobby_name}`}>
                    <TableHeader>
                      <TableColumn>PLACEMENT</TableColumn>
                      <TableColumn>PSEUDO TR</TableColumn>
                      <TableColumn>POINTS</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {game.results.map((result) => (
                        <TableRow key={result.player_id}>
                          <TableCell>
                            {result.result_status === "forfeit"
                              ? "FORFAIT"
                              : result.result_status === "absent"
                              ? "ABSENT"
                              : `#${result.placement}`}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{result.player_name || "-"}</span>
                              {result.is_finalist ? (
                                <Chip size="sm" color="warning" variant="flat">
                                  Finaliste
                                </Chip>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>{result.points}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Table aria-label={`Lobby ${game.lobby_name}`}>
                    <TableHeader>
                      <TableColumn>SEED</TableColumn>
                      <TableColumn>PSEUDO TR</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {game.assignedPlayers.map((assigned) => (
                        <TableRow key={assigned.player_id}>
                          <TableCell>#{assigned.display_seed ?? assigned.seed}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{assigned.player_name || "-"}</span>
                              {assigned.is_finalist ? (
                                <Chip size="sm" color="warning" variant="flat">
                                  Finaliste
                                </Chip>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            ))}
          </div>
          )}
        </>
      ) : null}
    </div>
  );
}
