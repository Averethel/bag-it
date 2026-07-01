import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createPagePreviewKey,
  createPreviewAssetStore,
} from "./preview-assets"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PreviewAssetStore", () => {
  it("notifies only subscribers for the changed key", () => {
    const store = createPreviewAssetStore()
    const pageOneListener = vi.fn()
    const pageTwoListener = vi.fn()

    store.subscribe(createPagePreviewKey(1), pageOneListener)
    store.subscribe(createPagePreviewKey(2), pageTwoListener)
    store.setPageAsset(1, {
      baseHeight: 140,
      baseWidth: 100,
      naturalHeight: 2240,
      naturalWidth: 1600,
      pageNumber: 1,
      url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
    })

    expect(pageOneListener).toHaveBeenCalledTimes(1)
    expect(pageTwoListener).not.toHaveBeenCalled()
  })

  it("revokes object urls when assets are replaced and purged", () => {
    const revokeObjectURL = vi.fn()
    const store = createPreviewAssetStore()

    vi.stubGlobal("URL", {
      revokeObjectURL,
    })

    store.setPageAsset(1, {
      baseHeight: 140,
      baseWidth: 100,
      naturalHeight: 2240,
      naturalWidth: 1600,
      pageNumber: 1,
      url: "blob:page-1-a",
    })
    store.setPageAsset(1, {
      baseHeight: 140,
      baseWidth: 100,
      naturalHeight: 2240,
      naturalWidth: 1600,
      pageNumber: 1,
      url: "blob:page-1-b",
    })
    store.purge()

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:page-1-a")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:page-1-b")
  })
})
