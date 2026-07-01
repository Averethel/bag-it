import type {
  PartColorRegion,
  PartColorSample,
  PartColorSampleChip,
  PartColorSampleInput,
  PartColorSampleRejectionCounts,
  RgbColor,
} from "./contracts"
import { colorDistanceCiede2000, rgbToHex, rgbToLch } from "./color-space"
import { chooseHighResolutionPartColorSample } from "./high-resolution-resample"

const BACKGROUND_DISTANCE_MAX = 15
const CLUSTER_DISTANCE_MAX = 6
const COLORED_BODY_CHROMA_MIN = 10
const COLORED_BODY_COVERAGE_MIN = 0.055
const CORE_BODY_CANDIDATE_RATIO = 0.45
const CORE_BODY_EDGE_DEPTH_MIN = 2
const CORE_BODY_MIN_PIXEL_RATIO = 0.22
const DARK_EDGE_RESCUE_COVERAGE_MIN = 0.18
const DARK_EDGE_RESCUE_NEAR_BLACK_MIN = 0.08
const HIGHLIGHT_LUMA_MIN = 224
const HIGHLIGHT_CHROMA_MAX = 8
const LOW_ALPHA_MIN = 96
const MAX_SAMPLE_PIXELS = 2400
const MIN_SELECTED_COVERAGE = 0.075
const MIN_SUPPORTED_SELECTED_COVERAGE = 0.055
const MIN_SAMPLE_PIXELS = 12
const WARM_BROWN_BODY_CHROMA_MIN = 8
const WARM_BROWN_BODY_HUE_MAX = 75
const WARM_BROWN_BODY_HUE_MIN = 35
const WARM_BROWN_BODY_LUMA_MAX = 112
const WARM_BROWN_BODY_SCORE_MULTIPLIER = 3
const NEUTRAL_BODY_CHROMA_MAX = 8
const NEUTRAL_DARK_BODY_COVERAGE_MIN = 0.3
const NEUTRAL_DARK_SUPPORT_COVERAGE_MIN = 0.22
const NEUTRAL_DARK_SUPPORT_LUMA_MAX = 100
const NEUTRAL_LIGHT_BODY_LUMA_MIN = 88
const NEUTRAL_LIGHT_BODY_OUTLINE_COVERAGE_MIN = 0.18
const NEUTRAL_LOW_COVERAGE_REVIEW_PIXELS_MIN = 60
const NEUTRAL_LOW_COVERAGE_REVIEW_SUPPORT_MIN = 0.24
const NEUTRAL_SMALL_DARK_BODY_COVERAGE_MIN = 0.2
const NEUTRAL_SMALL_DARK_BODY_LUMA_MAX = 120
const NEUTRAL_SMALL_DARK_BODY_PIXELS_MAX = 220
const NEUTRAL_SMALL_DARK_SUPPORT_COVERAGE_MIN = 0.3
const NEUTRAL_MEDIUM_BODY_BLUE_BIAS_MAX = 4
const NEUTRAL_MEDIUM_BODY_COVERAGE_MIN = 0.12
const NEUTRAL_MEDIUM_BODY_DARK_COVERAGE_MAX = 0.32
const NEUTRAL_MEDIUM_BODY_LUMA_MAX = 136
const NEUTRAL_MEDIUM_BODY_LUMA_MIN = 72
const NEUTRAL_MEDIUM_BODY_NEAR_BLACK_MAX = 0.22
const NEUTRAL_MEDIUM_BODY_SHADOW_NEAR_BLACK_MAX = 0.38
const NEUTRAL_MEDIUM_BODY_SHADOW_COVERAGE_MIN = 0.22
const NEUTRAL_MEDIUM_BODY_VS_DARK_MARGIN_MIN = 0.1
const NEUTRAL_NEAR_BLACK_BODY_COVERAGE_MIN = 0.12
const NEUTRAL_NEAR_BLACK_BODY_LUMA_MAX = 36
const NEUTRAL_NEAR_BLACK_BODY_STRONG_COVERAGE_MIN = 0.18
const NEUTRAL_LIGHT_BODY_COVERAGE_MIN = 0.08
const NEUTRAL_NEAR_BLACK_LUMA_MAX = 28
const NEUTRAL_BLACK_BLUE_BIAS_MIN = 7
const NEUTRAL_BLACK_STRONG_NEAR_COVERAGE_MIN = 0.3
const NEUTRAL_BLACK_STRONG_SUPPORT_COVERAGE_MIN = 0.36
const NEUTRAL_BLACK_COLORED_BODY_MARGIN = 0.75
const NEUTRAL_TINY_BLACK_DARK_COVERAGE_MIN = 0.22
const NEUTRAL_TINY_BLACK_DARK_SUPPORT_COVERAGE_MIN = 0.3
const NEUTRAL_TINY_BLACK_DARK_SUPPORT_LUMA_MAX = 72
const NEUTRAL_TINY_BLACK_NEAR_COVERAGE_MIN = 0.08
const NEUTRAL_TINY_BLACK_SAMPLE_PIXELS_MAX = 160
const OUTLINE_LUMA_MAX = 52
const OUTLINE_COVERAGE_MAX = 0.4
const WARM_BRIGHT_BODY_CHROMA_MIN = 25
const WARM_BRIGHT_BODY_COVERAGE_MIN = 0.035
const WARM_BRIGHT_BODY_HUE_MAX = 104
const WARM_BRIGHT_BODY_HUE_MIN = 70
const WARM_BRIGHT_BODY_LUMA_MIN = 78
const WARM_BRIGHT_BODY_TOTAL_COVERAGE_MIN = 0.09
const WHITE_BODY_BACKGROUND_COVERAGE_MIN = 0.28
const WHITE_BODY_COVERAGE_MIN = 0.22
const WHITE_BODY_CORE_BACKGROUND_COVERAGE_MIN = 0.42
const WHITE_BODY_CORE_DARK_SUPPORT_MAX = 0.38
const WHITE_BODY_CORE_PIXELS_MIN = 6
const WHITE_BODY_LUMA_MIN = 224
const WHITE_BODY_PIXELS_MIN = 12

export const PART_COLOR_SAMPLE_DECISION = {
  accepted: 1,
  background: 2,
  border: 3,
  edge: 7,
  excludedRegion: 4,
  lowAlpha: 5,
  outOfPage: 6,
} as const

export interface PartColorSamplingAudit {
  decisions: Uint8ClampedArray
  height: number
  rejectionCounts: PartColorSampleRejectionCounts
  sample: PartColorSample | null
  width: number
}

interface PixelSample {
  rgb: RgbColor
}

interface PixelCandidate extends PixelSample {
  backgroundLike: boolean
  edgeDepth: number
  maskIndex: number
}

