const DEFAULT_MASK_OPAQUE_RATIO = 0.85
const DEFAULT_MASK_CELL_COVERAGE = 0.7
const MASK_GRID_SIZE = 8
const MASK_CELL_MIN_OPAQUE = 2

export const DEFAULT_MASK_CONTENT_OPTIONS = {
  maskCellCoverage: DEFAULT_MASK_CELL_COVERAGE,
  maskOpaqueRatio: DEFAULT_MASK_OPAQUE_RATIO,
}

export function comparePartMaskContent(expected, actual, options = DEFAULT_MASK_CONTENT_OPTIONS) {
  const referenceRegion = expected.partImage?.region
  const expectedStats = readMaskStats(expected, referenceRegion)
  const actualStats = readMaskStats(actual, referenceRegion)

  if (!referenceRegion || !expectedStats || !actualStats || expectedStats.opaquePixelCount === 0) {
    return {
      actualOpaquePixelCount: actualStats?.opaquePixelCount ?? 0,
      cellCoverage: 1,
      expectedOpaquePixelCount: expectedStats?.opaquePixelCount ?? 0,
      failures: [],
      opaqueRatio: 1,
      passed: true,
    }
  }

  const opaqueRatio = actualStats.opaquePixelCount / expectedStats.opaquePixelCount
  const cellCoverage = readCellCoverage(expectedStats.cells, actualStats.cells)
  const failures = []

  if (opaqueRatio < options.maskOpaqueRatio) {
    failures.push("opaque-ratio")
  }

  if (cellCoverage < options.maskCellCoverage) {
    failures.push("cell-coverage")
  }

  return {
    actualOpaquePixelCount: actualStats.opaquePixelCount,
    cellCoverage,
    expectedOpaquePixelCount: expectedStats.opaquePixelCount,
    failures,
    opaqueRatio,
    passed: failures.length === 0,
  }
}

export function formatMaskContentScore(score) {
  return [
    `opaque=${score.actualOpaquePixelCount}/${score.expectedOpaquePixelCount}`,
    `opaqueRatio=${score.opaqueRatio.toFixed(3)}`,
    `cellCoverage=${score.cellCoverage.toFixed(3)}`,
    `failures=${score.failures.join(",") || "none"}`,
  ].join(" ")
}

function readMaskStats(partItem, referenceRegion) {
  const partImage = partItem.partImage

  if (!partImage?.alphaMask || !partImage.region || !referenceRegion) {
    return null
  }

  const cells = Array.from({ length: MASK_GRID_SIZE * MASK_GRID_SIZE }, () => 0)
  let opaquePixelCount = 0

  for (let y = referenceRegion.y; y < referenceRegion.y + referenceRegion.height; y += 1) {
    for (let x = referenceRegion.x; x < referenceRegion.x + referenceRegion.width; x += 1) {
      if (readMaskAlphaAtPagePoint(partImage, x, y) <= 0) {
        continue
      }

      opaquePixelCount += 1
      cells[readCellIndex(referenceRegion, x, y)] += 1
    }
  }

  return { cells, opaquePixelCount }
}

function readCellCoverage(expectedCells, actualCells) {
  let expectedOccupiedCells = 0
  let preservedCells = 0

  for (let index = 0; index < expectedCells.length; index += 1) {
    if (expectedCells[index] < MASK_CELL_MIN_OPAQUE) {
      continue
    }

    expectedOccupiedCells += 1

    if ((actualCells[index] ?? 0) > 0) {
      preservedCells += 1
    }
  }

  return expectedOccupiedCells > 0 ? preservedCells / expectedOccupiedCells : 1
}

function readCellIndex(region, x, y) {
  const cellX = Math.min(
    MASK_GRID_SIZE - 1,
    Math.max(0, Math.floor(((x - region.x) * MASK_GRID_SIZE) / Math.max(1, region.width))),
  )
  const cellY = Math.min(
    MASK_GRID_SIZE - 1,
    Math.max(0, Math.floor(((y - region.y) * MASK_GRID_SIZE) / Math.max(1, region.height))),
  )

  return cellY * MASK_GRID_SIZE + cellX
}

function readMaskAlphaAtPagePoint(partImage, pageX, pageY) {
  const maskX = pageX - partImage.region.x
  const maskY = pageY - partImage.region.y

  if (
    maskX < 0 ||
    maskY < 0 ||
    maskX >= partImage.alphaMask.width ||
    maskY >= partImage.alphaMask.height
  ) {
    return 0
  }

  return readMaskValue(partImage.alphaMask.data, maskY * partImage.alphaMask.width + maskX)
}

function readMaskValue(data, index) {
  return typeof data?.[index] === "number" ? data[index] : 0
}
