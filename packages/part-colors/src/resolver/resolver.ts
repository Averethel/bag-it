import {
  colorDistanceCiede2000,
  rgbToHex,
} from "../color-space"
import type {
  DetectedFallbackColor,
  DetectedPartColor,
  PartColorNameSource,
  PartColorCalibrationInput,
  PartColorCalibrationResult,
  RgbColor,
} from "../contracts"
import { detectFallbackLegoColor } from "../palette"
import { readBlackEdgeEvidence, type BlackEdgeEvidence } from "./black-edge-evidence"
import { readBrightGreenEvidence, type BrightGreenEvidence } from "./bright-green-evidence"
import { readDarkGreenBodyEvidence, type DarkGreenBodyEvidence } from "./dark-green-body-evidence"
import {
  readDarkNeutralBodyEvidence,
  type DarkNeutralBodyEvidence,
} from "./dark-neutral-body-evidence"
import {
  readDarkNeutralEdgeEvidence,
  type DarkNeutralEdgeEvidence,
} from "./dark-neutral-edge-evidence"
import { readDarkTanBodyEvidence, type DarkTanBodyEvidence } from "./dark-tan-body-evidence"
import { extractPartColorFeatures } from "./feature-extraction"
import { hasFlatSilverEvidence } from "./flat-silver-evidence"
import { readGreenBodyEvidence, type GreenBodyEvidence } from "./green-body-evidence"
import { readLightNeutralEdgeEvidence, type LightNeutralEdgeEvidence } from "./light-neutral-edge-evidence"
import {
  readMediumNougatEdgeEvidence,
  type MediumNougatEdgeEvidence,
} from "./medium-nougat-edge-evidence"
import {
  readPearlDarkGrayMetalEvidence,
  type PearlDarkGrayMetalEvidence,
} from "./pearl-dark-gray-metal-evidence"
import { readPearlGoldBodyEvidence, type PearlGoldBodyEvidence } from "./pearl-gold-body-evidence"
import {
  clamp,
  createPaletteOverrideDetectedColor,
  findPaletteColorByName,
  normalizeName,
  paletteSourceId,
  roundScore,
  uniqueNames,
} from "./palette-match-color"
import { resolveByAggregatePrototype, type PrototypeResolution } from "./prototype-resolution"
import { readRedBodyEvidence, type RedBodyEvidence } from "./red-body-evidence"
import { RUNTIME_COLOR_PROTOTYPES } from "./trained-prototypes"
import { readTanBodyEvidence, type TanBodyEvidence } from "./tan-body-evidence"
import {
  readTransparentBrownEvidence,
  type TransparentBrownEvidence,
} from "./transparent-brown-evidence"
import {
  readTransparentDarkBlueEvidence,
  type TransparentDarkBlueEvidence,
} from "./transparent-dark-blue-evidence"
import {
  readTransparentPrimaryEvidence,
  type TransparentPrimaryEvidence,
} from "./transparent-primary-evidence"
import {
  readTransparentGreenEvidence,
  type TransparentGreenEvidence,
} from "./transparent-green-evidence"
import {
  readTransparentLightBlueEvidence,
  type TransparentLightBlueEvidence,
} from "./transparent-light-blue-evidence"
import {
  readTransparentOrangeEvidence,
  type TransparentOrangeEvidence,
} from "./transparent-orange-evidence"
import {
  readTransparentYellowEvidence,
  type TransparentYellowEvidence,
} from "./transparent-yellow-evidence"
import { readWhiteBackgroundEvidence, type WhiteBackgroundEvidence } from "./white-background-evidence"
import { readYellowBodyEvidence, type YellowBodyEvidence } from "./yellow-body-evidence"
import type {
  ColorPrototype,
  PartColorFeature,
  PrototypeSet,
  ResolverClassAssignment,
  ResolverManualClass,
} from "./types"

const CLASS_DISTANCE_LIMIT = 4

interface MutableManualClass {
  assignments: PartColorFeature[]
  family: string
  id: string
  palette: DetectedFallbackColor
  rgb: RgbColor
}

interface AdvisoryColorResolution {
  color: DetectedFallbackColor
  confidence: number
  nameSource: PartColorNameSource
  ruleFields?: AdvisoryRuleFields
}

interface SpecialEvidenceOptions {
  includeGreenBodyEvidence?: boolean
}

type AdvisoryRuleFields = Pick<
  DetectedPartColor,
  | "ruleCanonicalClassId"
  | "ruleCandidateNames"
  | "ruleCandidateScores"
  | "ruleId"
  | "ruleResolverKind"
  | "ruleScoreMargin"
  | "ruleScoreTop"
  | "ruleSourceRawClassId"
>

export interface PartColorCalibrationOptions {
  prototypes?: PrototypeSet
}

export function detectPartColorClasses(
  rows: readonly PartColorCalibrationInput[],
): PartColorCalibrationResult {
  return calibrateManualPartColors(rows)
}

export function calibrateManualPartColors(
  rows: readonly PartColorCalibrationInput[],
  options: PartColorCalibrationOptions = {},
): PartColorCalibrationResult {
  const { features, skippedPartIds } = extractPartColorFeatures(rows)
  const mutableClasses = createManualClasses(features)
  const prototypes = options.prototypes?.prototypes ?? RUNTIME_COLOR_PROTOTYPES.prototypes
  const assignments = createClassAssignments(mutableClasses, prototypes)
  const classes = mutableClasses.map(createPublicManualClass)

  return {
    classes,
    colorsByPartId: new Map(assignments.map((assignment) => [assignment.feature.id, assignment.color])),
    rawClasses: classes,
    skippedPartIds,
  }
}

function createManualClasses(features: readonly PartColorFeature[]): MutableManualClass[] {
  const classes: MutableManualClass[] = []

  for (const feature of features) {
    const existingClass = findNearestClass(classes, feature)

    if (existingClass) {
      existingClass.assignments.push(feature)
      existingClass.rgb = averageClassRgb(existingClass.assignments)
      existingClass.palette = detectFallbackLegoColor(existingClass.rgb)
      continue
    }

    classes.push({
      assignments: [feature],
      family: feature.family,
      id: createManualClassId(classes.length),
      palette: detectFallbackLegoColor(feature.rgb),
      rgb: feature.rgb,
    })
  }

  return classes
}

