import type { StepSourceRegion } from "./step-detection-contracts"

export type PreviewAssetKey = `page:${number}` | `part-mask:${string}`

export interface PagePreviewAsset {
  baseHeight: number
  baseWidth: number
  naturalHeight: number
  naturalWidth: number
  pageNumber: number
  url: string
}

export interface RegionPreviewSource {
  baseHeight: number
  baseWidth: number
  pageNumber: number
  region: StepSourceRegion
}

export interface PartMaskPreviewAsset {
  height: number
  partItemId: string
  renderedPixels?: {
    data: Uint8ClampedArray | number[]
    height: number
    width: number
  } | null
  url: string
  width: number
}

export type PreviewAsset = PagePreviewAsset | PartMaskPreviewAsset

export type PreviewAssetState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; asset: PreviewAsset }
  | { status: "failed"; error: string }

export type PreviewAssetStoreListener = () => void

const IDLE_PREVIEW_ASSET_STATE: PreviewAssetState = { status: "idle" }
const PENDING_PREVIEW_ASSET_STATE: PreviewAssetState = { status: "pending" }

export function createPagePreviewKey(pageNumber: number): PreviewAssetKey {
  return `page:${pageNumber}`
}

export function createPartMaskPreviewKey(partItemId: string): PreviewAssetKey {
  return `part-mask:${partItemId}`
}

export function createPreviewAssetStore(): PreviewAssetStore {
  return new PreviewAssetStore()
}

export class PreviewAssetStore {
  private readonly listenersByKey = new Map<PreviewAssetKey, Set<PreviewAssetStoreListener>>()
  private readonly snapshotsByKey = new Map<PreviewAssetKey, PreviewAssetState>()

  getSnapshot(key: PreviewAssetKey): PreviewAssetState {
    return this.snapshotsByKey.get(key) ?? IDLE_PREVIEW_ASSET_STATE
  }

  readReadyPageAssets(): PagePreviewAsset[] {
    const pageAssets: PagePreviewAsset[] = []

    for (const [key, state] of this.snapshotsByKey) {
      if (!key.startsWith("page:") || state.status !== "ready") {
        continue
      }

      pageAssets.push(state.asset as PagePreviewAsset)
    }

    return pageAssets.sort((left, right) => left.pageNumber - right.pageNumber)
  }

  readReadyPartMaskAssets(): PartMaskPreviewAsset[] {
    const partMaskAssets: PartMaskPreviewAsset[] = []

    for (const [key, state] of this.snapshotsByKey) {
      if (!key.startsWith("part-mask:") || state.status !== "ready") {
        continue
      }

      partMaskAssets.push(state.asset as PartMaskPreviewAsset)
    }

    return partMaskAssets.sort((left, right) => left.partItemId.localeCompare(right.partItemId))
  }

  subscribe(key: PreviewAssetKey, listener: PreviewAssetStoreListener): () => void {
    const listeners = this.listenersByKey.get(key) ?? new Set<PreviewAssetStoreListener>()

    listeners.add(listener)
    this.listenersByKey.set(key, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.listenersByKey.delete(key)
      }
    }
  }

  setPending(key: PreviewAssetKey): void {
    this.setSnapshot(key, PENDING_PREVIEW_ASSET_STATE)
  }

  setFailed(key: PreviewAssetKey, error: string): void {
    this.setSnapshot(key, { status: "failed", error })
  }

  setPageAsset(pageNumber: number, asset: PagePreviewAsset): void {
    this.setSnapshot(createPagePreviewKey(pageNumber), { status: "ready", asset })
  }

  setPartMaskAsset(partItemId: string, asset: PartMaskPreviewAsset): void {
    this.setSnapshot(createPartMaskPreviewKey(partItemId), { status: "ready", asset })
  }

  purge(): void {
    for (const state of this.snapshotsByKey.values()) {
      revokePreviewAssetState(state)
    }

    const keys = [...this.snapshotsByKey.keys()]
    this.snapshotsByKey.clear()

    for (const key of keys) {
      this.notify(key)
    }
  }

  private setSnapshot(key: PreviewAssetKey, nextState: PreviewAssetState): void {
    const previousState = this.snapshotsByKey.get(key)

    if (previousState === nextState) {
      return
    }

    if (previousState?.status === "ready" && nextState.status === "ready") {
      const previousUrl = previousState.asset.url
      const nextUrl = nextState.asset.url

      if (previousUrl !== nextUrl) {
        revokeObjectUrl(previousUrl)
      }
    } else if (previousState?.status === "ready") {
      revokeObjectUrl(previousState.asset.url)
    }

    this.snapshotsByKey.set(key, nextState)
    this.notify(key)
  }

  private notify(key: PreviewAssetKey): void {
    for (const listener of this.listenersByKey.get(key) ?? []) {
      listener()
    }
  }
}

function revokePreviewAssetState(state: PreviewAssetState): void {
  if (state.status === "ready") {
    revokeObjectUrl(state.asset.url)
  }
}

function revokeObjectUrl(url: string): void {
  if (!url.startsWith("blob:") || typeof URL === "undefined") {
    return
  }

  URL.revokeObjectURL(url)
}
