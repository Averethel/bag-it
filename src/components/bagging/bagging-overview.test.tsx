import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { mockOverviewContent } from "@/features/bagging/mock-data"
import { renderWithProvider } from "@/test/render"
import { BaggingOverview } from "./bagging-overview"

describe("BaggingOverview", () => {
  it("renders the bagging overview from supplied items", () => {
    renderWithProvider(
      <BaggingOverview
        badge={mockOverviewContent.badge}
        description={mockOverviewContent.description}
        items={mockOverviewContent.items}
        title={mockOverviewContent.title}
      />,
    )

    expect(screen.getByRole("heading", { name: "Turn a MOC manual into builder-ready bags" })).toBeVisible()
    expect(screen.getByText("Use the original manual")).toBeVisible()
    expect(screen.getByText("Shape the parts and steps")).toBeVisible()
    expect(screen.getByText("Pack build-ready bags")).toBeVisible()
  })
})
