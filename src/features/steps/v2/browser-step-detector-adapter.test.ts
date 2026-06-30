import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createStepCalloutPageInput,
  type StepCalloutPageRole,
} from "@bag-it/step-callouts"
import type { StepDetectorV2BuildStepsResult } from "./output-assembly"
import { createSyntheticV2Page } from "./synthetic-page-test-helper"

const browserPageInputMock = vi.hoisted(() => ({
  readStepDetectorV2PageInputsFromFile: vi.fn(),
  visitStepDetectorV2PageInputsFromFile: vi.fn(),
}))

vi.mock("./browser-page-input", () => browserPageInputMock)

import {
  hydratePdfStepPreviewImagesV2FromFile,
  readSafeBomTailStopPage,
  scanPdfStepCalloutsV2FromFile,
  scanPdfStepPartsV2FromFile,
  STEP_PART_COLOR_CALIBRATION_V2_VERSION,
  STEP_PART_EXTRACTOR_V2_VERSION,
} from "./browser-step-detector-adapter"
import {
  paintBorder,
  paintRasterQuantityLabel,
  paintRegion,
  TEST_BLACK,
  TEST_BLUE_PANEL,
} from "./synthetic-page-test-helper"

const CALLOUT_REGION = { height: 48, width: 78, x: 18, y: 12 }
const TEST_GREEN = { a: 255, b: 64, g: 126, r: 32 }

