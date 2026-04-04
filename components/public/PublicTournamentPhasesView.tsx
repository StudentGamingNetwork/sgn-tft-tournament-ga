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

type RankTabKey = "rank-global" | "rank-master" | "rank-amateur" | "rank-challenger";

function getGlobalRankOffset(phaseOrder: number, tab: RankTabKey): number {
  if (phaseOrder === 3) {
    if (tab === "rank-amateur") return 32;
    return 0;
  }

  if (phaseOrder === 4) {
    if (tab === "rank-amateur") return 16;
    return 0;
  }

  if (phaseOrder === 5) {
    if (tab === "rank-master") return 8;
    if (tab === "rank-amateur") return 16;
    return 0;
  }

  return 0;
}

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
  const [selectedSubTab, setSelectedSubTab] = useState<RankTabKey | `game-${number}`>("rank-global");
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

  const rankTabs = useMemo(() => {
    if (!phaseDetails) {
      return [{ key: "rank-global", title: "Rank global" }] as Array<{
        key: RankTabKey;
        title: string;
      }>;
    }

    const tabs: Array<{ key: RankTabKey; title: string }> = [
      { key: "rank-global", title: "Rank global" },
    ];

    if (phaseDetails.phase.order_index >= 3) {
      tabs.push({ key: "rank-master", title: "Rank master" });
      tabs.push({ key: "rank-amateur", title: "Rank amateur" });
    }

    if (phaseDetails.phase.order_index >= 5) {
      tabs.push({ key: "rank-challenger", title: "Rank challenger" });
    }

    return tabs;
  }, [phaseDetails]);

  const participantsByRankTab = useMemo(() => {
    const empty: Record<RankTabKey, PhaseDetails["participants"]> = {
      "rank-global": [],
      "rank-master": [],
      "rank-amateur": [],
      "rank-challenger": [],
    };

    if (!phaseDetails) {
      return empty;
    }

    const sortedParticipants = [...phaseDetails.participants].sort(
      (a, b) => a.current_rank - b.current_rank,
    );

    const playerBracketMap = new Map<string, string>();
    for (const game of phaseDetails.games) {
      for (const player of game.assignedPlayers) {
        playerBracketMap.set(player.player_id, game.bracket_name.toLowerCase());
      }
      for (const result of game.results) {
        if (!playerBracketMap.has(result.player_id)) {
          playerBracketMap.set(result.player_id, game.bracket_name.toLowerCase());
        }
      }
    }

    const master = sortedParticipants.filter(
      (player) => playerBracketMap.get(player.player_id) === "master",
    );
    const amateur = sortedParticipants.filter(
      (player) => playerBracketMap.get(player.player_id) === "amateur",
    );
    const challenger = sortedParticipants.filter(
      (player) => playerBracketMap.get(player.player_id) === "challenger",
    );

    const phaseOrder = phaseDetails.phase.order_index;

    let global = sortedParticipants;
    if (phaseOrder === 3) {
      global = [...master, ...amateur];
    } else if (phaseOrder === 4) {
      global = [...master, ...amateur];
    } else if (phaseOrder === 5) {
      global = [...challenger, ...master, ...amateur];
    }

    return {
      "rank-global": global,
      "rank-master": master,
      "rank-amateur": amateur,
      "rank-challenger": challenger,
    };
  }, [phaseDetails]);

  const cutoffByRankTab = useMemo(() => {
    const noCutoff: Record<RankTabKey, null | {
      cutoffAfterIndex: number;
      className: string;
    }> = {
      "rank-global": null,
      "rank-master": null,
      "rank-amateur": null,
      "rank-challenger": null,
    };

    if (!phaseDetails) {
      return noCutoff;
    }

    const phaseOrder = phaseDetails.phase.order_index;
    const configuredCutoffByTab: Partial<Record<RankTabKey, number>> = {
      "rank-global": phaseOrder === 1 || phaseOrder === 2 ? 16 : undefined,
      "rank-master": phaseOrder === 3 ? 16 : phaseOrder === 4 ? 8 : undefined,
      "rank-amateur": phaseOrder === 3 ? 8 : phaseOrder === 4 ? 8 : undefined,
      "rank-challenger": phaseOrder === 5 ? 8 : undefined,
    };

    for (const tab of Object.keys(noCutoff) as RankTabKey[]) {
      const cutoffRank = configuredCutoffByTab[tab];
      const listLength = participantsByRankTab[tab].length;

      if (!cutoffRank || listLength <= cutoffRank) {
        continue;
      }

      const isRedCutoff =
        tab === "rank-amateur" && (phaseOrder === 3 || phaseOrder === 4);

      noCutoff[tab] = {
        cutoffAfterIndex: cutoffRank - 1,
        className: isRedCutoff ? "bg-danger-500" : "bg-success-500",
      };
    }

    return noCutoff;
  }, [phaseDetails, participantsByRankTab]);

  useEffect(() => {
    const hasTab =
      rankTabs.some((tab) => tab.key === selectedSubTab) ||
      filteredGamesByNumber.some((group) => `game-${group.gameNumber}` === selectedSubTab);

    if (hasTab) {
      return;
    }

    setSelectedSubTab("rank-global");
  }, [filteredGamesByNumber, rankTabs, selectedSubTab]);

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
              setSelectedSubTab("rank-global");
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
            setSelectedSubTab("rank-global");
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
                    defaultSelectedKey="rank-global"
                    onSelectionChange={(key) => {
                      const nextKey = String(key);

                      if (nextKey.startsWith("game-")) {
                        setSelectedSubTab(nextKey as `game-${number}`);
                        return;
                      }

                      setSelectedSubTab(nextKey as RankTabKey);
                    }}
                    color="secondary"
                    variant="bordered"
                  >
                    {rankTabs.map((rankTab) => (
                      <Tab key={rankTab.key} title={rankTab.title}>
                        <Card className="p-4 border border-divider">
                          {participantsByRankTab[rankTab.key].length === 0 ? (
                            <p className="text-default-500">Aucun classement disponible.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <Table aria-label="Classement de la phase" className="min-w-[1100px] whitespace-nowrap">
                                <TableHeader>
                                  <TableColumn>RANK GLOBAL</TableColumn>
                                  <TableColumn>PSEUDO TR</TableColumn>
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
                                  {participantsByRankTab[rankTab.key].flatMap((player, index) => {
                                    const displayedGlobalRank =
                                      index +
                                      1 +
                                      getGlobalRankOffset(
                                        phaseDetails.phase.order_index,
                                        rankTab.key,
                                      );

                                    const rows = [
                                      <TableRow key={player.player_id}>
                                        <TableCell>#{displayedGlobalRank}</TableCell>
                                        <TableCell>{player.player_name || "-"}</TableCell>
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
                                      </TableRow>,
                                    ];

                                    const cutoffConfig = cutoffByRankTab[rankTab.key];

                                    if (cutoffConfig && index === cutoffConfig.cutoffAfterIndex) {
                                      rows.push(
                                        <TableRow key={`cutoff-${rankTab.key}-${index}`}>
                                          <TableCell colSpan={12} className="p-0">
                                            <div className={`h-[3px] w-full ${cutoffConfig.className}`} />
                                          </TableCell>
                                        </TableRow>,
                                      );
                                    }

                                    return rows;
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </Card>
                      </Tab>
                    ))}

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
                                    <TableColumn>PSEUDO TR</TableColumn>
                                    <TableColumn>POINTS</TableColumn>
                                  </TableHeader>
                                  <TableBody>
                                    {game.results.map((result) => (
                                      <TableRow key={result.player_id}>
                                        <TableCell>#{result.placement}</TableCell>
                                        <TableCell>{result.player_name || "-"}</TableCell>
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
                                    {game.assignedPlayers.map((player) => (
                                      <TableRow key={player.player_id}>
                                        <TableCell>#{player.seed}</TableCell>
                                        <TableCell>{player.player_name || "-"}</TableCell>
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
