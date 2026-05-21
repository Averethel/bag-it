import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderWithProvider } from "@/test/render"
import { createTestPdf } from "@/test/pdf"

const processingMock = vi.hoisted(() => ({
  runPrivatePdfProcessingJob: vi.fn(),
  stalePurgedPublished: false,
}))

vi.mock("@/features/bagging/pdf-intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/bagging/pdf-intake")>()

  return {
    ...actual,
    runPrivatePdfProcessingJob: processingMock.runPrivatePdfProcessingJob,
  }
})

import { BaggingPage } from "./bagging-page"

function renderPage() {
  window.history.replaceState(null, "", "/")

  const { user } = renderWithProvider(<BaggingPage />)

  return { user }
}

async function uploadManual(user: ReturnType<typeof userEvent.setup>, fileName: string) {
  await user.upload(
    screen.getByLabelText("Upload PDF manual"),
    new File([createTestPdf(1)], fileName, { type: "application/pdf" }),
  )
}

describe("BaggingPage job cancellation", () => {
  beforeEach(() => {
    processingMock.runPrivatePdfProcessingJob.mockReset()
    processingMock.stalePurgedPublished = false
  })

  it("ignores stale terminal updates after a newer manual is queued", async () => {
    processingMock.runPrivatePdfProcessingJob.mockImplementation(async (_file, options) => {
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "first-job",
        metadata: null,
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 20,
        sourceBytesPurged: false,
        startedAt: Date.now(),
        state: "validating" as const,
        updatedAt: Date.now(),
      }

      options.onUpdate?.(snapshot)

      return new Promise((resolve) => {
        options.signal?.addEventListener(
          "abort",
          () => {
            processingMock.stalePurgedPublished = true
            const purgedSnapshot = {
              ...snapshot,
              errorMessage: "Processing was cancelled.",
              progress: 0,
              sourceBytesPurged: true,
              state: "purged" as const,
            }
            options.onUpdate?.(purgedSnapshot)
            resolve(purgedSnapshot)
          },
          { once: true },
        )
      })
    })

    const { user } = renderPage()

    await uploadManual(user, "first.pdf")
    await user.click(screen.getByRole("button", { name: "Bag it!" }))
    expect(await screen.findByText("Validating PDF")).toBeVisible()

    await uploadManual(user, "second.pdf")
    await waitFor(() => expect(processingMock.stalePurgedPublished).toBe(true))

    expect(screen.getByText("second.pdf")).toBeVisible()
    expect(screen.getByText("Queued")).toBeVisible()
    expect(screen.queryByText("Cleared")).not.toBeInTheDocument()
  })

  it("lets the user cancel a running analysis", async () => {
    processingMock.runPrivatePdfProcessingJob.mockImplementation(async (_file, options) => {
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "running-job",
        metadata: null,
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 20,
        sourceBytesPurged: false,
        startedAt: Date.now(),
        state: "validating" as const,
        updatedAt: Date.now(),
      }

      options.onUpdate?.(snapshot)

      return new Promise((resolve) => {
        options.signal?.addEventListener(
          "abort",
          () => {
            resolve({
              ...snapshot,
              errorMessage: "Processing was cancelled.",
              progress: 0,
              sourceBytesPurged: true,
              state: "purged" as const,
            })
          },
          { once: true },
        )
      })
    })

    const { user } = renderPage()

    await uploadManual(user, "slow.pdf")
    await user.click(screen.getByRole("button", { name: "Bag it!" }))
    expect(await screen.findByText("Validating PDF")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Remove uploaded manual" }))

    expect(screen.getByText("Upload PDF manual")).toBeVisible()
    expect(screen.getByRole("button", { name: "Bag it!" })).toBeDisabled()
  })

  it("ignores stale updates after the user removes a running manual", async () => {
    processingMock.runPrivatePdfProcessingJob.mockImplementation(async (_file, options) => {
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "running-job",
        metadata: null,
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 20,
        sourceBytesPurged: false,
        startedAt: Date.now(),
        state: "validating" as const,
        updatedAt: Date.now(),
      }

      options.onUpdate?.(snapshot)

      return new Promise((resolve) => {
        options.signal?.addEventListener(
          "abort",
          () => {
            processingMock.stalePurgedPublished = true
            const staleSnapshot = {
              ...snapshot,
              metadata: {
                fileName: "slow.pdf",
                fingerprint: "stale",
                pageCount: 3,
                readMode: "browser" as const,
                sizeBytes: 1234,
              },
              pageRenderProgress: 100,
              pageRenders: [
                {
                  dataUrl: "data:image/png;base64,stale",
                  height: 426,
                  pageNumber: 1,
                  renderKind: "canvas" as const,
                  width: 320,
                },
              ],
              progress: 100,
              sourceBytesPurged: true,
              state: "complete" as const,
            }
            options.onUpdate?.(staleSnapshot)
            resolve(staleSnapshot)
          },
          { once: true },
        )
      })
    })

    const { user } = renderPage()

    await uploadManual(user, "slow.pdf")
    await user.click(screen.getByRole("button", { name: "Bag it!" }))
    expect(await screen.findByText("Validating PDF")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Remove uploaded manual" }))
    await waitFor(() => expect(processingMock.stalePurgedPublished).toBe(true))

    expect(screen.getByText("Upload PDF manual")).toBeVisible()
    expect(screen.getByRole("button", { name: "Bag it!" })).toBeDisabled()
    expect(screen.queryByText("Analysis complete")).not.toBeInTheDocument()
    expect(screen.queryByText("3 pages read from a 1.2 kB PDF.")).not.toBeInTheDocument()
  })
})
