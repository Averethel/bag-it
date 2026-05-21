import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { mockBags, mockParts } from "@/features/bagging/mock-data"
import { renderWithProvider } from "@/test/render"
import { BagsPanel } from "./bags-panel"

describe("BagsPanel", () => {
  it("renders bag accordions and the open bag checklist", () => {
    const partById = new Map(mockParts.map((part) => [part.id, part]))

    renderWithProvider(
      <BagsPanel
        bags={mockBags}
        checkedItemIds={new Set(["bag-1-3023"])}
        onCheckedItemChange={vi.fn()}
        partById={partById}
      />,
    )

    expect(screen.getByRole("button", { name: /Bag 1/ })).toBeVisible()
    expect(screen.getByRole("button", { name: /Bag 2/ })).toBeVisible()
    expect(screen.getByText(/Steps 1-12.*48 parts/)).toBeVisible()
    expect(
      screen.getByRole("checkbox", {
        name: "Track 18 Light bluish gray Plate 1 x 2 for bag-1-3023",
      }),
    ).toBeChecked()
  })

  it("delegates bag checklist checkbox changes", async () => {
    const onCheckedItemChange = vi.fn()
    const partById = new Map(mockParts.map((part) => [part.id, part]))
    const { user } = renderWithProvider(
      <BagsPanel
        bags={mockBags}
        checkedItemIds={new Set()}
        onCheckedItemChange={onCheckedItemChange}
        partById={partById}
      />,
    )

    await user.click(screen.getByRole("checkbox", { name: "Track 14 Tan Brick 1 x 1 for bag-1-3005" }))

    expect(onCheckedItemChange).toHaveBeenCalledWith("bag-1-3005", true)
  })
})
