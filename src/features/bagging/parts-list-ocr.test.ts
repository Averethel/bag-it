import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildPartsListTextFromAlignedOcrText,
  buildPartsListTextFromOcrBlocks,
  createOcrPageText,
  disposePreloadedPartsListOcrWorker,
  extractPdfPageTextsWithOcr,
  normalizeOcrPageText,
  PartsListOcrCancelledError,
  preloadPartsListOcrWorker,
} from "./parts-list-ocr"

afterEach(async () => {
  await disposePreloadedPartsListOcrWorker()
})

describe("buildPartsListTextFromOcrBlocks", () => {
  it("reconstructs visual BOM label stacks from positioned OCR lines", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 63, 111, 88, 129),
      block("3024", 63, 135, 115, 153),
      block("Black", 64, 159, 126, 177),
      block("1x", 1110, 326, 1136, 344),
      block("10509c01pb02", 1110, 350, 1248, 368),
      block("Reddish Brown", 1110, 374, 1264, 392),
      block("2x", 1410, 679, 1435, 697),
      block("4162", 1410, 703, 1462, 721),
      block("Blue", 1411, 727, 1458, 745),
    ])

    expect(text).toBe(
      [
        "2 x 3024 Black",
        "1 x 10509c01pb02 Reddish Brown",
        "2 x 4162 Blue",
      ].join("\n"),
    )
  })

  it("ignores quantity-like lines that do not have a plausible part number below", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 10, 10, 30, 28),
      block("Black", 10, 34, 60, 52),
    ])

    expect(text).toBe("")
  })

  it("does not steal a trailing Studio-grid quantity from the next label", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("4x", 10, 10, 36, 28),
      block("3024, 11 5x", 10, 34, 140, 52),
      block("3005, 11", 150, 34, 250, 52),
    ])

    expect(text).toBe("4 x 3024 studio-11")
  })

  it("reconstructs Studio-grid cells when OCR reads quantities below part labels", () => {
    const text = buildPartsListTextFromOcrBlocks(
      [
        block("487290, 11", 80, 170, 185, 190),
        block("25893, 11", 320, 170, 420, 190),
        block("1x", 95, 205, 125, 223),
        block("5x", 338, 205, 368, 223),
      ],
      [
        { region: { x0: 80, y0: 70, x1: 185, y1: 155 } },
        { region: { x0: 320, y0: 70, x1: 420, y1: 155 } },
        { region: { x0: 560, y0: 70, x1: 660, y1: 155 } },
        { region: { x0: 800, y0: 70, x1: 900, y1: 155 } },
      ],
    )

    expect(text).toContain("1 x 487290 studio-11")
    expect(text).toContain("5 x 25893 studio-11")
  })

  it("keeps Studio-grid quantity assignment inside the visual cell", () => {
    const text = buildPartsListTextFromOcrBlocks(
      [
        block("487290, 11", 80, 170, 185, 190),
        block("25893, 11", 320, 170, 420, 190),
        block("5x", 338, 205, 368, 223),
      ],
      [
        { region: { x0: 80, y0: 70, x1: 185, y1: 155 } },
        { region: { x0: 320, y0: 70, x1: 420, y1: 155 } },
        { region: { x0: 560, y0: 70, x1: 660, y1: 155 } },
        { region: { x0: 800, y0: 70, x1: 900, y1: 155 } },
      ],
    )

    expect(text).not.toContain("5 x 487290 studio-11")
    expect(text).toContain("5 x 25893 studio-11")
  })

  it("assigns Studio labels to the nearest thumbnail-owned cell", () => {
    const text = buildPartsListTextFromOcrBlocks(
      [
        block("487290, 11", 80, 170, 185, 190),
        block("25893, 11", 320, 170, 420, 190),
        block("5x", 338, 205, 368, 223),
      ],
      [],
      [
        { region: { x0: 80, y0: 70, x1: 185, y1: 155 } },
        { region: { x0: 320, y0: 70, x1: 420, y1: 155 } },
      ],
    )

    expect(text).not.toContain("5 x 487290 studio-11")
    expect(text).toContain("5 x 25893 studio-11")
  })

  it("ignores Studio-grid labels that likely swallowed the color digit", () => {
    const text = buildPartsListTextFromOcrBlocks(
      [
        block("873046, 6", 80, 170, 185, 190),
        block("2x", 95, 205, 125, 223),
      ],
      [
        { region: { x0: 80, y0: 70, x1: 185, y1: 155 } },
        { region: { x0: 320, y0: 70, x1: 420, y1: 155 } },
        { region: { x0: 560, y0: 70, x1: 660, y1: 155 } },
        { region: { x0: 800, y0: 70, x1: 900, y1: 155 } },
      ],
    )

    expect(text).toBe("")
  })

  it("prefers explicit Studio-grid quantity tokens over nearby bare-number noise", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("3x", 10, 10, 36, 28),
      block("1", 88, 14, 100, 28),
      block("3069b, 11", 88, 34, 190, 52),
    ])

    expect(text).toBe("3 x 3069b studio-11")
  })

  it("repairs truncated Studio color codes when the page has a strong dominant color code", () => {
    const dominantRows = Array.from({ length: 12 }, (_, index) => {
      const y = index * 30

      return [
        block("1x", 10, y, 36, y + 18),
        block(`${3000 + index}, 11`, 10, y + 20, 92, y + 38),
      ]
    }).flat()
    const text = normalizeOcrPageText({
      blocks: [
        ...dominantRows,
        block("4x", 10, 380, 36, 398),
        block("20482, 1", 10, 400, 98, 418),
        block("2x", 10, 430, 36, 448),
        block("2419, 1", 10, 450, 88, 468),
      ],
    })

    expect(text).toContain("4 x 20482 studio-11")
    expect(text).toContain("2 x 2419 studio-11")
    expect(text).not.toMatch(/\bstudio-1$/m)
  })

  it("ignores high bare-number Studio-grid quantity guesses", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("31", 10, 10, 34, 28),
      block("3176", 10, 34, 72, 52),
      block("Reddish Brown", 10, 58, 150, 76),
    ])

    expect(text).toBe("")
  })

  it("keeps specific catalogue color phrases before generic color words", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("1x", 10, 10, 30, 28),
      block("3062b", 10, 34, 72, 52),
      block("Trans-Yellow", 10, 58, 130, 76),
      block("1x", 160, 10, 180, 28),
      block("10169", 160, 34, 222, 52),
      block("Medium Nougat", 160, 58, 300, 76),
      block("17x", 310, 10, 346, 28),
      block("27261", 310, 34, 372, 52),
      block("Nougat", 310, 58, 390, 76),
      block("2x", 340, 10, 360, 28),
      block("3849", 340, 34, 392, 52),
      block("Flat Silver", 340, 58, 450, 76),
      block("1x", 480, 10, 500, 28),
      block("3070b", 480, 34, 542, 52),
      block("Trans-Light Blue", 480, 58, 650, 76),
      block("1x", 680, 10, 700, 28),
      block("30374", 680, 34, 742, 52),
      block("Trans-Medium Blue", 680, 58, 870, 76),
      block("14x", 890, 10, 926, 28),
      block("3024", 890, 34, 942, 52),
      block("Trans-Dark Blue Pearl Dark Gray", 890, 58, 1180, 76),
      block("8x", 1210, 10, 1230, 28),
      block("3024", 1210, 34, 1262, 52),
      block("Trans-Brown", 1210, 58, 1340, 76),
      block("2x", 1370, 10, 1390, 28),
      block("95228", 1370, 34, 1432, 52),
      block("Trans-Green", 1370, 58, 1500, 76),
      block("2x", 1530, 10, 1550, 28),
      block("33125", 1530, 34, 1592, 52),
      block("Dark Orange", 1530, 58, 1660, 76),
      block("3x", 1690, 10, 1710, 28),
      block("3710", 1690, 34, 1742, 52),
      block("Dark Blue", 1690, 58, 1790, 76),
      block("1x", 1820, 10, 1840, 28),
      block("63864", 1820, 34, 1882, 52),
      block("Dark Red", 1820, 58, 1910, 76),
      block("1x", 1950, 10, 1970, 28),
      block("35470", 1950, 34, 2012, 52),
      block("Bright Light Yellow", 1950, 58, 2150, 76),
      block("1x", 2180, 10, 2200, 28),
      block("24866", 2180, 34, 2242, 52),
      block("Magenta", 2180, 58, 2260, 76),
      block("5x", 2290, 10, 2310, 28),
      block("37775", 2290, 34, 2352, 52),
      block("Trans-Orange", 2290, 58, 2425, 76),
      block("4x", 2460, 10, 2480, 28),
      block("15208", 2460, 34, 2522, 52),
      block("Bright Light Orange", 2460, 58, 2660, 76),
      block("6x", 2690, 10, 2710, 28),
      block("24866", 2690, 34, 2752, 52),
      block("Bright Light Blue", 2690, 58, 2870, 76),
      block("1x", 2900, 10, 2920, 28),
      block("3068b", 2900, 34, 2962, 52),
      block("Dark Turquoise", 2900, 58, 3040, 76),
    ])

    expect(text).toBe(
      [
        "1 x 3062b Trans-Yellow",
        "1 x 10169 Medium Nougat",
        "17 x 27261 Medium Nougat",
        "2 x 3849 Flat Silver",
        "1 x 3070b Trans-Light Blue",
        "1 x 30374 Trans-Medium Blue",
        "14 x 3024 Trans-Dark Blue",
        "8 x 3024 Trans-Brown",
        "2 x 95228 Trans-Green",
        "2 x 33125 Dark Orange",
        "3 x 3710 Dark Blue",
        "1 x 63864 Dark Red",
        "1 x 35470 Bright Light Yellow",
        "1 x 24866 Magenta",
        "5 x 37775 Trans-Orange",
        "4 x 15208 Bright Light Orange",
        "6 x 24866 Bright Light Blue",
        "1 x 3068b Dark Turquoise",
      ].join("\n"),
    )
  })

  it("keeps dark bluish gray when dense OCR fuses a preceding color fragment", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("3x", 10, 10, 30, 28),
      block("3959", 10, 34, 62, 52),
      block("sh GrayDark Bluish Gray", 10, 58, 240, 76),
      block("2x", 280, 10, 300, 28),
      block("99207", 280, 34, 342, 52),
      block("sh Graypark Bluish Gray", 280, 58, 520, 76),
    ])

    expect(text).toBe(["3 x 3959 Dark Bluish Gray", "2 x 99207 Dark Bluish Gray"].join("\n"))
  })

  it("normalizes catalogue color phrases with attached OCR suffix noise", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("5x", 10, 10, 30, 28),
      block("3069b", 10, 34, 72, 52),
      block("Reddish Browngy", 10, 58, 190, 76),
      block("20x", 220, 10, 256, 28),
      block("3040", 220, 34, 272, 52),
      block("Reddish BrownReddish", 220, 58, 440, 76),
    ])

    expect(text).toBe(["5 x 3069b Reddish Brown", "20 x 3040 Reddish Brown"].join("\n"))
  })

  it("keeps dark purple as a specific catalogue color", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 10, 10, 36, 28),
      block("49307", 10, 34, 82, 52),
      block("Dark Purple", 10, 58, 148, 76),
    ])

    expect(text).toBe("2 x 49307 Dark Purple")
  })

  it("splits fused adjacent color labels by part label position", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("1x", 10, 10, 36, 28),
      block("3068", 10, 34, 70, 52),
      block("1x", 180, 10, 206, 28),
      block("64647", 180, 34, 250, 52),
      block("Dark TurquoiseTrans-Orange", 10, 58, 310, 76),
    ])

    expect(text).toBe(["1 x 3068 Dark Turquoise", "1 x 64647 Trans-Orange"].join("\n"))
  })

  it("preserves BrickLink-style printed part suffixes from OCR", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("1x", 10, 10, 30, 28),
      block("2335p44", 10, 34, 90, 52),
      block("Red", 10, 58, 50, 76),
    ])

    expect(text).toBe("1 x 2335p44 Red")
  })

  it("normalizes split BrickLink assembly print identifiers", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("1x", 10, 10, 30, 28),
      block("1050901 pb02", 10, 34, 130, 52),
      block("Reddish Brown", 10, 58, 150, 76),
    ])

    expect(text).toBe("1 x 10509c01pb02 Reddish Brown")
  })

  it("uses structured OCR quantity glyph slips only as visual row anchors", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("ZF", 210, 10, 238, 28),
      block("92593", 210, 34, 274, 52),
      block("Light Bluish Gray", 210, 58, 376, 76),
    ])

    expect(text).toBe("4 x 92593 Light Bluish Gray")
  })

  it("normalizes Paddle OCR slips in color text and printed part labels", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 10, 10, 36, 28),
      block("86996", 10, 34, 82, 52),
      block("Light BIuish Gray", 10, 58, 190, 76),
      block("1x", 240, 10, 266, 28),
      block("973ρ48, 6", 240, 34, 350, 52),
    ])

    expect(text).toBe(["2 x 86996 Light Bluish Gray", "1 x 973p48 studio-6"].join("\n"))
  })

  it("does not jump over a nearer quantity into a fused color and part label", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("4x", 10, 10, 36, 28),
      block("1x", 10, 34, 36, 52),
      block("Light Bluish Gray3131", 10, 58, 250, 76),
    ])

    expect(text).toBe("1 x 3131 Light Bluish Gray")
  })

  it("treats OCR we as 5x for named-color visual rows", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("we", 210, 10, 238, 28),
      block("11211", 210, 34, 274, 52),
      block("Light Bluish Gray", 210, 58, 376, 76),
    ])

    expect(text).toBe("5 x 11211 Light Bluish Gray")
  })

  it("recovers sparse Studio-grid rows from OCR quantity glyph slips", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("SF", 10, 10, 36, 28),
      block("3030, 86", 10, 34, 110, 52),
      block("Eo", 160, 10, 186, 28),
      block("41539, 86", 160, 34, 280, 52),
    ])

    expect(text).toBe(["1 x 3030 studio-86", "2 x 41539 studio-86"].join("\n"))
  })

  it("does not reconstruct quantities or letter-prefixed fragments as part numbers", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("1x", 10, 10, 30, 28),
      block("1x", 10, 34, 36, 52),
      block("Black", 10, 58, 60, 76),
      block("4x", 100, 10, 126, 28),
      block("ray18", 100, 34, 156, 52),
      block("Black", 100, 58, 160, 76),
      block("2x", 200, 10, 226, 28),
      block("3024", 200, 34, 252, 52),
      block("0", 200, 58, 212, 76),
    ])

    expect(text).toBe("2 x 3024 0")
  })

  it("does not treat bare crop digits as Studio color codes without page evidence", () => {
    const text = normalizeOcrPageText({
      blocks: [
        block("2x", 10, 10, 36, 28, 2),
        block("3622", 10, 34, 72, 52, 2),
        block("3", 10, 58, 24, 76, 2),
      ],
      text: "",
    })

    expect(text).toBe("")
  })

  it("rejects repeated-digit OCR artifacts as standalone part labels", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("12x", 10, 10, 48, 28),
      block("1888888", 10, 34, 98, 52),
      block("Red", 10, 58, 50, 76),
      block("12x", 140, 10, 178, 28),
      block("85984", 140, 34, 208, 52),
      block("Red", 140, 58, 180, 76),
    ])

    expect(text).toBe("12 x 85984 Red")
  })

  it("reconstructs visual BOM rows when OCR combines part and color id labels", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("ax", 10, 10, 30, 28),
      block("15068, 2", 10, 34, 72, 52),
      block("1x", 100, 10, 126, 28),
      block("3003, 6", 100, 34, 160, 52),
      block("3070, 88 11x", 200, 34, 290, 52),
      block("5", 400, 10, 414, 28),
      block("62462, 88", 400, 34, 470, 52),
      block("ray18, 6", 300, 34, 360, 52),
    ])

    expect(text).toBe(
      [
        "4 x 15068 studio-2",
        "1 x 3003 studio-6",
        "5 x 62462 studio-88",
        "11 x 3070 studio-88",
      ].join("\n"),
    )
  })

  it("does not expand repeated valid Studio color codes to a dominant longer code", () => {
    const dominantRows = Array.from({ length: 12 }, (_, index) => [
      block("1x", 10 + index * 20, 10, 36 + index * 20, 28),
      block(`${3000 + index}, 88`, 10 + index * 20, 34, 90 + index * 20, 52),
    ]).flat()
    const text = buildPartsListTextFromOcrBlocks([
      ...dominantRows,
      block("1x", 10, 100, 36, 118),
      block("4505,8", 10, 124, 72, 142),
      block("4x", 120, 100, 146, 118),
      block("3846p48,8", 120, 124, 210, 142),
    ])

    expect(text).toContain("1 x 4505 studio-8")
    expect(text).toContain("4 x 3846p48 studio-8")
  })

  it("reconstructs repeated part and color labels from one OCR line", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("26x 4274, 86 107x 54200, 86", 10, 10, 210, 28),
      block("39x", 300, 10, 336, 28),
      block("3665, 86 3040, 86", 300, 34, 450, 52),
    ])

    expect(text).toBe(["26 x 4274 studio-86", "107 x 54200 studio-86", "39 x 3665 studio-86"].join("\n"))
  })

  it("reconstructs rows when OCR fuses a trailing part number into the color line", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 1258, 616, 1294, 641),
      block("Light Bluish Gray99207", 972, 650, 1350, 683),
      block("3x", 1258, 912, 1294, 938),
      block("Light Bluish Gray3660", 1260, 971, 1585, 1013),
    ])

    expect(text).toBe(["2 x 99207 Light Bluish Gray", "3 x 3660 Light Bluish Gray"].join("\n"))
  })

  it("does not treat a repeated fused color phrase as a trailing part line", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("13x", 10, 10, 48, 28),
      block("Light Bluish Graylight Bluish Gray3622", 10, 34, 360, 52),
    ])

    expect(text).toBe("")
  })

  it("normalizes leading OCR glyph slips in part numbers fused into color lines", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("4x", 10, 10, 36, 28),
      block("Light Bluish Graygp475p", 10, 34, 220, 52),
    ])

    expect(text).toBe("4 x 60475b Light Bluish Gray")
  })

  it("reconstructs rows when OCR fuses a trailing quantity into the previous color line", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("Light Bluish Gray2x", 1548, 416, 1870, 449),
      block("18653", 1836, 456, 1924, 482),
      block("Light Bluish Gray", 1836, 490, 2121, 523),
    ])

    expect(text).toBe("2 x 18653 Light Bluish Gray")
  })

  it("deduplicates overlapping rows produced by dense-page OCR retries", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 10, 10, 36, 28),
      block("3024", 10, 34, 62, 52),
      block("Black", 10, 58, 66, 76),
      block("2x", 12, 11, 38, 29),
      block("3024", 12, 35, 64, 53),
      block("Black", 12, 59, 68, 77),
    ])

    expect(text).toBe("2 x 3024 Black")
  })

  it("deduplicates same-region OCR part variants from dense retries", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("1x", 10, 10, 36, 28),
      block("54384", 10, 34, 84, 52),
      block("Dark Bluish Gray", 10, 58, 176, 76),
      block("1x", 12, 10, 38, 28, 1),
      block("5431", 12, 34, 70, 52, 1),
      block("Dark Bluish Gray", 12, 58, 178, 76, 1),
      block("1x", 220, 10, 246, 28),
      block("6636", 220, 34, 282, 52),
      block("Light Bluish Gray", 220, 58, 390, 76),
      block("1x", 222, 10, 248, 28, 1),
      block("6631", 222, 34, 284, 52, 1),
      block("Light Bluish Gray", 222, 58, 392, 76, 1),
    ])

    expect(text).toBe(["1 x 54384 Dark Bluish Gray", "1 x 6636 Light Bluish Gray"].join("\n"))
  })

  it("deduplicates cropped part-number prefix rows against a full overlapping read", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 10, 10, 36, 28),
      block("85984", 10, 34, 78, 52),
      block("Red", 10, 58, 50, 76),
      block("2x", 10, 10, 36, 28),
      block("859t", 10, 34, 58, 52),
      block("Red", 10, 58, 50, 76),
      block("1x", 120, 10, 146, 28),
      block("14719", 120, 34, 188, 52),
      block("Red", 120, 58, 160, 76),
      block("1x", 120, 10, 146, 28),
      block("147", 120, 34, 158, 52),
      block("Red", 120, 58, 160, 76),
    ])

    expect(text).toBe(["2 x 85984 Red", "1 x 14719 Red"].join("\n"))
  })

  it("does not deduplicate cropped prefixes across different Studio color ids", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("1x", 10, 10, 36, 28),
      block("64647, 7", 10, 34, 110, 52),
      block("1x", 10, 10, 36, 28),
      block("646, 98", 10, 34, 88, 52),
    ])

    expect(text).toBe(["1 x 64647 studio-7", "1 x 646 studio-98"].join("\n"))
  })

  it("keeps the full cropped-prefix read when the shorter overlap has incompatible color noise", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("12x", 100, 10, 136, 28),
      block("7975", 100, 34, 150, 52),
      block("Blue", 100, 58, 145, 76),
      block("12x", 102, 12, 138, 30),
      block("79756", 102, 36, 167, 54),
      block("Light Bluish Gray", 102, 60, 262, 78),
    ])

    expect(text).toBe("12 x 79756 Light Bluish Gray")
  })

  it("uses a prior quantity when dense text places a color fragment before a fused part label", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "3x",
        "5x",
        "Light Bluish Gray",
        "Light Bluish Gray3245b",
        "3002",
        "6x",
        "Light Bluish GrayLight Bluish Gray3710",
      ].join("\n"),
    )

    expect(text).toBe(
      ["3 x 3245b Light Bluish Gray", "5 x 3002 Light Bluish Gray", "6 x 3710 Light Bluish Gray"].join("\n"),
    )
  })

  it("uses the earlier quantity when a neighboring part line intervenes before a fused label", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "3x",
        "3666",
        "2x",
        "Light Bluish GrayLight Bluish Gray3001",
        "Light Bluish Gray",
        "3460",
        "Light Bluish Gray",
      ].join("\n"),
    )

    expect(text).toContain("3 x 3001 Light Bluish Gray")
  })

  it("keeps the stronger overlapping read for the same OCR row anchor", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 10, 10, 36, 28),
      block("3024", 10, 34, 62, 52),
      block("re Bluish Graverarss", 10, 58, 210, 76),
      block("2x", 12, 11, 38, 29),
      block("3024", 12, 35, 64, 53),
      block("Light Bluish Gray", 12, 59, 176, 77),
    ])

    expect(text).toBe("2 x 3024 Light Bluish Gray")
  })

  it("uses compact overlapping rows to reject color noise from OCR variants", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("3x", 10, 10, 36, 28),
      block("14417", 10, 34, 72, 52),
      block("Light Bluish Gray", 10, 58, 500, 76),
      block("3x", 12, 11, 38, 29),
      block("14417", 12, 35, 74, 53),
      block("Dark Bluish Gray", 12, 59, 176, 77),
    ])

    expect(text).toBe("3 x 14417 Dark Bluish Gray")
  })

  it("prefers more specific gray color phrases for overlapping same-part rows", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 10, 10, 36, 28),
      block("54200", 10, 34, 72, 52),
      block("Light Gray", 10, 58, 112, 76),
      block("2x", 92, 12, 118, 30),
      block("54200", 92, 36, 154, 54),
      block("Light Bluish Gray", 92, 60, 258, 78),
    ])

    expect(text).toBe("2 x 54200 Light Bluish Gray")
  })

  it("rejects wide cross-column OCR rows that overlap a compact same-part read", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 300, 10, 326, 28),
      block("47458", 300, 34, 365, 52),
      block("Red", 300, 58, 340, 76),
      block("1x", 20, 62, 46, 80),
      block("47458", 310, 63, 375, 81),
      block("Black", 500, 64, 560, 82),
    ])

    expect(text).toBe("2 x 47458 Red")
  })

  it("rejects broad overlapping rows that reuse a compact row quantity", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("74x", 1800, 10, 1846, 28),
      block("2587", 1800, 34, 1858, 52),
      block("Flat Silver", 1800, 58, 2625, 76),
      block("74x", 2550, 12, 2596, 30),
      block("4073", 2550, 36, 2608, 54),
      block("Pearl Gold", 2550, 60, 2660, 78),
    ])

    expect(text).toBe("74 x 4073 Pearl Gold")
  })

  it("keeps adjacent same-quantity rows when a broad row does not swallow the compact row", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("74x", 1800, 10, 1846, 28),
      block("2587", 1800, 34, 1858, 52),
      block("Flat Silver", 1800, 58, 2590, 76),
      block("74x", 2550, 12, 2596, 30),
      block("4073", 2550, 36, 2608, 54),
      block("Pearl Gold", 2550, 60, 2660, 78),
    ])

    expect(text).toBe(["74 x 2587 Flat Silver", "74 x 4073 Pearl Gold"].join("\n"))
  })

  it("deduplicates overlapping same-part rows when OCR invents a second quantity", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("4x", 10, 10, 36, 28),
      block("4488", 10, 34, 62, 52),
      block("Black", 10, 58, 66, 76),
      block("3x", 10, 40, 36, 58),
      block("4488", 10, 64, 62, 82),
      block("Black", 10, 88, 66, 106),
    ])

    expect(text).toBe("4 x 4488 Black")
  })

  it("reconstructs dense inline quantity, part, and color labels from one OCR line", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block(
        "2x 14418 Light Bluish Gray2x 3622 Light Bluish Gray 1x 30413 Light Bluish Gray",
        10,
        10,
        610,
        28,
      ),
    ])

    expect(text).toBe(
      [
        "2 x 14418 Light Bluish Gray",
        "2 x 3622 Light Bluish Gray",
        "1 x 30413 Light Bluish Gray",
      ].join("\n"),
    )
  })

  it("preserves transparent color phrases in dense inline OCR rows", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      "14x 8x 3024 Trans-Dark Blue 3024 Trans-Brown",
    )

    expect(text).toBe(["14 x 3024 Trans-Dark Blue", "8 x 3024 Trans-Brown"].join("\n"))
  })

  it("reconstructs visual grid cells with offset labels", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 620, 10, 650, 28),
      block("Light Bluish Gray99207", 250, 42, 610, 62),
      block("4x", 1000, 12, 1032, 30),
      block("30136", 900, 44, 970, 64),
      block("Light Bluish Gray", 880, 72, 1100, 92),
    ])

    expect(text).toBe(
      ["2 x 99207 Light Bluish Gray", "4 x 30136 Light Bluish Gray"].join("\n"),
    )
  })

  it("does not compact a color-bearing OCR line into one part number", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("2x", 10, 10, 36, 28),
      block("79389 Reddish Brown99207 Reddish Brown", 10, 34, 400, 52),
    ])

    expect(text).toBe("")
  })

  it("uses bare quantities only when a visual grid cell has a strong part and color stack", () => {
    const text = buildPartsListTextFromOcrBlocks([
      block("3", 600, 10, 614, 28),
      block("3660", 520, 42, 590, 62),
      block("Light Bluish Gray", 500, 72, 720, 92),
      block("6", 920, 72, 934, 90),
      block("unrelated", 910, 102, 1000, 122),
    ])

    expect(text).toBe("3 x 3660 Light Bluish Gray")
  })
})

