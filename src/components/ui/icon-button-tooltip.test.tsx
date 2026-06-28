import { IconButton } from "@chakra-ui/react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { IconButtonTooltip } from "./icon-button-tooltip"
import { Provider } from "./provider"

describe("IconButtonTooltip", () => {
  it("renders tooltip content through a portal and preserves the button label", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Provider>
        <div data-testid="local-root">
          <IconButtonTooltip label="Add bag row">
            <IconButton aria-label="Add bag row" size="xs" variant="ghost">
              <span aria-hidden="true">+</span>
            </IconButton>
          </IconButtonTooltip>
        </div>
      </Provider>,
    )

    await user.hover(screen.getByRole("button", { name: "Add bag row" }))

    const tooltip = await screen.findByText("Add bag row")
    expect(document.body.contains(tooltip)).toBe(true)
    expect(container.contains(tooltip)).toBe(false)
  })
})
