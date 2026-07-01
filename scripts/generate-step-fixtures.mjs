#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { stepFixtureManifest } from "../src/features/steps/fixtures/step-fixture-manifest.ts"
import { syntheticStepFixtureSources } from "../tests/fixtures/steps/sources/step-fixture-sources.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceById = new Map(syntheticStepFixtureSources.map((source) => [source.id, source]))

await mkdir(path.join(root, "tests/fixtures/steps/generated"), { recursive: true })
await mkdir(path.join(root, "tests/fixtures/steps/expected"), { recursive: true })

for (const manifestEntry of stepFixtureManifest) {
  const source = sourceById.get(manifestEntry.id)

  if (!source) {
    throw new Error(`Missing synthetic fixture source for ${manifestEntry.id}`)
  }

  const baseline = createBaseline(source, manifestEntry)
  const pdf = createPdf(source)

  await writeFile(path.join(root, manifestEntry.generatedPdfPath), pdf)
  await writeFile(
    path.join(root, manifestEntry.expectedPath),
    `${JSON.stringify(baseline, null, 2)}\n`,
  )
}

console.log(`Generated ${stepFixtureManifest.length} step fixtures.`)

function createBaseline(source, manifestEntry) {
  const expectedCallouts = []
  const falsePositiveTraps = []

  source.pages.forEach((page, pageIndex) => {
    const scale = source.renderWidth / page.width
    const pageNumber = pageIndex + 1

    page.callouts.forEach((callout, calloutIndex) => {
      const expectedMultiplier = callout.expectedMultiplier ?? 1
      const partItems = callout.partRows.map((partRow, partIndex) => ({
        id: partRow.id,
        indexOnCallout: partIndex,
        quantity: {
          text: partRow.quantityText,
          value: partRow.quantityValue,
        },
        quantityLabelRegion: scaleRegion(partRow.quantityLabelRegion, scale),
        partRegion: scaleRegion(partRow.partRegion, scale),
        ldrawPartId: partRow.ldrawPartId,
        imageSignatureId: partRow.imageSignatureId,
      }))

      expectedCallouts.push({
        id: callout.id,
        pageNumber,
        indexOnPage: calloutIndex,
        sourceRegion: scaleRegion(callout.region, scale),
        cropRegion: scaleRegion(padRegion(callout.region, 8, page), scale),
        baggable: callout.baggable ?? partItems.length > 0,
        expectedMultiplier,
        partItems,
      })
    })

    for (const trap of page.falsePositiveTraps ?? []) {
      falsePositiveTraps.push({
        id: trap.id,
        pageNumber,
        region: scaleRegion(trap.region, scale),
        label: trap.label,
      })
    }
  })

  return {
    fixtureId: source.id,
    source: {
      sourceKind: manifestEntry.sourceKind,
      sourceSpecPath: manifestEntry.sourceSpecPath,
      generatedPdfPath: manifestEntry.generatedPdfPath,
      expectedPath: manifestEntry.expectedPath,
      purpose: manifestEntry.purpose,
      browserE2eCandidate: manifestEntry.browserE2eCandidate,
    },
    renderWidth: source.renderWidth,
    pageCount: source.pages.length,
    expectedScannedPageNumbers: source.pages.map((_page, index) => index + 1),
    expectedCallouts,
    falsePositiveTraps,
    expectedBaggableRowCount: expectedCallouts.reduce(
      (total, callout) =>
        callout.baggable
          ? total +
            callout.partItems.reduce(
              (partTotal, partItem) => partTotal + partItem.quantity.value * callout.expectedMultiplier,
              0,
            )
          : total,
      0,
    ),
    expectedZeroPartCalloutCount: expectedCallouts.filter((callout) => callout.partItems.length === 0)
      .length,
  }
}

function createPdf(source) {
  const pageContents = source.pages.map((page, pageIndex) => ({
    width: page.width,
    height: page.height,
    content: buildPageContent(page, pageIndex + 1),
  }))

  return writePdf(pageContents)
}

function buildPageContent(page, pageNumber) {
  const commands = []

  commands.push(rect(0, 0, page.width, page.height, "#ffffff", "#ffffff", page.height))
  commands.push(text(42, 44, `${page.title} / page ${pageNumber}`, 13, page.height))
  commands.push(text(42, 66, "Synthetic Bag It fixture. Not a private manual.", 9, page.height))

  for (const trap of page.falsePositiveTraps ?? []) {
    commands.push(rect(trap.region.x, trap.region.y, trap.region.width, trap.region.height, trap.fill, trap.stroke, page.height))
    commands.push(text(trap.region.x + 10, trap.region.y + 22, trap.label, 9, page.height))
  }

  for (const callout of page.callouts) {
    commands.push(rect(callout.region.x, callout.region.y, callout.region.width, callout.region.height, callout.fill, callout.stroke, page.height))

    if (callout.label) {
      commands.push(text(callout.region.x + 12, callout.region.y + 22, callout.label, 9, page.height))
    }

    for (const partRow of callout.partRows) {
      commands.push(ldrawPart(partRow.partRegion, partRow.color.hex, partRow.ldrawPartId, page.height))
      commands.push(text(partRow.quantityLabelRegion.x, partRow.quantityLabelRegion.y + 14, partRow.quantityText, 12, page.height))
    }
  }

  return `${commands.join("\n")}\n`
}

