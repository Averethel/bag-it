import type {
  CalloutPartAlphaMask,
  CalloutPartImageDiagnostics,
  CalloutPartItem,
} from "@bag-it/callout-parts"
import type { DetectedPartColor } from "@bag-it/part-colors"
import {
  findRasterQuantityLabels,
  type RasterQuantityLabel,
} from "@bag-it/raster-quantity-labels"
import {
  compareStepCalloutRegions,
  hasStepCalloutOffManualStyleBackgroundEvidence,
  stepCalloutRegionSmallerOverlapRatio,
} from "@bag-it/step-callouts"
import type {
  StepDetectorV2CandidateEvidence,
  StepDetectorV2PageInput,
  StepDetectorV2Region,
  StepDetectorV2ResolvedCallout,
  StepDetectorV2RgbColor,
} from "./contracts"
import type {
  StepProcessingTimingSummary,
  StepSectionBoundaryHint,
} from "../step-detection-contracts"

const DIAGNOSTIC_BACKGROUND_HEX = "#f3f4f6"
const CALLOUT_CROP_PADDING = 8
const TOP_FILL_PANEL_CROP_BOUNDARY_BACKGROUND_MIN = 0.09
const TOP_FILL_PANEL_CROP_BOUNDARY_BORDER_MIN = 0.9
const TOP_FILL_PANEL_CROP_BOUNDARY_FILL_BORDER_MAX = 0.5
const TOP_FILL_PANEL_CROP_BOUNDARY_OVERLAP_MIN = 0.95
const TOP_FILL_PANEL_CROP_BOUNDARY_TOP_RATIO_MAX = 0.15
const TOP_FILL_PANEL_CROP_BOUNDARY_WIDTH_MAX = 360
const EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_WIDTH_MAX = 120
const EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_AREA_RATIO_MAX = 2.2
const EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_BORDER_MIN = 0.3
const EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_OVERLAP_MIN = 0.95
const MANUAL_STYLE_FILL_PANEL_SOURCE_CROP_BORDER_MAX = 0.6
const OVERLAPPING_FILL_BACKGROUND_MIN = 0.6
const OVERLAPPING_FILL_BACKGROUND_SOURCE_MAX = 0.7
const OVERLAPPING_FILL_BACKGROUND_OVERLAP_MIN = 0.95
const OVERLAPPING_FILL_PANEL_SOURCE_BORDER_MIN = 0.6
const OVERLAPPING_FILL_PANEL_SOURCE_OVERLAP_MIN = 0.95
const CLIPPED_RIGHT_FILL_PANEL_LABEL_COUNT_MIN = 3
const CLIPPED_RIGHT_FILL_PANEL_LEFT_GAP_MIN = 64
const CLIPPED_RIGHT_FILL_PANEL_LEFT_GAP_RATIO_MIN = 0.24
const CLIPPED_RIGHT_FILL_PANEL_RIGHT_GAP_MAX = 10
const RASTER_LOWER_ROW_QUANTITY_LABEL_REASON = "raster-lower-row-quantity-label"
const MANUAL_STYLE_BACKGROUND_REASON_PREFIX = "manual-style-background:"
const PAGE_LOCAL_BACKGROUND_REASON_PREFIX = "page-local-background"
const CALLOUT_READING_ROW_Y_TOLERANCE = 12

interface CalloutCropSelection {
  padding: number
  partExtractionRegion?: StepDetectorV2Region
  region: StepDetectorV2Region
}

export interface StepDetectorV2OutputAssemblyOptions {
  detectorVersion: string
  pageCount: number
  pageLimit: number | null
  partColorCalibrationVersion?: string
  partItems?: readonly CalloutPartItem[]
  partExtractorVersion?: string
}

