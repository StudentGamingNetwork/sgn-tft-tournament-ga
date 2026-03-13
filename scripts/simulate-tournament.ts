/**
 * Script interactif pour simuler un tournoi TFT complet
 * Permet d'exécuter les actions une par une et de voir l'évolution sur l'interface
 *
 * Usage: npm run simulate
 */

// Charger les variables d'environnement depuis le fichier .env
import "dotenv/config";

import * as readline from "readline";
import { createDbConnection } from "@/utils/dbConnection";
import {
  createStandardTournament,
  startPhase2FromPhase1,
  startPhase3FromPhase1And2,
  startPhase4FromPhase3,
  continuePhase4MasterBracket,
  startPhase5FromPhase4,
} from "@/lib/services/tournament-service";
import { createPlayer } from "@/lib/services/player-service";
import { submitGameResults } from "@/lib/services/game-service";
import {
  getLeaderboard,
  getCumulativeLeaderboard,
} from "@/lib/services/scoring-service";
import { seedAndCreateFirstGame } from "@/lib/services/seeding-service";
import type { GameResult } from "@/types/tournament";
import { db } from "@/lib/db";
import {
  tournament,
  phase,
  game,
  player,
  tournamentRegistration,
  bracket,
} from "@/models/schema";
import { eq, and } from "drizzle-orm";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// État du tournoi (sauvegardé en mémoire durant l'exécution)
let currentTournamentId: string | null = null;
let currentPhaseId: string | null = null;
let playerIds: string[] = [];

// Couleurs pour la console
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function displayMenu() {
  console.clear();
  log("\n╔═══════════════════════════════════════════════╗", "cyan");
  log("║   SIMULATEUR DE TOURNOI TFT - Saison 2026    ║", "cyan");
  log("╚═══════════════════════════════════════════════╝\n", "cyan");

  if (currentTournamentId) {
    log(
      `📋 Tournoi actif: ID ${currentTournamentId.substring(0, 8)}...`,
      "green",
    );
    if (currentPhaseId) {
      const phaseData = await db.query.phase.findFirst({
        where: eq(phase.id, currentPhaseId),
        with: {
          games: {
            with: {
              results: true,
            },
          },
        },
      });

      if (phaseData) {
        const totalGames = phaseData.games.length;
        const completedGames = phaseData.games.filter(
          (g) => g.results && g.results.length > 0,
        ).length;

        log(
          `🎯 Phase active: Phase ${phaseData.order_index} - ${phaseData.name}`,
          "green",
        );
        log(
          `   ├─ Progression: ${completedGames}/${totalGames} jeux terminés`,
          "green",
        );
      }
    }
    log("");
  }

  log("Actions disponibles:", "bright");
  log("1️⃣  - Créer un nouveau tournoi", "blue");
  log("S - Sélectionner un tournoi existant", "blue");
  log("2️⃣  - Générer et ajouter 128 joueurs", "blue");
  log("3️⃣  - Démarrer la Phase 1", "blue");
  log("4️⃣  - Soumettre les résultats d'un jeu", "blue");
  log("5️⃣  - Voir le leaderboard actuel", "blue");
  log("6️⃣  - Passer à la phase suivante", "blue");
  log("T - Démarrer une phase spécifique (2-5)", "blue");
  log("M - Continuer Phase 4 Master Bracket (games 3-4 avec top 16)", "blue");
  log("7️⃣  - Voir tous les jeux de la phase", "blue");
  log("8️⃣  - Soumettre tous les résultats d'un jeu (aléatoire)", "blue");
  log("9️⃣  - Terminer tous les jeux de la phase (automatique)", "blue");
  log("🅰️  - Terminer tous les jeux d'un game number", "blue");
  log("0️⃣  - Informations sur le tournoi", "blue");
  log("q  - Quitter\n", "red");

  const choice = await question("Votre choix: ");
  return choice.trim();
}

async function createTournamentAction() {
  log("\n🏆 Création d'un nouveau tournoi...", "yellow");

  const name = await question("Nom du tournoi (ex: Championnat TFT): ");
  const year = new Date().getFullYear().toString();

  const result = await createStandardTournament(
    name || "Tournoi Simulation",
    year,
  );

  currentTournamentId = result.id;
  // Récupérer la première phase
  const phases = await db.query.phase.findMany({
    where: eq(phase.tournament_id, currentTournamentId!),
    orderBy: (phase, { asc }) => [asc(phase.order_index)],
  });
  if (phases.length > 0) {
    currentPhaseId = phases[0].id;
  }

  log(`\n✅ Tournoi créé avec succès!`, "green");
  log(`   ID: ${currentTournamentId}`, "green");
  log(`   ${phases.length} phases créées`, "green");

  await pause();
}

