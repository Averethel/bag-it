import type {
  PartMatchAlphaMask,
} from "@bag-it/part-matching"
import type {
  DetectedStepCallout,
  DetectedStepCalloutPartItem,
  StepCalloutDetectionResult,
  StepImagePreview,
  StepPagePreview,
  StepSourceRegion,
} from "../steps/step-detection-contracts"
import type { StepCalloutBagCompletionAnchor } from "./bag-completion-anchors"
import {
  calloutMultiplierFor,
  type StepCalloutMultiplierMap,
} from "./step-callout-multipliers"

export const STEP_CALLOUT_BAGGING_HEURISTIC_VERSION = "step-callout-bagging-v6"

type StepCalloutBaggingPolicyBandName = "small" | "medium" | "large" | "huge"
type StepCalloutBagStatus = "draft" | "review"
type StepCalloutBaggingPolicySource = "detected-callout-quantity" | "inventory"

export interface StepCalloutBaggingPolicy {
  band: StepCalloutBaggingPolicyBandName
  source: StepCalloutBaggingPolicySource
  minParts: number
  targetParts: number
  maxParts: number
  overfillToleranceParts: number
  targetSteps: number
  maxTargetSteps: number
  tinyBagThreshold: number
}

export interface StepCalloutBaggingPlan {
  heuristicVersion: typeof STEP_CALLOUT_BAGGING_HEURISTIC_VERSION
  policy: StepCalloutBaggingPolicy
  setPieceCount: number
  detectedStepCount: number
  detectedPartCount: number
  rawPartRowCount: number
  bags: StepCalloutBagPlan[]
}

export interface StepCalloutBagPlan {
  id: string
  label: string
  number: number
  status: StepCalloutBagStatus
  reviewReasons: string[]
  pageRange: {
    end: number
    label: string
    pages: number[]
    start: number
  }
  stepRange: {
    end: number
    start: number
  }
  partCount: number
  unknownQuantityCount: number
  callouts: StepCalloutBagCallout[]
}

export interface StepCalloutBagCallout {
  callout: DetectedStepCallout
  multiplier: number
  partCount: number
  unknownQuantityCount: number
}

export interface StepCalloutBagRow {
  anchor: StepCalloutBagCompletionAnchor
  bagId: string
  bagLabel: string
  bagNumber: number
  bagPageLabel: string
  calloutBackgroundHex: string
  calloutCrop: StepImageCrop | null
  calloutId: string
  calloutIndexOnPage: number
  color: StepCalloutBagRowColor
  id: string
  itemId: string
  itemIndexOnCallout: number
  pagePreview: StepImagePreview | null
  partCrop: StepImageCrop | null
  partImageAlphaMask: PartMatchAlphaMask | null
  quantity: number
  quantityEstimated: boolean
  quantityLabelCrop: StepImageCrop | null
  quantityText: string
  sourcePageNumber: number
  stepIndex: number
}

export interface StepCalloutBagRowColor {
  confidence: number | null
  family: string
  key: string
  manualClassId: string | null
  manualClassTrusted: boolean
  name: string
  status: string
  swatchHex: string | null
}

interface StepImageCrop {
  imageDataUrl?: string
  region: StepSourceRegion
}

interface PolicyBand {
  band: StepCalloutBaggingPolicyBandName
  maxSetPieceCount: number
  minParts: number
  targetParts: number
  maxParts: number
  maxTargetSteps: number
}

interface PageCalloutGroup {
  callouts: StepCalloutBagCallout[]
  hasSectionBoundaryBefore: boolean
  pageNumber: number
  partCount: number
  unknownQuantityCount: number
}

interface BagBuildState {
  callouts: StepCalloutBagCallout[]
  pageNumbers: number[]
  partCount: number
  sectionIndex: number
  unknownQuantityCount: number
}

const POLICY_BANDS: PolicyBand[] = [
  {
    band: "small",
    maxSetPieceCount: 500,
    minParts: 70,
    targetParts: 105,
    maxParts: 145,
    maxTargetSteps: 18,
  },
  {
    band: "medium",
    maxSetPieceCount: 1_200,
    minParts: 80,
    targetParts: 115,
    maxParts: 155,
    maxTargetSteps: 16,
  },
  {
    band: "large",
    maxSetPieceCount: 2_500,
    minParts: 95,
    targetParts: 130,
    maxParts: 170,
    maxTargetSteps: 14,
  },
  {
    band: "huge",
    maxSetPieceCount: Number.POSITIVE_INFINITY,
    minParts: 105,
    targetParts: 145,
    maxParts: 190,
    maxTargetSteps: 12,
  },
]

