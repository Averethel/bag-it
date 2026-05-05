import type { RebrickableCatalogPart } from "./rebrickable-catalog";
import type { VisualPartDescriptor } from "./visual-part-matching";

export type RebrickableInventoryItem = {
  id: string;
  sequence: number;
  partNumber: string;
  color: string;
  colorName: string | null;
  colorRgb?: string | null;
  quantity: number;
  isSpare: boolean;
  catalogPart?: RebrickableCatalogPart;
  catalogImageDescriptor?: VisualPartDescriptor | null;
};

export type RebrickableCsvParseResult = {
  items: RebrickableInventoryItem[];
  warnings: string[];
};

const requiredColumnAliases = {
  part: ["part", "partnum", "partnumber"],
  color: ["color", "colorid", "colour", "colourid"],
  quantity: ["quantity", "qty", "count"],
} as const;

const optionalColumnAliases = {
  isSpare: ["isspare", "spare"],
} as const;

const rebrickableColorNamesById: Record<string, string> = {
  "0": "Black",
  "1": "Blue",
  "2": "Green",
  "4": "Red",
  "14": "Yellow",
  "15": "White",
  "19": "Tan",
  "25": "Orange",
  "28": "Dark Tan",
  "47": "Transparent",
  "70": "Reddish Brown",
  "71": "Light Bluish Gray",
  "72": "Dark Bluish Gray",
  "179": "Flat Silver",
};

export function parseRebrickablePartsCsv(
  text: string,
): RebrickableCsvParseResult {
  const rows = parseCsvText(text);
  const warnings: string[] = [];
  const [headers, ...dataRows] = rows;

  if (!headers || headers.length === 0) {
    return {
      items: [],
      warnings: ["CSV file is empty."],
    };
  }

  const headerLookup = createHeaderLookup(headers);
  const partIndex = findHeaderIndex(headerLookup, requiredColumnAliases.part);
  const colorIndex = findHeaderIndex(headerLookup, requiredColumnAliases.color);
  const quantityIndex = findHeaderIndex(
    headerLookup,
    requiredColumnAliases.quantity,
  );
  const isSpareIndex = findHeaderIndex(
    headerLookup,
    optionalColumnAliases.isSpare,
  );

  if (partIndex === null || colorIndex === null || quantityIndex === null) {
    return {
      items: [],
      warnings: [
        "CSV must include Part, Color, and Quantity columns.",
      ],
    };
  }

  const items = dataRows.flatMap((row, index): RebrickableInventoryItem[] => {
    const partNumber = normalizePartNumber(row[partIndex] ?? "");
    const color = (row[colorIndex] ?? "").trim();
    const quantity = readPositiveInteger(row[quantityIndex]);

    if (!partNumber && !color && row.every((cell) => !cell.trim())) {
      return [];
    }

    if (!partNumber || !color || quantity === null) {
      warnings.push(`Skipped CSV row ${index + 2}: missing part, color, or quantity.`);
      return [];
    }

    return [
      {
        id: `rebrickable-csv-row-${index + 1}`,
        sequence: index + 1,
        partNumber,
        color,
        colorName: describeRebrickableColor(color),
        quantity,
        isSpare:
          isSpareIndex !== null ? readBoolean(row[isSpareIndex] ?? "") : false,
      },
    ];
  });

  if (items.length === 0 && warnings.length === 0) {
    warnings.push("CSV did not contain any inventory rows.");
  }

  return { items, warnings };
}

export function describeRebrickableColor(color: string) {
  const trimmedColor = color.trim();

  if (!trimmedColor) {
    return null;
  }

  return rebrickableColorNamesById[trimmedColor] ?? trimmedColor;
}

export function normalizePartNumber(partNumber: string) {
  return partNumber.trim().toLowerCase();
}

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inQuotes) {
      if (character === "\"" && nextCharacter === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") {
        inQuotes = false;
      } else {
        cell += character;
      }

      continue;
    }

    if (character === "\"") {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (character !== "\r") {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((csvRow, index) => {
    if (index === rows.length - 1) {
      return csvRow.some((csvCell) => csvCell.trim().length > 0);
    }

    return true;
  });
}

function createHeaderLookup(headers: string[]) {
  return new Map(
    headers.map((header, index) => [normalizeHeader(header), index] as const),
  );
}

function findHeaderIndex(
  headerLookup: Map<string, number>,
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const index = headerLookup.get(alias);

    if (index !== undefined) {
      return index;
    }
  }

  return null;
}

function normalizeHeader(header: string) {
  return header.replace(/^\uFEFF/, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function readPositiveInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readBoolean(value: string) {
  return /^(?:true|yes|1)$/i.test(value.trim());
}
