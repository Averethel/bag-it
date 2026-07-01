import { describe, expect, it } from "vitest"

import type { Region } from "../contracts"
import type { ScoredComponent } from "../part-component-scoring"
import { selectRelatedComponents } from "../part-related-components"

describe("selectRelatedComponents", () => {
  it("keeps a close same-row continuation as related component evidence", () => {
    const primary = createComponent({ height: 10, width: 20, x: 10, y: 12 })
    const continuation = createComponent({ height: 9, width: 8, x: 34, y: 13 }, 5)
    const selected = selectRelatedComponents(
      [primary, continuation],
      primary,
      { height: 8, width: 12, x: 14, y: 30 },
      [{ height: 8, width: 12, x: 14, y: 30 }],
    )

    expect(selected).toEqual([primary, continuation])
  })

  it("keeps a close vertical stack as related component evidence", () => {
    const primary = createComponent({ height: 12, width: 20, x: 20, y: 28 })
    const stacked = createComponent({ height: 12, width: 20, x: 20, y: 10 }, 5)
    const selected = selectRelatedComponents(
      [primary, stacked],
      primary,
      { height: 10, width: 14, x: 23, y: 56 },
      [{ height: 10, width: 14, x: 23, y: 56 }],
    )

    expect(selected).toEqual([primary, stacked])
  })

  it("rejects components without contact or connector evidence", () => {
    const primary = createComponent({ height: 10, width: 20, x: 10, y: 12 })
    const detached = createComponent({ height: 9, width: 8, x: 60, y: 13 }, 5)
    const selected = selectRelatedComponents(
      [primary, detached],
      primary,
      { height: 8, width: 12, x: 14, y: 30 },
      [{ height: 8, width: 12, x: 14, y: 30 }],
    )

    expect(selected).toEqual([primary])
  })
})

function createComponent(region: Region, score = 0): ScoredComponent {
  return {
    component: {
      area: region.width * region.height,
      pixels: [],
      region,
    },
    score,
  }
}