export interface StepDetectorV2BuildStepsResult {
  callouts: StepDetectorV2BuildStepsCallout[]
  detectorVersion: string
  pageAttentionItems: []
  pageCount: number
  pageLimit: number | null
  partColorCalibrationVersion?: string
  partExtractorVersion?: string
  pagePreviews: StepDetectorV2PagePreview[]
  qualitySummary: {
    firstBuildStepPageNumber: number | null
    inferredCalloutBackgrounds: []
  }
  scannedPageNumbers: number[]
  skippedPageNumbers: number[]
  status: "detected" | "empty"
  timing?: StepProcessingTimingSummary
  previewTiming?: StepProcessingTimingSummary
  sectionBoundaryHints?: StepSectionBoundaryHint[]
}

export interface StepDetectorV2BuildStepsCallout {
  confidence: number
  crop: {
    imageDataUrl?: string
    region: StepDetectorV2Region
  }
  detectorCandidateId: string
  id: string
  indexOnPage: number
  inferredBackground: {
    confidence: number
    hex: string
    rgb: {
      b: number
      g: number
      r: number
    }
  }
  pageNumber: number
  partItems: StepDetectorV2BuildStepsPartItem[]
  partExtractionRegion?: StepDetectorV2Region
  sourceRegion: StepDetectorV2Region
  stepIndex: number
}

export interface StepDetectorV2BuildStepsPartItem {
  confidence: number
  detectedColor?: DetectedPartColor
  id: string
  indexOnCallout: number
  partImage: {
    alphaMask: CalloutPartAlphaMask
    diagnostics?: CalloutPartImageDiagnostics
    imageDataUrl?: string
    region: StepDetectorV2Region
  }
  partRegion: StepDetectorV2Region
  quantity: {
    confidence: number
    text: string
    value: number | null
  }
  quantityLabel: {
    crop?: {
      imageDataUrl?: string
      region: StepDetectorV2Region
    }
    imageDataUrl?: string
    region: StepDetectorV2Region
  }
  sourceRegion: StepDetectorV2Region
}

export interface StepDetectorV2PagePreview {
  height: number
  imageDataUrl?: string
  pageNumber: number
  width: number
}

export function assembleV2BuildStepsResult(
  pages: readonly StepDetectorV2PageInput[],
  resolvedCallouts: readonly StepDetectorV2ResolvedCallout[],
  evidence: readonly StepDetectorV2CandidateEvidence[],
  options: StepDetectorV2OutputAssemblyOptions,
): StepDetectorV2BuildStepsResult {
  const acceptedCallouts = resolvedCallouts
    .filter((callout) => callout.status === "accepted")
    .sort(compareResolvedCallouts)

  return {
    callouts: createBuildStepCallouts(acceptedCallouts, evidence, pages, options.partItems ?? []),
    detectorVersion: options.detectorVersion,
    pageAttentionItems: [],
    pageCount: options.pageCount,
    pageLimit: options.pageLimit,
    partColorCalibrationVersion: options.partColorCalibrationVersion,
    partExtractorVersion: options.partExtractorVersion,
    pagePreviews: pages.map(createPagePreview),
    qualitySummary: {
      firstBuildStepPageNumber: firstAcceptedPageNumber(resolvedCallouts),
      inferredCalloutBackgrounds: [],
    },
    scannedPageNumbers: pages.map((page) => page.pageNumber),
    sectionBoundaryHints: createSectionBoundaryHints(acceptedCallouts, resolvedCallouts, evidence, pages),
    skippedPageNumbers: [],
    status: acceptedCallouts.length > 0 ? "detected" : "empty",
  }
}