const MIN_TARGET_STEPS = 4

export function createStepCalloutBaggingPlan(
  result: StepCalloutDetectionResult,
  options: {
    calloutMultipliers?: StepCalloutMultiplierMap
    inventoryPartCount?: number | null
  } = {},
): StepCalloutBaggingPlan {
  const baggableCallouts = sortBaggableCallouts(result.callouts)
    .filter((callout) => callout.partItems.length > 0)
    .map((callout) => createBagCallout(callout, options.calloutMultipliers ?? {}))
  const detectedPartCount = baggableCallouts.reduce(
    (total, callout) => total + callout.partCount,
    0,
  )
  const setPieceCount = normalizeInventoryPartCount(options.inventoryPartCount) ?? detectedPartCount
  const policy = createPolicy(setPieceCount, baggableCallouts, options.inventoryPartCount)

  if (baggableCallouts.length === 0) {
    return {
      heuristicVersion: STEP_CALLOUT_BAGGING_HEURISTIC_VERSION,
      policy,
      setPieceCount,
      detectedStepCount: result.callouts.length,
      detectedPartCount,
      rawPartRowCount: 0,
      bags: [],
    }
  }

  const pageGroups = createPageGroups(result, baggableCallouts)
  const initialBags = createInitialBags(pageGroups, policy)
  const mergedBags = mergeUndersizedBags(initialBags, policy)
  const bags = mergedBags.map(createBagPlan)

  return {
    heuristicVersion: STEP_CALLOUT_BAGGING_HEURISTIC_VERSION,
    policy,
    setPieceCount,
    detectedStepCount: result.callouts.length,
    detectedPartCount,
    rawPartRowCount: baggableCallouts.reduce(
      (total, callout) => total + callout.callout.partItems.length,
      0,
    ),
    bags,
  }
}

export function createStepCalloutBagRows(
  plan: StepCalloutBaggingPlan,
  options: {
    manualFingerprint: string
    pagePreviews?: StepPagePreview[]
  },
): StepCalloutBagRow[] {
  const previewByPage = new Map(
    (options.pagePreviews ?? []).map((preview) => [preview.pageNumber, preview]),
  )

  return plan.bags.flatMap((bag) =>
    bag.callouts.flatMap((bagCallout) =>
      bagCallout.callout.partItems.map((item) =>
        createBagRow({
          bag,
          bagCallout,
          item,
          manualFingerprint: options.manualFingerprint,
          pagePreview: previewByPage.get(bagCallout.callout.pageNumber) ?? null,
        }),
      ),
    ),
  )
}

export function restoreCheckedBagRowsById(
  rowIds: Iterable<string>,
  rows: StepCalloutBagRow[],
): Record<string, StepCalloutBagCompletionAnchor> {
  const rowById = new Map(rows.map((row) => [row.id, row]))

  return Object.fromEntries(
    [...new Set(rowIds)]
      .map((rowId) => rowById.get(rowId))
      .filter((row): row is StepCalloutBagRow => Boolean(row))
      .map((row) => [row.id, row.anchor]),
  )
}

export function sanitizeCheckedBagRowIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value.filter((rowId): rowId is string => typeof rowId === "string"))]
}

function createBagCallout(
  callout: DetectedStepCallout,
  multipliers: StepCalloutMultiplierMap,
): StepCalloutBagCallout {
  const multiplier = calloutMultiplierFor(multipliers, callout.id)
  const summary = callout.partItems.reduce(
    (current, item) => {
      const quantity = trustedQuantityValue(item)

      return {
        partCount: current.partCount + quantity * multiplier,
        unknownQuantityCount:
          current.unknownQuantityCount + (item.quantity.value === null ? 1 : 0),
      }
    },
    { partCount: 0, unknownQuantityCount: 0 },
  )

  return {
    callout,
    multiplier,
    partCount: summary.partCount,
    unknownQuantityCount: summary.unknownQuantityCount,
  }
}