async function selectExistingTournamentAction() {
  log("\n🔍 Sélection d'un tournoi existant...", "yellow");

  // Récupérer tous les tournois
  const tournaments = await db.query.tournament.findMany({
    with: {
      phases: true,
      registrations: true,
    },
    orderBy: (tournament, { desc }) => [desc(tournament.createdAt)],
  });

  if (tournaments.length === 0) {
    log("\n❌ Aucun tournoi trouvé dans la base de données!", "red");
    await pause();
    return;
  }

  log("\n📋 Tournois disponibles:\n", "bright");

  tournaments.forEach((t, idx) => {
    const playerCount = t.registrations.length;
    const phaseCount = t.phases.length;
    log(`${idx + 1}. ${t.name} (${t.year}) - ${t.status}`, "cyan");
    log(
      `   ID: ${t.id.substring(0, 8)}... | ${playerCount} joueurs | ${phaseCount} phases`,
      "cyan",
    );
    log("", "reset");
  });

  const input = await question(
    "\nEntrez le numéro ou l'ID complet du tournoi: ",
  );

  let selectedTournament;

  // Vérifier si c'est un numéro de liste
  const tournamentIndex = parseInt(input.trim());
  if (
    !isNaN(tournamentIndex) &&
    tournamentIndex > 0 &&
    tournamentIndex <= tournaments.length
  ) {
    selectedTournament = tournaments[tournamentIndex - 1];
  } else {
    // Sinon, chercher par ID
    selectedTournament = tournaments.find((t) => t.id.startsWith(input.trim()));
  }

  if (!selectedTournament) {
    log("\n❌ Tournoi non trouvé!", "red");
    await pause();
    return;
  }

  currentTournamentId = selectedTournament.id;

  // Récupérer la première phase ou la dernière phase active
  const phases = await db.query.phase.findMany({
    where: eq(phase.tournament_id, currentTournamentId),
    orderBy: (phase, { asc }) => [asc(phase.order_index)],
    with: {
      games: {
        with: {
          results: true,
        },
      },
    },
  });

  // Trouver la première phase incomplète ou la dernière phase
  const incompletePhase = phases.find((p) => {
    const allGames = p.games;
    const completedGames = allGames.filter(
      (g) => g.results && g.results.length > 0,
    );
    return completedGames.length < allGames.length || allGames.length === 0;
  });

  currentPhaseId = incompletePhase
    ? incompletePhase.id
    : phases[phases.length - 1]?.id || null;

  // Charger les IDs des joueurs inscrits
  const registrations = await db.query.tournamentRegistration.findMany({
    where: eq(tournamentRegistration.tournament_id, currentTournamentId),
  });
  playerIds = registrations.map((r) => r.player_id);

  log(`\n✅ Tournoi sélectionné: ${selectedTournament.name}`, "green");
  log(`   ID: ${currentTournamentId}`, "green");
  log(`   ${playerIds.length} joueurs inscrits`, "green");
  if (currentPhaseId) {
    const currentPhase = phases.find((p) => p.id === currentPhaseId);
    log(`   Phase active: ${currentPhase?.name}`, "green");
  }

  await pause();
}

