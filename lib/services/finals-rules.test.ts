import { describe, expect, it } from "vitest";

import {
  getCappedFinalsGamesTotal,
  getFinalistThresholdByBracket,
  getFinalsMaxGamesByBracket,
  isFinalistByThreshold,
} from "./finals-rules";

describe("finals-rules", () => {
  it("returns correct finalist threshold by bracket", () => {
    expect(getFinalistThresholdByBracket("challenger")).toBe(21);
    expect(getFinalistThresholdByBracket("master")).toBe(18);
    expect(getFinalistThresholdByBracket("amateur")).toBe(18);
    expect(getFinalistThresholdByBracket("unknown")).toBeNull();
  });

  it("marks finalists based on bracket threshold", () => {
    expect(isFinalistByThreshold(21, "challenger")).toBe(true);
    expect(isFinalistByThreshold(20, "challenger")).toBe(false);

    expect(isFinalistByThreshold(18, "master")).toBe(true);
    expect(isFinalistByThreshold(17, "master")).toBe(false);

    expect(isFinalistByThreshold(18, "amateur")).toBe(true);
    expect(isFinalistByThreshold(17, "amateur")).toBe(false);
  });

  it("returns finals max games by bracket", () => {
    expect(getFinalsMaxGamesByBracket("challenger")).toBe(7);
    expect(getFinalsMaxGamesByBracket("master")).toBe(6);
    expect(getFinalsMaxGamesByBracket("amateur")).toBe(6);
    expect(getFinalsMaxGamesByBracket("unknown")).toBe(6);
  });

  it("caps phase 5 total games correctly", () => {
    expect(getCappedFinalsGamesTotal(9, "challenger")).toBe(7);
    expect(getCappedFinalsGamesTotal(7, "challenger")).toBe(7);

    expect(getCappedFinalsGamesTotal(9, "master")).toBe(6);
    expect(getCappedFinalsGamesTotal(6, "master")).toBe(6);

    expect(getCappedFinalsGamesTotal(8, "amateur")).toBe(6);
  });
});