describe("v2 browser detector adapter", () => {
  beforeEach(() => {
    installCanvasStub()
    vi.stubGlobal("Worker", undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("hydrates page and crop previews from the same text-free page pass", async () => {
    const onPageHydrated = vi.fn()
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createSyntheticV2Page())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await hydratePdfStepPreviewImagesV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
      {
        onPageHydrated,
        renderMaxWidth: 900,
      },
    )

    expect(browserPageInputMock.visitStepDetectorV2PageInputsFromFile).toHaveBeenCalledWith(
      expect.any(File),
      expect.any(Function),
      expect.objectContaining({
        allowUpscale: true,
        batchSize: 2,
        maxPages: undefined,
        pageNumbers: [1],
        renderMaxWidth: 900,
      }),
    )
    expect(browserPageInputMock.visitStepDetectorV2PageInputsFromFile).toHaveBeenCalledTimes(1)
    expect(browserPageInputMock.readStepDetectorV2PageInputsFromFile).not.toHaveBeenCalled()
    expect(result.pagePreviews[0].imageDataUrl).toBe("blob:test-2")
    expect(result.callouts[0].crop.imageDataUrl).toBe("blob:test-1")
    expect(result.previewTiming).toEqual(
      expect.objectContaining({
        label: "V2 preview hydration",
        phaseMs: expect.objectContaining({
          "preview-hydration": expect.any(Number),
        }),
        totalMs: expect.any(Number),
      }),
    )
    expect(onPageHydrated).toHaveBeenLastCalledWith({
      pageNumber: 1,
      result: expect.objectContaining({
        callouts: result.callouts,
        pagePreviews: result.pagePreviews,
      }),
    })
  })

  it("can hydrate page thumbnails without scheduling crop previews", async () => {
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createSyntheticV2Page())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await hydratePdfStepPreviewImagesV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
      {
        includeCropPreviews: false,
      },
    )

    expect(browserPageInputMock.visitStepDetectorV2PageInputsFromFile).toHaveBeenCalledTimes(1)
    expect(result.pagePreviews[0].imageDataUrl).toBe("blob:test-1")
    expect(result.callouts[0].crop.imageDataUrl).toBeUndefined()
  })

  it("hydrates priority page previews before the offscreen backlog", async () => {
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (
        _file: File,
        visitPageInput: (pageInput: ReturnType<typeof createSyntheticV2Page>) => Promise<void> | void,
        options: { pageNumbers?: readonly number[] } = {},
      ) => {
        const pageNumbers = options.pageNumbers ?? [1]

        for (const pageNumber of pageNumbers) {
          await visitPageInput(createSyntheticV2PageNumber(pageNumber))
        }

        return { pageCount: 3, processedPageCount: pageNumbers.length }
      },
    )

    await hydratePdfStepPreviewImagesV2FromFile(
      createPdfFile(),
      createThreePageResultWithoutPreviewImages(),
      {
        getPriorityPageNumbers: () => [3],
        renderMaxWidth: 900,
      },
    )

    const firstPreviewOptions = browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mock.calls[0][2]
    const backlogPreviewOptions = browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mock.calls[1][2]

    expect(firstPreviewOptions).toEqual(
      expect.objectContaining({
        allowUpscale: true,
        batchSize: 2,
        pageNumbers: [3],
        renderMaxWidth: 900,
      }),
    )
    expect(backlogPreviewOptions).toEqual(
      expect.objectContaining({
        allowUpscale: true,
        batchSize: 2,
        pageNumbers: [1, 2],
        renderMaxWidth: 900,
      }),
    )
  })

  it("publishes page progress while pages stream and final callout counts after detection", async () => {
    const onProgress = vi.fn()
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createPageWithCallout())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await scanPdfStepCalloutsV2FromFile(createPdfFile(), {
      onProgress,
      pageCount: 1,
    })

    expect(result.callouts).toHaveLength(1)
    expect(result.callouts[0].partItems).toHaveLength(0)
    expect(result.partExtractorVersion).toBeUndefined()
    expect(result.timing).toEqual(
      expect.objectContaining({
        counts: expect.objectContaining({
          callouts: 1,
          pages: 1,
          partRows: 0,
        }),
        label: "V2 scan",
        phaseMs: expect.objectContaining({
          finalizing: expect.any(Number),
          "page-scan": expect.any(Number),
        }),
        totalMs: expect.any(Number),
      }),
    )
    expect(result.timing?.phaseMs["part-extraction"]).toBeUndefined()
    expect(browserPageInputMock.visitStepDetectorV2PageInputsFromFile).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        activePage: 1,
        detectedCalloutCount: 1,
        detectedPartItemCount: undefined,
        phase: "page-scan",
        scannedPageCount: 1,
      }),
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        activePage: 1,
        detectedCalloutCount: 1,
        detectedPartItemCount: undefined,
        message: "V2 scoring page 1.",
        phase: "page-scan",
        scannedPageCount: 1,
      }),
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        activePage: null,
        detectedCalloutCount: 1,
        detectedPartItemCount: undefined,
        phase: "finalizing",
        scannedPageCount: 1,
      }),
    )
  })

  it("commits streamed page results in page order", async () => {
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createSyntheticV2PageNumber(2))
        await visitPageInput(createSyntheticV2PageNumber(1))
        return { pageCount: 2, processedPageCount: 2 }
      },
    )

    const result = await scanPdfStepCalloutsV2FromFile(createPdfFile(), {
      pageCount: 2,
    })

    expect(result.scannedPageNumbers).toEqual([1, 2])
  })

  it("resolves safe BOM tail stop only after late build pages", () => {
    expect(readSafeBomTailStopPage(createPageRoleMap([
      [1, "unknown"],
      [2, "unknown"],
      [3, "unknown"],
      [4, "unknown"],
      [5, "unknown"],
      [6, "unknown"],
      [7, "unknown"],
      [8, "unknown"],
      [9, "step-like"],
      [10, "bom-like"],
      [11, "bom-like"],
      [12, "bom-like"],
    ]), 15)).toBe(12)
  })

  it("does not resolve safe BOM tail stop before build start or through uncertain pages", () => {
    expect(readSafeBomTailStopPage(createPageRoleMap([
      [1, "bom-like"],
      [2, "bom-like"],
      [3, "bom-like"],
    ]), 10)).toBeNull()

    expect(readSafeBomTailStopPage(createPageRoleMap([
      [1, "unknown"],
      [2, "unknown"],
      [3, "unknown"],
      [4, "unknown"],
      [5, "unknown"],
      [6, "unknown"],
      [7, "unknown"],
      [8, "unknown"],
      [9, "step-like"],
      [10, "bom-like"],
      [11, "unknown"],
      [12, "bom-like"],
      [13, "bom-like"],
    ]), 15)).toBeNull()
  })

  it("does not resolve safe BOM tail stop when later step-like pages reset the tail", () => {
    expect(readSafeBomTailStopPage(createPageRoleMap([
      [1, "unknown"],
      [2, "unknown"],
      [3, "unknown"],
      [4, "unknown"],
      [5, "unknown"],
      [6, "unknown"],
      [7, "unknown"],
      [8, "unknown"],
      [9, "step-like"],
      [10, "bom-like"],
      [11, "bom-like"],
      [12, "step-like"],
      [13, "bom-like"],
      [14, "bom-like"],
    ]), 15)).toBeNull()
  })

  it("rejects scan work when cancelled before page detection", async () => {
    const controller = new AbortController()
    controller.abort()
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createSyntheticV2Page())
        return { pageCount: 1, processedPageCount: 0 }
      },
    )

    await expect(scanPdfStepCalloutsV2FromFile(createPdfFile(), {
      signal: controller.signal,
    })).rejects.toThrow(/cancelled/i)
  })

  it("extracts v2 part rows without eager preview images by default", async () => {
    const onProgress = vi.fn()
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createPageWithCallout())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await scanPdfStepPartsV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
      { onProgress },
    )

    expect(result.partExtractorVersion).toBe(STEP_PART_EXTRACTOR_V2_VERSION)
    expect(result.partColorCalibrationVersion).toBe(STEP_PART_COLOR_CALIBRATION_V2_VERSION)
    expect(result.callouts[0].partItems).toHaveLength(1)
    expect(result.callouts[0].partItems[0].partImage).toEqual(
      expect.objectContaining({
        alphaMask: expect.objectContaining({
          data: expect.any(Uint8ClampedArray),
        }),
        region: expect.any(Object),
      }),
    )
    expect(result.callouts[0].partItems[0].partImage.imageDataUrl).toBeUndefined()
    expect(result.callouts[0].partItems[0].detectedColor).toEqual(
      expect.objectContaining({
        manualClassId: "manual-color-001",
        manualClassHex: expect.stringMatching(/^#[0-9a-f]{6}$/),
        rawManualClassId: "manual-color-001",
        rawManualClassHex: expect.stringMatching(/^#[0-9a-f]{6}$/),
        swatchHex: expect.stringMatching(/^#[0-9a-f]{6}$/),
      }),
    )
    expect(result.pagePreviews[0].imageDataUrl).toBeUndefined()
    expect(result.callouts[0].crop.imageDataUrl).toBeUndefined()
    expect(result.callouts[0].partItems[0].quantityLabel.crop?.imageDataUrl).toBeUndefined()
    expect("partCrop" in result.callouts[0].partItems[0]).toBe(false)
    expect(result.timing).toEqual(
      expect.objectContaining({
        counts: expect.objectContaining({
          callouts: 1,
          pages: 1,
          partRows: 1,
        }),
        phaseMs: expect.objectContaining({
          "part-extraction": expect.any(Number),
        }),
        totalMs: expect.any(Number),
      }),
    )
    expect(browserPageInputMock.visitStepDetectorV2PageInputsFromFile).toHaveBeenCalledWith(
      expect.any(File),
      expect.any(Function),
      expect.objectContaining({
        allowUpscale: true,
        pageNumbers: [1],
        renderMaxWidth: 384,
      }),
    )
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activePage: null,
        detectedPartItemCount: 1,
        phase: "part-extraction",
        percentage: 100,
      }),
    )
  })

  it("keeps page pixels available for color sampling when part extraction runs in a worker", async () => {
    vi.stubGlobal("Worker", createPartExtractionWorkerStub())
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createPageWithCallout())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await scanPdfStepPartsV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
    )

    expect(result.callouts[0].partItems[0].detectedColor).toEqual(
      expect.objectContaining({
        manualClassId: "manual-color-001",
        swatchHex: expect.stringMatching(/^#[0-9a-f]{6}$/),
      }),
    )
    expect(result.partColorCalibrationVersion).toBe(STEP_PART_COLOR_CALIBRATION_V2_VERSION)
  })

  it("rejects a stale part extraction worker version probe and retries once with a fresh worker", async () => {
    const WorkerStub = createPartExtractionWorkerStub({ staleVersionResponse: true })
    let visitCount = 0

    vi.stubGlobal("Worker", WorkerStub)
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        visitCount += 1
        await visitPageInput(createPageWithCallout())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await scanPdfStepPartsV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
    )

    expect(result.partExtractorVersion).toBe(STEP_PART_EXTRACTOR_V2_VERSION)
    expect(result.partColorCalibrationVersion).toBe(STEP_PART_COLOR_CALIBRATION_V2_VERSION)
    expect(result.callouts[0].partItems).toHaveLength(1)
    expect(WorkerStub.createdCount).toBe(4)
    expect(visitCount).toBe(2)
  })

  it("rejects a stale part extraction worker extract response and retries once with a fresh worker", async () => {
    const WorkerStub = createPartExtractionWorkerStub({ staleExtractResponse: true })
    let visitCount = 0

    vi.stubGlobal("Worker", WorkerStub)
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        visitCount += 1
        await visitPageInput(createPageWithCallout())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await scanPdfStepPartsV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
    )

    expect(result.partExtractorVersion).toBe(STEP_PART_EXTRACTOR_V2_VERSION)
    expect(result.partColorCalibrationVersion).toBe(STEP_PART_COLOR_CALIBRATION_V2_VERSION)
    expect(result.callouts[0].partItems).toHaveLength(1)
    expect(WorkerStub.createdCount).toBe(4)
    expect(visitCount).toBe(2)
  })

  it("samples colors against base coordinates after high-resolution part extraction", async () => {
    vi.stubGlobal("Worker", createPartExtractionWorkerStub())
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createHighResolutionColorPage())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await scanPdfStepPartsV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
    )
    const color = result.callouts[0].partItems[0].detectedColor

    expect(color).toEqual(
      expect.objectContaining({
        family: "green",
        observedHex: "#207e40",
      }),
    )
  })

  it("can eagerly hydrate first-page previews at saved scale for compatibility", async () => {
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createPageWithCallout())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    const result = await scanPdfStepPartsV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
      { eagerPreviewImages: true },
    )

    expect(result.callouts[0].partItems[0].partImage.imageDataUrl)
      .toEqual(expect.stringMatching(/^blob:test-/))
    expect(result.pagePreviews[0].imageDataUrl).toEqual(expect.stringMatching(/^blob:test-/))
    expect(result.callouts[0].crop.imageDataUrl).toEqual(expect.stringMatching(/^blob:test-/))
    expect(result.callouts[0].partItems[0].quantityLabel.crop?.imageDataUrl)
      .toEqual(expect.stringMatching(/^blob:test-/))
  })

  it("hydrates restored previews at the saved coordinate scale by default", async () => {
    browserPageInputMock.visitStepDetectorV2PageInputsFromFile.mockImplementation(
      async (_file, visitPageInput) => {
        await visitPageInput(createSyntheticV2Page())
        return { pageCount: 1, processedPageCount: 1 }
      },
    )

    await hydratePdfStepPreviewImagesV2FromFile(
      createPdfFile(),
      createResultWithoutPreviewImages(),
    )

    expect(browserPageInputMock.visitStepDetectorV2PageInputsFromFile).toHaveBeenCalledWith(
      expect.any(File),
      expect.any(Function),
      expect.objectContaining({
        allowUpscale: true,
        renderMaxWidth: 128,
      }),
    )
  })
})

