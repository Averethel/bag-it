import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const DEFAULT_LDRAW_ROOT = "/Applications/Studio 2.0/ldraw"
const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_PART_IDS = ["3023", "3710", "3069b", "6141"]
const DEFAULT_VIEWS = ["iso-left", "iso-right", "top"] as const
const RENDER_VERSION = "0.1.0"
const DEFAULT_RENDER_SIZE = 192
const MAX_RECURSION_DEPTH = 36

type LDrawViewName = (typeof DEFAULT_VIEWS)[number] | "front"

interface Point3 {
  x: number
  y: number
  z: number
}

interface Point2 {
  x: number
  y: number
}

interface Transform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
  g: number
  h: number
  i: number
  x: number
  y: number
  z: number
}

interface Polygon3 {
  colorCode: string
  sourceFile: string
  vertices: Point3[]
}

interface Polygon2 {
  depth: number
  points: Point2[]
  shade: number
}

interface PartRender {
  filePath: string | null
  partId: string
  polygons: number
  unresolvedReferences: string[]
  views: Array<{
    path: string
    view: LDrawViewName
  }>
}

interface RenderSummary {
  generatedAt: string
  ldrawRoot: string
  outputDir: string
  parts: PartRender[]
  version: string
}

export interface RunPartMatchLDrawRenderOptions {
  generatedAt?: Date
  ldrawRoot?: string
  outputDir?: string
  partIds?: string[]
  renderSize?: number
  views?: LDrawViewName[]
}

export interface RunPartMatchLDrawRenderResult {
  indexPath: string
  outputDir: string
  rendersPath: string
  summary: RenderSummary
}

