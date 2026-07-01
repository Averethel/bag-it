import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"
import type { PreviewGenerationProgress } from "@/features/steps/preview-scheduler"

export const RUNTIME_PREVIEW_TARGET_WIDTH = 2200

export function readPreviewGenerationPageNumbers(result: StepCalloutDetectionResult): number[] {
  const orderedPageNumbers = new Set<number>(result.scannedPageNumbers)

  for (const preview of result.pagePreviews) {
    orderedPageNumbers.add(preview.pageNumber)
  }
  for (const callout of result.callouts) {
    orderedPageNumbers.add(callout.pageNumber)
  }

  return [...orderedPageNumbers]
}

export function readCriticalPreviewPageNumbers(result: StepCalloutDetectionResult): number[] {
  const firstCalloutPageNumber = result.callouts[0]?.pageNumber
  const firstSixPages = result.scannedPageNumbers.slice(0, 6)

  return [
    ...new Set([
      ...(firstCalloutPageNumber ? [firstCalloutPageNumber] : []),
      ...firstSixPages,
    ]),
  ]
}

export function readPartMaskRequestsForPages(
  result: StepCalloutDetectionResult,
  pageNumbers: readonly number[],
) {
  const pageNumberSet = new Set(pageNumbers)

  return result.callouts
    .filter((callout) => pageNumberSet.has(callout.pageNumber))
    .flatMap((callout) =>
      callout.partItems
        .filter((partItem) => partItem.partImage?.alphaMask)
        .map((partItem) => ({
          pageNumber: callout.pageNumber,
          partItem,
        })),
    )
}

export function createPreviewGenerationProgress(
  result: StepCalloutDetectionResult,
  activePage: number | null,
  hydratedPreviewPageCount: number,
  targetPreviewPageCount: number,
): PreviewGenerationProgress {
  const percentage = targetPreviewPageCount > 0
    ? Math.round((hydratedPreviewPageCount / targetPreviewPageCount) * 100)
    : 100

  return {
    activePage,
    hydratedPreviewPageCount,
    hydratedMaskCount: 0,
    message: activePage
      ? `Generating previews for page ${activePage}.`
      : hydratedPreviewPageCount >= targetPreviewPageCount
        ? "Preview generation complete."
        : "Preparing previews.",
    percentage,
    phase: "preview-hydration",
    targetMaskCount: 0,
    targetPreviewPageCount,
  }
}

export function throwIfPreviewAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Preview generation cancelled.", "AbortError")
  }
}