interface PixelCollection {
  decisions: Uint8ClampedArray
  edgePixels: PixelSample[]
  pixels: PixelSample[]
  rejectionCounts: PartColorSampleRejectionCounts
}

interface PixelCandidateCollection {
  acceptedMaskIndices: Set<number>
  candidates: PixelCandidate[]
}

interface ColorCluster {
  b: number
  count: number
  g: number
  pixels: RgbColor[]
  r: number
}

export function samplePartColor(input: PartColorSampleInput): PartColorSample | null {
  const audit = auditPartColorSampling(input)

  return chooseHighResolutionPartColorSample(
    input,
    audit.sample,
    (sampleInput) => auditPartColorSampling(sampleInput).sample,
  )
}

export function auditPartColorSampling(input: PartColorSampleInput): PartColorSamplingAudit {
  const collection = collectPartPixels(input)
  const pixels = downsamplePixels(collection.pixels)
  const edgePixels = downsamplePixels(collection.edgePixels)
  const sample = createSample(pixels, collection.rejectionCounts, edgePixels)

  return {
    decisions: collection.decisions,
    height: input.partImage.alphaMask.height,
    rejectionCounts: collection.rejectionCounts,
    sample,
    width: input.partImage.alphaMask.width,
  }
}

function createSample(
  pixels: readonly PixelSample[],
  rejectionCounts: PartColorSampleRejectionCounts,
  edgePixels: readonly PixelSample[] = [],
): PartColorSample | null {
  if (pixels.length === 0) {
    return null
  }

  const clusters = clusterPixels(pixels)
  const selected = selectPartCluster(clusters, pixels.length)
  const chips = clusters.map((cluster) => createChip(cluster, pixels.length))
  const edgeChips = clusterPixels(edgePixels).map((cluster) => createChip(cluster, edgePixels.length))
  const selectedRgb = clusterRgb(selected)
  const selectedChipIndex = Math.max(0, clusters.indexOf(selected))
  const variance = meanColorDistance(selected.pixels, selectedRgb)
  const dominantCoverage = selected.count / pixels.length
  const status = classifySample({
    clusters,
    dominantCoverage,
    pixelCount: pixels.length,
    selected,
    variance,
  })

  return {
    chips,
    dominantCoverage,
    edgeChips,
    hex: rgbToHex(selectedRgb),
    pixelCount: pixels.length,
    rejectionCounts,
    rejectedPixelCount: rejectedPixelCount(rejectionCounts),
    rgb: selectedRgb,
    selectedChipIndex,
    stability: sampleStability(pixels.length, dominantCoverage, variance),
    status,
    variance,
  }
}

function collectPartPixels(input: PartColorSampleInput): PixelCollection {
  const { alphaMask } = input.partImage
  const decisions = new Uint8ClampedArray(alphaMask.width * alphaMask.height)
  const rejectionCounts = createEmptyRejectionCounts()
  const { acceptedMaskIndices, candidates } = collectBasePixelCandidates(input, decisions, rejectionCounts)
  const foregroundCandidates = selectForegroundCandidates(candidates, {
    acceptedMaskIndices,
    decisions,
    height: alphaMask.height,
    rejectionCounts,
    width: alphaMask.width,
  })
  const { edgeCandidates, selectedCandidates } = selectSamplePixelCandidates(
    foregroundCandidates,
    acceptedMaskIndices,
    alphaMask.width,
    alphaMask.height,
  )
  markEdgeCandidates(foregroundCandidates, selectedCandidates, decisions, rejectionCounts)
  const edgePixels = edgeCandidates.map((candidate) => ({ rgb: candidate.rgb }))
  const pixels = selectedCandidates.map((candidate) => ({ rgb: candidate.rgb }))

  return { decisions, edgePixels, pixels, rejectionCounts }
}

function collectBasePixelCandidates(
  input: PartColorSampleInput,
  decisions: Uint8ClampedArray,
  rejectionCounts: PartColorSampleRejectionCounts,
): PixelCandidateCollection {
  const { alphaMask, region } = input.partImage
  const acceptedMaskIndices = new Set<number>()
  const candidates: PixelCandidate[] = []

  for (let y = 0; y < alphaMask.height; y += 1) {
    for (let x = 0; x < alphaMask.width; x += 1) {
      collectBasePixelCandidate(input, { acceptedMaskIndices, candidates, decisions, rejectionCounts, region, x, y })
    }
  }

  return { acceptedMaskIndices, candidates }
}

function collectBasePixelCandidate(
  input: PartColorSampleInput,
  {
    acceptedMaskIndices,
    candidates,
    decisions,
    rejectionCounts,
    region,
    x,
    y,
  }: {
    acceptedMaskIndices: Set<number>
    candidates: PixelCandidate[]
    decisions: Uint8ClampedArray
    rejectionCounts: PartColorSampleRejectionCounts
    region: PartColorRegion
    x: number
    y: number
  },
): void {
  const maskIndex = y * input.partImage.alphaMask.width + x
  const decision = readMaskPixelBaseDecision(input, x, y)

  if (decision !== PART_COLOR_SAMPLE_DECISION.accepted) {
    decisions[maskIndex] = decision
    countRejection(rejectionCounts, decision)
    return
  }

  const rgb = readPageRgb(input, region.x + x, region.y + y)

  candidates.push({
    backgroundLike: isBackgroundLike(rgb, input.background),
    edgeDepth: 0,
    maskIndex,
    rgb,
  })
  acceptedMaskIndices.add(maskIndex)
}

function selectForegroundCandidates(
  candidates: readonly PixelCandidate[],
  {
    acceptedMaskIndices,
    decisions,
    height,
    rejectionCounts,
    width,
  }: {
    acceptedMaskIndices: Set<number>
    decisions: Uint8ClampedArray
    height: number
    rejectionCounts: PartColorSampleRejectionCounts
    width: number
  },
): PixelCandidate[] {
  if (shouldAcceptBackgroundLikePixels(candidates, { acceptedMaskIndices, height, width })) {
    return [...candidates]
  }

  return candidates.filter((candidate) =>
    keepForegroundCandidate(candidate, { acceptedMaskIndices, decisions, rejectionCounts })
  )
}

function keepForegroundCandidate(
  candidate: PixelCandidate,
  {
    acceptedMaskIndices,
    decisions,
    rejectionCounts,
  }: {
    acceptedMaskIndices: Set<number>
    decisions: Uint8ClampedArray
    rejectionCounts: PartColorSampleRejectionCounts
  },
): boolean {
  if (!candidate.backgroundLike) {
    return true
  }

  decisions[candidate.maskIndex] = PART_COLOR_SAMPLE_DECISION.background
  countRejection(rejectionCounts, PART_COLOR_SAMPLE_DECISION.background)
  acceptedMaskIndices.delete(candidate.maskIndex)

  return false
}