async function generatePlayersAction() {
  if (!currentTournamentId) {
    log("\n❌ Veuillez d'abord créer un tournoi!", "red");
    await pause();
    return;
  }

  log("\n👥 Génération de 128 joueurs...", "yellow");

  const tiers: Array<
    | "IRON"
    | "BRONZE"
    | "SILVER"
    | "GOLD"
    | "PLATINUM"
    | "EMERALD"
    | "DIAMOND"
    | "MASTER"
    | "GRANDMASTER"
    | "CHALLENGER"
  > = [
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
  ];
  const divisions: Array<"I" | "II" | "III" | "IV"> = ["I", "II", "III", "IV"];

  playerIds = [];

  for (let i = 0; i < 128; i++) {
    const tierIndex = Math.floor(Math.random() * tiers.length);
    const tier = tiers[tierIndex];
    const division =
      tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER"
        ? undefined
        : divisions[Math.floor(Math.random() * divisions.length)];
    const league_points = Math.floor(Math.random() * 100);

    const newPlayer = await createPlayer({
      name: `Player ${i + 1}`,
      riot_id: `player${i + 1}#${Math.floor(1000 + Math.random() * 9000)}`,
      tier,
      division,
      league_points,
      discord_tag: `player${i + 1}#${Math.floor(1000 + Math.random() * 9000)}`,
    });

    // Enregistrer le joueur au tournoi
    await db.insert(tournamentRegistration).values({
      tournament_id: currentTournamentId!,
      player_id: newPlayer.id,
      status: "confirmed",
    });

    playerIds.push(newPlayer.id);

    if ((i + 1) % 20 === 0) {
      log(`   Créés: ${i + 1}/128`, "cyan");
    }
  }

  log(`\n✅ 128 joueurs créés et enregistrés au tournoi!`, "green");
  await pause();
}

async function startPhase1Action() {
  if (!currentTournamentId || !currentPhaseId) {
    log("\n❌ Veuillez d'abord créer un tournoi!", "red");
    await pause();
    return;
  }

  log("\n🚀 Démarrage de la Phase 1...", "yellow");

  try {
    // Obtenir le bracket de la phase 1
    const brackets = await db.query.bracket.findMany({
      where: eq(bracket.phase_id, currentPhaseId),
    });

    if (brackets.length === 0) {
      throw new Error("Aucun bracket trouvé pour cette phase");
    }

    const firstBracket = brackets[0];

    // Seed et créer le premier jeu
    await seedAndCreateFirstGame(currentPhaseId, firstBracket.id, playerIds);

    log(
      "\n✅ Phase 1 démarrée! Les joueurs ont été répartis dans les lobbies.",
      "green",
    );

    // Afficher les jeux créés
    const games = await db.query.game.findMany({
      where: eq(game.phase_id, currentPhaseId),
    });
    log(`   ${games.length} jeux créés pour cette phase`, "cyan");
  } catch (error: any) {
    log(`\n❌ Erreur: ${error.message}`, "red");
  }

  await pause();
}

async function viewGamesAction() {
  if (!currentPhaseId) {
    log("\n❌ Aucune phase active!", "red");
    await pause();
    return;
  }

  const games = await db.query.game.findMany({
    where: eq(game.phase_id, currentPhaseId),
    with: {
      results: true,
    },
    orderBy: (game, { asc }) => [asc(game.game_number), asc(game.lobby_name)],
  });

  log(`\n📋 Jeux de la phase (${games.length} total):\n`, "bright");

  for (const g of games) {
    const hasResults = g.results && g.results.length > 0;
    const status = hasResults ? "✅" : g.status === "ongoing" ? "🟡" : "⚪";
    log(
      `${status} Game #${g.game_number} - ${g.lobby_name} - ${g.status}`,
      "cyan",
    );
  }

  await pause();
}

async function submitGameResultsAction() {
  if (!currentPhaseId) {
    log("\n❌ Aucune phase active!", "red");
    await pause();
    return;
  }

  // Trouver un jeu sans résultats
  const games = await db.query.game.findMany({
    where: eq(game.phase_id, currentPhaseId),
    with: {
      results: true,
      lobbyPlayers: {
        with: {
          player: true,
        },
      },
    },
  });

  const gameWithoutResults = games.find(
    (g) => !g.results || g.results.length === 0,
  );

  if (!gameWithoutResults) {
    log("\n❌ Tous les jeux ont déjà des résultats!", "red");
    await pause();
    return;
  }

  log(
    `\n🎮 Soumission des résultats pour: Game #${gameWithoutResults.game_number} - ${gameWithoutResults.lobby_name}`,
    "yellow",
  );
  log("\nJoueurs dans ce lobby:", "cyan");

  gameWithoutResults.lobbyPlayers.forEach((lp, idx) => {
    if (lp.player) {
      log(`   ${idx + 1}. ${lp.player.name} (${lp.player.riot_id})`, "cyan");
    }
  });

  log("\n💡 Entrez les placements (1-8) pour chaque joueur:", "bright");
  log(
    "   Format: 1,2,3,4,5,6,7,8 (ou appuyez sur Entrée pour générer aléatoirement)\n",
    "yellow",
  );

  const input = await question("Placements: ");

  let placements: number[];

  if (input.trim() === "") {
    // Génération aléatoire
    placements = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);
    log("   Placements aléatoires générés!", "cyan");
  } else {
    placements = input.split(",").map((p) => parseInt(p.trim()));
  }

  const results: GameResult[] = gameWithoutResults.lobbyPlayers
    .filter((lp) => lp.player_id !== null)
    .map((lp, idx) => ({
      player_id: lp.player_id!,
      placement: placements[idx],
    }));

  try {
    await submitGameResults(gameWithoutResults.id, results);
    log("\n✅ Résultats soumis avec succès!", "green");
  } catch (error: any) {
    log(`\n❌ Erreur: ${error.message}`, "red");
  }

  await pause();
}

