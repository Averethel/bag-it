import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderWithProvider } from "@/test/render"
import { BaggingPageFrame } from "./bagging-page-frame"

describe("BaggingPageFrame", () => {
  it("renders page content inside the shell frame", () => {
    renderWithProvider(
      <BaggingPageFrame>
        <p>Framed bagging content</p>
      </BaggingPageFrame>,
    )

    expect(screen.getByText("Framed bagging content")).toBeVisible()
  })
})
