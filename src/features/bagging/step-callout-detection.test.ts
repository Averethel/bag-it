import { describe, expect, it, vi } from "vitest"
import {
  detectStepCalloutsFromPdfDocument,
  detectStepCalloutPartItemRegionsFromImageData,
  detectStepCalloutRegionsFromImageData,
  getInitialStepCalloutPageNumbers,
  stepCalloutDetectorVersion,
} from "./step-callout-detection"

describe("step callout detection", () => {
  it("finds bordered tinted callout rectangles across the page", () => {
    const imageData = createSyntheticPage(1_000, 700)
    drawBorderedRect(imageData, { x: 60, y: 110, width: 310, height: 180 }, [216, 239, 250])
    drawBorderedRect(imageData, { x: 70, y: 410, width: 240, height: 140 }, [216, 239, 250])
    drawBorderedRect(imageData, { x: 760, y: 60, width: 170, height: 100 }, [216, 239, 250])
    drawBorderedRect(imageData, { x: 340, y: 410, width: 620, height: 140 }, [216, 239, 250])
    drawRect(imageData, { x: 470, y: 230, width: 360, height: 120 }, [196, 201, 196])

    const regions = detectStepCalloutRegionsFromImageData(imageData)

    expect(regions).toHaveLength(4)
    expect(regions.map((region) => [region.x, region.y])).toEqual([
      [760, 60],
      [60, 110],
      [70, 410],
      [340, 410],
    ])
    expect(regions[1].width).toBeGreaterThanOrEqual(308)
    expect(regions[1].height).toBeGreaterThanOrEqual(178)
    expect(regions[3].width).toBeGreaterThanOrEqual(618)
    expect(regions.every((region) => region.confidence > 0.45)).toBe(true)
  })

  it("requires a meaningful rectangular border", () => {
    const imageData = createSyntheticPage(800, 600)
    drawRect(imageData, { x: 70, y: 120, width: 280, height: 170 }, [216, 239, 250])

    expect(detectStepCalloutRegionsFromImageData(imageData)).toEqual([])
  })

  it("ignores warm bordered model preview panels", () => {
    const imageData = createSyntheticPage(1_000, 700)
    drawBorderedRect(imageData, { x: 760, y: 60, width: 170, height: 100 }, [255, 246, 218])
    drawBorderedRect(imageData, { x: 760, y: 220, width: 170, height: 100 }, [216, 239, 250])

    const regions = detectStepCalloutRegionsFromImageData(imageData)

    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      x: 760,
      y: 220,
    })
  })

  it("detects part item groups inside a callout from part images and quantity labels", () => {
    const imageData = createSyntheticPage(520, 260, [216, 239, 250])
    drawSyntheticPartItem(imageData, { x: 34, y: 32, width: 82, height: 82 })
    drawSyntheticPartItem(imageData, { x: 168, y: 24, width: 100, height: 92 })
    drawSyntheticPartItem(imageData, { x: 334, y: 30, width: 112, height: 86 })
    drawSyntheticPartItem(imageData, { x: 48, y: 154, width: 160, height: 62 })

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(4)
    expect(items[0].quantityRegion.y).toBeGreaterThan(items[0].partRegion.y + items[0].partRegion.height - 4)
    expect(items[0].partRegion.height).toBeGreaterThan(40)
    expect(items.map((item) => item.itemRegion.x)).toEqual([29, 162, 329, 44])
    expect(items.map((item) => item.quantityRegion.y)).toEqual([128, 130, 130, 230])
  })

  it("splits adjacent callout items by their own trailing quantity markers", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 320, height: 170 }, [216, 239, 250])
      for (const x of [136, 194, 252]) {
        drawRect(imageData, { x, y: 134, width: 54, height: 38 }, [20, 132, 148])
        drawSyntheticQuantityText(imageData, {
          scale: 2,
          text: "1x",
          x: x + 2,
          y: 184,
        })
      }

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(3)
      expect(result.callouts[0].partItems.map((item) => item.quantity.value)).toEqual([1, 1, 1])
    } finally {
      canvasApi.restore()
    }
  })

  it("does not keep overlapping split halves from one continuous part", () => {
    const imageData = createSyntheticPage(520, 260, [216, 239, 250])
    drawRect(imageData, { x: 92, y: 44, width: 210, height: 68 }, [160, 166, 170])
    drawRect(imageData, { x: 102, y: 54, width: 176, height: 10 }, [116, 124, 128])
    drawSyntheticQuantityText(imageData, {
      scale: 2,
      text: "2x",
      x: 106,
      y: 122,
    })
    drawSyntheticQuantityText(imageData, {
      scale: 2,
      text: "1x",
      x: 128,
      y: 122,
    })

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(1)
  })

  it("keeps separated halves of one part together when there is only one quantity label", () => {
    const imageData = createSyntheticPage(340, 260, [216, 239, 250])
    drawRect(imageData, { x: 86, y: 54, width: 38, height: 58 }, [160, 166, 170])
    drawRect(imageData, { x: 134, y: 54, width: 37, height: 58 }, [160, 166, 170])
    drawRect(imageData, { x: 96, y: 64, width: 65, height: 7 }, [116, 124, 128])
    drawSyntheticQuantityText(imageData, {
      scale: 2,
      text: "1x",
      x: 92,
      y: 124,
    })

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(1)
    expect(items[0].partRegion.width).toBeGreaterThan(70)
  })

  it("keeps a row-supported 1x label when the label sits on busy part pixels", () => {
    const imageData = createSyntheticPage(340, 250, [216, 239, 250])
    drawRect(imageData, { x: 30, y: 46, width: 54, height: 44 }, [160, 166, 170])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 38, 104)
    drawRect(imageData, { x: 32, y: 136, width: 86, height: 58 }, [160, 166, 170])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 38, 174)
    drawRect(imageData, { x: 152, y: 136, width: 60, height: 46 }, [35, 120, 35])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 164, 194)

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(3)
    expect(items.map((item) => item.quantity.value)).toEqual([1, 1, 1])
  })

  it("does not let a narrow row-spanning component suppress the item above it", () => {
    const imageData = createSyntheticPage(260, 310, [216, 239, 250])
    drawRect(imageData, { x: 8, y: 12, width: 4, height: 170 }, [30, 30, 30])
    drawRect(imageData, { x: 28, y: 36, width: 44, height: 36 }, [160, 166, 170])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 32, 86)
    drawRect(imageData, { x: 100, y: 30, width: 54, height: 40 }, [160, 166, 170])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 108, 86)
    drawRect(imageData, { x: 28, y: 126, width: 56, height: 46 }, [160, 166, 170])
    drawSyntheticQuantityMask(imageData, manualStyleSplitMarkerTwoQuantityMask, 32, 186)
    drawRect(imageData, { x: 98, y: 126, width: 82, height: 46 }, [160, 166, 170])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 108, 186)

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(4)
    expect(items.map((item) => item.quantity.value)).toEqual([1, 1, 2, 1])
  })

  it("keeps a tall real part even when it spans most of the label row height", () => {
    const imageData = createSyntheticPage(540, 270, [216, 239, 250])
    drawRect(imageData, { x: 420, y: 28, width: 88, height: 194 }, [116, 124, 128])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 430, 226)

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(1)
    expect(items[0].partRegion.width).toBeGreaterThanOrEqual(84)
    expect(items[0].partRegion.height).toBeGreaterThanOrEqual(183)
  })

  it("expands a connected wide part beyond the label midpoint without clipping its right side", () => {
    const imageData = createSyntheticPage(420, 230, [216, 239, 250])
    drawRect(imageData, { x: 72, y: 52, width: 150, height: 58 }, [35, 120, 35])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 112, 126)
    drawRect(imageData, { x: 266, y: 58, width: 44, height: 44 }, [116, 124, 128])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 272, 126)

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(2)
    expect(items[0].partRegion.x).toBeLessThanOrEqual(74)
    expect(items[0].partRegion.x + items[0].partRegion.width).toBeGreaterThanOrEqual(220)
    expect(items[1].partRegion.x).toBeGreaterThanOrEqual(260)
  })

  it("does not let a connected foreground blob cross a neighboring quantity label center", () => {
    const imageData = createSyntheticPage(340, 220, [216, 239, 250])
    drawRect(imageData, { x: 70, y: 98, width: 48, height: 36 }, [116, 124, 128])
    drawRect(imageData, { x: 116, y: 112, width: 24, height: 6 }, [116, 124, 128])
    drawRect(imageData, { x: 140, y: 100, width: 42, height: 36 }, [116, 124, 128])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 74, 142)
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 142, 142)

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(2)
    expect(items[0].partRegion.x + items[0].partRegion.width).toBeLessThanOrEqual(132)
    expect(items[1].partRegion.x).toBeGreaterThanOrEqual(108)
  })

  it("removes a clipped left-neighbor edge from an owned part region", () => {
    const imageData = createSyntheticPage(300, 210, [216, 239, 250])
    drawRect(imageData, { x: 29, y: 101, width: 26, height: 32 }, [116, 124, 128])
    drawRect(imageData, { x: 73, y: 103, width: 51, height: 30 }, [116, 124, 128])
    drawRect(imageData, { x: 139, y: 109, width: 37, height: 24 }, [116, 124, 128])
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 28, 136)
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 74, 136)
    drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 141, 136)

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(3)
    expect(items[1].partRegion.x + items[1].partRegion.width).toBeLessThanOrEqual(126)
    expect(items[2].partRegion.x).toBeGreaterThanOrEqual(136)
    expect(items[2].partRegion.x).toBeLessThanOrEqual(140)
  })

  it("does not cut the part crop at an unparseable dark detail near the bottom", () => {
    const imageData = createSyntheticPage(300, 240, [216, 239, 250])
    drawRect(imageData, { x: 64, y: 42, width: 112, height: 128 }, [35, 120, 35])
    drawRect(imageData, { x: 88, y: 138, width: 48, height: 12 }, [0, 0, 0])

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(0)
  })

  it("does not read a single dark part detail as a quantity", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 90, width: 280, height: 220 }, [216, 239, 250])
      drawRect(imageData, { x: 150, y: 126, width: 112, height: 128 }, [35, 120, 35])
      drawRect(imageData, { x: 178, y: 226, width: 48, height: 10 }, [0, 0, 0])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          renderMaxWidth: 1_000,
        },
      )

      expect(result.callouts[0].partItems).toHaveLength(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("keeps the full part crop when a parseable quantity sits close to the bottom edge", () => {
    const imageData = createSyntheticPage(320, 260, [216, 239, 250])
    drawRect(imageData, { x: 64, y: 42, width: 112, height: 128 }, [35, 120, 35])
    drawSyntheticQuantityText(imageData, {
      scale: 2,
      text: "1x",
      x: 92,
      y: 174,
    })

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(1)
    expect(items[0].partRegion.y).toBeLessThanOrEqual(42)
    expect(items[0].partRegion.height).toBeGreaterThanOrEqual(126)
    expect(items[0].partRegion.y + items[0].partRegion.height).toBeGreaterThanOrEqual(169)
  })

  it("crops fallback quantity labels to glyphs instead of long dark part edges", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 240, height: 190 }, [216, 239, 250])
      drawRect(imageData, { x: 135, y: 135, width: 74, height: 68 }, [75, 78, 80])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 142,
        y: 218,
      })
      drawRect(imageData, { x: 118, y: 260, width: 200, height: 3 }, [0, 0, 0])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)
      expect(result.callouts[0].partItems[0].quantity.value).toBe(1)
      expect(result.callouts[0].partItems[0].quantityLabel.region.width).toBeLessThan(60)
      expect(result.callouts[0].partItems[0].quantityLabel.region.height).toBeLessThan(30)
    } finally {
      canvasApi.restore()
    }
  })

  it("renders part previews with background, border, and quantity text removed", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 280, height: 230 }, [216, 239, 250])
      drawRect(imageData, { x: 148, y: 136, width: 120, height: 94 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 184,
        y: 246,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      const partCropImageData = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].partCrop.dataUrl)

      expect(partCropImageData).toBeDefined()
      expect(countTransparentPixels(partCropImageData!)).toBeGreaterThan(0)
      expect(countPixelsMatching(partCropImageData!, [35, 120, 35])).toBeGreaterThan(0)
      expect(countPixelsMatching(partCropImageData!, [0, 0, 0])).toBe(0)
      expect(countTransparentPixels(partCropImageData!)).toBeGreaterThan(
        countPixelsMatching(partCropImageData!, [216, 239, 250]),
      )
      expect(countPixelsMatching(
        canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].quantityLabel.crop.dataUrl)!,
        [0, 0, 0],
      )).toBeGreaterThan(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not copy a neighboring left part edge into the padded part preview", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 300, height: 210 }, [216, 239, 250])
      drawRect(imageData, { x: 148, y: 144, width: 55, height: 44 }, [180, 30, 30])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 156,
        y: 210,
      })
      drawRect(imageData, { x: 205, y: 144, width: 54, height: 44 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 212,
        y: 210,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(2)

      const rightCrop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[1].partCrop.dataUrl)

      expect(rightCrop).toBeDefined()
      expect(countPixelsMatching(rightCrop!, [35, 120, 35])).toBeGreaterThan(0)
      expect(countPixelsMatching(rightCrop!, [180, 30, 30])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("prefers the part aligned with the quantity label over an off-column seed fragment", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 360, height: 270 }, [216, 239, 250])
      drawRect(imageData, { x: 190, y: 250, width: 34, height: 40 }, [180, 30, 30])
      drawRect(imageData, { x: 250, y: 130, width: 46, height: 170 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 252, 310)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)
      expect(result.callouts[0].partItems[0].partRegion.y).toBeLessThanOrEqual(132)
      expect(result.callouts[0].partItems[0].partRegion.x).toBeGreaterThanOrEqual(246)

      const crop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].partCrop.dataUrl)

      expect(crop).toBeDefined()
      expect(countPixelsMatching(crop!, [35, 120, 35])).toBeGreaterThan(7_500)
      expect(countPixelsMatching(crop!, [180, 30, 30])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not clip a wide owned part crop at the midpoint before the next quantity label", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 450, height: 230 }, [216, 239, 250])
      drawRect(imageData, { x: 148, y: 138, width: 166, height: 52 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 170, 214)
      drawRect(imageData, { x: 372, y: 146, width: 44, height: 42 }, [108, 110, 104])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 376, 214)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(2)
      expect(result.callouts[0].partItems[0].partRegion.x + result.callouts[0].partItems[0].partRegion.width)
        .toBeGreaterThanOrEqual(312)

      const leftCrop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].partCrop.dataUrl)

      expect(leftCrop).toBeDefined()
      expect(countPixelsMatching(leftCrop!, [35, 120, 35])).toBeGreaterThan(8_000)
      expect(countPixelsMatching(leftCrop!, [108, 110, 104])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("keeps separated owned part components while dropping a left-neighbor edge", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 360, height: 230 }, [216, 239, 250])
      drawRect(imageData, { x: 150, y: 148, width: 44, height: 38 }, [180, 30, 30])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 156, 214)
      drawRect(imageData, { x: 204, y: 140, width: 44, height: 50 }, [35, 120, 35])
      drawRect(imageData, { x: 253, y: 140, width: 48, height: 50 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 214, 214)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(2)

      const rightCrop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[1].partCrop.dataUrl)

      expect(rightCrop).toBeDefined()
      expect(countPixelsMatching(rightCrop!, [35, 120, 35])).toBeGreaterThan(4_300)
      expect(countPixelsMatching(rightCrop!, [180, 30, 30])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not copy a horizontal callout border into the part preview", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 360, height: 230 }, [216, 239, 250])
      drawRect(imageData, { x: 132, y: 136, width: 190, height: 2 }, [0, 0, 0])
      drawRect(imageData, { x: 184, y: 146, width: 64, height: 46 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 194, 214)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)

      const crop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].partCrop.dataUrl)

      expect(crop).toBeDefined()
      expect(countPixelsMatching(crop!, [35, 120, 35])).toBeGreaterThan(2_000)
      expect(countPixelsMatching(crop!, [0, 0, 0])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not copy top or left callout rules when the detected seed overlaps them", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 240, height: 250 }, [216, 239, 250])
      drawRect(imageData, { x: 165, y: 152, width: 96, height: 2 }, [0, 0, 0])
      drawRect(imageData, { x: 165, y: 152, width: 2, height: 94 }, [0, 0, 0])
      drawRect(imageData, { x: 198, y: 216, width: 24, height: 14 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 198, 246)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)

      const crop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].partCrop.dataUrl)

      expect(crop).toBeDefined()
      expect(countPixelsMatching(crop!, [35, 120, 35])).toBeGreaterThan(250)
      expect(countPixelsMatching(crop!, [0, 0, 0])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not copy quantity glyphs enclosed by an owned part component box", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 360, height: 250 }, [216, 239, 250])
      drawRect(imageData, { x: 180, y: 146, width: 74, height: 12 }, [35, 120, 35])
      drawRect(imageData, { x: 180, y: 146, width: 14, height: 86 }, [35, 120, 35])
      drawRect(imageData, { x: 240, y: 146, width: 14, height: 86 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 202, 208)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)

      const crop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].partCrop.dataUrl)

      expect(crop).toBeDefined()
      expect(countPixelsMatching(crop!, [35, 120, 35])).toBeGreaterThan(1_700)
      expect(countPixelsMatching(crop!, [0, 0, 0])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not copy quantity glyphs from a previous item into a lower part preview", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 760)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 460, height: 390 }, [216, 239, 250])
      drawRect(imageData, { x: 148, y: 144, width: 38, height: 32 }, [160, 166, 170])
      drawSyntheticQuantityMask(imageData, manualStyleSplitMarkerThreeQuantityMask, 150, 206)
      drawRect(imageData, { x: 212, y: 144, width: 38, height: 32 }, [160, 166, 170])
      drawSyntheticQuantityMask(imageData, manualStyleSplitMarkerThreeQuantityMask, 214, 206)
      drawRect(imageData, { x: 138, y: 244, width: 180, height: 96 }, [160, 166, 170])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 150, 382)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 760 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      const lowerItem = result.callouts[0].partItems.find((item) => item.quantity.value === 1)

      expect(result.callouts[0].partItems).toHaveLength(3)
      expect(lowerItem).toBeDefined()

      const lowerCrop = canvasApi.getImageDataForDataUrl(lowerItem!.partCrop.dataUrl)

      expect(lowerCrop).toBeDefined()
      expect(countPixelsMatching(lowerCrop!, [160, 166, 170])).toBeGreaterThan(10_000)
      expect(countPixelsMatching(lowerCrop!, [0, 0, 0])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("keeps lower part pixels when they overlap the quantity label band", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 360, height: 270 }, [216, 239, 250])
      drawRect(imageData, { x: 180, y: 146, width: 74, height: 12 }, [35, 120, 35])
      drawRect(imageData, { x: 180, y: 146, width: 14, height: 98 }, [35, 120, 35])
      drawRect(imageData, { x: 240, y: 146, width: 14, height: 98 }, [35, 120, 35])
      drawRect(imageData, { x: 180, y: 224, width: 74, height: 20 }, [35, 120, 35])
      drawRect(imageData, { x: 180, y: 244, width: 74, height: 2 }, [209, 232, 241])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 202, 208)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)

      const crop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].partCrop.dataUrl)

      expect(crop).toBeDefined()
      expect(countPixelsMatching(crop!, [35, 120, 35])).toBeGreaterThan(3_000)
      expect(countPixelsMatching(crop!, [209, 232, 241])).toBeGreaterThan(100)
      expect(countPixelsMatching(crop!, [0, 0, 0])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("keeps a lower owned part component close to the quantity label", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 300, height: 230 }, [216, 239, 250])
      drawRect(imageData, { x: 166, y: 142, width: 70, height: 42 }, [35, 120, 35])
      drawRect(imageData, { x: 184, y: 188, width: 34, height: 16 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 184, 216)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)
      expect(result.callouts[0].partItems[0].partRegion.y + result.callouts[0].partItems[0].partRegion.height)
        .toBeGreaterThanOrEqual(204)

      const crop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[0].partCrop.dataUrl)

      expect(crop).toBeDefined()
      expect(countPixelsMatching(crop!, [35, 120, 35])).toBeGreaterThan(3_400)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not keep a larger foreign part from the left side of the preview search", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 380, height: 230 }, [216, 239, 250])
      drawRect(imageData, { x: 150, y: 144, width: 92, height: 48 }, [180, 30, 30])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 156, 216)
      drawRect(imageData, { x: 258, y: 146, width: 38, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 258, 216)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(2)

      const rightCrop = canvasApi.getImageDataForDataUrl(result.callouts[0].partItems[1].partCrop.dataUrl)

      expect(rightCrop).toBeDefined()
      expect(countPixelsMatching(rightCrop!, [35, 120, 35])).toBeGreaterThan(1_500)
      expect(countPixelsMatching(rightCrop!, [180, 30, 30])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not let a lower quantity label borrow an upper part component", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 390, height: 330 }, [216, 239, 250])
      drawRect(imageData, { x: 150, y: 142, width: 54, height: 34 }, [180, 30, 30])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 154, 206)
      drawRect(imageData, { x: 132, y: 242, width: 78, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleSplitMarkerTwoQuantityMask, 140, 316)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      const lowerItem = result.callouts[0].partItems.find((item) => item.quantity.value === 2)

      expect(result.callouts[0].partItems).toHaveLength(2)
      expect(lowerItem).toBeDefined()
      expect(lowerItem!.partRegion.y).toBeGreaterThanOrEqual(238)

      const lowerCrop = canvasApi.getImageDataForDataUrl(lowerItem!.partCrop.dataUrl)

      expect(lowerCrop).toBeDefined()
      expect(countPixelsMatching(lowerCrop!, [35, 120, 35])).toBeGreaterThan(2_500)
      expect(countPixelsMatching(lowerCrop!, [180, 30, 30])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("assigns diagonal neighboring part components to their closest quantity labels", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 760)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 470, height: 390 }, [216, 239, 250])
      drawRect(imageData, { x: 145, y: 250, width: 112, height: 44 }, [180, 30, 30])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 150, 322)
      drawRect(imageData, { x: 280, y: 246, width: 34, height: 98 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 286, 350)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 760 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(2)

      const sortedItems = [...result.callouts[0].partItems].sort((left, right) =>
        left.quantityLabel.region.x - right.quantityLabel.region.x
      )
      const leftCrop = canvasApi.getImageDataForDataUrl(sortedItems[0]!.partCrop.dataUrl)
      const rightCrop = canvasApi.getImageDataForDataUrl(sortedItems[1]!.partCrop.dataUrl)

      expect(leftCrop).toBeDefined()
      expect(rightCrop).toBeDefined()
      expect(countPixelsMatching(leftCrop!, [180, 30, 30])).toBeGreaterThan(3_500)
      expect(countPixelsMatching(leftCrop!, [35, 120, 35])).toBe(0)
      expect(countPixelsMatching(rightCrop!, [35, 120, 35])).toBeGreaterThan(2_500)
      expect(countPixelsMatching(rightCrop!, [180, 30, 30])).toBe(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not read colored part surface details as quantity text", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 320, height: 230 }, [216, 239, 250])
      drawRect(imageData, { x: 135, y: 135, width: 210, height: 118 }, [35, 120, 35])
      drawRect(imageData, { x: 148, y: 215, width: 6, height: 25 }, [12, 72, 20])
      drawRect(imageData, { x: 155, y: 237, width: 62, height: 4 }, [12, 72, 20])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 145,
        y: 272,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)
      expect(result.callouts[0].partItems[0].quantity.value).toBe(1)
      expect(result.callouts[0].partItems[0].quantityLabel.region.y).toBeGreaterThan(260)
      expect(result.callouts[0].partItems[0].quantityLabel.region.width).toBeLessThan(60)
    } finally {
      canvasApi.restore()
    }
  })

  it("scans the first five pages that are not BOM pages", () => {
    expect(getInitialStepCalloutPageNumbers(9, new Set([2, 6, 9]), 5)).toEqual([1, 3, 4, 5, 7])
  })

  it("defaults to the full non-BOM manual", () => {
    expect(getInitialStepCalloutPageNumbers(15, new Set([2, 6, 9]))).toEqual([
      1,
      3,
      4,
      5,
      7,
      8,
      10,
      11,
      12,
      13,
      14,
      15,
    ])
  })

  it("scans the full non-BOM manual when no page limit is set", () => {
    expect(getInitialStepCalloutPageNumbers(9, new Set([2, 6, 9]), null)).toEqual([1, 3, 4, 5, 7, 8])
  })

  it("maps rendered callout and item crops back to page source regions", async () => {
    const canvasApi = installMockCanvasApi()
    const cleanup = vi.fn()
    const progress: Array<{ detectedCalloutCount: number; progress: number }> = []

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 220, height: 160 }, [216, 239, 250])
      drawSyntheticPartItem(imageData, { x: 135, y: 135, width: 58, height: 46 })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            cleanup,
          getViewport: ({ scale }) => ({
            height: 700 * scale,
            width: 1_000 * scale,
          }),
          getTextContent: vi.fn(async () => ({
            items: [
              { str: "2x", transform: [1, 0, 0, 12, 145, 493], width: 18, height: 12 },
            ],
          })),
          pageNumber,
          render: ({ canvas }) => {
            canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          onProgress: (nextProgress) => {
            progress.push({
              detectedCalloutCount: nextProgress.detectedCalloutCount,
              progress: nextProgress.progress,
            })
          },
          renderMaxWidth: 1_000,
        },
      )

      expect(result.detectorVersion).toBe(stepCalloutDetectorVersion)
      expect(result.scannedPageNumbers).toEqual([1])
      expect(result.callouts).toHaveLength(1)
      expect(result.callouts[0].crop.dataUrl).toContain(
        `w${result.callouts[0].sourceRegion.width}h${result.callouts[0].sourceRegion.height}`,
      )
      expect(result.callouts[0].sourceRegion).toEqual({
        height: 171,
        unit: "step_pixel",
        width: 231,
        x: 94,
        y: 94,
      })
      expect(result.callouts[0].partItems).toHaveLength(1)
      expect(result.callouts[0].partItems[0].quantity.value).toBe(2)
      expect(result.callouts[0].partItems[0].detectedColor.name).toBe("Green")
      expect(result.callouts[0].partItems[0].partRegion.y).toBeLessThan(
        result.callouts[0].partItems[0].quantityLabel.region.y,
      )
      expect(result.callouts[0].partItems[0].sourceRegion.x).toBeGreaterThan(result.callouts[0].sourceRegion.x)
      expect(progress.at(-1)).toEqual({ detectedCalloutCount: 1, progress: 98 })
      expect(cleanup).toHaveBeenCalledTimes(1)
    } finally {
      canvasApi.restore()
    }
  })

  it("uses the native text region for the displayed quantity crop", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 220, height: 160 }, [216, 239, 250])
      drawRect(imageData, { x: 135, y: 135, width: 58, height: 46 }, [35, 120, 35])
      drawRect(imageData, { x: 150, y: 160, width: 28, height: 10 }, [0, 0, 0])
      drawSyntheticQuantityMask(imageData, manualStyleSplitMarkerTwoQuantityMask, 145, 195)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getTextContent: vi.fn(async () => ({
              items: [
                { str: "2x", transform: [1, 0, 0, 12, 145, 493], width: 18, height: 12 },
              ],
            })),
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems[0].quantity.value).toBe(2)
      expect(result.callouts[0].partItems[0].quantityLabel.region).toEqual({
        height: 16,
        unit: "step_pixel",
        width: 24,
        x: 143,
        y: 193,
      })
      expect(result.callouts[0].partItems[0].quantityLabel.region.y).toBeGreaterThan(
        result.callouts[0].partItems[0].partRegion.y + result.callouts[0].partItems[0].partRegion.height,
      )
    } finally {
      canvasApi.restore()
    }
  })

  it("groups visually matching callout part images within five detected steps", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 90, width: 240, height: 180 }, [216, 239, 250])
      drawSyntheticPartItem(imageData, { x: 138, y: 126, width: 64, height: 48 })
      drawBorderOnlyRect(imageData, { x: 100, y: 330, width: 240, height: 180 }, [216, 239, 250])
      drawSyntheticPartItem(imageData, { x: 138, y: 366, width: 64, height: 48 })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(result.callouts).toHaveLength(2)
      expect(partItems).toHaveLength(2)
      expect(partItems[0].localImageMatch?.groupId).toBe(partItems[1].localImageMatch?.groupId)
      expect(partItems[0].localImageMatch).toMatchObject({
        itemCount: 2,
        stepGroupIndex: 1,
        stepGroupRange: {
          end: 5,
          start: 1,
        },
      })
    } finally {
      canvasApi.restore()
    }
  })

  it("groups same callout part images when one step renders the part smaller", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 90, width: 240, height: 180 }, [216, 239, 250])
      drawSyntheticPartItem(imageData, { x: 138, y: 126, width: 64, height: 48 })
      drawBorderOnlyRect(imageData, { x: 100, y: 330, width: 240, height: 180 }, [216, 239, 250])
      drawSyntheticPartItem(imageData, { x: 146, y: 372, width: 48, height: 36 })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(result.callouts).toHaveLength(2)
      expect(partItems).toHaveLength(2)
      expect(partItems[0].localImageMatch?.groupId).toBe(partItems[1].localImageMatch?.groupId)
      expect(partItems[0].localImageMatch).toMatchObject({
        itemCount: 2,
        stepGroupIndex: 1,
      })
    } finally {
      canvasApi.restore()
    }
  })

  it("does not group visually matching part images from the same detected step", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 90, width: 420, height: 190 }, [216, 239, 250])
      drawSyntheticPartItem(imageData, { x: 138, y: 126, width: 64, height: 48 })
      drawSyntheticPartItem(imageData, { x: 286, y: 126, width: 64, height: 48 })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(result.callouts).toHaveLength(1)
      expect(partItems).toHaveLength(2)
      expect(partItems[0].localImageMatch?.groupId).not.toBe(partItems[1].localImageMatch?.groupId)
      expect(partItems.map((item) => item.localImageMatch?.itemCount)).toEqual([1, 1])
    } finally {
      canvasApi.restore()
    }
  })

  it("does not group same-color callout images when preserved silhouettes differ", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 90, width: 260, height: 190 }, [216, 239, 250])
      drawLShapedPart(imageData, { x: 138, y: 126, width: 64, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 190,
      })
      drawBorderOnlyRect(imageData, { x: 100, y: 330, width: 260, height: 190 }, [216, 239, 250])
      drawRect(imageData, { x: 138, y: 366, width: 64, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 430,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(result.callouts).toHaveLength(2)
      expect(partItems).toHaveLength(2)
      expect(partItems[0].detectedColor.name).toBe("Green")
      expect(partItems[1].detectedColor.name).toBe("Green")
      expect(partItems[0].localImageMatch?.groupId).not.toBe(partItems[1].localImageMatch?.groupId)
      expect(partItems.map((item) => item.localImageMatch?.itemCount)).toEqual([1, 1])
      expect(partItems[0].localImageRejectedMatches?.[0]).toMatchObject({
        candidateItemId: partItems[1].id,
        candidateStepIndex: 2,
        source: "local_callout",
      })
      expect(partItems[0].localImageRejectedMatches?.[0]?.reason).toMatch(/below|mismatch/)
      expect(partItems[1].localImageRejectedMatches?.[0]).toMatchObject({
        candidateItemId: partItems[0].id,
        candidateStepIndex: 1,
        source: "local_callout",
      })
    } finally {
      canvasApi.restore()
    }
  })

  it("does not group sparse and solid parts with the same color and bounding envelope", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 90, width: 260, height: 190 }, [216, 239, 250])
      drawRect(imageData, { x: 138, y: 126, width: 82, height: 46 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 190,
      })
      drawBorderOnlyRect(imageData, { x: 100, y: 330, width: 260, height: 190 }, [216, 239, 250])
      drawSparseVinePart(imageData, { x: 138, y: 366, width: 82, height: 46 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 430,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(result.callouts).toHaveLength(2)
      expect(partItems).toHaveLength(2)
      expect(partItems[0].detectedColor.name).toBe("Green")
      expect(partItems[1].detectedColor.name).toBe("Green")
      expect(partItems[0].localImageMatch?.groupId).not.toBe(partItems[1].localImageMatch?.groupId)
      expect(partItems.map((item) => item.localImageMatch?.itemCount)).toEqual([1, 1])
    } finally {
      canvasApi.restore()
    }
  })

  it("does not group same-shaped callout part images when the detected colors differ", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 90, width: 240, height: 180 }, [216, 239, 250])
      drawColoredPartItem(imageData, { x: 138, y: 126, width: 64, height: 48 }, [35, 120, 35])
      drawBorderOnlyRect(imageData, { x: 100, y: 330, width: 240, height: 180 }, [216, 239, 250])
      drawColoredPartItem(imageData, { x: 138, y: 366, width: 64, height: 48 }, [108, 110, 104])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(partItems).toHaveLength(2)
      expect(partItems[0].detectedColor.name).toBe("Green")
      expect(partItems[1].detectedColor.name).toBe("Dark Bluish Gray")
      expect(partItems[0].localImageMatch?.groupId).not.toBe(partItems[1].localImageMatch?.groupId)
      expect(partItems.map((item) => item.localImageMatch?.itemCount)).toEqual([1, 1])
      expect(partItems[0].localImageRejectedMatches).toEqual([])
      expect(partItems[1].localImageRejectedMatches).toEqual([])
    } finally {
      canvasApi.restore()
    }
  })

  it("does not group green plate-like and brick-like callout images just because both are dense", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 90, width: 260, height: 180 }, [216, 239, 250])
      drawColoredPartItem(imageData, { x: 132, y: 130, width: 98, height: 24 }, [35, 120, 35])
      drawBorderOnlyRect(imageData, { x: 100, y: 330, width: 260, height: 180 }, [216, 239, 250])
      drawColoredPartItem(imageData, { x: 150, y: 364, width: 48, height: 52 }, [35, 120, 35])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        {
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(partItems).toHaveLength(2)
      expect(partItems[0].localImageMatch?.groupId).not.toBe(partItems[1].localImageMatch?.groupId)
      expect(partItems.map((item) => item.localImageMatch?.itemCount)).toEqual([1, 1])
    } finally {
      canvasApi.restore()
    }
  })

  it("groups repeated callout part images without promoting inventory rows", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const stepPageImageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 90, width: 240, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 138, y: 126, width: 64, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 188,
      })
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 330, width: 240, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 138, y: 366, width: 64, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 428,
      })

      const inventoryPageImageData = createSyntheticPage(1_000, 700)
      drawRect(inventoryPageImageData, { x: 300, y: 220, width: 64, height: 48 }, [35, 120, 35])
      drawRect(inventoryPageImageData, { x: 500, y: 220, width: 78, height: 48 }, [35, 120, 35])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, pageNumber === 2 ? inventoryPageImageData : stepPageImageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 2,
        },
        {
          excludedPageNumbers: [2],
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(partItems).toHaveLength(2)
      expect(partItems[0].localImageMatch?.stepGroupRange).toEqual({ end: 5, start: 1 })
      expect(partItems[0].localImageMatch?.groupId).toBe(partItems[1].localImageMatch?.groupId)
      expect(partItems[0]).not.toHaveProperty("inventoryMatch")
    } finally {
      canvasApi.restore()
    }
  })

  it("does not reconcile step items onto any inventory rows", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const stepPageImageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 90, width: 240, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 138, y: 126, width: 64, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 188,
      })
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 330, width: 240, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 138, y: 366, width: 64, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 428,
      })

      const inventoryPageImageData = createSyntheticPage(1_000, 700)
      drawRect(inventoryPageImageData, { x: 300, y: 220, width: 64, height: 48 }, [35, 120, 35])
      drawRect(inventoryPageImageData, { x: 500, y: 220, width: 64, height: 48 }, [108, 110, 104])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, pageNumber === 2 ? inventoryPageImageData : stepPageImageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 2,
        },
        {
          excludedPageNumbers: [2],
          renderMaxWidth: 1_000,
        },
      )

      const partItems = result.callouts.flatMap((callout) => callout.partItems)

      expect(partItems).toHaveLength(2)
      expect(partItems[0]).not.toHaveProperty("inventoryMatch")
      expect(result).not.toHaveProperty("inventoryRemainders")
    } finally {
      canvasApi.restore()
    }
  })

  it("matches step items to same-manual BOM thumbnail rows when inventory rows are supplied", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const stepPageImageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 100, width: 260, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 135, y: 135, width: 58, height: 46 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 145,
        y: 195,
      })
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 360, width: 260, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 135, y: 395, width: 58, height: 46 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 145,
        y: 455,
      })

      const inventoryPageImageData = createSyntheticPage(1_000, 700)
      drawRect(inventoryPageImageData, { x: 300, y: 220, width: 58, height: 46 }, [35, 120, 35])
      drawRect(inventoryPageImageData, { x: 460, y: 220, width: 58, height: 46 }, [108, 110, 104])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, pageNumber === 2 ? inventoryPageImageData : stepPageImageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 2,
        },
        {
          excludedPageNumbers: [2],
          inventoryRows: [
            createInventoryMatchRow("bom-green-3005", {
              colorId: "6",
              colorName: "Green",
              partNumber: "3005",
              quantity: 2,
              region: { height: 76, width: 90, x: 284, y: 204 },
            }),
            createInventoryMatchRow("bom-gray-3005", {
              colorId: "72",
              colorName: "Dark Bluish Gray",
              partNumber: "3005",
              region: { height: 76, width: 90, x: 444, y: 204 },
            }),
          ],
          renderMaxWidth: 1_000,
        },
      )

      const matches = result.callouts.flatMap((callout) => callout.partItems.map((item) => item.bomImageMatch))
      expect(matches).toHaveLength(2)
      expect(matches).toEqual([
        expect.objectContaining({
          colorId: "6",
          colorName: "Green",
          partNumber: "3005",
          rowId: "bom-green-3005",
        }),
        expect.objectContaining({
          colorId: "6",
          colorName: "Green",
          partNumber: "3005",
          rowId: "bom-green-3005",
        }),
      ])
    } finally {
      canvasApi.restore()
    }
  })

  it("leaves a step item unmatched instead of overfilling a matched BOM row", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const stepPageImageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 90, width: 240, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 138, y: 126, width: 64, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 188,
      })
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 330, width: 240, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 138, y: 366, width: 64, height: 48 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 428,
      })

      const inventoryPageImageData = createSyntheticPage(1_000, 700)
      drawRect(inventoryPageImageData, { x: 300, y: 220, width: 64, height: 48 }, [35, 120, 35])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, pageNumber === 2 ? inventoryPageImageData : stepPageImageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 2,
        },
        {
          excludedPageNumbers: [2],
          inventoryRows: [
            createInventoryMatchRow("best-row", {
              colorId: "6",
              colorName: "Green",
              partNumber: "3005",
              quantity: 1,
              region: { height: 78, width: 94, x: 285, y: 205 },
            }),
          ],
          renderMaxWidth: 1_000,
        },
      )

      const matches = result.callouts.flatMap((callout) => callout.partItems.map((item) => item.bomImageMatch))

      expect(matches.filter((match) => match?.rowId === "best-row")).toHaveLength(1)
      expect(matches.filter((match) => match == null)).toHaveLength(1)
    } finally {
      canvasApi.restore()
    }
  })

  it("leaves legacy inventory match fields empty during local grouping", async () => {
    const canvasApi = installMockCanvasApi()
    const cleanup = vi.fn()

    try {
      const stepPageImageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 100, width: 260, height: 180 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 135, y: 135, width: 58, height: 46 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 145,
        y: 195,
      })

      const inventoryPageImageData = createSyntheticPage(1_000, 700)
      drawRect(inventoryPageImageData, { x: 300, y: 220, width: 58, height: 46 }, [35, 120, 35])
      drawRect(inventoryPageImageData, { x: 460, y: 220, width: 76, height: 24 }, [108, 110, 104])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            cleanup,
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, pageNumber === 2 ? inventoryPageImageData : stepPageImageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 2,
        },
        {
          excludedPageNumbers: [2],
          renderMaxWidth: 1_000,
        },
      )

      expect(result.callouts[0].partItems[0]).not.toHaveProperty("inventoryMatch")
      expect(cleanup).toHaveBeenCalledTimes(1)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not compare smaller step renderings against larger BOM thumbnails", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const stepPageImageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 100, width: 320, height: 200 }, [216, 239, 250])
      drawLShapedPart(stepPageImageData, { x: 135, y: 135, width: 42, height: 34 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "1x",
        x: 142,
        y: 184,
      })

      const inventoryPageImageData = createSyntheticPage(1_000, 700)
      drawLShapedPart(inventoryPageImageData, { x: 300, y: 210, width: 126, height: 102 }, [35, 120, 35])
      drawRect(inventoryPageImageData, { x: 520, y: 214, width: 126, height: 102 }, [35, 120, 35])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, pageNumber === 2 ? inventoryPageImageData : stepPageImageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 2,
        },
        {
          excludedPageNumbers: [2],
          renderMaxWidth: 1_000,
        },
      )

      expect(result.callouts[0].partItems[0]).not.toHaveProperty("inventoryMatch")
    } finally {
      canvasApi.restore()
    }
  })

  it("does not fetch catalogue previews while matching same-manual BOM thumbnails", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const stepPageImageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 100, width: 320, height: 190 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 135, y: 138, width: 78, height: 24 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "2x",
        x: 150,
        y: 180,
      })

      const inventoryPageImageData = createSyntheticPage(1_000, 700)
      drawSparseVinePart(inventoryPageImageData, { x: 300, y: 214, width: 112, height: 46 }, [35, 120, 35])
      drawRect(inventoryPageImageData, { x: 500, y: 222, width: 116, height: 36 }, [35, 120, 35])
      vi.stubGlobal("fetch", vi.fn())

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, pageNumber === 2 ? inventoryPageImageData : stepPageImageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 2,
        },
        {
          excludedPageNumbers: [2],
          inventoryRows: [
            createInventoryMatchRow("sparse-vine", {
              colorId: "6",
              colorName: "Green",
              partNumber: "55236",
              region: { height: 86, width: 138, x: 286, y: 194 },
            }),
            createInventoryMatchRow("solid-plate", {
              colorId: "6",
              colorName: "Green",
              partNumber: "3023",
              region: { height: 76, width: 136, x: 490, y: 202 },
            }),
          ],
          renderMaxWidth: 1_000,
        },
      )

      expect(result.callouts[0].partItems[0]).not.toHaveProperty("inventoryMatch")
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      canvasApi.restore()
    }
  })

  it("keeps quantity and color on callout items without using them for inventory ties", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const stepPageImageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(stepPageImageData, { x: 100, y: 100, width: 360, height: 190 }, [216, 239, 250])
      drawRect(stepPageImageData, { x: 135, y: 138, width: 78, height: 24 }, [35, 120, 35])
      drawSyntheticQuantityText(stepPageImageData, {
        scale: 2,
        text: "2x",
        x: 150,
        y: 180,
      })

      const inventoryPageImageData = createSyntheticPage(1_000, 700)
      drawRect(inventoryPageImageData, { x: 300, y: 222, width: 116, height: 36 }, [201, 26, 9])
      drawRect(inventoryPageImageData, { x: 500, y: 222, width: 116, height: 36 }, [35, 120, 35])
      drawRect(inventoryPageImageData, { x: 700, y: 222, width: 116, height: 36 }, [35, 120, 35])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, pageNumber === 2 ? inventoryPageImageData : stepPageImageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 2,
        },
        {
          excludedPageNumbers: [2],
          renderMaxWidth: 1_000,
        },
      )

      expect(result.callouts[0].partItems[0].quantity.value).toBe(2)
      expect(result.callouts[0].partItems[0].detectedColor.name).toBe("Green")
      expect(result.callouts[0].partItems[0]).not.toHaveProperty("inventoryMatch")
    } finally {
      canvasApi.restore()
    }
  })

  it("reads manual-style 1x quantity labels without treating the trailing marker as a digit", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 220, height: 160 }, [216, 239, 250])
      drawRect(imageData, { x: 135, y: 135, width: 58, height: 46 }, [35, 120, 35])
      drawSyntheticQuantityMask(imageData, manualStyleOneQuantityMask, 145, 195)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems[0].quantity.value).toBe(1)
    } finally {
      canvasApi.restore()
    }
  })

  it("separates split trailing x markers before classifying manual-style quantity digits", async () => {
    for (const { expected, mask } of [
      { expected: 1, mask: manualStyleSplitMarkerOneQuantityMask },
      { expected: 1, mask: manualStyleSerifOneQuantityMask },
      { expected: 1, mask: annotatedTallSlopedOneQuantityMask },
      { expected: 1, mask: annotatedNarrowSlopedOneQuantityMask },
      { expected: 11, mask: annotatedElevenQuantityMask },
      { expected: 2, mask: manualStyleSplitMarkerTwoQuantityMask },
      { expected: 3, mask: manualStyleSplitMarkerThreeQuantityMask },
      { expected: 3, mask: manualStyleRoundedThreeQuantityMask },
      { expected: 3, mask: manualStyleLowBottomThreeQuantityMask },
      { expected: 4, mask: manualStyleSplitMarkerFourQuantityMask },
      { expected: 4, mask: manualStyleRightWeightedFourQuantityMask },
      { expected: 4, mask: manualStyleCompactFourQuantityMask },
      { expected: 4, mask: manualStyleOpenLeftFourQuantityMask },
      { expected: 4, mask: manualStyleDenseTopFourQuantityMask },
      { expected: 4, mask: annotatedReddishBrownFourQuantityMask },
      { expected: 4, mask: annotatedTransparentFourQuantityMask },
      { expected: 9, mask: manualStyleSplitMarkerNineQuantityMask },
    ]) {
      const canvasApi = installMockCanvasApi()

      try {
        const imageData = createSyntheticPage(1_000, 700)
        drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 240, height: 170 }, [216, 239, 250])
        drawRect(imageData, { x: 135, y: 135, width: 58, height: 46 }, [35, 120, 35])
        drawSyntheticQuantityMask(imageData, mask, 145, 195)

        const result = await detectStepCalloutsFromPdfDocument(
          {
            getPage: async (pageNumber) => ({
              getViewport: ({ scale }) => ({
                height: 700 * scale,
                width: 1_000 * scale,
              }),
              pageNumber,
              render: ({ canvas }) => {
                canvasApi.setCanvasImageData(canvas, imageData)

                return { promise: Promise.resolve() }
              },
            }),
            numPages: 1,
          },
          { renderMaxWidth: 1_000 },
        )

        expect(result.callouts[0].partItems[0].quantity.value).toBe(expected)
      } finally {
        canvasApi.restore()
      }
    }
  })

  it("does not invent a quantity from a crop that only contains the trailing marker", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 220, height: 180 }, [216, 239, 250])
      drawRect(imageData, { x: 145, y: 135, width: 36, height: 74 }, [160, 166, 170])
      drawSyntheticQuantityMask(imageData, manualStyleMarkerOnlyQuantityMask, 146, 220)

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("reads only the digit run immediately before the trailing quantity marker", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 320, height: 260 }, [216, 239, 250])
      drawRect(imageData, { x: 150, y: 132, width: 150, height: 120 }, [160, 166, 170])
      drawRect(imageData, { x: 160, y: 150, width: 6, height: 86 }, [35, 35, 35])
      drawRect(imageData, { x: 166, y: 214, width: 26, height: 6 }, [35, 35, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 198,
        y: 272,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)
      expect(result.callouts[0].partItems[0].quantity.value).toBe(1)
      expect(result.callouts[0].partItems[0].quantity.text).toBe("1")
    } finally {
      canvasApi.restore()
    }
  })

  it("reads image 4x quantity labels as four", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 220, height: 160 }, [216, 239, 250])
      drawRect(imageData, { x: 135, y: 135, width: 58, height: 46 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 3,
        text: "4x",
        x: 145,
        y: 195,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems[0].quantity.value).toBe(4)
    } finally {
      canvasApi.restore()
    }
  })

  it("reads compact image 4x labels below narrow item crops", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 220, height: 180 }, [216, 239, 250])
      drawRect(imageData, { x: 145, y: 135, width: 34, height: 46 }, [88, 42, 18])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "4x",
        x: 145,
        y: 195,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems[0].quantity.value).toBe(4)
    } finally {
      canvasApi.restore()
    }
  })

  it("reads multi-digit image quantity labels before the trailing marker", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 260, height: 180 }, [216, 239, 250])
      drawRect(imageData, { x: 135, y: 135, width: 76, height: 52 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 3,
        text: "10x",
        x: 145,
        y: 202,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems[0].quantity.value).toBe(10)
    } finally {
      canvasApi.restore()
    }
  })

  it("keeps valid non-repeated quantities above the normal callout range", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 300, height: 180 }, [216, 239, 250])
      drawRect(imageData, { x: 135, y: 135, width: 76, height: 52 }, [35, 120, 35])
      drawSyntheticQuantityText(imageData, {
        scale: 3,
        text: "24x",
        x: 145,
        y: 202,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems[0].quantity.value).toBe(24)
    } finally {
      canvasApi.restore()
    }
  })

  it("does not accept implausible repeated digits from part detail as a step quantity", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 220, height: 190 }, [216, 239, 250])
      drawRect(imageData, { x: 145, y: 135, width: 66, height: 80 }, [160, 166, 170])
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "66x",
        x: 145,
        y: 228,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(0)
    } finally {
      canvasApi.restore()
    }
  })

  it("biases part color detection toward surfaces over dark line art", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 300, height: 180 }, [216, 239, 250])
      drawInkHeavyPartItem(imageData, { x: 135, y: 135, width: 48, height: 38 }, [108, 110, 104])
      drawInkHeavyPartItem(imageData, { x: 235, y: 136, width: 44, height: 36 }, [35, 120, 35])

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems.map((item) => item.detectedColor.name)).toEqual([
        "Dark Bluish Gray",
        "Green",
      ])
    } finally {
      canvasApi.restore()
    }
  })

  it("detects narrow transparent orange parts instead of naming their dark edges reddish brown", async () => {
    const canvasApi = installMockCanvasApi()

    try {
      const imageData = createSyntheticPage(1_000, 700)
      drawBorderOnlyRect(imageData, { x: 100, y: 100, width: 260, height: 210 }, [216, 239, 250])
      drawTransparentOrangeFlameLikePart(imageData, { x: 150, y: 132, width: 34, height: 56 })
      drawSyntheticQuantityText(imageData, {
        scale: 2,
        text: "1x",
        x: 150,
        y: 204,
      })

      const result = await detectStepCalloutsFromPdfDocument(
        {
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              height: 700 * scale,
              width: 1_000 * scale,
            }),
            pageNumber,
            render: ({ canvas }) => {
              canvasApi.setCanvasImageData(canvas, imageData)

              return { promise: Promise.resolve() }
            },
          }),
          numPages: 1,
        },
        { renderMaxWidth: 1_000 },
      )

      expect(result.callouts[0].partItems).toHaveLength(1)
      expect(result.callouts[0].partItems[0].detectedColor.name).toBe("Trans-Orange")
    } finally {
      canvasApi.restore()
    }
  })
})

