/**
 * Exemple de workflow complet du tournoi TFT
 *
 * Structure du tournoi (de 64 à 128 joueurs, multiple de 8) :
 * - Phase 1 : N joueurs (1 bracket common, N/8 lobbies)
 * - Phase 2 : N-32 joueurs (les top 32 P1 passent directement en P3 Master) (1 bracket common)
 * - Phase 3 : jusqu'à 128 joueurs (2 brackets, RESET points)
 *   - Master: jusqu'à 64 joueurs (Top 32 P1 qualifiés directement + Top 32 P2)
 *   - Amateur: taille variable selon le palier (joueurs restants de P2)
 * - Phase 4 : taille variable (2 brackets)
 *   - Master: 32 joueurs (Top 32 P3 Master)
 *   - Amateur: taille variable (RESET points) (qualifiés P3 Amateur + relégués P3 Master)
 * - Phase 5 : 24 joueurs (3 brackets)
 *   - Challenger: 8 joueurs (Top 8 P4 Master)
 *   - Master: 8 joueurs (Ranks 9-16 P4 Master)
 *   - Amateur: 8 joueurs (Top 8 P4 Amateur)
 */

import { createStandardTournament } from "./tournament-service";
import { importPlayersFromCSV } from "./player-service";
import {
  startPhase2FromPhase1,
  startPhase3FromPhase1And2,
  startPhase4FromPhase3,
  startPhase5FromPhase4,
  startPhase,
} from "./tournament-service";
import { submitGameResults } from "./game-service";
import { db } from "@/lib/db";
import { phase } from "@/models/schema";
import { asc, eq } from "drizzle-orm";
import type { PlayerCSVImport } from "@/types/tournament";

