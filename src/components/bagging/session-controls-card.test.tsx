import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderWithProvider } from "@/test/render"
import { SessionControlsCard } from "./session-controls-card"

describe("SessionControlsCard", () => {
  it("stacks session download and upload controls", async () => {
    const onDownloadSession = vi.fn()
    const onSessionSelected = vi.fn()
    const { user } = renderWithProvider(
      <SessionControlsCard
        canDownloadSession
        isRunning={false}
        onDownloadSession={onDownloadSession}
        onSessionSelected={onSessionSelected}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Download session" }))
    expect(onDownloadSession).toHaveBeenCalledTimes(1)

    const sessionFile = new File(["{}"], "castle.bagit.json", { type: "application/json" })
    await user.upload(screen.getByLabelText("Upload Bag It session"), sessionFile)
    expect(onSessionSelected).toHaveBeenCalledWith(sessionFile)
  })

  it("disables both controls while analysis is running", () => {
    renderWithProvider(
      <SessionControlsCard
        canDownloadSession
        isRunning
        onDownloadSession={vi.fn()}
        onSessionSelected={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Download session" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Continue session" })).toBeDisabled()
  })
})
