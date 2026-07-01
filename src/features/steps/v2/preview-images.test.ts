import { afterEach, describe, expect, it, vi } from "vitest"
import {
  attachV2CropPreviewImages,
  attachV2PagePreviewImages,
  attachV2PreviewImages,
} from "./preview-images"
import type { StepDetectorV2PreviewHydratableResult } from "./preview-images"
import {
  createSyntheticV2Page,
} from "./synthetic-page-test-helper"

const CALLOUT_REGION = { height: 20, width: 24, x: 4, y: 6 }

describe("v2 preview images", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("attaches page and callout image object urls from rendered page pixels", async () => {
    installCanvasStub()

    const hydratableResult: StepDetectorV2PreviewHydratableResult = {
      callouts: [
        {
          crop: {
            region: CALLOUT_REGION,
          },
          pageNumber: 1,
        },
      ],
      pagePreviews: [
        {
          height: 82,
          pageNumber: 1,
          width: 128,
        },
      ],
    }
    const result = await attachV2PreviewImages(hydratableResult, [createSyntheticV2Page()])

    expect(result.pagePreviews[0].imageDataUrl).toBe("blob:test-2")
    expect(result.callouts[0].crop.imageDataUrl).toBe("blob:test-1")
  })

  it("can attach page thumbnails without crop previews", async () => {
    installCanvasStub()

    const hydratableResult: StepDetectorV2PreviewHydratableResult = {
      callouts: [
        {
          crop: {
            region: CALLOUT_REGION,
          },
          pageNumber: 1,
        },
      ],
      pagePreviews: [
        {
          height: 82,
          pageNumber: 1,
          width: 128,
        },
      ],
    }
    const result = await attachV2PagePreviewImages(hydratableResult, [createSyntheticV2Page()])

    expect(result.pagePreviews[0].imageDataUrl).toBe("blob:test-1")
    expect(result.callouts[0].crop.imageDataUrl).toBeUndefined()
  })

  it("can attach crop previews without replacing page thumbnails", async () => {
    installCanvasStub()

    const hydratableResult: StepDetectorV2PreviewHydratableResult = {
      callouts: [
        {
          crop: {
            region: CALLOUT_REGION,
          },
          pageNumber: 1,
        },
      ],
      pagePreviews: [
        {
          height: 82,
          imageDataUrl: "data:image/png;base64,existing-page",
          pageNumber: 1,
          width: 128,
        },
      ],
    }
    const result = await attachV2CropPreviewImages(hydratableResult, [createSyntheticV2Page()])

    expect(result.pagePreviews[0].imageDataUrl).toBe("data:image/png;base64,existing-page")
    expect(result.callouts[0].crop.imageDataUrl).toBe("blob:test-1")
  })

  it("normalizes a mismatched page scale before attaching stored crop previews", async () => {
    const canvas = installCanvasStub()

    const hydratableResult: StepDetectorV2PreviewHydratableResult = {
      callouts: [
        {
          crop: {
            region: CALLOUT_REGION,
          },
          pageNumber: 1,
          partItems: [
            {
              partImage: {
                alphaMask: {
                  data: new Uint8ClampedArray(2 * 2).fill(255),
                  height: 2,
                  width: 2,
                },
                region: { height: 2, width: 2, x: 8, y: 10 },
              },
              quantityLabel: {
                region: { height: 3, width: 5, x: 10, y: 18 },
              },
            },
          ],
        },
      ],
      pagePreviews: [
        {
          height: 82,
          pageNumber: 1,
          width: 128,
        },
      ],
    }
    const upscaledPage = {
      ...createSyntheticV2Page(),
      height: 164,
      width: 256,
    }
    const result = await attachV2PreviewImages(hydratableResult, [upscaledPage])

    expect(canvas.drawImage).toHaveBeenCalledWith(expect.objectContaining({ width: 256 }), 0, 0, 128, 82)
    expect(canvas.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 128 }),
      CALLOUT_REGION.x,
      CALLOUT_REGION.y,
      CALLOUT_REGION.width,
      CALLOUT_REGION.height,
      0,
      0,
      CALLOUT_REGION.width,
      CALLOUT_REGION.height,
    )
    expect(result.pagePreviews[0].imageDataUrl).toBe("blob:test-4")
    expect(result.callouts[0].crop.imageDataUrl).toBe("blob:test-1")
    expect(result.callouts[0].partItems?.[0].partImage?.imageDataUrl).toBe("blob:test-2")
    expect(result.callouts[0].partItems?.[0].quantityLabel.crop?.imageDataUrl).toBe("blob:test-3")
  })

  it("hydrates part image previews from stored region and alpha mask", async () => {
    const canvas = installCanvasStub()

    const hydratableResult: StepDetectorV2PreviewHydratableResult = {
      callouts: [
        {
          crop: {
            region: CALLOUT_REGION,
          },
          pageNumber: 1,
          partItems: [
            {
              partImage: {
                alphaMask: {
                  data: new Uint8ClampedArray([0, 128, 255, 64]),
                  height: 2,
                  width: 2,
                },
                region: { height: 2, width: 2, x: 8, y: 10 },
              },
              quantityLabel: {
                region: { height: 3, width: 5, x: 10, y: 18 },
              },
            },
          ],
        },
      ],
      pagePreviews: [],
    }
    const result = await attachV2PreviewImages(hydratableResult, [createSyntheticV2Page()])
    const maskedImageData = canvas.putImageData.mock.calls
      .map(([imageData]) => imageData)
      .find((imageData) => imageData?.data?.length === 16)

    expect(result.callouts[0].partItems?.[0].partImage?.imageDataUrl).toBe("blob:test-2")
    expect(maskedImageData?.data[3]).toBe(0)
    expect(maskedImageData?.data[7]).toBe(128)
    expect(maskedImageData?.data[11]).toBe(255)
    expect(maskedImageData?.data[15]).toBe(64)
  })

  it("keeps stored part alpha masks unchanged during hydration", async () => {
    installCanvasStub()

    const background = { b: 82, g: 202, r: 248 }
    const hydratableResult: StepDetectorV2PreviewHydratableResult = {
      callouts: [
        {
          crop: {
            region: CALLOUT_REGION,
          },
          inferredBackground: {
            rgb: background,
          },
          pageNumber: 1,
          partItems: [
            {
              partImage: {
                alphaMask: {
                  data: new Uint8ClampedArray(20 * 14).fill(255),
                  height: 14,
                  width: 20,
                },
                region: { height: 14, width: 20, x: 6, y: 10 },
              },
              quantityLabel: {
                region: { height: 3, width: 5, x: 10, y: 18 },
              },
            },
          ],
        },
      ],
      pagePreviews: [],
    }
    const result = await attachV2PreviewImages(hydratableResult, [createSyntheticV2Page()])
    const mask = result.callouts[0].partItems?.[0].partImage?.alphaMask

    expect(readAlpha(mask, 1, 1)).toBe(255)
    expect(readAlpha(mask, 5, 3)).toBe(255)
  })
})