type Rect = {
  height: number
  width: number
  x: number
  y: number
}

type Rgb = readonly [number, number, number]

function createSyntheticPage(width: number, height: number, background: Rgb = [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)

  for (let index = 0; index < data.length; index += 4) {
    data[index] = background[0]
    data[index + 1] = background[1]
    data[index + 2] = background[2]
    data[index + 3] = 255
  }

  return { data, height, width }
}

function drawSyntheticPartItem(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect) {
  drawColoredPartItem(imageData, rect, [35, 120, 35])
}

function drawColoredPartItem(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect, fill: Rgb) {
  drawRect(imageData, rect, fill)
  drawSyntheticQuantityMask(
    imageData,
    manualStyleOneQuantityMask,
    rect.x + Math.round(rect.width * 0.18),
    rect.y + rect.height + 14,
  )
}

function drawInkHeavyPartItem(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect, fill: Rgb) {
  drawRect(imageData, rect, fill)
  drawRect(imageData, { height: 2, width: rect.width, x: rect.x, y: rect.y }, [0, 0, 0])
  drawRect(imageData, { height: 2, width: rect.width, x: rect.x, y: rect.y + rect.height - 2 }, [0, 0, 0])
  drawRect(imageData, { height: rect.height, width: 2, x: rect.x, y: rect.y }, [0, 0, 0])
  drawRect(imageData, { height: rect.height, width: 2, x: rect.x + rect.width - 2, y: rect.y }, [0, 0, 0])

  for (let x = rect.x + 7; x < rect.x + rect.width - 4; x += 8) {
    drawRect(imageData, { height: rect.height - 8, width: 1, x, y: rect.y + 4 }, [0, 0, 0])
  }
  for (let y = rect.y + 7; y < rect.y + rect.height - 4; y += 8) {
    drawRect(imageData, { height: 1, width: rect.width - 8, x: rect.x + 4, y }, [0, 0, 0])
  }

  drawSyntheticQuantityMask(
    imageData,
    manualStyleOneQuantityMask,
    rect.x + Math.round(rect.width * 0.18),
    rect.y + rect.height + 14,
  )
}

