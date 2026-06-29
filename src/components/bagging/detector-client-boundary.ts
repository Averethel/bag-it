import type {
  CreatePagePreviewAsset,
  CreatePartMaskPreviewAsset,
  HydrateStepPreviews,
  PreviewPageInputCacheEntry,
  ReadPdfMetadata,
  RestoreSessionFile,
  ScanStepCallouts,
  ScanStepParts,
} from "./bagging-app-types"
import {
  RUNTIME_PREVIEW_TARGET_WIDTH,
  throwIfPreviewAborted,
} from "./bagging-preview-runtime"
import type {
  PagePreviewAsset,
  PartMaskPreviewAsset,
} from "@/features/steps/preview-assets"

export const DEFAULT_STEP_CALLOUT_DETECTOR_VERSION = "2.0.0-alpha.19"
export const DEFAULT_STEP_PART_COLOR_CALIBRATION_VERSION = "2.0.0-alpha.65"
export const DEFAULT_STEP_PART_EXTRACTOR_VERSION = "2.0.0-alpha.164"

export const readDefaultPdfMetadata: ReadPdfMetadata = async (...args) => {
  const { readPdfMetadataFromFile } = await import("@/features/pdf/browser-pdf-parser")

  return readPdfMetadataFromFile(...args)
}

export const restoreDefaultSessionFile: RestoreSessionFile = async (...args) => {
  const { restorePdfIntakeSessionFile } = await import("@/features/bagging/session-file")

  return restorePdfIntakeSessionFile(...args)
}

export const scanDefaultStepCallouts: ScanStepCallouts = async (...args) => {
  const { scanPdfStepCalloutsV2FromFile } = await import(
    "@/features/steps/v2/browser-step-detector-adapter"
  )

  return scanPdfStepCalloutsV2FromFile(...args)
}

export const scanDefaultStepParts: ScanStepParts = async (...args) => {
  const { scanPdfStepPartsV2FromFile } = await import(
    "@/features/steps/v2/browser-step-detector-adapter"
  )

  return scanPdfStepPartsV2FromFile(...args)
}

export const hydrateDefaultStepPreviews: HydrateStepPreviews = async (...args) => {
  const { hydratePdfStepPreviewImagesV2FromFile } = await import(
    "@/features/steps/v2/browser-step-detector-adapter"
  )

  return hydratePdfStepPreviewImagesV2FromFile(...args)
}

export const createDefaultPagePreviewAsset: CreatePagePreviewAsset = async (...args) => {
  const { createPdfPagePreviewAssetV2FromFile } = await import(
    "@/features/steps/v2/browser-step-detector-adapter"
  )

  return createPdfPagePreviewAssetV2FromFile(...args)
}

export const createDefaultPartMaskPreviewAsset: CreatePartMaskPreviewAsset = async (
  pageAsset,
  partItem,
  signal,
) => {
  throwIfPreviewAborted(signal)
  const { createPartMaskPreviewAssetFromPageAsset } = await import(
    "@/features/steps/v2/runtime-preview-assets"
  )
  throwIfPreviewAborted(signal)

  return createPartMaskPreviewAssetFromPageAsset(pageAsset, partItem)
}

export async function createCachedPagePreviewAsset(
  cachedPageInput: PreviewPageInputCacheEntry,
  signal: AbortSignal | undefined,
): Promise<PagePreviewAsset> {
  throwIfPreviewAborted(signal)
  const { createPagePreviewAssetFromPageInput } = await import(
    "@/features/steps/v2/runtime-preview-assets"
  )
  const asset = await createPagePreviewAssetFromPageInput(
    cachedPageInput.pageInput,
    cachedPageInput.baseBounds,
    { targetWidth: RUNTIME_PREVIEW_TARGET_WIDTH },
  )
  throwIfPreviewAborted(signal)

  return asset
}

export async function createCachedPartMaskPreviewAsset(
  cachedPageInput: PreviewPageInputCacheEntry,
  pageAsset: PagePreviewAsset,
  partItem: Parameters<CreatePartMaskPreviewAsset>[1],
  signal: AbortSignal | undefined,
): Promise<PartMaskPreviewAsset | null> {
  throwIfPreviewAborted(signal)
  const { createPartMaskPreviewAssetFromPageInput } = await import(
    "@/features/steps/v2/runtime-preview-assets"
  )
  const asset = await createPartMaskPreviewAssetFromPageInput(
    cachedPageInput.pageInput,
    pageAsset,
    partItem,
  )
  throwIfPreviewAborted(signal)

  return asset
}