function createPolicy(
  setPieceCount: number,
  callouts: StepCalloutBagCallout[],
  inventoryPartCount: number | null | undefined,
): StepCalloutBaggingPolicy {
  const band = POLICY_BANDS.find((candidate) => setPieceCount <= candidate.maxSetPieceCount) ?? POLICY_BANDS[POLICY_BANDS.length - 1]
  const averagePartsPerCallout =
    callouts.length > 0
      ? Math.max(
          1,
          callouts.reduce((total, callout) => total + callout.partCount, 0) / callouts.length,
        )
      : 1
  const targetSteps = clampNumber(
    Math.round(band.targetParts / averagePartsPerCallout),
    MIN_TARGET_STEPS,
    band.maxTargetSteps,
  )
  const tinyBagThreshold = Math.max(
    5,
    Math.floor(band.minParts * 0.15),
    Math.floor(band.targetParts * 0.08),
  )

  return {
    band: band.band,
    source:
      normalizeInventoryPartCount(inventoryPartCount) === null
        ? "detected-callout-quantity"
        : "inventory",
    minParts: band.minParts,
    targetParts: band.targetParts,
    maxParts: band.maxParts,
    overfillToleranceParts: Math.max(20, Math.floor(band.maxParts * 0.15)),
    targetSteps,
    maxTargetSteps: band.maxTargetSteps,
    tinyBagThreshold,
  }
}

function createPageGroups(
  result: StepCalloutDetectionResult,
  callouts: StepCalloutBagCallout[],
): PageCalloutGroup[] {
  const groups = new Map<number, PageCalloutGroup>()
  const boundaryPages = new Set(
    (result.sectionBoundaryHints ?? [])
      .filter((hint) => hint.position === "before-page")
      .map((hint) => hint.pageNumber),
  )

  for (const pageNumber of sortedPageNumbers(result, callouts)) {
    groups.set(pageNumber, {
      callouts: [],
      hasSectionBoundaryBefore: boundaryPages.has(pageNumber),
      pageNumber,
      partCount: 0,
      unknownQuantityCount: 0,
    })
  }

  for (const callout of callouts) {
    const group = groups.get(callout.callout.pageNumber)

    if (!group) {
      continue
    }
    group.callouts.push(callout)
    group.partCount += callout.partCount
    group.unknownQuantityCount += callout.unknownQuantityCount
  }

  return [...groups.values()]
}

function sortedPageNumbers(
  result: StepCalloutDetectionResult,
  callouts: readonly StepCalloutBagCallout[],
): number[] {
  return [...new Set([
    ...result.scannedPageNumbers,
    ...result.callouts.map((callout) => callout.pageNumber),
    ...callouts.map((callout) => callout.callout.pageNumber),
    ...(result.sectionBoundaryHints ?? []).map((hint) => hint.pageNumber),
  ])].sort((left, right) => left - right)
}

function createInitialBags(
  pageGroups: PageCalloutGroup[],
  policy: StepCalloutBaggingPolicy,
): BagBuildState[] {
  const bags: BagBuildState[] = []
  let sectionIndex = 0
  let active = createEmptyBagBuildState(sectionIndex)

  for (let pageIndex = 0; pageIndex < pageGroups.length; pageIndex += 1) {
    const pageGroup = pageGroups[pageIndex]

    if (pageGroup.callouts.length === 0) {
      const nextSection = closeAtSoftSectionCue(bags, active, policy, sectionIndex)
      sectionIndex = nextSection.sectionIndex
      active = nextSection.active
      continue
    }

    if (pageGroup.hasSectionBoundaryBefore) {
      const nextSection = closeAtSoftSectionCue(bags, active, policy, sectionIndex)
      sectionIndex = nextSection.sectionIndex
      active = nextSection.active
    }

    if (shouldCloseBeforeAddingPage(active, pageGroup, policy, {
      pageCompletesSection: hasSectionCueAfter(pageGroups, pageIndex),
    })) {
      bags.push(active)
      active = createEmptyBagBuildState(sectionIndex)
    }

    active = addPageGroupToBag(active, pageGroup)
  }

  if (active.callouts.length > 0) {
    bags.push(active)
  }

  return bags
}

