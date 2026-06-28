import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const partMatchingMock = vi.hoisted(() => ({
  createPartMatchGroups: vi.fn(),
  createPartMatchGroupsImplementation: null as null | ((
    ...args: Parameters<typeof import("@bag-it/part-matching")["createPartMatchGroups"]>
  ) => ReturnType<typeof import("@bag-it/part-matching")["createPartMatchGroups"]>),
}))

const cnnScorerMock = vi.hoisted(() => ({
  createCnnPartPairScoreFeatures: vi.fn(async () => new Map<string, Record<string, number>>()),
}))

vi.mock("@bag-it/part-matching", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@bag-it/part-matching")>()

  partMatchingMock.createPartMatchGroupsImplementation = actual.createPartMatchGroups
  partMatchingMock.createPartMatchGroups.mockImplementation(actual.createPartMatchGroups)

  return {
    ...actual,
    createPartMatchGroups: partMatchingMock.createPartMatchGroups,
  }
})

vi.mock("./cnn-part-pair-scorer", () => ({
  createCnnPartPairScoreFeatures: cnnScorerMock.createCnnPartPairScoreFeatures,
}))

vi.mock("@/features/steps/v2/runtime-preview-assets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/steps/v2/runtime-preview-assets")>()

  return {
    ...actual,
    createPagePreviewAssetFromPageInput: vi.fn(async (pageInput: { height: number; pageNumber: number; width: number }) => ({
      baseHeight: pageInput.height,
      baseWidth: pageInput.width,
      naturalHeight: pageInput.height * 22,
      naturalWidth: pageInput.width * 22,
      pageNumber: pageInput.pageNumber,
      url: `data:image/gif;base64,page-${pageInput.pageNumber}`,
    })),
    createPartMaskPreviewAssetFromPageInput: vi.fn(async (
      _pageInput: unknown,
      _pageAsset: PagePreviewAsset,
      partItem: StepCalloutDetectionResult["callouts"][number]["partItems"][number],
    ) => ({
      height: partItem.partRegion?.height ?? 1,
      partItemId: partItem.id,
      url: `data:image/png;base64,mask-${partItem.id}`,
      width: partItem.partRegion?.width ?? 1,
    })),
  }
})

import type { PartMatchRowInput } from "@bag-it/part-matching"
import { BaggingApp } from "./bagging-app"
import type { ScanStepCallouts } from "./bagging-app-types"
import { Provider } from "@/components/ui/provider"
import type { RestoredPdfIntakeSession } from "@/features/bagging/session-file"
import { PdfIntakeError, type PdfMetadata } from "@/features/pdf/pdf-intake"
import {
  STEP_CALLOUT_DETECTOR_V2_VERSION as STEP_CALLOUT_DETECTOR_VERSION,
  STEP_PART_COLOR_CALIBRATION_V2_VERSION as STEP_PART_COLOR_CALIBRATION_VERSION,
  STEP_PART_EXTRACTOR_V2_VERSION as STEP_PART_EXTRACTOR_VERSION,
} from "@/features/steps/v2/browser-step-detector-adapter"
import type {
  StepPartExtractionProgress,
  StepCalloutDetectionProgress,
  StepCalloutDetectionResult,
} from "@/features/steps/step-detection-contracts"
import type {
  PagePreviewAsset,
  PartMaskPreviewAsset,
} from "@/features/steps/preview-assets"
import type { StepDetectorV2PageInput } from "@/features/steps/v2/contracts"
import type { PagePreviewBaseBounds } from "@/features/steps/v2/runtime-preview-assets"

let preserveIntersectionObserverForRender = false

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  preserveIntersectionObserverForRender = false
  resetTestIntersectionObserver()
  partMatchingMock.createPartMatchGroups.mockReset()
  cnnScorerMock.createCnnPartPairScoreFeatures.mockReset()
  cnnScorerMock.createCnnPartPairScoreFeatures.mockImplementation(async () => new Map())

  if (partMatchingMock.createPartMatchGroupsImplementation) {
    partMatchingMock.createPartMatchGroups.mockImplementation(
      partMatchingMock.createPartMatchGroupsImplementation,
    )
  }
})

function renderApp(options: Parameters<typeof BaggingApp>[0] = {}) {
  if (!preserveIntersectionObserverForRender) {
    installImmediateIntersectionObserver()
  }

  const hydrateStepPreviews =
    options.hydrateStepPreviews ??
    vi.fn(async (_file: File, result: StepCalloutDetectionResult) => result)
  const createPagePreviewAsset =
    options.createPagePreviewAsset ??
    vi.fn(async (_file: File, result: StepCalloutDetectionResult, pageNumber: number) =>
      fakePagePreviewAsset(result, pageNumber),
    )
  const createPartMaskPreviewAsset =
    options.createPartMaskPreviewAsset ??
    vi.fn(async (_pageAsset: PagePreviewAsset, partItem) =>
      fakePartMaskPreviewAsset(partItem),
    )
  const readPdfMetadata = options.readPdfMetadata ?? vi.fn(async (file: File) => metadataFor(file))
  const scanStepCallouts =
    options.scanStepCallouts ??
    vi.fn(async (_file: File, scanOptions: { pageCount?: number } = {}) =>
      emptyStepResult(scanOptions.pageCount ?? 4),
    )
  const scanStepParts =
    options.scanStepParts ??
    vi.fn(async (_file: File, result: StepCalloutDetectionResult) => ({
      ...result,
      partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_VERSION,
      partExtractorVersion: STEP_PART_EXTRACTOR_VERSION,
    }))

  return render(
    <Provider>
      <BaggingApp
        {...options}
        hydrateStepPreviews={hydrateStepPreviews}
        createPagePreviewAsset={createPagePreviewAsset}
        createPartMaskPreviewAsset={createPartMaskPreviewAsset}
        readPdfMetadata={readPdfMetadata}
        scanStepCallouts={scanStepCallouts}
        scanStepParts={scanStepParts}
      />
    </Provider>,
  )
}

function resetTestIntersectionObserver() {
  Reflect.deleteProperty(globalThis, "IntersectionObserver")

  if (typeof window !== "undefined") {
    Reflect.deleteProperty(window, "IntersectionObserver")
  }
}

function installImmediateIntersectionObserver() {
  class ImmediateIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}

    disconnect() {}

    observe(element: Element) {
      this.callback([
        {
          isIntersecting: true,
          target: element,
        } as IntersectionObserverEntry,
      ], this as unknown as IntersectionObserver)
    }

    unobserve() {}
  }

  vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver)
}

function installControlledIntersectionObserver() {
  preserveIntersectionObserverForRender = true
  const observers: TestIntersectionObserver[] = []

  class TestIntersectionObserver {
    readonly observedElements = new Set<Element>()

    constructor(
      private readonly callback: IntersectionObserverCallback,
      readonly options?: IntersectionObserverInit,
    ) {
      observers.push(this)
    }

    disconnect() {
      this.observedElements.clear()
    }

    observe(element: Element) {
      this.observedElements.add(element)
    }

    unobserve(element: Element) {
      this.observedElements.delete(element)
    }

    trigger(element: Element, isIntersecting: boolean) {
      if (!this.observedElements.has(element)) {
        return
      }

      this.callback([
        {
          isIntersecting,
          target: element,
        } as IntersectionObserverEntry,
      ], this as unknown as IntersectionObserver)
    }
  }

  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver)

  return {
    rootMargins: () => observers.map((observer) => observer.options?.rootMargin),
    trigger(element: Element, isIntersecting: boolean) {
      act(() => {
        for (const observer of observers) {
          observer.trigger(element, isIntersecting)
        }
      })
    },
  }
}

async function expectTooltipAfterHover(
  user: ReturnType<typeof userEvent.setup>,
  control: HTMLElement,
  label: string,
) {
  await user.hover(control)

  expect(await screen.findByText(label)).toBeInTheDocument()
}

function fakePartMaskPreviewAsset(
  partItem: StepCalloutDetectionResult["callouts"][number]["partItems"][number],
): PartMaskPreviewAsset | null {
  const region = partItem.partImage?.region ?? partItem.partRegion

  if (!region) {
    return null
  }

  const width = Math.max(1, Math.round(region.width))
  const height = Math.max(1, Math.round(region.height))
  const data = new Uint8ClampedArray(width * height * 4)

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 180
    data[index + 1] = 190
    data[index + 2] = 195
    data[index + 3] = 255
  }

  return {
    height,
    partItemId: partItem.id,
    renderedPixels: { data, height, width },
    url: `data:image/png;base64,mask-${partItem.id}`,
    width,
  }
}

function fakePagePreviewAsset(
  result: StepCalloutDetectionResult,
  pageNumber: number,
): PagePreviewAsset {
  const preview = result.pagePreviews.find((candidate) => candidate.pageNumber === pageNumber)

  return {
    baseHeight: preview?.height ?? 140,
    baseWidth: preview?.width ?? 100,
    naturalHeight: 3080,
    naturalWidth: 2200,
    pageNumber,
    url: `data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=`,
  }
}

function fakeRuntimePageInput(pageNumber: number): StepDetectorV2PageInput {
  const width = 100
  const height = 140

  return {
    data: new Uint8ClampedArray(width * height * 4),
    height,
    pageNumber,
    textItems: [],
    width,
  } as StepDetectorV2PageInput
}

