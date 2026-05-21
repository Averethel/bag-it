import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { mockParts } from "@/features/bagging/mock-data"
import { renderWithProvider } from "@/test/render"
import { InventoryRow, partToInventoryItem } from "./inventory-row"

describe("InventoryRow", () => {
  it("renders quantity, image, color, and part details", () => {
    renderWithProvider(
      <InventoryRow
        checked={false}
        checkboxLabel="Track 42 Light bluish gray Plate 1 x 2"
        item={partToInventoryItem(mockParts[0])}
        trackingId="inventory-3023"
        onCheckedChange={vi.fn()}
      />,
    )

    expect(screen.getByText("42")).toBeVisible()
    expect(screen.getByTestId("inventory-row")).toHaveAttribute("data-selected", "false")
    expect(screen.getByText("Light bluish gray")).toBeVisible()
    expect(screen.getByText("Plate 1 x 2")).toBeVisible()
    expect(screen.getByText("3023")).toBeVisible()
    expect(screen.getByRole("img", { name: "Light bluish gray Plate 1 x 2" })).toHaveAttribute(
      "src",
      "https://cdn.rebrickable.com/media/parts/elements/4211398.jpg",
    )
  })

  it("washes out checked row content while keeping the checkbox selected", () => {
    renderWithProvider(
      <InventoryRow
        checked={true}
        checkboxLabel="Track 42 Light bluish gray Plate 1 x 2"
        item={partToInventoryItem(mockParts[0])}
        trackingId="inventory-3023"
        onCheckedChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("checkbox", { name: "Track 42 Light bluish gray Plate 1 x 2" })).toBeChecked()
    expect(screen.getByTestId("inventory-row")).toHaveAttribute("data-selected", "true")
    expect(screen.getByTestId("inventory-row-details")).toHaveStyle({ opacity: "0.58" })
  })

  it("delegates checkbox changes with its tracking id", async () => {
    const onCheckedChange = vi.fn()
    const { user } = renderWithProvider(
      <InventoryRow
        checked={false}
        checkboxLabel="Track 42 Light bluish gray Plate 1 x 2"
        item={partToInventoryItem(mockParts[0])}
        trackingId="inventory-3023"
        onCheckedChange={onCheckedChange}
      />,
    )

    await user.click(screen.getByRole("checkbox", { name: "Track 42 Light bluish gray Plate 1 x 2" }))

    expect(onCheckedChange).toHaveBeenCalledWith("inventory-3023", true)
  })
})