function closeAtSoftSectionCue(
  bags: BagBuildState[],
  active: BagBuildState,
  policy: StepCalloutBaggingPolicy,
  sectionIndex: number,
): {
  active: BagBuildState
  sectionIndex: number
} {
  if (active.callouts.length > 0) {
    if (!isUsefulSectionBoundary(active, policy)) {
      return { active, sectionIndex }
    }

    bags.push(active)
    const nextSectionIndex = sectionIndex + 1

    return {
      active: createEmptyBagBuildState(nextSectionIndex),
      sectionIndex: nextSectionIndex,
    }
  }

  const lastBag = bags[bags.length - 1]

  if (!lastBag || !isUsefulSectionBoundary(lastBag, policy)) {
    return { active, sectionIndex }
  }

  const nextSectionIndex = Math.max(sectionIndex + 1, lastBag.sectionIndex + 1)

  return {
    active: createEmptyBagBuildState(nextSectionIndex),
    sectionIndex: nextSectionIndex,
  }
}

function isUsefulSectionBoundary(
  bag: BagBuildState,
  policy: StepCalloutBaggingPolicy,
): boolean {
  return bag.partCount >= preferredFill(policy)
}

function hasSectionCueAfter(
  pageGroups: readonly PageCalloutGroup[],
  pageIndex: number,
): boolean {
  const nextPage = pageGroups[pageIndex + 1]

  return Boolean(
    nextPage?.hasSectionBoundaryBefore ||
    nextPage?.callouts.length === 0,
  )
}

function shouldCloseBeforeAddingPage(
  active: BagBuildState,
  nextPage: PageCalloutGroup,
  policy: StepCalloutBaggingPolicy,
  options: {
    pageCompletesSection: boolean
  },
): boolean {
  if (active.callouts.length === 0) {
    return false
  }

  const nextPartCount = active.partCount + nextPage.partCount
  const nextCalloutCount = active.callouts.length + nextPage.callouts.length

  if (nextPartCount > policy.maxParts + policy.overfillToleranceParts) {
    return true
  }

  if (options.pageCompletesSection) {
    return false
  }

  return (
    active.partCount >= preferredFill(policy) &&
    nextPartCount > policy.targetParts
  ) || (
    active.partCount >= policy.minParts &&
    nextCalloutCount > policy.targetSteps
  )
}

function preferredFill(policy: StepCalloutBaggingPolicy): number {
  return Math.min(policy.minParts, Math.floor(policy.targetParts * 0.75))
}

function mergeUndersizedBags(
  bags: BagBuildState[],
  policy: StepCalloutBaggingPolicy,
): BagBuildState[] {
  const merged = [...bags]
  let index = 0

  while (index < merged.length) {
    const bag = merged[index]

    if (bag.partCount >= policy.minParts || merged.length === 1) {
      index += 1
      continue
    }

    const previous = index > 0 ? merged[index - 1] : null
    const next = index < merged.length - 1 ? merged[index + 1] : null
    const previousMerged = previous ? mergeBagBuildStates(previous, bag) : null
    const nextMerged = next ? mergeBagBuildStates(bag, next) : null
    const canMergePrevious = canMergeUndersizedBagAcrossBoundary({
      bag,
      merged: previousMerged,
      neighbor: previous,
      policy,
    })
    const canMergeNext = canMergeUndersizedBagAcrossBoundary({
      bag,
      merged: nextMerged,
      neighbor: next,
      policy,
    })

    if (!canMergePrevious && !canMergeNext) {
      index += 1
      continue
    }

    if (canMergePrevious && previousMerged) {
      merged.splice(index - 1, 2, previousMerged)
      index = Math.max(0, index - 1)
      continue
    }

    if (canMergeNext && nextMerged) {
      merged.splice(index, 2, nextMerged)
      continue
    }

    index += 1
  }

  return merged
}

function canMergeUndersizedBagAcrossBoundary({
  bag,
  merged,
  neighbor,
  policy,
}: {
  bag: BagBuildState
  merged: BagBuildState | null
  neighbor: BagBuildState | null
  policy: StepCalloutBaggingPolicy
}): boolean {
  if (!neighbor || !merged) {
    return false
  }

  if (merged.partCount > policy.maxParts + policy.overfillToleranceParts) {
    return false
  }

  if (neighbor.sectionIndex === bag.sectionIndex) {
    return true
  }

  return isAbnormallySmallBag(bag, policy)
}