function selectSamplePixelCandidates(
  foregroundCandidates: readonly PixelCandidate[],
  acceptedMaskIndices: ReadonlySet<number>,
  width: number,
  height: number,
): {
  edgeCandidates: PixelCandidate[]
  selectedCandidates: PixelCandidate[]
} {
  const edgeDepths = calculateInteriorDepths(width, height, acceptedMaskIndices)
  const weightedForegroundCandidates = foregroundCandidates.map((candidate) => ({
    ...candidate,
    edgeDepth: edgeDepths[candidate.maskIndex] ?? 0,
  }))
  const bodyCandidates = selectBodyPixelCandidates(weightedForegroundCandidates)
  const bodyMaskIndices = new Set(bodyCandidates.map((candidate) => candidate.maskIndex))
  const edgeCandidates = weightedForegroundCandidates.filter((candidate) =>
    !bodyMaskIndices.has(candidate.maskIndex)
  )
  const rescuedEdgeCandidates = selectDarkEdgeSupportCandidates(bodyCandidates, edgeCandidates, foregroundCandidates.length)

  const selectedCandidates = [...bodyCandidates, ...rescuedEdgeCandidates]
  const selectedMaskIndices = new Set(selectedCandidates.map((candidate) => candidate.maskIndex))

  return {
    edgeCandidates: edgeCandidates.filter((candidate) => !selectedMaskIndices.has(candidate.maskIndex)),
    selectedCandidates,
  }
}

function markEdgeCandidates(
  foregroundCandidates: readonly PixelCandidate[],
  selectedCandidates: readonly PixelCandidate[],
  decisions: Uint8ClampedArray,
  rejectionCounts: PartColorSampleRejectionCounts,
): void {
  const bodyMaskIndices = new Set(selectedCandidates.map((candidate) => candidate.maskIndex))

  for (const candidate of foregroundCandidates) {
    if (bodyMaskIndices.has(candidate.maskIndex)) {
      decisions[candidate.maskIndex] = PART_COLOR_SAMPLE_DECISION.accepted
      continue
    }

    decisions[candidate.maskIndex] = PART_COLOR_SAMPLE_DECISION.edge
    countRejection(rejectionCounts, PART_COLOR_SAMPLE_DECISION.edge)
  }
}

function calculateInteriorDepths(
  width: number,
  height: number,
  acceptedMaskIndices: ReadonlySet<number>,
): Uint16Array {
  const maxDistance = width + height + 1
  const depths = createInitialInteriorDepths(width * height, acceptedMaskIndices, maxDistance)

  scanInteriorDepthsForward(depths, width, height, maxDistance)
  scanInteriorDepthsBackward(depths, width, height, maxDistance)

  return depths
}

function createInitialInteriorDepths(
  size: number,
  acceptedMaskIndices: ReadonlySet<number>,
  maxDistance: number,
): Uint16Array {
  const depths = new Uint16Array(size)

  depths.fill(maxDistance)

  for (let index = 0; index < depths.length; index += 1) {
    if (!acceptedMaskIndices.has(index)) {
      depths[index] = 0
    }
  }

  return depths
}

function scanInteriorDepthsForward(
  depths: Uint16Array,
  width: number,
  height: number,
  maxDistance: number,
): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      updateForwardDepth(depths, width, x, y, maxDistance)
    }
  }
}

function updateForwardDepth(
  depths: Uint16Array,
  width: number,
  x: number,
  y: number,
  maxDistance: number,
): void {
  const index = y * width + x

  if (depths[index] === 0) {
    return
  }

  depths[index] = Math.min(
    depths[index],
    x > 0 ? depths[index - 1] + 1 : maxDistance,
    y > 0 ? depths[index - width] + 1 : maxDistance,
  )
}

function scanInteriorDepthsBackward(
  depths: Uint16Array,
  width: number,
  height: number,
  maxDistance: number,
): void {
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      updateBackwardDepth(depths, width, height, x, y, maxDistance)
    }
  }
}

function updateBackwardDepth(
  depths: Uint16Array,
  width: number,
  height: number,
  x: number,
  y: number,
  maxDistance: number,
): void {
  const index = y * width + x

  if (depths[index] === 0) {
    return
  }

  depths[index] = Math.min(
    depths[index],
    x < width - 1 ? depths[index + 1] + 1 : maxDistance,
    y < height - 1 ? depths[index + width] + 1 : maxDistance,
  )
}

function selectBodyPixelCandidates(candidates: readonly PixelCandidate[]): PixelCandidate[] {
  if (candidates.length <= MIN_SAMPLE_PIXELS) {
    return [...candidates]
  }

  const maxDepth = maxCandidateEdgeDepth(candidates)

  if (maxDepth < CORE_BODY_EDGE_DEPTH_MIN) {
    return [...candidates]
  }

  const minimumBodyPixels = Math.max(MIN_SAMPLE_PIXELS, Math.ceil(candidates.length * CORE_BODY_MIN_PIXEL_RATIO))
  const preferredDepth = Math.max(CORE_BODY_EDGE_DEPTH_MIN, Math.ceil(maxDepth * CORE_BODY_CANDIDATE_RATIO))
  const preferred = candidates.filter((candidate) => candidate.edgeDepth >= preferredDepth)

  if (preferred.length >= minimumBodyPixels) {
    return preferred
  }

  const sorted = [...candidates].sort((left, right) =>
    right.edgeDepth - left.edgeDepth ||
    left.maskIndex - right.maskIndex
  )

  return sorted.slice(0, Math.max(minimumBodyPixels, preferred.length))
}

function maxCandidateEdgeDepth(candidates: readonly PixelCandidate[]): number {
  let maxDepth = 0

  for (const candidate of candidates) {
    maxDepth = Math.max(maxDepth, candidate.edgeDepth)
  }

  return maxDepth
}

function selectDarkEdgeSupportCandidates(
  bodyCandidates: readonly PixelCandidate[],
  edgeCandidates: readonly PixelCandidate[],
  totalForegroundPixels: number,
): PixelCandidate[] {
  if (edgeCandidates.length === 0 || totalForegroundPixels <= 0) {
    return []
  }

  const bodyClusters = clusterPixels(bodyCandidates)

  if (hasWhiteBodyCluster(bodyCandidates, bodyCandidates.length)) {
    return []
  }

  if (hasColoredBodyPixels(bodyCandidates, bodyCandidates.length) || hasStrongNeutralBodyPixels(bodyClusters, bodyCandidates.length)) {
    return []
  }

  const darkEdges = edgeCandidates.filter((candidate) =>
    colorLuma(candidate.rgb) <= NEUTRAL_TINY_BLACK_DARK_SUPPORT_LUMA_MAX
  )
  const nearBlackEdges = edgeCandidates.filter((candidate) =>
    colorLuma(candidate.rgb) <= NEUTRAL_NEAR_BLACK_BODY_LUMA_MAX
  )

  if (
    darkEdges.length / totalForegroundPixels < DARK_EDGE_RESCUE_COVERAGE_MIN ||
    nearBlackEdges.length / totalForegroundPixels < DARK_EDGE_RESCUE_NEAR_BLACK_MIN
  ) {
    return []
  }

  return darkEdges
}