export async function exampleFullTournamentWorkflow() {
  // ============================================
  // ÉTAPE 1 : Créer le tournoi
  // ============================================
  console.log("🏆 Création du tournoi...");
  const newTournament = await createStandardTournament(
    "Tournoi TFT 2026",
    "2026",
  );
  console.log(`Tournoi créé: ${newTournament.id}`);

  // Récupérer les IDs des phases
  const phases = await db.query.phase.findMany({
    where: eq(phase.tournament_id, newTournament.id),
    orderBy: asc(phase.order_index),
  });

  const [phase1, phase2, phase3, phase4, phase5] = phases;

  // ============================================
  // ÉTAPE 2 : Importer les joueurs depuis CSV (64 à 128, multiple de 8)
  // ============================================
  console.log("📥 Import des joueurs...");
  const playersToImport: PlayerCSVImport[] = [
    {
      name: "Player 1",
      riot_id: "Player1#TAG1",
      tier: "CHALLENGER",
      division: "I",
      league_points: 1200,
      team_name: "Team Alpha",
    },
    {
      name: "Player 2",
      riot_id: "Player2#TAG2",
      tier: "GRANDMASTER",
      division: "I",
      league_points: 850,
      team_name: "Team Beta",
    },
    // ... ajouter les joueurs requis (64-128, multiple de 8)
  ];

  const importedPlayers = await importPlayersFromCSV(playersToImport);
  console.log(`${importedPlayers.length} joueurs importés`);

  const allPlayerIds = importedPlayers.map((p) => p.id);

  // ============================================
  // PHASE 1 : N joueurs, N/8 lobbies (8 joueurs par lobby)
  // ============================================
  console.log("\n📍 PHASE 1 - Démarrage...");
  const phase1Result = await startPhase(phase1.id, {
    autoSeed: true,
    playerIds: allPlayerIds,
  });

  if (!("games" in phase1Result)) {
    throw new Error("Le démarrage de la phase 1 n'a pas retourné de lobbies.");
  }

  console.log(`Phase 1: ${phase1Result.games.length} lobbies créés`);

  // Simuler les résultats des 6 games de Phase 1
  console.log("🎮 Soumission des résultats Phase 1...");
  for (let gameNumber = 1; gameNumber <= 6; gameNumber++) {
    // Pour chaque lobby...
    for (const lobby of phase1Result.games) {
      // Simuler les placements (en réalité, viennent des résultats réels)
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    console.log(`  Game ${gameNumber}/6 complété`);
  }

  // ============================================
  // PHASE 1 → PHASE 2 : Top 32 qualifiés directement pour P3, les suivants jouent P2
  // ============================================
  console.log("\n📍 PHASE 2 - Transition depuis Phase 1...");
  const phase2Result = await startPhase2FromPhase1(phase1.id, phase2.id);
  console.log(`Phase 2: ${phase2Result.games.length} lobbies créés`);
  console.log(
    `  🎯 ${phase2Result.eliminatedPlayers.length} joueurs qualifiés directement pour P3 Master (top 32 P1)`,
  );
  console.log(
    `  ✅ ${phase2Result.qualifiedPlayers.length} joueurs participent à P2 (rangs 33-128 de P1)`,
  );

  // Simuler les résultats des 6 games de Phase 2
  console.log("🎮 Soumission des résultats Phase 2...");
  for (let gameNumber = 1; gameNumber <= 6; gameNumber++) {
    for (const lobby of phase2Result.games) {
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    console.log(`  Game ${gameNumber}/6 complété`);
  }

  // ============================================
  // PHASE 2 → PHASE 3 : Split Master/Amateur avec RESET
  // ============================================
  console.log("\n📍 PHASE 3 - Transition avec split Master/Amateur...");
  const phase3Result = await startPhase3FromPhase1And2(
    phase1.id,
    phase2.id,
    phase3.id,
  );

  console.log("  🏅 Bracket MASTER:");
  console.log(`     Source: ${phase3Result.masterBracket.source}`);
  console.log(`     Joueurs: ${phase3Result.masterBracket.players.length}`);
  console.log(`     Lobbies: ${phase3Result.masterBracket.games.length}`);

  console.log("  🥈 Bracket AMATEUR:");
  console.log(`     Source: ${phase3Result.amateurBracket.source}`);
  console.log(`     Joueurs: ${phase3Result.amateurBracket.players.length}`);
  console.log(`     Lobbies: ${phase3Result.amateurBracket.games.length}`);

  // Simuler les résultats de Phase 3 (2 brackets)
  console.log("🎮 Soumission des résultats Phase 3...");
  for (let gameNumber = 1; gameNumber <= 6; gameNumber++) {
    // Master bracket
    for (const lobby of phase3Result.masterBracket.games) {
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    // Amateur bracket
    for (const lobby of phase3Result.amateurBracket.games) {
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    console.log(`  Game ${gameNumber}/6 complété (Master + Amateur)`);
  }

  // ============================================
  // PHASE 3 → PHASE 4 : Master top 32, Amateur fusion + RESET
  // ============================================
  console.log("\n📍 PHASE 4 - Transition avec relégation...");
  const phase4Result = await startPhase4FromPhase3(phase3.id, phase4.id);

  console.log("  🏅 Bracket MASTER (32 joueurs):");
  console.log(`     Source: ${phase4Result.masterBracket.source}`);
  console.log(`     Joueurs: ${phase4Result.masterBracket.players.length}`);
  console.log(`     Lobbies: ${phase4Result.masterBracket.games.length}`);

  console.log("  🥈 Bracket AMATEUR (64 joueurs, RESET):");
  console.log(`     Source: ${phase4Result.amateurBracket.source}`);
  console.log(`     Joueurs: ${phase4Result.amateurBracket.players.length}`);
  console.log(`     Lobbies: ${phase4Result.amateurBracket.games.length}`);

  // Simuler les résultats de Phase 4
  console.log("🎮 Soumission des résultats Phase 4...");
  for (let gameNumber = 1; gameNumber <= 6; gameNumber++) {
    for (const lobby of phase4Result.masterBracket.games) {
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    for (const lobby of phase4Result.amateurBracket.games) {
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    console.log(`  Game ${gameNumber}/6 complété (Master + Amateur)`);
  }

  // ============================================
  // PHASE 4 → PHASE 5 : Finales 3 brackets
  // ============================================
  console.log("\n📍 PHASE 5 - FINALES...");
  const phase5Result = await startPhase5FromPhase4(phase4.id, phase5.id);

  console.log("  🥇 Bracket CHALLENGER (8 joueurs):");
  console.log(`     Source: ${phase5Result.challengerBracket.source}`);
  console.log(`     Joueurs: ${phase5Result.challengerBracket.players.length}`);
  console.log(`     Lobbies: ${phase5Result.challengerBracket.games.length}`);

  console.log("  🏅 Bracket MASTER (8 joueurs):");
  console.log(`     Source: ${phase5Result.masterBracket.source}`);
  console.log(`     Joueurs: ${phase5Result.masterBracket.players.length}`);
  console.log(`     Lobbies: ${phase5Result.masterBracket.games.length}`);

  console.log("  🥈 Bracket AMATEUR (8 joueurs):");
  console.log(`     Source: ${phase5Result.amateurBracket.source}`);
  console.log(`     Joueurs: ${phase5Result.amateurBracket.players.length}`);
  console.log(`     Lobbies: ${phase5Result.amateurBracket.games.length}`);

  // Simuler les résultats de Phase 5 (finales)
  console.log("🎮 Soumission des résultats Phase 5 - FINALES...");
  for (let gameNumber = 1; gameNumber <= 6; gameNumber++) {
    for (const lobby of phase5Result.challengerBracket.games) {
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    for (const lobby of phase5Result.masterBracket.games) {
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    for (const lobby of phase5Result.amateurBracket.games) {
      const mockResults = generateMockGameResults(lobby.id);
      await submitGameResults(lobby.id, mockResults);
    }
    console.log(`  Game ${gameNumber}/6 complété (3 finales)`);
  }

  console.log("\n✅ Tournoi complet !");

  return {
    tournament: newTournament,
    phases: {
      phase1: phase1Result,
      phase2: phase2Result,
      phase3: phase3Result,
      phase4: phase4Result,
      phase5: phase5Result,
    },
  };
}

/**
 * Génère des résultats de game simulés (pour l'exemple)
 * En production, ces données viendraient de l'API Riot ou saisie manuelle
 */
function generateMockGameResults(gameId: string): Array<{
  player_id: string;
  placement: number;
}> {
  // Cette fonction devrait être remplacée par de vraies données
  // Pour l'exemple, on retourne un tableau vide
  return [];
}

/**
 * Résumé de la structure du tournoi
 */
export const TOURNAMENT_STRUCTURE = {
  phase1: {
    players: 128,
    brackets: ["common"],
    lobbies: 16,
    description: "Tous les joueurs",
  },
  phase2: {
    players: 96,
    brackets: ["common"],
    lobbies: 12,
    description:
      "96 derniers de Phase 1 (top 32 qualifiés directement pour P3 Master)",
  },
  phase3: {
    players: 128,
    brackets: ["master", "amateur"],
    lobbies: { master: 8, amateur: 8 },
    resetPoints: true,
    description: {
      master: "Top 32 P1 + Top 32 P2 = 64 joueurs",
      amateur: "64 derniers P2 = 64 joueurs",
    },
  },
  phase4: {
    players: 96,
    brackets: ["master", "amateur"],
    lobbies: { master: 4, amateur: 8 },
    resetPoints: { amateur: true },
    description: {
      master: "Top 32 P3 Master = 32 joueurs",
      amateur: "Top 32 P3 Amateur + 32 derniers P3 Master = 64 joueurs (RESET)",
    },
  },
  phase5: {
    players: 24,
    brackets: ["challenger", "master", "amateur"],
    lobbies: { challenger: 1, master: 1, amateur: 1 },
    description: {
      challenger: "Top 8 P4 Master = 8 joueurs",
      master: "Ranks 9-16 P4 Master = 8 joueurs",
      amateur: "Top 8 P4 Amateur = 8 joueurs",
    },
  },
} as const;
