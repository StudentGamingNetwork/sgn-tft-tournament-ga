/**
 * Tests for Swiss contiguous balanced seeding algorithm
 */

import { describe, it, expect } from "vitest";
import {
  generateSnakeDraftMatrix,
  generateSnakeSeedMatrix,
} from "./seeding-matrices";

describe("generateSnakeDraftMatrix", () => {
  describe("validation", () => {
    it("should throw error if playerCount is less than 1", () => {
      expect(() => generateSnakeDraftMatrix(0)).toThrow("must be at least 1");
    });

    it("should accept any player count >= 1", () => {
      expect(() => generateSnakeDraftMatrix(1)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(4)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(7)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(8)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(10)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(52)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(16)).not.toThrow();
      expect(() => generateSnakeDraftMatrix(128)).not.toThrow();
    });
  });

  describe("matrix structure", () => {
    it("should generate correct number of lobbies", () => {
      expect(generateSnakeDraftMatrix(1)).toHaveLength(1);
      expect(generateSnakeDraftMatrix(7)).toHaveLength(1);
      expect(generateSnakeDraftMatrix(8)).toHaveLength(1);
      expect(generateSnakeDraftMatrix(16)).toHaveLength(2);
      expect(generateSnakeDraftMatrix(50)).toHaveLength(7);
      expect(generateSnakeDraftMatrix(52)).toHaveLength(7);
      expect(generateSnakeDraftMatrix(64)).toHaveLength(8);
      expect(generateSnakeDraftMatrix(128)).toHaveLength(16);
    });

    it("should keep lobby sizes balanced (difference <= 1)", () => {
      const testCases = [
        1, 2, 3, 4, 5, 7, 8, 9, 10, 15, 17, 49, 50, 52, 64, 96, 104, 128,
      ];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeDraftMatrix(playerCount);
        const lobbySizes = matrix.map((lobby) => lobby.length);
        expect(
          Math.max(...lobbySizes) - Math.min(...lobbySizes),
        ).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("seed coverage", () => {
    it("should include all seeds from 1 to playerCount", () => {
      const testCases = [1, 4, 7, 8, 16, 32, 64, 96, 128];

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
      const testCases = [1, 4, 7, 8, 16, 32, 64, 96, 128, 256];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeDraftMatrix(playerCount);
        const allSeeds = matrix.flat();
        const uniqueSeeds = new Set(allSeeds);

        expect(uniqueSeeds.size).toBe(allSeeds.length);
      });
    });
  });

  describe("snake draft pattern", () => {
    it("should generate contiguous blocks for 7 players", () => {
      const matrix = generateSnakeDraftMatrix(7);
      expect(matrix).toEqual([[1, 2, 3, 4, 5, 6, 7]]);
    });

    it("should generate contiguous blocks for 8 players", () => {
      const matrix = generateSnakeDraftMatrix(8);
      expect(matrix).toEqual([[1, 2, 3, 4, 5, 6, 7, 8]]);
    });

    it("should generate contiguous blocks for 16 players", () => {
      const matrix = generateSnakeDraftMatrix(16);
      expect(matrix).toEqual([
        [1, 2, 3, 4, 5, 6, 7, 8],
        [9, 10, 11, 12, 13, 14, 15, 16],
      ]);
    });

    it("should generate contiguous balanced blocks for 52 players", () => {
      const matrix = generateSnakeDraftMatrix(52);

      expect(matrix).toHaveLength(7);
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(matrix[1]).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
      expect(matrix[6]).toEqual([46, 47, 48, 49, 50, 51, 52]);
    });
  });

  describe("tournament-specific scenarios", () => {
    it("should generate correct matrix for Phase 1 (104 players → 13 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(104);

      expect(matrix).toHaveLength(13);
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(matrix[12]).toEqual([97, 98, 99, 100, 101, 102, 103, 104]);

      // Verify all seeds covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 104 }, (_, i) => i + 1));
    });

    it("should generate correct matrix for Phase 2 (96 players → 12 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(96);

      expect(matrix).toHaveLength(12);
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(matrix[11]).toEqual([89, 90, 91, 92, 93, 94, 95, 96]);

      // Verify all seeds covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 96 }, (_, i) => i + 1));
    });

    it("should generate correct matrix for Phase 3/4 brackets (64 players → 8 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(64);

      expect(matrix).toHaveLength(8);
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(matrix[7]).toEqual([57, 58, 59, 60, 61, 62, 63, 64]);

      // Verify all seeds covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
    });

    it("should generate correct matrix for Phase 4 Master (32 players → 4 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(32);

      expect(matrix).toHaveLength(4);
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(matrix[3]).toEqual([25, 26, 27, 28, 29, 30, 31, 32]);

      // Verify all seeds covered
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    });
  });

  describe("large scale tests", () => {
    it("should handle 128 players (16 lobbies)", () => {
      const matrix = generateSnakeDraftMatrix(128);

      expect(matrix).toHaveLength(16);

      // Verify first and last lobbies
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(matrix[15]).toEqual([121, 122, 123, 124, 125, 126, 127, 128]);

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
    it("should distribute evenly for a wide range of counts", () => {
      const testCases = [
        1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 16, 24, 25, 32, 40, 48, 49, 50, 52,
        56, 64, 72, 80, 88, 96, 104, 112, 120, 128,
      ];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeDraftMatrix(playerCount);
        const sizes = matrix.map((lobby) => lobby.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);

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

      expect(matrix[0]).toEqual([33, 34, 35, 36, 37, 38, 39, 40]);
      expect(matrix[11]).toEqual([121, 122, 123, 124, 125, 126, 127, 128]);

      // Verify all seeds are in range 33-128
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 96 }, (_, i) => i + 33));
      expect(Math.min(...allSeeds)).toBe(33);
      expect(Math.max(...allSeeds)).toBe(128);
    });

    it("should generate matrix with startSeed=10 for 32 players", () => {
      const matrix = generateSnakeDraftMatrix(32, 10);

      expect(matrix).toHaveLength(4);

      expect(matrix[0]).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);

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

    it("should preserve contiguous pattern with non-default startSeed", () => {
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

describe("generateSnakeSeedMatrix", () => {
  describe("validation", () => {
    it("should throw error if playerCount is less than 1", () => {
      expect(() => generateSnakeSeedMatrix(0)).toThrow("must be at least 1");
    });

    it("should throw error if startSeed is less than 1", () => {
      expect(() => generateSnakeSeedMatrix(16, 0)).toThrow(
        "startSeed must be at least 1",
      );
      expect(() => generateSnakeSeedMatrix(16, -5)).toThrow(
        "startSeed must be at least 1",
      );
    });

    it("should accept any player count >= 1", () => {
      expect(() => generateSnakeSeedMatrix(1)).not.toThrow();
      expect(() => generateSnakeSeedMatrix(4)).not.toThrow();
      expect(() => generateSnakeSeedMatrix(16)).not.toThrow();
      expect(() => generateSnakeSeedMatrix(32)).not.toThrow();
    });
  });

  describe("matrix structure", () => {
    it("should generate correct number of lobbies", () => {
      expect(generateSnakeSeedMatrix(1)).toHaveLength(1);
      expect(generateSnakeSeedMatrix(8)).toHaveLength(1);
      expect(generateSnakeSeedMatrix(16)).toHaveLength(2);
      expect(generateSnakeSeedMatrix(32)).toHaveLength(4);
      expect(generateSnakeSeedMatrix(64)).toHaveLength(8);
    });

    it("should keep lobby sizes balanced (difference <= 1)", () => {
      const testCases = [1, 2, 3, 4, 5, 7, 8, 9, 10, 15, 16, 32, 64];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeSeedMatrix(playerCount);
        const lobbySizes = matrix.map((lobby) => lobby.length);
        expect(
          Math.max(...lobbySizes) - Math.min(...lobbySizes),
        ).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("seed coverage", () => {
    it("should include all seeds from 1 to playerCount", () => {
      const testCases = [1, 4, 8, 16, 32, 64];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeSeedMatrix(playerCount);
        const allSeeds = matrix.flat();

        for (let seed = 1; seed <= playerCount; seed++) {
          expect(allSeeds).toContain(seed);
        }

        expect(allSeeds).toHaveLength(playerCount);
      });
    });

    it("should have no duplicate seeds", () => {
      const testCases = [1, 4, 8, 16, 32, 64];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeSeedMatrix(playerCount);
        const allSeeds = matrix.flat();
        const uniqueSeeds = new Set(allSeeds);

        expect(uniqueSeeds.size).toBe(allSeeds.length);
      });
    });
  });

  describe("snake pattern", () => {
    it("should generate snake pattern for Phase 3 Master (32 players → 4 lobbies)", () => {
      const matrix = generateSnakeSeedMatrix(32);

      expect(matrix).toHaveLength(4);
      // Correct snake pattern:
      expect(matrix[0]).toEqual([1, 8, 9, 16, 17, 24, 25, 32]);
      expect(matrix[1]).toEqual([2, 7, 10, 15, 18, 23, 26, 31]);
      expect(matrix[2]).toEqual([3, 6, 11, 14, 19, 22, 27, 30]);
      expect(matrix[3]).toEqual([4, 5, 12, 13, 20, 21, 28, 29]);
    });

    it("should generate snake pattern for Phase 4 Master (16 players → 2 lobbies)", () => {
      const matrix = generateSnakeSeedMatrix(16);

      expect(matrix).toHaveLength(2);
      // Correct snake pattern (8 groups of 2 seeds, alternating direction):
      expect(matrix[0]).toEqual([1, 4, 5, 8, 9, 12, 13, 16]);
      expect(matrix[1]).toEqual([2, 3, 6, 7, 10, 11, 14, 15]);
    });

    it("should generate alternating forward-reverse pattern", () => {
      const matrix = generateSnakeSeedMatrix(8);

      expect(matrix).toHaveLength(1);
      // Single lobby: just forward
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("should generate correct snake pattern for 24 players (3 lobbies)", () => {
      const matrix = generateSnakeSeedMatrix(24);

      expect(matrix).toHaveLength(3);
      // Group 0 (even): forward [1,2,3]
      // Group 1 (odd): reverse [8,7,6]
      // Group 2 (even): forward [9,10,11]
      // Group 3 (odd): reverse [16,15,14]
      expect(matrix[0]).toEqual([1, 6, 7, 12, 13, 18, 19, 24]);
      expect(matrix[1]).toEqual([2, 5, 8, 11, 14, 17, 20, 23]);
      expect(matrix[2]).toEqual([3, 4, 9, 10, 15, 16, 21, 22]);
    });
  });

  describe("tournament-specific scenarios", () => {
    it("should match expected pattern for Phase 3 Master (32 players)", () => {
      const matrix = generateSnakeSeedMatrix(32);

      // Verify all seeds
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));

      // Verify snake alternation
      expect(matrix[0][1]).toBe(8); // First lobby gets 8 (end of first group, reversed)
      expect(matrix[0][2]).toBe(9); // Then gets 9 (start of next group, forward)
    });

    it("should match expected pattern for Phase 4 Master (16 players)", () => {
      const matrix = generateSnakeSeedMatrix(16);

      // Verify all seeds
      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));

      // Verify snake alternation
      expect(matrix[0]).toEqual([1, 4, 5, 8, 9, 12, 13, 16]);
      expect(matrix[1]).toEqual([2, 3, 6, 7, 10, 11, 14, 15]);
    });
  });

  describe("startSeed parameter", () => {
    it("should work with default startSeed=1", () => {
      const matrix = generateSnakeSeedMatrix(16);
      const allSeeds = matrix.flat().sort((a, b) => a - b);

      expect(allSeeds).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      ]);
      expect(Math.min(...allSeeds)).toBe(1);
      expect(Math.max(...allSeeds)).toBe(16);
    });

    it("should generate snake matrix with custom startSeed", () => {
      const matrix = generateSnakeSeedMatrix(16, 100);

      expect(matrix).toHaveLength(2);

      const allSeeds = matrix.flat().sort((a, b) => a - b);
      expect(allSeeds).toEqual(Array.from({ length: 16 }, (_, i) => i + 100));
      expect(Math.min(...allSeeds)).toBe(100);
      expect(Math.max(...allSeeds)).toBe(115);
    });

    it("should preserve snake pattern with custom startSeed", () => {
      const matrixDefault = generateSnakeSeedMatrix(32);
      const matrixOffset = generateSnakeSeedMatrix(32, 100);

      // Verify offset relationship
      for (let i = 0; i < matrixDefault.length; i++) {
        for (let j = 0; j < matrixDefault[i].length; j++) {
          expect(matrixOffset[i][j]).toBe(matrixDefault[i][j] + 99);
        }
      }
    });
  });

  describe("edge cases", () => {
    it("should handle single lobby", () => {
      const matrix = generateSnakeSeedMatrix(7);

      expect(matrix).toHaveLength(1);
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("should handle exactly 8 players (one lobby)", () => {
      const matrix = generateSnakeSeedMatrix(8);

      expect(matrix).toHaveLength(1);
      expect(matrix[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("should handle multiple of 8", () => {
      const testCases = [8, 16, 24, 32, 40, 48, 56, 64];

      testCases.forEach((playerCount) => {
        const matrix = generateSnakeSeedMatrix(playerCount);
        const allSeeds = matrix.flat();

        expect(allSeeds).toHaveLength(playerCount);
        expect(new Set(allSeeds).size).toBe(playerCount);
      });
    });
  });
});