function hasStrongNeutralBodyPixels(
  bodyClusters: readonly ColorCluster[],
  totalBodyPixels: number,
): boolean {
  if (totalBodyPixels <= 0) {
    return false
  }

  return bodyClusters.some((cluster) => {
    if (!isNeutralCluster(cluster) || isLikelyHighlightCluster(cluster)) {
      return false
    }

    const luma = colorLuma(clusterRgb(cluster))

    return cluster.count / totalBodyPixels >= 0.28 &&
      luma >= NEUTRAL_MEDIUM_BODY_LUMA_MIN
  })
}

function readMaskPixelBaseDecision(
  input: PartColorSampleInput,
  maskX: number,
  maskY: number,
): number {
  const { alphaMask, region } = input.partImage
  const pageX = region.x + maskX
  const pageY = region.y + maskY
  const maskIndex = maskY * alphaMask.width + maskX
  const alpha = readMaskValue(alphaMask.data, maskIndex)

  if (alpha <= 0) {
    return 0
  }

  if (alpha < LOW_ALPHA_MIN) {
    return PART_COLOR_SAMPLE_DECISION.lowAlpha
  }

  if (!isInsidePage(input, pageX, pageY)) {
    return PART_COLOR_SAMPLE_DECISION.outOfPage
  }

  if (isCropBorderPixel(region, pageX, pageY)) {
    return PART_COLOR_SAMPLE_DECISION.border
  }

  if (isInsideAnyRegion(pageX, pageY, input.excludedRegions ?? [])) {
    return PART_COLOR_SAMPLE_DECISION.excludedRegion
  }

  return PART_COLOR_SAMPLE_DECISION.accepted
}

function shouldAcceptBackgroundLikePixels(
  candidates: readonly PixelCandidate[],
  {
    acceptedMaskIndices,
    height,
    width,
  }: {
    acceptedMaskIndices: ReadonlySet<number>
    height: number
    width: number
  },
): boolean {
  const backgroundLikePixels = candidates.filter((candidate) => candidate.backgroundLike)

  if (backgroundLikePixels.length < WHITE_BODY_PIXELS_MIN) {
    return false
  }

  if (backgroundLikePixels.length / candidates.length < WHITE_BODY_BACKGROUND_COVERAGE_MIN) {
    return false
  }

  const foregroundPixels = candidates.filter((candidate) => !candidate.backgroundLike)

  if (hasColoredBodyPixels(foregroundPixels, candidates.length)) {
    return false
  }

  if (!hasWhiteBodyCluster(backgroundLikePixels, candidates.length)) {
    return false
  }

  if (readDarkSupportCoverage(foregroundPixels, candidates.length) < NEUTRAL_DARK_SUPPORT_COVERAGE_MIN) {
    return true
  }

  return hasInteriorWhiteBodyEvidence(candidates, { acceptedMaskIndices, height, width })
}

function hasWhiteBodyCluster(backgroundLikePixels: readonly PixelSample[], totalPixels: number): boolean {
  return clusterPixels(backgroundLikePixels)
    .some((cluster) => isWhiteBodyCluster(cluster, totalPixels))
}

function hasInteriorWhiteBodyEvidence(
  candidates: readonly PixelCandidate[],
  {
    acceptedMaskIndices,
    height,
    width,
  }: {
    acceptedMaskIndices: ReadonlySet<number>
    height: number
    width: number
  },
): boolean {
  const edgeDepths = calculateInteriorDepths(width, height, acceptedMaskIndices)
  const coreCandidates = selectBodyPixelCandidates(candidates.map((candidate) => ({
    ...candidate,
    edgeDepth: edgeDepths[candidate.maskIndex] ?? 0,
  })))
  const coreBackgroundLikePixels = coreCandidates.filter((candidate) => candidate.backgroundLike)
  const coreForegroundPixels = coreCandidates.filter((candidate) => !candidate.backgroundLike)

  if (coreBackgroundLikePixels.length < WHITE_BODY_CORE_PIXELS_MIN) {
    return false
  }

  if (coreBackgroundLikePixels.length / coreCandidates.length < WHITE_BODY_CORE_BACKGROUND_COVERAGE_MIN) {
    return false
  }

  if (hasColoredBodyPixels(coreForegroundPixels, coreCandidates.length)) {
    return false
  }

  if (readDarkSupportCoverage(coreForegroundPixels, coreCandidates.length) > WHITE_BODY_CORE_DARK_SUPPORT_MAX) {
    return false
  }

  return hasWhiteBodyCluster(coreBackgroundLikePixels, coreCandidates.length)
}

function hasColoredBodyPixels(
  pixels: readonly PixelSample[],
  totalPixels: number,
): boolean {
  return clusterPixels(pixels)
    .some((cluster) => isColoredBodyCluster(cluster, totalPixels))
}

function isInsidePage(input: PartColorSampleInput, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < input.page.width && y < input.page.height
}

function isCropBorderPixel(region: PartColorRegion, x: number, y: number): boolean {
  const borderInset = cropBorderInset(region)

  if (borderInset <= 0) {
    return false
  }

  return x < region.x + borderInset ||
    y < region.y + borderInset ||
    x >= region.x + region.width - borderInset ||
    y >= region.y + region.height - borderInset
}

function cropBorderInset(region: PartColorRegion): number {
  if (region.width <= 8 || region.height <= 8) {
    return 0
  }

  return Math.max(1, Math.min(3, Math.floor(Math.min(region.width, region.height) * 0.06)))
}

function isInsideAnyRegion(x: number, y: number, regions: readonly PartColorRegion[]): boolean {
  return regions.some((region) =>
    x >= region.x &&
    y >= region.y &&
    x < region.x + region.width &&
    y < region.y + region.height,
  )
}

function isBackgroundLike(rgb: RgbColor, background: RgbColor | undefined): boolean {
  if (!background) {
    return false
  }

  const distance = colorDistanceCiede2000(rgb, background)
  const lumaDelta = Math.abs(colorLuma(rgb) - colorLuma(background))

  return distance <= BACKGROUND_DISTANCE_MAX || (distance <= 18 && lumaDelta <= 6)
}

