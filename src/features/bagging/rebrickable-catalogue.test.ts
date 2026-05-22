import { describe, expect, it } from "vitest"
import { parsePartsListRowsFromText } from "./parts-list-extraction"
import {
  createPartsListPartCatalogue,
  createPartsListColorsFromRebrickableColors,
  parseExternalColorAliasesCsv,
  parseExternalPartAliasesCsv,
  parseRebrickableElementsCsv,
  parseRebrickablePartRelationshipsCsv,
  parseRebrickablePartsCsv,
  parseRebrickableColorsCsv,
} from "./rebrickable-catalogue"

describe("parseRebrickableColorsCsv", () => {
  it("loads local Rebrickable color records", () => {
    const records = parseRebrickableColorsCsv(
      [
        "id,name,rgb,is_trans",
        "71,Light Bluish Gray,A0A5A9,f",
        "47,Trans-Clear,FCFCFC,t",
      ].join("\n"),
    )

    expect(records).toEqual([
      {
        id: "71",
        isTransparent: false,
        name: "Light Bluish Gray",
        rgb: "A0A5A9",
      },
      {
        id: "47",
        isTransparent: true,
        name: "Trans-Clear",
        rgb: "FCFCFC",
      },
    ])
  })

  it("handles quoted CSV cells", () => {
    const records = parseRebrickableColorsCsv(
      [
        "rgb,is_trans,name,id",
        "FFFFFF,f,\"Milky White\",15",
      ].join("\n"),
    )

    expect(records).toMatchObject([{ id: "15", name: "Milky White" }])
  })

  it("fails closed when required catalogue fields are missing", () => {
    expect(() => parseRebrickableColorsCsv("id,name\n1,Black")).toThrow(
      "Rebrickable colors CSV must include id, name, rgb, and is_trans columns.",
    )
  })

})

describe("parseExternalColorAliasesCsv", () => {
  it("loads Rebrickable external color aliases", () => {
    const records = parseExternalColorAliasesCsv(
      [
        "system,external_id,rebrickable_id,external_name,rebrickable_name",
        "BrickLink,86,71,Light Bluish Gray,Light Bluish Gray",
        "LDraw,71,71,Light_Bluish_Gray,Light Bluish Gray",
      ].join("\n"),
    )

    expect(records).toEqual([
      {
        externalId: "86",
        externalName: "Light Bluish Gray",
        rebrickableId: "71",
        rebrickableName: "Light Bluish Gray",
        system: "BrickLink",
      },
      {
        externalId: "71",
        externalName: "Light_Bluish_Gray",
        rebrickableId: "71",
        rebrickableName: "Light Bluish Gray",
        system: "LDraw",
      },
    ])
  })

  it("fails closed when required external color alias fields are missing", () => {
    expect(() => parseExternalColorAliasesCsv("system,external_id\nBrickLink,86")).toThrow(
      "External color aliases CSV must include system, external_id, and rebrickable_id columns.",
    )
  })
})

describe("parseExternalPartAliasesCsv", () => {
  it("loads external part aliases", () => {
    const records = parseExternalPartAliasesCsv(
      [
        "alias,canonical,source",
        "3005old,3005,ldraw_keyword",
        "60475old,60475b,ldraw_keyword",
      ].join("\n"),
    )

    expect(records).toEqual([
      { alias: "3005old", canonical: "3005" },
      { alias: "60475old", canonical: "60475b" },
    ])
  })

  it("fails closed when required external alias fields are missing", () => {
    expect(() => parseExternalPartAliasesCsv("alias\n3005old")).toThrow(
      "External part aliases CSV must include alias and canonical columns.",
    )
  })
})

