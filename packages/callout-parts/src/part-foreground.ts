import type {
  CalloutPartCalloutInput,
  CalloutPartImage,
  CalloutPartPageInput,
  CalloutQuantityLabel,
} from "./contracts"
import type { LowContrastFaceSupportMode } from "./part-support-types"
import { type BackgroundModel } from "./background-model"
import { isUsableComponent } from "./part-component-filters"
import { scoreComponent } from "./part-component-scoring"
import { createPartSearchRegion, selectPartRegion, type SelectedPartRegion } from "./part-crop-regions"
import { CALLOUT_BORDER_INSET } from "./part-foreground-constants"
import { findForegroundComponents } from "./part-foreground-components"
import { boundsForPixels } from "./part-foreground-selection"
import { cropAlphaMask } from "./alpha-mask-geometry"
import { createPartImage } from "./part-image"
import { createExcludedLabelRegions } from "./part-mask-regions"
import { createPartOwnershipZones } from "./part-ownership"
import { createLabelSuppressionMasks } from "./label-suppression"
import { insetRegion, overlapRatio, regionCenter } from "./regions"

const LOW_CONTRAST_FACE_SUPPORT_THRESHOLDS = {
  compactMultiPartRowEnd: {
    maxForegroundHeight: 25,
    maxForegroundWidth: 55,
    maxRegionWidth: 115,
    minLabelCount: 5,
  },
  ownedEnvelope: {
    foregroundWidthPadding: 24,
    minOwnedRegionWidth: 32,
    minRegionHeight: 35,
    minRegionWidth: 55,
    ownedRegionToForegroundWidthRatio: 1.1,
  },
  longRightmostPart: {
    maxForegroundHeight: 45,
    maxLabelCount: 2,
    minForegroundWidth: 100,
    minRegionWidth: 130,
  },
} as const

export function createPartImageForLabel(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  backgroundModel: BackgroundModel,
  ownershipLabels: readonly CalloutQuantityLabel[],
  suppressionLabels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): CalloutPartImage | null {
  const interior = insetRegion(callout.region, CALLOUT_BORDER_INSET)
  const denseMode = isDenseLabelSet(ownershipLabels)
  const cropOwnershipLabels = createCropLabelSet(ownershipLabels, label, denseMode)
  const cropSuppressionLabels = createCropLabelSet(suppressionLabels, label, denseMode)
  const zone = createPartOwnershipZones(ownershipLabels, interior, { denseMode: isLargeDenseGrid(ownershipLabels) })
    .find((candidate) => candidate.label === label)

  if (!zone) {
    return null
  }

  const searchRegion = createPartSearchRegion(zone, interior)
  const componentSuppressionMasks = createLabelSuppressionMasks(
    createComponentSuppressionLabels(cropSuppressionLabels, label),
  )
  const components = findForegroundComponents(page, searchRegion, backgroundModel, componentSuppressionMasks)
    .filter((component) => isUsableComponent(component, searchRegion, label.region, zone.region))
    .map((component) => ({
      component,
      score: scoreComponent(component, zone),
    }))
    .sort((left, right) => left.score - right.score)
  const region = selectPartRegion(page, components, zone, cropOwnershipLabels, interior, {
    allowRelatedComponents: !denseMode,
    splitSameRowComponents: !denseMode,
    trimConnectedForegroundBelowLabel: denseMode,
  })
  const tallDenseLongShallow = region
    ? isTallDenseLongShallowCropContext(callout.region, ownershipLabels, region.region)
    : false

  const alphaOwnershipLabels = region
    ? createAlphaOwnershipLabels(cropOwnershipLabels, label)
    : cropOwnershipLabels
  const alphaSuppressionLabels = region
    ? createAlphaSuppressionLabels(alphaOwnershipLabels, cropSuppressionLabels, region.ownedRegion ?? region.region)
    : cropSuppressionLabels
  const lowContrastFaceSupportProbe = region
    ? createLowContrastOwnedFaceSupportProbe(ownershipLabels, label, region, denseMode)
    : undefined
  const lowContrastFaceSupportMode = lowContrastFaceSupportProbe
    ? readLowContrastOwnedFaceSupportMode(lowContrastFaceSupportProbe)
    : undefined

  if (!region) {
    return null
  }

  const image = createPartImage(
      page,
      region.region,
      backgroundModel,
      region.ownedRegion,
      createExcludedLabelRegions(cropOwnershipLabels),
      region.foregroundPixels,
      createLabelSuppressionMasks(alphaSuppressionLabels),
      {
        allowTopCropContext: tallDenseLongShallow,
        allowLongShallowTopRecovery: region.allowLongShallowTopRecovery,
        enableLowContrastFaceSupport: Boolean(lowContrastFaceSupportMode),
        lowContrastFaceSupportMode,
        enableTopSupport: !denseMode || isDenseTopSupportSafe(region.region, region.foregroundPixels),
      },
    )

  return clampSameRowTallLowerLabelBottomDrift(
    clampSameRowShallowLowerLabelLeftDrift(image, cropOwnershipLabels, label),
    cropOwnershipLabels,
    label,
  )
}