function readMaskValue(data: Uint8ClampedArray, index: number): number {
  return typeof data[index] === "number" ? data[index] : 0
}

function readPageRgb(input: PartColorSampleInput, x: number, y: number): RgbColor {
  const offset = (y * input.page.width + x) * 4

  return {
    b: input.page.data[offset + 2],
    g: input.page.data[offset + 1],
    r: input.page.data[offset],
  }
}

function downsamplePixels(pixels: readonly PixelSample[]): PixelSample[] {
  if (pixels.length <= MAX_SAMPLE_PIXELS) {
    return [...pixels]
  }

  const stride = Math.ceil(pixels.length / MAX_SAMPLE_PIXELS)

  return pixels.filter((_pixel, index) => index % stride === 0)
}

function clusterPixels(pixels: readonly PixelSample[]): ColorCluster[] {
  const clusters: ColorCluster[] = []

  for (const pixel of pixels) {
    const cluster = findNearestCluster(clusters, pixel.rgb)

    if (cluster) {
      addPixelToCluster(cluster, pixel.rgb)
    } else {
      clusters.push({
        b: pixel.rgb.b,
        count: 1,
        g: pixel.rgb.g,
        pixels: [pixel.rgb],
        r: pixel.rgb.r,
      })
    }
  }

  return clusters.sort((left, right) => right.count - left.count)
}

function findNearestCluster(clusters: readonly ColorCluster[], pixel: RgbColor): ColorCluster | null {
  return clusters.find((cluster) => colorDistanceCiede2000(pixel, clusterRgb(cluster)) <= CLUSTER_DISTANCE_MAX) ?? null
}

function addPixelToCluster(cluster: ColorCluster, pixel: RgbColor): void {
  cluster.b += pixel.b
  cluster.count += 1
  cluster.g += pixel.g
  cluster.pixels.push(pixel)
  cluster.r += pixel.r
}

function selectPartCluster(clusters: readonly ColorCluster[], totalPixels: number): ColorCluster {
  const eligible = clusters.filter((cluster) => cluster.count / totalPixels >= COLORED_BODY_COVERAGE_MIN)
  const nearBlackBody = selectNearBlackBodyCluster(clusters, totalPixels)

  if (nearBlackBody) {
    return nearBlackBody
  }

  const brightWarmBody = selectBrightWarmBodyCluster(clusters, totalPixels)

  if (brightWarmBody) {
    return brightWarmBody
  }

  const coloredBody = eligible
    .filter((cluster) => isColoredBodyCluster(cluster, totalPixels))
    .sort(compareBodyClusterPriority)

  if (coloredBody[0]) {
    return coloredBody[0]
  }

  const neutralBody = selectNeutralBodyCluster(eligible, totalPixels)

  if (neutralBody) {
    return neutralBody
  }

  return eligible.find((cluster) => !isLikelyOutlineCluster(cluster, totalPixels) && !isLikelyHighlightCluster(cluster)) ??
    clusters.find((cluster) => !isLikelyOutlineCluster(cluster, totalPixels)) ??
    clusters[0]
}

function selectNeutralBodyCluster(
  clusters: readonly ColorCluster[],
  totalPixels: number,
): ColorCluster | null {
  const neutralClusters = clusters.filter(isNeutralCluster)

  if (neutralClusters.length < 2) {
    return null
  }

  const darkCoverage = neutralClusters
    .filter((cluster) => colorLuma(clusterRgb(cluster)) <= OUTLINE_LUMA_MAX)
    .reduce((total, cluster) => total + cluster.count / totalPixels, 0)

  const tinyBlackBody = selectTinyBlackBodyCluster(neutralClusters, totalPixels, darkCoverage)

  if (tinyBlackBody) {
    return tinyBlackBody
  }

  const whiteBodyCluster = selectWhiteBodyCluster(neutralClusters, totalPixels)

  if (whiteBodyCluster) {
    return whiteBodyCluster
  }

  const neutralBody = selectNeutralBodyOverDarkOutlineCluster(neutralClusters, totalPixels)

  if (neutralBody) {
    return neutralBody
  }

  const smallDarkBody = selectSmallDarkNeutralBodyCluster(neutralClusters, totalPixels)

  if (smallDarkBody) {
    return smallDarkBody
  }

  const blackBody = selectBlackBodyCluster(neutralClusters, totalPixels)

  if (blackBody) {
    return blackBody
  }

  if (darkCoverage >= NEUTRAL_DARK_BODY_COVERAGE_MIN) {
    return [...neutralClusters]
      .sort(compareDarkNeutralPriority)[0] ?? null
  }

  const lightBodyClusters = neutralClusters.filter((cluster) =>
    cluster.count / totalPixels >= NEUTRAL_LIGHT_BODY_COVERAGE_MIN &&
    colorLuma(clusterRgb(cluster)) >= NEUTRAL_LIGHT_BODY_LUMA_MIN &&
    !isLikelyHighlightCluster(cluster)
  )

  return lightBodyClusters
    .sort(compareLightNeutralPriority)[0] ?? null
}

function selectNearBlackBodyCluster(
  clusters: readonly ColorCluster[],
  totalPixels: number,
): ColorCluster | null {
  const nearBlackClusters = clusters.filter((cluster) =>
    colorLuma(clusterRgb(cluster)) <= NEUTRAL_NEAR_BLACK_BODY_LUMA_MAX
  )
  const nearBlackCoverage = readClusterCoverage(nearBlackClusters, totalPixels)

  if (nearBlackCoverage < NEUTRAL_NEAR_BLACK_BODY_STRONG_COVERAGE_MIN) {
    return null
  }

  if (hasStrongNonDarkColoredBodyCluster(clusters, totalPixels, nearBlackCoverage)) {
    return null
  }

  const darkSupportCoverage = clusters
    .filter((cluster) => colorLuma(clusterRgb(cluster)) <= NEUTRAL_TINY_BLACK_DARK_SUPPORT_LUMA_MAX)
    .reduce((total, cluster) => total + cluster.count / totalPixels, 0)

  if (
    nearBlackCoverage < NEUTRAL_BLACK_STRONG_NEAR_COVERAGE_MIN &&
    darkSupportCoverage < NEUTRAL_BLACK_STRONG_SUPPORT_COVERAGE_MIN
  ) {
    return null
  }

  return nearBlackClusters
    .sort(compareDarkNeutralPriority)[0] ?? null
}

