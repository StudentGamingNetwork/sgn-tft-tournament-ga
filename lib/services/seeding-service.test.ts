import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DB et autres services
vi.mock('@/lib/db', () => ({
    db: {
        insert: vi.fn(),
        delete: vi.fn(),
        query: {
            player: {
                findMany: vi.fn(),
            },
            lobbyRotationMatrix: {
                findMany: vi.fn(),
            },
        },
    },
}));

vi.mock('./game-service', () => ({
    createGame: vi.fn(),
}));

const { db } = await import('@/lib/db');
const { createGame } = await import('./game-service');
const {
    seedPlayersForPhase,
    assignPlayersToLobbies,
    saveRotationMatrix,
    loadRotationMatrix,
} = await import('./seeding-service');

describe('seedingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('seedPlayersForPhase', () => {
        it('seed les joueurs par tier et LP', async () => {
            const mockPlayers = [
                {
                    id: 'p1',
                    name: 'Player 1',
                    riot_id: 'P1#NA',
                    tier: 'CHALLENGER',
                    division: null,
                    league_points: 2000,
                    discord_tag: null,
                    team_id: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'p2',
                    name: 'Player 2',
                    riot_id: 'P2#NA',
                    tier: 'MASTER',
                    division: 'I',
                    league_points: 500,
                    discord_tag: null,
                    team_id: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];

            (db.query.player.findMany as any).mockResolvedValue(mockPlayers);

            const result = await seedPlayersForPhase('phase-id');

            expect(result).toHaveLength(2);
            expect(result[0].seed).toBe(1); // Challenger doit être seed 1
            expect(result[0].player_id).toBe('p1');
            expect(result[1].seed).toBe(2);
            expect(result[1].player_id).toBe('p2');
        });

        it('considere les joueurs sans rank comme UNRANKED avec 0 LP', async () => {
            const mockPlayers = [
                {
                    id: 'p1',
                    name: 'Player 1',
                    riot_id: 'P1#NA',
                    tier: null,
                    division: null,
                    league_points: null,
                    discord_tag: null,
                    team_id: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];

            (db.query.player.findMany as any).mockResolvedValue(mockPlayers);

            const result = await seedPlayersForPhase('phase-id');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                player_id: 'p1',
                tier: 'UNRANKED',
                division: null,
                league_points: 0,
                seed: 1,
            });
        });

        it('lance une erreur si aucun joueur n est disponible', async () => {
            (db.query.player.findMany as any).mockResolvedValue([]);

            await expect(seedPlayersForPhase('phase-id')).rejects.toThrow(
                'No players found for seeding'
            );
        });
    });

    describe('saveRotationMatrix', () => {
        it('sauvegarde une matrice de rotation', async () => {
            const matrix = [
                [1, 2, 3, 4, 5, 6, 7, 8],
                [9, 10, 11, 12, 13, 14, 15, 16],
            ];

            const whereMock = vi.fn().mockResolvedValue([]);
            (db.delete as any).mockReturnValue({ where: whereMock });

            const valuesMock = vi.fn().mockResolvedValue([]);
            (db.insert as any).mockReturnValue({ values: valuesMock });

            await saveRotationMatrix('phase-id', 2, matrix);

            expect(db.delete).toHaveBeenCalled();
            expect(db.insert).toHaveBeenCalled();
            expect(valuesMock).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        phase_id: 'phase-id',
                        game_number: 2,
                        lobby_index: 0,
                        seed_assignments: JSON.stringify(matrix[0]),
                    }),
                ])
            );
        });
    });

    describe('loadRotationMatrix', () => {
        it('charge une matrice de rotation existante', async () => {
            const mockMatrices = [
                {
                    phase_id: 'phase-id',
                    game_number: 2,
                    lobby_index: 0,
                    seed_assignments: JSON.stringify([1, 2, 3, 4]),
                },
                {
                    phase_id: 'phase-id',
                    game_number: 2,
                    lobby_index: 1,
                    seed_assignments: JSON.stringify([5, 6, 7, 8]),
                },
            ];

            (db.query.lobbyRotationMatrix.findMany as any).mockResolvedValue(mockMatrices);

            const result = await loadRotationMatrix('phase-id', 2);

            expect(result).toEqual([
                [1, 2, 3, 4],
                [5, 6, 7, 8],
            ]);
        });

        it('retourne null si aucune matrice trouvée', async () => {
            (db.query.lobbyRotationMatrix.findMany as any).mockResolvedValue([]);

            const result = await loadRotationMatrix('phase-id', 2);

            expect(result).toBeNull();
        });
    });
});