function createSectionBoundaryHints(
  visibleCallouts: readonly StepDetectorV2ResolvedCallout[],
  resolvedCallouts: readonly StepDetectorV2ResolvedCallout[],
  evidence: readonly StepDetectorV2CandidateEvidence[],
  pages: readonly StepDetectorV2PageInput[],
): StepSectionBoundaryHint[] {
  const firstVisibleCalloutByPage = createFirstVisibleCalloutByPage(visibleCallouts)
  const evidenceByCandidateId = new Map(
    evidence.map((candidateEvidence) => [candidateEvidence.candidate.id, candidateEvidence]),
  )
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]))

  return resolvedCallouts
    .filter((callout) => callout.status === "rejected")
    .map((callout) => {
      const candidateEvidence = evidenceByCandidateId.get(callout.candidateId)
      const firstVisibleCallout = firstVisibleCalloutByPage.get(callout.pageNumber)
      const page = pageByNumber.get(callout.pageNumber)

      if (
        !candidateEvidence ||
        !firstVisibleCallout ||
        !page ||
        !hasStepCalloutOffManualStyleBackgroundEvidence(candidateEvidence.scores) ||
        !isNearFirstVisibleCalloutBand(callout.region, firstVisibleCallout.region, page)
      ) {
        return null
      }

      const hint: StepSectionBoundaryHint = {
        confidence: readEvidenceValue(candidateEvidence, "background"),
        id: `section-boundary-${callout.candidateId}`,
        kind: "off-style-rejected-callout",
        pageNumber: callout.pageNumber,
        position: "before-page",
        sourceRegion: callout.region,
      }

      return hint
    })
    .filter((hint): hint is StepSectionBoundaryHint => Boolean(hint))
}

function createFirstVisibleCalloutByPage(
  callouts: readonly StepDetectorV2ResolvedCallout[],
): Map<number, StepDetectorV2ResolvedCallout> {
  const firstByPage = new Map<number, StepDetectorV2ResolvedCallout>()

  for (const callout of [...callouts].sort(compareResolvedCallouts)) {
    if (!firstByPage.has(callout.pageNumber)) {
      firstByPage.set(callout.pageNumber, callout)
    }
  }

  return firstByPage
}

function isNearFirstVisibleCalloutBand(
  candidateRegion: StepDetectorV2Region,
  firstCalloutRegion: StepDetectorV2Region,
  page: StepDetectorV2PageInput,
): boolean {
  const bandBottom = Math.min(
    page.height * 0.35,
    firstCalloutRegion.y + firstCalloutRegion.height * 1.5,
  )

  return candidateRegion.y <= bandBottom && candidateRegion.y + candidateRegion.height >= 0
}

function createBuildStepCallouts(
  callouts: readonly StepDetectorV2ResolvedCallout[],
  evidence: readonly StepDetectorV2CandidateEvidence[],
  pages: readonly StepDetectorV2PageInput[],
  partItems: readonly CalloutPartItem[],
): StepDetectorV2BuildStepsCallout[] {
  const evidenceByCandidateId = new Map(
    evidence.map((candidateEvidence) => [candidateEvidence.candidate.id, candidateEvidence]),
  )
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]))
  const indexByPage = new Map<number, number>()

  return callouts.map((callout, stepIndex) =>
    createBuildStepCallout(
      callout,
      evidenceByCandidateId,
      evidence,
      pageByNumber,
      indexByPage,
      stepIndex,
      partItems,
    ),
  )
}

function createBuildStepCallout(
  callout: StepDetectorV2ResolvedCallout,
  evidenceByCandidateId: ReadonlyMap<string, StepDetectorV2CandidateEvidence>,
  allEvidence: readonly StepDetectorV2CandidateEvidence[],
  pageByNumber: ReadonlyMap<number, StepDetectorV2PageInput>,
  indexByPage: Map<number, number>,
  stepIndex: number,
  partItems: readonly CalloutPartItem[],
): StepDetectorV2BuildStepsCallout {
  const indexOnPage = nextPageIndex(indexByPage, callout.pageNumber)
  const evidence = evidenceByCandidateId.get(callout.candidateId)
  const outputEvidence = selectOverlappingManualStyleFillPanelSourceEvidence(evidence, allEvidence) ?? evidence
  const outputCallout = outputEvidence
    ? {
        ...callout,
        candidateId: outputEvidence.candidate.id,
        region: outputEvidence.candidate.region,
      }
    : callout
  const page = pageByNumber.get(callout.pageNumber)
  const normalizedCalloutRegion = selectQuantityBoundedFillPanelRegion(outputCallout, outputEvidence, page)
  const normalizedCallout = normalizedCalloutRegion
    ? { ...outputCallout, region: normalizedCalloutRegion }
    : outputCallout
  const cropSelection = selectCalloutCropSelection(normalizedCallout, outputEvidence, allEvidence, page)

  return {
    confidence: normalizeCalloutConfidence(evidence?.totalScore ?? 0),
    crop: {
      region: createCalloutCropRegion(cropSelection.region, page, cropSelection.padding),
    },
    detectorCandidateId: normalizedCallout.candidateId,
    id: `v2-${normalizedCallout.candidateId}`,
    indexOnPage,
    inferredBackground: createInferredBackground(normalizedCallout, outputEvidence, allEvidence, pageByNumber),
    pageNumber: normalizedCallout.pageNumber,
    partItems: createBuildStepPartItems(normalizedCallout, partItems),
    ...(cropSelection.partExtractionRegion
      ? { partExtractionRegion: cropSelection.partExtractionRegion }
      : {}),
    sourceRegion: normalizedCallout.region,
    stepIndex: stepIndex + 1,
  }
}