function hasStrongNonDarkColoredBodyCluster(
  clusters: readonly ColorCluster[],
  totalPixels: number,
  nearBlackCoverage: number,
): boolean {
  return clusters.some((cluster) => {
    const coverage = cluster.count / totalPixels
    const rgb = clusterRgb(cluster)
    const lch = rgbToLch(rgb)

    return coverage >= Math.max(0.16, nearBlackCoverage * NEUTRAL_BLACK_COLORED_BODY_MARGIN) &&
      colorLuma(rgb) > OUTLINE_LUMA_MAX &&
      lch.c >= 18
  })
}

function selectBrightWarmBodyCluster(
  clusters: readonly ColorCluster[],
  totalPixels: number,
): ColorCluster | null {
  const brightWarmClusters = clusters.filter((cluster) =>
    cluster.count / totalPixels >= WARM_BRIGHT_BODY_COVERAGE_MIN &&
    isBrightWarmBodyColor(clusterRgb(cluster))
  )

  if (readClusterCoverage(brightWarmClusters, totalPixels) < WARM_BRIGHT_BODY_TOTAL_COVERAGE_MIN) {
    return null
  }

  return brightWarmClusters
    .sort(compareBrightWarmPriority)[0] ?? null
}

function selectNeutralBodyOverDarkOutlineCluster(
  neutralClusters: readonly ColorCluster[],
  totalPixels: number,
): ColorCluster | null {
  if (hasStrongBlackBodyEvidence(neutralClusters, totalPixels)) {
    return null
  }

  const nearBlackCoverage = readCoverageAtOrBelowLuma(
    neutralClusters,
    totalPixels,
    NEUTRAL_NEAR_BLACK_BODY_LUMA_MAX,
  )
  const darkCoverage = readCoverageAtOrBelowLuma(neutralClusters, totalPixels, OUTLINE_LUMA_MAX)
  const lightBody = selectLightNeutralBodyCluster(neutralClusters, totalPixels, nearBlackCoverage)

  if (lightBody) {
    return lightBody
  }

  return selectMediumNeutralBodyCluster(neutralClusters, totalPixels, {
    darkCoverage,
    nearBlackCoverage,
  })
}

function selectLightNeutralBodyCluster(
  neutralClusters: readonly ColorCluster[],
  totalPixels: number,
  nearBlackCoverage: number,
): ColorCluster | null {
  if (nearBlackCoverage >= NEUTRAL_BLACK_STRONG_NEAR_COVERAGE_MIN) {
    return null
  }

  const lightBodyClusters = neutralClusters.filter((cluster) =>
    colorLuma(clusterRgb(cluster)) >= NEUTRAL_MEDIUM_BODY_LUMA_MAX &&
    !isLikelyHighlightCluster(cluster)
  )
  const lightCoverage = readClusterCoverage(lightBodyClusters, totalPixels)

  if (lightCoverage < NEUTRAL_LIGHT_BODY_OUTLINE_COVERAGE_MIN) {
    return null
  }

  return lightBodyClusters
    .sort(compareLightNeutralPriority)[0] ?? null
}

function selectMediumNeutralBodyCluster(
  neutralClusters: readonly ColorCluster[],
  totalPixels: number,
  {
    darkCoverage,
    nearBlackCoverage,
  }: {
    darkCoverage: number
    nearBlackCoverage: number
  },
): ColorCluster | null {
  const mediumBodyClusters = neutralClusters.filter((cluster) => {
    const luma = colorLuma(clusterRgb(cluster))

    return luma >= NEUTRAL_MEDIUM_BODY_LUMA_MIN &&
      luma < NEUTRAL_MEDIUM_BODY_LUMA_MAX
  })
  const mediumCoverage = readClusterCoverage(mediumBodyClusters, totalPixels)

  if (mediumCoverage < NEUTRAL_MEDIUM_BODY_COVERAGE_MIN) {
    return null
  }

  const hasEnoughMediumBody = darkCoverage <= NEUTRAL_MEDIUM_BODY_DARK_COVERAGE_MAX ||
    (
      nearBlackCoverage <= NEUTRAL_MEDIUM_BODY_NEAR_BLACK_MAX &&
      mediumCoverage >= darkCoverage + NEUTRAL_MEDIUM_BODY_VS_DARK_MARGIN_MIN
    ) ||
    (
      darkCoverage <= 0.45 &&
      strongestNearBlackBlueBias(neutralClusters) <= NEUTRAL_MEDIUM_BODY_BLUE_BIAS_MAX
    ) ||
    (
      nearBlackCoverage <= NEUTRAL_MEDIUM_BODY_SHADOW_NEAR_BLACK_MAX &&
      mediumCoverage >= NEUTRAL_MEDIUM_BODY_SHADOW_COVERAGE_MIN &&
      strongestNearBlackBlueBias(neutralClusters) <= NEUTRAL_MEDIUM_BODY_BLUE_BIAS_MAX
    )

  if (!hasEnoughMediumBody) {
    return null
  }

  return mediumBodyClusters
    .sort(compareMediumNeutralPriority)[0] ?? null
}

function hasStrongBlackBodyEvidence(
  neutralClusters: readonly ColorCluster[],
  totalPixels: number,
): boolean {
  const nearBlackCoverage = readCoverageAtOrBelowLuma(
    neutralClusters,
    totalPixels,
    NEUTRAL_NEAR_BLACK_BODY_LUMA_MAX,
  )

  return nearBlackCoverage >= NEUTRAL_BLACK_STRONG_NEAR_COVERAGE_MIN &&
    strongestNearBlackBlueBias(neutralClusters) >= NEUTRAL_BLACK_BLUE_BIAS_MIN
}

function selectBlackBodyCluster(
  neutralClusters: readonly ColorCluster[],
  totalPixels: number,
): ColorCluster | null {
  const nearBlackClusters = neutralClusters.filter((cluster) =>
    colorLuma(clusterRgb(cluster)) <= NEUTRAL_NEAR_BLACK_BODY_LUMA_MAX
  )
  const nearBlackCoverage = nearBlackClusters
    .reduce((total, cluster) => total + cluster.count / totalPixels, 0)

  if (
    nearBlackCoverage < NEUTRAL_NEAR_BLACK_BODY_COVERAGE_MIN ||
    readDarkSupportCoverage(neutralClusters, totalPixels) < NEUTRAL_DARK_SUPPORT_COVERAGE_MIN
  ) {
    return null
  }

  return nearBlackClusters
    .sort(compareDarkNeutralPriority)[0] ?? null
}