function findNearestClass(
  classes: readonly MutableManualClass[],
  feature: PartColorFeature,
): MutableManualClass | null {
  const ranked = classes
    .filter((manualClass) => manualClass.family === feature.family)
    .map((manualClass) => ({
      distance: colorDistanceCiede2000(feature.rgb, manualClass.rgb),
      manualClass,
    }))
    .sort((left, right) => left.distance - right.distance)
  const nearest = ranked[0]

  return nearest && nearest.distance <= CLASS_DISTANCE_LIMIT ? nearest.manualClass : null
}

function createClassAssignments(
  classes: readonly MutableManualClass[],
  prototypes: readonly ColorPrototype[],
): ResolverClassAssignment[] {
  const assignments: ResolverClassAssignment[] = []

  for (const manualClass of classes) {
    const publicClass = createPublicManualClass(manualClass)

    for (const feature of manualClass.assignments) {
      assignments.push({
        color: createDetectedColor(feature, publicClass, prototypes),
        feature,
        manualClass: publicClass,
      })
    }
  }

  return assignments
}

function createPublicManualClass(manualClass: MutableManualClass): ResolverManualClass {
  const confidence = averageConfidence(manualClass.assignments)
  const palette = manualClass.palette

  return {
    confidence,
    distance: palette.distance,
    family: palette.family,
    hex: rgbToHex(manualClass.rgb),
    id: manualClass.id,
    name: palette.name,
    nameSource: "family-only",
    nearestPaletteNames: [palette.name, ...palette.alternatives],
    pixelCount: sumPixels(manualClass.assignments),
    quantityCount: manualClass.assignments.length,
    rgb: manualClass.rgb,
    rowCount: manualClass.assignments.length,
    status: "review",
    swatchHex: rgbToHex(manualClass.rgb),
    trusted: false,
  }
}

function createDetectedColor(
  feature: PartColorFeature,
  manualClass: ResolverManualClass,
  prototypes: readonly ColorPrototype[],
): DetectedPartColor {
  const resolution = resolveAdvisoryColor(feature, prototypes)
  const color = resolution.color

  return {
    ...color,
    confidence: resolution.confidence,
    distance: color.distance,
    manualClassConfidence: manualClass.confidence,
    manualClassHex: manualClass.hex,
    manualClassId: manualClass.id,
    manualClassMergeReason: "raw",
    manualClassRgb: manualClass.rgb,
    manualClassSourceIds: [manualClass.id],
    manualClassTrusted: false,
    nameSource: resolution.nameSource,
    observedHex: feature.hex,
    observedRgb: feature.rgb,
    rawManualClassConfidence: manualClass.confidence,
    rawManualClassHex: manualClass.hex,
    rawManualClassId: manualClass.id,
    rawManualClassRgb: manualClass.rgb,
    sampleBaseChips: feature.sample.baseChips,
    sampleBaseDominantCoverage: feature.sample.baseDominantCoverage,
    sampleBaseEdgeChips: feature.sample.baseEdgeChips,
    sampleBasePixelCount: feature.sample.basePixelCount,
    sampleBaseRejectedPixelCount: feature.sample.baseRejectedPixelCount,
    sampleBaseRejectionCounts: feature.sample.baseRejectionCounts,
    sampleBaseStatus: feature.sample.baseStatus,
    sampleBaseVariance: feature.sample.baseVariance,
    sampleChips: feature.sample.chips,
    sampleEdgeChips: feature.sample.edgeChips,
    sampleRejectionCounts: feature.sample.rejectionCounts,
    sampleResampleReason: feature.sample.resampleReason,
    sampleScale: feature.sample.sampleScale,
    sampleStatus: feature.sample.status,
    status: "review",
    swatchHex: manualClass.swatchHex,
    ...resolution.ruleFields,
  }
}

function resolveAdvisoryColor(
  feature: PartColorFeature,
  prototypes: readonly ColorPrototype[],
): AdvisoryColorResolution {
  const fallback = detectFallbackLegoColor(feature.rgb)
  const prototypeResolution = resolveByAggregatePrototype(feature, prototypes)

  if (prototypeResolution) {
    const baseColor = createPrototypeDetectedFallbackColor(feature, prototypeResolution)
    const specialResolution = resolveSpecialEvidenceColor(feature, baseColor)

    return specialResolution ?? {
      color: baseColor,
      confidence: readPrototypeConfidence(prototypeResolution, feature.quality.confidence),
      nameSource: "prototype-match",
      ruleFields: createPrototypeRuleFields(prototypeResolution),
    }
  }

  return resolveSpecialEvidenceColor(feature, fallback, { includeGreenBodyEvidence: true }) ?? {
    color: fallback,
    confidence: Math.min(fallback.confidence, feature.quality.confidence),
    nameSource: "family-only",
  }
}

function resolveSpecialEvidenceColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  options: SpecialEvidenceOptions = {},
): AdvisoryColorResolution | null {
  return resolveNeutralAndMetalEvidenceColor(feature, currentColor) ??
    resolveWarmAndYellowEvidenceColor(feature, currentColor) ??
    resolveGreenEvidenceColor(feature, currentColor, options) ??
    resolveTransparentEvidenceColor(feature, currentColor) ??
    resolveRedEvidenceColor(feature, currentColor) ??
    resolveWhiteBackgroundEvidenceColor(feature, currentColor)
}

function resolveNeutralAndMetalEvidenceColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
): AdvisoryColorResolution | null {
  if (hasFlatSilverEvidence(feature, currentColor.name)) {
    return createPaletteMatchedResolution(
      createFlatSilverDetectedFallbackColor(feature, currentColor),
      createFlatSilverRuleFields(feature, currentColor),
    )
  }

  const lightNeutralEdgeEvidence = readLightNeutralEdgeEvidence(feature, currentColor.name)

  if (lightNeutralEdgeEvidence) {
    return createPaletteMatchedResolution(
      createLightNeutralEdgeDetectedFallbackColor(feature, currentColor, lightNeutralEdgeEvidence),
      createLightNeutralEdgeRuleFields(lightNeutralEdgeEvidence, currentColor),
    )
  }

  const blackEdgeEvidence = readBlackEdgeEvidence(feature, currentColor.name)

  if (blackEdgeEvidence) {
    return createPaletteMatchedResolution(
      createBlackEdgeDetectedFallbackColor(feature, currentColor, blackEdgeEvidence),
      createBlackEdgeRuleFields(blackEdgeEvidence, currentColor),
    )
  }

  const darkNeutralEdgeEvidence = readDarkNeutralEdgeEvidence(feature, currentColor.name)

  if (darkNeutralEdgeEvidence) {
    return createPaletteMatchedResolution(
      createDarkNeutralEdgeDetectedFallbackColor(feature, currentColor, darkNeutralEdgeEvidence),
      createDarkNeutralEdgeRuleFields(darkNeutralEdgeEvidence, currentColor),
    )
  }

  const pearlDarkGrayMetalEvidence = readPearlDarkGrayMetalEvidence(feature, currentColor.name)

  if (pearlDarkGrayMetalEvidence) {
    return createPaletteMatchedResolution(
      createPearlDarkGrayMetalDetectedFallbackColor(feature, currentColor, pearlDarkGrayMetalEvidence),
      createPearlDarkGrayMetalRuleFields(pearlDarkGrayMetalEvidence, currentColor),
    )
  }

  const darkNeutralBodyEvidence = readDarkNeutralBodyEvidence(feature, currentColor.name)

  if (darkNeutralBodyEvidence) {
    return createPaletteMatchedResolution(
      createDarkNeutralBodyDetectedFallbackColor(feature, currentColor, darkNeutralBodyEvidence),
      createDarkNeutralBodyRuleFields(darkNeutralBodyEvidence, currentColor),
    )
  }

  return null
}

function resolveWarmAndYellowEvidenceColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
): AdvisoryColorResolution | null {
  const darkTanPaletteRgb = findPaletteColorByName("Dark Tan")?.rgb ?? null
  const darkTanBodyEvidence = readDarkTanBodyEvidence(feature, currentColor.name, darkTanPaletteRgb)

  if (darkTanBodyEvidence) {
    return createPaletteMatchedResolution(
      createDarkTanBodyDetectedFallbackColor(feature, currentColor, darkTanBodyEvidence),
      createDarkTanBodyRuleFields(darkTanBodyEvidence, currentColor),
    )
  }

  const tanBodyEvidence = readTanBodyEvidence(feature, currentColor.name)

  if (tanBodyEvidence) {
    return createPaletteMatchedResolution(
      createTanBodyDetectedFallbackColor(feature, currentColor, tanBodyEvidence),
      createTanBodyRuleFields(tanBodyEvidence, currentColor),
    )
  }

  const pearlGoldBodyEvidence = readPearlGoldBodyEvidence(feature, currentColor.name)

  if (pearlGoldBodyEvidence) {
    return createPaletteMatchedResolution(
      createPearlGoldBodyDetectedFallbackColor(feature, currentColor, pearlGoldBodyEvidence),
      createPearlGoldBodyRuleFields(pearlGoldBodyEvidence, currentColor),
    )
  }

  const mediumNougatEdgeEvidence = readMediumNougatEdgeEvidence(feature, currentColor.name)

  if (mediumNougatEdgeEvidence) {
    return createPaletteMatchedResolution(
      createMediumNougatEdgeDetectedFallbackColor(feature, currentColor, mediumNougatEdgeEvidence),
      createMediumNougatEdgeRuleFields(mediumNougatEdgeEvidence, currentColor),
    )
  }

  const yellowBodyEvidence = readYellowBodyEvidence(feature, currentColor.name)

  if (yellowBodyEvidence) {
    return createPaletteMatchedResolution(
      createYellowBodyDetectedFallbackColor(feature, currentColor, yellowBodyEvidence),
      createYellowBodyRuleFields(yellowBodyEvidence, currentColor),
    )
  }

  return null
}

function resolveRedEvidenceColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
): AdvisoryColorResolution | null {
  const redBodyEvidence = readRedBodyEvidence(feature, currentColor.name)

  if (!redBodyEvidence) {
    return null
  }

  return createPaletteMatchedResolution(
    createRedBodyDetectedFallbackColor(feature, currentColor, redBodyEvidence),
    createRedBodyRuleFields(redBodyEvidence, currentColor),
  )
}

function resolveGreenEvidenceColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  options: SpecialEvidenceOptions,
): AdvisoryColorResolution | null {
  const darkGreenPaletteRgb = findPaletteColorByName("Dark Green")?.rgb ?? null
  const darkGreenBodyEvidence = readDarkGreenBodyEvidence(feature, currentColor.name, darkGreenPaletteRgb)

  if (darkGreenBodyEvidence) {
    return createPaletteMatchedResolution(
      createDarkGreenBodyDetectedFallbackColor(feature, currentColor, darkGreenBodyEvidence),
      createDarkGreenBodyRuleFields(darkGreenBodyEvidence, currentColor),
    )
  }

  const brightGreenEvidence = readBrightGreenEvidence(feature, currentColor.name)

  if (brightGreenEvidence) {
    return createPaletteMatchedResolution(
      createBrightGreenDetectedFallbackColor(feature, currentColor, brightGreenEvidence),
      createBrightGreenRuleFields(brightGreenEvidence, currentColor),
    )
  }

  if (!options.includeGreenBodyEvidence) {
    return null
  }

  const greenPaletteRgb = findPaletteColorByName("Green")?.rgb ?? null
  const greenBodyEvidence = readGreenBodyEvidence(feature, currentColor.name, greenPaletteRgb)

  if (!greenBodyEvidence) {
    return null
  }

  return createPaletteMatchedResolution(
    createGreenBodyDetectedFallbackColor(feature, currentColor, greenBodyEvidence),
    createGreenBodyRuleFields(greenBodyEvidence, currentColor),
  )
}

function resolveTransparentEvidenceColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
): AdvisoryColorResolution | null {
  const transparentLightBlueEvidence = readTransparentLightBlueEvidence(feature, currentColor.name)

  if (transparentLightBlueEvidence) {
    return createPaletteMatchedResolution(
      createTransparentLightBlueDetectedFallbackColor(feature, currentColor, transparentLightBlueEvidence),
      createTransparentLightBlueRuleFields(transparentLightBlueEvidence, currentColor),
    )
  }

  const transparentDarkBlueEvidence = readTransparentDarkBlueEvidence(feature, currentColor.name)

  if (transparentDarkBlueEvidence) {
    return createPaletteMatchedResolution(
      createTransparentDarkBlueDetectedFallbackColor(feature, currentColor, transparentDarkBlueEvidence),
      createTransparentDarkBlueRuleFields(transparentDarkBlueEvidence, currentColor),
    )
  }

  const transparentBrownEvidence = readTransparentBrownEvidence(feature, currentColor.name)

  if (transparentBrownEvidence) {
    return createPaletteMatchedResolution(
      createTransparentBrownDetectedFallbackColor(feature, currentColor, transparentBrownEvidence),
      createTransparentBrownRuleFields(transparentBrownEvidence, currentColor),
    )
  }

  const transparentPrimaryEvidence = readTransparentPrimaryEvidence(feature, currentColor.name)

  if (transparentPrimaryEvidence) {
    return createPaletteMatchedResolution(
      createTransparentPrimaryDetectedFallbackColor(feature, currentColor, transparentPrimaryEvidence),
      createTransparentPrimaryRuleFields(transparentPrimaryEvidence, currentColor),
    )
  }

  const transparentGreenEvidence = readTransparentGreenEvidence(feature, currentColor.name)

  if (transparentGreenEvidence) {
    return createPaletteMatchedResolution(
      createTransparentGreenDetectedFallbackColor(feature, currentColor, transparentGreenEvidence),
      createTransparentGreenRuleFields(transparentGreenEvidence, currentColor),
    )
  }

  const transparentOrangeEvidence = readTransparentOrangeEvidence(feature, currentColor.name)

  if (transparentOrangeEvidence) {
    return createPaletteMatchedResolution(
      createTransparentOrangeDetectedFallbackColor(feature, currentColor, transparentOrangeEvidence),
      createTransparentOrangeRuleFields(transparentOrangeEvidence, currentColor),
    )
  }

  const transparentYellowEvidence = readTransparentYellowEvidence(feature, currentColor.name)

  if (!transparentYellowEvidence) {
    return null
  }

  return createPaletteMatchedResolution(
    createTransparentYellowDetectedFallbackColor(feature, currentColor, transparentYellowEvidence),
    createTransparentYellowRuleFields(transparentYellowEvidence, currentColor),
  )
}

function resolveWhiteBackgroundEvidenceColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
): AdvisoryColorResolution | null {
  const whiteBackgroundEvidence = readWhiteBackgroundEvidence(feature, currentColor.name)

  if (!whiteBackgroundEvidence) {
    return null
  }

  return createPaletteMatchedResolution(
    createWhiteBackgroundDetectedFallbackColor(feature, currentColor, whiteBackgroundEvidence),
    createWhiteBackgroundRuleFields(whiteBackgroundEvidence, currentColor),
  )
}

function createPaletteMatchedResolution(
  color: DetectedFallbackColor,
  ruleFields: AdvisoryRuleFields,
): AdvisoryColorResolution {
  return {
    color,
    confidence: color.confidence,
    nameSource: "palette-match",
    ruleFields,
  }
}

function createPrototypeDetectedFallbackColor(
  feature: PartColorFeature,
  resolution: PrototypeResolution,
): DetectedFallbackColor {
  const paletteColor = findPaletteColorByName(resolution.name)
  const prototype = resolution.prototype

  return {
    alternatives: readPrototypeAlternatives(resolution),
    confidence: readPrototypeConfidence(resolution, feature.quality.confidence),
    distance: resolution.distance,
    family: paletteColor?.family ?? prototype.family,
    hex: paletteColor?.hex ?? rgbToHex(prototype.rgb),
    name: resolution.name,
    observedHex: feature.hex,
    observedRgb: feature.rgb,
    rarityTier: paletteColor?.rarityTier ?? "uncommon",
    rgb: paletteColor?.rgb ?? prototype.rgb,
    status: "review",
    swatchHex: rgbToHex(prototype.rgb),
  }
}

function createFlatSilverDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
): DetectedFallbackColor {
  const flatSilver = findPaletteColorByName("Flat Silver")
  const distance = flatSilver
    ? colorDistanceCiede2000(feature.rgb, flatSilver.rgb)
    : currentColor.distance

  return createPaletteOverrideDetectedColor({
    confidence: 1 - distance / 18,
    currentColor,
    distance,
    feature,
    targetName: "Flat Silver",
  })
}

function createLightNeutralEdgeDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: LightNeutralEdgeEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.lightNeutralEdgeCoverage,
    currentColor,
    feature,
    targetName: "Light Bluish Gray",
  })
}

function createDarkTanBodyDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: DarkTanBodyEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.bodyCoverage,
    currentColor,
    distance: evidence.coreDistance,
    feature,
    targetName: "Dark Tan",
  })
}

function createTanBodyDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: TanBodyEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.tanCoverage,
    currentColor,
    feature,
    targetName: "Tan",
  })
}

function createPearlGoldBodyDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: PearlGoldBodyEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.goldCoverage,
    currentColor,
    distance: currentColor.distance,
    feature,
    targetName: "Pearl Gold",
  })
}

function createMediumNougatEdgeDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: MediumNougatEdgeEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.edgeRatio,
    currentColor,
    feature,
    targetName: "Medium Nougat",
  })
}

function createBlackEdgeDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: BlackEdgeEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.darkEdgeCoverage,
    currentColor,
    feature,
    targetName: "Black",
  })
}

function createDarkNeutralBodyDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: DarkNeutralBodyEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.darkNeutralCoverage,
    currentColor,
    feature,
    targetName: "Dark Bluish Gray",
  })
}

function createDarkNeutralEdgeDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: DarkNeutralEdgeEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.midNeutralCoverage,
    currentColor,
    feature,
    targetName: "Dark Bluish Gray",
  })
}

function createPearlDarkGrayMetalDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: PearlDarkGrayMetalEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.metalDarkCoverage,
    currentColor,
    feature,
    targetName: "Pearl Dark Gray",
  })
}

function createGreenBodyDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: GreenBodyEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.greenCoverage,
    currentColor,
    distance: evidence.distance,
    feature,
    targetName: "Green",
  })
}

function createDarkGreenBodyDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: DarkGreenBodyEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.darkGreenCoverage,
    currentColor,
    distance: evidence.distance,
    feature,
    targetName: "Dark Green",
  })
}

function createBrightGreenDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: BrightGreenEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.brightGreenCoverage,
    currentColor,
    feature,
    targetName: "Bright Green",
  })
}

function createTransparentPrimaryDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: TransparentPrimaryEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.edgeColorCoverage,
    currentColor,
    feature,
    targetName: evidence.targetName,
  })
}

function createTransparentDarkBlueDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: TransparentDarkBlueEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.edgeBlueCoverage,
    currentColor,
    feature,
    targetName: "Trans-Dark Blue",
  })
}

function createTransparentBrownDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: TransparentBrownEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.cyanEdgeCoverage,
    currentColor,
    feature,
    targetName: "Trans-Brown",
  })
}

function createTransparentLightBlueDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: TransparentLightBlueEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.cyanGlassCoverage,
    currentColor,
    feature,
    targetName: "Trans-Light Blue",
  })
}

function createYellowBodyDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: YellowBodyEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: Math.max(evidence.yellowCoverage, evidence.shadowYellowCoverage),
    currentColor,
    feature,
    targetName: "Yellow",
  })
}

function createTransparentOrangeDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: TransparentOrangeEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.orangeCoverage,
    currentColor,
    feature,
    targetName: "Trans-Orange",
  })
}

function createTransparentGreenDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: TransparentGreenEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.greenCoverage,
    currentColor,
    feature,
    targetName: "Trans-Green",
  })
}

function createTransparentYellowDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: TransparentYellowEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.yellowCoverage,
    currentColor,
    feature,
    targetName: "Trans-Yellow",
  })
}

function createRedBodyDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: RedBodyEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.redBodyCoverage,
    currentColor,
    feature,
    targetName: "Red",
  })
}

function createWhiteBackgroundDetectedFallbackColor(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  evidence: WhiteBackgroundEvidence,
): DetectedFallbackColor {
  return createPaletteOverrideDetectedColor({
    confidence: evidence.backgroundRatio,
    currentColor,
    feature,
    targetName: "White",
  })
}

function createPrototypeRuleFields(resolution: PrototypeResolution) {
  return {
    ruleCandidateNames: uniqueNames(resolution.candidates.map((candidate) => candidate.name)).slice(0, 4),
    ruleCandidateScores: resolution.candidates.slice(0, 4).map((candidate) => ({
      name: candidate.name,
      score: roundScore(readPrototypeCandidateScore(candidate.distance)),
    })),
    ruleCanonicalClassId: resolution.prototype.id,
    ruleId: "aggregate-prototype",
    ruleResolverKind: "aggregate-prototype",
    ruleScoreMargin: roundScore(resolution.margin),
    ruleScoreTop: roundScore(resolution.distance),
    ruleSourceRawClassId: resolution.prototype.id,
  }
}

function createWhiteBackgroundRuleFields(
  evidence: WhiteBackgroundEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["White", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
      {
        name: "Bright neutral edge",
        score: roundScore(evidence.brightNeutralEdgeCoverage),
      },
      {
        name: "Light neutral edge",
        score: roundScore(evidence.lightNeutralEdgeCoverage),
      },
      {
        name: "Dark body",
        score: roundScore(evidence.darkCoverage),
      },
      {
        name: "Max edge luma",
        score: roundScore(evidence.maxEdgeLuma / 255),
      },
    ],
    ruleCanonicalClassId: "palette-white-background",
    ruleId: "white-background-evidence",
    ruleResolverKind: "white-background-evidence",
    ruleScoreMargin: roundScore(evidence.backgroundRatio),
    ruleScoreTop: roundScore(evidence.backgroundRatio),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createLightNeutralEdgeRuleFields(
  evidence: LightNeutralEdgeEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Light Bluish Gray", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Light neutral edge",
        score: roundScore(evidence.lightNeutralEdgeCoverage),
      },
      {
        name: "Light neutral body",
        score: roundScore(evidence.lightNeutralTopCoverage),
      },
      {
        name: "Dark/black guard",
        score: roundScore(evidence.darkNeutralCoverage + evidence.nearBlackCoverage),
      },
      {
        name: "Background guard",
        score: roundScore(evidence.backgroundRatio),
      },
    ],
    ruleCanonicalClassId: "palette-light-neutral-edge",
    ruleId: "light-neutral-edge-evidence",
    ruleResolverKind: "light-neutral-edge-evidence",
    ruleScoreMargin: roundScore(evidence.lightNeutralEdgeCoverage - evidence.darkNeutralCoverage - evidence.nearBlackCoverage),
    ruleScoreTop: roundScore(evidence.lightNeutralEdgeCoverage),
  }
}

function createBlackEdgeRuleFields(
  evidence: BlackEdgeEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Black", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Dark edge",
        score: roundScore(evidence.darkEdgeCoverage),
      },
      {
        name: "Near-black edge",
        score: roundScore(evidence.nearBlackEdgeCoverage),
      },
      {
        name: "Accepted near-black",
        score: roundScore(evidence.acceptedNearBlackCoverage),
      },
      {
        name: "Mid-neutral guard",
        score: roundScore(evidence.acceptedMidNeutralCoverage),
      },
      {
        name: "Bright-neutral guard",
        score: roundScore(evidence.acceptedBrightNeutralCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-black-edge",
    ruleId: "black-edge-evidence",
    ruleResolverKind: "black-edge-evidence",
    ruleScoreMargin: roundScore(evidence.darkEdgeCoverage - evidence.acceptedBrightNeutralCoverage),
    ruleScoreTop: roundScore(evidence.darkEdgeCoverage),
  }
}

