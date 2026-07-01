import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_SOURCE_DIR = path.join(
  ROOT_DIR,
  "packages/callout-parts/src/__tests__/fixtures/callout-parts/sessions",
)
const DEFAULT_STEP_MANIFEST_PATH = path.join(
  ROOT_DIR,
  "packages/step-callouts/src/__tests__/fixtures/callouts/manifest.json",
)
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, "tests/e2e/fixtures/bag-analysis")

export const BAG_ANALYSIS_FIXTURE_SCHEMA_VERSION = 2

export function splitBagAnalysisSession(session, {
  caseId,
  sourceManifestCase = {},
} = {}) {
  if (!caseId) {
    throw new Error("caseId is required")
  }

  if (!session?.manual || !session?.metadata) {
    throw new Error(`${caseId}: source session is missing manual bytes or metadata`)
  }

  const result = session.stepDetectionResult

  if (!result || !Array.isArray(result.callouts)) {
    throw new Error(`${caseId}: source session is missing stepDetectionResult.callouts`)
  }

  const expectedPartRows = result.callouts.reduce(
    (total, callout) => total + readPartItems(callout).length,
    0,
  )
  const expectedColorRows = result.callouts.reduce(
    (total, callout) => total + readPartItems(callout).filter(hasDetectedColor).length,
    0,
  )

  return {
    manifestCase: {
      id: caseId,
      sourceKind: sourceManifestCase.sourceKind ?? "user-approved-manual",
      approvalStatus: sourceManifestCase.approvalStatus ?? "approved",
      regressionType: sourceManifestCase.regressionType ?? "callout-parts",
      expectedCallouts: result.callouts.length,
      expectedPartRows,
      expectedColorRows,
      expectedPageCounts: sourceManifestCase.expectedPageCounts ?? null,
      pages: sourceManifestCase.pages ?? null,
      contextPages: sourceManifestCase.contextPages ?? null,
      inputSessionPath: `${caseId}/input.bagit-session.json`,
      calloutsPath: `${caseId}/callouts.json`,
      partsPath: `${caseId}/parts.json`,
    },
    inputSession: createMinimalInputSession(session),
    calloutsFixture: createCalloutsFixture(caseId, result),
    partsFixture: createPartsFixture(caseId, result),
  }
}

export function createMinimalInputSession(session) {
  return {
    kind: session.kind,
    version: session.version,
    savedAt: session.savedAt,
    manual: session.manual,
    metadata: session.metadata,
  }
}

export function createCalloutsFixture(caseId, result) {
  return {
    schemaVersion: BAG_ANALYSIS_FIXTURE_SCHEMA_VERSION,
    caseId,
    callouts: result.callouts.map((callout, index) => ({
      ordinal: index,
      pageNumber: callout.pageNumber,
      crop: {
        region: normalizeRegion(callout.crop?.region, `${caseId} callout ${index} crop.region`),
      },
    })),
  }
}

export function createPartsFixture(caseId, result) {
  return {
    schemaVersion: BAG_ANALYSIS_FIXTURE_SCHEMA_VERSION,
    caseId,
    callouts: result.callouts.map((callout, calloutIndex) => ({
      ordinal: calloutIndex,
      pageNumber: callout.pageNumber,
      parts: readPartItems(callout).map((part, partIndex) => ({
        ordinal: partIndex,
        quantity: {
          text: normalizeQuantityText(part.quantity?.text),
          value: Number.isFinite(part.quantity?.value) ? part.quantity.value : null,
        },
        color: normalizeDetectedColor(
          part.detectedColor,
          `${caseId} callout ${calloutIndex} part ${partIndex} detectedColor`,
        ),
        partRegion: normalizeRegion(
          part.partImage?.region ?? part.partCrop?.region ?? part.partRegion,
          `${caseId} callout ${calloutIndex} part ${partIndex} part region`,
        ),
        quantityLabelRegion: normalizeRegion(
          part.quantityLabel?.region ?? part.quantityLabel?.crop?.region,
          `${caseId} callout ${calloutIndex} part ${partIndex} quantity label region`,
        ),
        alphaMask: encodeAlphaMask(
          part.partImage?.alphaMask,
          `${caseId} callout ${calloutIndex} part ${partIndex} alpha mask`,
        ),
      })),
    })),
  }
}