function selectQuantityBoundedFillPanelRegion(
  callout: StepDetectorV2ResolvedCallout,
  evidence: StepDetectorV2CandidateEvidence | undefined,
  page: StepDetectorV2PageInput | undefined,
): StepDetectorV2Region | null {
  if (
    !evidence ||
    !page ||
    evidence.candidate.source !== "fill-panel" ||
    !hasEvidenceReasonPrefix(evidence, "background", MANUAL_STYLE_BACKGROUND_REASON_PREFIX) ||
    !hasEvidenceReason(evidence, "quantity", RASTER_LOWER_ROW_QUANTITY_LABEL_REASON)
  ) {
    return null
  }

  const labels = findRasterQuantityLabels(page, callout.region, evidence.background)
  const lowerRow = selectClippedRightFillPanelQuantityRow(callout.region, labels)

  if (!lowerRow) {
    return null
  }

  const first = lowerRow[0]
  const last = lowerRow[lowerRow.length - 1]
  const labelHeight = readMedian(lowerRow.map((label) => label.region.height))
  const leftGap = first.region.x - callout.region.x
  const rightGap = callout.region.x + callout.region.width - (last.region.x + last.region.width)

  if (
    leftGap < Math.max(
      CLIPPED_RIGHT_FILL_PANEL_LEFT_GAP_MIN,
      callout.region.width * CLIPPED_RIGHT_FILL_PANEL_LEFT_GAP_RATIO_MIN,
    ) ||
    rightGap > Math.max(CLIPPED_RIGHT_FILL_PANEL_RIGHT_GAP_MAX, labelHeight * 0.9)
  ) {
    return null
  }

  const rowTop = Math.min(...lowerRow.map((label) => label.region.y))
  const rowBottom = Math.max(...lowerRow.map((label) => label.region.y + label.region.height))
  const left = Math.max(0, first.region.x - Math.max(18, Math.round(labelHeight * 1.7)))
  const top = Math.max(0, rowTop - Math.max(50, Math.round(labelHeight * 5.2)))
  const right = Math.min(page.width, last.region.x + last.region.width + Math.max(48, Math.round(labelHeight * 4.7)))
  const bottom = Math.min(page.height, rowBottom + Math.max(24, Math.round(labelHeight * 2.2)))

  return {
    height: Math.max(1, bottom - top),
    width: Math.max(1, right - left),
    x: left,
    y: top,
  }
}

function selectClippedRightFillPanelQuantityRow(
  region: StepDetectorV2Region,
  labels: readonly RasterQuantityLabel[],
): RasterQuantityLabel[] | null {
  const rows = clusterQuantityLabelRows(labels.filter((label) =>
    label.region.y >= region.y + region.height * 0.45 &&
    label.region.height <= 30 &&
    label.region.height / region.height <= 0.3,
  ))
  const row = rows
    .filter((candidate) => candidate.length >= CLIPPED_RIGHT_FILL_PANEL_LABEL_COUNT_MIN)
    .sort((left, right) => right.length - left.length || readRowXSpread(right) - readRowXSpread(left))[0]

  return row ? [...row].sort((left, right) => left.region.x - right.region.x) : null
}

