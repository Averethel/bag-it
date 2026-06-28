import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { JSDOM } from "jsdom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CALLOUT_PART_EXTRACTOR_VERSION } from "../packages/callout-parts/src/index.ts"
import { PART_COLOR_CALIBRATION_VERSION } from "../packages/part-colors/src/index.ts"
import {
  buildPartColorReport,
  writePartColorReport,
} from "./write-part-color-report.mjs"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part color report writer", () => {
  it("writes class summary and review rows from a saved session", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "report")

    await writeFile(sessionPath, JSON.stringify(createSession()))

    const { report } = await writePartColorReport({
      generatedAt: new Date("2026-06-10T12:00:00.000Z"),
      outputDir,
      sessionPath,
    })
    const reportJson = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"))
    const indexHtml = await readFile(path.join(outputDir, "index.html"), "utf8")
    const dataScript = await readFile(path.join(outputDir, "workbench-data.js"), "utf8")
    const appScript = await readFile(path.join(outputDir, "workbench.js"), "utf8")
    const css = await readFile(path.join(outputDir, "workbench.css"), "utf8")
    const detailsHtml = await readFile(path.join(outputDir, "details.html"), "utf8")
    const workbenchData = parseWorkbenchDataScript(dataScript)

    expect(report.totals).toEqual({
      classes: 2,
      detectedRows: 3,
      rawClasses: 2,
      reviewRows: 1,
      rows: 4,
      unknownRows: 1,
    })
    expect(report.colorSource).toBe("saved-app-result")
    expect(reportJson.classes.map((manualClass) => manualClass.id)).toEqual([
      "manual-color-001",
      "manual-color-002",
    ])
    expect(reportJson.classes[0].nearestPaletteNames).toEqual(["Green", "Bright Green"])
    expect(reportJson.classes[0]).toEqual(expect.objectContaining({
      quantityCount: 4,
      rowCount: 2,
    }))
    expect(reportJson.sourcePreviews).toEqual([
      expect.objectContaining({
        calloutId: "callout-1",
        imageDataUrl: "data:image/png;base64,callout",
        region: { height: 140, width: 180, x: 0, y: 0 },
      }),
    ])
    expect(reportJson.reviewRows[0].itemId).toBe("row-review")
    expect(reportJson.unknownRows[0].itemId).toBe("row-unknown")
    expect(reportJson.versions).toEqual(expect.objectContaining({
      currentPartColorCalibrationVersion: PART_COLOR_CALIBRATION_VERSION,
      currentPartExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
      partColorCalibrationStale: false,
      partColorCalibrationVersion: PART_COLOR_CALIBRATION_VERSION,
      partColorCalibrationVersionSource: "saved-session",
      partExtractorStale: false,
      partExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
      savedPartColorCalibrationVersion: PART_COLOR_CALIBRATION_VERSION,
    }))
    expect(indexHtml).toContain("Part Color Label Workbench")
    expect(indexHtml).toContain("workbench-data.js")
    expect(indexHtml).toContain("workbench.js")
    expect(indexHtml).toContain("workbench.css")
    expect(indexHtml).toContain("id=\"part-color-workbench\"")
    expect(indexHtml).not.toContain("label-workbench-config")
    expect(dataScript).not.toContain("&quot;")
    expect(workbenchData.config.colorSource).toBe("saved-app-result")
    expect(workbenchData.config.exportBlocked).toBe(false)
    expect(workbenchData.sourcePreviewsById["callout-1"]).toEqual(expect.objectContaining({
      imageDataUrl: "data:image/png;base64,callout",
      region: { height: 140, width: 180, x: 0, y: 0 },
    }))
    expect(workbenchData.filters.find((filter) => filter.id === "review")).toEqual(expect.objectContaining({
      count: 2,
    }))
    expect(workbenchData.filters.find((filter) => filter.id === "close-pair")).toEqual(expect.objectContaining({
      count: 1,
    }))
    expect(workbenchData.rows).toHaveLength(4)
    expect(workbenchData.rows[0]).toEqual(expect.objectContaining({
      partRegion: { height: 10, width: 12, x: 3, y: 4 },
      sourcePreviewId: "callout-1",
    }))
    expect(appScript).toContain("applyFilters")
    expect(css).toContain(".toolbar")
    expect(css).toContain(".source-preview")
    expect(cssRule(css, "th")).not.toContain("position: sticky")
    expect(cssRule(css, "th")).not.toContain("top:")
    expect(detailsHtml).toContain("manual-color-001")
    expect(detailsHtml).toContain("Color source: saved app result")
    expect(detailsHtml).toContain("Open Label Workbench")
    expect(detailsHtml).toContain(`part color ${PART_COLOR_CALIBRATION_VERSION} / current ${PART_COLOR_CALIBRATION_VERSION}`)
    expect(detailsHtml).toContain("Merged Color Classes")
    expect(detailsHtml).toContain("Raw Color Classes")
    expect(detailsHtml).toContain("Rows By Merged Color Class")
    expect(detailsHtml).not.toContain("Labels:")
    expect(reportJson.classes[0].rows[0]).not.toHaveProperty("labelExpectedName")
    expect(detailsHtml).toContain("manual-color-001 - Green")
    expect(detailsHtml).toContain("<th>Parts</th>")
    expect(detailsHtml).toContain("<th>Qty</th>")
    expect(detailsHtml).toContain("<th>Sampling</th>")
    expect(detailsHtml).toContain("<th>Resolver</th>")
    expect(detailsHtml).toContain("<th>Chips</th>")
    expect(detailsHtml).toContain("<th>Merge</th>")
    expect(detailsHtml).toContain("data:image/png;base64,green")
    expect(detailsHtml).toContain("data:image/png;base64,green2")
    expect(detailsHtml).toContain("href=\"#row-row-green\"")
    expect(detailsHtml).toContain("id=\"row-row-green\"")
  })

  it("builds report without filesystem access", () => {
    const report = buildPartColorReport(createSession(), {
      generatedAt: new Date("2026-06-10T12:00:00.000Z"),
      sourceSessionPath: "synthetic.bagit-session.json",
    })

    expect(report.sourceSessionPath).toBe("synthetic.bagit-session.json")
    expect(report.colorSource).toBe("saved-app-result")
    expect(report.classes[1]).toEqual(
      expect.objectContaining({
        id: "manual-color-002",
        quantityCount: 2,
        rowCount: 1,
        status: "review",
      }),
    )
  })

  it("loads private labels and renders annotated mismatches", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "02-middle-wall")
    const labelDir = path.join(tempDir, "labels")

    await writeFile(sessionPath, JSON.stringify(createSession()))
    await mkdir(labelDir, { recursive: true })
    await writeFile(path.join(labelDir, "02-middle-wall.json"), JSON.stringify({
      labels: [
        { expectedName: "Green", itemId: "row-green", note: "stale matched note" },
        { expectedName: "White", itemId: "row-review", note: "known tiny mismatch" },
      ],
      manualId: "02-middle-wall",
      reportPath: path.join(outputDir, "report.json"),
      status: "gate",
    }))

    const { report } = await writePartColorReport({
      generatedAt: new Date("2026-06-10T12:00:00.000Z"),
      labelDir,
      outputDir,
      sessionPath,
    })
    const detailsHtml = await readFile(path.join(outputDir, "details.html"), "utf8")
    const workbenchData = parseWorkbenchDataScript(
      await readFile(path.join(outputDir, "workbench-data.js"), "utf8"),
    )

    expect(report.labels).toEqual(expect.objectContaining({
      manualId: "02-middle-wall",
      matched: 1,
      mismatched: 1,
      missing: 0,
      status: "gate",
      total: 2,
    }))
    expect(report.annotatedMismatches).toEqual([
      expect.objectContaining({
        actualName: "Tan",
        expectedName: "White",
        itemId: "row-review",
        note: "known tiny mismatch",
        status: "mismatch",
      }),
    ])
    expect(report.classes[0].rows[0]).toEqual(expect.objectContaining({
      labelExpectedName: "Green",
      labelStatus: "match",
    }))
    expect(detailsHtml).toContain("Annotated Mismatches")
    expect(detailsHtml).toContain("known tiny mismatch")
    expect(detailsHtml).not.toContain("stale matched note")
    expect(detailsHtml).toContain("Mismatch classes: other: 1.")
    expect(detailsHtml).toContain("<th>Expected</th>")
    expect(detailsHtml).toContain("label-mismatch")
    expect(workbenchData.rows.find((row) => row.itemId === "row-review")).toEqual(expect.objectContaining({
      labelExpectedName: "White",
      labelStatus: "mismatch",
    }))
  })

  it("renders generated workbench controls and filters rows visually", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "02-middle-wall")
    const labelDir = path.join(tempDir, "labels")

    await writeFile(sessionPath, JSON.stringify(createSession()))
    await mkdir(labelDir, { recursive: true })
    await writeFile(path.join(labelDir, "02-middle-wall.json"), JSON.stringify({
      labels: [
        { expectedName: "Green", itemId: "row-green" },
        { expectedName: "White", itemId: "row-review", note: "known tiny mismatch" },
      ],
      manualId: "02-middle-wall",
      reportPath: path.join(outputDir, "report.json"),
      status: "gate",
    }))

    await writePartColorReport({
      generatedAt: new Date("2026-06-10T12:00:00.000Z"),
      labelDir,
      outputDir,
      sessionPath,
    })

    const dom = await loadWorkbenchDom(outputDir)
    const document = dom.window.document
    const rows = [...document.querySelectorAll(".workbench-row")]

    expect(document.body.textContent).toContain("Part Color Label Workbench")
    expect(document.querySelector("#copy-label-json").disabled).toBe(false)
    expect(document.querySelector("#visible-count").textContent).toBe("Showing 4 of 4 rows")
    expect(rows).toHaveLength(4)
    expect(document.querySelector(".source-preview")).not.toBeNull()
    expect(document.querySelector(".source-marker")).not.toBeNull()
    expect(document.querySelector(".workbench-filter[data-filter='mismatch']")).not.toBeNull()
    expect(document.querySelector(".workbench-row[data-item-id='row-green-2'] .expected-color-input").value).toBe("Green")
    expect(document.querySelector(".workbench-row[data-item-id='row-review'] .expected-color-input").value).toBe("White")
    expect(document.querySelector(".workbench-row[data-item-id='row-review']").dataset.searchText).toContain("row-review")
    const unknownInput = document.querySelector(".workbench-row[data-item-id='row-unknown'] .expected-color-input")
    const unknownMenu = document.querySelector(".workbench-row[data-item-id='row-unknown'] .expected-color-menu")
    const firstExpectedInput = document.querySelector(".workbench-row[data-item-id='row-green'] .expected-color-input")
    const rowSearchInput = document.querySelector("#row-search")

    expect(unknownInput.value).toBe("")
    expect(unknownInput.getAttribute("list")).toBeNull()
    expect(firstExpectedInput.tabIndex).toBe(0)
    expect(rowSearchInput.tabIndex).toBe(-1)
    expect(document.querySelector(".workbench-row[data-item-id='row-unknown'] .role-select").tabIndex).toBe(-1)
    expect(document.querySelector(".workbench-row[data-item-id='row-unknown'] .note-input").tabIndex).toBe(-1)
    expect(document.querySelector("#copy-label-json").tabIndex).toBe(-1)
    unknownInput.focus()
    unknownInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }))

    expect(document.activeElement).toBe(firstExpectedInput)

    unknownInput.value = "turq"
    unknownInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }))

    expect(unknownMenu.hidden).toBe(false)
    expect([...unknownMenu.querySelectorAll(".expected-color-option")]
      .map((option) => option.textContent)).toContain("Dark Turquoise")

    const secondKeyboardOption = unknownMenu.querySelector(".expected-color-option[data-option-index='1']")

    unknownInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }))

    expect(unknownMenu.querySelector(".expected-color-option-active")).toBe(secondKeyboardOption)

    unknownInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }))

    expect(unknownInput.value).toBe(secondKeyboardOption.textContent)

    unknownInput.value = "turq"
    unknownInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    unknownMenu.querySelector(".expected-color-option[data-color-name='Dark Turquoise']").click()

    expect(unknownInput.value).toBe("Dark Turquoise")

    rowSearchInput.value = "row-review"
    rowSearchInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }))

    expect([...document.querySelectorAll(".workbench-row")]
      .filter((row) => !row.hidden)
      .map((row) => row.dataset.itemId)).toEqual(["row-review"])
    expect(document.querySelector("#visible-count").textContent).toBe("Showing 1 of 4 rows")

    document.querySelector("#clear-filters").click()

    expect(rowSearchInput.value).toBe("")
    expect([...document.querySelectorAll(".workbench-row")]
      .filter((row) => !row.hidden)).toHaveLength(4)

    unknownInput.value = "turq"
    document.querySelector("#copy-label-json").click()

    expect(document.querySelector("#label-json-output").value).toBe("")
    expect(document.querySelector("#label-export-status").textContent).toContain("Choose a catalog color")
    expect(unknownInput.classList.contains("expected-color-input-invalid")).toBe(true)

    document.querySelector(".workbench-filter[data-filter='mismatch']").click()

    expect([...document.querySelectorAll(".workbench-row")]
      .filter((row) => !row.hidden)
      .map((row) => row.dataset.itemId)).toEqual(["row-review"])
    expect(document.querySelector("#visible-count").textContent).toBe("Showing 1 of 4 rows")

    document.querySelector("#clear-filters").click()

    expect([...document.querySelectorAll(".workbench-row")]
      .filter((row) => !row.hidden)).toHaveLength(4)

    const copyCommand = vi.fn(() => true)

    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
    document.execCommand = copyCommand

    document.querySelector(".workbench-row[data-item-id='row-unknown'] .expected-color-input").value = "Sand Green"
    document.querySelector(".workbench-row[data-item-id='row-unknown'] .role-select").value = "active"
    document.querySelector(".workbench-row[data-item-id='row-unknown'] .note-input").value = "supported palette color"
    document.querySelector("#copy-label-json").click()
    await flushWorkbenchTasks(dom)

    const exportedLabels = JSON.parse(document.querySelector("#label-json-output").value).labels

    expect(copyCommand).toHaveBeenCalledWith("copy")
    expect(document.querySelector("#label-export-status").textContent).toContain("Copied label JSON")
    expect(exportedLabels.find((label) => label.itemId === "row-unknown")).toEqual(expect.objectContaining({
      expectedName: "Sand Green",
      itemId: "row-unknown",
      note: "supported palette color",
      role: "active",
    }))

    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("blocked")
        }),
      },
    })
    document.execCommand = vi.fn(() => false)

    document.querySelector("#copy-label-json").click()
    await flushWorkbenchTasks(dom)

    expect(document.querySelector("#label-json-output").style.display).toBe("block")
    expect(document.activeElement).toBe(document.querySelector("#label-json-output"))
    expect(document.querySelector("#label-json-output").selectionStart).toBe(0)
    expect(document.querySelector("#label-json-output").selectionEnd)
      .toBe(document.querySelector("#label-json-output").value.length)
    expect(document.querySelector("#label-export-status").textContent)
      .toContain("Copy blocked by browser")
  })

  it("splits large workbench pages into 500-row chunks", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "09-hall-tower")

    await writeFile(sessionPath, JSON.stringify(createLargeSession(1002)))

    await writePartColorReport({
      generatedAt: new Date("2026-06-10T12:00:00.000Z"),
      outputDir,
      sessionPath,
    })

    const indexHtml = await readFile(path.join(outputDir, "index.html"), "utf8")
    const partTwoHtml = await readFile(path.join(outputDir, "part-002.html"), "utf8")
    const partThreeHtml = await readFile(path.join(outputDir, "part-003.html"), "utf8")
    const pageOne = parseWorkbenchDataScript(await readFile(path.join(outputDir, "workbench-data.js"), "utf8"))
    const pageTwo = parseWorkbenchDataScript(await readFile(path.join(outputDir, "workbench-data-002.js"), "utf8"))
    const pageThree = parseWorkbenchDataScript(await readFile(path.join(outputDir, "workbench-data-003.js"), "utf8"))

    expect(indexHtml).toContain("workbench-data.js")
    expect(partTwoHtml).toContain("workbench-data-002.js")
    expect(partThreeHtml).toContain("workbench-data-003.js")
    expect(pageOne.rows).toHaveLength(500)
    expect(pageTwo.rows).toHaveLength(500)
    expect(pageThree.rows).toHaveLength(2)
    expect(pageOne.config.chunk).toEqual(expect.objectContaining({
      count: 3,
      endRow: 500,
      index: 1,
      startRow: 1,
      totalRows: 1002,
    }))
    expect(pageTwo.config.exportFileName).toBe("09-hall-tower.part-002.json")
    expect(pageThree.chunks).toEqual([
      expect.objectContaining({ current: false, href: "index.html", rowRange: "1-500" }),
      expect.objectContaining({ current: false, href: "part-002.html", rowRange: "501-1000" }),
      expect.objectContaining({ current: true, href: "part-003.html", rowRange: "1001-1002" }),
    ])
  })

  it("renders label conflicts separately from annotated mismatches", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "02-middle-wall")
    const labelDir = path.join(tempDir, "labels")
    const session = createSession()

    session.stepDetectionResult.callouts[0].partItems[1].partImage.imageDataUrl = "data:image/png;base64,green"

    await writeFile(sessionPath, JSON.stringify(session))
    await mkdir(labelDir, { recursive: true })
    await writeFile(path.join(labelDir, "02-middle-wall.json"), JSON.stringify({
      labels: [
        { expectedName: "Green", itemId: "row-green", note: "accepted green" },
        { expectedName: "White", itemId: "row-green-2", note: "contradictory label" },
      ],
      manualId: "02-middle-wall",
      reportPath: path.join(outputDir, "report.json"),
      status: "active",
    }))

    const { report } = await writePartColorReport({
      generatedAt: new Date("2026-06-10T12:00:00.000Z"),
      labelDir,
      outputDir,
      sessionPath,
    })
    const detailsHtml = await readFile(path.join(outputDir, "details.html"), "utf8")

    expect(report.labels).toEqual(expect.objectContaining({
      conflicts: 2,
      matched: 0,
      mismatched: 0,
      missing: 0,
      total: 2,
    }))
    expect(report.totals).toEqual(expect.objectContaining({
      labelConflicts: 2,
      labelMismatches: 0,
    }))
    expect(report.labelConflicts).toEqual([
      expect.objectContaining({
        conflictingExpectedNames: ["Green", "White"],
        conflictItemIds: ["row-green", "row-green-2"],
        itemId: "row-green",
        status: "conflict",
      }),
      expect.objectContaining({
        itemId: "row-green-2",
        status: "conflict",
      }),
    ])
    expect(report.annotatedMismatches).toEqual([])
    expect(report.classes[0].rows[0]).toEqual(expect.objectContaining({
      labelStatus: "conflict",
    }))
    expect(detailsHtml).toContain("Label Conflicts")
    expect(detailsHtml).toContain("Same crop evidence has contradictory expected colors")
    expect(detailsHtml).toContain("label-conflict")
    expect(detailsHtml).not.toContain("Annotated Mismatches")
  })

  it("renders crop drift when a labeled row preview changes", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "02-middle-wall")
    const labelDir = path.join(tempDir, "labels")

    await writeFile(sessionPath, JSON.stringify(createSession()))
    await mkdir(labelDir, { recursive: true })
    await writeFile(path.join(labelDir, "02-middle-wall.json"), JSON.stringify({
      labels: [{
        cropHash: hashDataUrl("data:image/png;base64,old-green"),
        expectedName: "Green",
        itemId: "row-green",
      }],
      manualId: "02-middle-wall",
      reportPath: path.join(outputDir, "report.json"),
      status: "gate",
    }))

    const { report } = await writePartColorReport({
      generatedAt: new Date("2026-06-10T12:00:00.000Z"),
      labelDir,
      outputDir,
      sessionPath,
    })
    const detailsHtml = await readFile(path.join(outputDir, "details.html"), "utf8")

    expect(report.annotatedMismatches).toEqual([
      expect.objectContaining({
        actualName: "row crop drift",
        expectedName: "Green",
        itemId: "row-green",
        status: "drift",
      }),
    ])
    expect(report.classes[0].rows[0]).toEqual(expect.objectContaining({
      labelExpectedName: "Green",
      labelStatus: "drift",
    }))
    expect(detailsHtml).toContain("row crop drift")
    expect(detailsHtml).toContain("label-drift")
  })

  it("blocks label export when a saved-app report is stale", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "stale")
    const session = createSession()

    session.stepDetectionResult.partColorCalibrationVersion = "1.0.0-stale"

    await writeFile(sessionPath, JSON.stringify(session))

    const { report } = await writePartColorReport({
      generatedAt: new Date("2026-06-10T12:00:00.000Z"),
      outputDir,
      sessionPath,
    })
    const workbenchData = parseWorkbenchDataScript(
      await readFile(path.join(outputDir, "workbench-data.js"), "utf8"),
    )
    const dom = await loadWorkbenchDom(outputDir)
    const document = dom.window.document

    expect(report.colorSource).toBe("saved-app-result")
    expect(report.versions.partColorCalibrationStale).toBe(true)
    expect(workbenchData.config.exportBlocked).toBe(true)
    expect(workbenchData.config.exportBlockReasons).toContain("stale part color calibration")
    expect(document.body.textContent).toContain("Training export blocked")
    expect(document.querySelector("#copy-label-json").disabled).toBe(true)
  })

  it("can build a renderer-recomputed diagnostic view when explicitly supplied", () => {
    const recomputedColor = color("manual-color-900", "Black", "review")
    const session = createSession()

    session.stepDetectionResult.partColorCalibrationVersion = "1.0.0-stale"

    const colorAnalysis = {
      colorsComputed: true,
      colorsByPartId: new Map([["row-green", recomputedColor]]),
      previewDataUrlsByPartId: new Map(),
      sampleOverlayDataUrlsByPartId: new Map(),
      samplesByPartId: new Map(),
    }
    const report = buildPartColorReport(session, {
      colorAnalysis,
      colorSource: "recomputed-manual-render",
    })

    expect(report.colorSource).toBe("recomputed-manual-render")
    expect(report.versions).toEqual(expect.objectContaining({
      partColorCalibrationStale: false,
      partColorCalibrationVersion: PART_COLOR_CALIBRATION_VERSION,
      partColorCalibrationVersionSource: "recomputed-current-code",
      savedPartColorCalibrationVersion: "1.0.0-stale",
    }))
    expect(report.classes.map((manualClass) => manualClass.id)).toContain("manual-color-900")
    expect(report.unknownRows.map((row) => row.itemId)).toContain("row-green-2")
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bag-it-color-report-"))

  tempDirs.push(tempDir)

  return tempDir
}

function parseWorkbenchDataScript(source) {
  const prefix = "window.partColorWorkbenchData = "

  expect(source.startsWith(prefix)).toBe(true)

  return JSON.parse(source.slice(prefix.length).trim().replace(/;$/, ""))
}

function cssRule(css, selector) {
  const start = css.indexOf(`${selector} {`)

  if (start === -1) {
    throw new Error(`Missing CSS rule for ${selector}.`)
  }

  const end = css.indexOf("\n}", start)

  if (end === -1) {
    throw new Error(`Unclosed CSS rule for ${selector}.`)
  }

  return css.slice(start, end)
}

async function loadWorkbenchDom(outputDir) {
  const indexPath = path.join(outputDir, "index.html")
  const html = await readFile(indexPath, "utf8")
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    resources: "usable",
    runScripts: "dangerously",
    url: pathToFileURL(indexPath).href,
  })

  await new Promise((resolve) => {
    dom.window.addEventListener("load", resolve, { once: true })
  })
  await waitForWorkbenchRows(dom)

  return dom
}