export async function runPartMatchLDrawRenderProbe(
  options: RunPartMatchLDrawRenderOptions = {},
): Promise<RunPartMatchLDrawRenderResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir =
    options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-ldraw-render-probe`)
  const ldrawRoot = options.ldrawRoot ?? DEFAULT_LDRAW_ROOT
  const partIds = options.partIds ?? DEFAULT_PART_IDS
  const renderSize = options.renderSize ?? DEFAULT_RENDER_SIZE
  const views = options.views ?? [...DEFAULT_VIEWS]
  const reader = new LDrawReader(ldrawRoot)
  const parts: PartRender[] = []

  await mkdir(outputDir, { recursive: true })

  for (const partId of partIds) {
    const sourcePath = reader.resolveRootPart(partId)

    if (!sourcePath) {
      parts.push({
        filePath: null,
        partId,
        polygons: 0,
        unresolvedReferences: [`${partId}.dat`],
        views: [],
      })
      continue
    }

    const loaded = await reader.loadPart(sourcePath)
    const renderedViews = await Promise.all(views.map(async (view) => {
      const fileName = `${safeFileName(partId)}-${view}.svg`
      const svgPath = path.join(outputDir, fileName)
      await writeFile(svgPath, renderSvg(loaded.polygons, {
        partId,
        renderSize,
        view,
      }))

      return {
        path: fileName,
        view,
      }
    }))

    parts.push({
      filePath: sourcePath,
      partId,
      polygons: loaded.polygons.length,
      unresolvedReferences: [...loaded.unresolvedReferences].sort(),
      views: renderedViews,
    })
  }

  const summary: RenderSummary = {
    generatedAt: generatedAt.toISOString(),
    ldrawRoot,
    outputDir,
    parts,
    version: RENDER_VERSION,
  }
  const rendersPath = path.join(outputDir, "renders.json")
  const indexPath = path.join(outputDir, "index.html")

  await writeJson(rendersPath, summary)
  await writeFile(indexPath, renderIndexHtml(summary))

  return {
    indexPath,
    outputDir,
    rendersPath,
    summary,
  }
}

class LDrawReader {
  readonly #fileCache = new Map<string, string[]>()
  readonly #root: string

  constructor(root: string) {
    this.#root = root
  }

  resolveRootPart(partId: string): string | null {
    return this.#resolveReference(`${partId}.dat`, null)
  }

  async loadPart(filePath: string): Promise<{
    polygons: Polygon3[]
    unresolvedReferences: Set<string>
  }> {
    const unresolvedReferences = new Set<string>()
    const polygons = await this.#loadFile(filePath, identityTransform(), unresolvedReferences, 0)

    return {
      polygons,
      unresolvedReferences,
    }
  }

  async #loadFile(
    filePath: string,
    transform: Transform,
    unresolvedReferences: Set<string>,
    depth: number,
  ): Promise<Polygon3[]> {
    if (depth > MAX_RECURSION_DEPTH) {
      unresolvedReferences.add(`max-depth:${filePath}`)
      return []
    }

    const lines = await this.#readLines(filePath)
    const polygons: Polygon3[] = []

    for (const line of lines) {
      const parsed = parseLDrawLine(line)

      if (!parsed) {
        continue
      }

      if (parsed.kind === "polygon") {
        polygons.push({
          colorCode: parsed.colorCode,
          sourceFile: filePath,
          vertices: parsed.vertices.map((vertex) => applyTransform(transform, vertex)),
        })
        continue
      }

      const referencedPath = this.#resolveReference(parsed.reference, filePath)

      if (!referencedPath) {
        unresolvedReferences.add(parsed.reference)
        continue
      }

      const nextTransform = multiplyTransform(transform, parsed.transform)
      polygons.push(...await this.#loadFile(referencedPath, nextTransform, unresolvedReferences, depth + 1))
    }

    return polygons
  }

  async #readLines(filePath: string): Promise<string[]> {
    const cached = this.#fileCache.get(filePath)

    if (cached) {
      return cached
    }

    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/)
    this.#fileCache.set(filePath, lines)

    return lines
  }

  #resolveReference(reference: string, currentFilePath: string | null): string | null {
    const normalizedReference = reference.replaceAll("\\", path.sep)
    const candidates = [
      currentFilePath ? path.join(path.dirname(currentFilePath), normalizedReference) : null,
      path.join(this.#root, "parts", normalizedReference),
      path.join(this.#root, "p", normalizedReference),
      path.join(this.#root, "UnOfficial", "parts", normalizedReference),
      path.join(this.#root, "UnOfficial", "p", normalizedReference),
    ].filter((candidate): candidate is string => candidate !== null)

    return candidates.find((candidate) => existsSync(candidate)) ?? null
  }
}

type ParsedLine =
  | {
      colorCode: string
      kind: "polygon"
      vertices: Point3[]
    }
  | {
      kind: "reference"
      reference: string
      transform: Transform
    }

function parseLDrawLine(line: string): ParsedLine | null {
  const values = line.trim().split(/\s+/)
  const lineType = values[0]

  if (!lineType || lineType === "0" || lineType === "2" || lineType === "5") {
    return null
  }

  if (lineType === "1") {
    return parseReferenceLine(values)
  }

  if (lineType === "3" || lineType === "4") {
    return parsePolygonLine(values, lineType === "3" ? 3 : 4)
  }

  return null
}

function parseReferenceLine(values: string[]): ParsedLine | null {
  if (values.length < 15) {
    return null
  }

  const numbers = values.slice(2, 14).map(Number)

  if (numbers.some((value) => Number.isNaN(value))) {
    return null
  }

  return {
    kind: "reference",
    reference: values.slice(14).join(" "),
    transform: {
      x: numbers[0],
      y: numbers[1],
      z: numbers[2],
      a: numbers[3],
      b: numbers[4],
      c: numbers[5],
      d: numbers[6],
      e: numbers[7],
      f: numbers[8],
      g: numbers[9],
      h: numbers[10],
      i: numbers[11],
    },
  }
}

function parsePolygonLine(values: string[], vertexCount: number): ParsedLine | null {
  const coordinateValues = values.slice(2).map(Number)
  const expectedCoordinates = vertexCount * 3

  if (coordinateValues.length < expectedCoordinates || coordinateValues.some((value) => Number.isNaN(value))) {
    return null
  }

  const vertices: Point3[] = []

  for (let index = 0; index < expectedCoordinates; index += 3) {
    vertices.push({
      x: coordinateValues[index] ?? 0,
      y: coordinateValues[index + 1] ?? 0,
      z: coordinateValues[index + 2] ?? 0,
    })
  }

  return {
    colorCode: values[1] ?? "16",
    kind: "polygon",
    vertices,
  }
}

function identityTransform(): Transform {
  return {
    a: 1,
    b: 0,
    c: 0,
    d: 0,
    e: 1,
    f: 0,
    g: 0,
    h: 0,
    i: 1,
    x: 0,
    y: 0,
    z: 0,
  }
}

function multiplyTransform(parent: Transform, child: Transform): Transform {
  return {
    a: parent.a * child.a + parent.b * child.d + parent.c * child.g,
    b: parent.a * child.b + parent.b * child.e + parent.c * child.h,
    c: parent.a * child.c + parent.b * child.f + parent.c * child.i,
    d: parent.d * child.a + parent.e * child.d + parent.f * child.g,
    e: parent.d * child.b + parent.e * child.e + parent.f * child.h,
    f: parent.d * child.c + parent.e * child.f + parent.f * child.i,
    g: parent.g * child.a + parent.h * child.d + parent.i * child.g,
    h: parent.g * child.b + parent.h * child.e + parent.i * child.h,
    i: parent.g * child.c + parent.h * child.f + parent.i * child.i,
    x: parent.x + parent.a * child.x + parent.b * child.y + parent.c * child.z,
    y: parent.y + parent.d * child.x + parent.e * child.y + parent.f * child.z,
    z: parent.z + parent.g * child.x + parent.h * child.y + parent.i * child.z,
  }
}

function applyTransform(transform: Transform, point: Point3): Point3 {
  return {
    x: transform.x + transform.a * point.x + transform.b * point.y + transform.c * point.z,
    y: transform.y + transform.d * point.x + transform.e * point.y + transform.f * point.z,
    z: transform.z + transform.g * point.x + transform.h * point.y + transform.i * point.z,
  }
}

function renderSvg(
  polygons: readonly Polygon3[],
  {
    partId,
    renderSize,
    view,
  }: {
    partId: string
    renderSize: number
    view: LDrawViewName
  },
): string {
  if (polygons.length === 0) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${renderSize}" height="${renderSize}" viewBox="0 0 ${renderSize} ${renderSize}" role="img" aria-label="${escapeXml(partId)} ${escapeXml(view)}">`,
      `<rect width="100%" height="100%" fill="#f8fafc"/>`,
      `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="13">no geometry</text>`,
      `</svg>`,
      "",
    ].join("\n")
  }

  const projected = projectPolygons(polygons, view)
  const bounds = measureBounds(projected.flatMap((polygon) => polygon.points))
  const scale = Math.min(
    (renderSize - 24) / Math.max(1, bounds.maxX - bounds.minX),
    (renderSize - 24) / Math.max(1, bounds.maxY - bounds.minY),
  )
  const offsetX = (renderSize - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale
  const offsetY = (renderSize - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale
  const polygonElements = projected
    .sort((left, right) => left.depth - right.depth)
    .map((polygon) => {
      const points = polygon.points
        .map((point) => `${formatNumber(offsetX + point.x * scale)},${formatNumber(offsetY + point.y * scale)}`)
        .join(" ")

      return `<polygon points="${points}" fill="${shadeHex("#b8c0c8", polygon.shade)}" stroke="#4b5563" stroke-width="0.9"/>`
    })
    .join("")

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${renderSize}" height="${renderSize}" viewBox="0 0 ${renderSize} ${renderSize}" role="img" aria-label="${escapeXml(partId)} ${escapeXml(view)}">`,
    `<rect width="100%" height="100%" fill="#f8fafc"/>`,
    `<g>${polygonElements}</g>`,
    `</svg>`,
    "",
  ].join("\n")
}

