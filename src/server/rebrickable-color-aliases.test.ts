import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { readOrCreateExternalColorAliasesCsv } from "./rebrickable-color-aliases"

const originalApiKey = process.env.REBRICKABLE_API_KEY

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.REBRICKABLE_API_KEY
  } else {
    process.env.REBRICKABLE_API_KEY = originalApiKey
  }
  vi.unstubAllGlobals()
})

describe("readOrCreateExternalColorAliasesCsv", () => {
  it("returns an empty cache when no Rebrickable API key is configured", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    delete process.env.REBRICKABLE_API_KEY

    await expect(readOrCreateExternalColorAliasesCsv(catalogueDir)).resolves.toBe("")
  })

  it("fetches and caches Rebrickable external color aliases when missing", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    process.env.REBRICKABLE_API_KEY = "test-key"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          next: null,
          results: [
            {
              external_ids: {
                BrickLink: {
                  ext_descrs: [["Light Bluish Gray"]],
                  ext_ids: [86],
                },
              },
              id: 71,
              name: "Light Bluish Gray",
            },
          ],
        }),
      ),
    )

    const csvText = await readOrCreateExternalColorAliasesCsv(catalogueDir)

    expect(csvText).toContain("BrickLink,86,71,Light Bluish Gray,Light Bluish Gray")
    await expect(readFile(join(catalogueDir, "external_color_aliases.csv"), "utf8")).resolves.toBe(csvText)
  })

  it("recovers a malformed color alias cache from the Rebrickable API", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    await writeFile(join(catalogueDir, "external_color_aliases.csv"), "broken,cache\n")
    process.env.REBRICKABLE_API_KEY = "test-key"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          next: null,
          results: [
            {
              external_ids: {
                Studio: {
                  ext_descrs: [["Dark Tan"]],
                  ext_ids: [69],
                },
              },
              id: 69,
              name: "Dark Tan",
            },
          ],
        }),
      ),
    )

    const csvText = await readOrCreateExternalColorAliasesCsv(catalogueDir)

    expect(csvText).toContain("Studio,69,69,Dark Tan,Dark Tan")
    await expect(readFile(join(catalogueDir, "external_color_aliases.csv"), "utf8")).resolves.toBe(csvText)
  })

  it("can recover aliases without mutating the catalogue directory", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    await writeFile(join(catalogueDir, "external_color_aliases.csv"), "broken,cache\n")
    process.env.REBRICKABLE_API_KEY = "test-key"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          next: null,
          results: [
            {
              external_ids: {
                Studio: {
                  ext_descrs: [["Dark Tan"]],
                  ext_ids: [69],
                },
              },
              id: 69,
              name: "Dark Tan",
            },
          ],
        }),
      ),
    )

    const csvText = await readOrCreateExternalColorAliasesCsv(catalogueDir, { writeCache: false })

    expect(csvText).toContain("Studio,69,69,Dark Tan,Dark Tan")
    await expect(readFile(join(catalogueDir, "external_color_aliases.csv"), "utf8")).resolves.toBe("broken,cache\n")
  })
})