function drawLShapedPart(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect, fill: Rgb) {
  const barWidth = Math.max(3, Math.round(rect.width * 0.36))
  const barHeight = Math.max(3, Math.round(rect.height * 0.38))

  drawRect(imageData, {
    height: rect.height,
    width: barWidth,
    x: rect.x,
    y: rect.y,
  }, fill)
  drawRect(imageData, {
    height: barHeight,
    width: rect.width,
    x: rect.x,
    y: rect.y + rect.height - barHeight,
  }, fill)
  drawRect(imageData, {
    height: Math.max(2, Math.round(rect.height * 0.18)),
    width: Math.max(4, Math.round(rect.width * 0.62)),
    x: rect.x,
    y: rect.y,
  }, fill)
}

function drawTransparentOrangeFlameLikePart(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect) {
  const outline: Rgb = [74, 51, 25]
  const tint: Rgb = [196, 184, 154]
  const highlight: Rgb = [226, 197, 134]

  drawRect(imageData, {
    height: rect.height,
    width: Math.max(5, Math.round(rect.width * 0.28)),
    x: rect.x + Math.round(rect.width * 0.2),
    y: rect.y,
  }, outline)
  drawRect(imageData, {
    height: Math.max(5, Math.round(rect.height * 0.78)),
    width: Math.max(7, Math.round(rect.width * 0.48)),
    x: rect.x + Math.round(rect.width * 0.32),
    y: rect.y + Math.round(rect.height * 0.16),
  }, tint)
  drawRect(imageData, {
    height: Math.max(4, Math.round(rect.height * 0.36)),
    width: Math.max(5, Math.round(rect.width * 0.28)),
    x: rect.x + Math.round(rect.width * 0.54),
    y: rect.y + Math.round(rect.height * 0.48),
  }, outline)
  drawRect(imageData, {
    height: Math.max(5, Math.round(rect.height * 0.24)),
    width: Math.max(5, Math.round(rect.width * 0.24)),
    x: rect.x + Math.round(rect.width * 0.4),
    y: rect.y + Math.round(rect.height * 0.34),
  }, highlight)
}

