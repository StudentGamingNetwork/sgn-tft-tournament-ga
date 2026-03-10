import { describe, it, expect } from 'vitest';
import { calculatePlayerScores } from './scoring-service';

describe('calculatePlayerScores', () => {
    describe('Cas nominaux', () => {
        it('calcule correctement le score pour un seul joueur', () => {
            const results = [
                { player_id: 'player-1', placement: 1 },
            ];

            const scores = calculatePlayerScores(results);

            expect(scores).toEqual({
                'player-1': 8, // 1ère place = 8 points (8 - 1 + 1)
            });
        });

        it('calcule correctement les scores pour plusieurs joueurs', () => {
            const results = [
                { player_id: 'player-1', placement: 1 },
                { player_id: 'player-2', placement: 2 },
                { player_id: 'player-3', placement: 3 },
                { player_id: 'player-4', placement: 4 },
                { player_id: 'player-5', placement: 5 },
                { player_id: 'player-6', placement: 6 },
                { player_id: 'player-7', placement: 7 },
                { player_id: 'player-8', placement: 8 },
            ];

            const scores = calculatePlayerScores(results);

            expect(scores).toEqual({
                'player-1': 8, // 8 - 1 + 1 = 8
                'player-2': 7, // 8 - 2 + 1 = 7
                'player-3': 6, // 8 - 3 + 1 = 6
                'player-4': 5, // 8 - 4 + 1 = 5
                'player-5': 4, // 8 - 5 + 1 = 4
                'player-6': 3, // 8 - 6 + 1 = 3
                'player-7': 2, // 8 - 7 + 1 = 2
                'player-8': 1, // 8 - 8 + 1 = 1
            });
        });
    });

    describe('Vérification de la formule de calcul', () => {
        it('attribue 8 points pour la 1ère place', () => {
            const results = [{ player_id: 'player-1', placement: 1 }];
            const scores = calculatePlayerScores(results);
            expect(scores['player-1']).toBe(8);
        });

        it('attribue 1 point pour la 8ème place', () => {
            const results = [{ player_id: 'player-1', placement: 8 }];
            const scores = calculatePlayerScores(results);
            expect(scores['player-1']).toBe(1);
        });

        it('attribue 4 points pour la 5ème place', () => {
            const results = [{ player_id: 'player-1', placement: 5 }];
            const scores = calculatePlayerScores(results);
            expect(scores['player-1']).toBe(4);
        });
    });

    describe('Accumulation de scores', () => {
        it('accumule correctement les scores pour le même joueur sur plusieurs parties', () => {
            const results = [
                { player_id: 'player-1', placement: 1 }, // 8 points
                { player_id: 'player-1', placement: 3 }, // 6 points
                { player_id: 'player-1', placement: 2 }, // 7 points
            ];

            const scores = calculatePlayerScores(results);

            expect(scores['player-1']).toBe(21); // 8 + 6 + 7 = 21
        });

        it('accumule les scores pour plusieurs joueurs sur plusieurs parties', () => {
            const results = [
                { player_id: 'player-1', placement: 1 }, // 8 points
                { player_id: 'player-2', placement: 2 }, // 7 points
                { player_id: 'player-1', placement: 4 }, // 5 points
                { player_id: 'player-2', placement: 3 }, // 6 points
                { player_id: 'player-3', placement: 1 }, // 8 points
            ];

            const scores = calculatePlayerScores(results);

            expect(scores).toEqual({
                'player-1': 13, // 8 + 5 = 13
                'player-2': 13, // 7 + 6 = 13
                'player-3': 8,  // 8
            });
        });
    });

    describe('Edge cases', () => {
        it('retourne un objet vide pour un tableau vide', () => {
            const results: { player_id: string; placement: number }[] = [];
            const scores = calculatePlayerScores(results);
            expect(scores).toEqual({});
        });

        it('gère un seul résultat', () => {
            const results = [{ player_id: 'player-1', placement: 5 }];
            const scores = calculatePlayerScores(results);
            expect(scores).toEqual({ 'player-1': 4 });
        });

        it('gère tous les joueurs à la même place (cas théorique)', () => {
            const results = [
                { player_id: 'player-1', placement: 1 },
                { player_id: 'player-2', placement: 1 },
                { player_id: 'player-3', placement: 1 },
            ];

            const scores = calculatePlayerScores(results);

            expect(scores).toEqual({
                'player-1': 8,
                'player-2': 8,
                'player-3': 8,
            });
        });
    });

    describe('Validation de données', () => {
        it('gère des UUIDs réalistes comme player_id', () => {
            const results = [
                { player_id: '550e8400-e29b-41d4-a716-446655440000', placement: 1 },
                { player_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', placement: 2 },
            ];

            const scores = calculatePlayerScores(results);

            expect(scores).toEqual({
                '550e8400-e29b-41d4-a716-446655440000': 8,
                '6ba7b810-9dad-11d1-80b4-00c04fd430c8': 7,
            });
        });

        it('retourne un objet avec les bons types', () => {
            const results = [{ player_id: 'player-1', placement: 1 }];
            const scores = calculatePlayerScores(results);

            expect(typeof scores).toBe('object');
            expect(typeof scores['player-1']).toBe('number');
        });
    });
});