describe("normalizeOcrPageText", () => {
  it("fills empty-color rows from a strong dominant named color on the page", () => {
    const dominantRows = Array.from({ length: 9 }, (_, index) => {
      const y = index * 72

      return [
        block("1x", 10, y, 36, y + 18),
        block(`${3000 + index}`, 10, y + 24, 74, y + 42),
        block("Light Bluish Gray", 10, y + 48, 190, y + 66),
      ]
    }).flat()
    const text = normalizeOcrPageText({
      blocks: [
        ...dominantRows,
        block("6x", 240, 10, 266, 28),
        block("3386", 240, 34, 302, 52),
      ],
    })

    expect(text).toContain("6 x 3386 Light Bluish Gray")
  })

  it("repairs an unbacked minority color borrowed from OCR reading order", () => {
    const dominantRows = Array.from({ length: 9 }, (_, index) => {
      const y = 180 + index * 72

      return [
        block("1x", 420, y, 446, y + 18),
        block(`${3000 + index}`, 420, y + 24, 484, y + 42),
        block("Dark Bluish Gray", 420, y + 48, 600, y + 66),
      ]
    }).flat()
    const text = normalizeOcrPageText({
      blocks: [
        block("1x", 10, 10, 36, 28),
        block("85861", 10, 34, 82, 52),
        block("Black", 10, 58, 66, 76),
        block("1x", 220, 10, 246, 28),
        block("4740", 220, 34, 282, 52),
        ...dominantRows,
      ],
      text: [
        "1x",
        "1x",
        "85861",
        "4740",
        "Black",
        ...Array.from({ length: 9 }, (_, index) => [
          "1x",
          `${3000 + index}`,
          "Dark Bluish Gray",
        ]).flat(),
      ].join("\n"),
    })

    expect(text).toContain("1 x 85861 Black")
    expect(text).toContain("1 x 4740 Dark Bluish Gray")
    expect(text).not.toContain("1 x 4740 Black")
  })

  it("merges dense aligned OCR rows when block reconstruction only recovers part of the page", () => {
    const text = normalizeOcrPageText({
      blocks: [
        block("2x", 10, 10, 36, 28),
        block("3024", 10, 34, 62, 52),
        block("6", 10, 58, 22, 76),
      ],
      text: [
        "2x          4x",
        "3024, 6     3001, 86",
      ].join("\n"),
    })

    expect(text).toBe(["2 x 3024 studio-6", "4 x 3001 studio-86"].join("\n"))
  })

  it("keeps aligned full-page rows when block geometry recovers only a dense subset", () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      partNumber: String(3000 + index),
      quantity: (index % 4) + 1,
    }))
    const text = normalizeOcrPageText({
      blocks: rows.slice(0, 9).flatMap((row, index) => {
        const x = (index % 3) * 180
        const y = Math.floor(index / 3) * 96

        return [
          block(`${row.quantity}x`, x, y, x + 32, y + 18),
          block(row.partNumber, x, y + 24, x + 64, y + 42),
          block("Light Bluish Gray", x, y + 48, x + 164, y + 66),
        ]
      }),
      text: [
        rows.map((row) => `${row.quantity}x`.padEnd(14)).join(""),
        rows.map((row) => `${row.partNumber}, 86`.padEnd(14)).join(""),
      ].join("\n"),
    })

    expect(text.split("\n")).toHaveLength(24)
    expect(text.split("\n").at(0)).toBe("1 x 3000 Light Bluish Gray")
    expect(text.split("\n").at(-1)).toBe("4 x 3023 studio-86")
  })

  it("recovers sparse OCR text stacks split by junk lines", () => {
    const text = normalizeOcrPageText({
      text: [
        "2x",
        "3024",
        "noise",
        "Light Bluish Gray, extra OCR",
        "stray",
        "2x",
        "Light Bluish Gray2x",
        "junk",
        "4073",
        "18653",
        "Light Bluish Gray",
        "4x",
        "30137",
        "Light Bluish Gray",
      ].join("\n"),
    })

    expect(text.split("\n")).toEqual([
      "2 x 3024 Light Bluish Gray",
      "2 x 4073 Light Bluish Gray",
      "2 x 18653 Light Bluish Gray",
      "4 x 30137 Light Bluish Gray",
    ])
  })

  it("prefers aligned text color evidence for the same structured row anchor", () => {
    const text = normalizeOcrPageText({
      blocks: [
        block("2x", 10, 10, 36, 28),
        block("3024", 10, 34, 62, 52),
      ],
      text: [
        "2x",
        "3024",
        "Light Bluish Gray",
      ].join("\n"),
    })

    expect(text).toBe("2 x 3024 Light Bluish Gray")
  })

  it("recovers part numbers fused after color text in sparse OCR text", () => {
    const text = normalizeOcrPageText({
      text: [
        "2x",
        "86876",
        "3x",
        "Light Bluish Gray3660",
        "2x",
        "Light Bluish Gray3g22",
        "1x",
        "Light Bluish Gray3p413",
      ].join("\n"),
    })

    expect(text).toBe(
      [
        "2 x 86876 Light Bluish Gray",
        "3 x 3660 Light Bluish Gray",
        "2 x 3622 Light Bluish Gray",
        "1 x 30413 Light Bluish Gray",
      ].join("\n"),
    )
  })

  it("uses the nearest pending quantity for sparse fused color part rows", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "80x",
        "1x",
        "Light Bluish Gray3846pb063",
        "1x",
        "Light Bluish GrayLight Bluish Gray",
        "92947",
        "3660",
        "Light Bluish GrayLight Bluish Gray",
      ].join("\n"),
    )

    expect(text).toContain("1 x 3846pb063 Light Bluish Gray")
    expect(text).not.toContain("80 x 3846pb063 Light Bluish Gray")
  })

  it("ignores punctuation-prefixed standalone part fragments in sparse OCR text", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "48x",
        "   ,32028",
        "3024",
        "Light Bluish Gray18x",
        "86996",
        "Light Bluish Gray",
      ].join("\n"),
    )

    expect(text).toContain("48 x 3024 Light Bluish Gray")
    expect(text).not.toContain("48 x 32028 Light Bluish Gray")
  })

  it("ignores long repeated-digit OCR artifacts as standalone part numbers", () => {
    const text = buildPartsListTextFromAlignedOcrText(["8x", "880008888", "White"].join("\n"))

    expect(text).toBe("")
  })

  it("keeps long numeric part numbers that are not dominated by repeated OCR glyphs", () => {
    const text = buildPartsListTextFromAlignedOcrText(["1x", "10100001", "White"].join("\n"))

    expect(text).toBe("1 x 10100001 White")
  })

  it("reuses a quantity for a dense fused color trailing part cluster", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "2x",
        "22385",
        "Reddish Brown99207",
        "Reddish Brown",
        "79389",
        "Reddish Brown",
      ].join("\n"),
    )

    expect(text).toContain("2 x 22385 Reddish Brown")
    expect(text).toContain("2 x 99207 Reddish Brown")
    expect(text).toContain("2 x 79389 Reddish Brown")
  })

  it("reuses a quantity for fused trailing parts when OCR interleaves color-only lines", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "2x",
        "22385",
        "33909",
        "Reddish Brown",
        "79389",
        "Reddish Brown99207",
        "Reddish Brown",
      ].join("\n"),
    )

    expect(text).toContain("2 x 22385 Reddish Brown")
    expect(text).toContain("2 x 79389 Reddish Brown")
    expect(text).toContain("2 x 99207 Reddish Brown")
  })

  it("pairs sparse OCR parts with the closest pending quantity", () => {
    const text = normalizeOcrPageText({
      text: [
        "60475b",
        "1x",
        "Dark Bluish Gray2x",
        "3710",
        "Dark Bluish Gray",
      ].join("\n"),
    })

    expect(text).toBe(
      [
        "2 x 3710 Dark Bluish Gray",
        "1 x 60475b Dark Bluish Gray",
      ].join("\n"),
    )
  })

  it("uses color lines with trailing next quantities for pending dense rows", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "6x",
        "4216",
        "Reddish Brown2x",
        "Reddish Brown",
        "3172",
        "Reddish Brown 3x",
        "3021",
        "Reddish Brown",
      ].join("\n"),
    )

    expect(text).toContain("2 x 3172 Reddish Brown")
    expect(text).toContain("3 x 3021 Reddish Brown")
  })

  it("recovers a fused color and part line when OCR emits consecutive quantities", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "4x",
        "3937",
        "1x",
        "2x",
        "Reddish Brown18674",
        "87580",
        "Reddish Brown",
      ].join("\n"),
    )

    expect(text).toContain("1 x 18674 Reddish Brown")
  })

  it("recovers sparse part-first OCR stacks when quantity follows the part", () => {
    const text = normalizeOcrPageText({
      text: [
        "2431",
        "1x",
        "Dark Bluish Gray",
      ].join("\n"),
    })

    expect(text).toBe("1 x 2431 Dark Bluish Gray")
  })

  it("uses aligned OCR to replace one-character structured part-number slips", () => {
    const text = normalizeOcrPageText({
      blocks: [
        block("2x", 10, 10, 36, 28),
        block("3024", 10, 34, 62, 52),
        block("Light Bluish Gray", 10, 58, 176, 76),
        block("4x", 100, 10, 126, 28),
        block("2488", 100, 34, 152, 52),
        block("Light Bluish Graygaar 3", 100, 58, 320, 76),
      ],
      text: [
        "2x",
        "3024",
        "Light Bluish Gray",
        "4x",
        "4488",
        "Light Bluish Gray",
      ].join("\n"),
    })

    expect(text).toBe(
      [
        "2 x 3024 Light Bluish Gray",
        "4 x 4488 Light Bluish Gray",
      ].join("\n"),
    )
  })

  it("deduplicates OCR suffix substitutions and quantity conflicts from text variants", () => {
    const text = normalizeOcrPageText({
      textVariants: [
        [
          "2x",
          "2335ph191",
          "Light Bluish Gray",
          "1x",
          "4488",
          "Light Bluish Gray",
        ].join("\n"),
        [
          "2x",
          "2335pb191",
          "Light Bluish Gray",
          "4x",
          "4488",
          "Light Bluish Gray",
        ].join("\n"),
      ],
    })

    expect(text).toBe(
      [
        "2 x 2335pb191 Light Bluish Gray",
        "4 x 4488 Light Bluish Gray",
      ].join("\n"),
    )
  })

  it("deduplicates split printed suffix reads against exact raw part evidence", () => {
    const text = normalizeOcrPageText({
      blocks: [
        block("2x", 10, 10, 36, 28),
        block("23350 b191", 10, 34, 140, 52),
        block("Light Bluish Gray", 10, 58, 180, 76),
        block("2x", 12, 11, 38, 29),
        block("2335pb191", 12, 35, 150, 53),
        block("Light Bluish Gray", 12, 59, 182, 77),
      ],
    })

    expect(text).toBe("2 x 2335pb191 Light Bluish Gray")
  })

  it("rejects no-region aligned rows that contradict dense positioned OCR rows", () => {
    const positionedRows = [
      { color: "Red", part: "80326", quantity: 1 },
      { color: "Red", part: "22385", quantity: 10 },
      { color: "Red", part: "3020", quantity: 2 },
      { color: "Black", part: "3001", quantity: 1 },
      { color: "Black", part: "3002", quantity: 1 },
      { color: "Black", part: "3003", quantity: 1 },
      { color: "Black", part: "3004", quantity: 1 },
      { color: "Black", part: "3005", quantity: 1 },
      { color: "Black", part: "3006", quantity: 1 },
      { color: "Black", part: "3007", quantity: 1 },
    ]
    const text = normalizeOcrPageText({
      blocks: positionedRows.flatMap((row, index) => {
        const y = index * 90

        return [
          block(`${row.quantity}x`, 10, y, 36, y + 18),
          block(row.part, 10, y + 24, 82, y + 42),
          block(row.color, 10, y + 48, 176, y + 66),
        ]
      }),
      textVariants: [
        [
          "1x",
          "80326",
          "Red",
          "12x",
          "80326",
          "Light Bluish Gray",
          "12x",
          "22385",
          "Light Bluish Gray",
          "4x",
          "3020",
          "Light Bluish Gray",
        ].join("\n"),
      ],
    })

    expect(text).toContain("1 x 80326 Red")
    expect(text).toContain("10 x 22385 Red")
    expect(text).toContain("2 x 3020 Red")
    expect(text).not.toContain("12 x 80326 Light Bluish Gray")
    expect(text).not.toContain("12 x 22385 Light Bluish Gray")
    expect(text).not.toContain("4 x 3020 Light Bluish Gray")
  })

  it("rejects no-region aligned conflicts on near-complete dense pages", () => {
    const positionedRows = [
      { color: "Reddish Brown", part: "62113", quantity: 1 },
      { color: "Reddish Brown", part: "3035", quantity: 4 },
      { color: "Reddish Brown", part: "2453b", quantity: 12 },
      { color: "Reddish Brown", part: "6636", quantity: 2 },
      { color: "Reddish Brown", part: "3460", quantity: 2 },
      { color: "Reddish Brown", part: "4477", quantity: 1 },
      { color: "Reddish Brown", part: "3795", quantity: 1 },
      { color: "Reddish Brown", part: "4162", quantity: 1 },
      { color: "Reddish Brown", part: "3023", quantity: 11 },
    ]
    const text = normalizeOcrPageText({
      blocks: positionedRows.flatMap((row, index) => {
        const y = index * 90

        return [
          block(`${row.quantity}x`, 10, y, 36, y + 18),
          block(row.part, 10, y + 24, 82, y + 42),
          block(row.color, 10, y + 48, 176, y + 66),
        ]
      }),
      textVariants: [
        [
          "1x",
          "62113",
          "Reddish Brown",
          "4x",
          "12x",
          "3035",
          "2453b",
          "Reddish Brown",
          "Reddish Brown",
        ].join("\n"),
      ],
    })

    expect(text).toContain("4 x 3035 Reddish Brown")
    expect(text).toContain("12 x 2453b Reddish Brown")
    expect(text).not.toContain("12 x 3035 Reddish Brown")
  })
})

