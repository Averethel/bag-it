import { createServer, type ServerResponse } from "node:http"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Buffer } from "node:buffer"
import { chromium } from "@playwright/test"

const DEFAULT_LDRAW_ROOT = "/Applications/Studio 2.0/ldraw"
const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_PART_IDS = ["3023", "3710", "3069b", "6141"]
const DEFAULT_VIEWS = ["iso-left", "iso-right", "top"] as const
const DEFAULT_RENDER_SIZE = 256
const RENDER_VERSION = "0.1.1"

type ThreeRenderViewName = (typeof DEFAULT_VIEWS)[number] | "front"

interface ThreeRenderSummary {
  generatedAt: string
  ldrawRoot: string
  outputDir: string
  parts: Array<{
    partId: string
    views: Array<{
      path: string
      view: ThreeRenderViewName
    }>
  }>
  renderer: "three-ldraw-loader-webgl"
  version: string
}

interface BrowserRenderResult {
  dataUrl: string
  partId: string
  view: ThreeRenderViewName
}

export interface RunPartMatchLDrawThreeRenderOptions {
  generatedAt?: Date
  ldrawRoot?: string
  outputDir?: string
  partIds?: string[]
  renderSize?: number
  views?: ThreeRenderViewName[]
}

export interface RunPartMatchLDrawThreeRenderResult {
  indexPath: string
  outputDir: string
  rendersPath: string
  summary: ThreeRenderSummary
}