function clampSameRowShallowLowerLabelLeftDrift(
  image: CalloutPartImage,
  labels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): CalloutPartImage {
  const previous = readPreviousSameRowLabel(labels, label)

  if (!previous || !isShallowLowerLabelImage(image, label)) {
    return image
  }

  const labelBoundary = Math.ceil((regionCenter(previous.region).x + regionCenter(label.region).x) / 2)
  const anchoredLeft = label.region.x - Math.max(10, Math.round(label.region.height * 0.9))
  const targetLeft = Math.max(image.region.x, labelBoundary, anchoredLeft)
  const targetBottom = Math.min(
    image.region.y + image.region.height,
    label.region.y + Math.max(4, Math.round(label.region.height * 0.35)),
  )
  const clearLeft = label.region.x - Math.max(1, Math.round(label.region.height * 0.1))
  const cropLeft = targetLeft - image.region.x
  const nextHeight = targetBottom - image.region.y

  if (
    cropLeft <= 0 &&
    nextHeight >= image.region.height &&
    clearLeft <= image.region.x
  ) {
    return image
  }

  if (
    nextHeight < Math.max(1, Math.round(image.region.height * 0.45)) ||
    cropLeft > Math.max(14, Math.round(label.region.height * 1.4))
  ) {
    return image
  }

  const cleared = clearAlphaBeforePageX(image.alphaMask, image.region, clearLeft)
  const cropRegion = {
    height: nextHeight,
    width: image.region.width - cropLeft,
    x: cropLeft,
    y: 0,
  }

  if (cropRegion.width <= 0 || cropRegion.height <= 0) {
    return image
  }

  const region = {
    height: cropRegion.height,
    width: cropRegion.width,
    x: image.region.x + cropRegion.x,
    y: image.region.y,
  }

  return {
    ...image,
    alphaMask: cropAlphaMask(cleared, cropRegion),
    diagnostics: image.diagnostics
      ? {
          ...image.diagnostics,
          finalCropBounds: region,
        }
      : image.diagnostics,
    region,
  }
}

function clampSameRowTallLowerLabelBottomDrift(
  image: CalloutPartImage,
  labels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): CalloutPartImage {
  const previous = readPreviousSameRowLabel(labels, label)
  const targetBottom = label.region.y - Math.max(5, Math.round(label.region.height * 0.55))
  const currentBottom = image.region.y + image.region.height

  if (
    !previous ||
    currentBottom <= targetBottom ||
    image.region.height < Math.max(60, label.region.height * 5.4) ||
    image.region.width < Math.max(45, label.region.width * 3.2) ||
    label.region.y - image.region.y < Math.max(44, label.region.height * 4)
  ) {
    return image
  }

  const cropHeight = targetBottom - image.region.y

  if (cropHeight < Math.max(1, Math.round(image.region.height * 0.72))) {
    return image
  }

  const cropRegion = {
    height: cropHeight,
    width: image.region.width,
    x: 0,
    y: 0,
  }
  const region = {
    ...image.region,
    height: cropHeight,
  }

  return {
    ...image,
    alphaMask: cropAlphaMask(image.alphaMask, cropRegion),
    diagnostics: image.diagnostics
      ? {
          ...image.diagnostics,
          finalCropBounds: region,
        }
      : image.diagnostics,
    region,
  }
}

function readPreviousSameRowLabel(
  labels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): CalloutQuantityLabel | undefined {
  const row = labels
    .filter((candidate) =>
      candidate !== label &&
      hasComparableQuantityLabelSize(candidate, label) &&
      isInLocalLabelRow(candidate, [label]) &&
      regionCenter(candidate.region).x < regionCenter(label.region).x,
    )
    .sort((left, right) => regionCenter(right.region).x - regionCenter(left.region).x)

  return row[0]
}