async function waitForWorkbenchRows(dom) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (dom.window.document.querySelector(".workbench-row")) {
      return
    }

    await new Promise((resolve) => dom.window.setTimeout(resolve, 0))
  }

  throw new Error("Timed out waiting for generated workbench rows.")
}

async function flushWorkbenchTasks(dom) {
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0))
}

function createSession() {
  return {
    stepDetectionResult: {
      callouts: [
        {
          crop: {
            imageDataUrl: "data:image/png;base64,callout",
            region: { height: 140, width: 180, x: 0, y: 0 },
          },
          id: "callout-1",
          pageNumber: 1,
          partItems: [
            partItem("row-green", color("manual-color-001", "Green", "exact"), {
              imageDataUrl: "data:image/png;base64,green",
            }),
            partItem("row-green-2", color("manual-color-001", "Green", "exact"), {
              imageDataUrl: "data:image/png;base64,green2",
            }),
            partItem("row-review", color("manual-color-002", "Tan", "review"), {
              imageDataUrl: "data:image/png;base64,tan",
            }),
            partItem("row-unknown", null),
          ],
          stepIndex: 1,
        },
      ],
      detectorVersion: "2.0.0-test",
      partColorCalibrationVersion: PART_COLOR_CALIBRATION_VERSION,
      partExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
    },
  }
}

