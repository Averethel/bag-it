import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PartMatchRowInput } from "@bag-it/part-matching"

describe("createCnnPartPairScoreFeatures", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock("onnxruntime-web/wasm")
    vi.unstubAllGlobals()
  })

  it("fails eligible buckets when the CNN scorer cannot load", async () => {
    vi.doMock("onnxruntime-web/wasm", () => ({
      env: { wasm: { numThreads: 0, proxy: true } },
      InferenceSession: { create: vi.fn() },
      Tensor: class TestTensor {},
    }))
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })))

    const { createCnnPartPairScoreFeatures } = await import("./cnn-part-pair-scorer")

    await expect(
      createCnnPartPairScoreFeatures([createPartMatchRow(1), createPartMatchRow(2)], vi.fn()),
    ).rejects.toThrow("Part grouping scorer failed to load.")
  })

  it("skips CNN loading for buckets above the runtime cap", async () => {
    const fetchModel = vi.fn()
    vi.stubGlobal("fetch", fetchModel)

    const { createCnnPartPairScoreFeatures } = await import("./cnn-part-pair-scorer")

    await expect(
      createCnnPartPairScoreFeatures(
        Array.from({ length: 97 }, (_value, index) => createPartMatchRow(index)),
        vi.fn(),
      ),
    ).resolves.toEqual(new Map())
    expect(fetchModel).not.toHaveBeenCalled()
  })
})

function createPartMatchRow(index: number): PartMatchRowInput {
  return {
    bagId: "bag-1",
    calloutId: `callout-${index}`,
    itemId: `item-${index}`,
    partRegion: {
      height: 1,
      width: 1,
      x: index,
      y: index,
    },
    renderedPixels: {
      data: new Uint8ClampedArray([180, 190, 195, 255]),
      height: 1,
      width: 1,
    },
    rowId: `row-${index}`,
  }
}