function createResultWithoutPreviewImages(): StepDetectorV2BuildStepsResult {
  return {
    callouts: [
      {
        confidence: 1,
        crop: {
          region: CALLOUT_REGION,
        },
        detectorCandidateId: "candidate-1",
        id: "v2-candidate-1",
        indexOnPage: 0,
        inferredBackground: {
          confidence: 1,
          hex: "#c6e2fa",
          rgb: {
            b: TEST_BLUE_PANEL.b,
            g: TEST_BLUE_PANEL.g,
            r: TEST_BLUE_PANEL.r,
          },
        },
        pageNumber: 1,
        partItems: [],
        sourceRegion: CALLOUT_REGION,
        stepIndex: 1,
      },
    ],
    detectorVersion: "2.0.0-alpha.16",
    pageAttentionItems: [],
    pageCount: 1,
    pageLimit: null,
    pagePreviews: [
      {
        height: 82,
        pageNumber: 1,
        width: 128,
      },
    ],
    qualitySummary: {
      firstBuildStepPageNumber: 1,
      inferredCalloutBackgrounds: [],
    },
    scannedPageNumbers: [1],
    skippedPageNumbers: [],
    status: "detected",
  }
}

function createThreePageResultWithoutPreviewImages(): StepDetectorV2BuildStepsResult {
  const result = createResultWithoutPreviewImages()

  return {
    ...result,
    callouts: [1, 2, 3].map((pageNumber) => ({
      ...result.callouts[0],
      crop: {
        region: CALLOUT_REGION,
      },
      id: `v2-candidate-${pageNumber}`,
      pageNumber,
      partItems: [],
    })),
    pageCount: 3,
    pagePreviews: [1, 2, 3].map((pageNumber) => ({
      height: 82,
      pageNumber,
      width: 128,
    })),
    scannedPageNumbers: [1, 2, 3],
  }
}