function projectPolygons(polygons: readonly Polygon3[], view: LDrawViewName): Polygon2[] {
  return polygons.map((polygon) => ({
    depth: polygon.vertices.reduce((total, vertex) => total + depthForView(vertex, view), 0) / polygon.vertices.length,
    points: polygon.vertices.map((vertex) => projectPoint(vertex, view)),
    shade: surfaceShade(polygon.vertices),
  }))
}

function projectPoint(point: Point3, view: LDrawViewName): Point2 {
  if (view === "top") {
    return {
      x: point.x,
      y: point.z,
    }
  }

  if (view === "front") {
    return {
      x: point.x,
      y: point.y,
    }
  }

  const zFactor = view === "iso-right" ? -1 : 1

  return {
    x: (point.x - point.z * zFactor) * 0.62,
    y: (point.x + point.z * zFactor) * 0.28 + point.y * 0.9,
  }
}

function depthForView(point: Point3, view: LDrawViewName): number {
  if (view === "top") {
    return point.y
  }

  if (view === "front") {
    return point.z
  }

  return view === "iso-right" ? point.x - point.y + point.z : point.x - point.y - point.z
}

function surfaceShade(vertices: readonly Point3[]): number {
  if (vertices.length < 3) {
    return 1
  }

  const normal = polygonNormal(vertices[0], vertices[1], vertices[2])
  const topLight = Math.abs(normal.y) * 0.28
  const sideLight = normal.x * -0.08 + normal.z * 0.06

  return clamp(0.78 + topLight + sideLight, 0.58, 1.18)
}

