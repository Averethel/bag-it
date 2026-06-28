import "@testing-library/jest-dom/vitest"
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
;(window as Window & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

const originalConsoleError = console.error
const originalConsoleWarn = console.warn
let consoleIssues: string[] = []

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (String(args[0]).includes("Could not parse CSS stylesheet")) {
      return
    }

    originalConsoleError(...args)
    consoleIssues.push(`console.error: ${args.map(String).join(" ")}`)
  })

  vi.spyOn(console, "warn").mockImplementation((...args) => {
    originalConsoleWarn(...args)
    consoleIssues.push(`console.warn: ${args.map(String).join(" ")}`)
  })
})

beforeEach(() => {
  consoleIssues = []
})

afterEach(() => {
  if (consoleIssues.length > 0) {
    throw new Error(`Unexpected console output:\n${consoleIssues.join("\n")}`)
  }
})

afterAll(() => {
  vi.restoreAllMocks()
})