function selectSmallDarkNeutralBodyCluster(
  neutralClusters: readonly ColorCluster[],
  totalPixels: number,
): ColorCluster | null {
  if (
    totalPixels > NEUTRAL_SMALL_DARK_BODY_PIXELS_MAX ||
    readDarkSupportCoverage(neutralClusters, totalPixels) < NEUTRAL_SMALL_DARK_SUPPORT_COVERAGE_MIN
  ) {
    return null
  }

  return neutralClusters
    .filter((cluster) =>
      colorLuma(clusterRgb(cluster)) <= NEUTRAL_SMALL_DARK_BODY_LUMA_MAX &&
      cluster.count / totalPixels >= NEUTRAL_SMALL_DARK_BODY_COVERAGE_MIN
    )
    .sort(compareMediumNeutralPriority)[0] ?? null
}

function readDarkSupportCoverage(
  pixelsOrClusters: readonly PixelSample[] | readonly ColorCluster[],
  totalPixels: number,
): number {
  return pixelsOrClusters
    .filter((entry) => colorLuma(readRgb(entry)) <= NEUTRAL_DARK_SUPPORT_LUMA_MAX)
    .reduce((total, entry) => total + readPixelCount(entry) / totalPixels, 0)
}

function readCoverageAtOrBelowLuma(
  clusters: readonly ColorCluster[],
  totalPixels: number,
  maxLuma: number,
): number {
  return clusters
    .filter((cluster) => colorLuma(clusterRgb(cluster)) <= maxLuma)
    .reduce((total, cluster) => total + cluster.count / totalPixels, 0)
}

function readClusterCoverage(clusters: readonly ColorCluster[], totalPixels: number): number {
  return clusters.reduce((total, cluster) => total + cluster.count / totalPixels, 0)
}

function strongestNearBlackBlueBias(neutralClusters: readonly ColorCluster[]): number {
  const nearBlackCluster = neutralClusters
    .filter((cluster) => colorLuma(clusterRgb(cluster)) <= NEUTRAL_NEAR_BLACK_BODY_LUMA_MAX)
    .sort(compareDarkNeutralPriority)[0]

  if (!nearBlackCluster) {
    return 0
  }

  const rgb = clusterRgb(nearBlackCluster)

  return rgb.b - rgb.r
}

function readRgb(pixelOrCluster: PixelSample | ColorCluster): RgbColor {
  return "count" in pixelOrCluster ? clusterRgb(pixelOrCluster) : pixelOrCluster.rgb
}

function readPixelCount(pixelOrCluster: PixelSample | ColorCluster): number {
  return "count" in pixelOrCluster ? pixelOrCluster.count : 1
}

function selectWhiteBodyCluster(
  neutralClusters: readonly ColorCluster[],
  totalPixels: number,
): ColorCluster | null {
  return neutralClusters
    .filter((cluster) => isWhiteBodyCluster(cluster, totalPixels))
    .sort(compareLightNeutralPriority)[0] ?? null
}

function isWhiteBodyCluster(cluster: ColorCluster, totalPixels: number): boolean {
  return cluster.count / totalPixels >= WHITE_BODY_COVERAGE_MIN &&
    isNeutralCluster(cluster) &&
    colorLuma(clusterRgb(cluster)) >= WHITE_BODY_LUMA_MIN
}

function selectTinyBlackBodyCluster(
  neutralClusters: readonly ColorCluster[],
  totalPixels: number,
  darkCoverage: number,
): ColorCluster | null {
  if (totalPixels > NEUTRAL_TINY_BLACK_SAMPLE_PIXELS_MAX) {
    return null
  }

  const darkSupportCoverage = neutralClusters
    .filter((cluster) => colorLuma(clusterRgb(cluster)) <= NEUTRAL_TINY_BLACK_DARK_SUPPORT_LUMA_MAX)
    .reduce((total, cluster) => total + cluster.count / totalPixels, 0)

  if (
    darkCoverage < NEUTRAL_TINY_BLACK_DARK_COVERAGE_MIN &&
    darkSupportCoverage < NEUTRAL_TINY_BLACK_DARK_SUPPORT_COVERAGE_MIN
  ) {
    return null
  }

  const nearBlackClusters = neutralClusters.filter((cluster) =>
    colorLuma(clusterRgb(cluster)) <= NEUTRAL_NEAR_BLACK_LUMA_MAX
  )
  const nearBlackCoverage = nearBlackClusters
    .reduce((total, cluster) => total + cluster.count / totalPixels, 0)

  if (nearBlackCoverage < NEUTRAL_TINY_BLACK_NEAR_COVERAGE_MIN) {
    return null
  }

  return nearBlackClusters
    .sort(compareDarkNeutralPriority)[0] ?? null
}

function compareDarkNeutralPriority(left: ColorCluster, right: ColorCluster): number {
  return right.count - left.count ||
    colorLuma(clusterRgb(left)) - colorLuma(clusterRgb(right))
}

function compareLightNeutralPriority(left: ColorCluster, right: ColorCluster): number {
  const leftRgb = clusterRgb(left)
  const rightRgb = clusterRgb(right)

  return colorLuma(rightRgb) - colorLuma(leftRgb) ||
    right.count - left.count
}

function compareBrightWarmPriority(left: ColorCluster, right: ColorCluster): number {
  const leftRgb = clusterRgb(left)
  const rightRgb = clusterRgb(right)

  return right.count - left.count ||
    colorLuma(rightRgb) - colorLuma(leftRgb)
}

function compareMediumNeutralPriority(left: ColorCluster, right: ColorCluster): number {
  const leftRgb = clusterRgb(left)
  const rightRgb = clusterRgb(right)
  const leftLuma = colorLuma(leftRgb)
  const rightLuma = colorLuma(rightRgb)

  return right.count * rightLuma * rightLuma * rightLuma - left.count * leftLuma * leftLuma * leftLuma ||
    rightLuma - leftLuma
}

function isNeutralCluster(cluster: ColorCluster): boolean {
  return rgbToLch(clusterRgb(cluster)).c <= NEUTRAL_BODY_CHROMA_MAX
}

function compareBodyClusterPriority(left: ColorCluster, right: ColorCluster): number {
  return bodyClusterScore(right) - bodyClusterScore(left)
}

function bodyClusterScore(cluster: ColorCluster): number {
  const rgb = clusterRgb(cluster)
  const lch = rgbToLch(rgb)
  const bodyMultiplier = isWarmBrownBodyColor(rgb, lch)
    ? WARM_BROWN_BODY_SCORE_MULTIPLIER
    : 1

  return cluster.count * (1 + Math.min(0.45, lch.c / 80)) * bodyMultiplier
}

function isColoredBodyCluster(cluster: ColorCluster, totalPixels: number): boolean {
  const rgb = clusterRgb(cluster)
  const lch = rgbToLch(rgb)

  return cluster.count / totalPixels >= COLORED_BODY_COVERAGE_MIN &&
    (lch.c >= COLORED_BODY_CHROMA_MIN || isWarmBrownBodyColor(rgb, lch)) &&
    colorLuma(rgb) < HIGHLIGHT_LUMA_MIN
}

