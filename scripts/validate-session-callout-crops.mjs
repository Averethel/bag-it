import { readFileSync } from "node:fs"
import { inflateSync } from "node:zlib"
import {
  debugDetectStepCalloutPartItemRegionsFromImageData,
  debugReadStepCalloutQuantityFromImageData,
  detectStepCalloutPartItemRegionsFromImageData,
} from "../src/features/bagging/step-callout-detection.ts"

const sessionPaths = process.argv.slice(2)
const includeDetails = process.env.BAG_IT_CALLOUT_DETAILS === "1"
const includeLegacyDifferences = process.env.BAG_IT_CALLOUT_LEGACY === "1"
const includeReadAttempts = process.env.BAG_IT_CALLOUT_READ_ATTEMPTS === "1"
const includeVerboseDetails = process.env.BAG_IT_CALLOUT_VERBOSE === "1"
const showAllDetails = process.env.BAG_IT_CALLOUT_SHOW_ALL === "1"
const detailSteps = new Set(
  (process.env.BAG_IT_CALLOUT_STEPS ?? "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite),
)

if (sessionPaths.length === 0) {
  console.error("Usage: node --import tsx scripts/validate-session-callout-crops.mjs <session.bagit.json> [...]")
  process.exit(2)
}

let hasMismatch = false

for (const sessionPath of sessionPaths) {
  const session = JSON.parse(readFileSync(sessionPath, "utf8"))
  const expectedQuantity = session.analysis.partsListResult.normalization.totalQuantity
  const callouts = session.analysis.stepCalloutResult.callouts
  const details = callouts.map((callout) => {
    const imageData = decodePngDataUrl(callout.crop.dataUrl)
    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)
    const shouldIncludeDetail = includeDetails && (detailSteps.size === 0 || detailSteps.has(callout.stepIndex))
    const debug = shouldIncludeDetail ? debugDetectStepCalloutPartItemRegionsFromImageData(imageData) : null
    const quantities = items.map((item) => item.quantity.value ?? 0)

    return {
      anchorCandidates: shouldIncludeDetail ? debug?.anchorCandidates : undefined,
      anchors: shouldIncludeDetail ? debug?.anchors : undefined,
      components: shouldIncludeDetail && includeVerboseDetails ? debug?.components.map(compactComponent) : undefined,
      likelyComponents: shouldIncludeDetail && includeVerboseDetails ? debug?.likelyComponents.map(compactComponent) : undefined,
      readAttempts: shouldIncludeDetail && includeReadAttempts
        ? createReadAttempts(imageData, debug?.likelyComponents ?? [])
        : undefined,
      items: shouldIncludeDetail
        ? items.map((item) => ({
          confidence: Number(item.confidence.toFixed(3)),
          itemRegion: item.itemRegion,
          partRegion: item.partRegion,
          quantity: item.quantity.value,
          quantityConfidence: Number(item.quantity.confidence.toFixed(3)),
          quantityRegion: item.quantityRegion,
          quantityText: item.quantity.text,
        }))
        : undefined,
      newItems: items.length,
      newQuantity: quantities.reduce((sum, quantity) => sum + quantity, 0),
      oldItems: callout.partItems.length,
      oldQuantity: callout.partItems.reduce((sum, item) => sum + (item.quantity.value ?? 0), 0),
      quantities,
      step: callout.stepIndex,
    }
  })
  const itemCount = details.reduce((sum, detail) => sum + detail.newItems, 0)
  const detectedQuantity = details.reduce(
    (sum, detail) => sum + detail.quantities.reduce((quantitySum, quantity) => quantitySum + quantity, 0),
    0,
  )
  const missingQuantityLabels = details.reduce(
    (sum, detail) => sum + detail.quantities.filter((quantity) => quantity <= 0).length,
    0,
  )
  const invalidDetails = details.filter((detail) =>
    detail.quantities.some((quantity) => quantity <= 0)
  )
  const legacyDifferences = details.filter((detail) =>
    detail.newItems !== detail.oldItems ||
    detail.newQuantity !== detail.oldQuantity
  )
  const suspicious = includeDetails && detailSteps.size > 0
    ? details.filter((detail) => detailSteps.has(detail.step))
    : showAllDetails
    ? details
    : invalidDetails
  const report = {
    callouts: details.length,
    delta: detectedQuantity - expectedQuantity,
    detectedQuantity,
    expectedQuantity,
    itemCount,
    legacyDifferenceCount: legacyDifferences.length,
    legacyDifferences: includeLegacyDifferences ? legacyDifferences.slice(0, 50) : undefined,
    manual: session.manual.fileName,
    missingQuantityLabels,
    suspicious: suspicious.slice(0, 50),
  }

  console.log(JSON.stringify(report, null, 2))
  hasMismatch = hasMismatch ||
    detectedQuantity !== expectedQuantity ||
    missingQuantityLabels > 0 ||
    invalidDetails.length > 0
}

process.exitCode = hasMismatch ? 1 : 0