function drawSparseVinePart(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect, fill: Rgb) {
  const stemHeight = Math.max(3, Math.round(rect.height * 0.16))
  const leafSize = Math.max(4, Math.round(rect.height * 0.22))

  drawRect(imageData, {
    height: stemHeight,
    width: rect.width,
    x: rect.x,
    y: rect.y + Math.round(rect.height * 0.42),
  }, fill)
  for (let index = 0; index < 4; index += 1) {
    const leafX = rect.x + Math.round(rect.width * (0.16 + index * 0.2))
    const leafY = rect.y + (index % 2 === 0 ? Math.round(rect.height * 0.18) : Math.round(rect.height * 0.54))
    drawRect(imageData, {
      height: leafSize,
      width: leafSize,
      x: leafX,
      y: leafY,
    }, fill)
  }
}

function drawSyntheticQuantityText(
  imageData: ReturnType<typeof createSyntheticPage>,
  {
    scale,
    text,
    x,
    y,
  }: {
    scale: number
    text: string
    x: number
    y: number
  },
) {
  let cursorX = x
  for (const char of text) {
    const pattern = syntheticQuantityGlyphs[char]
    if (!pattern) {
      cursorX += scale * 3
      continue
    }

    for (let row = 0; row < pattern.length; row += 1) {
      for (let column = 0; column < pattern[row].length; column += 1) {
        if (pattern[row][column] !== "1") {
          continue
        }

        drawRect(imageData, {
          height: scale,
          width: scale,
          x: cursorX + (column * scale),
          y: y + (row * scale),
        }, [0, 0, 0])
      }
    }

    cursorX += (pattern[0].length + 1) * scale
  }
}

