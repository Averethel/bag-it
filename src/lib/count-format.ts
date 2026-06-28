type CountCategory = "zero" | "one" | "two" | "few" | "many" | "other"

export type CountLabels = Partial<Record<CountCategory, string>> & {
  one: string
  other: string
}

export const COUNT_LABELS = {
  ambiguousRow: { one: "ambiguous row", other: "ambiguous rows" },
  bag: { one: "bag", other: "bags" },
  callout: { one: "callout", other: "callouts" },
  crop: { one: "crop", other: "crops" },
  detectedPart: { one: "detected part", other: "detected parts" },
  group: { one: "group", other: "groups" },
  packedRow: { one: "packed row", other: "packed rows" },
  page: { one: "page", other: "pages" },
  part: { one: "part", other: "parts" },
  partRow: { one: "part row", other: "part rows" },
  review: { one: "review", other: "reviews" },
  row: { one: "row", other: "rows" },
  scannedPage: { one: "scanned page", other: "scanned pages" },
  sourceRow: { one: "source row", other: "source rows" },
  stepCallout: { one: "step callout", other: "step callouts" },
} satisfies Record<string, CountLabels>

const countPluralRules = new Intl.PluralRules("en", { type: "cardinal" })

export function formatCount(count: number, labels: CountLabels): string {
  return `${count} ${selectCountLabel(count, labels)}`
}

export function formatCountRatio(
  currentCount: number,
  totalCount: number,
  labels: CountLabels,
): string {
  return `${currentCount}/${totalCount} ${selectCountLabel(totalCount, labels)}`
}

export function selectCountLabel(count: number, labels: CountLabels): string {
  const category = countPluralRules.select(count) as CountCategory

  return labels[category] ?? labels.other
}
