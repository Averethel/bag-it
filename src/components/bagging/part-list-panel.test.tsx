import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { mockParts } from "@/features/bagging/mock-data"
import { renderWithProvider } from "@/test/render"
import { PartListPanel } from "./part-list-panel"

describe("PartListPanel", () => {
  it("renders the part list columns and supplied part rows", () => {
    renderWithProvider(
      <PartListPanel
        checkedItemIds={new Set(["inventory-3023"])}
        onCheckedItemChange={vi.fn()}
        parts={mockParts}
      />,
    )

    expect(screen.getByText("Qty")).toBeInTheDocument()
    expect(screen.getByText("Image")).toBeInTheDocument()
    expect(screen.getByText("Color")).toBeInTheDocument()
    expect(screen.getByText("Part name")).toBeInTheDocument()
    expect(screen.getByText("4 parts")).toBeVisible()
    expect(screen.getByRole("checkbox", { name: "Track 42 Light bluish gray Plate 1 x 2" })).toBeChecked()
  })

  it("delegates row checkbox changes", async () => {
    const onCheckedItemChange = vi.fn()
    const { user } = renderWithProvider(
      <PartListPanel
        checkedItemIds={new Set()}
        onCheckedItemChange={onCheckedItemChange}
        parts={mockParts}
      />,
    )

    await user.click(screen.getByRole("checkbox", { name: "Track 28 Tan Brick 1 x 1" }))

    expect(onCheckedItemChange).toHaveBeenCalledWith("inventory-3005", true)
  })
})