const syntheticQuantityGlyphs: Record<string, string[]> = {
  "0": [
    "11111",
    "10001",
    "10011",
    "10101",
    "11001",
    "10001",
    "11111",
  ],
  "1": [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "11111",
  ],
  "2": [
    "11111",
    "00001",
    "00001",
    "11111",
    "10000",
    "10000",
    "11111",
  ],
  "3": [
    "11111",
    "00001",
    "00001",
    "11111",
    "00001",
    "00001",
    "11111",
  ],
  "4": [
    "10001",
    "10001",
    "10001",
    "11111",
    "00001",
    "00001",
    "00001",
  ],
  x: [
    "10001",
    "01010",
    "00100",
    "00100",
    "00100",
    "01010",
    "10001",
  ],
}

const manualStyleOneQuantityMask = [
  "....##...............",
  "...###...............",
  "..####...............",
  "######...............",
  "##..##......#......#.",
  "....##......##....##.",
  "....##......###...##.",
  "....##.......##..##..",
  "....##........####...",
  "....##........####...",
  "....##........####...",
  "....##........####...",
  "....##.......##..##..",
  "....##.......##..###.",
  "....##......##....##.",
  "....##.....###.....##",
]

const manualStyleSplitMarkerOneQuantityMask = [
  "....##.................",
  "...###.................",
  "..####.................",
  "....##.................",
  "....##........#.....#..",
  "....##.........#...#...",
  "....##..........#.#....",
  "....##...........#.....",
  "....##..........#.#....",
  "....##.........#...#...",
  "....##........#.....#..",
  "....##.................",
  "....##.................",
  "....##.................",
  "....##.................",
  "....##.................",
]