async function submitRandomResultsAction() {
  if (!currentPhaseId) {
    log("\n❌ Aucune phase active!", "red");
    await pause();
    return;
  }

  const games = await db.query.game.findMany({
    where: eq(game.phase_id, currentPhaseId),
    with: {
      results: true,
      lobbyPlayers: true,
    },
  });

  const gameWithoutResults = games.find(
    (g) => !g.results || g.results.length === 0,
  );

  if (!gameWithoutResults) {
    log("\n❌ Tous les jeux ont déjà des résultats!", "red");
    await pause();
    return;
  }

  log(
    `\n🎲 Génération de résultats aléatoires pour: Game #${gameWithoutResults.game_number} - ${gameWithoutResults.lobby_name}`,
    "yellow",
  );

  const placements = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);

  const results: GameResult[] = gameWithoutResults.lobbyPlayers
    .filter((lp) => lp.player_id)
    .map((lp, idx) => ({
      player_id: lp.player_id!,
      placement: placements[idx],
    }));

  try {
    await submitGameResults(gameWithoutResults.id, results);
    log("\n✅ Résultats aléatoires soumis avec succès!", "green");
  } catch (error: any) {
    log(`\n❌ Erreur: ${error.message}`, "red");
  }

  await pause();
}

async function completeAllGamesAction() {
  if (!currentPhaseId) {
    log("\n❌ Aucune phase active!", "red");
    await pause();
    return;
  }

  log("\n⚡ Génération automatique de tous les résultats...", "yellow");

  const games = await db.query.game.findMany({
    where: eq(game.phase_id, currentPhaseId),
    with: {
      results: true,
      lobbyPlayers: true,
    },
  });

  let completed = 0;

  for (const game of games) {
    if (game.results && game.results.length > 0) {
      continue; // Skip games with results
    }

    const placements = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);

    const results: GameResult[] = game.lobbyPlayers
      .filter((lp) => lp.player_id)
      .map((lp, idx) => ({
        player_id: lp.player_id!,
        placement: placements[idx],
      }));

    try {
      await submitGameResults(game.id, results);
      completed++;
      log(
        `   ✅ Game #${game.game_number} - ${game.lobby_name} terminé`,
        "green",
      );
    } catch (error: any) {
      log(
        `   ❌ Erreur pour Game #${game.game_number}: ${error.message}`,
        "red",
      );
    }
  }

  log(`\n✅ ${completed} jeux complétés automatiquement!`, "green");
  await pause();
}