describe("createOcrPageText", () => {
  it("keeps private source regions and crop reference anchors for reconstructed OCR rows", () => {
    const pageText = createOcrPageText(
      42,
      {
        blocks: [
          block("2x", 10, 10, 36, 28),
          block("3024", 10, 34, 62, 52),
          block("Black", 10, 58, 66, 76),
        ],
      },
      { height: 2400, unit: "ocr_pixel", width: 1800 },
    )

    expect(pageText).toMatchObject({
      pageNumber: 42,
      rawText: "2x\n3024\nBlack",
      sourceKind: "ocr",
      text: "2 x 3024 Black",
    })
    expect(pageText.rowSources).toHaveLength(1)
    expect(pageText.rowSources?.[0]).toMatchObject({
      rawText: "2 x 3024 Black",
      rawTokens: ["2x", "3024", "Black"],
      rowRegion: {
        height: 66,
        unit: "ocr_pixel",
        width: 56,
        x: 10,
        y: 10,
      },
      partThumbnailRegion: {
        height: 162,
        unit: "ocr_pixel",
        width: 162,
        x: 0,
        y: 0,
      },
      sourceImage: { height: 2400, unit: "ocr_pixel", width: 1800 },
      textRange: { end: 14, start: 0 },
    })
    expect(pageText.rowSources?.[0]?.cropReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "row", pageNumber: 42 }),
        expect.objectContaining({ kind: "part_thumbnail_candidate", pageNumber: 42 }),
      ]),
    )
  })

  it("keeps region-backed previews when aligned OCR confirms the same row text", () => {
    const pageText = createOcrPageText(
      42,
      {
        blocks: [
          block("2x", 10, 10, 36, 28),
          block("3024", 10, 34, 62, 52),
          block("Light Bluish Gray", 10, 58, 1200, 76),
        ],
        text: [
          "2x",
          "3024",
          "Light Bluish Gray",
        ].join("\n"),
      },
      { height: 2400, unit: "ocr_pixel", width: 1800 },
    )

    expect(pageText.text).toBe("2 x 3024 Light Bluish Gray")
    expect(pageText.rowSources).toHaveLength(1)
    expect(pageText.rowSources?.[0]).toMatchObject({
      cropReferences: expect.arrayContaining([expect.objectContaining({ kind: "row" })]),
      rowRegion: { x: 10, y: 10 },
    })
  })

  it("keeps region-backed previews when aligned OCR corrects a noisy part read", () => {
    const pageText = createOcrPageText(
      42,
      {
        blocks: [
          block("2x", 110, 10, 136, 28),
          block("3024", 110, 34, 162, 52),
          block("Black", 110, 58, 166, 76),
          block("4x", 10, 10, 36, 28),
          block("2488", 10, 34, 62, 52),
          block("Light Bluish Graygaar 3", 10, 58, 240, 76),
        ],
        text: [
          "2x",
          "3024",
          "Black",
          "4x",
          "4488",
          "Light Bluish Gray",
        ].join("\n"),
      },
      { height: 2400, unit: "ocr_pixel", width: 1800 },
    )

    expect(pageText.text).toBe(["4 x 4488 Light Bluish Gray", "2 x 3024 Black"].join("\n"))
    expect(pageText.rowSources).toHaveLength(2)
    expect(pageText.rowSources?.[0]).toMatchObject({
      cropReferences: expect.arrayContaining([expect.objectContaining({ kind: "row" })]),
      rowRegion: { x: 10, y: 10 },
    })
  })

  it("prefers explicit aligned quantities over bare structured quantity conflicts", () => {
    const pageText = createOcrPageText(
      42,
      {
        blocks: [
          block("6", 10, 10, 26, 28),
          block("14716", 10, 34, 72, 52),
          block("Light Bluish Gray", 10, 58, 180, 76),
          block("2x", 200, 10, 226, 28),
          block("3004", 200, 34, 262, 52),
          block("Light Bluish Gray", 200, 58, 370, 76),
          block("3x", 400, 10, 426, 28),
          block("3010", 400, 34, 462, 52),
          block("Light Bluish Gray", 400, 58, 570, 76),
          block("1x", 600, 10, 626, 28),
          block("3001", 600, 34, 662, 52),
          block("Light Bluish Gray", 600, 58, 770, 76),
        ],
        text: [
          "1x",
          "14716",
          "Light Bluish Gray",
          "2x",
          "3004",
          "Light Bluish Gray",
          "3x",
          "3010",
          "Light Bluish Gray",
          "1x",
          "3001",
          "Light Bluish Gray",
        ].join("\n"),
      },
      { height: 2400, unit: "ocr_pixel", width: 1800 },
    )

    expect(pageText.text).toContain("1 x 14716 Light Bluish Gray")
    expect(pageText.text).not.toContain("6 x 14716 Light Bluish Gray")
  })

  it("prefers explicit retry quantities over overlapping glyph-slip rows", () => {
    const pageText = createOcrPageText(42, {
      blocks: [
        block("eo", 10, 10, 36, 28),
        block("272", 10, 34, 62, 52),
        block("Reddish Brown", 10, 58, 150, 76),
        block("2x", 80, 12, 106, 30, 2),
        block("3172", 12, 36, 74, 54, 2),
        block("Reddish Brown", 12, 60, 152, 78, 2),
      ],
    })

    expect(pageText.text).toBe("2 x 3172 Reddish Brown")
    expect(pageText.rowSources).toHaveLength(1)
    expect(pageText.rowSources?.[0]).toMatchObject({
      rawTokens: ["2x", "3172", "Reddish Brown"],
    })
  })

  it("prefers longer overlapping part numbers over short OCR fragments", () => {
    const pageText = createOcrPageText(42, {
      blocks: [
        block("2x", 10, 10, 36, 28),
        block("272", 10, 34, 62, 52),
        block("Reddish Brown", 10, 58, 150, 76),
        block("2x", 12, 12, 38, 30, 2),
        block("87994", 12, 36, 84, 54, 2),
        block("Reddish Brown", 12, 60, 152, 78, 2),
      ],
    })

    expect(pageText.text).toBe("2 x 87994 Reddish Brown")
  })

  it("normalizes fused reddish brown OCR color labels", () => {
    const pageText = createOcrPageText(42, {
      blocks: [
        block("2x", 10, 10, 36, 28),
        block("87580", 10, 34, 82, 52),
        block("BrownReddish Brown", 10, 58, 220, 76),
      ],
    })

    expect(pageText.text).toBe("2 x 87580 Reddish Brown")
  })

  it("preserves source metadata for visually distinct duplicate OCR rows", () => {
    const pageText = createOcrPageText(42, {
      blocks: [
        block("2x", 10, 10, 36, 28),
        block("3024", 10, 34, 62, 52),
        block("Black", 10, 58, 66, 76),
        block("2x", 110, 10, 136, 28),
        block("3024", 110, 34, 162, 52),
        block("Black", 110, 58, 166, 76),
      ],
    })

    expect(pageText.text).toBe(["2 x 3024 Black", "2 x 3024 Black"].join("\n"))
    expect(pageText.rowSources).toHaveLength(2)
    expect(pageText.rowSources).toMatchObject([
      {
        rawText: "2 x 3024 Black",
        rowRegion: { x: 10, y: 10 },
        textRange: { end: 15, start: 0 },
      },
      {
        rawText: "2 x 3024 Black",
        rowRegion: { x: 110, y: 10 },
        textRange: { end: 29, start: 15 },
      },
    ])
  })
})

