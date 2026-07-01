import type { StepSourceRegion } from "../steps/step-detection-contracts"

export interface StepCalloutBagCompletionAnchor {
  calloutRegion: StepSourceRegion
  itemIndexOnCallout: number
  manualFingerprint: string
  pageNumber: number
  pageRenderHeight: number | null
  pageRenderWidth: number | null
  partRegion: StepSourceRegion
  quantityLabelRegion?: StepSourceRegion
}

interface AnchoredBagRow {
  anchor: StepCalloutBagCompletionAnchor
  id: string
}

const CALLOUT_OVERLAP_MIN = 0.72
const PART_OVERLAP_MIN = 0.58
const QUANTITY_LABEL_OVERLAP_TIE_BREAK = 0.5
const ANCHOR_SCORE_AMBIGUITY_MARGIN = 0.2
const ITEM_INDEX_MATCH_SCORE = 0.1

export function transferCheckedBagRowsByAnchor(
  anchors: Iterable<StepCalloutBagCompletionAnchor>,
  rows: AnchoredBagRow[],
  manualFingerprint: string,
): {
  checkedRows: Record<string, StepCalloutBagCompletionAnchor>
  droppedCount: number
  restoredCount: number
} {
  const checkedRows: Record<string, StepCalloutBagCompletionAnchor> = {}
  let droppedCount = 0

  for (const anchor of anchors) {
    if (anchor.manualFingerprint !== manualFingerprint) {
      droppedCount += 1
      continue
    }

    const matches = rows
      .map((row) => ({
        row,
        score: scoreAnchorMatch(anchor, row.anchor),
      }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score)

    if (
      matches.length === 1 ||
      (matches.length > 1 &&
        matches[0].score > matches[1].score + ANCHOR_SCORE_AMBIGUITY_MARGIN)
    ) {
      checkedRows[matches[0].row.id] = matches[0].row.anchor
      continue
    }

    droppedCount += 1
  }

  return {
    checkedRows,
    droppedCount,
    restoredCount: Object.keys(checkedRows).length,
  }
}

export function sanitizeBagCompletionAnchors(
  value: unknown,
): StepCalloutBagCompletionAnchor[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((anchor) => parseCompletionAnchor(anchor))
    .filter((anchor): anchor is StepCalloutBagCompletionAnchor => Boolean(anchor))
}

function scoreAnchorMatch(
  saved: StepCalloutBagCompletionAnchor,
  candidate: StepCalloutBagCompletionAnchor,
): number {
  if (
    saved.manualFingerprint !== candidate.manualFingerprint ||
    saved.pageNumber !== candidate.pageNumber
  ) {
    return 0
  }

  const calloutOverlap = overlapRatio(saved.calloutRegion, candidate.calloutRegion)
  const partOverlap = overlapRatio(saved.partRegion, candidate.partRegion)

  if (calloutOverlap < CALLOUT_OVERLAP_MIN || partOverlap < PART_OVERLAP_MIN) {
    return 0
  }

  const quantityOverlap =
    saved.quantityLabelRegion && candidate.quantityLabelRegion
      ? overlapRatio(saved.quantityLabelRegion, candidate.quantityLabelRegion)
      : 0
  const itemIndexScore =
    saved.itemIndexOnCallout === candidate.itemIndexOnCallout
      ? ITEM_INDEX_MATCH_SCORE
      : 0

  return calloutOverlap + partOverlap + quantityOverlap * QUANTITY_LABEL_OVERLAP_TIE_BREAK + itemIndexScore
}

function overlapRatio(left: StepSourceRegion, right: StepSourceRegion): number {
  const x1 = Math.max(left.x, right.x)
  const y1 = Math.max(left.y, right.y)
  const x2 = Math.min(left.x + left.width, right.x + right.width)
  const y2 = Math.min(left.y + left.height, right.y + right.height)
  const overlapArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const smallerArea = Math.min(left.width * left.height, right.width * right.height)

  return smallerArea <= 0 ? 0 : overlapArea / smallerArea
}

function parseCompletionAnchor(value: unknown): StepCalloutBagCompletionAnchor | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.manualFingerprint !== "string" ||
    typeof value.pageNumber !== "number" ||
    typeof value.itemIndexOnCallout !== "number" ||
    !isSourceRegion(value.calloutRegion) ||
    !isSourceRegion(value.partRegion) ||
    (value.quantityLabelRegion !== undefined && !isSourceRegion(value.quantityLabelRegion))
  ) {
    return null
  }

  return {
    calloutRegion: value.calloutRegion,
    itemIndexOnCallout: value.itemIndexOnCallout,
    manualFingerprint: value.manualFingerprint,
    pageNumber: value.pageNumber,
    pageRenderHeight:
      typeof value.pageRenderHeight === "number" ? value.pageRenderHeight : null,
    pageRenderWidth:
      typeof value.pageRenderWidth === "number" ? value.pageRenderWidth : null,
    partRegion: value.partRegion,
    ...(value.quantityLabelRegion
      ? { quantityLabelRegion: value.quantityLabelRegion }
      : {}),
  }
}

function isSourceRegion(value: unknown): value is StepSourceRegion {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