function createDarkNeutralBodyRuleFields(
  evidence: DarkNeutralBodyEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Dark Bluish Gray", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Dark neutral body",
        score: roundScore(evidence.darkNeutralCoverage),
      },
      {
        name: "Near-black body",
        score: roundScore(evidence.nearBlackCoverage),
      },
      {
        name: "Dark edge",
        score: roundScore(evidence.darkEdgeCoverage),
      },
      {
        name: "Light-neutral guard",
        score: roundScore(evidence.lightNeutralCoverage),
      },
      {
        name: "Background guard",
        score: roundScore(evidence.backgroundRatio),
      },
    ],
    ruleCanonicalClassId: "palette-dark-neutral-body",
    ruleId: "dark-neutral-body-evidence",
    ruleResolverKind: "dark-neutral-body-evidence",
    ruleScoreMargin: roundScore(evidence.darkNeutralCoverage - evidence.lightNeutralCoverage),
    ruleScoreTop: roundScore(evidence.darkNeutralCoverage),
    ruleSourceRawClassId: paletteSourceId(currentColor.name),
  }
}

function createDarkNeutralEdgeRuleFields(
  evidence: DarkNeutralEdgeEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Dark Bluish Gray", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Mid neutral body",
        score: roundScore(evidence.midNeutralCoverage),
      },
      {
        name: "Near-black guard",
        score: roundScore(evidence.nearBlackCoverage),
      },
      {
        name: "Light-neutral guard",
        score: roundScore(evidence.lightNeutralCoverage),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
      {
        name: "Background window",
        score: roundScore(evidence.backgroundRatio),
      },
    ],
    ruleCanonicalClassId: "palette-dark-neutral-edge",
    ruleId: "dark-neutral-edge-evidence",
    ruleResolverKind: "dark-neutral-edge-evidence",
    ruleScoreMargin: roundScore(evidence.midNeutralCoverage - evidence.nearBlackCoverage),
    ruleScoreTop: roundScore(evidence.midNeutralCoverage),
    ruleSourceRawClassId: paletteSourceId(currentColor.name),
  }
}

function createPearlDarkGrayMetalRuleFields(
  evidence: PearlDarkGrayMetalEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Pearl Dark Gray", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Metal dark body",
        score: roundScore(evidence.metalDarkCoverage),
      },
      {
        name: "Dark neutral body",
        score: roundScore(evidence.darkNeutralCoverage),
      },
      {
        name: "Blue guard",
        score: roundScore(evidence.blueishCoverage),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
      {
        name: "Background window",
        score: roundScore(evidence.backgroundRatio),
      },
    ],
    ruleCanonicalClassId: "palette-pearl-dark-gray-metal",
    ruleId: "pearl-dark-gray-metal-evidence",
    ruleResolverKind: "pearl-dark-gray-metal-evidence",
    ruleScoreMargin: roundScore(evidence.metalDarkCoverage - evidence.blueishCoverage),
    ruleScoreTop: roundScore(evidence.metalDarkCoverage),
    ruleSourceRawClassId: paletteSourceId(currentColor.name),
  }
}

function createDarkTanBodyRuleFields(
  evidence: DarkTanBodyEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Dark Tan", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Dark Tan body",
        score: roundScore(evidence.bodyCoverage),
      },
      {
        name: "Dark Tan core",
        score: roundScore(evidence.coreCoverage),
      },
      {
        name: "saturated warm guard",
        score: roundScore(evidence.saturatedWarmCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-dark-tan-body",
    ruleId: "dark-tan-body-evidence",
    ruleResolverKind: "dark-tan-body-evidence",
    ruleScoreMargin: roundScore(evidence.bodyCoverage - evidence.saturatedWarmCoverage),
    ruleScoreTop: roundScore(evidence.coreDistance),
  }
}

function createTanBodyRuleFields(
  evidence: TanBodyEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Tan", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Tan body",
        score: roundScore(evidence.tanCoverage),
      },
      {
        name: "Light Tan body",
        score: roundScore(evidence.lightTanCoverage),
      },
      {
        name: "Saturated warm guard",
        score: roundScore(evidence.saturatedWarmCoverage),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
      {
        name: "Background guard",
        score: roundScore(evidence.backgroundRatio),
      },
    ],
    ruleCanonicalClassId: "palette-tan-body",
    ruleId: "tan-body-evidence",
    ruleResolverKind: "tan-body-evidence",
    ruleScoreMargin: roundScore(evidence.tanCoverage - evidence.saturatedWarmCoverage),
    ruleScoreTop: roundScore(evidence.tanCoverage),
    ruleSourceRawClassId: paletteSourceId(currentColor.name),
  }
}

function createPearlGoldBodyRuleFields(
  evidence: PearlGoldBodyEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Pearl Gold", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Gold body",
        score: roundScore(evidence.goldCoverage),
      },
      {
        name: "Bright gold body",
        score: roundScore(evidence.brightGoldCoverage),
      },
      {
        name: "Dark guard",
        score: roundScore(evidence.darkCoverage),
      },
      {
        name: "Red guard",
        score: roundScore(evidence.redCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-pearl-gold-body",
    ruleId: "pearl-gold-body-evidence",
    ruleResolverKind: "pearl-gold-body-evidence",
    ruleScoreMargin: roundScore(evidence.goldCoverage - evidence.darkCoverage),
    ruleScoreTop: roundScore(evidence.goldCoverage),
  }
}