function isShallowLowerLabelImage(image: CalloutPartImage, label: CalloutQuantityLabel): boolean {
  const foreground = image.diagnostics?.rawForegroundBounds

  if (!foreground || label.region.width > label.region.height * 1.6) {
    return false
  }

  return image.region.width >= Math.max(72, label.region.width * 5) &&
    image.region.height <= Math.max(56, label.region.height * 5) &&
    image.region.y < label.region.y &&
    image.region.y + image.region.height > label.region.y &&
    foreground.width >= 56 &&
    foreground.width >= foreground.height * 2.2 &&
    foreground.height >= Math.max(22, label.region.height * 1.8) &&
    foreground.height <= Math.max(36, label.region.height * 3.4)
}

function clearAlphaBeforePageX(
  alphaMask: CalloutPartImage["alphaMask"],
  imageRegion: CalloutPartImage["region"],
  pageX: number,
): CalloutPartImage["alphaMask"] {
  const cutoff = Math.max(0, Math.min(alphaMask.width, pageX - imageRegion.x))

  if (cutoff <= 0) {
    return alphaMask
  }

  const data = new Uint8ClampedArray(alphaMask.data)

  for (let y = 0; y < alphaMask.height; y += 1) {
    for (let x = 0; x < cutoff; x += 1) {
      data[y * alphaMask.width + x] = 0
    }
  }

  return {
    ...alphaMask,
    data,
  }
}

function createLowContrastOwnedFaceSupportProbe(
  labels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
  region: SelectedPartRegion,
  denseMode: boolean,
): {
  denseMode: boolean
  foregroundHeight?: number
  foregroundWidth?: number
  isRightmostInMultiLabelRow: boolean
  labelCount: number
  labelHeight: number
  scale: number
  ownedRegionWidth: number
  regionHeight: number
  regionWidth: number
} {
  const foreground = boundsForPixels(region.foregroundPixels)
  const scale = Math.max(1, label.region.height / 16)

  return {
    denseMode,
    foregroundHeight: foreground?.height,
    foregroundWidth: foreground?.width,
    isRightmostInMultiLabelRow: isRightmostInMultiLabelRow(labels, label),
    labelCount: labels.length,
    labelHeight: label.region.height,
    scale,
    ownedRegionWidth: region.ownedRegion.width,
    regionHeight: region.region.height,
    regionWidth: region.region.width,
  }
}

function readLowContrastOwnedFaceSupportMode(
  probe: ReturnType<typeof createLowContrastOwnedFaceSupportProbe>,
): LowContrastFaceSupportMode | undefined {
  if (
    probe.denseMode ||
    !probe.isRightmostInMultiLabelRow ||
    typeof probe.foregroundHeight !== "number" ||
    typeof probe.foregroundWidth !== "number"
  ) {
    return undefined
  }

  const foregroundHeight = probe.foregroundHeight / probe.scale
  const foregroundWidth = probe.foregroundWidth / probe.scale
  const ownedRegionWidth = probe.ownedRegionWidth / probe.scale
  const regionHeight = probe.regionHeight / probe.scale
  const regionWidth = probe.regionWidth / probe.scale
  const { compactMultiPartRowEnd, longRightmostPart, ownedEnvelope } =
    LOW_CONTRAST_FACE_SUPPORT_THRESHOLDS
  const hasOwnedEnvelope = regionHeight >= ownedEnvelope.minRegionHeight &&
    regionWidth >= Math.max(
      ownedEnvelope.minRegionWidth,
      foregroundWidth + ownedEnvelope.foregroundWidthPadding,
    ) &&
    ownedRegionWidth >= Math.max(
      ownedEnvelope.minOwnedRegionWidth,
      foregroundWidth * ownedEnvelope.ownedRegionToForegroundWidthRatio,
    )
  const longRightmostPartMatches = probe.labelCount <= longRightmostPart.maxLabelCount &&
    regionWidth >= longRightmostPart.minRegionWidth &&
    foregroundWidth >= longRightmostPart.minForegroundWidth &&
    foregroundHeight <= longRightmostPart.maxForegroundHeight &&
    hasOwnedEnvelope
  const compactMultiPartRowEndMatches = probe.labelCount >= compactMultiPartRowEnd.minLabelCount &&
    regionWidth <= compactMultiPartRowEnd.maxRegionWidth &&
    foregroundWidth <= compactMultiPartRowEnd.maxForegroundWidth &&
    foregroundHeight <= compactMultiPartRowEnd.maxForegroundHeight &&
    hasOwnedEnvelope

  if (longRightmostPartMatches) {
    return "left"
  }

  return compactMultiPartRowEndMatches ? "top" : undefined
}

