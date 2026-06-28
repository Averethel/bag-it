import { describe, expect, it } from "vitest"
import { comparePartMaskContent } from "./saved-session-mask-content.mjs"

describe("saved-session mask content comparison", () => {
  it("fails when same alpha bounds lose interior mask content", () => {
    const expected = createPartItem([
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
      "1111111111111111",
    ])
    const actual = createPartItem([
      "1000000000000001",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "1000000000000001",
    ])

    const score = comparePartMaskContent(expected, actual)

    expect(score.passed).toBe(false)
    expect(score.failures).toContain("opaque-ratio")
    expect(score.failures).toContain("cell-coverage")
  })

  it("passes small mask drift above the opaque threshold", () => {
    const expected = createPartItem([
      "11111111",
      "11111111",
      "11111111",
      "11111111",
      "11111111",
      "11111111",
      "11111111",
      "11111111",
    ])
    const actual = createPartItem([
      "11111111",
      "11111111",
      "11111111",
      "11111110",
      "11111111",
      "11111111",
      "11111111",
      "11111111",
    ])

    expect(comparePartMaskContent(expected, actual).passed).toBe(true)
  })
})

function createPartItem(rows) {
  return {
    partImage: {
      alphaMask: {
        data: new Uint8ClampedArray(rows.flatMap((row) =>
          [...row].map((cell) => cell === "1" ? 255 : 0),
        )),
        height: rows.length,
        width: rows[0].length,
      },
      region: {
        height: rows.length,
        width: rows[0].length,
        x: 10,
        y: 20,
      },
    },
  }
}