const manualStyleSerifOneQuantityMask = [
  "...###..................",
  "..####..................",
  "...###..................",
  "....##..................",
  "....##.........#.....#..",
  "....##..........#...#...",
  "....##...........#.#....",
  "....##............#.....",
  "....##...........#.#....",
  "....##..........#...#...",
  "....##........#.....#..",
  "....##.................",
  "........................",
  "........................",
  "........................",
  "........................",
]

const annotatedTallSlopedOneQuantityMask = [
  ".......#................",
  "......###...............",
  ".....####...............",
  "....#####...............",
  "...######...............",
  "..###.###.....###....###",
  "......###......##....##.",
  "......###......###..###.",
  "......###.......######..",
  "......###........####...",
  "......###........####...",
  "......###........####...",
  "......###.......######..",
  "......###.......###.##..",
  "......###......###..###.",
  "......###......##....###",
  ".......##.....###.....##",
  "........................",
]

const annotatedNarrowSlopedOneQuantityMask = [
  ".....##................",
  ".....###...............",
  "....####...............",
  "..######...............",
  ".#######.............#.",
  ".##..###.....###....##",
  ".....##......###...###",
  ".....##.......###.###.",
  ".....##........#####..",
  ".....###........####..",
  ".....###........###...",
  ".....###........####..",
  ".....###.......######.",
  ".....##.......###..##.",
  ".....###.....###...###",
  ".....##......###....##",
  ".....##......##.....##",
  "......................",
]