export async function runPartMatchLDrawThreeRender(
  options: RunPartMatchLDrawThreeRenderOptions = {},
): Promise<RunPartMatchLDrawThreeRenderResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir =
    options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-ldraw-three-render`)
  const ldrawRoot = options.ldrawRoot ?? DEFAULT_LDRAW_ROOT
  const partIds = options.partIds ?? DEFAULT_PART_IDS
  const views = options.views ?? [...DEFAULT_VIEWS]
  const renderSize = options.renderSize ?? DEFAULT_RENDER_SIZE

  await mkdir(outputDir, { recursive: true })

  const repoRoot = process.cwd()
  const server = await startRenderServer({
    ldrawRoot,
    nodeModulesRoot: path.join(repoRoot, "node_modules"),
  })

  try {
    const browser = await chromium.launch({ headless: true })
    let browserResults: BrowserRenderResult[]

    try {
      const page = await browser.newPage({ viewport: { height: renderSize, width: renderSize } })

      await page.goto(`${server.origin}/renderer.html`)
      await page.waitForFunction(() => Boolean((window as unknown as { ldrawRendererReady?: boolean }).ldrawRendererReady))

      browserResults = await page.evaluate(
        async ({ partIds, renderSize, views }) => {
          const renderer = (window as unknown as {
            renderLDrawParts: (input: {
              partIds: string[]
              renderSize: number
              views: ThreeRenderViewName[]
            }) => Promise<BrowserRenderResult[]>
          }).renderLDrawParts

          return renderer({ partIds, renderSize, views })
        },
        { partIds, renderSize, views },
      )
    } finally {
      await browser.close()
    }

    const parts = []

    for (const partId of partIds) {
      const partViews = []

      for (const view of views) {
        const result = browserResults.find((entry) => entry.partId === partId && entry.view === view)

        if (!result) {
          throw new Error(`Missing browser render for ${partId} ${view}.`)
        }

        const fileName = `${safeFileName(partId)}-${view}.png`
        await writePngDataUrl(path.join(outputDir, fileName), result.dataUrl)
        partViews.push({
          path: fileName,
          view,
        })
      }

      parts.push({
        partId,
        views: partViews,
      })
    }

    const summary: ThreeRenderSummary = {
      generatedAt: generatedAt.toISOString(),
      ldrawRoot,
      outputDir,
      parts,
      renderer: "three-ldraw-loader-webgl",
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
  } finally {
    await new Promise<void>((resolve) => {
      server.server.close(() => resolve())
    })
  }
}

async function startRenderServer({
  ldrawRoot,
  nodeModulesRoot,
}: {
  ldrawRoot: string
  nodeModulesRoot: string
}): Promise<{
  origin: string
  server: ReturnType<typeof createServer>
}> {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")

      if (requestUrl.pathname === "/renderer.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        response.end(renderBrowserHtml())
        return
      }

      if (requestUrl.pathname.startsWith("/node_modules/")) {
        await serveFile(response, nodeModulesRoot, requestUrl.pathname.slice("/node_modules/".length))
        return
      }

      if (requestUrl.pathname.startsWith("/ldraw/")) {
        await serveFile(response, ldrawRoot, decodeURIComponent(requestUrl.pathname.slice("/ldraw/".length)))
        return
      }

      response.writeHead(404)
      response.end("Not found")
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
      response.end(error instanceof Error ? error.message : String(error))
    }
  })

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve())
  })

  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("Failed to start render server.")
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
  }
}

async function serveFile(
  response: ServerResponse,
  root: string,
  relativePath: string,
): Promise<void> {
  const resolvedRoot = path.resolve(root)
  const filePath = resolveServedFilePath(resolvedRoot, relativePath)

  if (!filePath) {
    response.writeHead(404)
    response.end("Not found")
    return
  }

  response.writeHead(200, { "content-type": mimeType(filePath) })
  response.end(await readFile(filePath))
}

function resolveServedFilePath(resolvedRoot: string, relativePath: string): string | null {
  const candidates = [
    relativePath,
    path.join("UnOfficial", relativePath),
  ]

  for (const candidate of candidates) {
    const filePath = path.resolve(resolvedRoot, candidate)

    if (filePath.startsWith(resolvedRoot) && existsSync(filePath)) {
      return filePath
    }
  }

  return null
}

function renderBrowserHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script type="importmap">
    {
      "imports": {
        "three": "/node_modules/three/build/three.module.js",
        "three/addons/": "/node_modules/three/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <script type="module">
    import * as THREE from "three";
    import { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
    import { LDrawConditionalLineMaterial } from "three/addons/materials/LDrawConditionalLineMaterial.js";

    const PART_COLOR = 0xb8c0c8;
    const EDGE_COLOR = 0x4b5563;

    function cameraPositionForView(view, distance) {
      if (view === "top") return new THREE.Vector3(0, -distance, 0.001);
      if (view === "front") return new THREE.Vector3(0, -distance * 0.25, distance);
      if (view === "iso-right") return new THREE.Vector3(distance, -distance * 0.8, distance);
      return new THREE.Vector3(-distance, -distance * 0.8, distance);
    }

    function normalizeObject(object) {
      object.traverse((node) => {
        if (node.isMesh) {
          node.material = new THREE.MeshStandardMaterial({
            color: PART_COLOR,
            metalness: 0,
            roughness: 0.45,
          });
          node.castShadow = false;
          node.receiveShadow = false;
        }

        if (node.isLineSegments) {
          node.material = new THREE.LineBasicMaterial({
            color: EDGE_COLOR,
            transparent: true,
            opacity: 0.34,
          });
        }
      });

      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);

      return box.getSize(new THREE.Vector3()).length();
    }

    async function createLoader() {
      const loader = new LDrawLoader();
      loader.setPartsLibraryPath("/ldraw/");
      loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
      loader.setPath("/ldraw/");
      await loader.preloadMaterials("LDConfig.ldr");
      loader.setPath("/ldraw/parts/");
      return loader;
    }

    async function renderPart(loader, partId, view, renderSize) {
      const scene = new THREE.Scene();
      scene.background = null;

      const object = await loader.loadAsync(partId + ".dat");
      const size = normalizeObject(object);
      scene.add(object);

      const ambient = new THREE.HemisphereLight(0xffffff, 0xd6dce3, 2.2);
      scene.add(ambient);

      const key = new THREE.DirectionalLight(0xffffff, 2.8);
      key.position.set(-180, -240, 220);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xffffff, 1.2);
      fill.position.set(200, -80, -120);
      scene.add(fill);

      const distance = Math.max(size * 1.7, 80);
      const camera = new THREE.OrthographicCamera(-distance, distance, distance, -distance, 0.1, distance * 8);
      camera.position.copy(cameraPositionForView(view, distance * 1.9));
      camera.up.set(0, -1, 0);
      camera.lookAt(0, 0, 0);
      camera.zoom = 1.62;
      camera.updateProjectionMatrix();

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(renderSize, renderSize, false);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL("image/png");
      renderer.dispose();

      return {
        dataUrl,
        partId,
        view,
      };
    }

    window.renderLDrawParts = async ({ partIds, renderSize, views }) => {
      const loader = await createLoader();
      const renders = [];

      for (const partId of partIds) {
        for (const view of views) {
          renders.push(await renderPart(loader, partId, view, renderSize));
        }
      }

      return renders;
    };
    window.ldrawRendererReady = true;
  </script>
</body>
</html>`
}