function createMediumNougatEdgeRuleFields(
  evidence: MediumNougatEdgeEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Medium Nougat", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Muted warm body",
        score: roundScore(evidence.mutedWarmCoverage),
      },
      {
        name: "Saturated warm guard",
        score: roundScore(evidence.saturatedWarmCoverage),
      },
      {
        name: "Dominant guard",
        score: roundScore(evidence.dominantCoverage),
      },
      {
        name: "Dark guard",
        score: roundScore(evidence.darkCoverage),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
      {
        name: "Orange edge",
        score: roundScore(evidence.orangeEdgeCoverage),
      },
      {
        name: "Background guard",
        score: roundScore(evidence.backgroundRatio),
      },
    ],
    ruleCanonicalClassId: "palette-medium-nougat-edge",
    ruleId: "medium-nougat-edge-evidence",
    ruleResolverKind: "medium-nougat-edge-evidence",
    ruleScoreMargin: roundScore(evidence.mutedWarmCoverage - evidence.backgroundRatio),
    ruleScoreTop: roundScore(evidence.edgeRatio),
    ruleSourceRawClassId: paletteSourceId(currentColor.name),
  }
}

function createGreenBodyRuleFields(
  evidence: GreenBodyEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Green", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Green",
        score: roundScore(evidence.greenCoverage),
      },
      {
        name: currentColor.name,
        score: roundScore(evidence.nearBlackCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-green-body",
    ruleId: "green-body-evidence",
    ruleResolverKind: "green-body-evidence",
    ruleScoreMargin: roundScore(evidence.greenCoverage - evidence.nearBlackCoverage),
    ruleScoreTop: roundScore(evidence.distance),
  }
}

function createDarkGreenBodyRuleFields(
  evidence: DarkGreenBodyEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Dark Green", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Dark green body",
        score: roundScore(evidence.darkGreenCoverage),
      },
      {
        name: "Dark green edge",
        score: roundScore(evidence.darkGreenEdgeCoverage),
      },
      {
        name: "Bright green guard",
        score: roundScore(evidence.brightGreenCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-dark-green-body",
    ruleId: "dark-green-body-evidence",
    ruleResolverKind: "dark-green-body-evidence",
    ruleScoreMargin: roundScore(evidence.darkGreenCoverage - evidence.brightGreenCoverage),
    ruleScoreTop: roundScore(evidence.distance),
    ruleSourceRawClassId: paletteSourceId(currentColor.name),
  }
}

function createBrightGreenRuleFields(
  evidence: BrightGreenEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Bright Green", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Bright green body",
        score: roundScore(evidence.brightGreenCoverage),
      },
      {
        name: "Dark green guard",
        score: roundScore(evidence.darkGreenCoverage),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
    ],
    ruleCanonicalClassId: "palette-bright-green",
    ruleId: "bright-green-evidence",
    ruleResolverKind: "bright-green-evidence",
    ruleScoreMargin: roundScore(evidence.brightGreenCoverage - evidence.darkGreenCoverage),
    ruleScoreTop: roundScore(evidence.brightGreenCoverage),
    ruleSourceRawClassId: "palette-green",
  }
}