const annotatedElevenQuantityMask = [
  ".....##...........###...............",
  "....###...........###...............",
  "...####.........#####...............",
  "..#####........######...............",
  ".###.##.......#######.....##......#.",
  ".##..##.......##..###.....###....###",
  ".....##...........###......###..###.",
  ".....##...........###.......##..##..",
  ".....##...........###.......######..",
  ".....##...........###........####...",
  ".....##...........###........####...",
  ".....##...........###........####...",
  ".....##...........###.......######..",
  ".....##...........###......###..###.",
  ".....##...........###......##....##.",
  ".....##...........###.....###....###",
  ".....##............#......##......##",
  "....................................",
]

const manualStyleSplitMarkerTwoQuantityMask = [
  ".######.................",
  "##....##................",
  "......##................",
  "......##................",
  ".....##.........#.....#.",
  "....##...........#...#..",
  "...##.............#.#...",
  "..##...............#....",
  ".##...............#.#...",
  "##...............#...#..",
  "########........#.....#.",
  "########................",
  "........................",
  "........................",
  "........................",
  "........................",
]

const manualStyleSplitMarkerThreeQuantityMask = [
  ".######.................",
  "##....##................",
  "......##................",
  "......##................",
  "...####.........#.....#.",
  "......##.........#...#..",
  "......##..........#.#...",
  "......##...........#....",
  "......##..........#.#...",
  "##....##.........#...#..",
  ".######.........#.....#.",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
]

const manualStyleRoundedThreeQuantityMask = [
  ".######.................",
  "##....##................",
  "......##................",
  ".....##.................",
  "...####.........#.....#.",
  "......##.........#...#..",
  "......##..........#.#...",
  "......##...........#....",
  "......##..........#.#...",
  "##....##.........#...#..",
  ".######.........#.....#.",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
]

const manualStyleLowBottomThreeQuantityMask = [
  ".######.................",
  "##....##................",
  "......##................",
  "......##................",
  "...####.........#.....#.",
  "......##.........#...#..",
  "......##..........#.#...",
  "......##...........#....",
  "......##..........#.#...",
  ".....##..........#...#..",
  "..####..........#.....#.",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
]

const manualStyleSplitMarkerFourQuantityMask = [
  "##...##.................",
  "##...##.................",
  "##...##.................",
  "##...##.................",
  "########........#.....#.",
  ".....##..........#...#..",
  ".....##...........#.#...",
  ".....##............#....",
  ".....##...........#.#...",
  ".....##..........#...#..",
  ".....##.........#.....#.",
  ".....##.................",
  ".....##.................",
  ".....##.................",
  "........................",
  "........................",
]

const manualStyleCompactFourQuantityMask = [
  "...##.##................",
  "..###.##................",
  ".##...##................",
  "##....##................",
  "########........#.....#.",
  "......##.........#...#..",
  "......##..........#.#...",
  "......##...........#....",
  "......##..........#.#...",
  "......##.........#...#..",
  "......##........#.....#.",
  "......##................",
  "......##................",
  "......##................",
  "........................",
  "........................",
]

const manualStyleRightWeightedFourQuantityMask = [
  "..##..##................",
  ".###..##................",
  ".##...##................",
  "##....##................",
  "########........#.....#.",
  "......##.........#...#..",
  "......##..........#.#...",
  "......##...........#....",
  "......##..........#.#...",
  "......##.........#...#..",
  "......##........#.....#.",
  "......##................",
  "......##................",
  "......##................",
  "........................",
  "........................",
]

const manualStyleOpenLeftFourQuantityMask = [
  ".....##.................",
  "....###.................",
  "...####.................",
  "..##.##.................",
  ".##..##.........#.....#.",
  "########.........#...#..",
  ".....##...........#.#...",
  ".....##............#....",
  ".....##...........#.#...",
  ".....##..........#...#..",
  ".....##.........#.....#.",
  ".....##.................",
  ".....##.................",
  ".....##.................",
  "........................",
  "........................",
]

const manualStyleDenseTopFourQuantityMask = [
  "########.................",
  "########.................",
  ".##..##.................",
  "##...##.................",
  "########........#.....#.",
  ".....##..........#...#..",
  ".....##...........#.#...",
  ".....##............#....",
  ".....##...........#.#...",
  ".....##..........#...#..",
  ".....##.........#.....#.",
  ".....##.................",
  ".....##.................",
  ".....##.................",
  "........................",
  "........................",
]

const annotatedReddishBrownFourQuantityMask = [
  ".........##................",
  "........###................",
  ".......####................",
  ".......####................",
  "......##.##.....##.....##.",
  ".....###.##.....###...###.",
  "....###..##.....###...###.",
  "....##...##......###.###..",
  "...##....##.......#####...",
  "..###....##........###....",
  "..####.#####.......###....",
  ".############.....#####...",
  "..###########.....#####...",
  ".........##......###.###..",
  ".........##.....###...###.",
  ".........##....###.....###",
  ".........##....##.......##",
  "..........................",
]