function createPdfFile(): File {
  return new File(["%PDF-1.7"], "manual.pdf", { type: "application/pdf" })
}

function createPageRoleMap(
  entries: readonly (readonly [number, StepCalloutPageRole])[],
): Map<number, StepCalloutPageRole> {
  return new Map(entries)
}

function createSyntheticV2PageNumber(pageNumber: number): ReturnType<typeof createSyntheticV2Page> {
  return {
    ...createSyntheticV2Page(),
    pageNumber,
  }
}

function createPageWithCallout() {
  return createSyntheticV2Page((data) => {
    paintRegion(data, CALLOUT_REGION, TEST_BLUE_PANEL)
    paintBorder(data, CALLOUT_REGION, TEST_BLACK)
    paintRegion(data, { height: 10, width: 14, x: 26, y: 26 }, TEST_BLACK)
    paintRasterQuantityLabel(data, "2x", 30, 48)
  })
}

function createHighResolutionColorPage() {
  const scale = 3
  const width = 128 * scale
  const height = 82 * scale
  const data = new Uint8ClampedArray(width * height * 4)

  paintScaledRegion(data, width, height, { height, width, x: 0, y: 0 }, { a: 255, b: 255, g: 255, r: 255 })
  paintScaledRegion(data, width, height, { height: 10, width: 14, x: 26, y: 26 }, TEST_BLACK)
  paintScaledRegion(data, width, height, scaleRegion({ height: 10, width: 14, x: 26, y: 26 }, scale), TEST_GREEN)

  return createStepCalloutPageInput({
    data,
    height,
    pageNumber: 1,
    width,
  })
}