describe("createPartsListColorsFromRebrickableColors", () => {
  it("creates parser colors with common aliases", () => {
    const colors = createPartsListColorsFromRebrickableColors([
      {
        id: "-1",
        isTransparent: false,
        name: "[Unknown]",
        rgb: "0033B2",
      },
      {
        id: "71",
        isTransparent: false,
        name: "Light Bluish Gray",
        rgb: "A0A5A9",
      },
      {
        id: "47",
        isTransparent: true,
        name: "Trans-Clear",
        rgb: "FCFCFC",
      },
    ])

    expect(colors).not.toContainEqual(expect.objectContaining({ id: "-1" }))

    const rows = parsePartsListRowsFromText(
      "4 x 3023 Light Bluish Grey\n2 x 3069b Transparent Clear",
      colors,
    )

    expect(rows).toMatchObject([
      {
        color: { id: "71", name: "Light Bluish Gray" },
        partNumber: "3023",
        quantity: 4,
      },
      {
        color: { id: "47", name: "Trans-Clear" },
        partNumber: "3069b",
        quantity: 2,
      },
    ])
  })

  it("creates OCR recovery aliases for fused light bluish gray labels", () => {
    const colors = createPartsListColorsFromRebrickableColors([
      {
        id: "71",
        isTransparent: false,
        name: "Light Bluish Gray",
        rgb: "A0A5A9",
      },
    ])

    const rows = parsePartsListRowsFromText("2 x 3024 eo Bluish Graygna7sp", colors)

    expect(rows).toMatchObject([
      {
        color: { id: "71", matchedText: "Bluish Gray", name: "Light Bluish Gray" },
        partNumber: "3024",
        quantity: 2,
      },
    ])
  })

  it("does not resolve truncated light bluish gray fragments as color evidence", () => {
    const colors = createPartsListColorsFromRebrickableColors([
      {
        id: "71",
        isTransparent: false,
        name: "Light Bluish Gray",
        rgb: "A0A5A9",
      },
    ])

    const rows = parsePartsListRowsFromText("2 x 60481 Light Bluish i", colors)

    expect(rows).toMatchObject([
      {
        color: null,
        partNumber: "60481",
        quantity: 2,
      },
    ])
  })

  it("maps glowing neon manual color names to transparent Rebrickable colors", () => {
    const colors = createPartsListColorsFromRebrickableColors([
      {
        id: "4",
        isTransparent: false,
        name: "Red",
        rgb: "C91A09",
      },
      {
        id: "14",
        isTransparent: false,
        name: "Yellow",
        rgb: "F2CD37",
      },
      {
        id: "36",
        isTransparent: true,
        name: "Trans-Red",
        rgb: "C91A09",
      },
      {
        id: "46",
        isTransparent: true,
        name: "Trans-Yellow",
        rgb: "F5CD2F",
      },
    ])

    const rows = parsePartsListRowsFromText(
      "4 x 10178pb05 Glowing Neon Red\n1 x 3062 Glowing Neon Yellow",
      colors,
    )

    expect(rows).toMatchObject([
      {
        color: { id: "36", matchedText: "Glowing Neon Red", name: "Trans-Red" },
      },
      {
        color: { id: "46", matchedText: "Glowing Neon Yellow", name: "Trans-Yellow" },
      },
    ])
  })

  it("keeps raw Rebrickable ids separate from supported Studio-style color aliases", () => {
    const colorRecords = [
      {
        id: "71",
        isTransparent: false,
        name: "Light Bluish Gray",
        rgb: "A0A5A9",
      },
      {
        id: "86",
        isTransparent: false,
        name: "Light Brown",
        rgb: "7C503A",
      },
    ]
    const colors = createPartsListColorsFromRebrickableColors(colorRecords, {
      externalColorAliases: [
        {
          externalId: "86",
          externalName: "Light Bluish Gray",
          rebrickableId: "71",
          rebrickableName: "Light Bluish Gray",
          system: "BrickLink",
        },
      ],
    })

    const rawIdRows = parsePartsListRowsFromText("26 x 4274 86", colors)
    const studioAliasRows = parsePartsListRowsFromText("26 x 4274 studio-86", colors)

    expect(rawIdRows).toMatchObject([
      {
        color: { id: "86", matchedText: "86", name: "Light Brown" },
        partNumber: "4274",
        quantity: 26,
      },
    ])
    expect(studioAliasRows).toMatchObject([
      {
        color: { id: "71", matchedText: "studio-86", name: "Light Bluish Gray" },
        partNumber: "4274",
        quantity: 26,
      },
    ])
  })

  it("ignores ambiguous external BrickLink color ids before applying local fallback aliases", () => {
    const colors = createPartsListColorsFromRebrickableColors(
      [
        {
          id: "148",
          isTransparent: false,
          name: "Pearl Dark Gray",
          rgb: "575857",
        },
        {
          id: "1103",
          isTransparent: false,
          name: "Pearl Titanium",
          rgb: "5B5D5E",
        },
      ],
      {
        externalColorAliases: [
          {
            externalId: "77",
            externalName: "Pearl Dark Gray",
            rebrickableId: "148",
            rebrickableName: "Pearl Dark Gray",
            system: "BrickLink",
          },
          {
            externalId: "77",
            externalName: "Pearl Dark Gray",
            rebrickableId: "1103",
            rebrickableName: "Pearl Titanium",
            system: "BrickLink",
          },
        ],
      },
    )

    const rows = parsePartsListRowsFromText("1 x 76764 studio-77", colors)

    expect(rows).toMatchObject([
      {
        color: { id: "1103", matchedText: "studio-77", name: "Pearl Titanium" },
        partNumber: "76764",
      },
    ])
  })

  it("maps OCR-only Studio color ids before raw Rebrickable ids", () => {
    const colors = createPartsListColorsFromRebrickableColors([
      {
        id: "3",
        isTransparent: false,
        name: "Dark Turquoise",
        rgb: "008F9B",
      },
      {
        id: "8",
        isTransparent: false,
        name: "Dark Gray",
        rgb: "6D6E5C",
      },
      {
        id: "14",
        isTransparent: false,
        name: "Yellow",
        rgb: "F2CD37",
      },
      {
        id: "19",
        isTransparent: false,
        name: "Tan",
        rgb: "E4CD9E",
      },
      {
        id: "41",
        isTransparent: true,
        name: "Trans-Light Blue",
        rgb: "AEEFEC",
      },
      {
        id: "70",
        isTransparent: false,
        name: "Reddish Brown",
        rgb: "582A12",
      },
      {
        id: "182",
        isTransparent: true,
        name: "Trans-Orange",
        rgb: "F08F1C",
      },
      {
        id: "297",
        isTransparent: false,
        name: "Pearl Gold",
        rgb: "AA7F2E",
      },
      {
        id: "378",
        isTransparent: false,
        name: "Sand Green",
        rgb: "A0BCAC",
      },
    ])

    const rows = parsePartsListRowsFromText(
      [
        "1 x 3710 studio-2",
        "1 x 15573 studio-88",
        "2 x 4495b studio-3",
        "2 x 87552 studio-15",
        "4 x 98283 studio-48",
        "3 x 37775 studio-98",
        "4 x 85861 studio-115",
        "5 x 3024 88",
      ].join("\n"),
      colors,
    )

    expect(rows).toMatchObject([
      {
        color: { id: "19", matchedText: "studio-2", name: "Tan" },
        partNumber: "3710",
      },
      {
        color: { id: "70", matchedText: "studio-88", name: "Reddish Brown" },
        partNumber: "15573",
      },
      {
        color: { id: "14", matchedText: "studio-3", name: "Yellow" },
        partNumber: "4495b",
      },
      {
        color: { id: "41", matchedText: "studio-15", name: "Trans-Light Blue" },
        partNumber: "87552",
      },
      {
        color: { id: "378", matchedText: "studio-48", name: "Sand Green" },
        partNumber: "98283",
      },
      {
        color: { id: "182", matchedText: "studio-98", name: "Trans-Orange" },
        partNumber: "37775",
      },
      {
        color: { id: "297", matchedText: "studio-115", name: "Pearl Gold" },
        partNumber: "85861",
      },
      {
        color: null,
        partNumber: "3024",
      },
    ])
  })

  it("adds Studio color aliases from Rebrickable external BrickLink color ids", () => {
    const colors = createPartsListColorsFromRebrickableColors(
      [
        {
          id: "226",
          isTransparent: false,
          name: "Bright Light Yellow",
          rgb: "FFF03A",
        },
        {
          id: "26",
          isTransparent: false,
          name: "Magenta",
          rgb: "923978",
        },
      ],
      {
        externalColorAliases: [
          {
            externalId: "103",
            externalName: "Bright Light Yellow",
            rebrickableId: "226",
            rebrickableName: "Bright Light Yellow",
            system: "BrickLink",
          },
          {
            externalId: "71",
            externalName: "Magenta",
            rebrickableId: "26",
            rebrickableName: "Magenta",
            system: "BrickLink",
          },
        ],
      },
    )

    const rows = parsePartsListRowsFromText(
      "1 x 35470 studio-103\n1 x 24866 studio-71",
      colors,
    )

    expect(rows).toMatchObject([
      {
        color: { id: "226", matchedText: "studio-103", name: "Bright Light Yellow" },
        partNumber: "35470",
      },
      {
        color: { id: "26", matchedText: "studio-71", name: "Magenta" },
        partNumber: "24866",
      },
    ])
  })
})

