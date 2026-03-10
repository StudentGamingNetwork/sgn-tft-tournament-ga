import { describe, it, expect } from 'vitest';
import {
    compareTieBreaker,
    calculatePlayerStats,
    sortByTieBreakers,
    calculatePoints,
} from './tie-breakers';
import type { PlayerStats } from '@/types/tournament';

describe('tieBreakers', () => {
    describe('calculatePoints', () => {
        it('retourne 8 points pour la 1ère place', () => {
            expect(calculatePoints(1)).toBe(8);
        });

        it('retourne 1 point pour la 8ème place', () => {
            expect(calculatePoints(8)).toBe(1);
        });

        it('retourne 5 points pour la 4ème place', () => {
            expect(calculatePoints(4)).toBe(5);
        });

        it('lance une erreur pour placement < 1', () => {
            expect(() => calculatePoints(0)).toThrow();
        });

        it('lance une erreur pour placement > 8', () => {
            expect(() => calculatePoints(9)).toThrow();
        });
    });

    describe('calculatePlayerStats', () => {
        it('calcule correctement les stats pour un joueur', () => {
            const placements = [1, 3, 2, 5, 4, 1, 2];
            const totalPoints = 42;

            const stats = calculatePlayerStats('player-1', placements, totalPoints);

            expect(stats.player_id).toBe('player-1');
            expect(stats.total_points).toBe(42);
            expect(stats.total_games).toBe(7);
            expect(stats.top1_count).toBe(2);
            expect(stats.top2_count).toBe(2);
            expect(stats.top3_count).toBe(1);
            expect(stats.top4_count).toBe(6); // Nombre de places <= 4
            expect(stats.top5_count).toBe(1);
            expect(stats.avg_placement).toBeCloseTo(2.57, 2);
        });

        it('gère le cas où aucune partie jouée', () => {
            const stats = calculatePlayerStats('player-1', [], 0);

            expect(stats.total_games).toBe(0);
            expect(stats.avg_placement).toBe(0);
            expect(stats.top1_count).toBe(0);
        });

        it('compte correctement les Top 4', () => {
            const placements = [1, 2, 3, 4, 5];

            const stats = calculatePlayerStats('player-1', placements, 30);

            expect(stats.top4_count).toBe(4); // 1, 2, 3, 4 sont toutes top 4
        });
    });

    describe('compareTieBreaker', () => {
        it('départage par total de points d\'abord', () => {
            const playerA: PlayerStats = {
                player_id: 'A',
                total_points: 50,
                total_games: 6,
                avg_placement: 3,
                top1_count: 2,
                top2_count: 1,
                top3_count: 1,
                top4_count: 4,
                top5_count: 1,
                top6_count: 1,
                top7_count: 0,
                top8_count: 0,
                placements: [1, 1, 2, 3, 5, 6],
            };

            const playerB: PlayerStats = {
                ...playerA,
                player_id: 'B',
                total_points: 40,
            };

            // A a plus de points, donc A > B (retour négatif car B - A)
            expect(compareTieBreaker(playerA, playerB)).toBeLessThan(0);
        });

        it('utilise Top 1 count si points égaux', () => {
            const playerA: PlayerStats = {
                player_id: 'A',
                total_points: 50,
                total_games: 6,
                avg_placement: 3,
                top1_count: 3,
                top2_count: 1,
                top3_count: 1,
                top4_count: 5,
                top5_count: 0,
                top6_count: 1,
                top7_count: 0,
                top8_count: 0,
                placements: [],
            };

            const playerB: PlayerStats = {
                ...playerA,
                player_id: 'B',
                top1_count: 2,
            };

            expect(compareTieBreaker(playerA, playerB)).toBeLessThan(0);
        });

        it('utilise Top 4 count si points et Top 1 égaux', () => {
            const playerA: PlayerStats = {
                player_id: 'A',
                total_points: 50,
                total_games: 6,
                avg_placement: 3,
                top1_count: 2,
                top2_count: 1,
                top3_count: 1,
                top4_count: 5,
                top5_count: 0,
                top6_count: 1,
                top7_count: 0,
                top8_count: 0,
                placements: [],
            };

            const playerB: PlayerStats = {
                ...playerA,
                player_id: 'B',
                top4_count: 4,
            };

            expect(compareTieBreaker(playerA, playerB)).toBeLessThan(0);
        });

        it('utilise initial seed en dernier recours', () => {
            const playerA: PlayerStats = {
                player_id: 'A',
                total_points: 50,
                total_games: 6,
                avg_placement: 3,
                top1_count: 2,
                top2_count: 1,
                top3_count: 1,
                top4_count: 4,
                top5_count: 1,
                top6_count: 1,
                top7_count: 0,
                top8_count: 0,
                placements: [],
            };

            const playerB: PlayerStats = { ...playerA, player_id: 'B' };

            // Avec initial seed, seed plus bas gagne (retourne négatif si seedA < seedB)
            expect(compareTieBreaker(playerA, playerB, 5, 10)).toBeLessThan(0);
            expect(compareTieBreaker(playerA, playerB, 10, 5)).toBeGreaterThan(0);
        });

        it('retourne 0 pour égalité parfaite', () => {
            const playerA: PlayerStats = {
                player_id: 'A',
                total_points: 50,
                total_games: 6,
                avg_placement: 3,
                top1_count: 2,
                top2_count: 1,
                top3_count: 1,
                top4_count: 4,
                top5_count: 1,
                top6_count: 1,
                top7_count: 0,
                top8_count: 0,
                placements: [],
            };

            const playerB: PlayerStats = { ...playerA, player_id: 'B' };

            expect(compareTieBreaker(playerA, playerB)).toBe(0);
        });

        it('applique l\'ordre correct des tie-breakers secondaires', () => {
            const base: PlayerStats = {
                player_id: 'base',
                total_points: 50,
                total_games: 6,
                avg_placement: 3,
                top1_count: 2,
                top2_count: 1,
                top3_count: 1,
                top4_count: 4,
                top5_count: 0,
                top6_count: 1,
                top7_count: 0,
                top8_count: 0,
                placements: [],
            };

            // Top2 count départage quand Top1 et Top4 égaux
            const moreTop2 = { ...base, player_id: 'moreTop2', top2_count: 3 };
            expect(compareTieBreaker(moreTop2, base)).toBeLessThan(0);

            // Top3 count départage quand Top2 égal
            const moreTop3 = { ...base, player_id: 'moreTop3', top3_count: 2 };
            expect(compareTieBreaker(moreTop3, base)).toBeLessThan(0);
        });
    });

    describe('sortByTieBreakers', () => {
        it('trie 3 joueurs correctement', () => {
            const players = [
                {
                    stats: {
                        player_id: 'B',
                        total_points: 40,
                        total_games: 6,
                        avg_placement: 3.5,
                        top1_count: 1,
                        top2_count: 2,
                        top3_count: 1,
                        top4_count: 4,
                        top5_count: 1,
                        top6_count: 1,
                        top7_count: 0,
                        top8_count: 0,
                        placements: [],
                    },
                },
                {
                    stats: {
                        player_id: 'A',
                        total_points: 50,
                        total_games: 6,
                        avg_placement: 3,
                        top1_count: 3,
                        top2_count: 1,
                        top3_count: 1,
                        top4_count: 5,
                        top5_count: 0,
                        top6_count: 1,
                        top7_count: 0,
                        top8_count: 0,
                        placements: [],
                    },
                },
                {
                    stats: {
                        player_id: 'C',
                        total_points: 50,
                        total_games: 6,
                        avg_placement: 3.2,
                        top1_count: 2,
                        top2_count: 2,
                        top3_count: 1,
                        top4_count: 5,
                        top5_count: 0,
                        top6_count: 1,
                        top7_count: 0,
                        top8_count: 0,
                        placements: [],
                    },
                },
            ];

            const sorted = sortByTieBreakers(players);

            // Ordre attendu : A (50pts, 3 Top1), C (50pts, 2 Top1), B (40pts)
            expect(sorted[0].stats.player_id).toBe('A');
            expect(sorted[1].stats.player_id).toBe('C');
            expect(sorted[2].stats.player_id).toBe('B');
        });
    });
});
