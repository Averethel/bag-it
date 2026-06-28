import type {
  StepCalloutCandidateEvidence,
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutResolutionStatus,
} from "./contracts"
import {
  hasStepCalloutManualStyleBackgroundEvidence,
  hasStepCalloutPageLocalBackgroundEvidence,
} from "./evidence-reasons"
import {
  readStepCalloutEvidenceSignalValue,
  type StepCalloutResolutionDraft,
} from "./resolution-draft"
import { isStepCalloutDarkPixel } from "./pixels"
import { stepCalloutRegionArea } from "./regions"

const ACCEPTED_TOTAL_MIN = 2.1
const DIAGNOSTIC_TOTAL_MIN = 1.2
const DIAGNOSTIC_BORDER_MIN = 0.45
const DIAGNOSTIC_BACKGROUND_MIN = 0.6
const LARGE_OCCLUDED_AREA_RATIO_MAX = 0.42
const LARGE_OCCLUDED_AREA_RATIO_MIN = 0.25
const LARGE_OCCLUDED_BACKGROUND_MIN = 0.4
const LARGE_OCCLUDED_BORDER_MIN = 0.7
const LARGE_OCCLUDED_TOP_RATIO_MAX = 0.45
const LARGE_OCCLUDED_WIDTH_RATIO_MIN = 0.45
const LONG_BOTTOM_BORDER_AREA_RATIO_MAX = 0.18
const LONG_BOTTOM_BORDER_AREA_RATIO_MIN = 0.06
const LONG_BOTTOM_BORDER_ASPECT_RATIO_MIN = 4.5
const LONG_BOTTOM_BORDER_BACKGROUND_MIN = 0.9
const LONG_BOTTOM_BORDER_BORDER_MIN = 0.1
const LONG_BOTTOM_BORDER_HEIGHT_RATIO_MAX = 0.22
const LONG_BOTTOM_BORDER_HEIGHT_RATIO_MIN = 0.08
const LONG_BOTTOM_BORDER_Y_RATIO_MIN = 0.6
const LONG_BOTTOM_BORDER_WIDTH_RATIO_MIN = 0.65
const RASTER_FILL_PANEL_TEXT_BANNER_AREA_RATIO_MIN = 0.08
const RASTER_FILL_PANEL_TEXT_BANNER_ASPECT_RATIO_MIN = 3.2
const RASTER_FILL_PANEL_TEXT_BANNER_TOP_RATIO_MAX = 0.65
const RASTER_FILL_PANEL_TEXT_BANNER_WIDTH_RATIO_MIN = 0.75
const PAGE_SCALE_BORDER_TEXT_BANNER_AREA_RATIO_MIN = 0.18
const ACCEPTED_FILL_PANEL_AREA_RATIO_MIN = 0.01
const ACCEPTED_FILL_PANEL_AREA_RATIO_MAX = 0.1
const SMALL_MANUAL_STYLE_FILL_PANEL_AREA_MIN = 1800
const SMALL_MANUAL_STYLE_FILL_PANEL_AREA_RATIO_MIN = 0.002
const SMALL_MANUAL_STYLE_FILL_PANEL_BORDER_MIN = 0.3
const SMALL_MANUAL_STYLE_FILL_PANEL_STRONG_BORDER_MIN = 0.9
const TRANSPARENT_COMPACT_TOP_PANEL_AREA_MIN = 1800
const TRANSPARENT_COMPACT_TOP_PANEL_AREA_RATIO_MAX = 0.012
const TRANSPARENT_PANEL_AREA_MIN = 5000
const TRANSPARENT_PANEL_AREA_RATIO_MAX = 0.03
const TRANSPARENT_PANEL_BACKGROUND_MIN = 0.08
const TRANSPARENT_PANEL_BORDER_MIN = 0.9
const TRANSPARENT_PANEL_DARK_DENSITY_MAX = 0.4
const TRANSPARENT_PANEL_DARK_DENSITY_MIN = 0.08
const TRANSPARENT_PANEL_TOP_RATIO_MAX = 0.15
const TRANSPARENT_PANEL_WIDTH_MAX = 320
const TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_AREA_RATIO_MAX = 0.012
const TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_BORDER_MIN = 0.3
const TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_TOP_RATIO_MAX = 0.15
const TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_WIDTH_MIN = 40
const PAGE_LOCAL_STRONG_PANEL_AREA_MIN = 2500
const PAGE_LOCAL_STRONG_PANEL_BACKGROUND_MIN = 0.7
const PAGE_LOCAL_STRONG_PANEL_BORDER_MIN = 0.9
const PAGE_LOCAL_THIN_BORDER_PANEL_BACKGROUND_MAX = 0.8
const PAGE_LOCAL_THIN_BORDER_PANEL_BORDER_MIN = 0.2
const PAGE_LOCAL_LINE_RECTANGLE_DARK_DENSITY_MIN = 0.1
const PAGE_LOCAL_LINE_RECTANGLE_DARK_DENSITY_MAX = 0.16
const PAGE_LOCAL_STRONG_PANEL_WIDTH_MAX = 360
const PAGE_LOCAL_FILL_PANEL_AREA_MIN = 4500
const PAGE_LOCAL_FILL_PANEL_AREA_RATIO_MAX = 0.12
const PAGE_LOCAL_FILL_PANEL_AREA_RATIO_MIN = 0.008
const PAGE_LOCAL_FILL_PANEL_BACKGROUND_MIN = 0.7
const PAGE_LOCAL_FILL_PANEL_BORDER_MIN = 0.9
const PAGE_LOCAL_FILL_PANEL_WIDTH_MAX = 560
const PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_AREA_MIN = 3000
const PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_AREA_RATIO_MAX = 0.02
const PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_BACKGROUND_MIN = 0.7
const PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_BORDER_MIN = 0.9
const PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_TOP_RATIO_MAX = 0.18
const PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_WIDTH_MAX = 120
const TOP_MANUAL_STYLE_FILL_PANEL_AREA_RATIO_MAX = 0.04
const TOP_MANUAL_STYLE_FILL_PANEL_BACKGROUND_MIN = 0.6
const TOP_MANUAL_STYLE_FILL_PANEL_BORDER_MIN = 0.3
const TOP_MANUAL_STYLE_FILL_PANEL_TOP_RATIO_MAX = 0.15
const TOP_MANUAL_STYLE_FILL_PANEL_WIDTH_MAX = 320
const TOP_MANUAL_STYLE_FILL_PANEL_WIDTH_MIN = 120
const TOP_STRONG_BORDER_PANEL_AREA_RATIO_MAX = 0.04
const TOP_STRONG_BORDER_PANEL_BACKGROUND_MIN = 0.58
const TOP_STRONG_BORDER_PANEL_BORDER_MIN = 0.9
const TOP_STRONG_BORDER_PANEL_TOP_RATIO_MAX = 0.15
const TOP_STRONG_BORDER_PANEL_WIDTH_MAX = 320
const TOP_STRONG_BORDER_PANEL_WIDTH_MIN = 120
const PAGE_LOCAL_WEAK_TOP_PANEL_AREA_MIN = 12000
const PAGE_LOCAL_WEAK_TOP_PANEL_BACKGROUND_MIN = 0.09
const PAGE_LOCAL_WEAK_TOP_PANEL_BORDER_MIN = 0.34
const PAGE_LOCAL_WEAK_TOP_PANEL_TOP_RATIO_MAX = 0.15
const RASTER_GLYPH_FILL_PANEL_BORDER_MIN = 0.9
const RASTER_FILL_PANEL_BORDER_MIN = 0.12
const LINE_RECTANGLE_QUANTITY_BACKGROUND_MIN = 0.25
const LINE_RECTANGLE_QUANTITY_BACKGROUND_MAX = 0.6
const LINE_RECTANGLE_QUANTITY_BORDER_MIN = 0.9
const LINE_RECTANGLE_QUANTITY_DARK_DENSITY_MIN = 0.06
const LINE_RECTANGLE_QUANTITY_DARK_DENSITY_MAX = 0.18
const LINE_RECTANGLE_QUANTITY_WIDTH_MAX = 360
const RASTER_LOWER_ROW_QUANTITY_LABEL_REASON = "raster-lower-row-quantity-label"
const RASTER_LOWER_ROW_QUANTITY_GLYPHS_REASON = "raster-lower-row-quantity-glyphs"
const RASTER_QUANTITY_TEXT_FRAGMENT_REASON = "raster-quantity-label-rejected-as-text-fragment"
const SIGNAL_STRONG_MIN = 0.6
const VISUAL_DIAGNOSTIC_AREA_MIN = 2000