describe("parseRebrickablePartsCsv", () => {
  it("loads local Rebrickable part numbers", () => {
    const records = parseRebrickablePartsCsv(
      [
        "part_num,name,part_cat_id,part_img_url",
        "3005,Brick 1 x 1,11,https://cdn.rebrickable.com/media/parts/elements/3005.jpg",
        " 3068b ,Tile 2 x 2,19,",
      ].join("\n"),
    )

    expect(records).toEqual([
      {
        imageUrl: "https://cdn.rebrickable.com/media/parts/elements/3005.jpg",
        name: "Brick 1 x 1",
        partNum: "3005",
      },
      {
        name: "Tile 2 x 2",
        partNum: "3068b",
      },
    ])
  })

  it("fails closed when the part number field is missing", () => {
    expect(() => parseRebrickablePartsCsv("name\nBrick 1 x 1")).toThrow(
      "Rebrickable parts CSV must include part_num.",
    )
  })
})

describe("parseRebrickableElementsCsv", () => {
  it("loads local Rebrickable element part-color records", () => {
    const records = parseRebrickableElementsCsv(
      [
        "element_id,part_num,color_id,design_id",
        "4211398,3005,0,3005",
        " 6310268 , 3068b ,71,3068",
      ].join("\n"),
    )

    expect(records).toEqual([
      {
        colorId: "0",
        elementId: "4211398",
        partNum: "3005",
      },
      {
        colorId: "71",
        elementId: "6310268",
        partNum: "3068b",
      },
    ])
  })

  it("fails closed when element fields are missing", () => {
    expect(() => parseRebrickableElementsCsv("element_id,part_num\n4211398,3005")).toThrow(
      "Rebrickable elements CSV must include element_id, part_num, and color_id.",
    )
  })
})

