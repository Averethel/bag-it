import { describe, expect, it } from "vitest";

import { parseRebrickablePartsCsv } from "./rebrickable-csv";

describe("parseRebrickablePartsCsv", () => {
  it("parses Rebrickable parts CSV rows", () => {
    const result = parseRebrickablePartsCsv(
      [
        "Part,Color,Quantity,Is Spare",
        "3001,0,2,False",
        "3040b,72,4,True",
      ].join("\n"),
    );

    expect(result.warnings).toEqual([]);
    expect(result.items).toEqual([
      {
        id: "rebrickable-csv-row-1",
        sequence: 1,
        partNumber: "3001",
        color: "0",
        colorName: "Black",
        quantity: 2,
        isSpare: false,
      },
      {
        id: "rebrickable-csv-row-2",
        sequence: 2,
        partNumber: "3040b",
        color: "72",
        colorName: "Dark Bluish Gray",
        quantity: 4,
        isSpare: true,
      },
    ]);
  });

  it("reports missing required columns", () => {
    const result = parseRebrickablePartsCsv("Part,Quantity\n3001,2");

    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([
      "CSV must include Part, Color, and Quantity columns.",
    ]);
  });
});
