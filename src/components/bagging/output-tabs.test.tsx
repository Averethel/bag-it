import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderWithProvider } from "@/test/render"
import { OutputTabs } from "./output-tabs"

describe("OutputTabs", () => {
  it("renders page-supplied content for each tab", async () => {
    const { user } = renderWithProvider(
      <OutputTabs
        parts={<p>Part rows supplied by page</p>}
        bags={<p>Bag rows supplied by page</p>}
      />,
    )

    expect(screen.getByRole("tab", { name: "Part list" })).toBeVisible()
    expect(screen.getByRole("tab", { name: "Bags" })).toBeVisible()
    expect(screen.queryByRole("tab", { name: "Steps" })).not.toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Debug" })).not.toBeInTheDocument()
    expect(screen.getByText("Part rows supplied by page")).toBeVisible()

    await user.click(screen.getByRole("tab", { name: "Bags" }))

    expect(screen.getByText("Bag rows supplied by page")).toBeVisible()
  })

  it("renders debug content when supplied", async () => {
    const { user } = renderWithProvider(
      <OutputTabs
        parts={<p>Part rows supplied by page</p>}
        bags={<p>Bag rows supplied by page</p>}
        debug={<p>Debug rows supplied by page</p>}
      />,
    )

    expect(screen.getByRole("tab", { name: "Debug" })).toBeVisible()

    await user.click(screen.getByRole("tab", { name: "Debug" }))

    expect(screen.getByText("Debug rows supplied by page")).toBeVisible()
  })
})
