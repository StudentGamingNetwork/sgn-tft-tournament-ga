"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@heroui/card";
import { Select, SelectItem } from "@heroui/select";

import { getTournaments } from "@/app/actions/tournaments";
import { ResultsTab } from "@/components/admin/tournament-tabs/ResultsTab";

export function PublicLeaderboardView() {
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");
  const selectedTournamentKeys = useMemo(
    () => (selectedTournamentId ? new Set([selectedTournamentId]) : new Set<string>()),
    [selectedTournamentId],
  );

  const {
    data: tournaments,
    isLoading,
    error,
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

  if (isLoading) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Classements publics</h1>
        <p className="text-default-500 mt-3">Chargement des tournois...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Classements publics</h1>
        <p className="text-danger mt-3">
          Erreur lors du chargement des tournois.
        </p>
      </Card>
    );
  }

  if (!sortedTournaments.length) {
    return (
      <Card className="p-6 mt-4 border border-divider">
        <h1 className="text-2xl font-bold">Classements publics</h1>
        <p className="text-default-500 mt-3">Aucun tournoi disponible.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 border border-divider bg-secondary">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Classements publics</h1>
            <p className="text-default-500 text-sm">
              Consultez les classements globaux mis à jour en temps réel.
            </p>
          </div>

          <div className="w-full md:w-80">
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
              }}
            >
              {sortedTournaments.map((t) => (
                <SelectItem key={t.id} textValue={`${t.name} (${t.year})`}>
                  {t.name} ({t.year})
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {selectedTournamentId ? (
        <ResultsTab tournamentId={selectedTournamentId} />
      ) : null}
    </div>
  );
}