async function completeGameNumberAction() {
  if (!currentPhaseId) {
    log("\n❌ Aucune phase active!", "red");
    await pause();
    return;
  }

  log("\n🎲 Compléter tous les jeux d'un game number...", "yellow");

  // Récupérer tous les jeux de la phase
  const allGames = await db.query.game.findMany({
    where: eq(game.phase_id, currentPhaseId),
    with: {
      results: true,
      lobbyPlayers: true,
    },
    orderBy: (game, { asc }) => [asc(game.game_number)],
  });

  // Trouver les game numbers disponibles
  const gameNumbers = [...new Set(allGames.map((g) => g.game_number))].sort(
    (a, b) => a - b,
  );

  if (gameNumbers.length === 0) {
    log("\n❌ Aucun jeu trouvé dans cette phase!", "red");
    await pause();
    return;
  }

  log("\nGame numbers disponibles:", "cyan");
  gameNumbers.forEach((num) => {
    const gamesForNumber = allGames.filter((g) => g.game_number === num);
    const completedCount = gamesForNumber.filter(
      (g) => g.results && g.results.length > 0,
    ).length;
    log(
      `  Game #${num}: ${completedCount}/${gamesForNumber.length} lobbies terminés`,
      "cyan",
    );
  });

  const input = await question("\nEntrez le numéro du game à compléter: ");
  const selectedGameNumber = parseInt(input.trim());

  if (isNaN(selectedGameNumber) || !gameNumbers.includes(selectedGameNumber)) {
    log("\n❌ Numéro de game invalide!", "red");
    await pause();
    return;
  }

  // Filtrer les jeux de ce game number sans résultats
  const gamesToComplete = allGames.filter(
    (g) =>
      g.game_number === selectedGameNumber &&
      (!g.results || g.results.length === 0),
  );

  if (gamesToComplete.length === 0) {
    log(
      `\n✅ Tous les lobbies du Game #${selectedGameNumber} ont déjà des résultats!`,
      "green",
    );
    await pause();
    return;
  }

  log(
    `\n⚡ Génération de résultats pour ${gamesToComplete.length} lobbies du Game #${selectedGameNumber}...`,
    "yellow",
  );

  let completed = 0;

  for (const game of gamesToComplete) {
    const placements = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);

    const results: GameResult[] = game.lobbyPlayers
      .filter((lp) => lp.player_id)
      .map((lp, idx) => ({
        player_id: lp.player_id!,
        placement: placements[idx],
      }));

    try {
      await submitGameResults(game.id, results);
      completed++;
      log(`   ✅ ${game.lobby_name} terminé`, "green");
    } catch (error: any) {
      log(`   ❌ Erreur pour ${game.lobby_name}: ${error.message}`, "red");
    }
  }

  log(
    `\n✅ ${completed} lobbies complétés pour le Game #${selectedGameNumber}!`,
    "green",
  );
  await pause();
}

async function viewLeaderboardAction() {
  if (!currentPhaseId) {
    log("\n❌ Aucune phase active!", "red");
    await pause();
    return;
  }

  log("\n📊 Chargement du leaderboard...", "yellow");

  const leaderboard = await getLeaderboard(currentPhaseId);

  log(`\n🏆 LEADERBOARD (Top 20):\n`, "bright");
  log("Rang | Joueur              | Points | Jeux", "cyan");
  log("-----|---------------------|--------|------", "cyan");

  leaderboard.slice(0, 20).forEach((entry, idx) => {
    log(
      `${(idx + 1).toString().padStart(4)} | ${entry.player_name.padEnd(19)} | ${entry.total_points.toString().padStart(6)} | ${entry.games_played}`,
      "cyan",
    );
  });

  await pause();
}