describe("preloadPartsListOcrWorker", () => {
  it("keeps warming a worker that resolves after the preload readiness deadline", async () => {
    vi.useFakeTimers()
    type TestWorker = {
      recognize: () => Promise<{ data: { text: string } }>
      terminate: () => Promise<undefined>
    }
    const worker: TestWorker = {
      recognize: vi.fn(async () => ({ data: { text: "" } })),
      terminate: vi.fn(async () => undefined),
    }
    let resolveWorker: (worker: TestWorker) => void = () => undefined
    const createWorker = vi.fn(() => new Promise<TestWorker>((resolve) => {
      resolveWorker = resolve
    }))

    try {
      const preload = preloadPartsListOcrWorker({ createWorker, deadlineMs: 10 })
      await vi.advanceTimersByTimeAsync(11)

      await expect(preload).resolves.toBe(false)

      resolveWorker(worker)
      await Promise.resolve()
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }

    expect(worker.terminate).not.toHaveBeenCalled()
  })

  it("terminates a warming worker if preload is aborted before it resolves", async () => {
    vi.useFakeTimers()
    type TestWorker = {
      recognize: () => Promise<{ data: { text: string } }>
      terminate: () => Promise<undefined>
    }
    const controller = new AbortController()
    const worker: TestWorker = {
      recognize: vi.fn(async () => ({ data: { text: "" } })),
      terminate: vi.fn(async () => undefined),
    }
    let resolveWorker: (worker: TestWorker) => void = () => undefined
    const createWorker = vi.fn(() => new Promise<TestWorker>((resolve) => {
      resolveWorker = resolve
    }))

    try {
      const preload = preloadPartsListOcrWorker({ createWorker, deadlineMs: 10, signal: controller.signal })
      controller.abort()

      await expect(preload).resolves.toBe(false)

      resolveWorker(worker)
      await Promise.resolve()
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }

    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it("consumes a warmed worker when OCR extraction starts", async () => {
    const worker = {
      recognize: vi.fn(async () => ({ data: { text: "" } })),
      terminate: vi.fn(async () => undefined),
    }
    const createWorker = vi.fn(async () => worker)
    const document = {
      getPage: vi.fn(async (pageNumber: number) => ({
        cleanup: vi.fn(),
        getViewport: () => ({ height: 100, width: 100 }),
        pageNumber,
      })),
      numPages: 1,
    }

    await expect(preloadPartsListOcrWorker({ createWorker })).resolves.toBe(true)
    const pageTexts = await extractPdfPageTextsWithOcr(document, [1])

    expect(pageTexts).toEqual([])
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(document.getPage).toHaveBeenCalledWith(1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it("can keep a default warmed worker available for a follow-up OCR pass", async () => {
    const worker = {
      recognize: vi.fn(async () => ({ data: { text: "" } })),
      terminate: vi.fn(async () => undefined),
    }
    const createWorker = vi.fn(async () => worker)
    const document = {
      getPage: vi.fn(async (pageNumber: number) => ({
        cleanup: vi.fn(),
        getViewport: () => ({ height: 100, width: 100 }),
        pageNumber,
      })),
      numPages: 1,
    }

    await expect(preloadPartsListOcrWorker({ createWorker })).resolves.toBe(true)
    await expect(
      extractPdfPageTextsWithOcr(document, [1], { retainDefaultWorkerAfterUse: true }),
    ).resolves.toEqual([])

    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(worker.terminate).not.toHaveBeenCalled()

    await expect(extractPdfPageTextsWithOcr(document, [1])).resolves.toEqual([])

    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it("runs a single Paddle OCR pass over a rendered page", async () => {
    const canvasContext = {
      canvas: { height: 100, width: 100 },
      fillRect: vi.fn(),
      set fillStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext)
    const worker = {
      recognize: vi.fn(async () => ({
        data: {
          blocks: [
            block("2x", 10, 10, 36, 28),
            block("3024", 10, 34, 62, 52),
            block("Black", 10, 58, 66, 76),
          ],
          text: ["2x", "3024", "Black"].join("\n"),
        },
      })),
      terminate: vi.fn(async () => undefined),
    }
    const createWorker = vi.fn(async () => worker)
    const document = {
      getPage: vi.fn(async (pageNumber: number) => ({
        cleanup: vi.fn(),
        getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({
          height: 100 * scale,
          width: 100 * scale,
        }),
        pageNumber,
        render: ({ canvasContext }: { canvasContext: CanvasRenderingContext2D }) => {
          canvasContext.fillStyle = "#ffffff"
          canvasContext.fillRect(0, 0, canvasContext.canvas.width, canvasContext.canvas.height)

          return { promise: Promise.resolve() }
        },
      })),
      numPages: 1,
    }

    try {
      const pageTexts = await extractPdfPageTextsWithOcr(document, [1], {
        createWorker,
        maxPageWidth: 100,
        maxPixels: 10_000,
      })

      expect(worker.recognize).toHaveBeenCalledTimes(1)
      expect(pageTexts[0]).toMatchObject({
        diagnostics: {
          ocr: {
            engine: "paddleocr.js",
            inputKind: "canvas",
            maxPageWidth: 100,
            pipeline: "PP-OCRv5",
          },
        },
        text: "2 x 3024 Black",
      })
    } finally {
      getContext.mockRestore()
    }
  })

  it("cancels an in-flight PDF render when OCR is aborted", async () => {
    const controller = new AbortController()
    const canvasContext = {
      canvas: { height: 100, width: 100 },
      fillRect: vi.fn(),
      set fillStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext)
    const cancelRender = vi.fn()
    const worker = {
      recognize: vi.fn(async () => ({ data: { text: "" } })),
      terminate: vi.fn(async () => undefined),
    }
    const createWorker = vi.fn(async () => worker)
    const document = {
      getPage: vi.fn(async (pageNumber: number) => ({
        cleanup: vi.fn(),
        getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({
          height: 100 * scale,
          width: 100 * scale,
        }),
        pageNumber,
        render: () => {
          queueMicrotask(() => controller.abort())
          return {
            cancel: cancelRender,
            promise: new Promise(() => undefined),
          }
        },
      })),
      numPages: 1,
    }

    try {
      await expect(
        extractPdfPageTextsWithOcr(document, [1], {
          createWorker,
          maxPageWidth: 100,
          maxPixels: 10_000,
          signal: controller.signal,
        }),
      ).rejects.toBeInstanceOf(PartsListOcrCancelledError)
    } finally {
      getContext.mockRestore()
    }

    expect(cancelRender).toHaveBeenCalledTimes(1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it("can create a bounded OCR worker pool for page batches", async () => {
    const workers = [
      {
        recognize: vi.fn(async () => ({ data: { text: "" } })),
        terminate: vi.fn(async () => undefined),
      },
      {
        recognize: vi.fn(async () => ({ data: { text: "" } })),
        terminate: vi.fn(async () => undefined),
      },
    ]
    const createWorker = vi.fn(async () => workers[createWorker.mock.calls.length - 1]!)
    const document = {
      getPage: vi.fn(async (pageNumber: number) => ({
        cleanup: vi.fn(),
        getViewport: () => ({ height: 100, width: 100 }),
        pageNumber,
      })),
      numPages: 2,
    }

    await expect(
      extractPdfPageTextsWithOcr(document, [2, 1], {
        concurrency: 2,
        createWorker,
      }),
    ).resolves.toEqual([])

    expect(createWorker).toHaveBeenCalledTimes(2)
    expect(document.getPage).toHaveBeenCalledWith(2)
    expect(document.getPage).toHaveBeenCalledWith(1)
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1)
    expect(workers[1]?.terminate).toHaveBeenCalledTimes(1)
  })

  it("starts the page OCR deadline after worker acquisition", async () => {
    let now = 0
    const performanceNow = vi.spyOn(performance, "now").mockImplementation(() => now)
    const worker = {
      recognize: vi.fn(async () => ({ data: { text: "" } })),
      terminate: vi.fn(async () => undefined),
    }
    const createWorker = vi.fn(async () => {
      await Promise.resolve()
      now = 25_000
      return worker
    })
    const document = {
      getPage: vi.fn(async (pageNumber: number) => ({
        cleanup: vi.fn(),
        getViewport: () => ({ height: 100, width: 100 }),
        pageNumber,
      })),
      numPages: 3,
    }

    try {
      await expect(
        extractPdfPageTextsWithOcr(document, [3, 2, 1], { createWorker, deadlineMs: 30_000 }),
      ).resolves.toEqual([])
    } finally {
      performanceNow.mockRestore()
    }

    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(document.getPage).toHaveBeenCalledWith(3)
    expect(document.getPage).toHaveBeenCalledWith(2)
    expect(document.getPage).toHaveBeenCalledWith(1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})

describe("buildPartsListTextFromAlignedOcrText", () => {
  it("reconstructs dense BOM rows from alternating quantity and part-code lines", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "26x          107x         1x",
        "4274,86  54200,86 18654, 86",
        "41x                               39x                               2x",
        "3700, 86            3665, 86            3040, 86",
      ].join("\n"),
    )

    expect(text).toBe(
      [
        "26 x 4274 studio-86",
        "107 x 54200 studio-86",
        "1 x 18654 studio-86",
        "41 x 3700 studio-86",
        "39 x 3665 studio-86",
        "2 x 3040 studio-86",
      ].join("\n"),
    )
  })

  it("does not pair badly misaligned quantity and part-code tokens by order alone", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "2x                                                                                                  4x",
        "3001, 86           3002, 86",
      ].join("\n"),
    )

    expect(text).toBe("2 x 3001 studio-86")
  })

  it("does not treat percentages as OCR quantity suffixes", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "100%",
        "3001, 86",
      ].join("\n"),
    )

    expect(text).toBe("")
  })

  it("recovers aligned Studio rows from isolated quantity glyph slips", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "2x",
        "3035, 86",
        "SF",
        "3030, 86",
        "1x",
        "3036, 86",
        "Eo",
        "41539, 86",
        "we",
        "3700, 86",
        "1x",
        "6111, 86",
      ].join("\n"),
    )

    expect(text).toBe(
      [
        "2 x 3035 studio-86",
        "1 x 3030 studio-86",
        "1 x 3036 studio-86",
        "2 x 41539 studio-86",
        "4 x 3700 studio-86",
        "1 x 6111 studio-86",
      ].join("\n"),
    )
  })

  it("reconstructs aligned quantity, part, and color-name lines", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "2x        4x                 1x",
        "3024      3001               99207",
        "Black     Light Bluish Gray  Dark Tan",
      ].join("\n"),
    )

    expect(text).toBe(
      ["2 x 3024 Black", "4 x 3001 Light Bluish Gray", "1 x 99207 Dark Tan"].join("\n"),
    )
  })

  it("does not carry an aligned quantity across a bare numeric interruption", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "12x",
        "3004",
        "Light Gray",
        "12x",
        "7",
        "2431",
        "Dark Bluish Gray",
      ].join("\n"),
    )

    expect(text).toBe("12 x 3004 Light Gray")
  })

  it("drops retry-only rows with unresolved cropped color fragments", () => {
    const text = normalizeOcrPageText({
      blocks: [
        block("2x", 10, 10, 30, 28, 1),
        block("376", 10, 34, 52, 52, 1),
        block("ihn", 10, 58, 48, 76, 1),
        block("4x", 100, 10, 126, 28, 1),
        block("4150", 100, 34, 152, 52, 1),
        block("Light Gray", 100, 58, 198, 76, 1),
      ],
      text: "",
    })

    expect(text).toBe("4 x 4150 Light Gray")
  })

  it("reconstructs grouped quantity, part, and color labels from one dense OCR line", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      "12x 1x 1x 6134 3037 Red Light Bluish Gray 3032 Light Bluish Gray",
    )

    expect(text).toBe(
      ["12 x 6134 Red", "1 x 3037 Light Bluish Gray", "1 x 3032 Light Bluish Gray"].join("\n"),
    )
  })

  it("recovers whole numeric part labels split by OCR whitespace", () => {
    const text = buildPartsListTextFromAlignedOcrText(["1x", "8761 8", "Black"].join("\n"))

    expect(text).toBe("1 x 87618 Black")
  })

  it("recovers printed assembly rows when OCR orders the part before quantity", () => {
    const text = buildPartsListTextFromAlignedOcrText(
      [
        "1050901 pb02",
        "Blue",
        "Black",
        "Reddish Brown",
        "noise",
        "1x",
        "3069b",
      ].join("\n"),
    )

    expect(text).toBe("1 x 10509c01pb02 Reddish Brown")
  })
})

function block(text: string, x0: number, y0: number, x1: number, y1: number, sourceRank = 0) {
  return {
    bbox: { x0, x1, y0, y1 },
    paragraphs: [
      {
        lines: [
          {
            bbox: { x0, x1, y0, y1 },
            sourceRank,
            text,
          },
        ],
      },
    ],
    sourceRank,
    text,
  }
}