function readAlpha(
  mask: { data: Uint8ClampedArray; width: number } | undefined,
  x: number,
  y: number,
): number {
  return mask?.data[y * mask.width + x] ?? 0
}

function installCanvasStub(): {
  drawImage: ReturnType<typeof vi.fn>
  putImageData: ReturnType<typeof vi.fn>
} {
  let canvasId = 0
  let objectUrlId = 0
  const createElement = window.document.createElement.bind(window.document)
  vi.stubGlobal("ImageData", class TestImageData {})
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => {
      objectUrlId += 1
      return `blob:test-${objectUrlId}`
    }),
    revokeObjectURL: vi.fn(),
  })
  const drawImage = vi.fn()
  const putImageData = vi.fn()

  vi.spyOn(window.document, "createElement").mockImplementation((tagName) => {
    if (tagName !== "canvas") {
      return createElement(tagName)
    }

    canvasId += 1

    return createCanvasStub(canvasId, drawImage, putImageData) as unknown as HTMLCanvasElement
  })

  return { drawImage, putImageData }
}

function createCanvasStub(
  canvasId: number,
  drawImage: ReturnType<typeof vi.fn>,
  putImageData: ReturnType<typeof vi.fn>,
) {
  return {
    height: 0,
    width: 0,
    getContext: () => ({
      drawImage,
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4).fill(255),
      }),
      putImageData,
    }),
    toBlob: (callback: BlobCallback) => {
      callback(new Blob([`canvas-${canvasId}`], { type: "image/png" }))
    },
  }
}