function flushTimers(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function metadataFor(file: File, pageCount = 4): PdfMetadata {
  return {
    fileName: file.name,
    sizeBytes: file.size,
    pageCount,
    title: null,
    author: null,
  }
}

function emptyStepResult(pageCount: number): StepCalloutDetectionResult {
  const scannedPageNumbers = Array.from({ length: pageCount }, (_value, index) => index + 1)

  return {
    detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
    partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_VERSION,
    partExtractorVersion: STEP_PART_EXTRACTOR_VERSION,
    pageCount,
    pageLimit: null,
    scannedPageNumbers,
    skippedPageNumbers: [],
    status: "empty",
    pagePreviews: scannedPageNumbers.map((pageNumber) => ({
      pageNumber,
      width: 100,
      height: 140,
    })),
    pageAttentionItems: [],
    callouts: [],
    qualitySummary: {
      firstBuildStepPageNumber: null,
      inferredCalloutBackgrounds: [],
    },
  }
}

function detectedStepResult(pageCount: number): StepCalloutDetectionResult {
  const imageDataUrl =
    "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="

  return {
    detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
    partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_VERSION,
    partExtractorVersion: STEP_PART_EXTRACTOR_VERSION,
    pageCount,
    pageLimit: null,
    scannedPageNumbers: [1],
    skippedPageNumbers: [],
    status: "detected",
    pagePreviews: [
      {
        pageNumber: 1,
        width: 100,
        height: 140,
        imageDataUrl,
      },
    ],
    pageAttentionItems: [],
    callouts: [
      {
        id: "callout-1",
        pageNumber: 1,
        indexOnPage: 0,
        stepIndex: 1,
        confidence: 0.9,
        sourceRegion: { x: 10, y: 20, width: 80, height: 40 },
        crop: {
          region: { x: 8, y: 18, width: 84, height: 44 },
          imageDataUrl,
        },
        inferredBackground: {
          hex: "#f7edcf",
          rgb: { r: 247, g: 237, b: 207 },
          confidence: 0.8,
        },
        partItems: [detectedPartItem(imageDataUrl)],
      },
    ],
    qualitySummary: {
      firstBuildStepPageNumber: 1,
      inferredCalloutBackgrounds: [
        {
          hex: "#f7edcf",
          rgb: { r: 247, g: 237, b: 207 },
          confidence: 0.8,
        },
      ],
    },
  }
}

function repeatedPartStepResult(pageCount: number): StepCalloutDetectionResult {
  const baseResult = detectedStepResult(pageCount)
  const partImageDataUrl = "data:image/png;base64,repeat-part"
  const partImage = {
    alphaMask: {
      data: new Uint8ClampedArray(24 * 14).fill(255),
      height: 14,
      width: 24,
    },
    region: { x: 20, y: 24, width: 24, height: 14 },
  }
  const calloutTemplate = baseResult.callouts[0]

  return {
    ...baseResult,
    scannedPageNumbers: [1, 2],
    pagePreviews: [
      ...baseResult.pagePreviews,
      {
        pageNumber: 2,
        width: 100,
        height: 140,
        imageDataUrl: "data:image/png;base64,page-2",
      },
    ],
    callouts: [
      {
        ...calloutTemplate,
        id: "callout-1",
        pageNumber: 1,
        stepIndex: 1,
        partItems: [
          {
            ...detectedPartItem("data:image/png;base64,quantity-1", {
              id: "part-item-1",
              partImageDataUrl,
              quantity: 2,
            }),
            partImage,
          },
        ],
      },
      {
        ...calloutTemplate,
        id: "callout-2",
        pageNumber: 2,
        stepIndex: 2,
        sourceRegion: { x: 10, y: 80, width: 80, height: 40 },
        crop: {
          region: { x: 8, y: 78, width: 84, height: 44 },
          imageDataUrl: "data:image/png;base64,callout-2",
        },
        partItems: [
          {
            ...detectedPartItem("data:image/png;base64,quantity-2", {
              id: "part-item-1",
              partImageDataUrl,
              quantity: 3,
            }),
            partImage,
          },
        ],
      },
    ],
  }
}

function noPreviewDetectedStepResult(pageCount: number): StepCalloutDetectionResult {
  const result = detectedStepResult(pageCount)

  return stripPreviewsFromStepResult(result)
}

function largeDetectedStepResult(): StepCalloutDetectionResult {
  const imageDataUrl =
    "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
  const result = detectedStepResult(1)

  return {
    ...result,
    callouts: result.callouts.map((callout) => ({
      ...callout,
      partItems: Array.from({ length: 301 }, (_, index) => ({
        ...detectedPartItem(imageDataUrl, {
          id: `part-item-${index + 1}`,
          quantity: 1,
        }),
        indexOnCallout: index,
      })),
    })),
  }
}

function noPreviewLargeDetectedStepResult(): StepCalloutDetectionResult {
  return stripPreviewsFromStepResult(largeDetectedStepResult())
}

function largeTwoPageDetectedStepResult(): StepCalloutDetectionResult {
  const result = largeDetectedStepResult()

  return {
    ...result,
    pageCount: 2,
    scannedPageNumbers: [1, 2],
    pagePreviews: [
      ...(result.pagePreviews ?? []),
      {
        pageNumber: 2,
        width: 100,
        height: 140,
        imageDataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
      },
    ],
  }
}

function noPreviewLargeTwoPageDetectedStepResult(): StepCalloutDetectionResult {
  return stripPreviewsFromStepResult(largeTwoPageDetectedStepResult())
}

function warmPagePartMaskResult(): StepCalloutDetectionResult {
  const imageDataUrl = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
  const baseResult = detectedStepResult(7)
  const calloutTemplate = baseResult.callouts[0]
  const page7PartRegion = { x: 18, y: 92, width: 96, height: 72 }
  const page7PartItem = {
    ...detectedPartItem(imageDataUrl, {
      id: "part-item-7",
      partImageDataUrl: imageDataUrl,
      quantity: 1,
    }),
    partImage: {
      alphaMask: {
        data: new Uint8ClampedArray(page7PartRegion.width * page7PartRegion.height).fill(255),
        height: page7PartRegion.height,
        width: page7PartRegion.width,
      },
      region: page7PartRegion,
    },
    partRegion: page7PartRegion,
  }

  return stripPreviewsFromStepResult({
    ...baseResult,
    pageCount: 7,
    scannedPageNumbers: [1, 2, 3, 4, 5, 6, 7],
    pagePreviews: Array.from({ length: 7 }, (_value, index) => ({
      pageNumber: index + 1,
      width: 100,
      height: 140,
      imageDataUrl,
    })),
    callouts: [
      calloutTemplate,
      {
        ...calloutTemplate,
        id: "callout-7",
        indexOnPage: 0,
        pageNumber: 7,
        stepIndex: 7,
        crop: {
          region: { x: 8, y: 78, width: 84, height: 44 },
          imageDataUrl,
        },
        partItems: [page7PartItem],
        sourceRegion: { x: 10, y: 80, width: 80, height: 40 },
      },
    ],
  })
}

function hydrateOnlyRequestedPreviewPages(
  current: StepCalloutDetectionResult,
  hydrated: StepCalloutDetectionResult,
  pageNumbers: readonly number[],
): StepCalloutDetectionResult {
  const pageNumberSet = new Set(pageNumbers)

  return {
    ...current,
    pagePreviews: current.pagePreviews.map((preview) =>
      pageNumberSet.has(preview.pageNumber)
        ? hydrated.pagePreviews.find((candidate) => candidate.pageNumber === preview.pageNumber) ?? preview
        : preview,
    ),
    callouts: current.callouts.map((callout) =>
      pageNumberSet.has(callout.pageNumber)
        ? hydrated.callouts.find((candidate) => candidate.id === callout.id) ?? callout
        : callout,
    ),
  }
}

function stripPreviewsFromStepResult(
  result: StepCalloutDetectionResult,
): StepCalloutDetectionResult {
  return {
    ...result,
    pagePreviews: result.pagePreviews.map((preview) => ({
      pageNumber: preview.pageNumber,
      width: preview.width,
      height: preview.height,
    })),
    callouts: result.callouts.map((callout) => ({
      ...callout,
      crop: {
        region: callout.crop.region,
      },
      partItems: callout.partItems.map((partItem) => ({
        ...partItem,
        partCrop: partItem.partCrop ? { region: partItem.partCrop.region ?? partItem.partRegion } : undefined,
        quantityLabel: {
          ...partItem.quantityLabel,
          crop: partItem.quantityLabel.crop
            ? { region: partItem.quantityLabel.crop.region ?? partItem.quantityLabel.region }
            : undefined,
        },
      })),
    })),
  }
}

function runtimePreviewObjectUrlResult(pageCount: number): StepCalloutDetectionResult {
  const result = detectedStepResult(pageCount)

  return {
    ...result,
    pagePreviews: result.pagePreviews.map((preview) => ({
      ...preview,
      imageDataUrl: `blob:page-${preview.pageNumber}`,
    })),
    callouts: result.callouts.map((callout) => ({
      ...callout,
      crop: {
        ...callout.crop,
        imageDataUrl: `blob:callout-${callout.stepIndex}`,
      },
      partItems: callout.partItems.map((partItem, index) => ({
        ...partItem,
        partCrop: partItem.partCrop
          ? {
              ...partItem.partCrop,
              imageDataUrl: `blob:part-${index + 1}`,
            }
          : partItem.partCrop,
        quantityLabel: {
          ...partItem.quantityLabel,
          crop: partItem.quantityLabel.crop
            ? {
                ...partItem.quantityLabel.crop,
                imageDataUrl: `blob:quantity-${index + 1}`,
              }
            : partItem.quantityLabel.crop,
        },
      })),
    })),
  }
}

function zeroPartDetectedStepResult(pageCount: number): StepCalloutDetectionResult {
  return {
    ...detectedStepResult(pageCount),
    callouts: detectedStepResult(pageCount).callouts.map((callout) => ({
      ...callout,
      partItems: [],
    })),
  }
}

function calloutOnlyDetectedStepResult(pageCount: number): StepCalloutDetectionResult {
  return {
    ...zeroPartDetectedStepResult(pageCount),
    partColorCalibrationVersion: undefined,
    partExtractorVersion: undefined,
  }
}

function detectedPartItem(
  imageDataUrl: string,
  options: {
    id?: string
    partImageDataUrl?: string
    quantity?: number
  } = {},
): StepCalloutDetectionResult["callouts"][number]["partItems"][number] {
  const quantity = options.quantity ?? 2

  return {
    id: options.id ?? "part-item-1",
    indexOnCallout: 0,
    confidence: 0.86,
    detectedColor: {
      name: "Dark Bluish Gray",
      hex: "#6c6e68",
      rgb: { r: 108, g: 110, b: 104 },
      family: "gray",
      rarityTier: "common",
      alternatives: ["Light Bluish Gray", "Black"],
      confidence: 0.94,
      distance: 0,
      observedHex: "#6c6e68",
      observedRgb: { r: 108, g: 110, b: 104 },
      status: "exact",
      swatchHex: "#6c6e68",
    },
    sourceRegion: { x: 12, y: 24, width: 32, height: 18 },
    partRegion: { x: 20, y: 24, width: 24, height: 14 },
    quantityLabel: {
      region: { x: 12, y: 34, width: 8, height: 8 },
      crop: {
        imageDataUrl,
      },
    },
    quantity: {
      value: quantity,
      text: `${quantity}x`,
      confidence: 0.92,
    },
    partCrop: {
      imageDataUrl: options.partImageDataUrl ?? imageDataUrl,
    },
  } as StepCalloutDetectionResult["callouts"][number]["partItems"][number]
}

function staleDetectedStepResult(pageCount: number): StepCalloutDetectionResult {
  return {
    ...detectedStepResult(pageCount),
    detectorVersion: "0.131.0",
  }
}

function staleColorDetectedStepResult(pageCount: number): StepCalloutDetectionResult {
  return {
    ...detectedStepResult(pageCount),
    partColorCalibrationVersion: undefined,
  }
}

describe("BaggingApp shell", () => {
  it("disables the primary action until a PDF is selected", async () => {
    renderApp()

    await screen.findByRole("tab", { name: /build steps/i })
    expect(screen.getByRole("button", { name: /bag it/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /download/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled()
    expect(screen.getByText("Part grouping")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", {
      name: /part grouping progress/i,
    })).toHaveAttribute("aria-valuenow", "0")
  })

  it("shows the selected PDF name and purge action", async () => {
    const user = userEvent.setup()
    renderApp()

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("status")

    expect(screen.getByText("manual.pdf")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /bag it/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /download/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled()
    expect(
      screen.getByRole("button", { name: /remove selected manual/i }),
    ).toBeInTheDocument()
  })

  it("rejects non-PDF files with retry guidance", async () => {
    renderApp()

    const textFile = new File(["notes"], "notes.txt", {
      type: "text/plain",
    })

    fireEvent.change(screen.getByLabelText(/pdf manual/i), {
      target: { files: [textFile] },
    })

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a PDF manual to continue.",
    )
    expect(screen.getByText("Upload PDF manual")).toBeInTheDocument()
  })

  it("reads PDF metadata after PDF selection", async () => {
    const user = userEvent.setup()
    const readPdfMetadata = vi.fn(async (file: File) => metadataFor(file, 4))
    renderApp({ readPdfMetadata })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    expect(await screen.findByRole("status")).toHaveTextContent("4 pages scanned")
    expect(screen.getByText(/read 4 pages/i)).toBeInTheDocument()
    expect(screen.getAllByText("Scanning pages").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Extracting parts").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Generating previews").length).toBeGreaterThan(0)
    expect(screen.getByText("Pages: 4/4; 0 callouts; 0 parts")).toBeInTheDocument()
    expect(readPdfMetadata).toHaveBeenCalledWith(
      manual,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("renders page and callout previews after step scan", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => detectedStepResult(1))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    expect(await screen.findByRole("img", { name: "Page 1 preview" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
    const quantityCrop = screen.getByRole("img", { name: "Callout 1 quantity 1 crop" })
    const partCrop = screen.getByRole("img", { name: "Callout 1 part 1 crop" })
    expect(quantityCrop).toBeInTheDocument()
    expect(partCrop).toBeInTheDocument()
    expect(screen.getByText("Page preview")).toBeInTheDocument()
    expect(screen.getByText("Callout preview")).toBeInTheDocument()
    expect(screen.getByText("Multiplier")).toBeInTheDocument()
    expect(screen.queryByText("Background")).not.toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: "Step 1 multiplier" })).toHaveValue(1)
    const partTypesMetric = screen.getByText("Part types").parentElement as HTMLElement
    const totalQuantityMetric = screen.getByText("Total qty").parentElement as HTMLElement
    const partRowsTable = screen.getByRole("table", {
      name: "Part rows for page 1 callout 1",
    })

    expect(partTypesMetric).toHaveTextContent("1")
    expect(totalQuantityMetric).toHaveTextContent("2")
    expect(within(partRowsTable).getByRole("button", { name: /sort part rows by quantity/i })).toBeInTheDocument()
    expect(within(partRowsTable).getByRole("button", { name: /sort part rows by color/i })).toBeInTheDocument()
    expect(within(partRowsTable).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Quantity",
      "Part image",
      "Color",
    ])
    expect(within(partRowsTable).getByText("Dark Bluish Gray")).toBeInTheDocument()
    const partColorCell = within(partRowsTable).getByText("Dark Bluish Gray").closest("td") as HTMLElement
    expect(within(partColorCell).getByText("94% confidence")).toBeInTheDocument()
    expect(partColorCell).not.toHaveTextContent("gray; exact; 94%")
    expect(partColorCell.querySelector("[data-color-swatch-hex]"))
      .toHaveAttribute("data-color-swatch-hex", "#6C6E68")
    expect(within(partRowsTable).getByText("Part image")).toBeInTheDocument()
    expect(within(partRowsTable).queryByText("Quantity crop")).not.toBeInTheDocument()
    expect(within(partRowsTable).queryByText("Qty value")).not.toBeInTheDocument()
    expect(quantityCrop).toHaveStyle({ height: "8px", width: "8px" })
    expect(partCrop).toHaveStyle({ height: "14px", width: "24px" })
    expect(quantityCrop.closest(".preview-card")).toHaveStyle({ width: "fit-content" })
    expect(quantityCrop.closest(".preview-frame")).toHaveStyle({ width: "fit-content" })
    expect(partCrop.closest(".preview-card")).toHaveStyle({ width: "fit-content" })
    expect(partCrop.closest(".preview-frame")).toHaveStyle({ width: "fit-content" })
    expect(partCrop.closest(".preview-frame")).toHaveAttribute("data-preview-background", "#f7edcf")
    expect(within(partRowsTable).getByText("2x")).toBeInTheDocument()
    expect(screen.getByText("1 callout across 1 scanned page")).toBeInTheDocument()
  })

  it("keeps preview rendering off the scan critical path", async () => {
    const user = userEvent.setup()
    const rawResult = noPreviewDetectedStepResult(1)
    const scanStepCallouts = vi.fn(async () => rawResult)
    const createPagePreviewAsset = vi.fn(
      async (_file: File, result: StepCalloutDetectionResult, pageNumber: number) =>
        fakePagePreviewAsset(result, pageNumber),
    )
    renderApp({ createPagePreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() =>
      expect(scanStepCallouts).toHaveBeenCalledWith(
        manual,
        expect.objectContaining({ eagerPreviewImages: false, parallelPageDetection: true }),
      ),
    )
    expect(createPagePreviewAsset).toHaveBeenCalledWith(
      manual,
      rawResult,
      1,
      expect.objectContaining({ targetWidth: 2200, signal: expect.any(AbortSignal) }),
    )
    expect(await screen.findByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
  })

  it("hydrates visible crop previews when large-manual preview backlog is deferred", async () => {
    const user = userEvent.setup()
    const rawResult = noPreviewLargeDetectedStepResult()
    const scanStepCallouts = vi.fn(async () => rawResult)
    const createPagePreviewAsset = vi.fn(
      async (_file: File, result: StepCalloutDetectionResult, pageNumber: number) =>
        fakePagePreviewAsset(result, pageNumber),
    )
    renderApp({ createPagePreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() =>
      expect(createPagePreviewAsset).toHaveBeenCalledWith(
        manual,
        rawResult,
        1,
        expect.objectContaining({ targetWidth: 2200 }),
      ),
    )
    expect(await screen.findByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
  })

  it("continues hydrating preview pages in the background without scrolling", async () => {
    const user = userEvent.setup()
    const rawResult = noPreviewLargeTwoPageDetectedStepResult()
    const scanStepCallouts = vi.fn(async () => rawResult)
    const createPagePreviewAsset = vi.fn(
      async (_file: File, result: StepCalloutDetectionResult, pageNumber: number) =>
        fakePagePreviewAsset(result, pageNumber),
    )

    vi.stubGlobal("IntersectionObserver", class {
      disconnect() {}
      observe() {}
      unobserve() {}
    })
    renderApp({ createPagePreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() =>
      expect(createPagePreviewAsset).toHaveBeenCalledWith(
        manual,
        expect.any(Object),
        1,
        expect.any(Object),
      ),
    )
    await waitFor(() =>
      expect(createPagePreviewAsset).toHaveBeenCalledWith(
        manual,
        expect.any(Object),
        2,
        expect.any(Object),
      ),
      { timeout: 3_000 },
    )
  })

  it("keeps scan-time preview progress when extraction result arrives after page previews finish", async () => {
    const user = userEvent.setup()
    const rawResult = noPreviewLargeTwoPageDetectedStepResult()
    const scanStepCallouts: ScanStepCallouts = vi.fn(async (
      _file: File,
      options: {
        onPreviewPageInput?: (pageInput: StepDetectorV2PageInput, baseBounds: PagePreviewBaseBounds) => void
      } = {},
    ) => {
      options.onPreviewPageInput?.(fakeRuntimePageInput(1), { width: 100, height: 140 })
      options.onPreviewPageInput?.(fakeRuntimePageInput(2), { width: 100, height: 140 })
      await flushTimers()
      await flushTimers()

      return rawResult
    })
    const createPagePreviewAsset = vi.fn(
      async (_file: File, result: StepCalloutDetectionResult, pageNumber: number) =>
        fakePagePreviewAsset(result, pageNumber),
    )

    renderApp({ createPagePreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: /generating previews progress/i }))
        .toHaveAttribute("aria-valuenow", "100"),
    )
    expect(screen.getByText("Previews ready")).toBeInTheDocument()
    expect(createPagePreviewAsset).not.toHaveBeenCalled()
  })

  it("hydrates part masks for warm preview pages after their page asset is ready", async () => {
    const user = userEvent.setup()
    const rawResult = warmPagePartMaskResult()
    const scanStepCallouts = vi.fn(async () => rawResult)
    const createPagePreviewAsset = vi.fn(
      async (_file: File, result: StepCalloutDetectionResult, pageNumber: number) =>
        fakePagePreviewAsset(result, pageNumber),
    )
    const createPartMaskPreviewAsset = vi.fn(async (_pageAsset: PagePreviewAsset, partItem) => ({
      height: partItem.partImage?.region.height ?? 1,
      partItemId: partItem.id,
      url: `data:image/png;base64,mask-${partItem.id}`,
      width: partItem.partImage?.region.width ?? 1,
    }))

    renderApp({ createPagePreviewAsset, createPartMaskPreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() =>
      expect(createPagePreviewAsset).toHaveBeenCalledWith(
        manual,
        expect.any(Object),
        7,
        expect.any(Object),
      ),
      { timeout: 3_000 },
    )
    await waitFor(() =>
      expect(createPartMaskPreviewAsset).toHaveBeenCalledWith(
        expect.objectContaining({ pageNumber: 7 }),
        expect.objectContaining({ id: "part-item-7" }),
        expect.any(AbortSignal),
      ),
      { timeout: 3_000 },
    )
  })

  it("keeps deferred preview progress on the full backlog instead of marking it complete", async () => {
    const user = userEvent.setup()
    const rawResult = noPreviewLargeTwoPageDetectedStepResult()
    const scanStepCallouts = vi.fn(async () => rawResult)
    const createPagePreviewAsset = vi.fn(
      async (_file: File, result: StepCalloutDetectionResult, pageNumber: number) => {
        if (pageNumber === 2) {
          return new Promise<PagePreviewAsset>(() => undefined)
        }

        return fakePagePreviewAsset(result, pageNumber)
      },
    )

    vi.stubGlobal("IntersectionObserver", class {
      disconnect() {}
      observe() {}
      unobserve() {}
    })
    renderApp({ createPagePreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: /generating previews progress/i }))
        .toHaveAttribute("aria-valuenow", "50"),
    )
    expect(screen.getByText("Preview pages: 1/2")).toBeInTheDocument()
  })

  it("revokes runtime preview object urls on purge", async () => {
    const user = userEvent.setup()
    const revokeObjectURL = vi.fn()
    const resultWithPartMask = noPreviewDetectedStepResult(1)
    const firstPartItem = resultWithPartMask.callouts[0]?.partItems[0]

    if (firstPartItem) {
      firstPartItem.partImage = {
        alphaMask: {
          data: new Uint8ClampedArray(firstPartItem.partRegion.width * firstPartItem.partRegion.height).fill(255),
          height: firstPartItem.partRegion.height,
          width: firstPartItem.partRegion.width,
        },
        region: firstPartItem.partRegion,
      }
    }

    const scanStepCallouts = vi.fn(async () => resultWithPartMask)
    const createPagePreviewAsset = vi.fn(
      async (_file: File, result: StepCalloutDetectionResult, pageNumber: number) => ({
        ...fakePagePreviewAsset(result, pageNumber),
        url: `blob:page-${pageNumber}`,
      }),
    )
    const createPartMaskPreviewAsset = vi.fn(async (_pageAsset: PagePreviewAsset, partItem) => ({
      height: 14,
      partItemId: partItem.id,
      url: `blob:part-${partItem.id}`,
      width: 24,
    }))

    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:download"),
      revokeObjectURL,
    })
    renderApp({ createPagePreviewAsset, createPartMaskPreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })
    await waitFor(() => expect(createPartMaskPreviewAsset).toHaveBeenCalled())
    await user.click(screen.getByRole("button", { name: /remove selected manual/i }))

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:page-1")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:part-part-item-1")
  })

  it("caps large part image thumbnails while keeping their aspect ratio", async () => {
    const user = userEvent.setup()
    const rawResult = noPreviewDetectedStepResult(1)
    const firstPartItem = rawResult.callouts[0].partItems[0]

    rawResult.callouts[0].partItems[0] = {
      ...firstPartItem,
      partImage: {
        alphaMask: {
          data: new Uint8ClampedArray(160 * 120).fill(255),
          height: 120,
          width: 160,
        },
        region: { height: 120, width: 160, x: 1, y: 1 },
      },
      partRegion: { height: 120, width: 160, x: 1, y: 1 },
    }
    const scanStepCallouts = vi.fn(async () => rawResult)
    const createPartMaskPreviewAsset = vi.fn(async (_pageAsset: PagePreviewAsset, partItem) => ({
      height: (partItem.partImage?.region.height ?? 1) * 10,
      partItemId: partItem.id,
      url: `data:image/png;base64,mask-${partItem.id}`,
      width: (partItem.partImage?.region.width ?? 1) * 10,
    }))

    vi.stubGlobal("ResizeObserver", class TestResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    })
    renderApp({ createPartMaskPreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    const partPreview = await screen.findByRole("img", { name: "Callout 1 part 1 crop" })

    await waitFor(() => expect(createPartMaskPreviewAsset).toHaveBeenCalled())
    await waitFor(() => expect(partPreview.getAttribute("style")).toContain("width: 64px"))
    expect(partPreview.getAttribute("style")).toContain("height: 48px")

    await user.hover(partPreview)
    await waitFor(() => expect(document.querySelector(".preview-zoom-panel")).toBeInTheDocument())
    await waitFor(() => {
      const hoverPreviewStyles = Array.from(
        document.querySelectorAll<HTMLElement>(".preview-zoom-panel [aria-hidden='true']"),
      ).map((element) => element.getAttribute("style") ?? "")

      expect(hoverPreviewStyles.some((style) => style.includes("width: 480px"))).toBe(true)
      expect(hoverPreviewStyles.some((style) => style.includes("width: 1600px"))).toBe(false)
    })
  })

  it("opens Build steps pages initially and mounts deferred page bodies near the viewport", async () => {
    const user = userEvent.setup()
    const intersection = installControlledIntersectionObserver()
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() =>
      expect(document.querySelector("[data-v2-page-number='1']")).toBeInTheDocument(),
    )
    const page1Item = document.querySelector("[data-v2-page-number='1']")
    const page2Item = document.querySelector("[data-v2-page-number='2']")
    const page2Trigger = document.querySelector("[data-v2-page-trigger='2']")

    expect(page1Item).toBeInTheDocument()
    expect(page2Item).toBeInTheDocument()
    expect(page2Trigger).toBeInTheDocument()
    expect(page2Trigger).toHaveAttribute("aria-expanded", "true")
    expect(page2Item).toHaveAttribute("data-v2-page-body-state", "skeleton")
    expect(screen.queryByRole("img", { name: "Callout 2 crop" })).not.toBeInTheDocument()

    if (!(page1Item instanceof HTMLElement) || !(page2Item instanceof HTMLElement)) {
      throw new Error("Expected page accordion items")
    }

    intersection.trigger(page1Item, true)
    expect(await screen.findByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
    expect(page2Item).toHaveAttribute("data-v2-page-body-state", "skeleton")

    intersection.trigger(page2Item, true)

    expect(await screen.findByRole("img", { name: "Callout 2 crop" })).toBeInTheDocument()
    expect(page2Item).toHaveAttribute("data-v2-page-body-state", "mounted")
    expect(intersection.rootMargins()).toContain(`${window.innerHeight * 2}px 0px`)
  })

  it("reserves pending part preview dimensions before image bytes hydrate", async () => {
    const user = userEvent.setup()
    const rawResult = noPreviewDetectedStepResult(1)
    const scanStepCallouts = vi.fn(async () => rawResult)
    const createPagePreviewAsset = vi.fn(
      () => new Promise<PagePreviewAsset>(() => undefined),
    )
    renderApp({ createPagePreviewAsset, scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await waitFor(() => expect(screen.getAllByText("Preparing page").length).toBeGreaterThan(0))

    expect(
      screen.getAllByText("Preparing page").some((preview) => {
        expect(preview).toBeInTheDocument()
        return preview.getAttribute("style")?.includes("width: 24px") &&
          preview.getAttribute("style")?.includes("height: 14px")
      }),
    ).toBe(true)
  })

  it("uses current region dimensions for page-backed part previews", async () => {
    const user = userEvent.setup()
    const rawResult = noPreviewDetectedStepResult(1)
    const firstPartItem = rawResult.callouts[0].partItems[0]

    rawResult.callouts[0].partItems[0] = {
      ...firstPartItem,
      partCrop: {
        region: { height: 12, width: 60, x: 1, y: 1 },
      },
    }
    const scanStepCallouts = vi.fn(async () => rawResult)
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    const partPreview = await screen.findByRole("img", { name: "Callout 1 part 1 crop" })

    expect(partPreview.getAttribute("style")).toContain("width: 24px")
    expect(partPreview.getAttribute("style")).toContain("height: 14px")
  })

  it("keeps page-backed callout previews at the callout crop aspect ratio", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => noPreviewDetectedStepResult(1))

    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    const calloutPreview = await screen.findByRole("img", { name: "Callout 1 crop" })

    expect(calloutPreview.getAttribute("style")).toContain("aspect-ratio: 84 / 44")
    expect(calloutPreview.getAttribute("style")).toContain("max-width: 420px")
  })

  it("shows larger page-backed hover previews for callout preview cards", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => noPreviewDetectedStepResult(1))

    vi.stubGlobal("ResizeObserver", class TestResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    })
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await user.hover(await screen.findByRole("img", { name: "Callout 1 crop" }))

    await waitFor(() => expect(document.querySelector(".preview-zoom-panel")).toBeInTheDocument())
    await waitFor(() => {
      const hoverPreviewStyles = Array.from(
        document.querySelectorAll<HTMLElement>(".preview-zoom-panel [aria-hidden='true']"),
      ).map((element) => element.getAttribute("style") ?? "")

      expect(hoverPreviewStyles.some((style) => style.includes("520px"))).toBe(true)
    })
  })

  it("shows page-backed hover previews for bag step handles", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => noPreviewDetectedStepResult(1))

    vi.stubGlobal("ResizeObserver", class TestResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    })
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await user.click(await screen.findByRole("tab", { name: "Bags" }))
    await user.hover(await screen.findByRole("button", { name: "Step 1" }))

    expect(await screen.findByRole("img", { name: "Step 1 callout preview" }))
      .toBeInTheDocument()
  })

  it("updates step totals while part rows keep raw raster quantities", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => detectedStepResult(1))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await screen.findByRole("img", { name: "Callout 1 crop" })

    const multiplierInput = screen.getByRole("spinbutton", { name: "Step 1 multiplier" })
    const totalQuantityMetric = screen.getByText("Total qty").parentElement as HTMLElement
    const partRowsTable = screen.getByRole("table", {
      name: "Part rows for page 1 callout 1",
    })

    expect(multiplierInput).toHaveValue(1)
    expect(totalQuantityMetric).toHaveTextContent("2")
    expect(within(partRowsTable).getByText("2x")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Increase step 1 multiplier" }))

    expect(multiplierInput).toHaveValue(2)
    expect(totalQuantityMetric).toHaveTextContent("4")
    expect(within(partRowsTable).getByText("2x")).toBeInTheDocument()

    fireEvent.change(multiplierInput, { target: { value: "3" } })

    expect(multiplierInput).toHaveValue(3)
    expect(totalQuantityMetric).toHaveTextContent("6")
    expect(within(partRowsTable).getByText("2x")).toBeInTheDocument()
  })

  it("renders packing bags with immediate quantity-weighted completion", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => detectedStepResult(1))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })

    await user.click(screen.getByRole("tab", { name: /bags/i }))

    expect(screen.getByText("Bag checklist")).toBeInTheDocument()
    expect(
      screen.getByText("1 bag · 1 callout · 2 detected parts · detected sizing · small band"),
    ).toBeInTheDocument()
    expect(screen.getAllByText("Bag 1 · Page 1").length).toBeGreaterThan(0)
    expect(screen.queryByText(/draft/i)).not.toBeInTheDocument()
    const groupingSwitch = screen.getByRole("switch", {
      name: "Group bag checklist by color",
    })

    expect(groupingSwitch).not.toBeChecked()

    fireEvent.click(groupingSwitch)

    expect(groupingSwitch).toBeChecked()
    expect(screen.getAllByText("Dark Bluish Gray").length).toBeGreaterThan(0)

    fireEvent.click(groupingSwitch)

    const groupProgress = screen.getByText("0/2 parts packed")

    expect(groupProgress).toBeInTheDocument()
    expect(groupProgress.closest('[data-part="item-content"]')).toBeNull()

    const bagTable = screen.getByRole("table", { name: "Bag checklist rows" })
    expect(within(bagTable).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "",
      "Done",
      "Quantity",
      "Part preview",
      "Color",
      "Page",
      "Step",
    ])
    expect(within(bagTable).getByText("Dark Bluish Gray")).toBeInTheDocument()
    const bagColorCell = within(bagTable).getByText("Dark Bluish Gray").closest("td") as HTMLElement
    expect(within(bagColorCell).getByText("94% confidence")).toBeInTheDocument()
    expect(bagColorCell).not.toHaveTextContent("exact; 94%")
    expect(bagColorCell.querySelector("[data-color-swatch-hex]"))
      .toHaveAttribute("data-color-swatch-hex", "#6C6E68")
    expect(within(bagTable).getByText("Page 1")).toBeInTheDocument()
    expect(within(bagTable).getByText("Step 1")).toBeInTheDocument()
    const bagPartCrop = within(bagTable).getByRole("img", {
      name: "Bag 1 page 1 step 1 part crop",
    })
    expect(bagPartCrop.closest(".preview-frame")).toHaveAttribute("data-preview-background", "#f7edcf")
    expect(screen.getByText("0/2 parts · 0%")).toBeInTheDocument()

    const checkbox = within(bagTable).getByRole("checkbox", {
      name: /mark bag 1 page 1 step 1 part 1 packed/i,
    })
    const checkboxControl = checkbox
      .closest('[data-scope="checkbox"]')
      ?.querySelector('[data-part="control"]')

    if (!(checkboxControl instanceof HTMLElement)) {
      throw new Error("Expected visible checkbox control")
    }

    fireEvent.click(checkboxControl)

    expect(checkbox).toBeChecked()
    await waitFor(() => expect(screen.getByText("2/2 parts · 100%")).toBeInTheDocument())
  })

  it("groups exact same parts inside each bag without merging raw checklist rows", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })
    await user.click(screen.getByRole("tab", { name: /bags/i }))

    const samePartSwitch = screen.getByRole("switch", {
      name: "Group parts inside bags",
    })

    expect(samePartSwitch).not.toBeChecked()

    await waitFor(() => expect(samePartSwitch).toBeEnabled())
    expect(screen.getByText("Part grouping")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", {
      name: /part grouping progress/i,
    })).toHaveAttribute("aria-valuenow", "100")

    fireEvent.click(samePartSwitch)

    expect(samePartSwitch).toBeChecked()
    expect(screen.getAllByText("5 parts").length).toBeGreaterThan(0)
    expect(screen.queryByText("Same part 1")).not.toBeInTheDocument()
    expect(screen.queryByText("Exact match")).not.toBeInTheDocument()

    expect(screen.queryByRole("table", {
      name: "Same part 1 bag checklist rows",
    })).not.toBeInTheDocument()

    const groupedTable = screen.getByRole("table", {
      name: "Bag checklist rows",
    })
    const groupCheckbox = await screen.findByRole("checkbox", {
      name: "Mark part group 1 packed",
    })

    expect(groupCheckbox).not.toBeChecked()

    await user.click(screen.getByRole("button", {
      name: "Expand part group 1",
    }))

    expect((await screen.findAllByText("2x")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("3x").length).toBeGreaterThan(0)

    const firstCheckbox = screen.getByRole("checkbox", {
      name: /mark bag 1 page 1 step 1 part 1 packed/i,
    })
    const firstCheckboxControl = firstCheckbox
      .closest('[data-scope="checkbox"]')
      ?.querySelector('[data-part="control"]')

    if (!(firstCheckboxControl instanceof HTMLElement)) {
      throw new Error("Expected visible checkbox control")
    }

    fireEvent.click(firstCheckboxControl)

    expect(firstCheckbox).toBeChecked()
    await waitFor(() => expect(screen.getByText("2/5 parts · 40%")).toBeInTheDocument())

    const groupCheckboxControl = groupCheckbox
      .closest('[data-scope="checkbox"]')
      ?.querySelector('[data-part="control"]')

    if (!(groupCheckboxControl instanceof HTMLElement)) {
      throw new Error("Expected visible group checkbox control")
    }

    fireEvent.click(groupCheckboxControl)

    await waitFor(() => expect(screen.getByText("5/5 parts · 100%")).toBeInTheDocument())
    expect(firstCheckbox).toBeChecked()

    fireEvent.click(firstCheckboxControl)

    expect(firstCheckbox).not.toBeChecked()
    await waitFor(() => expect(screen.getByText("3/5 parts · 60%")).toBeInTheDocument())

    fireEvent.click(groupCheckboxControl)

    await waitFor(() => expect(screen.getByText("5/5 parts · 100%")).toBeInTheDocument())
    expect(firstCheckbox).toBeChecked()
  })

  it("surfaces part grouping failures without enabling grouped rows", async () => {
    const user = userEvent.setup()
    partMatchingMock.createPartMatchGroups.mockImplementation(() => {
      throw new Error("scorer unavailable")
    })
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })
    await user.click(screen.getByRole("tab", { name: /bags/i }))

    const samePartSwitch = screen.getByRole("switch", {
      name: "Group parts inside bags",
    })

    await screen.findByText("scorer unavailable")
    expect(screen.getAllByText("failed").length).toBeGreaterThan(0)
    expect(screen.getByRole("progressbar", {
      name: /part grouping progress/i,
    })).toHaveAttribute("aria-valuenow", "100")
    expect(samePartSwitch).toBeDisabled()
    expect(screen.queryByRole("checkbox", {
      name: "Mark part group 1 packed",
    })).not.toBeInTheDocument()
  })

  it("surfaces CNN scorer load failures without static suggested fallback", async () => {
    const user = userEvent.setup()
    cnnScorerMock.createCnnPartPairScoreFeatures.mockRejectedValueOnce(
      new Error("Part grouping scorer failed to load."),
    )
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })
    await user.click(screen.getByRole("tab", { name: /bags/i }))

    const samePartSwitch = screen.getByRole("switch", {
      name: "Group parts inside bags",
    })

    await screen.findByText("Part grouping scorer failed to load.")
    expect(samePartSwitch).toBeDisabled()
    expect(partMatchingMock.createPartMatchGroups).not.toHaveBeenCalled()
  })

  it("terminates active part grouping workers on purge", async () => {
    const user = userEvent.setup()
    const workers: Array<{ terminate: ReturnType<typeof vi.fn> }> = []

    class MockPartMatchWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      postMessage = vi.fn()
      terminate = vi.fn()

      constructor() {
        workers.push(this)
      }
    }

    vi.stubGlobal("Worker", MockPartMatchWorker)
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })

    await waitFor(() => expect(workers).toHaveLength(1))

    await user.click(screen.getByRole("button", { name: "Remove selected manual" }))

    await waitFor(() => expect(workers[0]?.terminate).toHaveBeenCalledTimes(1))
  })

  it("transfers cloned part grouping buffers to the worker", async () => {
    const user = userEvent.setup()
    const workerPosts: Array<{
      message: { rows: PartMatchRowInput[]; type: "compute" }
      transferList: Transferable[]
    }> = []

    class MockPartMatchWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      postMessage = vi.fn((
        message: { rows: PartMatchRowInput[]; type: "compute" },
        transferList: Transferable[] = [],
      ) => {
        workerPosts.push({ message, transferList })
        window.setTimeout(() => {
          this.onmessage?.(new MessageEvent("message", {
            data: { groups: [], type: "complete" },
          }))
        }, 0)
      })
      terminate = vi.fn()
    }

    vi.stubGlobal("Worker", MockPartMatchWorker)
    const rawResult = repeatedPartStepResult(2)
    const originalPartItem = rawResult.callouts[0]?.partItems[0]

    if (!originalPartItem?.partImage?.alphaMask) {
      throw new Error("Expected repeated-part fixture to include a part image alpha mask")
    }

    const originalAlphaData = originalPartItem.partImage.alphaMask.data
    const scanStepCallouts = vi.fn(async () => rawResult)
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })

    await waitFor(() => expect(workerPosts).toHaveLength(1))

    const workerPost = workerPosts[0]
    const postedAlphaData = workerPost?.message.rows[0]?.alphaMask?.data

    expect(postedAlphaData).toBeInstanceOf(Uint8ClampedArray)
    expect(postedAlphaData).not.toBe(originalAlphaData)
    expect(originalAlphaData).toBeInstanceOf(Uint8ClampedArray)
    expect((originalAlphaData as Uint8ClampedArray).byteLength).toBe(24 * 14)
    expect(workerPost?.transferList).toContain((postedAlphaData as Uint8ClampedArray).buffer)
    expect(workerPost?.transferList.length).toBeGreaterThanOrEqual(4)
    expect(workerPost?.transferList.every((item) => item instanceof ArrayBuffer)).toBe(true)
  })

  it("surfaces explicit part grouping worker errors", async () => {
    const user = userEvent.setup()
    const workers: Array<{ terminate: ReturnType<typeof vi.fn> }> = []

    class MockPartMatchWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onmessageerror: ((event: MessageEvent) => void) | null = null
      postMessage = vi.fn(() => {
        window.setTimeout(() => {
          this.onmessage?.(new MessageEvent("message", {
            data: {
              errorMessage: "Worker scorer crashed",
              type: "error",
            },
          }))
        }, 0)
      })
      terminate = vi.fn()

      constructor() {
        workers.push(this)
      }
    }

    vi.stubGlobal("Worker", MockPartMatchWorker)
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })
    await user.click(screen.getByRole("tab", { name: /bags/i }))

    const samePartSwitch = screen.getByRole("switch", {
      name: "Group parts inside bags",
    })

    await screen.findByText("Worker scorer crashed")
    expect(samePartSwitch).toBeDisabled()
    await waitFor(() => expect(workers[0]?.terminate).toHaveBeenCalledTimes(1))
  })

  it("groups same parts when restored part crops have no serialized image bytes", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () =>
      stripPreviewsFromStepResult(repeatedPartStepResult(2))
    )
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 part 1 crop" })
    await user.click(screen.getByRole("tab", { name: /bags/i }))

    const samePartSwitch = screen.getByRole("switch", {
      name: "Group parts inside bags",
    })

    await waitFor(() => expect(samePartSwitch).toBeEnabled())

    fireEvent.click(samePartSwitch)

    expect(samePartSwitch).toBeChecked()
    expect(screen.queryByText("Same part 1")).not.toBeInTheDocument()
    expect(screen.queryByText("Exact match")).not.toBeInTheDocument()

    const groupedTable = screen.getByRole("table", {
      name: "Bag checklist rows",
    })

    expect(await screen.findByRole("checkbox", {
      name: "Mark part group 1 packed",
    })).toBeInTheDocument()

    await user.click(screen.getByRole("button", {
      name: "Expand part group 1",
    }))

    expect((await screen.findAllByText("2x")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("3x").length).toBeGreaterThan(0)
  })

  it("uses two-lane part grouping scorer configs in the app", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })
    await user.click(screen.getByRole("tab", { name: /bags/i }))

    await waitFor(() => {
      const laneCalls = partMatchingMock.createPartMatchGroups.mock.calls
        .map(([input]) => input as {
          enableLabelGatedNearMatches?: boolean
          pairScorerConfig?: { metadata?: { lane?: string } } | null
        })
        .filter((input) => input.enableLabelGatedNearMatches)

      expect(laneCalls.map((input) => input.pairScorerConfig?.metadata?.lane))
        .toEqual(expect.arrayContaining(["auto", "suggested"]))
    })
    partMatchingMock.createPartMatchGroups.mockClear()

    const samePartSwitch = screen.getByRole("switch", {
      name: "Group parts inside bags",
    })

    await waitFor(() => expect(samePartSwitch).toBeEnabled())

    fireEvent.click(samePartSwitch)

    const groupedTable = screen.getByRole("table", {
      name: "Bag checklist rows",
    })

    expect(await screen.findByRole("checkbox", {
      name: "Mark part group 1 packed",
    })).toBeInTheDocument()
    expect(partMatchingMock.createPartMatchGroups).not.toHaveBeenCalled()
  })

  it("shows tooltips for icon-only bagging controls", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))

    vi.stubGlobal("ResizeObserver", class TestResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    })

    partMatchingMock.createPartMatchGroups.mockImplementation((input) => {
      const groupInput = input as Parameters<typeof import("@bag-it/part-matching")["createPartMatchGroups"]>[0]
      const lane = groupInput.pairScorerConfig?.metadata?.lane

      if (lane === "auto") {
        return []
      }

      if (lane === "suggested") {
        return [{
          bagId: groupInput.rows[0]?.bagId ?? "bag-1",
          confidence: 0.98,
          groupId: "suggested-part-group-tooltip-test",
          matchKind: "label-gated-near",
          reasons: ["test suggested group"],
          rowIds: groupInput.rows.slice(0, 2).map((row) => row.rowId),
        }]
      }

      return partMatchingMock.createPartMatchGroupsImplementation?.(groupInput) ?? []
    })

    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await expectTooltipAfterHover(
      user,
      await screen.findByRole("button", { name: "Remove selected manual" }),
      "Remove selected manual",
    )
    await screen.findByRole("img", { name: "Callout 1 crop" })

    const increaseMultiplierButton = screen.getByRole("button", {
      name: "Increase step 1 multiplier",
    })
    await expectTooltipAfterHover(user, increaseMultiplierButton, "Increase step 1 multiplier")
    await user.click(increaseMultiplierButton)
    await expectTooltipAfterHover(
      user,
      screen.getByRole("button", { name: "Decrease step 1 multiplier" }),
      "Decrease step 1 multiplier",
    )

    await user.click(screen.getByRole("tab", { name: /bags/i }))

    const samePartSwitch = screen.getByRole("switch", {
      name: "Group parts inside bags",
    })

    await waitFor(() => expect(samePartSwitch).toBeEnabled())
    fireEvent.click(samePartSwitch)

    const rejectButton = await screen.findByRole("button", {
      name: "Reject suggested part group 1",
    })
    const expandButton = screen.getByRole("button", {
      name: "Expand part group 1",
    })

    await expectTooltipAfterHover(user, expandButton, "Expand part group 1")
    await expectTooltipAfterHover(user, rejectButton, "Reject suggested part group 1")
    await user.click(expandButton)

    const removeButton = screen.getAllByRole("button", {
      name: /remove .* row from suggested part group/i,
    })[0]
    const removeButtonLabel = removeButton.getAttribute("aria-label")

    if (!removeButtonLabel) {
      throw new Error("Expected suggested part row remove button label")
    }

    await expectTooltipAfterHover(user, removeButton, removeButtonLabel)
  })

  it("lets suggested part groups be rejected or split without changing raw rows", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => repeatedPartStepResult(2))

    partMatchingMock.createPartMatchGroups.mockImplementation((input) => {
      const groupInput = input as Parameters<typeof import("@bag-it/part-matching")["createPartMatchGroups"]>[0]
      const lane = groupInput.pairScorerConfig?.metadata?.lane

      if (lane === "auto") {
        return []
      }

      if (lane === "suggested") {
        return [{
          bagId: groupInput.rows[0]?.bagId ?? "bag-1",
          confidence: 0.98,
          groupId: "suggested-part-group-test",
          matchKind: "label-gated-near",
          reasons: ["test suggested group"],
          rowIds: groupInput.rows.slice(0, 2).map((row) => row.rowId),
        }]
      }

      return partMatchingMock.createPartMatchGroupsImplementation?.(groupInput) ?? []
    })

    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })
    await user.click(screen.getByRole("tab", { name: /bags/i }))

    const samePartSwitch = screen.getByRole("switch", {
      name: "Group parts inside bags",
    })

    await waitFor(() => expect(samePartSwitch).toBeEnabled())

    fireEvent.click(samePartSwitch)

    const groupedTable = screen.getByRole("table", {
      name: "Bag checklist rows",
    })
    const rejectButton = await screen.findByRole("button", {
      name: "Reject suggested part group 1",
    })

    expect(rejectButton).toBeInTheDocument()

    await user.click(screen.getByRole("button", {
      name: "Expand part group 1",
    }))

    expect(screen.getAllByRole("button", {
      name: /remove .* row from suggested part group/i,
    })).toHaveLength(2)

    await user.click(rejectButton)

    expect(screen.queryByRole("button", {
      name: "Reject suggested part group 1",
    })).not.toBeInTheDocument()
    expect(screen.getAllByRole("checkbox", {
      name: /mark bag 1 page/i,
    })).toHaveLength(2)
  })

  it("recalculates bags when the step multiplier changes", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => detectedStepResult(1))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Callout 1 crop" })
    await user.click(screen.getByRole("button", { name: "Increase step 1 multiplier" }))
    await user.click(screen.getByRole("tab", { name: /bags/i }))

    const bagTable = screen.getByRole("table", { name: "Bag checklist rows" })

    expect(within(bagTable).getByText("4x")).toBeInTheDocument()
    expect(screen.getByText("0/4 parts · 0%")).toBeInTheDocument()
  })

  it("marks pages with possible outside multiplier labels", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => ({
      ...detectedStepResult(1),
      pageAttentionItems: [
        {
          id: "page-1-attention-0-text-2x-40-20-80-12",
          pageNumber: 1,
          kind: "possible-step-multiplier" as const,
          source: "text" as const,
          text: "2x",
          value: 2,
          confidence: 0.92,
          sourceRegion: { x: 40, y: 20, width: 80, height: 12 },
        },
      ],
    }))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    expect(await screen.findByText("1 review")).toBeInTheDocument()
    const pageTrigger = screen.getByRole("button", { name: /page 1/i })
    const highlightedPageGroup = pageTrigger.closest(
      '[data-attention-kind="possible-step-multiplier"]',
    )
    const attentionDescription = screen
      .getByText("Possible step multiplier")
      .closest("[id]")

    if (!(highlightedPageGroup instanceof HTMLElement)) {
      throw new Error("Expected possible step multiplier page group highlight")
    }
    if (!(attentionDescription instanceof HTMLElement)) {
      throw new Error("Expected possible step multiplier attention description")
    }

    expect(highlightedPageGroup).toHaveAttribute(
      "data-attention-kind",
      "possible-step-multiplier",
    )
    expect(pageTrigger).toHaveAttribute("aria-describedby", attentionDescription.id)
    expect(screen.getByText("Possible step multiplier")).toBeInTheDocument()
    expect(screen.getByText(/outside-callout labels: 2x text/i)).toBeInTheDocument()
  })

  it("keeps zero-part callouts marked as not bagged", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => zeroPartDetectedStepResult(1))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    expect(await screen.findByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
    expect(screen.getByText("Not bagged")).toBeInTheDocument()
    expect(screen.queryByText("Multiplier")).not.toBeInTheDocument()
    expect(screen.queryByRole("table", { name: /part rows/i })).not.toBeInTheDocument()
  })

  it("shows live page scan progress while step detection is running", async () => {
    const user = userEvent.setup()
    let reportProgress: ((progress: StepCalloutDetectionProgress) => void) | undefined
    let reportPartProgress: ((progress: StepPartExtractionProgress) => void) | undefined
    let resolveScan: ((result: StepCalloutDetectionResult) => void) | undefined
    const scanPromise = new Promise<StepCalloutDetectionResult>((resolve) => {
      resolveScan = resolve
    })
    const readPdfMetadata = vi.fn(async (file: File) => metadataFor(file, 12))
    const scanStepCallouts = vi.fn(
      (_file: File, options: { onProgress?: (progress: StepCalloutDetectionProgress) => void } = {}) =>
        {
          reportProgress = options.onProgress
          return scanPromise
        },
    )
    const scanStepParts = vi.fn(
      (_file: File, result: StepCalloutDetectionResult, options: {
        onProgress?: (progress: StepPartExtractionProgress) => void
      } = {}) =>
        new Promise<StepCalloutDetectionResult>(() => {
          reportPartProgress = options.onProgress
        }),
    )
    renderApp({ readPdfMetadata, scanStepCallouts, scanStepParts })

    const manual = new File(["%PDF-1.7"], "farmhouse.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() => expect(reportProgress).toBeDefined())

    expect(screen.getAllByText(/preparing browser scanner/i).length).toBeGreaterThan(0)
    expect(screen.getByText("0/12")).toBeInTheDocument()
    expect(screen.getAllByText("Scanning pages").length).toBeGreaterThan(0)

    await act(async () => {
      reportProgress!({
        activePage: 7,
        detectedCalloutCount: 8,
        scannedPageCount: 3,
        targetPageCount: 12,
        percentage: 25,
        message: "Checking page 7 borders",
      })
    })

    expect(screen.getAllByText("Page 7").length).toBeGreaterThan(0)
    expect(screen.getAllByText("3/12").length).toBeGreaterThan(0)
    expect(screen.getAllByText("8").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/checking page 7 borders/i).length).toBeGreaterThan(0)
    expect(screen.getByText("Pages: 3/12; 8 callouts; 0 parts")).toBeInTheDocument()
    expect(document.querySelector('[data-processing-status-icon="active"]')).toBeInTheDocument()
    expect(screen.queryByText(/detected so far/i)).not.toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: /build steps analysis progress/i })).toHaveAttribute(
      "aria-valuenow",
      "25",
    )

    await act(async () => {
      resolveScan!(calloutOnlyDetectedStepResult(12))
      await scanPromise
    })

    await waitFor(() => expect(reportPartProgress).toBeDefined())

    expect(screen.getByRole("progressbar", { name: /scanning pages progress/i })).toHaveAttribute(
      "aria-valuenow",
      "100",
    )
    expect(screen.getAllByText("Preparing part detector").length).toBeGreaterThan(0)
    expect(screen.getByRole("progressbar", { name: /build steps analysis progress/i })).toHaveAttribute(
      "aria-valuenow",
      "5",
    )

    await act(async () => {
      reportPartProgress!({
        activePage: 9,
        detectedPartItemCount: 90,
        message: "V2 extracting parts on page 9.",
        percentage: 50,
        phase: "part-extraction",
        processedCalloutCount: 20,
        targetCalloutCount: 40,
      })
    })

    expect(screen.getAllByText("Extracting parts").length).toBeGreaterThan(0)
    expect(screen.getAllByText("V2 extracting parts on page 9.").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Page 9").length).toBeGreaterThan(0)
    expect(screen.getAllByText("1/12").length).toBeGreaterThan(0)
    expect(screen.getAllByText("90").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/page 9; pages: 1\/12; 20\/40 callouts; 90 part rows/i).length)
      .toBeGreaterThan(0)
    expect(window.__bagItValidationState?.processingPhase).toBe("part-extraction")
    expect(screen.getByRole("progressbar", { name: /extracting parts progress/i })).toHaveAttribute(
      "aria-valuenow",
      "50",
    )
  })

  it("waits for current part extraction before rendering build steps", async () => {
    const user = userEvent.setup()
    let resolveParts: ((result: StepCalloutDetectionResult) => void) | undefined
    const partsPromise = new Promise<StepCalloutDetectionResult>((resolve) => {
      resolveParts = resolve
    })
    const scanStepCallouts = vi.fn(async () => calloutOnlyDetectedStepResult(1))
    const scanStepParts = vi.fn(() => partsPromise)

    renderApp({ scanStepCallouts, scanStepParts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() => expect(scanStepParts).toHaveBeenCalled())
    expect(screen.queryByRole("img", { name: "Callout 1 crop" })).not.toBeInTheDocument()
    expect(screen.getAllByText("Preparing part detector").length).toBeGreaterThan(0)
    expect(screen.getByRole("progressbar", { name: /build steps analysis progress/i })).toHaveAttribute(
      "aria-valuenow",
      "5",
    )

    await act(async () => {
      resolveParts!(detectedStepResult(1))
      await partsPromise
    })

    expect(await screen.findByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
  })

  it("keeps completed scan progress visible when part extraction fails", async () => {
    const user = userEvent.setup()
    const scanResult = {
      ...calloutOnlyDetectedStepResult(59),
      scannedPageNumbers: Array.from({ length: 59 }, (_value, index) => index + 1),
      pagePreviews: Array.from({ length: 59 }, (_value, index) => ({
        height: 140,
        pageNumber: index + 1,
        width: 100,
      })),
    }
    const readPdfMetadata = vi.fn(async (file: File) => metadataFor(file, 59))
    const scanStepCallouts = vi.fn(async () => scanResult)
    const scanStepParts = vi.fn(async () => {
      throw new Error("Worker crashed.")
    })

    renderApp({ readPdfMetadata, scanStepCallouts, scanStepParts })

    const manual = new File(["%PDF-1.7"], "middle-wall.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    expect((await screen.findAllByText("Parts failed")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Part extraction failed. Retry or choose another manual.").length)
      .toBeGreaterThan(0)
    expect(screen.getAllByText("59/59").length).toBeGreaterThan(0)
    expect(screen.getAllByText("1").length).toBeGreaterThan(0)
    expect(screen.getAllByText("0").length).toBeGreaterThan(0)
    expect(
      within(screen.getByRole("tabpanel", { name: /build steps/i })).queryByText("Waiting for analysis"),
    ).not.toBeInTheDocument()
    expect(window.__bagItValidationState?.partStatus).toBe("failed")
  })

  it("reruns stale detector results before rendering build steps", async () => {
    const user = userEvent.setup()
    const currentResult = detectedStepResult(1)
    let resolveRerun: ((result: StepCalloutDetectionResult) => void) | undefined
    const rerunPromise = new Promise<StepCalloutDetectionResult>((resolve) => {
      resolveRerun = resolve
    })
    const scanStepCallouts = vi
      .fn()
      .mockResolvedValueOnce(staleDetectedStepResult(1))
      .mockReturnValueOnce(rerunPromise)
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    expect(await screen.findByText("Detector changed. Recalculating step callouts.")).toBeInTheDocument()
    expect(scanStepCallouts).toHaveBeenCalledTimes(2)
    expect(scanStepCallouts).toHaveBeenNthCalledWith(
      1,
      manual,
      expect.objectContaining({ eagerPreviewImages: false, parallelPageDetection: true }),
    )
    expect(scanStepCallouts).toHaveBeenNthCalledWith(
      2,
      manual,
      expect.objectContaining({ eagerPreviewImages: false, parallelPageDetection: false }),
    )
    expect(screen.queryByRole("img", { name: "Callout 1 crop" })).not.toBeInTheDocument()

    await act(async () => {
      resolveRerun!(currentResult)
      await rerunPromise
    })

    expect(await screen.findByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
    expect(screen.getByText("1 callout across 1 scanned page")).toBeInTheDocument()
  })

  it("lets users collapse build step page groups", async () => {
    const user = userEvent.setup()
    const scanStepCallouts = vi.fn(async () => detectedStepResult(1))
    renderApp({ scanStepCallouts })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)
    await screen.findByRole("img", { name: "Page 1 preview" })

    const pageTrigger = screen.getByRole("button", { name: /page 1/i })
    const pageItem = document.querySelector("[data-v2-page-number='1']")

    expect(pageItem).toHaveAttribute("data-v2-page-body-state", "mounted")
    expect(pageTrigger).toHaveAttribute("aria-expanded", "true")

    await user.click(pageTrigger)

    expect(pageTrigger).toHaveAttribute("aria-expanded", "false")
    expect(pageItem).toHaveAttribute("data-v2-page-body-state", "collapsed")
    expect(screen.queryByRole("img", { name: "Page 1 preview" })).not.toBeInTheDocument()

    await user.click(pageTrigger)

    expect(pageTrigger).toHaveAttribute("aria-expanded", "true")
    expect(await screen.findByRole("img", { name: "Page 1 preview" })).toBeInTheDocument()
  })

  it("does not show a cancel button during active intake", async () => {
    const user = userEvent.setup()
    let signal: AbortSignal | undefined
    const readPdfMetadata = vi.fn(
      (_file: File, options: { signal?: AbortSignal } = {}) =>
        new Promise<PdfMetadata>(() => {
          signal = options.signal
        }),
    )
    renderApp({ readPdfMetadata })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    await waitFor(() => expect(signal).toBeDefined())
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
    expect(signal?.aborted).toBe(false)
    expect(screen.getByText("manual.pdf")).toBeInTheDocument()
  })

  it("shows parser failures without losing the selected manual", async () => {
    const user = userEvent.setup()
    const readPdfMetadata = vi.fn(async () => {
      throw new PdfIntakeError("corrupt", "PDF could not be read. Choose another file or retry.")
    })
    renderApp({ readPdfMetadata })

    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })

    await user.upload(screen.getByLabelText(/pdf manual/i), manual)

    expect(await screen.findByRole("alert")).toHaveTextContent("PDF could not be read")
    expect(screen.getByText("manual.pdf")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /bag it/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /download/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled()
  })

  it("restores a downloaded intake session", async () => {
    const user = userEvent.setup()
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })
    let resolveRestore: ((restored: RestoredPdfIntakeSession) => void) | undefined
    let restorePromise: Promise<RestoredPdfIntakeSession> | undefined
    const restoreSessionFile = vi.fn(() => {
      restorePromise = new Promise<RestoredPdfIntakeSession>((resolve) => {
        resolveRestore = resolve
      })
      return restorePromise
    })
    renderApp({ restoreSessionFile })

    const sessionFile = new File(["{}"], "manual.bagit-session.json", {
      type: "application/json",
    })

    await user.upload(screen.getByLabelText(/continue session file/i), sessionFile)
    expect(restoreSessionFile).toHaveBeenCalledWith(sessionFile)
    expect(resolveRestore).toBeDefined()
    expect(restorePromise).toBeDefined()

    await act(async () => {
      resolveRestore!({
        manualFile: manual,
        metadata: metadataFor(manual, 8),
        savedAt: "2026-05-27T00:00:00.000Z",
        stepDetectionResult: null,
        calloutMultipliers: {},
        checkedBagRowIds: [],
        checkedBagCompletionAnchors: [],
      })
      await restorePromise!
    })

    expect(screen.getByRole("status")).toHaveTextContent("8 pages scanned")
    expect(screen.getByText("manual.pdf")).toBeInTheDocument()
    expect(screen.getByText(/read 8 pages/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /download/i })).toBeEnabled()
  })

  it("restores current step analysis from session without rescanning pages", async () => {
    const user = userEvent.setup()
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })
    const restoredResult = detectedStepResult(1)
    const restoreSessionFile = vi.fn(async (): Promise<RestoredPdfIntakeSession> => ({
      manualFile: manual,
      metadata: metadataFor(manual, 1),
      savedAt: "2026-05-27T00:00:00.000Z",
      stepDetectionResult: restoredResult,
      calloutMultipliers: {},
      checkedBagRowIds: [],
      checkedBagCompletionAnchors: [],
    }))
    const scanStepCallouts = vi.fn(async () => emptyStepResult(1))
    renderApp({ restoreSessionFile, scanStepCallouts })

    const sessionFile = new File(["{}"], "manual.bagit-session.json", {
      type: "application/json",
    })

    await user.upload(screen.getByLabelText(/continue session file/i), sessionFile)

    expect(await screen.findByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
    expect(screen.getByText("1 callout across 1 scanned page")).toBeInTheDocument()
    expect(scanStepCallouts).not.toHaveBeenCalled()
  })

  it("reruns stale restored step analysis without worker page detection", async () => {
    const user = userEvent.setup()
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })
    const restoredResult = staleDetectedStepResult(1)
    const rerunResult = detectedStepResult(1)
    const restoreSessionFile = vi.fn(async (): Promise<RestoredPdfIntakeSession> => ({
      manualFile: manual,
      metadata: metadataFor(manual, 1),
      savedAt: "2026-05-27T00:00:00.000Z",
      stepDetectionResult: restoredResult,
      calloutMultipliers: {},
      checkedBagRowIds: [],
      checkedBagCompletionAnchors: [],
    }))
    const scanStepCallouts = vi.fn(async () => rerunResult)
    renderApp({ restoreSessionFile, scanStepCallouts })

    const sessionFile = new File(["{}"], "manual.bagit-session.json", {
      type: "application/json",
    })

    await user.upload(screen.getByLabelText(/continue session file/i), sessionFile)

    await waitFor(() => expect(scanStepCallouts).toHaveBeenCalledWith(
      manual,
      expect.objectContaining({ eagerPreviewImages: false, parallelPageDetection: false }),
    ))
    expect(await screen.findByRole("img", { name: "Callout 1 crop" })).toBeInTheDocument()
    expect(window.__bagItValidationState?.detectorVersion).toBe(STEP_CALLOUT_DETECTOR_VERSION)
  })

  it("reruns restored alpha149 part rows before rendering saved part state", async () => {
    const user = userEvent.setup()
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })
    const restoredResult: StepCalloutDetectionResult = {
      ...detectedStepResult(1),
      partExtractorVersion: "2.0.0-alpha.149",
    }
    const restoredPart = restoredResult.callouts[0].partItems[0]
    const restoreSessionFile = vi.fn(async (): Promise<RestoredPdfIntakeSession> => ({
      manualFile: manual,
      metadata: metadataFor(manual, 1),
      savedAt: "2026-06-16T16:34:59.900Z",
      stepDetectionResult: restoredResult,
      calloutMultipliers: {},
      checkedBagRowIds: [],
      checkedBagCompletionAnchors: [],
    }))
    const scanStepCallouts = vi.fn(async () => emptyStepResult(1))
    const scanStepParts = vi.fn(async (_file: File, result: StepCalloutDetectionResult) => ({
      ...result,
      partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_VERSION,
      partExtractorVersion: STEP_PART_EXTRACTOR_VERSION,
      callouts: result.callouts.map((callout) => ({
        ...callout,
        partItems: callout.partItems.map((partItem) => ({
          ...partItem,
          id: `${partItem.id}-rerun`,
        })),
      })),
    }))

    renderApp({ restoreSessionFile, scanStepCallouts, scanStepParts })

    const sessionFile = new File(["{}"], "manual.bagit-session.json", {
      type: "application/json",
    })

    await user.upload(screen.getByLabelText(/continue session file/i), sessionFile)

    await waitFor(() => expect(scanStepParts).toHaveBeenCalledWith(
      manual,
      expect.objectContaining({
        callouts: expect.arrayContaining([
          expect.objectContaining({
            partItems: expect.arrayContaining([
              expect.objectContaining({
                id: restoredPart.id,
              }),
            ]),
          }),
        ]),
        partExtractorVersion: "2.0.0-alpha.149",
      }),
      expect.any(Object),
    ))
    expect(scanStepCallouts).not.toHaveBeenCalled()
    expect(window.__bagItValidationState?.partExtractorVersion)
      .toBe(STEP_PART_EXTRACTOR_VERSION)
  })

  it("extracts missing part rows from restored current callouts without rescanning callouts", async () => {
    const user = userEvent.setup()
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })
    const restoredResult = calloutOnlyDetectedStepResult(1)
    const restoreSessionFile = vi.fn(async (): Promise<RestoredPdfIntakeSession> => ({
      manualFile: manual,
      metadata: metadataFor(manual, 1),
      savedAt: "2026-05-27T00:00:00.000Z",
      stepDetectionResult: restoredResult,
      calloutMultipliers: {},
      checkedBagRowIds: [],
      checkedBagCompletionAnchors: [],
    }))
    const scanStepCallouts = vi.fn(async () => emptyStepResult(1))
    const scanStepParts = vi.fn(
      async (
        _file: File,
        result: StepCalloutDetectionResult,
        options: { onProgress?: (progress: StepPartExtractionProgress) => void } = {},
      ) => {
        options.onProgress?.({
          activePage: 1,
          processedCalloutCount: 1,
          targetCalloutCount: 1,
          detectedPartItemCount: 1,
          percentage: 100,
          message: "Part detection complete",
        })

        return {
          ...result,
          partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_VERSION,
          partExtractorVersion: STEP_PART_EXTRACTOR_VERSION,
          callouts: result.callouts.map((callout) => ({
            ...callout,
            partItems: [detectedPartItem("data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=")],
          })),
        }
      },
    )
    renderApp({ restoreSessionFile, scanStepCallouts, scanStepParts })

    const sessionFile = new File(["{}"], "manual.bagit-session.json", {
      type: "application/json",
    })

    await user.upload(screen.getByLabelText(/continue session file/i), sessionFile)

    await waitFor(() => expect(scanStepParts).toHaveBeenCalled())
    expect(scanStepCallouts).not.toHaveBeenCalled()
    expect(await screen.findByRole("img", { name: "Callout 1 part 1 crop" })).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: /scanning pages progress/i })).toHaveAttribute(
      "aria-valuenow",
      "100",
    )
  })

  it("reruns restored current part rows when color calibration version is missing", async () => {
    const user = userEvent.setup()
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })
    const restoredResult = staleColorDetectedStepResult(1)
    const restoredColor = restoredResult.callouts[0].partItems[0].detectedColor!
    const restoreSessionFile = vi.fn(async (): Promise<RestoredPdfIntakeSession> => ({
      manualFile: manual,
      metadata: metadataFor(manual, 1),
      savedAt: "2026-05-27T00:00:00.000Z",
      stepDetectionResult: restoredResult,
      calloutMultipliers: {},
      checkedBagRowIds: [],
      checkedBagCompletionAnchors: [],
    }))
    const scanStepCallouts = vi.fn(async () => emptyStepResult(1))
    const scanStepParts = vi.fn(async (_file: File, result: StepCalloutDetectionResult) => ({
      ...result,
      partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_VERSION,
      partExtractorVersion: STEP_PART_EXTRACTOR_VERSION,
      callouts: result.callouts.map((callout) => ({
        ...callout,
        partItems: callout.partItems.map((partItem) => ({
          ...partItem,
          detectedColor: {
            ...restoredColor,
            name: "Green",
            family: "green",
            swatchHex: "#237841",
          },
        })),
      })),
    }))

    renderApp({ restoreSessionFile, scanStepCallouts, scanStepParts })

    const sessionFile = new File(["{}"], "manual.bagit-session.json", {
      type: "application/json",
    })

    await user.upload(screen.getByLabelText(/continue session file/i), sessionFile)

    await waitFor(() => expect(scanStepParts).toHaveBeenCalledWith(
      manual,
      expect.objectContaining({ partColorCalibrationVersion: undefined }),
      expect.any(Object),
    ))
    expect(scanStepCallouts).not.toHaveBeenCalled()
    expect((await screen.findAllByText("Green")).length).toBeGreaterThan(0)
    expect(window.__bagItValidationState?.partColorCalibrationVersion)
      .toBe(STEP_PART_COLOR_CALIBRATION_VERSION)
  })

  it("restores saved step multipliers with current step analysis", async () => {
    const user = userEvent.setup()
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
    })
    const restoredResult = detectedStepResult(1)
    const restoreSessionFile = vi.fn(async (): Promise<RestoredPdfIntakeSession> => ({
      manualFile: manual,
      metadata: metadataFor(manual, 1),
      savedAt: "2026-05-27T00:00:00.000Z",
      stepDetectionResult: restoredResult,
      calloutMultipliers: {
        "callout-1": 3,
      },
      checkedBagRowIds: [],
      checkedBagCompletionAnchors: [],
    }))
    const scanStepCallouts = vi.fn(async () => emptyStepResult(1))
    renderApp({ restoreSessionFile, scanStepCallouts })

    const sessionFile = new File(["{}"], "manual.bagit-session.json", {
      type: "application/json",
    })

    await user.upload(screen.getByLabelText(/continue session file/i), sessionFile)

    const totalQuantityMetric = (await screen.findByText("Total qty")).parentElement as HTMLElement

    expect(screen.getByRole("spinbutton", { name: "Step 1 multiplier" })).toHaveValue(3)
    expect(totalQuantityMetric).toHaveTextContent("6")
    expect(scanStepCallouts).not.toHaveBeenCalled()
  })
})