function writePdf(pages) {
  const objectTexts = new Map()
  const pageObjectIds = []

  objectTexts.set(1, "<< /Type /Catalog /Pages 2 0 R >>")
  objectTexts.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

  pages.forEach((page, index) => {
    const contentObjectId = 4 + index * 2
    const pageObjectId = contentObjectId + 1

    pageObjectIds.push(pageObjectId)
    objectTexts.set(contentObjectId, stream(page.content))
    objectTexts.set(
      pageObjectId,
      [
        "<<",
        "/Type /Page",
        "/Parent 2 0 R",
        `/MediaBox [0 0 ${number(page.width)} ${number(page.height)}]`,
        "/Resources << /Font << /F1 3 0 R >> >>",
        `/Contents ${contentObjectId} 0 R`,
        ">>",
      ].join("\n"),
    )
  })

  objectTexts.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  )

  const maxObjectId = Math.max(...objectTexts.keys())
  let body = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n"
  const offsets = [0]

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    const objectText = objectTexts.get(objectId)

    if (!objectText) {
      throw new Error(`Missing PDF object ${objectId}`)
    }

    offsets[objectId] = Buffer.byteLength(body, "binary")
    body += `${objectId} 0 obj\n${objectText}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(body, "binary")
  body += `xref\n0 ${maxObjectId + 1}\n`
  body += "0000000000 65535 f \n"

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    body += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`
  }

  body += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(body, "binary")
}

function stream(content) {
  return `<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}endstream`
}

function rect(x, y, width, height, fill, stroke, pageHeight) {
  const [fr, fg, fb] = pdfRgb(fill)
  const [sr, sg, sb] = pdfRgb(stroke)
  const pdfY = pageHeight - y - height

  return [
    "q",
    `${fr} ${fg} ${fb} rg`,
    `${sr} ${sg} ${sb} RG`,
    "1.4 w",
    `${number(x)} ${number(pdfY)} ${number(width)} ${number(height)} re B`,
    "Q",
  ].join("\n")
}

function text(x, y, value, size, pageHeight) {
  const pdfY = pageHeight - y

  return [
    "q",
    "0 0 0 rg",
    "BT",
    `/F1 ${number(size)} Tf`,
    `${number(x)} ${number(pdfY)} Td`,
    `(${escapePdfText(value)}) Tj`,
    "ET",
    "Q",
  ].join("\n")
}

