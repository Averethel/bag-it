import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
})

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
})

if (!window.PointerEvent) {
  Object.defineProperty(window, "PointerEvent", {
    writable: true,
    value: MouseEvent,
  })
}

HTMLElement.prototype.scrollIntoView = vi.fn()
HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,test")

afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
  vi.useRealTimers()
})
