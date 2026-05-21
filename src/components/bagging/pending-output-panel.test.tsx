import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderWithProvider } from "@/test/render"
import { PendingOutputPanel } from "./pending-output-panel"

describe("PendingOutputPanel", () => {
  it("renders the pending title and supplied message", () => {
    renderWithProvider(
      <PendingOutputPanel
        icon={<span data-testid="pending-icon" />}
        message="Part rows will appear here after the analysis completes."
      />,
    )

    expect(screen.getByText("Waiting for analysis")).toBeVisible()
    expect(screen.getByText("Part rows will appear here after the analysis completes.")).toBeVisible()
    expect(screen.getByTestId("pending-icon")).toBeInTheDocument()
  })
})