export function createStepCalloutResolutionDraft(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): StepCalloutResolutionDraft {
  const status = classifyStepCalloutCandidateEvidence(evidence, page)

  return {
    evidence,
    rejectionKind: status === "rejected" ? "false-positive-candidate" : null,
    status,
  }
}

function classifyStepCalloutCandidateEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): StepCalloutResolutionStatus {
  if (hasPageScaleTextBannerRejection(evidence, page)) {
    return "rejected"
  }

  if (hasPageScaleBorderTextBannerRejection(evidence, page)) {
    return "rejected"
  }

  if (hasAcceptedScore(evidence, page)) {
    return "accepted"
  }

  if (hasRasterTextBannerRejection(evidence, page)) {
    return "rejected"
  }

  if (hasDiagnosticEvidence(evidence, page)) {
    return "diagnostic"
  }

  return "rejected"
}

function hasPageScaleTextBannerRejection(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  return Boolean(
    page &&
      hasPageScaleTextBannerShape(evidence.candidate.region, page) &&
      !hasStrongRasterQuantityEvidence(evidence),
  )
}

function hasPageScaleBorderTextBannerRejection(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page || evidence.candidate.source !== "border") {
    return false
  }

  const region = evidence.candidate.region

  return (
    hasPageScaleTextBannerShape(region, page) &&
    stepCalloutRegionArea(region) / (page.width * page.height) >=
      PAGE_SCALE_BORDER_TEXT_BANNER_AREA_RATIO_MIN
  )
}

