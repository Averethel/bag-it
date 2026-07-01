import { describe, expect, it } from "vitest"
import {
  REBRICKABLE_COLOR_CATALOG_SOURCE_URL,
  REBRICKABLE_LEGO_COLOR_CATALOG,
  REBRICKABLE_LEGO_COLOR_NAMES,
} from "../rebrickable-colors"

describe("Rebrickable color catalog", () => {
  it("contains real catalog color names for workbench labeling", () => {
    expect(REBRICKABLE_COLOR_CATALOG_SOURCE_URL).toBe("https://cdn.rebrickable.com/media/downloads/colors.csv.gz")
    expect(REBRICKABLE_LEGO_COLOR_CATALOG.length).toBeGreaterThan(200)
    expect(REBRICKABLE_LEGO_COLOR_NAMES).toContain("Trans-Clear")
    expect(REBRICKABLE_LEGO_COLOR_NAMES).toContain("Dark Turquoise")
    expect(REBRICKABLE_LEGO_COLOR_NAMES).toContain("Warm Pink")
    expect(REBRICKABLE_LEGO_COLOR_NAMES).not.toContain("[Unknown]")
    expect(REBRICKABLE_LEGO_COLOR_NAMES).not.toContain("[No Color/Any Color]")
  })

  it("keeps Rebrickable ids and RGB data with each color", () => {
    expect(REBRICKABLE_LEGO_COLOR_CATALOG.find((color) => color.name === "Trans-Clear")).toEqual(
      expect.objectContaining({
        hex: "#FCFCFC",
        id: 47,
        isTransparent: true,
        rgb: { r: 252, g: 252, b: 252 },
      }),
    )
  })
})
