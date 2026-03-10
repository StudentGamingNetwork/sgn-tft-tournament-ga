# Structure du Tournoi TFT

## Vue d'ensemble

Système de tournoi TFT à 5 phases avec éliminations progressives, fusions de brackets, relégations et resets de points stratégiques.

## Flux du Tournoi

```
Phase 1 (128 joueurs)
    ↓ [Passage du top 32 en Phase 3]
Phase 2 (96 joueurs)
    ↓ [Fusion P1+P2 / RESET points]
Phase 3 (128 joueurs, 2 brackets)
    ├── Master (64): Top 32 P1 + Top 32 P2
    └── Amateur (64): 64 derniers P2
    ↓
Phase 4 (96 joueurs, 2 brackets)
    ├── Master (32): Top 32 P3 Master
    └── Amateur (64, RESET): Top 32 P3 Amateur + 32 derniers P3 Master
    ↓
Phase 5 (24 joueurs, 3 brackets - FINALES)
    ├── Challenger (8): Top 8 P4 Master
    ├── Master (8): Ranks 9-16 P4 Master
    └── Amateur (8): Top 8 P4 Amateur
```

## Détails par Phase

### Phase 1

- **Joueurs** : 128 (tous les inscrits)
- **Bracket** : 1 (common)
- **Lobbies** : 16 (8 joueurs par lobby)
- **Games** : 6 games
- **Transition** : Les 32 premiers sont **promus** vers le bracket master de la phase 3, les 96 derniers passent en Phase 2

### Phase 2

- **Joueurs** : 96 (96 derniers de Phase 1)
- **Bracket** : 1 (common)
- **Lobbies** : 12 (8 joueurs par lobby)
- **Games** : 6 games
- **Seeding** : Les joueurs conservent leur rang original de Phase 1 (seeds 33-128 au lieu de être renumerés 1-96)
  - Exemple: Le joueur classé 33ème en Phase 1 a le seed 33 en Phase 2 (pas le seed 1)
  - Cela préserve le contexte de classement et facilite le suivi des performances
- **Transition** :
  - Top 32 P1 + Top 32 P2 → Master (64 joueurs)
  - 64 derniers P2 → Amateur (64 joueurs)
  - **RESET des points** pour Phase 3

### Phase 3

- **Joueurs** : 128 (fusion et split)
- **Brackets** : 2
  - **Master** : 64 joueurs
    - Source : Top 32 Phase 1 + Top 32 Phase 2
    - Lobbies : 8 (8 joueurs par lobby)
  - **Amateur** : 64 joueurs
    - Source : 64 derniers Phase 2
    - Lobbies : 8 (8 joueurs par lobby)
- **Games** : 6 games par bracket
- **Points** : RESET (nouveau départ)
- **Transition** :
  - Top 32 Master → Phase 4 Master (32 joueurs)
  - Top 32 Amateur + 32 derniers Master → Phase 4 Amateur (64 joueurs, RESET)

### Phase 4

- **Joueurs** : 96
- **Brackets** : 2
  - **Master** : 32 joueurs
    - Source : Top 32 Phase 3 Master
    - Lobbies : 4 (8 joueurs par lobby)
  - **Amateur** : 64 joueurs
    - Source : Top 32 Phase 3 Amateur + 32 derniers Phase 3 Master
    - Lobbies : 8 (8 joueurs par lobby)
    - **RESET des points** (relégation)
- **Games** : 6 games par bracket
- **Transition** :
  - Top 8 Master → Challenger Finale (8 joueurs)
  - Ranks 9-16 Master → Master Finale (8 joueurs)
  - Top 8 Amateur → Amateur Finale (8 joueurs)

### Phase 5 - FINALES

- **Joueurs** : 24
- **Brackets** : 3
  - **Challenger** : 8 joueurs
    - Source : Top 8 Phase 4 Master
    - Lobbies : 1 (8 joueurs)
  - **Master** : 8 joueurs
    - Source : Ranks 9-16 Phase 4 Master
    - Lobbies : 1 (8 joueurs)
  - **Amateur** : 8 joueurs
    - Source : Top 8 Phase 4 Amateur
    - Lobbies : 1 (8 joueurs)
- **Games** : 6 games par bracket
- **Winner** : Champion de chaque bracket

## Reset de Points

Les resets de points interviennent aux moments suivants :

1. **Phase 2 → Phase 3** : RESET complet pour tous les joueurs

   - Les performances de P1 et P2 servent uniquement à déterminer les brackets
   - Tout le monde repart à 0 points en Phase 3

2. **Phase 3 → Phase 4 (Amateur bracket uniquement)** :
   - Les 32 joueurs relégués du bracket Master perdent leurs points
   - Ils repartent à 0 avec les 32 meilleurs du bracket Amateur
   - Le bracket Master conserve ses points

## Algorithmes Utilisés

### Seeding Initial

- **Phase 1** : Classement par tier Riot (CHALLENGER → UNRANKED)
  - En cas d'égalité : classement par League Points (LP)
  - En cas d'égalité parfaite : tri alphabétique par nom
  - Seeds: 1-128
- **Phases suivantes (2+)** : Basé sur le classement de la phase précédente
  - Les seeds originaux du leaderboard sont préservés
  - Exemple: Phase 2 utilise seeds 33-128 (les 96 derniers de Phase 1)
  - Cela maintient le contexte de performance à travers les phases

