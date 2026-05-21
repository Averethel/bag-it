import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderWithProvider } from "@/test/render"
import { ManualFlowCard } from "./manual-flow-card"

describe("ManualFlowCard", () => {
  it("delegates file selection and leaves start disabled when the page disallows it", async () => {
    const onManualSelected = vi.fn()
    const onStart = vi.fn()
    const { user } = renderWithProvider(
      <ManualFlowCard
        canStart={false}
        isRunning={false}
        manualName={null}
        onManualSelected={onManualSelected}
        onStart={onStart}
      />,
    )

    expect(screen.getByText("Upload PDF manual")).toBeVisible()
    expect(screen.getByRole("button", { name: "Bag it!" })).toBeDisabled()
    expect(screen.queryByTestId("manual-status-badge")).not.toBeInTheDocument()

    const file = new File(["%PDF-1.7"], "selected-manual.pdf", { type: "application/pdf" })
    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      file,
    )

    expect(onManualSelected).toHaveBeenCalledWith(file)
    expect(onStart).not.toHaveBeenCalled()
  })

  it("accepts dropped PDF files through the intake area", () => {
    const onManualSelected = vi.fn()
    const file = new File(["%PDF-1.7"], "dropped-manual.pdf", { type: "application/pdf" })

    renderWithProvider(
      <ManualFlowCard
        canStart={false}
        isRunning={false}
        manualName={null}
        onManualSelected={onManualSelected}
        onStart={vi.fn()}
      />,
    )

    fireEvent.drop(screen.getByTestId("manual-drop-zone"), {
      dataTransfer: {
        files: [file],
      },
    })

    expect(onManualSelected).toHaveBeenCalledWith(file)
  })

  it("renders selected manual and running CTA state from props", () => {
    renderWithProvider(
      <ManualFlowCard
        canStart
        isRunning
        manualName="castle.pdf"
        onManualSelected={vi.fn()}
        onPurge={vi.fn()}
        onStart={vi.fn()}
        recoveryText="Click this area or drop a replacement PDF to try again."
        statusText="Preparing pages"
      />,
    )

    expect(screen.getByText("castle.pdf")).toBeVisible()
    expect(screen.getByText("Preparing pages")).toBeVisible()
    expect(screen.getByTestId("manual-status-badge")).toHaveTextContent("Preparing pages")
    expect(screen.getByText("Click this area or drop a replacement PDF to try again.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Bagging..." })).toBeDisabled()
  })

  it("renders a compact clear control only when an uploaded manual can be removed", async () => {
    const onPurge = vi.fn()
    const { user } = renderWithProvider(
      <ManualFlowCard
        canPurge
        canStart={false}
        isRunning={false}
        manualName="castle.pdf"
        onManualSelected={vi.fn()}
        onPurge={onPurge}
        onStart={vi.fn()}
      />,
    )

    expect(screen.queryByText("Purge artifacts")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Remove uploaded manual" }))

    expect(onPurge).toHaveBeenCalledTimes(1)
  })

  it("delegates start clicks when enabled", async () => {
    const onStart = vi.fn()
    const { user } = renderWithProvider(
      <ManualFlowCard
        canStart
        isRunning={false}
        manualName="castle.pdf"
        onManualSelected={vi.fn()}
        onStart={onStart}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