function isWarmBrownBodyColor(
  rgb: RgbColor,
  lch: ReturnType<typeof rgbToLch>,
): boolean {
  return colorLuma(rgb) <= WARM_BROWN_BODY_LUMA_MAX &&
    lch.c >= WARM_BROWN_BODY_CHROMA_MIN &&
    lch.h >= WARM_BROWN_BODY_HUE_MIN &&
    lch.h <= WARM_BROWN_BODY_HUE_MAX
}

function isBrightWarmBodyColor(rgb: RgbColor): boolean {
  const lch = rgbToLch(rgb)

  return colorLuma(rgb) >= WARM_BRIGHT_BODY_LUMA_MIN &&
    lch.c >= WARM_BRIGHT_BODY_CHROMA_MIN &&
    lch.h >= WARM_BRIGHT_BODY_HUE_MIN &&
    lch.h <= WARM_BRIGHT_BODY_HUE_MAX
}

function isLikelyOutlineCluster(cluster: ColorCluster, totalPixels: number): boolean {
  const coverage = cluster.count / totalPixels

  return colorLuma(clusterRgb(cluster)) <= OUTLINE_LUMA_MAX && coverage <= OUTLINE_COVERAGE_MAX
}

function isLikelyHighlightCluster(cluster: ColorCluster): boolean {
  const rgb = clusterRgb(cluster)
  const lch = rgbToLch(rgb)

  return colorLuma(rgb) >= HIGHLIGHT_LUMA_MIN && lch.c <= HIGHLIGHT_CHROMA_MAX
}

function createChip(cluster: ColorCluster, totalPixels: number): PartColorSampleChip {
  const rgb = clusterRgb(cluster)

  return {
    coverage: cluster.count / totalPixels,
    hex: rgbToHex(rgb),
    pixelCount: cluster.count,
    rgb,
  }
}

function clusterRgb(cluster: ColorCluster): RgbColor {
  return {
    b: Math.round(cluster.b / cluster.count),
    g: Math.round(cluster.g / cluster.count),
    r: Math.round(cluster.r / cluster.count),
  }
}

function meanColorDistance(pixels: readonly RgbColor[], rgb: RgbColor): number {
  if (pixels.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  return pixels.reduce((sum, pixel) => sum + colorDistanceCiede2000(pixel, rgb), 0) / pixels.length
}

function classifySample({
  clusters,
  dominantCoverage,
  pixelCount,
  selected,
  variance,
}: {
  clusters: readonly ColorCluster[]
  dominantCoverage: number
  pixelCount: number
  selected: ColorCluster
  variance: number
}): PartColorSample["status"] {
  if (pixelCount < MIN_SAMPLE_PIXELS || variance > 14) {
    return "weak-classifiable"
  }

  if (dominantCoverage < MIN_SELECTED_COVERAGE) {
    return hasNeutralBodySupportForLowCoverageSelection(clusters, selected, pixelCount)
      ? "review"
      : "weak-classifiable"
  }

  if (
    dominantCoverage < 0.24 ||
    variance > 8 ||
    hasCompetingBodyCluster(clusters, selected, pixelCount)
  ) {
    return "review"
  }

  return "stable"
}

function hasNeutralBodySupportForLowCoverageSelection(
  clusters: readonly ColorCluster[],
  selected: ColorCluster,
  totalPixels: number,
): boolean {
  if (
    totalPixels < NEUTRAL_LOW_COVERAGE_REVIEW_PIXELS_MIN ||
    selected.count / totalPixels < MIN_SUPPORTED_SELECTED_COVERAGE ||
    !isNeutralCluster(selected)
  ) {
    return false
  }

  const supportCoverage = clusters
    .filter((cluster) =>
      isNeutralCluster(cluster) &&
      colorLuma(clusterRgb(cluster)) >= NEUTRAL_MEDIUM_BODY_LUMA_MIN &&
      !isLikelyOutlineCluster(cluster, totalPixels) &&
      !isLikelyHighlightCluster(cluster)
    )
    .reduce((total, cluster) => total + cluster.count / totalPixels, 0)

  return supportCoverage >= NEUTRAL_LOW_COVERAGE_REVIEW_SUPPORT_MIN
}

function hasCompetingBodyCluster(
  clusters: readonly ColorCluster[],
  selected: ColorCluster,
  totalPixels: number,
): boolean {
  const selectedRgb = clusterRgb(selected)

  return clusters.some((cluster) => {
    if (cluster === selected || cluster.count / totalPixels < 0.18) {
      return false
    }

    if (isLikelyOutlineCluster(cluster, totalPixels) || isLikelyHighlightCluster(cluster)) {
      return false
    }

    return colorDistanceCiede2000(clusterRgb(cluster), selectedRgb) > 7
  })
}

function sampleStability(pixelCount: number, dominantCoverage: number, variance: number): number {
  const pixelConfidence = Math.min(1, pixelCount / 60)
  const coverageConfidence = Math.max(0, Math.min(1, (dominantCoverage - MIN_SELECTED_COVERAGE) / 0.35))
  const varianceConfidence = Math.max(0, Math.min(1, 1 - variance / 14))

  return Math.max(0, Math.min(1, pixelConfidence * 0.25 + coverageConfidence * 0.45 + varianceConfidence * 0.3))
}

function createEmptyRejectionCounts(): PartColorSampleRejectionCounts {
  return {
    background: 0,
    border: 0,
    edge: 0,
    excludedRegion: 0,
    lowAlpha: 0,
    outOfPage: 0,
  }
}

function countRejection(counts: PartColorSampleRejectionCounts, decision: number): void {
  if (decision === PART_COLOR_SAMPLE_DECISION.background) {
    counts.background += 1
  } else if (decision === PART_COLOR_SAMPLE_DECISION.border) {
    counts.border += 1
  } else if (decision === PART_COLOR_SAMPLE_DECISION.edge) {
    counts.edge = (counts.edge ?? 0) + 1
  } else if (decision === PART_COLOR_SAMPLE_DECISION.excludedRegion) {
    counts.excludedRegion += 1
  } else if (decision === PART_COLOR_SAMPLE_DECISION.lowAlpha) {
    counts.lowAlpha += 1
  } else if (decision === PART_COLOR_SAMPLE_DECISION.outOfPage) {
    counts.outOfPage += 1
  }
}

function rejectedPixelCount(counts: PartColorSampleRejectionCounts): number {
  return counts.background + counts.border + (counts.edge ?? 0) + counts.excludedRegion + counts.lowAlpha + counts.outOfPage
}

function colorLuma(rgb: RgbColor): number {
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
}
