import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderWithProvider } from "@/test/render"
import { createTestPdf } from "@/test/pdf"
import { sourceByteRetentionMs } from "@/features/bagging/pdf-intake"
import { BaggingPage } from "./bagging-page"

function renderPage(userOptions?: Parameters<typeof userEvent.setup>[0]) {
  window.history.replaceState(null, "", "/")

  const { user } = renderWithProvider(<BaggingPage />, userOptions)

  return { user }
}

async function uploadManual(
  user: ReturnType<typeof userEvent.setup>,
  {
    content = createTestPdf(2),
    fileName = "castle.pdf",
  }: {
    content?: string
    fileName?: string
  } = {},
) {
  const manual = new File([content], fileName, { type: "application/pdf" })

  await user.upload(screen.getByLabelText("Upload PDF manual"), manual)
}

describe("BaggingPage", () => {
  it("renders the intake shell without a bundled demo-manual shortcut", () => {
    renderPage()

    expect(screen.getByRole("heading", { name: "Turn a MOC manual into builder-ready bags" })).toBeVisible()
    expect(screen.getByText("Use the original manual")).toBeVisible()
    expect(screen.getByText("Shape the parts and steps")).toBeVisible()
    expect(screen.getByText("Pack build-ready bags")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Use demo manual" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bag it!" })).toBeDisabled()
    expect(screen.getByRole("tab", { name: "Part list" })).toBeVisible()
    expect(screen.getByRole("tab", { name: "Bags" })).toBeVisible()
    expect(screen.queryByRole("tab", { name: "Steps" })).not.toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Debug" })).not.toBeInTheDocument()
    expect(screen.getByText("Finding inventory pages")).toBeVisible()
    expect(screen.getByText("Analysis per page")).toBeVisible()
    expect(screen.getByText("Step callouts")).toBeVisible()
    expect(screen.queryByText("Gathering inventory")).not.toBeInTheDocument()
    expect(screen.queryByText("Debug previews")).not.toBeInTheDocument()
    expect(screen.queryByText("Mapping the build flow")).not.toBeInTheDocument()
    expect(screen.queryByText("Preparing bags")).not.toBeInTheDocument()
    expect(screen.queryByText("Preparing bag groups")).not.toBeInTheDocument()
  })

  it("stages an uploaded manual without starting processing or leaking it into the URL", async () => {
    const { user } = renderPage()

    await uploadManual(user, { fileName: "Castle Ramp Instructions.pdf" })

    expect(screen.getByText("Castle Ramp Instructions.pdf")).toBeVisible()
    expect(screen.getByText("Queued")).toBeVisible()
    expect(screen.getByRole("button", { name: "Bag it!" })).toBeEnabled()
    expect(screen.getAllByText("Waiting for analysis")[0]).toBeVisible()
    expect(screen.queryByText("Plate 1 x 2")).not.toBeInTheDocument()
    expect(window.location.search).toBe("")
  })

  it("expires a staged upload that is not started within the retention window", async () => {
    vi.useFakeTimers()

    try {
      renderPage({ advanceTimers: vi.advanceTimersByTime })

      fireEvent.change(screen.getByLabelText("Upload PDF manual"), {
        target: {
          files: [new File([createTestPdf(2)], "Castle Ramp Instructions.pdf", { type: "application/pdf" })],
        },
      })
      expect(screen.getByRole("button", { name: "Bag it!" })).toBeEnabled()

      await act(async () => {
        vi.advanceTimersByTime(sourceByteRetentionMs)
      })

      expect(screen.getByText("Processing expired")).toBeVisible()
      expect(screen.getByText("Click this area or drop the PDF again to restart processing.")).toBeVisible()
      expect(screen.getByRole("button", { name: "Bag it!" })).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("clears stale manual query parameters from the old demo flow", async () => {
    window.history.replaceState(null, "", "/?manual=Castle%20Ramp%20Instructions.pdf&phase=3")

    renderWithProvider(<BaggingPage />)

    expect(await screen.findByText("Finding inventory pages")).toBeVisible()
    expect(window.location.search).toBe("")
    expect(screen.queryByText("Castle Ramp Instructions.pdf")).not.toBeInTheDocument()
  })

  it("validates a PDF and exposes metadata without fake bag output", async () => {
    const { user } = renderPage()

    await uploadManual(user)
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(screen.getAllByText("Completed")).toHaveLength(1), { timeout: 3000 })
    expect(screen.queryByRole("heading", { name: "Turn a MOC manual into builder-ready bags" })).not.toBeInTheDocument()
    expect(screen.getByText("2 pages read from a 1 KB PDF.")).toBeVisible()
    expect(screen.getByText("Analysis complete")).toBeVisible()
    expect(screen.getByRole("button", { name: "Remove uploaded manual" })).toBeVisible()
    expect(screen.queryByText("Purge artifacts")).not.toBeInTheDocument()
    expect(screen.queryByText("Bag prep processing complete")).not.toBeInTheDocument()
    expect(screen.queryByText("Plate 1 x 2")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Bag 1/ })).not.toBeInTheDocument()
  })

  it("reruns analysis for the same uploaded source", async () => {
    const { user } = renderPage()

    await uploadManual(user)
    await user.click(screen.getByRole("button", { name: "Bag it!" }))
    await waitFor(() => expect(screen.getByText("Analysis complete")).toBeVisible(), { timeout: 3000 })

    await uploadManual(user)
    await user.click(screen.getByRole("button", { name: "Bag it!" }))
    await waitFor(() => expect(screen.getByText("Analysis complete")).toBeVisible(), { timeout: 3000 })
  })

  it("removes the uploaded manual and current analysis on request", async () => {
    const { user } = renderPage()

    await uploadManual(user)
    await user.click(screen.getByRole("button", { name: "Bag it!" }))
    await waitFor(() => expect(screen.getByText("Analysis complete")).toBeVisible(), { timeout: 3000 })
    await user.click(screen.getByRole("button", { name: "Remove uploaded manual" }))

    expect(screen.getByText("Upload PDF manual")).toBeVisible()
    expect(screen.queryByText("castle.pdf")).not.toBeInTheDocument()
    expect(screen.queryByText(/pages read from/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bag it!" })).toBeDisabled()
  })

  it("removes a staged manual before processing starts", async () => {
    const { user } = renderPage()

    await uploadManual(user, { fileName: "Castle Ramp Instructions.pdf" })
    await user.click(screen.getByRole("button", { name: "Remove uploaded manual" }))

    expect(screen.getByText("Upload PDF manual")).toBeVisible()
    expect(screen.queryByText("Castle Ramp Instructions.pdf")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bag it!" })).toBeDisabled()
  })

  it("shows a safe validation failure for non-PDF input", async () => {
    const { user } = renderPage()

    await uploadManual(user, { content: "not a pdf", fileName: "bad-notes.pdf" })
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    expect(await screen.findByText("Choose a valid PDF file.")).toBeVisible()
    expect(screen.getAllByText("Failed")[0]).toBeVisible()
    expect(screen.getByText(/Click this area or drop a replacement PDF to try again/)).toBeVisible()
    expect(screen.queryByText("Bag prep processing complete")).not.toBeInTheDocument()
  })
})
