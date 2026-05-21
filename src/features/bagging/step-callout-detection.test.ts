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
    expect(items.map((item) => item.itemRegion.x)).toEqual([34, 168, 334, 48])
    expect(items.map((item) => item.quantityRegion.y)).toEqual([128, 130, 130, 230])
  })

  it("does not cut the part crop at an unparseable dark detail near the bottom", () => {
    const imageData = createSyntheticPage(300, 240, [216, 239, 250])
    drawRect(imageData, { x: 64, y: 42, width: 112, height: 128 }, [35, 120, 35])
    drawRect(imageData, { x: 88, y: 138, width: 48, height: 12 }, [0, 0, 0])

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(1)
    expect(items[0].partRegion.y).toBe(42)
    expect(items[0].partRegion.height).toBeGreaterThanOrEqual(126)
    expect(items[0].quantityRegion.y).toBeGreaterThanOrEqual(138)
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

      expect(result.callouts[0].partItems).toHaveLength(1)
      expect(result.callouts[0].partItems[0].quantity.value).toBeNull()
      expect(result.callouts[0].partItems[0].quantity.text).toBeNull()
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
      y: 148,
    })

    const items = detectStepCalloutPartItemRegionsFromImageData(imageData)

    expect(items).toHaveLength(1)
    expect(items[0].partRegion.y).toBe(42)
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

  it("renders callout item previews with background removed while keeping quantity text", async () => {
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
      expect(countPixelsMatching(partCropImageData!, [0, 0, 0])).toBeGreaterThan(0)
      expect(countPixelsMatching(partCropImageData!, [216, 239, 250])).toBe(0)
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
        width: 22,
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
  drawSyntheticQuantityText(imageData, {
    scale: Math.max(2, Math.round(rect.height * 0.035)),
    text: "1x",
    x: rect.x + Math.round(rect.width * 0.18),
    y: rect.y + rect.height + 14,
  })
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

  drawSyntheticQuantityText(imageData, {
    scale: 2,
    text: "1x",
    x: rect.x + Math.round(rect.width * 0.18),
    y: rect.y + rect.height + 14,
  })
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