function createReadAttempts(imageData, components) {
  const attempts = []
  const medianHeight = median(components.map((component) => component.height)) ?? 10
  const lineTolerance = Math.max(5, Math.round(medianHeight * 0.85))
  const maxComponentGap = Math.max(7, Math.round(medianHeight * 1.35))
  const lines = []

  for (const component of [...components].sort((left, right) =>
    getRegionCenterY(left) - getRegionCenterY(right) || left.x - right.x
  )) {
    const line = lines.find((candidateLine) =>
      Math.abs(getRegionCenterY(candidateLine[0] ?? component) - getRegionCenterY(component)) <= lineTolerance
    )
    if (line) {
      line.push(component)
    } else {
      lines.push([component])
    }
  }

  for (const line of lines) {
    const sortedLine = [...line].sort((left, right) => left.x - right.x || left.y - right.y)
    for (let startIndex = 0; startIndex < sortedLine.length; startIndex += 1) {
      const group = []
      for (let index = startIndex; index < sortedLine.length && group.length < 4; index += 1) {
        const component = sortedLine[index]
        const previous = group.at(-1)
        if (!component) {
          continue
        }
        if (previous && component.x - (previous.x + previous.width) > maxComponentGap) {
          break
        }
        group.push(component)
        const region = unionRegions(group)
        if (!region) {
          continue
        }
        attempts.push({
          componentCount: group.length,
          quantity: debugReadStepCalloutQuantityFromImageData(imageData, expandRegion(region, imageData, 2)),
          region,
        })
      }
    }
  }

  return attempts
}

function compactComponent({ count, height, width, x, y }) {
  return { count, height, width, x, y }
}

function getRegionCenterY(region) {
  return region.y + region.height / 2
}

function unionRegions(regions) {
  if (regions.length === 0) {
    return null
  }

  const minX = Math.min(...regions.map((region) => region.x))
  const minY = Math.min(...regions.map((region) => region.y))
  const maxX = Math.max(...regions.map((region) => region.x + region.width))
  const maxY = Math.max(...regions.map((region) => region.y + region.height))

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  }
}

function expandRegion(region, imageData, padding) {
  const x = Math.max(0, Math.floor(region.x - padding))
  const y = Math.max(0, Math.floor(region.y - padding))
  const right = Math.min(imageData.width, Math.ceil(region.x + region.width + padding))
  const bottom = Math.min(imageData.height, Math.ceil(region.y + region.height + padding))

  return {
    height: Math.max(1, bottom - y),
    width: Math.max(1, right - x),
    x,
    y,
  }
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (sorted.length === 0) {
    return null
  }

  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? null
}

function decodePngDataUrl(dataUrl) {
  const commaIndex = dataUrl.indexOf(",")
  const bytes = Buffer.from(dataUrl.slice(commaIndex + 1), "base64")
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const imageChunks = []

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    offset += 4
    const type = bytes.toString("ascii", offset, offset + 4)
    offset += 4
    const data = bytes.subarray(offset, offset + length)
    offset += length + 4

    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === "IDAT") {
      imageChunks.push(data)
    } else if (type === "IEND") {
      break
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth ${bitDepth}`)
  }

  const channels = getPngChannelCount(colorType)
  const inflated = inflateSync(Buffer.concat(imageChunks))
  const stride = width * channels
  const rgba = new Uint8ClampedArray(width * height * 4)
  let sourceOffset = 0
  let previousRow = new Uint8Array(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1
    const row = new Uint8Array(stride)

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset]
      sourceOffset += 1
      const left = x >= channels ? row[x - channels] : 0
      const up = previousRow[x] ?? 0
      const upLeft = x >= channels ? previousRow[x - channels] ?? 0 : 0
      row[x] = (raw + getPngFilterValue(filter, left, up, upLeft)) & 255
    }

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * channels
      const targetIndex = (y * width + x) * 4
      if (colorType === 6) {
        rgba[targetIndex] = row[sourceIndex]
        rgba[targetIndex + 1] = row[sourceIndex + 1]
        rgba[targetIndex + 2] = row[sourceIndex + 2]
        rgba[targetIndex + 3] = row[sourceIndex + 3]
      } else if (colorType === 2) {
        rgba[targetIndex] = row[sourceIndex]
        rgba[targetIndex + 1] = row[sourceIndex + 1]
        rgba[targetIndex + 2] = row[sourceIndex + 2]
        rgba[targetIndex + 3] = 255
      } else if (colorType === 0) {
        rgba[targetIndex] = row[sourceIndex]
        rgba[targetIndex + 1] = row[sourceIndex]
        rgba[targetIndex + 2] = row[sourceIndex]
        rgba[targetIndex + 3] = 255
      } else {
        rgba[targetIndex] = row[sourceIndex]
        rgba[targetIndex + 1] = row[sourceIndex]
        rgba[targetIndex + 2] = row[sourceIndex]
        rgba[targetIndex + 3] = row[sourceIndex + 1]
      }
    }

    previousRow = row
  }

  return { data: rgba, height, width }
}

function getPngChannelCount(colorType) {
  if (colorType === 6) {
    return 4
  }
  if (colorType === 2) {
    return 3
  }
  if (colorType === 0) {
    return 1
  }
  if (colorType === 4) {
    return 2
  }

  throw new Error(`Unsupported PNG color type ${colorType}`)
}

function getPngFilterValue(filter, left, up, upLeft) {
  if (filter === 0) {
    return 0
  }
  if (filter === 1) {
    return left
  }
  if (filter === 2) {
    return up
  }
  if (filter === 3) {
    return Math.floor((left + up) / 2)
  }

  return paeth(left, up, upLeft)
}

function paeth(left, up, upLeft) {
  const prediction = left + up - upLeft
  const leftDistance = Math.abs(prediction - left)
  const upDistance = Math.abs(prediction - up)
  const upLeftDistance = Math.abs(prediction - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }

  return upDistance <= upLeftDistance ? up : upLeft
}