function ldrawPart(region, fill, partId, pageHeight) {
  const polygons = parseLDrawPolygons(partId)
  const projectedPolygons = polygons.map((polygon) =>
    polygon.map((vertex) => projectLDrawVertex(vertex)),
  )
  const bounds = projectedPolygons.flat().reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  )
  const scale = Math.min(
    region.width / Math.max(1, bounds.maxX - bounds.minX),
    region.height / Math.max(1, bounds.maxY - bounds.minY),
  )
  const offsetX =
    region.x + (region.width - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale
  const offsetY =
    region.y + (region.height - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale

  return polygons
    .map((polygon) => ({
      points: polygon.map((vertex) => {
        const point = projectLDrawVertex(vertex)

        return {
          x: offsetX + point.x * scale,
          y: offsetY + point.y * scale,
        }
      }),
      depth: polygon.reduce((total, vertex) => total + vertex.x + vertex.y + vertex.z, 0),
      fill: shadeHex(fill, surfaceShade(polygon)),
    }))
    .sort((a, b) => a.depth - b.depth)
    .map((polygon) => pdfPolygon(polygon.points, polygon.fill, "#333333", pageHeight))
    .join("\n")
}

function parseLDrawPolygons(partId) {
  return getLDrawPartDefinition(partId).map((line) => {
    const values = line.trim().split(/\s+/)
    const lineType = values[0]
    const pointValues = values.slice(2).map(Number)

    if (lineType === "3") {
      return [
        vertex(pointValues[0], pointValues[1], pointValues[2]),
        vertex(pointValues[3], pointValues[4], pointValues[5]),
        vertex(pointValues[6], pointValues[7], pointValues[8]),
      ]
    }

    if (lineType === "4") {
      return [
        vertex(pointValues[0], pointValues[1], pointValues[2]),
        vertex(pointValues[3], pointValues[4], pointValues[5]),
        vertex(pointValues[6], pointValues[7], pointValues[8]),
        vertex(pointValues[9], pointValues[10], pointValues[11]),
      ]
    }

    throw new Error(`Unsupported LDraw line type ${lineType} in ${partId}`)
  })
}

function getLDrawPartDefinition(partId) {
  if (partId === "3023-plate-1x2") {
    return createRectangularPartLDraw({ width: 40, depth: 80, height: 8, studCount: 2 })
  }

  if (partId === "3069b-tile-1x2") {
    return createRectangularPartLDraw({ width: 40, depth: 80, height: 6, studCount: 0 })
  }

  if (partId === "3710-plate-1x4") {
    return createRectangularPartLDraw({ width: 40, depth: 160, height: 8, studCount: 4 })
  }

  if (partId === "6141-round-plate-1x1") {
    return [
      ...cylinderLDraw({ x: 0, z: 0, radius: 20, bottomY: 0, topY: -8 }),
      ...cylinderLDraw({ x: 0, z: 0, radius: 12, bottomY: -8, topY: -12 }),
    ]
  }

  throw new Error(`Unknown synthetic LDraw part ${partId}`)
}

function createRectangularPartLDraw({ width, depth, height, studCount }) {
  const lines = boxLDraw({ width, depth, height })

  for (let index = 0; index < studCount; index += 1) {
    const z = ((index + 0.5) / studCount - 0.5) * depth
    lines.push(...cylinderLDraw({ x: 0, z, radius: 10, bottomY: -height, topY: -height - 4 }))
  }

  return lines
}

function boxLDraw({ width, depth, height }) {
  const x = width / 2
  const z = depth / 2
  const topY = -height
  const bottomY = 0

  return [
    quad(-x, bottomY, -z, x, bottomY, -z, x, topY, -z, -x, topY, -z),
    quad(x, bottomY, -z, x, bottomY, z, x, topY, z, x, topY, -z),
    quad(x, bottomY, z, -x, bottomY, z, -x, topY, z, x, topY, z),
    quad(-x, bottomY, z, -x, bottomY, -z, -x, topY, -z, -x, topY, z),
    quad(-x, topY, -z, x, topY, -z, x, topY, z, -x, topY, z),
  ]
}

function cylinderLDraw({ x, z, radius, bottomY, topY }) {
  const segments = 12
  const lines = []

  for (let index = 0; index < segments; index += 1) {
    const startAngle = (Math.PI * 2 * index) / segments
    const endAngle = (Math.PI * 2 * (index + 1)) / segments
    const start = {
      x: x + Math.cos(startAngle) * radius,
      z: z + Math.sin(startAngle) * radius,
    }
    const end = {
      x: x + Math.cos(endAngle) * radius,
      z: z + Math.sin(endAngle) * radius,
    }

    lines.push(quad(start.x, bottomY, start.z, end.x, bottomY, end.z, end.x, topY, end.z, start.x, topY, start.z))
    lines.push(triangle(x, topY, z, start.x, topY, start.z, end.x, topY, end.z))
  }

  return lines
}

function projectLDrawVertex({ x, y, z }) {
  return {
    x: (x - z) * 0.62,
    y: (x + z) * 0.28 + y * 0.9,
  }
}

function surfaceShade(polygon) {
  const normal = polygonNormal(polygon)
  const topLight = Math.abs(normal.y) * 0.28
  const sideLight = normal.x * -0.05 + normal.z * 0.08

  return clamp(0.82 + topLight + sideLight, 0.64, 1.16)
}

function polygonNormal(polygon) {
  const a = polygon[0]
  const b = polygon[1]
  const c = polygon[2]
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }
  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  }
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1

  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  }
}

function pdfPolygon(points, fill, stroke, pageHeight) {
  const [fr, fg, fb] = pdfRgb(fill)
  const [sr, sg, sb] = pdfRgb(stroke)
  const [firstPoint, ...nextPoints] = points
  const commands = [
    "q",
    `${fr} ${fg} ${fb} rg`,
    `${sr} ${sg} ${sb} RG`,
    "0.8 w",
    `${number(firstPoint.x)} ${number(pageHeight - firstPoint.y)} m`,
    ...nextPoints.map((point) => `${number(point.x)} ${number(pageHeight - point.y)} l`),
    "h B",
    "Q",
  ]

  return commands.join("\n")
}

function shadeHex(hex, shade) {
  const normalized = hex.replace("#", "")
  const channels = [0, 2, 4].map((offset) =>
    Math.round(
      clamp(Number.parseInt(normalized.slice(offset, offset + 2), 16) * shade, 0, 255),
    ),
  )

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function triangle(x1, y1, z1, x2, y2, z2, x3, y3, z3) {
  return `3 16 ${numbers([x1, y1, z1, x2, y2, z2, x3, y3, z3])}`
}

function quad(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4) {
  return `4 16 ${numbers([x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4])}`
}

function vertex(x, y, z) {
  return { x, y, z }
}

function numbers(values) {
  return values.map((value) => number(value)).join(" ")
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function padRegion(region, padding, page) {
  const x = Math.max(0, region.x - padding)
  const y = Math.max(0, region.y - padding)
  const right = Math.min(page.width, region.x + region.width + padding)
  const bottom = Math.min(page.height, region.y + region.height + padding)

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  }
}

function scaleRegion(region, scale) {
  return {
    x: Math.round(region.x * scale),
    y: Math.round(region.y * scale),
    width: Math.round(region.width * scale),
    height: Math.round(region.height * scale),
  }
}

function pdfRgb(hex) {
  const normalized = hex.replace("#", "")

  return [0, 2, 4].map((offset) =>
    number(Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255),
  )
}

function escapePdfText(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
}

function number(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
}