describe("parseRebrickablePartRelationshipsCsv", () => {
  it("loads local Rebrickable part relationship records", () => {
    const records = parseRebrickablePartRelationshipsCsv(
      [
        "rel_type,child_part_num,parent_part_num",
        "M,3024b,3024c",
        "P,973pb1234,973",
      ].join("\n"),
    )

    expect(records).toEqual([
      {
        childPartNum: "3024b",
        parentPartNum: "3024c",
        relType: "M",
      },
      {
        childPartNum: "973pb1234",
        parentPartNum: "973",
        relType: "P",
      },
    ])
  })

  it("fails closed when relationship fields are missing", () => {
    expect(() => parseRebrickablePartRelationshipsCsv("child_part_num,parent_part_num\n3024b,3024c")).toThrow(
      "Rebrickable part relationships CSV must include rel_type, child_part_num, and parent_part_num.",
    )
  })
})

describe("createPartsListPartCatalogue", () => {
  it("builds exact, alias, print-parent, and mold-family lookups", () => {
    const catalogue = createPartsListPartCatalogue({
      externalPartAliases: [
        { alias: "3005old", canonical: "3005" },
        { alias: "60475old", canonical: "60475b" },
      ],
      parts: [
        "2429",
        "2430",
        "3005",
        "3024b",
        "3024c",
        "60475b",
        "73983",
        "973",
        "973pb1234",
        "2335pr0011",
        "3068bpr9955",
        "4493c01pr0002",
      ],
      relationships: [
        { childPartNum: "2429", parentPartNum: "73983", relType: "B" },
        { childPartNum: "2430", parentPartNum: "73983", relType: "B" },
        { childPartNum: "3024b", parentPartNum: "3024c", relType: "M" },
        { childPartNum: "973pb1234", parentPartNum: "973", relType: "P" },
      ],
    })

    expect(catalogue.parts.has("3005")).toBe(true)
    expect(catalogue.assemblyComponentsByPart?.get("73983")).toEqual(new Set(["2429", "2430"]))
    expect(catalogue.assemblyParentsByComponent?.get("2429")).toEqual(new Set(["73983"]))
    expect(catalogue.externalPartAliasByPart?.get("3005old")).toBe("3005")
    expect(catalogue.externalPartAliasByPart?.get("60475old")).toBe("60475b")
    expect(catalogue.externalPartAliasByPart?.get("3846p4g")).toBe("3846pr0039")
    expect(catalogue.externalPartAliasByPart?.get("40359a")).toBe("62808")
    expect(catalogue.externalPartAliasByPart?.get("52")).toBe("30385")
    expect(catalogue.printParentByPart?.get("973pb1234")).toBe("973")
    expect(catalogue.printFamilyByBase?.get("2335")).toEqual(new Set(["2335pr0011"]))
    expect(catalogue.printFamilyByBase?.get("3068b")).toEqual(new Set(["3068bpr9955"]))
    expect(catalogue.printFamilyByBase?.get("4493c01")).toEqual(new Set(["4493c01pr0002"]))
    expect(catalogue.singleLetterMoldVariantByPart?.get("3024")).toBe("3024b")
    expect(catalogue.moldFamilyByPart?.get("3024b")).toEqual(new Set(["3024b", "3024c"]))
    expect(catalogue.moldFamilyByPart?.get("3024c")).toEqual(new Set(["3024b", "3024c"]))
  })
})