function createAlphaOwnershipLabels(
  labels: readonly CalloutQuantityLabel[],
  currentLabel: CalloutQuantityLabel,
): CalloutQuantityLabel[] {
  return labels.filter((label) =>
    label === currentLabel || !isTinyNonPeerNearLabel(label, currentLabel),
  )
}

function isTinyNonPeerNearLabel(
  candidate: CalloutQuantityLabel,
  label: CalloutQuantityLabel,
): boolean {
  if (hasComparableQuantityLabelSize(candidate, label)) {
    return false
  }

  const candidateCenter = regionCenter(candidate.region)
  const labelCenterX = regionCenter(label.region).x
  const labelCenterY = regionCenter(label.region).y
  const horizontalDistance = Math.abs(candidateCenter.x - labelCenterX)
  const verticalDistance = Math.abs(candidateCenter.y - labelCenterY)

  return horizontalDistance <= Math.max(28, label.region.width * 2.2) &&
    verticalDistance <= Math.max(18, label.region.height * 1.8)
}

function isRightmostInMultiLabelRow(
  labels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): boolean {
  const row = labels.filter((candidate) =>
    hasComparableQuantityLabelSize(candidate, label) &&
    isInLocalLabelRow(candidate, [label]),
  )

  if (row.length < 2) {
    return false
  }

  const labelCenterX = regionCenter(label.region).x
  const rightmostCenterX = Math.max(...row.map((candidate) => regionCenter(candidate.region).x))

  return labelCenterX >= rightmostCenterX - Math.max(3, label.region.width * 0.25)
}

function hasComparableQuantityLabelSize(
  candidate: CalloutQuantityLabel,
  label: CalloutQuantityLabel,
): boolean {
  return candidate.region.height >= label.region.height * 0.6 &&
    candidate.region.width >= label.region.width * 0.45
}

function createAlphaSuppressionLabels(
  ownershipLabels: readonly CalloutQuantityLabel[],
  suppressionLabels: readonly CalloutQuantityLabel[],
  selectedRegion: CalloutQuantityLabel["region"],
): CalloutQuantityLabel[] {
  return suppressionLabels.filter((label) =>
    isOwnershipLabel(ownershipLabels, label) ||
    overlapRatio(label.region, selectedRegion) < 0.72,
  )
}

function isOwnershipLabel(
  ownershipLabels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): boolean {
  return ownershipLabels.some((owner) => labelsHaveSameRegion(owner, label))
}

function labelsHaveSameRegion(left: CalloutQuantityLabel, right: CalloutQuantityLabel): boolean {
  return left.text === right.text &&
    left.value === right.value &&
    left.region.x === right.region.x &&
    left.region.y === right.region.y &&
    left.region.width === right.region.width &&
    left.region.height === right.region.height
}

function isDenseTopSupportSafe(
  region: { height: number; width: number },
  foregroundPixels: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  if (region.width >= region.height * 1.4) {
    return true
  }

  if (foregroundPixels.length === 0) {
    return false
  }

  const foreground = boundsForPixels(foregroundPixels)

  return foreground.width >= foreground.height * 1.35 &&
    foreground.width >= region.width * 0.45 &&
    foreground.height <= region.height * 0.75
}

function isTallDenseLongShallowCropContext(
  calloutRegion: { height: number; width: number },
  labels: readonly CalloutQuantityLabel[],
  region: { height: number; width: number },
): boolean {
  if (labels.length < 10) {
    return false
  }

  if (calloutRegion.height < calloutRegion.width * 1.9) {
    return false
  }

  return region.width <= region.height * 1.25
}

function removeCloseUpperDuplicateLabels(
  labels: readonly CalloutQuantityLabel[],
  currentLabel: CalloutQuantityLabel,
): CalloutQuantityLabel[] {
  return labels.filter((label) => label === currentLabel || !isCloseUpperDuplicateLabel(label.region, currentLabel.region))
}

