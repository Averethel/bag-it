import type {
  DetectedStepCalloutPartItem,
  StepCalloutDetectionResult,
} from "./step-detection-contracts"

export function collectStepDetectionPreviewObjectUrls(
  result: StepCalloutDetectionResult,
): string[] {
  const urls: string[] = []

  for (const preview of result.pagePreviews) {
    collectRuntimeObjectUrl(urls, preview.imageDataUrl)
  }

  for (const callout of result.callouts) {
    collectRuntimeObjectUrl(urls, callout.crop.imageDataUrl)

    for (const partItem of callout.partItems) {
      collectRuntimeObjectUrl(urls, partItem.partCrop?.imageDataUrl)
      collectRuntimeObjectUrl(urls, partItem.partImage?.imageDataUrl)
      collectRuntimeObjectUrl(urls, partItem.quantityLabel.crop?.imageDataUrl)
      collectRuntimeObjectUrl(urls, partItem.quantityLabel.imageDataUrl)
    }
  }

  return urls
}

export function revokeStepDetectionPreviewObjectUrls(
  result: StepCalloutDetectionResult,
): void {
  revokePreviewObjectUrls(collectStepDetectionPreviewObjectUrls(result))
}

export function revokePreviewObjectUrls(urls: Iterable<string>): void {
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
    return
  }

  for (const url of urls) {
    URL.revokeObjectURL(url)
  }
}

export function stripRuntimePreviewObjectUrls(
  result: StepCalloutDetectionResult,
): StepCalloutDetectionResult {
  return {
    ...result,
    pagePreviews: result.pagePreviews.map((preview) => ({
      ...preview,
      imageDataUrl: stripRuntimeObjectUrl(preview.imageDataUrl),
    })),
    callouts: result.callouts.map((callout) => ({
      ...callout,
      crop: {
        ...callout.crop,
        imageDataUrl: stripRuntimeObjectUrl(callout.crop.imageDataUrl),
      },
      partItems: callout.partItems.map(stripPartItemRuntimePreviewObjectUrls),
    })),
  }
}

function stripPartItemRuntimePreviewObjectUrls(
  partItem: DetectedStepCalloutPartItem,
): DetectedStepCalloutPartItem {
  return {
    ...partItem,
    partCrop: partItem.partCrop
      ? {
          ...partItem.partCrop,
          imageDataUrl: stripRuntimeObjectUrl(partItem.partCrop.imageDataUrl),
        }
      : partItem.partCrop,
    partImage: partItem.partImage
      ? {
          ...partItem.partImage,
          imageDataUrl: stripRuntimeObjectUrl(partItem.partImage.imageDataUrl),
        }
      : partItem.partImage,
    quantityLabel: {
      ...partItem.quantityLabel,
      crop: partItem.quantityLabel.crop
        ? {
            ...partItem.quantityLabel.crop,
            imageDataUrl: stripRuntimeObjectUrl(partItem.quantityLabel.crop.imageDataUrl),
          }
        : partItem.quantityLabel.crop,
      imageDataUrl: stripRuntimeObjectUrl(partItem.quantityLabel.imageDataUrl),
    },
  }
}

function collectRuntimeObjectUrl(urls: string[], value: string | undefined): void {
  if (isRuntimeObjectUrl(value)) {
    urls.push(value)
  }
}

function stripRuntimeObjectUrl(value: string | undefined): string | undefined {
  return isRuntimeObjectUrl(value) ? undefined : value
}

function isRuntimeObjectUrl(value: string | undefined): value is string {
  return typeof value === "string" && value.startsWith("blob:")
}