function isAbnormallySmallBag(
  bag: BagBuildState,
  policy: StepCalloutBaggingPolicy,
): boolean {
  return bag.partCount <= Math.max(
    policy.tinyBagThreshold,
    Math.floor(policy.minParts * 0.25),
    Math.floor(policy.targetParts * 0.2),
  )
}

function createBagPlan(
  bag: BagBuildState,
  index: number,
): StepCalloutBagPlan {
  const number = index + 1
  const pageNumbers = [...new Set(bag.pageNumbers)].sort((left, right) => left - right)
  const stepIndexes = bag.callouts.map((callout) => callout.callout.stepIndex)
  const reviewReasons = createReviewReasons(bag)

  return {
    id: `bag-${number}-p${pageNumbers.join("-")}`,
    label: `Bag ${number}`,
    number,
    status: reviewReasons.length > 0 ? "review" : "draft",
    reviewReasons,
    pageRange: {
      end: pageNumbers[pageNumbers.length - 1],
      label: pageRangeLabel(pageNumbers),
      pages: pageNumbers,
      start: pageNumbers[0],
    },
    stepRange: {
      start: Math.min(...stepIndexes),
      end: Math.max(...stepIndexes),
    },
    partCount: bag.partCount,
    unknownQuantityCount: bag.unknownQuantityCount,
    callouts: bag.callouts,
  }
}

function createReviewReasons(bag: BagBuildState): string[] {
  const reasons: string[] = []

  if (bag.unknownQuantityCount > 0) {
    reasons.push("unknown quantities")
  }

  return reasons
}

function createBagRow({
  bag,
  bagCallout,
  item,
  manualFingerprint,
  pagePreview,
}: {
  bag: StepCalloutBagPlan
  bagCallout: StepCalloutBagCallout
  item: DetectedStepCalloutPartItem
  manualFingerprint: string
  pagePreview: StepImagePreview | null
}): StepCalloutBagRow {
  const callout = bagCallout.callout
  const quantity = trustedQuantityValue(item) * bagCallout.multiplier
  const partRegion = itemPartRegion(item)
  const rowId = [
    bag.id,
    callout.id,
    item.id,
    `x${bagCallout.multiplier}`,
  ].join(":")

  return {
    anchor: {
      calloutRegion: { ...callout.sourceRegion },
      itemIndexOnCallout: item.indexOnCallout,
      manualFingerprint,
      pageNumber: callout.pageNumber,
      pageRenderHeight: pagePreview?.height ?? null,
      pageRenderWidth: pagePreview?.width ?? null,
      partRegion: { ...partRegion },
      ...(item.quantityLabel.region
        ? { quantityLabelRegion: { ...item.quantityLabel.region } }
        : {}),
    },
    bagId: bag.id,
    bagLabel: bag.label,
    bagNumber: bag.number,
    bagPageLabel: bag.pageRange.label,
    calloutBackgroundHex: callout.inferredBackground.hex,
    calloutCrop: callout.crop
      ? {
          imageDataUrl: callout.crop.imageDataUrl,
          region: callout.crop.region,
        }
      : null,
    calloutId: callout.id,
    calloutIndexOnPage: callout.indexOnPage,
    color: createRowColor(item),
    id: rowId,
    itemId: item.id,
    itemIndexOnCallout: item.indexOnCallout,
    pagePreview,
    partCrop: itemPartCrop(item),
    partImageAlphaMask: itemPartAlphaMask(item),
    quantity,
    quantityEstimated: item.quantity.value === null,
    quantityLabelCrop: item.quantityLabel.crop
      ? {
          imageDataUrl: item.quantityLabel.crop.imageDataUrl,
          region: item.quantityLabel.crop.region ?? item.quantityLabel.region,
        }
      : {
          imageDataUrl: item.quantityLabel.imageDataUrl,
          region: item.quantityLabel.region,
        },
    quantityText: item.quantity.value === null ? item.quantity.text || "unknown" : `${quantity}x`,
    sourcePageNumber: callout.pageNumber,
    stepIndex: callout.stepIndex,
  }
}

