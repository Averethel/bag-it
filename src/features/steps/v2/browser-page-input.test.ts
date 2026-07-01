import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const pdfJsMockState = vi.hoisted(() => ({
  renderDevicePixelRatios: [] as Array<number | undefined>,
}))

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  Util: {
    transform: vi.fn(),
  },
  getDocument: vi.fn(() => ({
    destroy: vi.fn(),
    promise: Promise.resolve({
      destroy: vi.fn(),
      getPage: vi.fn(async () => ({
        cleanup: vi.fn(),
        getViewport: vi.fn(({ scale }: { scale: number }) => ({
          height: 50 * scale,
          transform: [scale, 0, 0, scale, 0, 0],
          width: 100 * scale,
        })),
        render: vi.fn(() => {
          pdfJsMockState.renderDevicePixelRatios.push(globalThis.devicePixelRatio)

          return {
            cancel: vi.fn(),
            promise: Promise.resolve(),
          }
        }),
      })),
      numPages: 1,
    }),
  })),
}))

import { readStepDetectorV2PageInputsFromFile } from "./browser-page-input"

describe("browser page input", () => {
  beforeEach(() => {
    pdfJsMockState.renderDevicePixelRatios = []
    const createElement = document.createElement.bind(document)

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return createCanvasStub()
      }

      return createElement(tagName)
    })
    Object.defineProperty(globalThis, "devicePixelRatio", {
      configurable: true,
      value: 2,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as { devicePixelRatio?: number }).devicePixelRatio
  })

  it("renders PDF pages with deterministic analysis pixel ratio", async () => {
    await readStepDetectorV2PageInputsFromFile(createPdfFile(), {
      renderMaxWidth: 100,
    })

    expect(pdfJsMockState.renderDevicePixelRatios).toEqual([1])
    expect(globalThis.devicePixelRatio).toBe(2)
  })
})

function createPdfFile(): File {
  const file = new File(["%PDF-1.7"], "manual.pdf", { type: "application/pdf" })

  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("%PDF-1.7").buffer,
    })
  }

  return file
}

function createCanvasStub(): HTMLCanvasElement {
  const context = {
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    })),
  }

  return {
    getContext: vi.fn(() => context),
    height: 0,
    width: 0,
  } as unknown as HTMLCanvasElement
}