async function moveToNextPhaseAction() {
  if (!currentTournamentId || !currentPhaseId) {
    log("\n❌ Veuillez d'abord créer un tournoi et démarrer une phase!", "red");
    await pause();
    return;
  }

  log("\n🔄 Passage à la phase suivante...", "yellow");

  try {
    // Vérifier que tous les jeux sont terminés
    const games = await db.query.game.findMany({
      where: eq(game.phase_id, currentPhaseId),
      with: {
        results: true,
      },
    });

    const incompleteGames = games.filter(
      (g) => !g.results || g.results.length === 0,
    );

    if (incompleteGames.length > 0) {
      log(
        `\n⚠️  Il reste ${incompleteGames.length} jeux sans résultats.`,
        "yellow",
      );
      const confirm = await question(
        "Voulez-vous quand même continuer? (o/n): ",
      );
      if (confirm.toLowerCase() !== "o") {
        log("Opération annulée.", "red");
        await pause();
        return;
      }
    }

    // Trouver la phase suivante
    const currentPhase = await db.query.phase.findFirst({
      where: eq(phase.id, currentPhaseId),
    });

    if (!currentPhase) {
      log("\n❌ Phase actuelle non trouvée!", "red");
      await pause();
      return;
    }

    const phases = await db.query.phase.findMany({
      where: eq(phase.tournament_id, currentTournamentId),
      orderBy: (phase, { asc }) => [asc(phase.order_index)],
    });

    const nextPhase = phases.find(
      (p) => p.order_index === currentPhase.order_index + 1,
    );

    if (!nextPhase) {
      log("\n🎉 C'était la dernière phase! Le tournoi est terminé!", "green");
      await pause();
      return;
    }

    // Logique spécifique selon la phase
    if (nextPhase.order_index === 2) {
      // Phase 2: Prendre les 96 derniers de la phase 1
      log("   Sélection des 96 derniers de la Phase 1...", "cyan");
      const leaderboard = await getLeaderboard(currentPhaseId);
      const phase2Leaderboard = leaderboard.slice(32, 128);

      const brackets = await db.query.bracket.findMany({
        where: eq(bracket.phase_id, nextPhase.id),
      });

      // IMPORTANT: Utiliser seedAndCreateFirstGameFromLeaderboard pour que le seeding
      // soit basé sur le classement de Phase 1, pas sur les tier/LP Riot initiaux
      const { seedAndCreateFirstGameFromLeaderboard } = await import(
        "@/lib/services/seeding-service"
      );
      await seedAndCreateFirstGameFromLeaderboard(
        nextPhase.id,
        brackets[0].id,
        phase2Leaderboard,
      );
    } else if (nextPhase.order_index === 3) {
      // Phase 3: Split Master/Amateur
      log(
        "   Séparation Master/Amateur basée sur les phases 1 et 2...",
        "cyan",
      );
      const phase1 = phases.find((p) => p.order_index === 1);
      if (phase1) {
        const result = await startPhase3FromPhase1And2(
          phase1.id,
          currentPhaseId,
          nextPhase.id,
        );
        log(
          `   🏅 Master: ${result.masterBracket.players.length} joueurs`,
          "green",
        );
        log(
          `   🥈 Amateur: ${result.amateurBracket.players.length} joueurs`,
          "green",
        );
      }
    } else if (nextPhase.order_index === 4) {
      // Phase 4: Master/Amateur avec relégation
      log("   Transition vers Phase 4 avec relégation...", "cyan");
      const phase3 = phases.find((p) => p.order_index === 3);
      if (phase3) {
        const result = await startPhase4FromPhase3(phase3.id, nextPhase.id);
        log(
          `   🏅 Master: ${result.masterBracket.players.length} joueurs`,
          "green",
        );
        log(
          `   🥈 Amateur: ${result.amateurBracket.players.length} joueurs (RESET)`,
          "green",
        );
      }
    } else if (nextPhase.order_index === 5) {
      // Phase 5: Finales
      log("   Transition vers les FINALES...", "cyan");
      const phase4 = phases.find((p) => p.order_index === 4);
      if (phase4) {
        const result = await startPhase5FromPhase4(phase4.id, nextPhase.id);
        log(
          `   🏆 Challenger: ${result.challengerBracket.players.length} joueurs`,
          "green",
        );
        log(
          `   🏅 Master: ${result.masterBracket.players.length} joueurs`,
          "green",
        );
        log(
          `   🥈 Amateur: ${result.amateurBracket.players.length} joueurs`,
          "green",
        );
      }
    } else {
      // Phases suivantes: Logique simplifiée pour la démo
      log(
        "   ⚠️  Transition automatique non implémentée pour cette phase",
        "yellow",
      );
      log(
        "   Vous devrez gérer manuellement la sélection des joueurs.",
        "yellow",
      );
    }

    currentPhaseId = nextPhase.id;

    log(`\n✅ Phase ${nextPhase.name} démarrée!`, "green");
  } catch (error: any) {
    log(`\n❌ Erreur: ${error.message}`, "red");
    console.error(error);
  }

  await pause();
}

async function viewTournamentInfoAction() {
  if (!currentTournamentId) {
    log("\n❌ Aucun tournoi actif!", "red");
    await pause();
    return;
  }

  const tournamentData = await db.query.tournament.findFirst({
    where: eq(tournament.id, currentTournamentId),
    with: {
      phases: {
        with: {
          brackets: true,
          games: {
            with: {
              results: true,
            },
          },
        },
      },
    },
  });

  if (!tournamentData) {
    log("\n❌ Tournoi non trouvé!", "red");
    await pause();
    return;
  }

  log("\n📋 INFORMATIONS DU TOURNOI\n", "bright");
  log(`Nom: ${tournamentData.name}`, "cyan");
  log(`Année: ${tournamentData.year}`, "cyan");
  log(`Statut: ${tournamentData.status}\n`, "cyan");

  log("Phases:", "bright");
  for (const ph of tournamentData.phases) {
    const totalGames = ph.games.length;
    const completedGames = ph.games.filter(
      (g) => g.results && g.results.length > 0,
    ).length;
    log(`  ${ph.name}: ${completedGames}/${totalGames} jeux terminés`, "cyan");
    log(`    Brackets: ${ph.brackets.map((b) => b.name).join(", ")}`, "cyan");
  }

  // Nombre de joueurs inscrits
  const registeredPlayers = await db.query.tournamentRegistration.findMany({
    where: eq(tournamentRegistration.tournament_id, currentTournamentId),
  });

  log(`\n👥 Joueurs inscrits: ${registeredPlayers.length}`, "cyan");

  await pause();
}