function scaleRegion(region: { height: number; width: number; x: number; y: number }, scale: number) {
  return {
    height: region.height * scale,
    width: region.width * scale,
    x: region.x * scale,
    y: region.y * scale,
  }
}

function paintScaledRegion(
  data: Uint8ClampedArray,
  pageWidth: number,
  pageHeight: number,
  region: { height: number; width: number; x: number; y: number },
  color: { a: number; b: number; g: number; r: number },
): void {
  for (let y = Math.max(0, region.y); y < Math.min(pageHeight, region.y + region.height); y += 1) {
    for (let x = Math.max(0, region.x); x < Math.min(pageWidth, region.x + region.width); x += 1) {
      const offset = (y * pageWidth + x) * 4

      data[offset] = color.r
      data[offset + 1] = color.g
      data[offset + 2] = color.b
      data[offset + 3] = color.a
    }
  }
}

type PartExtractionWorkerStubRequest = {
  id: number
  type: "extract" | "version"
  callouts?: Array<{ id: string }>
  page?: { data: Uint8ClampedArray; pageNumber: number }
}

function createPartExtractionWorkerStub({
  staleExtractResponse = false,
  staleVersionResponse = false,
}: {
  staleExtractResponse?: boolean
  staleVersionResponse?: boolean
} = {}) {
  let staleExtractResponsePending = staleExtractResponse
  let staleVersionResponsePending = staleVersionResponse

  class PartExtractionWorkerStub {
    static readonly created = { count: 0 }

    static get createdCount(): number {
      return PartExtractionWorkerStub.created.count
    }

    private readonly listeners = new Set<(event: MessageEvent) => void>()

    constructor() {
      PartExtractionWorkerStub.created.count += 1
    }

    addEventListener(type: string, listener: EventListener): void {
      if (type === "message") {
        this.listeners.add(listener as (event: MessageEvent) => void)
      }
    }

    removeEventListener(type: string, listener: EventListener): void {
      if (type === "message") {
        this.listeners.delete(listener as (event: MessageEvent) => void)
      }
    }

    postMessage(request: PartExtractionWorkerStubRequest): void {
      queueMicrotask(() => {
        const isStaleResponse = request.type === "version"
          ? staleVersionResponsePending
          : staleExtractResponsePending

        if (request.type === "version") {
          staleVersionResponsePending = false
        } else {
          staleExtractResponsePending = false
        }

        emitWorkerStubResponse(this.listeners, request, isStaleResponse)
      })
    }

    terminate(): void {}
  }

  return PartExtractionWorkerStub
}

