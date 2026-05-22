import type {
  DetectedStepCallout,
  DetectedStepCalloutPartImageSignature,
  DetectedStepCalloutPartItem,
  StepCalloutDetectionResult,
  StepCalloutSourceImage,
} from "./step-callout-detection"
import { compareColorNames } from "./color-sort"

export const stepCalloutBaggingHeuristicVersion = "step-callout-bagging-v2"

export type StepCalloutBaggingPolicy = {
  maxParts: number
  maxSteps: number
  minParts: number
  setSizeBand: "small" | "medium" | "large" | "huge"
  setSizeSource: "inventory" | "detected_callouts"
  targetParts: number
  targetSteps: number
}

export type StepCalloutBagPartGroup = {
  cataloguePartNumber: string | null
  colorConfidence: number
  colorId: string | null
  colorHex: string
  colorName: string
  displayIndex: number
  id: string
  itemCount: number
  matchConfidence: number | null
  matchStatus: "bom" | "unmatched"
  partName: string | null
  partNumber: string | null
  fallbackPreviewImageUrl: string | null
  previewImageUrl: string | null
  quantity: number
  quantityConfidence: number
  quantityIsEstimated: boolean
  representativeCrop: DetectedStepCalloutPartItem["partCrop"]
  rowId: string | null
  sourceItemIds: readonly string[]
  stepIndexes: readonly number[]
}

export type StepCalloutBagPlan = {
  callouts: readonly DetectedStepCallout[]
  id: string
  label: string
  pageRange: {
    end: number
    start: number
  }
  partCount: number
  partGroups: readonly StepCalloutBagPartGroup[]
  policy: StepCalloutBaggingPolicy
  reviewReasons: readonly string[]
  sourceImage: StepCalloutSourceImage | null
  status: "draft" | "review"
  stepRange: {
    end: number
    start: number
  }
  unknownQuantityCount: number
}

export type StepCalloutBaggingPlan = {
  bags: readonly StepCalloutBagPlan[]
  detectedPartCount: number
  detectedStepCount: number
  heuristicVersion: typeof stepCalloutBaggingHeuristicVersion
  policy: StepCalloutBaggingPolicy
  setPieceCount: number
}

export function createStepCalloutBaggingPlan(
  result: StepCalloutDetectionResult,
  {
    inventoryPartCount = null,
  }: {
    inventoryPartCount?: number | null
  } = {},
): StepCalloutBaggingPlan {
  const sortedCallouts = [...result.callouts].sort(
    (left, right) => left.stepIndex - right.stepIndex || left.pageNumber - right.pageNumber,
  )
  const detectedPartCount = sortedCallouts.reduce((sum, callout) => sum + getCalloutPartCount(callout), 0)
  const policy = getStepCalloutBaggingPolicy({
    detectedPartCount,
    detectedStepCount: sortedCallouts.length,
    inventoryPartCount,
  })
  const bags: StepCalloutBagPlan[] = []
  let currentCallouts: DetectedStepCallout[] = []

  for (const callout of sortedCallouts) {
    const calloutPartCount = getCalloutPartCount(callout)
    const currentPartCount = currentCallouts.reduce((sum, current) => sum + getCalloutPartCount(current), 0)
    const nextPartCount = currentPartCount + calloutPartCount
    const hasCurrentCallouts = currentCallouts.length > 0
    const hasReachedPreferredFill = currentPartCount >= Math.min(policy.minParts, Math.floor(policy.targetParts * 0.75))
    const wouldExceedHardLimit =
      nextPartCount > policy.maxParts ||
      currentCallouts.length >= policy.maxSteps
    const wouldExceedPreferredLimit =
      nextPartCount > policy.targetParts ||
      currentCallouts.length >= policy.targetSteps
    const shouldCloseCurrent =
      hasCurrentCallouts &&
      (wouldExceedHardLimit || (hasReachedPreferredFill && wouldExceedPreferredLimit))

    if (shouldCloseCurrent) {
      bags.push(createStepCalloutBag(currentCallouts, bags.length, policy))
      currentCallouts = []
    }

    currentCallouts.push(callout)
  }

  if (currentCallouts.length > 0) {
    bags.push(createStepCalloutBag(currentCallouts, bags.length, policy))
  }

  const balancedBags = mergeUndersizedTrailingBag(bags, policy)

  return {
    bags: balancedBags,
    detectedPartCount,
    detectedStepCount: sortedCallouts.length,
    heuristicVersion: stepCalloutBaggingHeuristicVersion,
    policy,
    setPieceCount: getSetPieceCount({
      detectedPartCount,
      inventoryPartCount,
    }),
  }
}