function createTransparentPrimaryRuleFields(
  evidence: TransparentPrimaryEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames([evidence.targetName, currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Accepted color",
        score: roundScore(evidence.acceptedColorCoverage),
      },
      {
        name: "Edge color",
        score: roundScore(evidence.edgeColorCoverage),
      },
      {
        name: "Dark body",
        score: roundScore(evidence.darkBodyCoverage),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
    ],
    ruleCanonicalClassId: paletteSourceId(evidence.targetName),
    ruleId: "transparent-primary-evidence",
    ruleResolverKind: "transparent-primary-evidence",
    ruleScoreMargin: roundScore(evidence.edgeColorCoverage - evidence.backgroundRatio),
    ruleScoreTop: roundScore(evidence.edgeColorCoverage),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createTransparentDarkBlueRuleFields(
  evidence: TransparentDarkBlueEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Trans-Dark Blue", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Accepted blue",
        score: roundScore(evidence.blueCoverage),
      },
      {
        name: "Dark blue body",
        score: roundScore(evidence.darkBlueCoverage),
      },
      {
        name: "Edge blue",
        score: roundScore(evidence.edgeBlueCoverage),
      },
      {
        name: "Edge dark blue",
        score: roundScore(evidence.edgeDarkBlueCoverage),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
    ],
    ruleCanonicalClassId: "palette-trans-dark-blue",
    ruleId: "transparent-dark-blue-evidence",
    ruleResolverKind: "transparent-dark-blue-evidence",
    ruleScoreMargin: roundScore(evidence.edgeBlueCoverage - evidence.backgroundRatio),
    ruleScoreTop: roundScore(evidence.edgeBlueCoverage),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createTransparentBrownRuleFields(
  evidence: TransparentBrownEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Trans-Brown", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Neutral body",
        score: roundScore(evidence.neutralCoverage),
      },
      {
        name: "Cyan glass edge",
        score: roundScore(evidence.cyanEdgeCoverage),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
      {
        name: "Dark guard",
        score: roundScore(evidence.darkCoverage),
      },
      {
        name: "Cool-blue guard",
        score: roundScore(evidence.coolBlueCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-trans-brown",
    ruleId: "transparent-brown-evidence",
    ruleResolverKind: "transparent-brown-evidence",
    ruleScoreMargin: roundScore(evidence.cyanEdgeCoverage - evidence.coolBlueCoverage),
    ruleScoreTop: roundScore(evidence.cyanEdgeCoverage),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createTransparentLightBlueRuleFields(
  evidence: TransparentLightBlueEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Trans-Light Blue", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Cyan glass body",
        score: roundScore(evidence.cyanGlassCoverage),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
      {
        name: "Dark guard",
        score: roundScore(evidence.darkCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-trans-light-blue",
    ruleId: "transparent-light-blue-evidence",
    ruleResolverKind: "transparent-light-blue-evidence",
    ruleScoreMargin: roundScore(
      evidence.sourceName === "Black"
        ? evidence.backgroundRatio + evidence.cyanGlassCoverage - evidence.edgeRatio
        : evidence.cyanGlassCoverage - evidence.darkCoverage,
    ),
    ruleScoreTop: roundScore(evidence.cyanGlassCoverage),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createYellowBodyRuleFields(
  evidence: YellowBodyEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Yellow", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Yellow body",
        score: roundScore(Math.max(evidence.yellowCoverage, evidence.shadowYellowCoverage)),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
      {
        name: "Dark guard",
        score: roundScore(evidence.darkCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-yellow",
    ruleId: "yellow-body-evidence",
    ruleResolverKind: "yellow-body-evidence",
    ruleScoreMargin: roundScore(evidence.yellowCoverage - evidence.darkCoverage),
    ruleScoreTop: roundScore(evidence.yellowCoverage),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createTransparentOrangeRuleFields(
  evidence: TransparentOrangeEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Trans-Orange", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Orange body",
        score: roundScore(evidence.orangeCoverage),
      },
      {
        name: "Light orange body",
        score: roundScore(evidence.lightOrangeCoverage),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
      {
        name: "Dark guard",
        score: roundScore(evidence.darkCoverage),
      },
      {
        name: "Red guard",
        score: roundScore(evidence.redCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-trans-orange",
    ruleId: "transparent-orange-evidence",
    ruleResolverKind: "transparent-orange-evidence",
    ruleScoreMargin: roundScore(evidence.orangeCoverage - evidence.darkCoverage),
    ruleScoreTop: roundScore(evidence.orangeCoverage),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createTransparentGreenRuleFields(
  evidence: TransparentGreenEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Trans-Green", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Green body",
        score: roundScore(evidence.greenCoverage),
      },
      {
        name: "Green edge",
        score: roundScore(evidence.greenEdgeCoverage),
      },
      {
        name: "Light green guard",
        score: roundScore(evidence.lightGreenCoverage),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
    ],
    ruleCanonicalClassId: "palette-trans-green",
    ruleId: "transparent-green-evidence",
    ruleResolverKind: "transparent-green-evidence",
    ruleScoreMargin: roundScore(evidence.greenCoverage - evidence.lightGreenCoverage),
    ruleScoreTop: roundScore(evidence.greenCoverage),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createTransparentYellowRuleFields(
  evidence: TransparentYellowEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Trans-Yellow", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Yellow body",
        score: roundScore(evidence.yellowCoverage),
      },
      {
        name: "Bright yellow body",
        score: roundScore(evidence.brightYellowCoverage),
      },
      {
        name: "Yellow edge",
        score: roundScore(evidence.yellowEdgeCoverage),
      },
      {
        name: "Background rejection",
        score: roundScore(evidence.backgroundRatio),
      },
      {
        name: "Edge rejection",
        score: roundScore(evidence.edgeRatio),
      },
    ],
    ruleCanonicalClassId: "palette-trans-yellow",
    ruleId: "transparent-yellow-evidence",
    ruleResolverKind: "transparent-yellow-evidence",
    ruleScoreMargin: roundScore(evidence.yellowCoverage - evidence.orangeCoverage),
    ruleScoreTop: roundScore(evidence.yellowCoverage),
    ruleSourceRawClassId: paletteSourceId(evidence.sourceName),
  }
}

function createRedBodyRuleFields(
  evidence: RedBodyEvidence,
  currentColor: DetectedFallbackColor,
) {
  return {
    ruleCandidateNames: uniqueNames(["Red", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Red body",
        score: roundScore(evidence.redBodyCoverage),
      },
      {
        name: "Bright red body",
        score: roundScore(evidence.brightRedCoverage),
      },
      {
        name: "Red edge",
        score: roundScore(evidence.edgeRedCoverage),
      },
      {
        name: "Dark red guard",
        score: roundScore(evidence.darkRedCoverage),
      },
      {
        name: "Near-black guard",
        score: roundScore(evidence.nearBlackCoverage),
      },
    ],
    ruleCanonicalClassId: "palette-red-body",
    ruleId: "red-body-evidence",
    ruleResolverKind: "red-body-evidence",
    ruleScoreMargin: roundScore(evidence.brightRedCoverage - evidence.backgroundRatio),
    ruleScoreTop: roundScore(evidence.redBodyCoverage),
    ruleSourceRawClassId: paletteSourceId(currentColor.name),
  }
}

function createFlatSilverRuleFields(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
) {
  const flatSilver = findPaletteColorByName("Flat Silver")
  const distance = flatSilver
    ? colorDistanceCiede2000(feature.rgb, flatSilver.rgb)
    : currentColor.distance

  return {
    ruleCandidateNames: uniqueNames(["Flat Silver", currentColor.name, ...currentColor.alternatives]).slice(0, 4),
    ruleCandidateScores: [
      {
        name: "Flat Silver",
        score: roundScore(clamp(1 - distance / 18)),
      },
      {
        name: currentColor.name,
        score: roundScore(currentColor.confidence),
      },
    ],
    ruleCanonicalClassId: "palette-flat-silver",
    ruleId: "flat-silver-evidence",
    ruleResolverKind: "flat-silver-evidence",
    ruleScoreTop: roundScore(distance),
  }
}

function readPrototypeAlternatives(resolution: PrototypeResolution): string[] {
  return uniqueNames(
    resolution.candidates
      .filter((candidate) => normalizeName(candidate.name) !== normalizeName(resolution.name))
      .map((candidate) => candidate.name),
  ).slice(0, 3)
}

function readPrototypeConfidence(resolution: PrototypeResolution, sampleConfidence: number): number {
  const distanceConfidence = clamp(1 - resolution.distance / 8)
  const marginConfidence = Number.isFinite(resolution.margin)
    ? clamp(resolution.margin / 8)
    : 1

  return clamp(sampleConfidence * (distanceConfidence * 0.78 + marginConfidence * 0.22))
}

function readPrototypeCandidateScore(distance: number): number {
  return clamp(1 - distance / 8)
}

function createManualClassId(index: number): string {
  return `manual-color-${String(index + 1).padStart(3, "0")}`
}

function averageClassRgb(features: readonly PartColorFeature[]): RgbColor {
  return {
    b: Math.round(average(features.map((feature) => feature.rgb.b))),
    g: Math.round(average(features.map((feature) => feature.rgb.g))),
    r: Math.round(average(features.map((feature) => feature.rgb.r))),
  }
}

function averageConfidence(features: readonly PartColorFeature[]): number {
  return average(features.map((feature) => feature.quality.confidence))
}

function sumPixels(features: readonly PartColorFeature[]): number {
  return features.reduce((total, feature) => total + feature.pixelCount, 0)
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
}