function createCropLabelSet(
  labels: readonly CalloutQuantityLabel[],
  currentLabel: CalloutQuantityLabel,
  denseMode: boolean,
): CalloutQuantityLabel[] {
  const compactedLabels = denseMode
    ? removeCloseUpperDuplicateLabels(labels, currentLabel)
    : [...labels]

  return removeRaisedSingletonPartArtLabels(compactedLabels, currentLabel)
}

function removeRaisedSingletonPartArtLabels(
  labels: readonly CalloutQuantityLabel[],
  currentLabel: CalloutQuantityLabel,
): CalloutQuantityLabel[] {
  if (!hasSameRowPeer(labels, currentLabel)) {
    return [...labels]
  }

  return labels.filter((label) =>
    label === currentLabel || !isRaisedSingletonPartArtLabel(labels, label, currentLabel),
  )
}

function hasSameRowPeer(
  labels: readonly CalloutQuantityLabel[],
  currentLabel: CalloutQuantityLabel,
): boolean {
  return labels.some((label) =>
    label !== currentLabel &&
    hasComparableQuantityLabelSize(label, currentLabel) &&
    isInLocalLabelRow(label, [currentLabel]),
  )
}

function isRaisedSingletonPartArtLabel(
  labels: readonly CalloutQuantityLabel[],
  candidate: CalloutQuantityLabel,
  currentLabel: CalloutQuantityLabel,
): boolean {
  if (
    candidate.recoveryKind ||
    !hasComparableQuantityLabelSize(candidate, currentLabel) ||
    isInLocalLabelRow(candidate, [currentLabel]) ||
    hasSameRowPeer(labels, candidate)
  ) {
    return false
  }

  const verticalSeparation = regionCenter(currentLabel.region).y - regionCenter(candidate.region).y
  const horizontalSeparation = Math.abs(regionCenter(currentLabel.region).x - regionCenter(candidate.region).x)

  return verticalSeparation >= Math.max(18, currentLabel.region.height * 1.6) &&
    verticalSeparation <= Math.max(58, currentLabel.region.height * 5.2) &&
    horizontalSeparation <= Math.max(28, currentLabel.region.width * 2.2)
}

function isCloseUpperDuplicateLabel(upper: CalloutQuantityLabel["region"], lower: CalloutQuantityLabel["region"]): boolean {
  const verticalSeparation = regionCenter(lower).y - regionCenter(upper).y
  const horizontalSeparation = Math.abs(regionCenter(lower).x - regionCenter(upper).x)

  return verticalSeparation >= Math.max(6, upper.height * 0.5) &&
    verticalSeparation <= Math.max(24, upper.height * 2.2) &&
    horizontalSeparation <= Math.max(20, Math.max(upper.width, lower.width) * 0.85)
}

function createComponentSuppressionLabels(
  suppressionLabels: readonly CalloutQuantityLabel[],
  currentLabel: CalloutQuantityLabel,
): CalloutQuantityLabel[] {
  if (currentLabel.recoveryKind !== "attached-baseline") {
    return [...suppressionLabels]
  }

  return suppressionLabels.filter((label) => label !== currentLabel)
}

function isDenseLabelSet(labels: readonly CalloutQuantityLabel[]): boolean {
  return labels.length >= 10
}

function isLargeDenseGrid(labels: readonly CalloutQuantityLabel[]): boolean {
  if (labels.length < 20) {
    return false
  }

  const rows = clusterLocalLabelRows(labels)

  return rows.length >= 3 && rows.some((row) => row.length >= 6)
}

function clusterLocalLabelRows(labels: readonly CalloutQuantityLabel[]): CalloutQuantityLabel[][] {
  const rows: CalloutQuantityLabel[][] = []

  for (const label of [...labels].sort((left, right) => left.region.y - right.region.y)) {
    const row = rows.find((candidateRow) => isInLocalLabelRow(label, candidateRow))

    if (row) {
      row.push(label)
    } else {
      rows.push([label])
    }
  }

  return rows
}

function isInLocalLabelRow(label: CalloutQuantityLabel, row: readonly CalloutQuantityLabel[]): boolean {
  const rowCenterY = row.reduce((sum, entry) => sum + entry.region.y + entry.region.height / 2, 0) / row.length
  const labelCenterY = label.region.y + label.region.height / 2
  const tolerance = Math.max(8, Math.round(label.region.height * 1.4))

  return Math.abs(labelCenterY - rowCenterY) <= tolerance
}