function mergeUndersizedTrailingBag(
  bags: readonly StepCalloutBagPlan[],
  policy: StepCalloutBaggingPolicy,
) {
  if (bags.length < 2) {
    return bags
  }

  const previous = bags.at(-2)
  const trailing = bags.at(-1)
  if (
    !previous ||
    !trailing ||
    trailing.partCount >= policy.minParts ||
    previous.partCount + trailing.partCount > policy.maxParts
  ) {
    return bags
  }

  return [
    ...bags.slice(0, -2),
    createStepCalloutBag([...previous.callouts, ...trailing.callouts], bags.length - 2, policy),
  ]
}

export function getStepCalloutBaggingPolicy({
  detectedPartCount,
  detectedStepCount,
  inventoryPartCount = null,
}: {
  detectedPartCount: number
  detectedStepCount: number
  inventoryPartCount?: number | null
}): StepCalloutBaggingPolicy {
  const setPieceCount = getSetPieceCount({ detectedPartCount, inventoryPartCount })
  const setSizeSource = inventoryPartCount != null && inventoryPartCount > 0 ? "inventory" : "detected_callouts"
  const baseline = getSetSizeBagBaseline(setPieceCount)
  const averagePartsPerStep = detectedStepCount > 0
    ? Math.max(1, detectedPartCount / detectedStepCount)
    : 4
  const targetSteps = clampNumber(
    Math.round(baseline.targetParts / averagePartsPerStep),
    baseline.minTargetSteps,
    baseline.maxTargetSteps,
  )

  return {
    maxParts: baseline.maxParts,
    maxSteps: baseline.maxTargetSteps,
    minParts: baseline.minParts,
    setSizeBand: baseline.setSizeBand,
    setSizeSource,
    targetParts: baseline.targetParts,
    targetSteps,
  }
}

function createStepCalloutBag(
  callouts: readonly DetectedStepCallout[],
  bagIndex: number,
  policy: StepCalloutBaggingPolicy,
): StepCalloutBagPlan {
  const partCount = callouts.reduce((sum, callout) => sum + getCalloutPartCount(callout), 0)
  const unknownQuantityCount = callouts.reduce(
    (sum, callout) => sum + callout.partItems.filter((item) => !hasTrustedQuantity(item)).length,
    0,
  )
  const stepIndexes = callouts.map((callout) => callout.stepIndex)
  const pageNumbers = callouts.map((callout) => callout.pageNumber)
  const reviewReasons = getBagReviewReasons({
    calloutCount: callouts.length,
    partCount,
    policy,
    unknownQuantityCount,
  })

  return {
    callouts,
    id: `step-callout-bag:${bagIndex + 1}:s${Math.min(...stepIndexes)}-${Math.max(...stepIndexes)}`,
    label: `Bag ${bagIndex + 1}`,
    pageRange: {
      end: Math.max(...pageNumbers),
      start: Math.min(...pageNumbers),
    },
    partCount,
    partGroups: createBagPartGroups(callouts),
    policy,
    reviewReasons,
    sourceImage: callouts[0]?.sourceImage ?? null,
    status: reviewReasons.length > 0 ? "review" : "draft",
    stepRange: {
      end: Math.max(...stepIndexes),
      start: Math.min(...stepIndexes),
    },
    unknownQuantityCount,
  }
}