### Attribution des Lobbies

- **Snake Draft** : alternance cycle pair/impair pour équilibrer les lobbies
  - Cycle 1 : 1→8 (ordre croissant)
  - Cycle 2 : 8→1 (ordre décroissant)
  - Cycle 3 : 1→8 (ordre croissant)
  - etc.

### Calcul des Points

- 1ère place : 8 points
- 2ème place : 7 points
- 3ème place : 6 points
- 4ème place : 5 points
- 5ème place : 4 points
- 6ème place : 3 points
- 7ème place : 2 points
- 8ème place : 1 point

### Tie-Breakers (ordre de priorité)

1. Total Points
2. Nombre de Top 1
3. Nombre de Top 4
4. Nombre de Top 2
5. Nombre de Top 3
6. Nombre de Top 5
7. Nombre de Top 6
8. Nombre de Top 7
9. Nombre de Top 8
10. Seed initial (dernier recours)

## Utilisation

### 1. Créer un Tournoi Standard

```typescript
import { createStandardTournament } from "@/lib/services/tournament-service";

const tournament = await createStandardTournament("Tournoi TFT 2026", "2026");
```

### 2. Importer les Joueurs

```typescript
import { importPlayersFromCSV } from "@/lib/services/player-service";

const csvData = `riot_id,riot_tag,tier,division,league_points,team_name
Player1,TAG1,CHALLENGER,I,1200,Team Alpha
Player2,TAG2,GRANDMASTER,I,850,Team Beta
...`;

const players = await importPlayersFromCSV(csvData);
```

### 3. Démarrer Phase 1

```typescript
import { startPhase } from "@/lib/services/tournament-service";

const phase1Result = await startPhase(phase1Id, {
  autoSeed: true,
  lobbyCount: 16,
  playerIds: allPlayerIds,
});
```

### 4. Soumettre les Résultats

```typescript
import { submitGameResults } from "@/lib/services/game-service";

await submitGameResults(gameId, [
  { player_id: "player-1", placement: 1 },
  { player_id: "player-2", placement: 2 },
  // ... 8 joueurs au total
]);
```

### 5. Transitions Entre Phases

```typescript
import {
  startPhase2FromPhase1,
  startPhase3FromPhase1And2,
  startPhase4FromPhase3,
  startPhase5FromPhase4,
} from "@/lib/services/tournament-service";

// Phase 1 → Phase 2
const phase2 = await startPhase2FromPhase1(phase1Id, phase2Id, 12);

// Phase 2 → Phase 3
const phase3 = await startPhase3FromPhase1And2(phase1Id, phase2Id, phase3Id, 8);

// Phase 3 → Phase 4
const phase4 = await startPhase4FromPhase3(phase3Id, phase4Id);

// Phase 4 → Phase 5
const phase5 = await startPhase5FromPhase4(phase4Id, phase5Id);
```

### 6. Consulter les Classements

```typescript
import { getLeaderboard } from "@/lib/services/scoring-service";

// Classement d'une phase/bracket
const leaderboard = await getLeaderboard(phaseId, bracketId);

// Classement cumulatif (plusieurs phases)
const cumulative = await getCumulativeLeaderboard([phase1Id, phase2Id]);
```

## Schéma de Base de Données

### Tables Principales

- `tournament` : Métadonnées du tournoi
- `phase` : Phases du tournoi (1-5)
- `bracket` : Brackets par phase (common, master, amateur, challenger)
- `game` : Games individuels (1 lobby = 1 game)
- `lobbyPlayer` : Association joueur-game
- `results` : Résultats par joueur/game (placement, points)
- `player` : Joueurs avec tier/LP Riot
- `team` : Équipes

### Enum `tierEnum`

```sql
CHALLENGER > GRANDMASTER > MASTER > DIAMOND > EMERALD > PLATINUM >
GOLD > SILVER > BRONZE > IRON > UNRANKED
```

## Exemple Complet

Voir [tournament-workflow-correct.example.ts](lib/services/tournament-workflow-correct.example.ts) pour un workflow complet avec logs détaillés.

## Tests

Exécuter les tests :

```bash
pnpm test tournament-workflow.test.ts --run
```

Tests couverts :

- ✅ Création tournoi standard
- ✅ Transition Phase 1 → Phase 2 (élimination)
- ✅ Transition Phase 2 → Phase 3 (fusion + split)
- ✅ Transition Phase 3 → Phase 4 (relégation)
- ✅ Transition Phase 4 → Phase 5 (finales)

## Notes Importantes

### Éliminations

- **Phase 1** : Les 32 **meilleurs** sont éliminés (pas les pires !)
- Raison : Équilibrage du tournoi, ils sont probablement trop forts

### Resets de Points

- **Phase 3** : Tout le monde repart à 0
- **Phase 4 Amateur** : Uniquement ce bracket (fusion relégués + promus)

### Fusions/Splits

- Les joueurs peuvent changer de bracket entre les phases
- Un joueur peut être en Master P3, puis relégué en Amateur P4
- Un joueur peut être en Amateur P3, puis promu en Master P4

### Rotation des Lobbies

- Utilise des matrices de rotation prédéfinies (gr4.csv)
- Permet de varier les adversaires entre les games
- Application du Snake Draft à chaque game