async function startSpecificPhaseAction() {
  if (!currentTournamentId) {
    log("\n❌ Veuillez d'abord créer un tournoi!", "red");
    await pause();
    return;
  }

  log("\n🔧 Démarrage manuel d'une phase spécifique...", "yellow");

  const phases = await db.query.phase.findMany({
    where: eq(phase.tournament_id, currentTournamentId),
    orderBy: (phase, { asc }) => [asc(phase.order_index)],
  });

  log("\nPhases disponibles:", "cyan");
  phases.forEach((p) => {
    log(`  ${p.order_index}. ${p.name}`, "cyan");
  });

  const input = await question("\nQuelle phase voulez-vous démarrer? (2-5): ");
  const phaseIndex = parseInt(input.trim());

  if (isNaN(phaseIndex) || phaseIndex < 2 || phaseIndex > 5) {
    log("❌ Numéro de phase invalide!", "red");
    await pause();
    return;
  }

  const targetPhase = phases.find((p) => p.order_index === phaseIndex);
  if (!targetPhase) {
    log("❌ Phase introuvable!", "red");
    await pause();
    return;
  }

  try {
    if (phaseIndex === 2) {
      // Phase 2
      const phase1 = phases.find((p) => p.order_index === 1);
      if (!phase1) {
        log("❌ Phase 1 introuvable!", "red");
        await pause();
        return;
      }

      log("   Sélection des 96 derniers de la Phase 1...", "cyan");
      const result = await startPhase2FromPhase1(phase1.id, targetPhase.id);
      log(
        `\n✅ Phase 2 démarrée: ${result.qualifiedPlayers.length} joueurs, ${result.games.length} lobbies`,
        "green",
      );
    } else if (phaseIndex === 3) {
      // Phase 3
      const phase1 = phases.find((p) => p.order_index === 1);
      const phase2 = phases.find((p) => p.order_index === 2);

      if (!phase1 || !phase2) {
        log("❌ Phases 1 ou 2 introuvables!", "red");
        await pause();
        return;
      }

      log(
        "   Séparation Master/Amateur basée sur les phases 1 et 2...",
        "cyan",
      );
      const result = await startPhase3FromPhase1And2(
        phase1.id,
        phase2.id,
        targetPhase.id,
        8,
      );

      log("\n✅ Phase 3 démarrée avec succès!", "green");
      log(
        `   🏅 Bracket MASTER:\n      - Joueurs: ${result.masterBracket.players.length}\n      - Lobbies: ${result.masterBracket.games.length}\n      - Source: ${result.masterBracket.source}`,
        "cyan",
      );
      log(
        `   🥈 Bracket AMATEUR:\n      - Joueurs: ${result.amateurBracket.players.length}\n      - Lobbies: ${result.amateurBracket.games.length}\n      - Source: ${result.amateurBracket.source}`,
        "cyan",
      );
    } else if (phaseIndex === 4) {
      // Phase 4
      const phase3 = phases.find((p) => p.order_index === 3);

      if (!phase3) {
        log("❌ Phase 3 introuvable!", "red");
        await pause();
        return;
      }

      log("   Transition vers Phase 4 avec relégation...", "cyan");
      const result = await startPhase4FromPhase3(phase3.id, targetPhase.id);

      log("\n✅ Phase 4 démarrée avec succès!", "green");
      log(
        `   🏅 Bracket MASTER:\n      - Joueurs: ${result.masterBracket.players.length}\n      - Lobbies: ${result.masterBracket.games.length}\n      - Source: ${result.masterBracket.source}`,
        "cyan",
      );
      log(
        `   🥈 Bracket AMATEUR (RESET):\n      - Joueurs: ${result.amateurBracket.players.length}\n      - Lobbies: ${result.amateurBracket.games.length}\n      - Source: ${result.amateurBracket.source}`,
        "cyan",
      );
    } else if (phaseIndex === 5) {
      // Phase 5
      const phase4 = phases.find((p) => p.order_index === 4);

      if (!phase4) {
        log("❌ Phase 4 introuvable!", "red");
        await pause();
        return;
      }

      log("   Transition vers les FINALES...", "cyan");
      const result = await startPhase5FromPhase4(phase4.id, targetPhase.id);

      log("\n✅ Phase 5 - FINALES démarrée avec succès!", "green");
      log(
        `   🏆 Bracket CHALLENGER:\n      - Joueurs: ${result.challengerBracket.players.length}\n      - Source: ${result.challengerBracket.source}`,
        "cyan",
      );
      log(
        `   🏅 Bracket MASTER:\n      - Joueurs: ${result.masterBracket.players.length}\n      - Source: ${result.masterBracket.source}`,
        "cyan",
      );
      log(
        `   🥈 Bracket AMATEUR:\n      - Joueurs: ${result.amateurBracket.players.length}\n      - Source: ${result.amateurBracket.source}`,
        "cyan",
      );
    }

    currentPhaseId = targetPhase.id;
  } catch (error: any) {
    log(`\n❌ Erreur: ${error.message}`, "red");
    console.error(error);
  }

  await pause();
}

