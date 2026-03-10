/**
 * Tests for snake draft seeding algorithm
 */

import { describe, it, expect } from "vitest";
import { generateSnakeDraftMatrix } from "./seeding-matrices";

describe("generateSnakeDraftMatrix", () => {
  describe("validation", () => {
    it("should throw error if playerCount is not a multiple of 8", () => {
      expect(() => generateSnakeDraftMatrix(10)).toThrow(
        "must be a multiple of 8",
      );
      expect(() => generateSnakeDraftMatrix(15)).toThrow(
        "must be a multiple of 8",
      );
      expect(() => generateSnakeDraftMatrix(100)).toThrow(
        "must be a multiple of 8",
      );
      expect(() => generateSnakeDraftMatrix(127)).toThrow(
        "must be a multiple of 8",
      );
    });

    it("should throw error if playerCount is less than 8", () => {
      expect(() => generateSnakeDraftMatrix(0)).toThrow("must be at least 8");
      expect(() => generateSnakeDraftMatrix(4)).toThrow("must be at least 8");
    });

    it("should accept valid multiples of 8", () => {
      expect(() => generateSnakeDraftMatrix(8)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(16)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(128)).not.toThrow();
    });
  });

  describe("matrix structure", () => {
    it("should generate correct number of lobbies", () => {
      expect(generateSnakeDraftMatrix(8)).toHaveLength(1);
      expect(generateSnakeDraftMatrix(16)).toHaveLength(2);
      expect(generateSnakeDraftMatrix(24)).toHaveLength(3);
      expect(generateSnakeDraftMatrix(64)).toHaveLength(8);
      expect(generateSnakeDraftMatrix(128)).toHaveLength(16);
    });

    it("should have exactly 8 players per lobby", () => {
      const testCases = [8, 16, 24, 32, 64, 96, 104, 128, 256];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeDraftMatrix(playerCount);
        matrix.forEach((lobby, index) => {
          expect(lobby).toHaveLength(8);
        });
      });
    });
  });

  describe("seed coverage", () => {
    it("should include all seeds from 1 to playerCount", () => {
      const testCases = [8, 16, 32, 64, 96, 128];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeDraftMatrix(playerCount);
        const allSeeds = matrix.flat();

        // Check all seeds are present
        for (let seed = 1; seed <= playerCount; seed++) {
          expect(allSeeds).toContain(seed);
        }

        // Check total count
        expect(allSeeds).toHaveLength(playerCount);
      });
    });

    it("should have no duplicate seeds", () => {
      const testCases = [8, 16, 32, 64, 96, 128, 256];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeDraftMatrix(playerCount);
        const allSeeds = matrix.flat();
        const uniqueSeeds = new Set(allSeeds);

        expect(uniqueSeeds.size).toBe(allSeeds.length);
      });
    });
  });

  describe("snake draft pattern", () => {
    it("should follow snake draft pattern for 8 players (1 lobby)", () => {
      const matrix = generateSnakeDraftMatrix(8);

      // Single lobby should be: [1, 2, 3, 4, 5, 6, 7, 8]
      expect(matrix).toEqual([[1, 2, 3, 4, 5, 6, 7, 8]]);
    });

    it("should follow snake draft pattern for 16 players (2 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(16);

      // Expected pattern with 2 lobbies:
      // Lobby A: [1, 4, 5, 8, 9, 12, 13, 16]
      // Lobby B: [2, 3, 6, 7, 10, 11, 14, 15]
      expect(matrix).toEqual([
        [1, 4, 5, 8, 9, 12, 13, 16],
        [2, 3, 6, 7, 10, 11, 14, 15],
      ]);
    });

    it("should follow snake draft pattern for 32 players (4 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(32);

      // Verify first and last lobby structure
      expect(matrix[0]).toEqual([1, 8, 9, 16, 17, 24, 25, 32]);
      expect(matrix[3]).toEqual([4, 5, 12, 13, 20, 21, 28, 29]);

      // Verify all seeds are covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    });
  });

  describe("tournament-specific scenarios", () => {
    it("should generate correct matrix for Phase 1 (104 players → 13 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(104);

      expect(matrix).toHaveLength(13);
      expect(matrix[0]).toEqual([1, 26, 27, 52, 53, 78, 79, 104]);
      expect(matrix[12]).toEqual([13, 14, 39, 40, 65, 66, 91, 92]);

      // Verify all seeds covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 104 }, (_, i) => i + 1));
    });

    it("should generate correct matrix for Phase 2 (96 players → 12 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(96);

      expect(matrix).toHaveLength(12);
      expect(matrix[0]).toEqual([1, 24, 25, 48, 49, 72, 73, 96]);
      expect(matrix[11]).toEqual([12, 13, 36, 37, 60, 61, 84, 85]);

      // Verify all seeds covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 96 }, (_, i) => i + 1));
    });

    it("should generate correct matrix for Phase 3/4 brackets (64 players → 8 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(64);

      expect(matrix).toHaveLength(8);
      expect(matrix[0]).toEqual([1, 16, 17, 32, 33, 48, 49, 64]);
      expect(matrix[7]).toEqual([8, 9, 24, 25, 40, 41, 56, 57]);

      // Verify all seeds covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
    });

    it("should generate correct matrix for Phase 4 Master (32 players → 4 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(32);

      expect(matrix).toHaveLength(4);
      expect(matrix[0]).toEqual([1, 8, 9, 16, 17, 24, 25, 32]);
      expect(matrix[3]).toEqual([4, 5, 12, 13, 20, 21, 28, 29]);

      // Verify all seeds covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    });
  });

  describe("large scale tests", () => {
    it("should handle 128 players (16 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(128);

      expect(matrix).toHaveLength(16);

      // Verify first lobby
      expect(matrix[0]).toEqual([1, 32, 33, 64, 65, 96, 97, 128]);

      // Verify last lobby
      expect(matrix[15]).toEqual([16, 17, 48, 49, 80, 81, 112, 113]);

      // Verify all seeds present
      const allSeeds = new Set(matrix.flat());
      expect(allSeeds.size).toBe(128);
    });

    it("should handle 256 players (32 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(256);

      expect(matrix).toHaveLength(32);

      // Verify structure
      const allSeeds = matrix.flat();
      expect(allSeeds).toHaveLength(256);
      expect(new Set(allSeeds).size).toBe(256);

      // Check min and max
      expect(Math.min(...allSeeds)).toBe(1);
      expect(Math.max(...allSeeds)).toBe(256);
    });

    it("should handle stress test with 512 players (64 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(512);

      expect(matrix).toHaveLength(64);

      // Verify all seeds unique and complete
      const allSeeds = matrix.flat();
      expect(allSeeds).toHaveLength(512);
      expect(new Set(allSeeds).size).toBe(512);
      expect(Math.min(...allSeeds)).toBe(1);
      expect(Math.max(...allSeeds)).toBe(512);
    });
  });

  describe("edge cases", () => {
    it("should distribute evenly for all valid multiples of 8", () => {
      // Test various multiples of 8
      const testCases = [
        8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128,
      ];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeDraftMatrix(playerCount);
        const lobbyCount = playerCount / 8;

        expect(matrix.length).toBe(lobbyCount);

        // Each lobby should have exactly 8 players
        matrix.forEach((lobby) => {
          expect(lobby.length).toBe(8);
        });

        // All seeds should be present and unique
        const allSeeds = matrix.flat();
        expect(new Set(allSeeds).size).toBe(playerCount);
      });
    });
  });

  describe("startSeed parameter", () => {
    it("should work with default startSeed=1", () => {
      const matrix = generateSnakeDraftMatrix(16);
      const allSeeds = matrix.flat().sort((a, b) => a - b);

      expect(allSeeds).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      ]);
      expect(Math.min(...allSeeds)).toBe(1);
      expect(Math.max(...allSeeds)).toBe(16);
    });

    it("should generate matrix with custom startSeed for Phase 2 (96 players starting at seed 33)", () => {
      const matrix = generateSnakeDraftMatrix(96, 33);

      expect(matrix).toHaveLength(12);

      // First lobby should start at 33 and end at 128 (33 + 96 - 1)
      expect(matrix[0]).toEqual([33, 56, 57, 80, 81, 104, 105, 128]);

      // Last lobby
      expect(matrix[11]).toEqual([44, 45, 68, 69, 92, 93, 116, 117]);

      // Verify all seeds are in range 33-128
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 96 }, (_, i) => i + 33));
      expect(Math.min(...allSeeds)).toBe(33);
      expect(Math.max(...allSeeds)).toBe(128);
    });

    it("should generate matrix with startSeed=10 for 32 players", () => {
      const matrix = generateSnakeDraftMatrix(32, 10);

      expect(matrix).toHaveLength(4);

      // First lobby: starting at 10, ending at 41 (10 + 32 - 1)
      expect(matrix[0]).toEqual([10, 17, 18, 25, 26, 33, 34, 41]);

      // Verify all seeds are in range 10-41
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 32 }, (_, i) => i + 10));
      expect(Math.min(...allSeeds)).toBe(10);
      expect(Math.max(...allSeeds)).toBe(41);
    });

    it("should throw error if startSeed < 1", () => {
      expect(() => generateSnakeDraftMatrix(16, 0)).toThrow(
        "startSeed must be at least 1",
      );
      expect(() => generateSnakeDraftMatrix(16, -5)).toThrow(
        "startSeed must be at least 1",
      );
    });

    it("should preserve snake draft pattern with non-default startSeed", () => {
      const matrixDefault = generateSnakeDraftMatrix(16, 1);
      const matrixOffset = generateSnakeDraftMatrix(16, 100);

      // Pattern should be the same, just offset by 99
      for (let i = 0; i < matrixDefault.length; i++) {
        for (let j = 0; j < matrixDefault[i].length; j++) {
          expect(matrixOffset[i][j]).toBe(matrixDefault[i][j] + 99);
        }
      }
    });
  });
});