function itemPartRegion(item: DetectedStepCalloutPartItem): StepSourceRegion {
  return item.partImage?.region ?? item.partCrop?.region ?? item.partRegion
}

function itemPartAlphaMask(item: DetectedStepCalloutPartItem): PartMatchAlphaMask | null {
  const alphaMask = item.partImage?.alphaMask

  return alphaMask
    ? {
        data: alphaMask.data,
        height: alphaMask.height,
        width: alphaMask.width,
      }
    : null
}

function itemPartCrop(item: DetectedStepCalloutPartItem): StepImageCrop {
  if (item.partImage) {
    return {
      imageDataUrl: item.partImage.imageDataUrl,
      region: item.partImage.region,
    }
  }

  if (item.partCrop) {
    return {
      imageDataUrl: item.partCrop.imageDataUrl,
      region: item.partCrop.region ?? item.partRegion,
    }
  }

  return {
    region: item.partRegion,
  }
}

function createRowColor(item: DetectedStepCalloutPartItem): StepCalloutBagRowColor {
  const detectedColor = item.detectedColor
  const name = detectedColor
    ? detectedColor.status === "family"
      ? `${detectedColor.family} family`
      : detectedColor.name
    : "Unknown"
  const family = detectedColor?.family ?? "unknown"
  const status = detectedColor?.status ?? "review"

  return {
    confidence: detectedColor?.confidence ?? null,
    family,
    key: detectedColor?.manualClassId ?? `${family}:${name}:${status}`,
    manualClassId: detectedColor?.manualClassId ?? null,
    manualClassTrusted: detectedColor?.manualClassTrusted ?? false,
    name,
    status,
    swatchHex: detectedColor?.swatchHex ?? null,
  }
}

function sortBaggableCallouts(callouts: DetectedStepCallout[]): DetectedStepCallout[] {
  return [...callouts].sort((left, right) => {
    const pageComparison = left.pageNumber - right.pageNumber
    const yComparison = left.sourceRegion.y - right.sourceRegion.y
    const xComparison = left.sourceRegion.x - right.sourceRegion.x
    const indexComparison = left.indexOnPage - right.indexOnPage

    return (
      pageComparison ||
      yComparison ||
      xComparison ||
      indexComparison ||
      left.stepIndex - right.stepIndex
    )
  })
}

function trustedQuantityValue(item: DetectedStepCalloutPartItem): number {
  return item.quantity.value && Number.isFinite(item.quantity.value) && item.quantity.value > 0
    ? item.quantity.value
    : 1
}

function normalizeInventoryPartCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null
}

function createEmptyBagBuildState(sectionIndex = 0): BagBuildState {
  return {
    callouts: [],
    pageNumbers: [],
    partCount: 0,
    sectionIndex,
    unknownQuantityCount: 0,
  }
}

function addPageGroupToBag(
  bag: BagBuildState,
  pageGroup: PageCalloutGroup,
): BagBuildState {
  return {
    callouts: [...bag.callouts, ...pageGroup.callouts],
    pageNumbers: [...bag.pageNumbers, pageGroup.pageNumber],
    partCount: bag.partCount + pageGroup.partCount,
    sectionIndex: bag.sectionIndex,
    unknownQuantityCount: bag.unknownQuantityCount + pageGroup.unknownQuantityCount,
  }
}

function mergeBagBuildStates(left: BagBuildState, right: BagBuildState): BagBuildState {
  return {
    callouts: [...left.callouts, ...right.callouts],
    pageNumbers: [...left.pageNumbers, ...right.pageNumbers],
    partCount: left.partCount + right.partCount,
    sectionIndex: left.sectionIndex,
    unknownQuantityCount: left.unknownQuantityCount + right.unknownQuantityCount,
  }
}

function pageRangeLabel(pageNumbers: number[]): string {
  if (pageNumbers.length === 1) {
    return `Page ${pageNumbers[0]}`
  }

  const sorted = [...pageNumbers].sort((left, right) => left - right)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const isContiguous = sorted.every((pageNumber, index) => pageNumber === first + index)

  return isContiguous ? `Pages ${first}-${last}` : `Pages ${sorted.join(", ")}`
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
