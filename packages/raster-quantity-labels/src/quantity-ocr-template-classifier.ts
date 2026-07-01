import type { DigitClassifierRead } from "./quantity-ocr-types"

export function classifyByTemplate(cells: readonly boolean[]): DigitClassifierRead | null {
  return Object.entries(DIGIT_TEMPLATES)
    .map(([digit, template]) => ({
      confidence: templateSimilarity(cells, template),
      digit,
    }))
    .sort((left, right) => right.confidence - left.confidence)[0] ?? null
}

function templateSimilarity(cells: readonly boolean[], template: readonly string[]): number {
  let intersection = 0
  let union = 0

  for (let index = 0; index < cells.length; index += 1) {
    const expected = template[Math.floor(index / 5)]?.[index % 5] === "1"
    const actual = cells[index] ?? false

    intersection += expected && actual ? 1 : 0
    union += expected || actual ? 1 : 0
  }

  return union === 0 ? 0 : intersection / union
}

const DIGIT_TEMPLATES: Record<string, readonly string[]> = {
  "0": ["11111", "10001", "10001", "10001", "10001", "10001", "11111"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11110", "00001", "00001", "11110", "10000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
}
