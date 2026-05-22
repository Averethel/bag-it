import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderWithProvider } from "@/test/render"
import { ProcessingStatusCard } from "./processing-status-card"

describe("ProcessingStatusCard", () => {
  it("renders per-stage progress without a header badge or phase line", () => {
    renderWithProvider(
      <ProcessingStatusCard
        steps={[
          { label: "Finding inventory pages", progress: 100, state: "complete" },
          { label: "Analysis per page", progress: 60, state: "active" },
          { label: "Preparing bags", progress: 0, state: "pending" },
        ]}
      />,
    )

    expect(screen.getByText("Processing status")).toBeVisible()
    expect(screen.queryByText("Bag prep processing complete")).not.toBeInTheDocument()
    expect(screen.queryByText("Ready")).not.toBeInTheDocument()
    expect(screen.getByText("Finding inventory pages")).toBeVisible()
    expect(screen.queryByText("Gathering inventory")).not.toBeInTheDocument()
    expect(screen.getByText("Analysis per page")).toBeVisible()
    expect(screen.queryByText("Mapping the build flow")).not.toBeInTheDocument()
    expect(screen.getByText("Preparing bags")).toBeVisible()
    expect(screen.queryByText("Preparing bag groups")).not.toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Finding inventory pages progress" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    )
    expect(screen.getByRole("progressbar", { name: "Analysis per page progress" })).toHaveAttribute(
      "aria-valuenow",
      "60",
    )
    expect(screen.getByRole("progressbar", { name: "Preparing bags progress" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    )
  })
})