function emitWorkerStubResponse(
  listeners: ReadonlySet<(event: MessageEvent) => void>,
  request: PartExtractionWorkerStubRequest,
  isStaleResponse: boolean,
): void {
  const response = request.type === "version"
    ? createWorkerVersionResponse(request, isStaleResponse)
    : createWorkerExtractionResponse(request, isStaleResponse)

  for (const listener of listeners) {
    listener({ data: response } as MessageEvent)
  }
}

function createWorkerVersionResponse(
  request: PartExtractionWorkerStubRequest,
  isStaleResponse: boolean,
) {
  return {
    id: request.id,
    ...createWorkerVersionFields(isStaleResponse),
    type: "version",
  }
}

function createWorkerExtractionResponse(
  request: PartExtractionWorkerStubRequest,
  isStaleResponse: boolean,
) {
  const calloutId = request.callouts?.[0]?.id ?? "missing-callout"

  if (request.page) {
    request.page.data = new Uint8ClampedArray(0)
  }

  return {
    id: request.id,
    items: [createWorkerPartItem(calloutId)],
    pageNumber: request.page?.pageNumber ?? 1,
    ...createWorkerVersionFields(isStaleResponse),
    type: "extract",
  }
}

function createWorkerVersionFields(isStaleResponse: boolean) {
  return {
    partColorCalibrationVersion: isStaleResponse
      ? "stale-color-version"
      : STEP_PART_COLOR_CALIBRATION_V2_VERSION,
    partExtractorVersion: isStaleResponse
      ? "stale-part-version"
      : STEP_PART_EXTRACTOR_V2_VERSION,
  }
}

function createWorkerPartItem(calloutId: string) {
  const partRegion = { height: 10, width: 14, x: 26, y: 26 }

  return {
    calloutId,
    confidence: 1,
    id: `${calloutId}-part-0`,
    indexOnCallout: 0,
    partImage: {
      alphaMask: {
        data: new Uint8ClampedArray(partRegion.width * partRegion.height).fill(255),
        height: partRegion.height,
        width: partRegion.width,
      },
      region: partRegion,
    },
    quantityLabel: {
      confidence: 1,
      region: { height: 6, width: 9, x: 30, y: 48 },
      text: "2x",
      value: 2,
    },
    sourceRegion: partRegion,
  }
}

function installCanvasStub(): void {
  let canvasId = 0
  let objectUrlId = 0
  const createElement = window.document.createElement.bind(window.document)
  const NativeURL = globalThis.URL

  vi.stubGlobal("ImageData", class TestImageData {})
  class TestURL extends NativeURL {}
  Object.defineProperty(TestURL, "createObjectURL", {
    value: vi.fn(() => {
      objectUrlId += 1
      return `blob:test-${objectUrlId}`
    }),
  })
  Object.defineProperty(TestURL, "revokeObjectURL", {
    value: vi.fn(),
  })
  vi.stubGlobal("URL", TestURL)

  vi.spyOn(window.document, "createElement").mockImplementation((tagName) => {
    if (tagName !== "canvas") {
      return createElement(tagName)
    }

    canvasId += 1

    return createCanvasStub(canvasId) as unknown as HTMLCanvasElement
  })
}

function createCanvasStub(canvasId: number) {
  return {
    height: 0,
    width: 0,
    getContext: () => ({
      drawImage: () => undefined,
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4).fill(255),
      }),
      putImageData: () => undefined,
    }),
    toBlob: (callback: BlobCallback) => {
      callback(new Blob([`canvas-${canvasId}`], { type: "image/png" }))
    },
  }
}
