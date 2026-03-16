# Script de Simulation de Tournoi TFT

Ce script permet de simuler un tournoi TFT complet de manière interactive, étape par étape, afin de visualiser l'évolution sur l'interface.

## Installation

Avant la première utilisation, installez `tsx` :

```bash
pnpm add -D tsx
```

## Utilisation

Lancez le script avec la commande :

```bash
pnpm run simulate
```

## Workflow de simulation

Le script vous guide à travers les différentes étapes d'un tournoi :

### 1️⃣ Créer un nouveau tournoi

- Crée un tournoi avec ses 5 phases
- Configure automatiquement les brackets (common, master, amateur, challenger)

### 2️⃣ Générer et ajouter des joueurs

- Génère un palier supporté de joueurs fictifs avec des rangs aléatoires
- Paliers supportés : 64, 72, 80, 88, 96, 104, 112, 120, 128
- Les inscrit automatiquement au tournoi

### 3️⃣ Démarrer la Phase 1

- Répartit de 64 à 128 joueurs dans des lobbies de 8
- Crée le premier jeu pour chaque lobby
- Utilise la matrice de seeding de Phase 1

### 4️⃣ Soumettre les résultats d'un jeu

- Permet de saisir manuellement les placements (1-8) pour chaque joueur
- Ou appuyez sur Entrée pour générer des résultats aléatoires

### 5️⃣ Voir le leaderboard actuel

- Affiche le classement des joueurs de la phase en cours
- Montre les points cumulés et le nombre de jeux joués

### 6️⃣ Passer à la phase suivante

- Vérifie que tous les jeux sont terminés
- Applique les règles de qualification :
  - **Phase 2** : Les 96 derniers de la Phase 1
  - **Phase 2** : Les qualifiés restants de la Phase 1 selon le palier
  - **Phase 3** : Split Master/Amateur basé sur le cumulatif Phase 1+2
    - Master : Top 32 de P1 + Top 32 de P2
    - Amateur : Reliquat de P2 après alimentation du Master
  - **Phase 4** : Basé sur les résultats de Phase 3
  - **Phase 5** : Finales (Challenger, Master, Amateur)

### 7️⃣ Voir tous les jeux de la phase

- Liste tous les jeux avec leur statut
- Indique lesquels ont des résultats

### 8️⃣ Soumettre tous les résultats d'un jeu (aléatoire)

- Trouve le prochain jeu sans résultats
- Génère automatiquement des placements aléatoires
- Parfait pour accélérer la simulation

### 9️⃣ Terminer tous les jeux de la phase (automatique)

- Complète automatiquement tous les jeux restants avec des résultats aléatoires
- Très utile pour passer rapidement à la phase suivante

### 0️⃣ Informations sur le tournoi

- Affiche un récapitulatif complet : phases, brackets, jeux terminés, joueurs inscrits

## Structure du tournoi

Le tournoi suit la structure officielle :

- **Phase 1** : de 64 à 128 joueurs, 1 bracket (common), lobbies de 8
- **Phase 2** : taille variable selon le palier, 1 bracket (common)
- **Phase 3** : split Master/Amateur, **RESET des points**
  - Master : 64 joueurs tant que le palier le permet
  - Amateur : absorbe les slots manquants par le bas
- **Phase 4** : Master prioritaire à 32, Amateur variable puis plafonné à 64
  - Master : 32 joueurs (Top 32 P3 Master)
  - Amateur : relégués Master + meilleurs Amateur, **RESET**
- **Phase 5** : 24 joueurs, 3 brackets, 6 jeux
  - Challenger : 8 joueurs (Top 8 P4 Master)
  - Master : 8 joueurs (rangs 9-16 P4 Master)
  - Amateur : 8 joueurs (Top 8 P4 Amateur)

## Conseils d'utilisation

### Pour tester rapidement

1. Créez le tournoi (option 1)
2. Générez les joueurs (option 2)
3. Démarrez la Phase 1 (option 3)
4. Complétez automatiquement la phase (option 9)
5. Vérifiez le leaderboard (option 5)
6. Passez à la phase suivante (option 6)
7. Répétez pour les phases suivantes

### Pour tester de manière détaillée

- Utilisez l'option 4 ou 8 pour soumettre les résultats jeu par jeu
- Consultez régulièrement le leaderboard (option 5)
- Vérifiez les jeux en cours (option 7)

### Pendant la simulation

- Gardez l'application web ouverte sur `http://localhost:3000/admin`
- Actualisez la page après chaque action pour voir les changements
- Naviguez dans les différentes phases pour voir l'évolution

## Notes techniques

- Le script utilise `readline` pour l'interaction en ligne de commande
- Les couleurs dans le terminal facilitent la lecture
- Appuyez sur `Ctrl+C` pour quitter à tout moment
- La base de données est modifiée en temps réel
- Toutes les actions sont persistées immédiatement

## Dépannage

### Erreur "Game not found"

- Assurez-vous d'avoir démarré la phase avant de soumettre des résultats

### Erreur "Players not assigned"

- Vérifiez que les joueurs ont bien été générés et inscrits

### Impossible de passer à la phase suivante

- Tous les jeux de la phase actuelle doivent avoir des résultats
- Utilisez l'option 9 pour terminer automatiquement tous les jeux

### Erreur de connexion à la base de données

- Vérifiez que votre `DATABASE_URL` est correctement configurée dans `.env`
- Assurez-vous que les migrations sont à jour : `pnpm run db:migrate`
