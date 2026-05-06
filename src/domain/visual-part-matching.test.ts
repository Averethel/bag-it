import { afterEach, describe, expect, it, vi } from "vitest";

import { attachCatalogImageDescriptorsToInventory } from "./visual-part-matching";
import type { RebrickableInventoryItem } from "./rebrickable-csv";

describe("attachCatalogImageDescriptorsToInventory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches color-specific catalog image descriptors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    );
    vi.stubGlobal("createImageBitmap", vi.fn(async () => null));

    await attachCatalogImageDescriptorsToInventory([
      createInventoryItem({ color: "15", id: "white-plate", partNumber: "3024" }),
      createInventoryItem({ color: "4", id: "red-plate", partNumber: "3024" }),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe(
      "/api/catalog/part-image?partNumber=3024&source=rebrickable-cache-v1&colorId=15",
    );
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toBe(
      "/api/catalog/part-image?partNumber=3024&source=rebrickable-cache-v1&colorId=4",
    );
  });
});

function createInventoryItem({
  color,
  id,
  partNumber,
}: {
  color: string;
  id: string;
  partNumber: string;
}): RebrickableInventoryItem {
  return {
    id,
    sequence: 1,
    partNumber,
    color,
    colorName: null,
    quantity: 1,
    isSpare: false,
    catalogPart: {
      aliases: [],
      name: "Plate",
      partImageUrl: null,
      partNumber,
      partUrl: null,
      requestedPartNumber: partNumber,
    },
  };
}