function polygonNormal(first: Point3, second: Point3, third: Point3): Point3 {
  const ab = subtractPoint(second, first)
  const ac = subtractPoint(third, first)
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

function subtractPoint(left: Point3, right: Point3): Point3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  }
}

function measureBounds(points: readonly Point2[]) {
  return points.reduce(
    (current, point) => ({
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
    }),
    { maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity },
  )
}

function renderIndexHtml(summary: RenderSummary): string {
  const cards = summary.parts.map((part) => {
    const views = part.views.map((view) => `
      <figure>
        <img src="${escapeHtml(view.path)}" alt="${escapeHtml(part.partId)} ${escapeHtml(view.view)}">
        <figcaption>${escapeHtml(view.view)}</figcaption>
      </figure>
    `).join("")
    const unresolved = part.unresolvedReferences.length > 0
      ? `<p class="warn">Unresolved: ${escapeHtml(part.unresolvedReferences.join(", "))}</p>`
      : ""

    return `
      <article>
        <h2>${escapeHtml(part.partId)}</h2>
        <p>${part.polygons} polygons</p>
        ${unresolved}
        <div class="views">${views}</div>
      </article>
    `
  }).join("")

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>LDraw Render Probe</title>
  <style>
    body { background: #f8fafc; color: #172033; font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; }
    header { margin-bottom: 24px; }
    code { background: #e5e7eb; border-radius: 4px; padding: 2px 5px; }
    article { background: #fff; border: 1px solid #d6dce3; border-radius: 8px; margin: 0 0 18px; padding: 16px; }
    h1, h2, p { margin: 0 0 10px; }
    .views { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    figure { margin: 0; }
    img { border: 1px solid #d6dce3; border-radius: 6px; image-rendering: auto; width: 180px; }
    figcaption { color: #526071; font-size: 13px; margin-top: 6px; }
    .warn { color: #9a3412; }
  </style>
</head>
<body>
  <header>
    <h1>LDraw Render Probe</h1>
    <p>Root: <code>${escapeHtml(summary.ldrawRoot)}</code></p>
    <p>Generated: ${escapeHtml(summary.generatedAt)}</p>
  </header>
  ${cards}
</body>
</html>
`
}

function shadeHex(hex: string, shade: number): string {
  const normalized = hex.replace("#", "")
  const channels = [0, 2, 4].map((offset) =>
    Math.round(
      clamp(Number.parseInt(normalized.slice(offset, offset + 2), 16) * shade, 0, 255),
    ),
  )

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function escapeXml(value: string): string {
  return escapeHtml(value)
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
}

function timestampForPath(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]/gi, "-")
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function parseCliArgs(argv: readonly string[]): RunPartMatchLDrawRenderOptions {
  const options: RunPartMatchLDrawRenderOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === "--ldraw-root" && next) {
      options.ldrawRoot = next
      index += 1
      continue
    }

    if (arg === "--output-dir" && next) {
      options.outputDir = next
      index += 1
      continue
    }

    if (arg === "--part-ids" && next) {
      options.partIds = next.split(",").map((partId) => partId.trim()).filter(Boolean)
      index += 1
      continue
    }

    if (arg === "--views" && next) {
      options.views = next.split(",").map((view) => view.trim()).filter(Boolean) as LDrawViewName[]
      index += 1
      continue
    }

    if (arg === "--render-size" && next) {
      options.renderSize = Number.parseInt(next, 10)
      index += 1
      continue
    }
  }

  return options
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ""
const currentPath = path.resolve(new URL(import.meta.url).pathname)

if (invokedPath === currentPath) {
  const result = await runPartMatchLDrawRenderProbe(parseCliArgs(process.argv.slice(2)))
  console.log(`Wrote LDraw render probe: ${result.indexPath}`)
  console.log(`Parts: ${result.summary.parts.length}`)
}
