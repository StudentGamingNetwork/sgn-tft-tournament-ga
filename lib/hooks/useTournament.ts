import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTournamentPlayers,
  getTournamentPhases,
  getTournamentGlobalResults,
  unregisterPlayerFromTournament,
  updateRegistrationStatus,
  confirmAllPlayersInTournament,
  unconfirmAllPlayersInTournament,
  unregisterAllPlayersFromTournament,
  deletePhase,
  startPhase1Action,
  startNextPhaseAction,
} from "@/app/actions/tournaments";

// Query Keys
export const tournamentKeys = {
  all: ["tournaments"] as const,
  detail: (id: string) => [...tournamentKeys.all, id] as const,
  players: (id: string) => [...tournamentKeys.detail(id), "players"] as const,
  phases: (id: string) => [...tournamentKeys.detail(id), "phases"] as const,
  results: (id: string) => [...tournamentKeys.detail(id), "results"] as const,
};

// Hook pour récupérer les joueurs d'un tournoi
export function useTournamentPlayers(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.players(tournamentId),
    queryFn: () => getTournamentPlayers(tournamentId),
  });
}

// Hook pour récupérer les phases d'un tournoi
export function useTournamentPhases(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.phases(tournamentId),
    queryFn: () => getTournamentPhases(tournamentId),
  });
}

// Hook pour récupérer les résultats globaux avec auto-refresh
export function useTournamentGlobalResults(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.results(tournamentId),
    queryFn: () => getTournamentGlobalResults(tournamentId),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
}

// Hook pour désinscrire un joueur
export function useUnregisterPlayer(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) =>
      unregisterPlayerFromTournament(tournamentId, playerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.players(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.results(tournamentId),
      });
    },
  });
}

// Hook pour confirmer/déconfirmer un joueur
export function useUpdateRegistrationStatus(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      playerId,
      status,
    }: {
      playerId: string;
      status: "confirmed" | "registered";
    }) => updateRegistrationStatus(tournamentId, playerId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.players(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.results(tournamentId),
      });
    },
  });
}

// Hook pour confirmer tous les joueurs
export function useConfirmAllPlayers(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => confirmAllPlayersInTournament(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.players(tournamentId),
      });
    },
  });
}

// Hook pour dévalider tous les joueurs
export function useUnconfirmAllPlayers(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => unconfirmAllPlayersInTournament(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.players(tournamentId),
      });
    },
  });
}

// Hook pour supprimer tous les joueurs
export function useUnregisterAllPlayers(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => unregisterAllPlayersFromTournament(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.players(tournamentId),
      });
    },
  });
}

// Hook pour supprimer une phase
export function useDeletePhase(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (phaseId: string) => deletePhase(phaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.phases(tournamentId),
      });
    },
  });
}

// Hook pour démarrer une phase
export function useStartPhase(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (phaseId: string) => startPhase1Action(phaseId, tournamentId),
    onSuccess: () => {
      // Invalider à la fois les phases et les joueurs (car les joueurs sont assignés)
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.phases(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.players(tournamentId),
      });
    },
  });
}

// Hook pour démarrer la prochaine phase éligible
export function useStartNextPhase(tournamentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => startNextPhaseAction(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.phases(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.players(tournamentId),
      });
    },
  });
}

// Hook pour invalider les queries après ajout/modification
export function useInvalidateTournamentData(tournamentId: string) {
  const queryClient = useQueryClient();

  return {
    invalidatePlayers: () =>
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.players(tournamentId),
      }),
    invalidatePhases: () =>
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.phases(tournamentId),
      }),
    invalidateResults: () =>
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.results(tournamentId),
      }),
  };
}