function hasAcceptedScore(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  return (
    hasTransparentPanelEvidence(evidence, page) ||
    hasPageLocalWeakTopPanelEvidence(evidence, page) ||
    hasPageLocalCompactTopFillPanelEvidence(evidence, page) ||
    hasTopManualStyleFillPanelEvidence(evidence, page) ||
    hasTopStrongBorderPanelEvidence(evidence, page) ||
    hasPageLocalThinBorderPanelEvidence(evidence, page) ||
    (hasAcceptedEvidence(evidence, page) && evidence.totalScore >= ACCEPTED_TOTAL_MIN)
  )
}

function hasRasterTextBannerRejection(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  return Boolean(page && hasRasterTextBannerEvidence(evidence, page))
}

function hasDiagnosticEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  return (
    hasDiagnosticVisualScore(evidence) ||
    Boolean(page && hasLargeOccludedVisualEvidence(evidence, page)) ||
    Boolean(page && hasLongBottomManualStyleBorderEvidence(evidence, page))
  )
}

function hasAcceptedEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  return (
    hasStrongBorderEvidence(evidence, page) ||
    hasStrongLineRectangleQuantityEvidence(evidence, page) ||
    hasRasterAnchoredFillPanelEvidence(evidence, page) ||
    hasPageLocalFillPanelEvidence(evidence, page) ||
    hasPageLocalCompactTopFillPanelEvidence(evidence, page) ||
    hasTopManualStyleFillPanelEvidence(evidence, page) ||
    hasTopStrongBorderPanelEvidence(evidence, page) ||
    hasPageLocalThinBorderPanelEvidence(evidence, page) ||
    hasPageLocalStrongPanelEvidence(evidence, page)
  )
}

function hasStrongBorderEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  return (
    hasAcceptedCandidateShape(evidence, page) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >= SIGNAL_STRONG_MIN &&
    hasAcceptedBackgroundEvidence(evidence) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasStrongRasterQuantityEvidence(evidence: StepCalloutCandidateEvidence): boolean {
  return (
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >= SIGNAL_STRONG_MIN &&
    hasAcceptedBackgroundEvidence(evidence) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasRasterAnchoredFillPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  return (
    evidence.candidate.source === "fill-panel" &&
    hasRasterAnchoredFillPanelShape(evidence, page) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >= RASTER_FILL_PANEL_BORDER_MIN &&
    hasAcceptedRasterFillPanelQuantityEvidence(evidence) &&
    hasAcceptedBackgroundEvidence(evidence) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasAcceptedRasterFillPanelQuantityEvidence(evidence: StepCalloutCandidateEvidence): boolean {
  return (
    !hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_GLYPHS_REASON) ||
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      RASTER_GLYPH_FILL_PANEL_BORDER_MIN
  )
}

function hasPageLocalStrongPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page) {
    return false
  }

  const region = evidence.candidate.region

  return (
    evidence.candidate.source !== "fill-panel" &&
    !hasPageScaleTextBannerShape(region, page) &&
    region.width <= PAGE_LOCAL_STRONG_PANEL_WIDTH_MAX &&
    stepCalloutRegionArea(region) >= PAGE_LOCAL_STRONG_PANEL_AREA_MIN &&
    hasStepCalloutPageLocalBackgroundEvidence(evidence.scores) &&
    hasPageLocalLineRectangleForegroundEvidence(evidence, page) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      PAGE_LOCAL_STRONG_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      PAGE_LOCAL_STRONG_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasPageLocalFillPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page || evidence.candidate.source !== "fill-panel") {
    return false
  }

  const region = evidence.candidate.region
  const area = stepCalloutRegionArea(region)
  const areaRatio = area / (page.width * page.height)

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    area >= PAGE_LOCAL_FILL_PANEL_AREA_MIN &&
    areaRatio >= PAGE_LOCAL_FILL_PANEL_AREA_RATIO_MIN &&
    areaRatio <= PAGE_LOCAL_FILL_PANEL_AREA_RATIO_MAX &&
    region.width <= PAGE_LOCAL_FILL_PANEL_WIDTH_MAX &&
    hasStepCalloutPageLocalBackgroundEvidence(evidence.scores) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      PAGE_LOCAL_FILL_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      PAGE_LOCAL_FILL_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasPageLocalCompactTopFillPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page || evidence.candidate.source !== "fill-panel") {
    return false
  }

  const region = evidence.candidate.region
  const area = stepCalloutRegionArea(region)
  const areaRatio = area / (page.width * page.height)

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    region.y / page.height <= PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_TOP_RATIO_MAX &&
    region.width <= PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_WIDTH_MAX &&
    area >= PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_AREA_MIN &&
    areaRatio <= PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_AREA_RATIO_MAX &&
    hasStepCalloutPageLocalBackgroundEvidence(evidence.scores) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      PAGE_LOCAL_COMPACT_TOP_FILL_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasTopManualStyleFillPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page || evidence.candidate.source !== "fill-panel") {
    return false
  }

  const region = evidence.candidate.region
  const areaRatio = stepCalloutRegionArea(region) / (page.width * page.height)

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    region.y / page.height <= TOP_MANUAL_STYLE_FILL_PANEL_TOP_RATIO_MAX &&
    region.width >= TOP_MANUAL_STYLE_FILL_PANEL_WIDTH_MIN &&
    region.width <= TOP_MANUAL_STYLE_FILL_PANEL_WIDTH_MAX &&
    areaRatio <= TOP_MANUAL_STYLE_FILL_PANEL_AREA_RATIO_MAX &&
    hasStepCalloutManualStyleBackgroundEvidence(evidence.scores) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      TOP_MANUAL_STYLE_FILL_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      TOP_MANUAL_STYLE_FILL_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasTopStrongBorderPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (
    !page ||
    (
      evidence.candidate.source !== "border" &&
      evidence.candidate.source !== "line-rectangle"
    )
  ) {
    return false
  }

  const region = evidence.candidate.region
  const areaRatio = stepCalloutRegionArea(region) / (page.width * page.height)

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    region.y / page.height <= TOP_STRONG_BORDER_PANEL_TOP_RATIO_MAX &&
    region.width >= TOP_STRONG_BORDER_PANEL_WIDTH_MIN &&
    region.width <= TOP_STRONG_BORDER_PANEL_WIDTH_MAX &&
    areaRatio <= TOP_STRONG_BORDER_PANEL_AREA_RATIO_MAX &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      TOP_STRONG_BORDER_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      TOP_STRONG_BORDER_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasStrongLineRectangleQuantityEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page || evidence.candidate.source !== "line-rectangle") {
    return false
  }

  const region = evidence.candidate.region

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    region.width <= LINE_RECTANGLE_QUANTITY_WIDTH_MAX &&
    hasLineRectangleQuantityForegroundEvidence(evidence, page) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      LINE_RECTANGLE_QUANTITY_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") <=
      LINE_RECTANGLE_QUANTITY_BACKGROUND_MAX &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      LINE_RECTANGLE_QUANTITY_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasLineRectangleQuantityForegroundEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  const density = readDarkPixelDensity(page, evidence.candidate.region)

  return (
    density >= LINE_RECTANGLE_QUANTITY_DARK_DENSITY_MIN &&
    density <= LINE_RECTANGLE_QUANTITY_DARK_DENSITY_MAX
  )
}

function hasPageLocalThinBorderPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page || evidence.candidate.source !== "border") {
    return false
  }

  const region = evidence.candidate.region
  const area = stepCalloutRegionArea(region)
  const areaRatio = area / (page.width * page.height)

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    area >= PAGE_LOCAL_FILL_PANEL_AREA_MIN &&
    areaRatio >= PAGE_LOCAL_FILL_PANEL_AREA_RATIO_MIN &&
    areaRatio <= PAGE_LOCAL_FILL_PANEL_AREA_RATIO_MAX &&
    region.width <= PAGE_LOCAL_FILL_PANEL_WIDTH_MAX &&
    hasStepCalloutPageLocalBackgroundEvidence(evidence.scores) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      PAGE_LOCAL_FILL_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") <=
      PAGE_LOCAL_THIN_BORDER_PANEL_BACKGROUND_MAX &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      PAGE_LOCAL_THIN_BORDER_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasPageLocalLineRectangleForegroundEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  if (evidence.candidate.source !== "line-rectangle") {
    return true
  }

  const density = readDarkPixelDensity(page, evidence.candidate.region)

  return (
    density >= PAGE_LOCAL_LINE_RECTANGLE_DARK_DENSITY_MIN &&
    density <= PAGE_LOCAL_LINE_RECTANGLE_DARK_DENSITY_MAX
  )
}

function readDarkPixelDensity(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): number {
  let dark = 0

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (isStepCalloutDarkPixel(page, y * page.width + x)) {
        dark += 1
      }
    }
  }

  return dark / stepCalloutRegionArea(region)
}

function hasPageLocalWeakTopPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page || evidence.candidate.source !== "fill-panel") {
    return false
  }

  const region = evidence.candidate.region

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    region.y / page.height <= PAGE_LOCAL_WEAK_TOP_PANEL_TOP_RATIO_MAX &&
    region.width <= PAGE_LOCAL_STRONG_PANEL_WIDTH_MAX &&
    stepCalloutRegionArea(region) >= PAGE_LOCAL_WEAK_TOP_PANEL_AREA_MIN &&
    hasTransparentPanelForegroundEvidence(evidence, page) &&
    hasStepCalloutPageLocalBackgroundEvidence(evidence.scores) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      PAGE_LOCAL_WEAK_TOP_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      PAGE_LOCAL_WEAK_TOP_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasTransparentPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (
    !page ||
    (
      evidence.candidate.source !== "border" &&
      evidence.candidate.source !== "fill-panel"
    )
  ) {
    return false
  }

  const region = evidence.candidate.region

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    hasTransparentPanelShape(region, page) &&
    hasTransparentPanelForegroundEvidence(evidence, page) &&
    hasStepCalloutPageLocalBackgroundEvidence(evidence.scores) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >=
      TRANSPARENT_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      TRANSPARENT_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasTransparentPanelShape(
  region: StepCalloutRegion,
  page: StepCalloutPageInput,
): boolean {
  return (
    hasTransparentRegularPanelShape(region, page) ||
    hasTransparentCompactTopPanelShape(region, page)
  )
}

function hasTransparentRegularPanelShape(
  region: StepCalloutRegion,
  page: StepCalloutPageInput,
): boolean {
  const area = stepCalloutRegionArea(region)

  return (
    region.width <= TRANSPARENT_PANEL_WIDTH_MAX &&
    area >= TRANSPARENT_PANEL_AREA_MIN &&
    area / (page.width * page.height) <= TRANSPARENT_PANEL_AREA_RATIO_MAX
  )
}

