import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runPartMatchLDrawRenderProbe } from "./part-match-ldraw-render.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match ldraw render probe", () => {
  it("renders recursive LDraw part references into SVG views", async () => {
    const tempDir = await createTempDir()
    const ldrawRoot = path.join(tempDir, "ldraw")
    const outputDir = path.join(tempDir, "renders")

    await writeLDrawFile(path.join(ldrawRoot, "parts", "3023.dat"), [
      "0 Plate 1 x 2",
      "1 16 10 0 0 1 0 0 0 1 0 0 0 1 stud.dat",
      "4 16 -20 8 -10 20 8 -10 20 8 10 -20 8 10",
    ])
    await writeLDrawFile(path.join(ldrawRoot, "p", "stud.dat"), [
      "0 Stud primitive",
      "3 16 -5 0 -5 5 0 -5 0 -6 0",
      "3 16 5 0 -5 5 0 5 0 -6 0",
    ])

    const result = await runPartMatchLDrawRenderProbe({
      generatedAt: new Date("2026-06-25T12:00:00.000Z"),
      ldrawRoot,
      outputDir,
      partIds: ["3023"],
      views: ["iso-left", "top"],
    })
    const isoSvg = await readFile(path.join(outputDir, "3023-iso-left.svg"), "utf8")
    const html = await readFile(result.indexPath, "utf8")

    expect(result.summary.parts[0]?.polygons).toBe(3)
    expect(result.summary.parts[0]?.unresolvedReferences).toEqual([])
    expect(result.summary.parts[0]?.views.map((view) => view.view)).toEqual(["iso-left", "top"])
    expect(isoSvg).toContain("<polygon")
    expect(html).toContain("3023")
  })

  it("records missing root parts and unresolved subfiles without failing the run", async () => {
    const tempDir = await createTempDir()
    const ldrawRoot = path.join(tempDir, "ldraw")
    const outputDir = path.join(tempDir, "renders")

    await writeLDrawFile(path.join(ldrawRoot, "parts", "known.dat"), [
      "0 Known part",
      "1 16 0 0 0 1 0 0 0 1 0 0 0 1 missing-subpart.dat",
      "3 16 0 0 0 10 0 0 0 10 0",
    ])

    const result = await runPartMatchLDrawRenderProbe({
      ldrawRoot,
      outputDir,
      partIds: ["known", "missing-root"],
      views: ["front"],
    })

    expect(result.summary.parts[0]?.unresolvedReferences).toEqual(["missing-subpart.dat"])
    expect(result.summary.parts[1]?.filePath).toBeNull()
    expect(result.summary.parts[1]?.unresolvedReferences).toEqual(["missing-root.dat"])
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-ldraw-render-"))
  tempDirs.push(tempDir)

  return tempDir
}

async function writeLDrawFile(filePath, lines) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${lines.join("\n")}\n`)
}