async function continuePhase4MasterBracketAction() {
  if (!currentTournamentId || !currentPhaseId) {
    log("\n❌ Veuillez d'abord sélectionner un tournoi et une phase!", "red");
    await pause();
    return;
  }

  log("\n🎯 Continuation du bracket Master de Phase 4...", "yellow");

  // Vérifier que c'est bien la phase 4
  const phaseData = await db.query.phase.findFirst({
    where: eq(phase.id, currentPhaseId),
  });

  if (!phaseData || phaseData.order_index !== 4) {
    log("❌ Cette action n'est disponible que pour la Phase 4!", "red");
    await pause();
    return;
  }

  try {
    log("   Récupération du top 16 après games 1-2...", "cyan");
    const result = await continuePhase4MasterBracket(currentPhaseId);

    log("\n✅ Games 3-4 créées avec succès pour le bracket Master!", "green");
    log(
      `   🏅 Top 16 du bracket Master:\n      - Joueurs: ${result.players.length}\n      - Lobbies créés: ${result.games.length}\n      - Source: ${result.source}`,
      "cyan",
    );
    log(
      "   Note: Les games 3 et 4 utilisent ces 16 meilleurs joueurs",
      "yellow",
    );
  } catch (error: any) {
    log(`\n❌ Erreur: ${error.message}`, "red");
    console.error(error);
  }

  await pause();
}

function pause() {
  return question("\nAppuyez sur Entrée pour continuer...");
}

async function main() {
  log("\n🎮 Bienvenue dans le simulateur de tournoi TFT!\n", "bright");

  let running = true;

  while (running) {
    const choice = await displayMenu();

    switch (choice) {
      case "1":
        await createTournamentAction();
        break;
      case "s":
      case "S":
        await selectExistingTournamentAction();
        break;
      case "2":
        await generatePlayersAction();
        break;
      case "3":
        await startPhase1Action();
        break;
      case "4":
        await submitGameResultsAction();
        break;
      case "5":
        await viewLeaderboardAction();
        break;
      case "6":
        await moveToNextPhaseAction();
        break;
      case "t":
      case "T":
        await startSpecificPhaseAction();
        break;
      case "m":
      case "M":
        await continuePhase4MasterBracketAction();
        break;
      case "7":
        await viewGamesAction();
        break;
      case "8":
        await submitRandomResultsAction();
        break;
      case "9":
        await completeAllGamesAction();
        break;
      case "a":
      case "A":
        await completeGameNumberAction();
        break;
      case "0":
        await viewTournamentInfoAction();
        break;
      case "q":
        running = false;
        log("\n👋 Au revoir!\n", "green");
        break;
      default:
        log("\n❌ Choix invalide!", "red");
        await pause();
    }
  }

  rl.close();
  process.exit(0);
}

// Gestion des erreurs et de la fermeture propre
process.on("SIGINT", () => {
  log("\n\n👋 Interruption reçue, fermeture...", "yellow");
  rl.close();
  process.exit(0);
});

// Lancer le script
main().catch((error) => {
  log(`\n❌ Erreur fatale: ${error.message}`, "red");
  console.error(error);
  rl.close();
  process.exit(1);
});