function createBagPartGroups(callouts: readonly DetectedStepCallout[]): StepCalloutBagPartGroup[] {
  const groups = new Map<string, MutablePartGroup>()

  for (const callout of callouts) {
    for (const item of callout.partItems) {
      const detectedColor = getDetectedColor(item)
      const quantity = getItemQuantity(item)
      const bomMatch: DetectedStepCalloutPartItem["bomImageMatch"] | null = null
      const groupKey = getPartGroupKey(groups, item, detectedColor, callout.stepIndex, bomMatch)
      const existing = groups.get(groupKey)
      const colorName = detectedColor.name
      const colorHex = detectedColor.hex
      const colorConfidence = detectedColor.confidence

      if (existing) {
        addLocalImageGroupToPartGroup(existing, item)
        existing.colorConfidence = Math.min(existing.colorConfidence, colorConfidence)
        existing.itemCount += 1
        existing.quantity += quantity.value
        existing.quantityConfidence = Math.min(existing.quantityConfidence, quantity.confidence)
        existing.quantityIsEstimated = existing.quantityIsEstimated || quantity.isEstimated
        existing.sourceItemIds.push(item.id)
        existing.stepIndexes.add(callout.stepIndex)
        existing.imageSignature ??= item.imageSignature ?? null
        existing.localImageGroupId ??= item.localImageMatch?.groupId ?? null
      } else {
        groups.set(groupKey, {
          cataloguePartNumber: null,
          colorConfidence,
          colorHex,
          colorId: null,
          colorName,
          itemCount: 1,
          matchConfidence: null,
          matchStatus: "unmatched",
          fallbackPreviewImageUrl: null,
          imageSignature: item.imageSignature ?? null,
          partName: null,
          partNumber: null,
          previewImageUrl: null,
          localImageGroupId: item.localImageMatch?.groupId ?? null,
          localImageGroupIds: createLocalImageGroupIdSet(item),
          localImageGroupsByStepGroupIndex: createLocalImageStepGroupMap(item),
          quantity: quantity.value,
          quantityConfidence: quantity.confidence,
          quantityIsEstimated: quantity.isEstimated,
          representativeCrop: item.partCrop,
          rowId: null,
          sourceItemIds: [item.id],
          stepIndexes: new Set([callout.stepIndex]),
        })
      }
    }
  }

  return [...groups.entries()]
    .sort((left, right) =>
      compareColorNames(left[1].colorName, right[1].colorName) ||
      left[1].colorHex.localeCompare(right[1].colorHex)
    )
    .map(([id, group], index) => ({
      cataloguePartNumber: group.cataloguePartNumber,
      colorConfidence: group.colorConfidence,
      colorId: group.colorId,
      colorHex: group.colorHex,
      colorName: group.colorName,
      displayIndex: index + 1,
      id,
      itemCount: group.itemCount,
      matchConfidence: group.matchConfidence,
      matchStatus: group.matchStatus,
      fallbackPreviewImageUrl: group.fallbackPreviewImageUrl,
      partName: group.partName,
      partNumber: group.partNumber,
      previewImageUrl: group.previewImageUrl,
      quantity: group.quantity,
      quantityConfidence: group.quantityConfidence,
      quantityIsEstimated: group.quantityIsEstimated,
      representativeCrop: group.representativeCrop,
      rowId: group.rowId,
      sourceItemIds: group.sourceItemIds,
      stepIndexes: [...group.stepIndexes].sort((left, right) => left - right),
    }))
}

function getPartGroupKey(
  groups: ReadonlyMap<string, MutablePartGroup>,
  item: DetectedStepCalloutPartItem,
  detectedColor: ReturnType<typeof getDetectedColor>,
  stepIndex: number,
  bomMatch: DetectedStepCalloutPartItem["bomImageMatch"] | null,
) {
  const normalizedColorName = normalizePartGroupColorName(detectedColor.name)
  const localImageGroupId = item.localImageMatch?.groupId ?? null

  for (const [key, group] of groups) {
    if (
      localImageGroupId != null &&
      group.localImageGroupIds.has(localImageGroupId) &&
      normalizePartGroupColorName(group.colorName) === normalizedColorName &&
      !hasConflictingLocalImageGroupEvidence(group, item) &&
      !group.stepIndexes.has(stepIndex)
    ) {
      return key
    }
  }

  const signature = item.imageSignature ?? null
  if (signature) {
    for (const [key, group] of groups) {
      if (
        group.imageSignature &&
        normalizePartGroupColorName(group.colorName) === normalizedColorName &&
        !group.stepIndexes.has(stepIndex) &&
        !hasConflictingLocalImageGroupEvidence(group, item) &&
        arePartImageSignaturesSimilar(group.imageSignature, signature)
      ) {
        return key
      }
    }
  }

  if (bomMatch) {
    return `bom:${bomMatch.rowId}:first:${item.id}`
  }

  if (localImageGroupId) {
    return `local:${localImageGroupId}:color:${normalizedColorName}:first:${item.id}`
  }

  return `unmatched:${item.id}`
}

