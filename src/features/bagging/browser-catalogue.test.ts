import { afterEach, describe, expect, it, vi } from "vitest"
import {
  fallbackPartsListColors,
  fetchPartsListCatalogueColors,
  fetchPartsListColors,
  fetchPartsListNormalization,
  fetchPartsListPartPreviews,
  getPartsListPartPreviewKey,
} from "./browser-catalogue"

describe("fetchPartsListColors", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("returns fallback colors when the catalogue request times out", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal

      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Request aborted.", "AbortError")),
          { once: true },
        )
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const colorsPromise = fetchPartsListColors({ timeoutMs: 25 })
    await vi.advanceTimersByTimeAsync(25)

    await expect(colorsPromise).resolves.toBe(fallbackPartsListColors)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalogue/colors",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("does not wait indefinitely for a pending page-load color preload", async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.stubGlobal("window", {})
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    )
    const catalogueModule = await import("./browser-catalogue")

    void catalogueModule.preloadPartsListCatalogue({ timeoutMs: 10_000 })

    const colorsPromise = catalogueModule.fetchPartsListColors()
    await vi.advanceTimersByTimeAsync(3_000)

    await expect(colorsPromise).resolves.toBe(catalogueModule.fallbackPartsListColors)
  })

  it("can bypass a completed page-load color preload for a fresh analysis", async () => {
    vi.resetModules()
    vi.stubGlobal("window", {})
    const colorResponses = [
      [{ id: "old", name: "Old Snapshot" }],
      [{ id: "new", name: "New Snapshot" }],
    ]
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ colors: colorResponses.shift() ?? [] }),
      ok: true,
    }))
    vi.stubGlobal("fetch", fetchMock)
    const catalogueModule = await import("./browser-catalogue")

    await catalogueModule.preloadPartsListCatalogue()

    await expect(catalogueModule.fetchPartsListColors({ forceRefresh: true })).resolves.toEqual([
      { id: "new", name: "New Snapshot" },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalogue/colors",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("requests colors from a pinned catalogue snapshot", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ colors: [{ id: "0", name: "Black" }] }),
      ok: true,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await fetchPartsListColors({ snapshotId: "snapshot-1" })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalogue/colors?snapshotId=snapshot-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("returns the server catalogue snapshot with fetched colors", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        colors: [{ id: "0", name: "Black" }],
        snapshot: { id: "snapshot-1" },
      }),
      ok: true,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchPartsListCatalogueColors()).resolves.toEqual({
      colors: [{ id: "0", name: "Black" }],
      snapshot: { id: "snapshot-1" },
    })
  })
})

describe("fetchPartsListNormalization", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("posts compact rows to the server-side normalization endpoint", async () => {
    const normalization = {
      ambiguousQuantity: 0,
      attentionRows: [],
      catalogueSnapshotId: "snapshot-1",
      coverageThreshold: 0.9,
      resolvedQuantity: 14,
      rows: [],
      status: "ready",
      totalQuantity: 14,
      unresolvedQuantity: 0,
    }
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ normalization }),
      ok: true,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchPartsListNormalization([
      {
        color: { id: "0", matchedText: "Black", name: "Black" },
        confidence: 1,
        part: null,
        partNumber: "3005",
        partNumberKind: "numeric",
        quantity: 14,
        rawText: "14 x 3005 Black",
        sourcePage: 2,
        sourceTextRange: { end: 16, start: 0 },
      },
    ], { snapshotId: "snapshot-1" })).resolves.toBe(normalization)

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalogue/parts",
      expect.objectContaining({
        body: JSON.stringify({
          rows: [
            {
              color: { id: "0", matchedText: "Black", name: "Black" },
              part: null,
              partNumber: "3005",
              quantity: 14,
              sourcePage: 2,
              sourceTextRange: { end: 16, start: 0 },
            },
          ],
          snapshotId: "snapshot-1",
        }),
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it("returns null when the normalization request times out", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal

      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Request aborted.", "AbortError")),
          { once: true },
        )
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const normalizationPromise = fetchPartsListNormalization([
      {
        color: null,
        confidence: 1,
        part: null,
        partNumber: "3005",
        partNumberKind: "numeric",
        quantity: 1,
        rawText: "1 x 3005",
        sourcePage: 1,
        sourceTextRange: { end: 8, start: 0 },
      },
    ], { timeoutMs: 25 })
    await vi.advanceTimersByTimeAsync(25)

    await expect(normalizationPromise).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalogue/parts",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    )
  })
})

describe("fetchPartsListPartPreviews", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("returns requested local part previews without duplicate requests", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        previews: [
          {
            colorId: "0",
            imageUrl: "https://cdn.rebrickable.com/media/parts/elements/3005.jpg",
            key: "3005:0",
            name: "Brick 1 x 1",
            partNumber: "3005",
          },
        ],
      }),
      ok: true,
    }))
    vi.stubGlobal("fetch", fetchMock)

    const previews = await fetchPartsListPartPreviews([
      { colorId: "0", partNumber: "3005" },
      { colorId: "0", partNumber: "3005" },
      { colorId: "71", partNumber: " 3068B " },
    ], { snapshotId: "snapshot-1" })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalogue/part-previews",
      expect.objectContaining({
        body: JSON.stringify({
          parts: [
            { partNumber: "3005", colorId: "0" },
            { partNumber: "3068b", colorId: "71" },
          ],
          snapshotId: "snapshot-1",
        }),
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    )
    expect(previews.get(getPartsListPartPreviewKey("3005", "0"))).toEqual({
      colorId: "0",
      imageUrl: "https://cdn.rebrickable.com/media/parts/elements/3005.jpg",
      key: "3005:0",
      name: "Brick 1 x 1",
      partNumber: "3005",
    })
  })
})
