import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type CsvRow = {
  Part: string;
  Color: string;
  Quantity: string;
  "Is Spare": string;
};

type InventoryItem = {
  part: string;
  name: string;
  color: string;
  colorName: string;
  quantity: number;
  isSpare: boolean;
  imageSource: string;
};

type StepCallout = {
  part: string;
  color: string;
  quantity: number;
};

type FixtureExpectation = {
  fixtureId: string;
  synthetic: boolean;
  pdfKind: string;
  partNumberSource: string;
  pageCount: number;
  inventory: InventoryItem[];
  steps: Array<{
    stepNumber: number;
    pageNumber: number;
    callouts: StepCallout[];
    pieceCount: number;
  }>;
  expectedBags: Array<{
    sequence: number;
    pieceCount: number;
    items: StepCallout[];
  }>;
};

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "mock-mocs");
const defaultFixtureIds = ["small", "medium"] as const;
const largeFixtureIds = ["large"] as const;
const fixtureIds =
  process.env.CHECK_LARGE_MOC_FIXTURE === "1"
    ? [...defaultFixtureIds, ...largeFixtureIds]
    : [...defaultFixtureIds];
const commonRebrickableParts = new Set([
  "2420",
  "2431",
  "2450",
  "2456",
  "2780",
  "3001",
  "3002",
  "3003",
  "3004",
  "3005",
  "3008",
  "3009",
  "3010",
  "3020",
  "3021",
  "3022",
  "3023",
  "3024",
  "3031",
  "3032",
  "3033",
  "3034",
  "3035",
  "3036",
  "3037",
  "3039",
  "3040b",
  "3062b",
  "3068b",
  "3070b",
  "32000",
  "32013",
  "32016",
  "32028",
  "32039",
  "32054",
  "32062",
  "32064a",
  "32123b",
  "32523",
  "3622",
  "3623",
  "3626c",
  "3660",
  "3665",
  "3666",
  "3710",
  "3795",
  "3832",
  "3937",
  "3938",
  "4070",
  "4081b",
  "4150",
  "4162",
  "41769",
  "4274",
  "4286",
  "43093",
  "44728",
  "4488",
  "4599b",
  "4624",
  "48336",
  "54200",
  "60470b",
  "60478",
  "60479",
  "60592",
  "6091",
  "6141",
  "6231",
  "63868",
  "63965",
  "85984",
  "87087",
  "87544",
  "87580",
  "98138",
  "98283",
  "99207",
  "11211",
  "15068",
  "15573",
  "15712",
  "18654",
]);

function parseCsv(text: string): CsvRow[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  if (!headerLine) {
    throw new Error("CSV fixture is empty");
  }
  const headers = headerLine.split(",");

  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    ) as CsvRow;
  });
}

function readFixture(fixtureId: string) {
  const directory = join(fixtureRoot, fixtureId);
  const expected = JSON.parse(
    readFileSync(join(directory, "expected.json"), "utf8"),
  ) as FixtureExpectation;
  const csv = parseCsv(readFileSync(join(directory, "parts.csv"), "utf8"));
  const pdfPath = join(directory, "manual.pdf");

  return { csv, expected, pdfPath };
}

function readPdfHeader(pdfPath: string) {
  const descriptor = openSync(pdfPath, "r");
  const header = Buffer.alloc(5);

  try {
    readSync(descriptor, header, 0, header.length, 0);
  } finally {
    closeSync(descriptor);
  }

  return header.toString("utf8");
}

describe("mock MOC fixtures", () => {
  it.each(fixtureIds)(
    "%s fixture has consistent inventory, steps, bags, and PDF",
    (fixtureId) => {
      const { csv, expected, pdfPath } = readFixture(fixtureId);
      const pdfHeader = readPdfHeader(pdfPath);

      expect(expected.fixtureId).toBe(fixtureId);
      expect(expected.synthetic).toBe(true);
      expect(expected.pdfKind).toBe("raster-image-only");
      expect(expected.partNumberSource).toBe("common-rebrickable-parts");
      expect(expected.pageCount).toBeGreaterThan(0);
      expect(statSync(pdfPath).size).toBeGreaterThan(10_000);
      expect(pdfHeader).toBe("%PDF-");

      expect(csv).toHaveLength(expected.inventory.length);
      expect(csv.map((row) => row.Part)).toEqual(
        expected.inventory.map((item) => item.part),
      );
      expect(
        expected.inventory.every((item) => commonRebrickableParts.has(item.part)),
      ).toBe(true);
      expect(expected.inventory.every((item) => item.name.length > 0)).toBe(true);
      expect(csv.map((row) => row.Color)).toEqual(
        expected.inventory.map((item) => item.color),
      );
      expect(expected.inventory.every((item) => item.colorName.length > 0)).toBe(
        true,
      );
      expect(
        expected.inventory.every((item) =>
          [
            "rebrickable-ldraw",
            "rebrickable-api",
            "rebrickable-ldraw-fallback-color",
            "rebrickable-api-fallback-color",
          ].includes(item.imageSource),
        ),
      ).toBe(true);
      expect(csv.map((row) => Number(row.Quantity))).toEqual(
        expected.inventory.map((item) => item.quantity),
      );

      const inventoryTotal = expected.inventory.reduce(
        (total, item) => total + item.quantity,
        0,
      );
      const stepTotal = expected.steps.reduce(
        (total, step) => total + step.pieceCount,
        0,
      );
      const calloutTotal = expected.steps.reduce(
        (total, step) =>
          total +
          step.callouts.reduce(
            (stepSum, callout) => stepSum + callout.quantity,
            0,
          ),
        0,
      );
      const bagTotal = expected.expectedBags.reduce(
        (total, bag) => total + bag.pieceCount,
        0,
      );

      expect(stepTotal).toBe(inventoryTotal);
      expect(calloutTotal).toBe(inventoryTotal);
      expect(bagTotal).toBe(inventoryTotal);
    },
  );
});