function createLocalImageGroupIdSet(item: DetectedStepCalloutPartItem) {
  return item.localImageMatch?.groupId ? new Set([item.localImageMatch.groupId]) : new Set<string>()
}

function createLocalImageStepGroupMap(item: DetectedStepCalloutPartItem) {
  const groupMap = new Map<number, string>()
  addLocalImageGroupToMap(groupMap, item)

  return groupMap
}

function addLocalImageGroupToPartGroup(group: MutablePartGroup, item: DetectedStepCalloutPartItem) {
  const groupId = item.localImageMatch?.groupId
  if (groupId) {
    group.localImageGroupIds.add(groupId)
  }
  addLocalImageGroupToMap(group.localImageGroupsByStepGroupIndex, item)
}

function addLocalImageGroupToMap(
  groupMap: Map<number, string>,
  item: DetectedStepCalloutPartItem,
) {
  const localImageMatch = item.localImageMatch
  if (!localImageMatch) {
    return
  }

  groupMap.set(localImageMatch.stepGroupIndex, localImageMatch.groupId)
}

function hasConflictingLocalImageGroupEvidence(
  group: MutablePartGroup,
  item: DetectedStepCalloutPartItem,
) {
  const localImageMatch = item.localImageMatch
  if (!localImageMatch) {
    return false
  }

  const existingGroupId = group.localImageGroupsByStepGroupIndex.get(localImageMatch.stepGroupIndex)

  return existingGroupId != null && existingGroupId !== localImageMatch.groupId
}

function normalizePartGroupColorName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

function arePartImageSignaturesSimilar(
  left: DetectedStepCalloutPartImageSignature,
  right: DetectedStepCalloutPartImageSignature,
) {
  if (!hasComparablePartImageSignature(left) || !hasComparablePartImageSignature(right)) {
    return false
  }

  const shapeScore = scorePartSignatureBitGrid(left.grid, right.grid)
  const edgeScore = left.edgeGrid && right.edgeGrid
    ? scorePartSignatureBitGrid(left.edgeGrid, right.edgeGrid)
    : shapeScore
  const detailScore = scorePartSignatureDetailGrid(left, right)
  const bottomProfileScore = left.bottomProfile && right.bottomProfile
    ? scorePartSignatureProfile(left.bottomProfile, right.bottomProfile)
    : 1
  const topProfileScore = left.topProfile && right.topProfile
    ? scorePartSignatureProfile(left.topProfile, right.topProfile)
    : 1
  const profileScore = Math.min(bottomProfileScore, (bottomProfileScore * 0.7) + (topProfileScore * 0.3))
  const boundsWidthScore = left.boundsWidth && right.boundsWidth
    ? scoreSignatureMetricRatio(left.boundsWidth, right.boundsWidth, 1)
    : 1
  const boundsHeightScore = left.boundsHeight && right.boundsHeight
    ? scoreSignatureMetricRatio(left.boundsHeight, right.boundsHeight, 1)
    : 1
  const pixelCountScore = left.pixelCount && right.pixelCount
    ? scoreSignatureMetricRatio(left.pixelCount, right.pixelCount, 1)
    : 1
  const sizeScore = Math.min(boundsWidthScore, boundsHeightScore, pixelCountScore)
  const aspectScore = scoreSignatureMetricRatio(left.aspectRatio, right.aspectRatio, 1)
  const coverageScore = scoreSignatureMetricRatio(left.coverage, right.coverage, 1)
  const compactnessScore = scoreSignatureMetricRatio(left.compactness, right.compactness, 1)
  const outlineScore = Math.max(edgeScore, profileScore >= 0.92 && detailScore >= 0.82 ? profileScore : 0)
  const overallScore = (
    (shapeScore * 0.24) +
    (outlineScore * 0.16) +
    (detailScore * 0.18) +
    (profileScore * 0.14) +
    (aspectScore * 0.08) +
    (coverageScore * 0.06) +
    (compactnessScore * 0.02) +
    (sizeScore * 0.12)
  )

  const hasHighShapeAgreement = (
    overallScore >= 0.9 &&
    shapeScore >= 0.92 &&
    outlineScore >= 0.84 &&
    detailScore >= 0.62 &&
    profileScore >= 0.86 &&
    aspectScore >= 0.82 &&
    coverageScore >= 0.74 &&
    sizeScore >= 0.44
  )

  return (
    (
      overallScore >= 0.88 &&
      shapeScore >= 0.86 &&
      outlineScore >= 0.82 &&
      detailScore >= 0.7 &&
      profileScore >= 0.8 &&
      aspectScore >= 0.72 &&
      coverageScore >= 0.62 &&
      sizeScore >= 0.42
    ) ||
    hasHighShapeAgreement
  )
}