export function encodeAlphaMask(alphaMask, context = "alpha mask") {
  if (
    !alphaMask ||
    !Number.isInteger(alphaMask.width) ||
    !Number.isInteger(alphaMask.height)
  ) {
    throw new Error(`${context}: missing alphaMask width/height`)
  }

  const expectedLength = alphaMask.width * alphaMask.height
  const bytes = new Uint8Array(expectedLength)

  for (let index = 0; index < expectedLength; index += 1) {
    const value = alphaMask.data?.[index] ?? 0

    bytes[index] = Number.isFinite(value)
      ? Math.max(0, Math.min(255, Math.round(value)))
      : 0
  }

  return {
    width: alphaMask.width,
    height: alphaMask.height,
    encoding: "uint8-base64",
    dataBase64: Buffer.from(bytes).toString("base64"),
  }
}

function normalizeQuantityText(text) {
  return typeof text === "string" ? text.trim() : ""
}

function readPartItems(callout) {
  return Array.isArray(callout?.partItems) ? callout.partItems : []
}

function hasDetectedColor(part) {
  return Boolean(part?.detectedColor?.name)
}

function normalizeDetectedColor(color, context) {
  if (
    !color ||
    typeof color.name !== "string" ||
    typeof color.family !== "string" ||
    typeof color.status !== "string" ||
    typeof color.swatchHex !== "string"
  ) {
    throw new Error(`${context}: invalid detectedColor`)
  }

  return {
    name: color.name,
    family: color.family,
    status: color.status,
    swatchHex: color.swatchHex,
    manualClassId: typeof color.manualClassId === "string" ? color.manualClassId : null,
    manualClassTrusted: color.manualClassTrusted === true,
    rawManualClassId: typeof color.rawManualClassId === "string" ? color.rawManualClassId : null,
  }
}

function normalizeRegion(region, context) {
  if (
    !region ||
    !Number.isFinite(region.x) ||
    !Number.isFinite(region.y) ||
    !Number.isFinite(region.width) ||
    !Number.isFinite(region.height)
  ) {
    throw new Error(`${context}: invalid region`)
  }

  return {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function readSourceManifestCases(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return new Map()
  }

  const manifest = readJson(manifestPath)
  return new Map((manifest.cases ?? []).map((fixtureCase) => [fixtureCase.id, fixtureCase]))
}

export function splitBagAnalysisFixtures({
  sourceDir = DEFAULT_SOURCE_DIR,
  stepManifestPath = DEFAULT_STEP_MANIFEST_PATH,
  outputDir = DEFAULT_OUTPUT_DIR,
} = {}) {
  const sourceManifestCases = readSourceManifestCases(stepManifestPath)
  const sessionPaths = fs.readdirSync(sourceDir)
    .filter((fileName) => fileName.endsWith(".bagit-session.json"))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => path.join(sourceDir, fileName))

  if (sessionPaths.length === 0) {
    throw new Error(`No .bagit-session.json files found in ${sourceDir}`)
  }

  fs.rmSync(outputDir, { recursive: true, force: true })

  const manifestCases = []

  for (const sessionPath of sessionPaths) {
    const caseId = path.basename(sessionPath, ".bagit-session.json")
    const split = splitBagAnalysisSession(readJson(sessionPath), {
      caseId,
      sourceManifestCase: sourceManifestCases.get(caseId),
    })
    const caseDir = path.join(outputDir, caseId)

    writeJson(path.join(caseDir, "input.bagit-session.json"), split.inputSession)
    writeJson(path.join(caseDir, "callouts.json"), split.calloutsFixture)
    writeJson(path.join(caseDir, "parts.json"), split.partsFixture)
    manifestCases.push(split.manifestCase)
  }

  const manifest = {
    schemaVersion: BAG_ANALYSIS_FIXTURE_SCHEMA_VERSION,
    cases: manifestCases,
  }

  writeJson(path.join(outputDir, "manifest.json"), manifest)
  return manifest
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = splitBagAnalysisFixtures()

  console.log(`Wrote ${manifest.cases.length} bag-analysis e2e fixture cases.`)
}