const annotatedTransparentFourQuantityMask = [
  "........##................",
  ".......####...............",
  ".......####...............",
  "......#####...............",
  ".....######....##......##",
  ".....##.###....###....###",
  "....##..###.....###..###.",
  "...###..###......##..##..",
  "..###...###......######..",
  "..##....###.......####...",
  ".#####.####.......####...",
  ".############.....####...",
  ".###########.....######..",
  "........###.....###..###.",
  "........###.....##....##.",
  "........###....###....###",
  "........##.....##......##",
  ".........................",
]

const manualStyleMarkerOnlyQuantityMask = [
  ".........#.....#.",
  "..........#...#..",
  "...........#.#...",
  "............#....",
  "...........#.#...",
  "..........#...#..",
  ".........#.....#.",
  "..................",
]

const manualStyleSplitMarkerNineQuantityMask = [
  ".######.................",
  "##....##................",
  "##....##................",
  "##....##................",
  ".#######........#.....#.",
  "......##.........#...#..",
  "......##..........#.#...",
  "......##...........#....",
  "......##..........#.#...",
  "......##.........#...#..",
  ".######.........#.....#.",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
]

function drawSyntheticQuantityMask(
  imageData: ReturnType<typeof createSyntheticPage>,
  mask: readonly string[],
  x: number,
  y: number,
) {
  for (let row = 0; row < mask.length; row += 1) {
    for (let column = 0; column < (mask[row]?.length ?? 0); column += 1) {
      if (mask[row]?.[column] === "#") {
        drawRect(imageData, { height: 1, width: 1, x: x + column, y: y + row }, [0, 0, 0])
      }
    }
  }
}

function drawBorderedRect(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect, fill: Rgb) {
  drawBorderOnlyRect(imageData, rect, fill)
  drawRect(
    imageData,
    {
      height: 34,
      width: 58,
      x: rect.x + 42,
      y: rect.y + 36,
    },
    [198, 203, 204],
  )
  drawRect(
    imageData,
    {
      height: 22,
      width: 34,
      x: rect.x + 48,
      y: rect.y + rect.height - 48,
    },
    [20, 20, 20],
  )
}

function drawBorderOnlyRect(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect, fill: Rgb) {
  drawRect(imageData, rect, [0, 0, 0])
  drawRect(
    imageData,
    {
      height: rect.height - 4,
      width: rect.width - 4,
      x: rect.x + 2,
      y: rect.y + 2,
    },
    fill,
  )
}

function drawRect(imageData: ReturnType<typeof createSyntheticPage>, rect: Rect, rgb: Rgb) {
  for (let y = Math.max(0, rect.y); y < Math.min(imageData.height, rect.y + rect.height); y += 1) {
    for (let x = Math.max(0, rect.x); x < Math.min(imageData.width, rect.x + rect.width); x += 1) {
      const index = ((y * imageData.width) + x) * 4
      imageData.data[index] = rgb[0]
      imageData.data[index + 1] = rgb[1]
      imageData.data[index + 2] = rgb[2]
      imageData.data[index + 3] = 255
    }
  }
}

type SyntheticImageData = ReturnType<typeof createSyntheticPage>

function createInventoryMatchRow(
  rowId: string,
  {
    colorId,
    colorName,
    partNumber,
    quantity = 1,
    region,
  }: {
    colorId: string
    colorName: string
    partNumber: string
    quantity?: number
    region: Rect
  },
) {
  return {
    cataloguePartNumber: partNumber,
    colorId,
    colorName,
    partNumber,
    partThumbnailRegion: {
      ...region,
      unit: "ocr_pixel" as const,
    },
    quantity,
    rowId,
    sourceImage: {
      height: 700,
      unit: "ocr_pixel" as const,
      width: 1_000,
    },
    sourcePage: 2,
  }
}

function installMockCanvasApi() {
  const imageDataByCanvas = new WeakMap<HTMLCanvasElement, SyntheticImageData>()
  const imageDataByDataUrl = new Map<string, SyntheticImageData>()
  let dataUrlIndex = 0
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return createMockCanvasContext(this, imageDataByCanvas, getCanvasImageData)
  })
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const imageData = cloneSyntheticImageData(getCanvasImageData(this))
    const transparentPixelCount = countTransparentPixels(imageData)
    const dataUrl = `data:image/png;base64,w${this.width}h${this.height}t${transparentPixelCount}i${dataUrlIndex}`
    dataUrlIndex += 1
    imageDataByDataUrl.set(dataUrl, imageData)

    return dataUrl
  })

  function getCanvasImageData(canvas: HTMLCanvasElement) {
    let imageData = imageDataByCanvas.get(canvas)
    if (!imageData || imageData.width !== canvas.width || imageData.height !== canvas.height) {
      imageData = createSyntheticPage(canvas.width, canvas.height)
      imageDataByCanvas.set(canvas, imageData)
    }

    return imageData
  }

  return {
    restore() {
      getContext.mockRestore()
      toDataURL.mockRestore()
    },
    getImageDataForDataUrl(dataUrl: string) {
      return imageDataByDataUrl.get(dataUrl) ?? null
    },
    setCanvasImageData(canvas: HTMLCanvasElement, imageData: SyntheticImageData) {
      imageDataByCanvas.set(canvas, imageData)
    },
  }
}

function createMockCanvasContext(
  canvas: HTMLCanvasElement,
  imageDataByCanvas: WeakMap<HTMLCanvasElement, SyntheticImageData>,
  getCanvasImageData: (canvas: HTMLCanvasElement) => SyntheticImageData,
) {
  return {
    canvas,
    drawImage(sourceCanvas: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
      imageDataByCanvas.set(canvas, cropSyntheticImageData(getCanvasImageData(sourceCanvas), {
        height,
        width,
        x,
        y,
      }))
    },
    fillRect(x: number, y: number, width: number, height: number) {
      drawRect(getCanvasImageData(canvas), {
        height: Math.round(height),
        width: Math.round(width),
        x: Math.round(x),
        y: Math.round(y),
      }, [255, 255, 255])
    },
    createImageData(width: number, height: number) {
      return {
        data: new Uint8ClampedArray(width * height * 4),
        height,
        width,
      }
    },
    getImageData(x: number, y: number, width: number, height: number) {
      return cropSyntheticImageData(getCanvasImageData(canvas), {
        height,
        width,
        x,
        y,
      }) as unknown as ImageData
    },
    putImageData(imageData: SyntheticImageData, x: number, y: number) {
      const target = getCanvasImageData(canvas)
      for (let sourceY = 0; sourceY < imageData.height; sourceY += 1) {
        for (let sourceX = 0; sourceX < imageData.width; sourceX += 1) {
          const targetX = Math.round(x) + sourceX
          const targetY = Math.round(y) + sourceY
          if (targetX < 0 || targetY < 0 || targetX >= target.width || targetY >= target.height) {
            continue
          }

          const sourceIndex = ((sourceY * imageData.width) + sourceX) * 4
          const targetIndex = ((targetY * target.width) + targetX) * 4
          target.data[targetIndex] = imageData.data[sourceIndex] ?? 0
          target.data[targetIndex + 1] = imageData.data[sourceIndex + 1] ?? 0
          target.data[targetIndex + 2] = imageData.data[sourceIndex + 2] ?? 0
          target.data[targetIndex + 3] = imageData.data[sourceIndex + 3] ?? 0
        }
      }
    },
  } as unknown as CanvasRenderingContext2D
}

function cloneSyntheticImageData(imageData: SyntheticImageData): SyntheticImageData {
  return {
    data: new Uint8ClampedArray(imageData.data),
    height: imageData.height,
    width: imageData.width,
  }
}

function countTransparentPixels(imageData: SyntheticImageData) {
  let count = 0
  for (let index = 3; index < imageData.data.length; index += 4) {
    if ((imageData.data[index] ?? 255) < 32) {
      count += 1
    }
  }

  return count
}

function countPixelsMatching(imageData: SyntheticImageData, rgb: Rgb) {
  let count = 0
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (
      imageData.data[index] === rgb[0] &&
      imageData.data[index + 1] === rgb[1] &&
      imageData.data[index + 2] === rgb[2] &&
      (imageData.data[index + 3] ?? 0) >= 32
    ) {
      count += 1
    }
  }

  return count
}

function cropSyntheticImageData(imageData: SyntheticImageData, rect: Rect): SyntheticImageData {
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.round(rect.x) + x
      const sourceY = Math.round(rect.y) + y
      const targetIndex = ((y * width) + x) * 4
      if (sourceX < 0 || sourceY < 0 || sourceX >= imageData.width || sourceY >= imageData.height) {
        data[targetIndex] = 255
        data[targetIndex + 1] = 255
        data[targetIndex + 2] = 255
        data[targetIndex + 3] = 255
        continue
      }

      const sourceIndex = ((sourceY * imageData.width) + sourceX) * 4
      data[targetIndex] = imageData.data[sourceIndex] ?? 255
      data[targetIndex + 1] = imageData.data[sourceIndex + 1] ?? 255
      data[targetIndex + 2] = imageData.data[sourceIndex + 2] ?? 255
      data[targetIndex + 3] = imageData.data[sourceIndex + 3] ?? 255
    }
  }

  return { data, height, width }
}