function hasComparablePartImageSignature(signature: DetectedStepCalloutPartImageSignature) {
  return Boolean(
    signature.edgeGrid &&
    signature.bottomProfile &&
    signature.topProfile &&
    signature.boundsHeight &&
    signature.boundsWidth &&
    signature.pixelCount,
  )
}

function scorePartSignatureProfile(left: string, right: string) {
  if (left.length !== right.length || left.length === 0) {
    return 0
  }

  let bestScore = 0
  for (let offset = -2; offset <= 2; offset += 1) {
    let difference = 0
    let compared = 0
    let missing = 0
    for (let index = 0; index < left.length; index += 1) {
      const rightIndex = index - offset
      const leftValue = decodePartSignatureProfileValue(left[index] ?? "-")
      const rightValue = rightIndex >= 0 && rightIndex < right.length
        ? decodePartSignatureProfileValue(right[rightIndex] ?? "-")
        : null

      if (leftValue == null && rightValue == null) {
        continue
      }
      if (leftValue == null || rightValue == null) {
        missing += 1
        compared += 1
        continue
      }

      difference += Math.abs(leftValue - rightValue)
      compared += 1
    }

    if (compared === 0) {
      continue
    }

    const averageDifference = (difference + (missing * 5)) / compared
    bestScore = Math.max(bestScore, clampNumber(1 - averageDifference / 9, 0, 1))
  }

  return bestScore
}

function decodePartSignatureProfileValue(value: string) {
  if (value === "-") {
    return null
  }

  const parsed = Number.parseInt(value, 36)
  return Number.isFinite(parsed) ? parsed : null
}

function scorePartSignatureDetailGrid(
  left: DetectedStepCalloutPartImageSignature,
  right: DetectedStepCalloutPartImageSignature,
) {
  const leftMass = countBitGridCells(left.detailGrid)
  const rightMass = countBitGridCells(right.detailGrid)

  if (leftMass === 0 && rightMass === 0) {
    return 1
  }

  return scorePartSignatureBitGrid(left.detailGrid, right.detailGrid)
}

function scorePartSignatureBitGrid(left: string, right: string) {
  const gridSize = getSignatureGridSize(left, right)

  if (gridSize == null) {
    return 0
  }

  let bestScore = 0

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const shiftedRight = shiftBitGrid(right, gridSize, offsetX, offsetY)
      bestScore = Math.max(bestScore, scoreBitGridDice(left, shiftedRight))
    }
  }

  return bestScore
}

function getSignatureGridSize(left: string, right: string) {
  if (left.length !== right.length || left.length === 0) {
    return null
  }

  const gridSize = Math.round(Math.sqrt(left.length))

  return gridSize * gridSize === left.length ? gridSize : null
}

function shiftBitGrid(bits: string, gridSize: number, offsetX: number, offsetY: number) {
  let shifted = ""

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const sourceX = x - offsetX
      const sourceY = y - offsetY
      const sourceIndex = sourceY * gridSize + sourceX
      const isInside = sourceX >= 0 && sourceX < gridSize && sourceY >= 0 && sourceY < gridSize
      shifted += isInside && bits[sourceIndex] === "1" ? "1" : "0"
    }
  }

  return shifted
}

function scoreBitGridDice(left: string, right: string) {
  let intersection = 0
  let leftCount = 0
  let rightCount = 0

  for (let index = 0; index < left.length; index += 1) {
    const hasLeft = left[index] === "1"
    const hasRight = right[index] === "1"
    if (hasLeft) {
      leftCount += 1
    }
    if (hasRight) {
      rightCount += 1
    }
    if (hasLeft && hasRight) {
      intersection += 1
    }
  }

  if (leftCount === 0 && rightCount === 0) {
    return 1
  }

  return (2 * intersection) / Math.max(1, leftCount + rightCount)
}

function countBitGridCells(bits: string) {
  let count = 0

  for (const bit of bits) {
    if (bit === "1") {
      count += 1
    }
  }

  return count
}

