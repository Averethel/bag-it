import { afterEach, describe, expect, it, vi } from "vitest"
import type { PagePreviewAsset } from "../preview-assets"
import type { DetectedStepCalloutPartItem } from "../step-detection-contracts"
import { createPartMaskPreviewAssetFromPageAsset } from "./runtime-preview-assets"

describe("runtime preview assets", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("caps part mask source pixels and reuses the decoded page image", async () => {
    const canvas = installCanvasStub()
    const imageConstructors = installImageStub()
    const pageAsset = createPageAsset()
    const firstPart = createPartItem("part-1")
    const secondPart = createPartItem("part-2")

    const firstAsset = await createPartMaskPreviewAssetFromPageAsset(pageAsset, firstPart)
    const secondAsset = await createPartMaskPreviewAssetFromPageAsset(pageAsset, secondPart)

    expect(imageConstructors).toHaveBeenCalledTimes(1)
    expect(firstAsset).toMatchObject({
      height: 64,
      partItemId: "part-1",
      width: 128,
    })
    expect(secondAsset).toMatchObject({
      height: 64,
      partItemId: "part-2",
      width: 128,
    })
    expect(firstAsset?.renderedPixels?.data).toHaveLength(128 * 64 * 4)
    expect(canvas.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      512,
      256,
      0,
      0,
      128,
      64,
    )
  })
})

function createPageAsset(): PagePreviewAsset {
  return {
    baseHeight: 256,
    baseWidth: 512,
    naturalHeight: 256,
    naturalWidth: 512,
    pageNumber: 1,
    url: "blob:page-1",
  }
}

function createPartItem(id: string): DetectedStepCalloutPartItem {
  const region = { height: 256, width: 512, x: 0, y: 0 }

  return {
    confidence: 1,
    id,
    indexOnCallout: 0,
    partImage: {
      alphaMask: {
        data: new Uint8ClampedArray(region.width * region.height).fill(255),
        height: region.height,
        width: region.width,
      },
      region,
    },
    partRegion: region,
    quantity: {
      confidence: 1,
      text: "1x",
      value: 1,
    },
    quantityLabel: {
      region: { height: 8, width: 12, x: 0, y: 0 },
    },
    sourceRegion: region,
  }
}

function installImageStub(): ReturnType<typeof vi.fn> {
  const imageConstructors = vi.fn()

  class TestImage {
    decoding = ""
    onerror: (() => void) | null = null
    onload: (() => void) | null = null

    set src(_value: string) {
      imageConstructors()
      queueMicrotask(() => this.onload?.())
    }
  }

  vi.stubGlobal("Image", TestImage)
  return imageConstructors
}

function installCanvasStub(): {
  drawImage: ReturnType<typeof vi.fn>
  putImageData: ReturnType<typeof vi.fn>
} {
  let objectUrlId = 0
  const createElement = window.document.createElement.bind(window.document)
  const drawImage = vi.fn()
  const putImageData = vi.fn()

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => {
      objectUrlId += 1
      return `blob:part-${objectUrlId}`
    }),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(window.document, "createElement").mockImplementation((tagName) => {
    if (tagName !== "canvas") {
      return createElement(tagName)
    }

    return createCanvasStub(drawImage, putImageData) as unknown as HTMLCanvasElement
  })

  return { drawImage, putImageData }
}

function createCanvasStub(
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
      callback(new Blob(["part-mask"], { type: "image/png" }))
    },
  }
}