function clusterQuantityLabelRows(labels: readonly RasterQuantityLabel[]): RasterQuantityLabel[][] {
  const rows: RasterQuantityLabel[][] = []

  for (const label of [...labels].sort((left, right) => left.region.y - right.region.y)) {
    const row = rows.find((candidateRow) => labelsShareRow(label, candidateRow))

    if (row) {
      row.push(label)
    } else {
      rows.push([label])
    }
  }

  return rows
}

function labelsShareRow(label: RasterQuantityLabel, row: readonly RasterQuantityLabel[]): boolean {
  const centerY = row.reduce((total, candidate) => total + regionCenterY(candidate.region), 0) / row.length

  return Math.abs(regionCenterY(label.region) - centerY) <=
    Math.max(8, Math.max(label.region.height, readMedian(row.map((candidate) => candidate.region.height))) * 1.1)
}

function readRowXSpread(row: readonly RasterQuantityLabel[]): number {
  const left = Math.min(...row.map((label) => label.region.x))
  const right = Math.max(...row.map((label) => label.region.x + label.region.width))

  return right - left
}

function readMedian(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0
}

function regionCenterY(region: StepDetectorV2Region): number {
  return region.y + region.height / 2
}

function selectOverlappingManualStyleFillPanelSourceEvidence(
  evidence: StepDetectorV2CandidateEvidence | undefined,
  allEvidence: readonly StepDetectorV2CandidateEvidence[],
): StepDetectorV2CandidateEvidence | null {
  if (
    !evidence ||
    evidence.candidate.source === "fill-panel"
  ) {
    return null
  }

  const region = evidence.candidate.region
  const area = region.width * region.height

  return allEvidence
    .filter((candidateEvidence) => {
      const candidate = candidateEvidence.candidate
      const candidateArea = candidate.region.width * candidate.region.height

      return (
        candidate.pageNumber === evidence.candidate.pageNumber &&
        candidate.source === "fill-panel" &&
        candidateArea <= area &&
        stepCalloutRegionSmallerOverlapRatio(region, candidate.region) >=
          OVERLAPPING_FILL_PANEL_SOURCE_OVERLAP_MIN &&
        hasEvidenceReasonPrefix(candidateEvidence, "background", MANUAL_STYLE_BACKGROUND_REASON_PREFIX) &&
        hasEvidenceReason(candidateEvidence, "quantity", RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
        readEvidenceValue(candidateEvidence, "border") >= OVERLAPPING_FILL_PANEL_SOURCE_BORDER_MIN
      )
    })
    .sort((left, right) =>
      (right.candidate.region.width * right.candidate.region.height) -
        (left.candidate.region.width * left.candidate.region.height) ||
      compareStepCalloutRegions(left.candidate.region, right.candidate.region)
    )[0] ?? null
}

function selectCalloutCropSelection(
  callout: StepDetectorV2ResolvedCallout,
  evidence: StepDetectorV2CandidateEvidence | undefined,
  allEvidence: readonly StepDetectorV2CandidateEvidence[],
  page: StepDetectorV2PageInput | undefined,
): CalloutCropSelection {
  if (!evidence || !page) {
    return {
      padding: CALLOUT_CROP_PADDING,
      region: callout.region,
    }
  }

  if (!hasWeakTopFillPanelCropBoundarySupport(evidence, page)) {
    const compactExtractionRegion = selectExpandedCompactFillPanelExtractionRegion(evidence, allEvidence)
    const sourceCropOnly = Boolean(compactExtractionRegion) ||
      hasManualStyleFillPanelSourceCrop(evidence)

    return {
      padding: sourceCropOnly ? 0 : CALLOUT_CROP_PADDING,
      ...(compactExtractionRegion ? { partExtractionRegion: compactExtractionRegion } : {}),
      region: callout.region,
    }
  }

  const boundaryRegion = allEvidence
    .filter((candidateEvidence) => hasTopLineRectangleCropBoundary(candidateEvidence, evidence, page))
    .sort((left, right) =>
      right.totalScore - left.totalScore ||
      compareStepCalloutRegions(left.candidate.region, right.candidate.region)
    )[0]?.candidate.region ?? callout.region

  return {
    padding: CALLOUT_CROP_PADDING,
    region: boundaryRegion,
  }
}

function selectExpandedCompactFillPanelExtractionRegion(
  evidence: StepDetectorV2CandidateEvidence | undefined,
  allEvidence: readonly StepDetectorV2CandidateEvidence[],
): StepDetectorV2Region | null {
  if (!evidence) {
    return null
  }

  const region = evidence.candidate.region
  const area = region.width * region.height

  if (
    evidence.candidate.source !== "fill-panel" ||
    region.width > EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_WIDTH_MAX ||
    !hasEvidenceReasonPrefix(evidence, "background", MANUAL_STYLE_BACKGROUND_REASON_PREFIX) ||
    !hasEvidenceReason(evidence, "quantity", RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) ||
    readEvidenceValue(evidence, "border") < EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_BORDER_MIN
  ) {
    return null
  }

  return allEvidence
    .filter((candidateEvidence) => {
      const candidateRegion = candidateEvidence.candidate.region
      const candidateArea = candidateRegion.width * candidateRegion.height

      return (
        candidateEvidence.candidate.pageNumber === evidence.candidate.pageNumber &&
        candidateEvidence.candidate.source === "fill-panel" &&
        candidateEvidence.candidate.id !== evidence.candidate.id &&
        candidateArea < area &&
        area / candidateArea <= EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_AREA_RATIO_MAX &&
        stepCalloutRegionSmallerOverlapRatio(region, candidateRegion) >=
          EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_OVERLAP_MIN
      )
    })
    .sort((left, right) =>
      (right.candidate.region.width * right.candidate.region.height) -
        (left.candidate.region.width * left.candidate.region.height) ||
      compareStepCalloutRegions(left.candidate.region, right.candidate.region)
    )[0]?.candidate.region ?? null
}

function hasManualStyleFillPanelSourceCrop(
  evidence: StepDetectorV2CandidateEvidence,
): boolean {
  return (
    evidence.candidate.source === "fill-panel" &&
    hasEvidenceReasonPrefix(evidence, "background", MANUAL_STYLE_BACKGROUND_REASON_PREFIX) &&
    hasEvidenceReason(evidence, "quantity", RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readEvidenceValue(evidence, "border") >= EXPANDED_COMPACT_FILL_PANEL_NO_PADDING_BORDER_MIN &&
    readEvidenceValue(evidence, "border") <= MANUAL_STYLE_FILL_PANEL_SOURCE_CROP_BORDER_MAX
  )
}

function hasWeakTopFillPanelCropBoundarySupport(
  evidence: StepDetectorV2CandidateEvidence,
  page: StepDetectorV2PageInput,
): boolean {
  const region = evidence.candidate.region

  return (
    evidence.candidate.source === "fill-panel" &&
    region.y / page.height <= TOP_FILL_PANEL_CROP_BOUNDARY_TOP_RATIO_MAX &&
    region.width <= TOP_FILL_PANEL_CROP_BOUNDARY_WIDTH_MAX &&
    hasEvidenceReasonPrefix(evidence, "background", PAGE_LOCAL_BACKGROUND_REASON_PREFIX) &&
    hasEvidenceReason(evidence, "quantity", RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readEvidenceValue(evidence, "border") <= TOP_FILL_PANEL_CROP_BOUNDARY_FILL_BORDER_MAX
  )
}

function hasTopLineRectangleCropBoundary(
  boundaryEvidence: StepDetectorV2CandidateEvidence,
  fillPanelEvidence: StepDetectorV2CandidateEvidence,
  page: StepDetectorV2PageInput,
): boolean {
  const boundaryRegion = boundaryEvidence.candidate.region

  return (
    boundaryEvidence.candidate.pageNumber === fillPanelEvidence.candidate.pageNumber &&
    boundaryEvidence.candidate.source === "line-rectangle" &&
    boundaryRegion.y / page.height <= TOP_FILL_PANEL_CROP_BOUNDARY_TOP_RATIO_MAX &&
    boundaryRegion.width <= TOP_FILL_PANEL_CROP_BOUNDARY_WIDTH_MAX &&
    stepCalloutRegionSmallerOverlapRatio(
      boundaryRegion,
      fillPanelEvidence.candidate.region,
    ) >= TOP_FILL_PANEL_CROP_BOUNDARY_OVERLAP_MIN &&
    hasEvidenceReasonPrefix(boundaryEvidence, "background", PAGE_LOCAL_BACKGROUND_REASON_PREFIX) &&
    hasEvidenceReason(boundaryEvidence, "quantity", RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readEvidenceValue(boundaryEvidence, "background") >= TOP_FILL_PANEL_CROP_BOUNDARY_BACKGROUND_MIN &&
    readEvidenceValue(boundaryEvidence, "border") >= TOP_FILL_PANEL_CROP_BOUNDARY_BORDER_MIN
  )
}

function createCalloutCropRegion(
  region: StepDetectorV2Region,
  page: StepDetectorV2PageInput | undefined,
  padding = CALLOUT_CROP_PADDING,
): StepDetectorV2Region {
  const x = Math.max(0, region.x - padding)
  const y = Math.max(0, region.y - padding)
  const right = page
    ? Math.min(page.width, region.x + region.width + padding)
    : region.x + region.width + padding
  const bottom = page
    ? Math.min(page.height, region.y + region.height + padding)
    : region.y + region.height + padding

  return {
    height: Math.max(0, bottom - y),
    width: Math.max(0, right - x),
    x,
    y,
  }
}

export function createBuildStepPartItems(
  callout: Pick<StepDetectorV2ResolvedCallout, "candidateId">,
  partItems: readonly CalloutPartItem[],
): StepDetectorV2BuildStepsPartItem[] {
  return partItems
    .filter((partItem) => partItem.calloutId === callout.candidateId)
    .sort((left, right) => left.indexOnCallout - right.indexOnCallout)
    .map(createBuildStepPartItem)
}

function createBuildStepPartItem(
  partItem: CalloutPartItem,
): StepDetectorV2BuildStepsPartItem {
  return {
    confidence: partItem.confidence,
    id: `v2-${partItem.calloutId}-part-${partItem.indexOnCallout}`,
    indexOnCallout: partItem.indexOnCallout,
    partImage: partItem.partImage,
    partRegion: partItem.partImage.region,
    quantity: {
      confidence: partItem.quantityLabel.confidence,
      text: partItem.quantityLabel.text,
      value: partItem.quantityLabel.value,
    },
    quantityLabel: {
      crop: {
        region: partItem.quantityLabel.region,
      },
      region: partItem.quantityLabel.region,
    },
    sourceRegion: partItem.sourceRegion,
  }
}

function nextPageIndex(indexByPage: Map<number, number>, pageNumber: number): number {
  const index = indexByPage.get(pageNumber) ?? 0
  indexByPage.set(pageNumber, index + 1)
  return index
}

function createPagePreview(page: StepDetectorV2PageInput): StepDetectorV2PagePreview {
  return {
    height: page.height,
    pageNumber: page.pageNumber,
    width: page.width,
  }
}

function firstAcceptedPageNumber(
  resolvedCallouts: readonly StepDetectorV2ResolvedCallout[],
): number | null {
  const acceptedCallout = resolvedCallouts.find((callout) => callout.status === "accepted")
  return acceptedCallout?.pageNumber ?? null
}

function normalizeCalloutConfidence(totalScore: number): number {
  return Math.min(1, Math.max(0, totalScore / 3))
}

function createInferredBackground(
  callout: StepDetectorV2ResolvedCallout,
  evidence: StepDetectorV2CandidateEvidence | undefined,
  allEvidence: readonly StepDetectorV2CandidateEvidence[],
  pageByNumber: ReadonlyMap<number, StepDetectorV2PageInput>,
): StepDetectorV2BuildStepsCallout["inferredBackground"] {
  const page = pageByNumber.get(callout.pageNumber)

  if (!page || !evidence) {
    return createDiagnosticBackground()
  }

  const backgroundEvidence = selectInferredBackgroundEvidence(evidence, allEvidence)
  const rgb = backgroundEvidence.background

  return {
    confidence: readEvidenceValue(backgroundEvidence, "background"),
    hex: rgbToHex(rgb),
    rgb,
  }
}

function selectInferredBackgroundEvidence(
  evidence: StepDetectorV2CandidateEvidence,
  allEvidence: readonly StepDetectorV2CandidateEvidence[],
): StepDetectorV2CandidateEvidence {
  if (
    evidence.candidate.source === "fill-panel" ||
    readEvidenceValue(evidence, "background") >= OVERLAPPING_FILL_BACKGROUND_SOURCE_MAX
  ) {
    return evidence
  }

  return allEvidence
    .filter((candidateEvidence) =>
      candidateEvidence.candidate.pageNumber === evidence.candidate.pageNumber &&
      candidateEvidence.candidate.source === "fill-panel" &&
      stepCalloutRegionSmallerOverlapRatio(
        candidateEvidence.candidate.region,
        evidence.candidate.region,
      ) >= OVERLAPPING_FILL_BACKGROUND_OVERLAP_MIN &&
      hasEvidenceReasonPrefix(candidateEvidence, "background", MANUAL_STYLE_BACKGROUND_REASON_PREFIX) &&
      hasEvidenceReason(candidateEvidence, "quantity", RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
      readEvidenceValue(candidateEvidence, "background") >= OVERLAPPING_FILL_BACKGROUND_MIN &&
      readEvidenceValue(candidateEvidence, "background") >= readEvidenceValue(evidence, "background")
    )
    .sort((left, right) =>
      readEvidenceValue(right, "background") - readEvidenceValue(left, "background") ||
      compareStepCalloutRegions(left.candidate.region, right.candidate.region)
    )[0] ?? evidence
}

function createDiagnosticBackground(): StepDetectorV2BuildStepsCallout["inferredBackground"] {
  return {
    confidence: 0,
    hex: DIAGNOSTIC_BACKGROUND_HEX,
    rgb: {
      b: 246,
      g: 244,
      r: 243,
    },
  }
}

function readEvidenceValue(
  evidence: StepDetectorV2CandidateEvidence,
  signal: StepDetectorV2CandidateEvidence["scores"][number]["signal"],
): number {
  return evidence.scores.find((score) => score.signal === signal)?.value ?? 0
}

function hasEvidenceReason(
  evidence: StepDetectorV2CandidateEvidence,
  signal: StepDetectorV2CandidateEvidence["scores"][number]["signal"],
  reason: string,
): boolean {
  return evidence.scores.some((score) =>
    score.signal === signal &&
    score.reasons.includes(reason),
  )
}

function hasEvidenceReasonPrefix(
  evidence: StepDetectorV2CandidateEvidence,
  signal: StepDetectorV2CandidateEvidence["scores"][number]["signal"],
  reasonPrefix: string,
): boolean {
  return evidence.scores.some((score) =>
    score.signal === signal &&
    score.reasons.some((reason) => reason.startsWith(reasonPrefix)),
  )
}

function rgbToHex(rgb: StepDetectorV2RgbColor): string {
  return `#${channelToHex(rgb.r)}${channelToHex(rgb.g)}${channelToHex(rgb.b)}`
}

function channelToHex(value: number): string {
  return value.toString(16).padStart(2, "0")
}

function compareResolvedCallouts(
  left: StepDetectorV2ResolvedCallout,
  right: StepDetectorV2ResolvedCallout,
): number {
  if (
    left.pageNumber === right.pageNumber &&
    Math.abs(left.region.y - right.region.y) <= CALLOUT_READING_ROW_Y_TOLERANCE
  ) {
    return (
      left.region.x - right.region.x ||
      left.region.y - right.region.y ||
      compareStepCalloutRegions(left.region, right.region)
    )
  }

  return (
    left.pageNumber - right.pageNumber ||
    compareStepCalloutRegions(left.region, right.region)
  )
}