function scoreSignatureMetricRatio(left: number, right: number, fallback: number) {
  const leftValue = Number.isFinite(left) && left > 0 ? left : fallback
  const rightValue = Number.isFinite(right) && right > 0 ? right : fallback
  const ratio = Math.max(leftValue, rightValue) / Math.max(0.001, Math.min(leftValue, rightValue))

  return clampNumber(1 - Math.log(ratio) / Math.log(2.2), 0, 1)
}

function getBagReviewReasons({
  calloutCount,
  partCount,
  policy,
  unknownQuantityCount,
}: {
  calloutCount: number
  partCount: number
  policy: StepCalloutBaggingPolicy
  unknownQuantityCount: number
}) {
  const reasons: string[] = []

  if (unknownQuantityCount > 0) {
    reasons.push(`${unknownQuantityCount} unknown ${unknownQuantityCount === 1 ? "quantity" : "quantities"}`)
  }

  if (partCount > policy.maxParts) {
    reasons.push(`over ${policy.maxParts} part target`)
  }

  if (calloutCount > policy.maxSteps) {
    reasons.push(`over ${policy.maxSteps} step target`)
  }

  return reasons
}

function getCalloutPartCount(callout: DetectedStepCallout) {
  return callout.partItems.reduce((sum, item) => sum + getItemQuantity(item).value, 0)
}

function getDetectedColor(item: DetectedStepCalloutPartItem): {
  confidence: number
  hex: string
  name: string
} {
  return item.detectedColor ?? {
    confidence: 0,
    hex: "#94a3b8",
    name: "Unknown color",
  }
}

function getItemQuantity(item: DetectedStepCalloutPartItem): {
  confidence: number
  isEstimated: boolean
  value: number
} {
  if (hasTrustedQuantity(item)) {
    return {
      confidence: item.quantity.confidence,
      isEstimated: false,
      value: item.quantity.value,
    }
  }

  return {
    confidence: 0,
    isEstimated: true,
    value: 1,
  }
}

function hasTrustedQuantity(
  item: DetectedStepCalloutPartItem,
): item is DetectedStepCalloutPartItem & {
  quantity: {
    confidence: number
    text: string | null
    value: number
  }
} {
  const value = item.quantity.value

  return value != null && Number.isFinite(value) && value > 0
}

function getSetPieceCount({
  detectedPartCount,
  inventoryPartCount,
}: {
  detectedPartCount: number
  inventoryPartCount?: number | null
}) {
  return inventoryPartCount != null && inventoryPartCount > 0 ? inventoryPartCount : detectedPartCount
}

function getSetSizeBagBaseline(setPieceCount: number) {
  if (setPieceCount <= 500) {
    return {
      maxParts: 75,
      maxTargetSteps: 18,
      minParts: 45,
      minTargetSteps: 4,
      setSizeBand: "small" as const,
      targetParts: 60,
    }
  }

  if (setPieceCount <= 1_200) {
    return {
      maxParts: 110,
      maxTargetSteps: 16,
      minParts: 70,
      minTargetSteps: 4,
      setSizeBand: "medium" as const,
      targetParts: 90,
    }
  }

  if (setPieceCount <= 2_500) {
    return {
      maxParts: 140,
      maxTargetSteps: 14,
      minParts: 90,
      minTargetSteps: 3,
      setSizeBand: "large" as const,
      targetParts: 115,
    }
  }

  return {
    maxParts: 160,
    maxTargetSteps: 12,
    minParts: 100,
    minTargetSteps: 3,
    setSizeBand: "huge" as const,
    targetParts: 130,
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

type MutablePartGroup = {
  cataloguePartNumber: string | null
  colorConfidence: number
  colorId: string | null
  colorHex: string
  colorName: string
  imageSignature: DetectedStepCalloutPartImageSignature | null
  itemCount: number
  localImageGroupId: string | null
  localImageGroupIds: Set<string>
  localImageGroupsByStepGroupIndex: Map<number, string>
  matchConfidence: number | null
  matchStatus: "bom" | "unmatched"
  partName: string | null
  partNumber: string | null
  fallbackPreviewImageUrl: string | null
  previewImageUrl: string | null
  quantity: number
  quantityConfidence: number
  quantityIsEstimated: boolean
  representativeCrop: DetectedStepCalloutPartItem["partCrop"]
  rowId: string | null
  sourceItemIds: string[]
  stepIndexes: Set<number>
}