function renderIndexHtml(summary: ThreeRenderSummary): string {
  const cards = summary.parts.map((part) => {
    const views = part.views.map((view) => `
      <figure>
        <img src="${escapeHtml(view.path)}" alt="${escapeHtml(part.partId)} ${escapeHtml(view.view)}">
        <figcaption>${escapeHtml(view.view)}</figcaption>
      </figure>
    `).join("")

    return `
      <article>
        <h2>${escapeHtml(part.partId)}</h2>
        <div class="views">${views}</div>
      </article>
    `
  }).join("")

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Three LDraw Render Probe</title>
  <style>
    body { background: #f8fafc; color: #172033; font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; }
    header { margin-bottom: 24px; }
    code { background: #e5e7eb; border-radius: 4px; padding: 2px 5px; }
    article { background: #fff; border: 1px solid #d6dce3; border-radius: 8px; margin: 0 0 18px; padding: 16px; }
    h1, h2, p { margin: 0 0 10px; }
    .views { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    figure { margin: 0; }
    img { background: #f8fafc; border: 1px solid #d6dce3; border-radius: 6px; width: 220px; }
    figcaption { color: #526071; font-size: 13px; margin-top: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>Three LDraw Render Probe</h1>
    <p>Renderer: <code>${escapeHtml(summary.renderer)}</code></p>
    <p>Root: <code>${escapeHtml(summary.ldrawRoot)}</code></p>
    <p>Generated: ${escapeHtml(summary.generatedAt)}</p>
  </header>
  ${cards}
</body>
</html>
`
}

async function writePngDataUrl(filePath: string, dataUrl: string): Promise<void> {
  const marker = "base64,"
  const markerIndex = dataUrl.indexOf(marker)

  if (!dataUrl.startsWith("data:image/png;") || markerIndex === -1) {
    throw new Error("Browser renderer returned unsupported PNG data URL.")
  }

  await writeFile(filePath, Buffer.from(dataUrl.slice(markerIndex + marker.length), "base64"))
}

function mimeType(filePath: string): string {
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8"
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8"
  if (filePath.endsWith(".dat") || filePath.endsWith(".ldr") || filePath.endsWith(".mpd")) return "text/plain; charset=utf-8"
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8"
  if (filePath.endsWith(".png")) return "image/png"

  return "application/octet-stream"
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
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

function parseCliArgs(argv: readonly string[]): RunPartMatchLDrawThreeRenderOptions {
  const options: RunPartMatchLDrawThreeRenderOptions = {}

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
      options.views = next.split(",").map((view) => view.trim()).filter(Boolean) as ThreeRenderViewName[]
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
  const result = await runPartMatchLDrawThreeRender(parseCliArgs(process.argv.slice(2)))
  console.log(`Wrote Three LDraw render probe: ${result.indexPath}`)
  console.log(`Parts: ${result.summary.parts.length}`)
}