function hasTransparentCompactTopPanelShape(
  region: StepCalloutRegion,
  page: StepCalloutPageInput,
): boolean {
  const area = stepCalloutRegionArea(region)

  return (
    region.y / page.height <= TRANSPARENT_PANEL_TOP_RATIO_MAX &&
    region.width >= TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_WIDTH_MIN &&
    area >= TRANSPARENT_COMPACT_TOP_PANEL_AREA_MIN &&
    area / (page.width * page.height) <= TRANSPARENT_COMPACT_TOP_PANEL_AREA_RATIO_MAX
  )
}

function hasTransparentPanelForegroundEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  const density = readDarkPixelDensity(page, evidence.candidate.region)

  return (
    density >= TRANSPARENT_PANEL_DARK_DENSITY_MIN &&
    density <= TRANSPARENT_PANEL_DARK_DENSITY_MAX
  )
}

function hasAcceptedBackgroundEvidence(evidence: StepCalloutCandidateEvidence): boolean {
  return (
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >= SIGNAL_STRONG_MIN &&
    (
      !hasStepCalloutPageLocalBackgroundEvidence(evidence.scores) ||
      hasStepCalloutManualStyleBackgroundEvidence(evidence.scores)
    )
  )
}

function hasRasterAnchoredFillPanelShape(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (!page) {
    return true
  }

  const region = evidence.candidate.region

  return (
    !hasPageScaleTextBannerShape(region, page) &&
    (
      hasAcceptedFillPanelArea(region, page) && hasRasterAnchoredFillPanelArea(region, page) ||
      hasSmallManualStyleFillPanelEvidence(evidence, page)
    )
  )
}

function hasAcceptedCandidateShape(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput | undefined,
): boolean {
  if (evidence.candidate.source !== "fill-panel" || !page) {
    return true
  }

  return (
    hasAcceptedFillPanelArea(evidence.candidate.region, page) ||
    hasSmallManualStyleFillPanelEvidence(evidence, page)
  )
}

function hasAcceptedFillPanelArea(
  region: StepCalloutRegion,
  page: StepCalloutPageInput,
): boolean {
  return stepCalloutRegionArea(region) / (page.width * page.height) >= ACCEPTED_FILL_PANEL_AREA_RATIO_MIN
}

function hasRasterAnchoredFillPanelArea(
  region: StepCalloutRegion,
  page: StepCalloutPageInput,
): boolean {
  return stepCalloutRegionArea(region) / (page.width * page.height) <= ACCEPTED_FILL_PANEL_AREA_RATIO_MAX
}

function hasSmallManualStyleFillPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  const region = evidence.candidate.region
  const area = stepCalloutRegionArea(region)

  return (
    area >= SMALL_MANUAL_STYLE_FILL_PANEL_AREA_MIN &&
    area / (page.width * page.height) >= SMALL_MANUAL_STYLE_FILL_PANEL_AREA_RATIO_MIN &&
    area / (page.width * page.height) <= ACCEPTED_FILL_PANEL_AREA_RATIO_MAX &&
    hasStepCalloutManualStyleBackgroundEvidence(evidence.scores) &&
    hasAcceptedRasterFillPanelQuantityEvidence(evidence) &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    hasSmallManualStyleFillPanelBorderEvidence(evidence, page) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") >= SIGNAL_STRONG_MIN
  )
}

function hasSmallManualStyleFillPanelBorderEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  return (
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      SMALL_MANUAL_STYLE_FILL_PANEL_STRONG_BORDER_MIN ||
    hasCompactManualStyleFillPanelEvidence(evidence, page)
  )
}

function hasCompactManualStyleFillPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  const region = evidence.candidate.region
  const areaRatio = stepCalloutRegionArea(region) / (page.width * page.height)

  return (
    region.width >= TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_WIDTH_MIN &&
    areaRatio <= TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_AREA_RATIO_MAX &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      SMALL_MANUAL_STYLE_FILL_PANEL_BORDER_MIN
  )
}

function hasTopCompactManualStyleFillPanelEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  const region = evidence.candidate.region
  const areaRatio = stepCalloutRegionArea(region) / (page.width * page.height)

  return (
    region.y / page.height <= TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_TOP_RATIO_MAX &&
    region.width >= TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_WIDTH_MIN &&
    areaRatio <= TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_AREA_RATIO_MAX &&
    hasQuantityEvidenceReason(evidence, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >=
      TOP_COMPACT_MANUAL_STYLE_FILL_PANEL_BORDER_MIN
  )
}

function hasRasterTextBannerEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  const region = evidence.candidate.region

  return (
    hasPageScaleTextBannerShape(region, page) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "quantity") === 0 &&
    hasQuantityEvidenceReason(evidence, RASTER_QUANTITY_TEXT_FRAGMENT_REASON)
  )
}

function hasPageScaleTextBannerShape(
  region: StepCalloutRegion,
  page: StepCalloutPageInput,
): boolean {
  const areaRatio = stepCalloutRegionArea(region) / (page.width * page.height)
  const aspectRatio = region.width / region.height
  const topRatio = region.y / page.height
  const widthRatio = region.width / page.width

  return (
    areaRatio >= RASTER_FILL_PANEL_TEXT_BANNER_AREA_RATIO_MIN &&
    aspectRatio >= RASTER_FILL_PANEL_TEXT_BANNER_ASPECT_RATIO_MIN &&
    topRatio <= RASTER_FILL_PANEL_TEXT_BANNER_TOP_RATIO_MAX &&
    widthRatio >= RASTER_FILL_PANEL_TEXT_BANNER_WIDTH_RATIO_MIN
  )
}

function hasQuantityEvidenceReason(
  evidence: StepCalloutCandidateEvidence,
  reason: string,
): boolean {
  return evidence.scores.some((score) =>
    score.signal === "quantity" &&
    score.reasons.includes(reason),
  )
}

function hasDiagnosticVisualScore(evidence: StepCalloutCandidateEvidence): boolean {
  return (
    stepCalloutRegionArea(evidence.candidate.region) >= VISUAL_DIAGNOSTIC_AREA_MIN &&
    evidence.totalScore >= DIAGNOSTIC_TOTAL_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >= DIAGNOSTIC_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >= DIAGNOSTIC_BACKGROUND_MIN
  )
}

function hasLargeOccludedVisualEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  return (
    evidence.candidate.source === "fill-panel" &&
    hasLargeTopPanelShape(evidence.candidate.region, page) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >= LARGE_OCCLUDED_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >= LARGE_OCCLUDED_BACKGROUND_MIN
  )
}

function hasLargeTopPanelShape(
  region: StepCalloutRegion,
  page: StepCalloutPageInput,
): boolean {
  const areaRatio = stepCalloutRegionArea(region) / (page.width * page.height)

  return (
    areaRatio >= LARGE_OCCLUDED_AREA_RATIO_MIN &&
    areaRatio <= LARGE_OCCLUDED_AREA_RATIO_MAX &&
    region.y / page.height <= LARGE_OCCLUDED_TOP_RATIO_MAX &&
    region.width / page.width >= LARGE_OCCLUDED_WIDTH_RATIO_MIN
  )
}

function hasLongBottomManualStyleBorderEvidence(
  evidence: StepCalloutCandidateEvidence,
  page: StepCalloutPageInput,
): boolean {
  return (
    evidence.candidate.source === "border" &&
    hasLongBottomBorderShape(evidence.candidate.region, page) &&
    hasStepCalloutManualStyleBackgroundEvidence(evidence.scores) &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "background") >= LONG_BOTTOM_BORDER_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(evidence.scores, "border") >= LONG_BOTTOM_BORDER_BORDER_MIN
  )
}

function hasLongBottomBorderShape(
  region: StepCalloutRegion,
  page: StepCalloutPageInput,
): boolean {
  const areaRatio = stepCalloutRegionArea(region) / (page.width * page.height)
  const heightRatio = region.height / page.height

  return (
    areaRatio >= LONG_BOTTOM_BORDER_AREA_RATIO_MIN &&
    areaRatio <= LONG_BOTTOM_BORDER_AREA_RATIO_MAX &&
    heightRatio >= LONG_BOTTOM_BORDER_HEIGHT_RATIO_MIN &&
    heightRatio <= LONG_BOTTOM_BORDER_HEIGHT_RATIO_MAX &&
    region.y / page.height >= LONG_BOTTOM_BORDER_Y_RATIO_MIN &&
    region.width / page.width >= LONG_BOTTOM_BORDER_WIDTH_RATIO_MIN &&
    region.width / region.height >= LONG_BOTTOM_BORDER_ASPECT_RATIO_MIN
  )
}