function createLargeSession(rowCount) {
  const session = createSession()

  session.stepDetectionResult.callouts[0].partItems = Array.from({ length: rowCount }, (_, index) =>
    partItem(`row-${String(index + 1).padStart(4, "0")}`, color("manual-color-001", "Green", "exact"), {
      imageDataUrl: `data:image/png;base64,green-${index + 1}`,
    }),
  )

  return session
}

function partItem(id, detectedColor, image = {}) {
  return {
    detectedColor,
    id,
    partImage: {
      imageDataUrl: image.imageDataUrl,
      region: { height: 10, width: 12, x: 3, y: 4 },
    },
    quantity: {
      value: 2,
    },
  }
}

function color(manualClassId, name, status) {
  const hex = name === "Green" ? "#237841" : "#dec69c"

  return {
    alternatives: name === "Green" ? ["Bright Green"] : ["Dark Tan"],
    confidence: status === "exact" ? 0.92 : 0.5,
    distance: status === "exact" ? 1.2 : 8.1,
    family: name === "Green" ? "green" : "tan",
    hex,
    manualClassConfidence: status === "exact" ? 0.9 : 0.47,
    manualClassHex: hex,
    manualClassId,
    manualClassRgb: { b: 65, g: 120, r: 35 },
    manualClassTrusted: status === "exact",
    name,
    nameSource: "palette-match",
    observedHex: hex,
    observedRgb: { b: 65, g: 120, r: 35 },
    rarityTier: "common",
    rgb: { b: 65, g: 120, r: 35 },
    sampleChips: [{
      coverage: 0.9,
      hex,
      pixelCount: 20,
      rgb: { b: 65, g: 120, r: 35 },
    }],
    status,
    swatchHex: hex,
  }
}

function hashDataUrl(value) {
  return createHash("sha256").update(value).digest("hex")
}
