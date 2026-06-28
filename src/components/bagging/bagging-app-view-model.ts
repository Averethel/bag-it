import type { UploadMessage } from "./upload-card"
import { countDetectedPartItems } from "./bagging-analysis-result"
import type { PdfIntakeState, PartExtractionState } from "./bagging-app-types"
import type { StepCalloutBaggingPlan } from "@/features/bagging/step-callout-bagging"
import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"
import { COUNT_LABELS, formatCount } from "@/lib/count-format"

export function createUploadMessage({
  error,
  notice,
  partExtractionState,
  staleStepDetectionResult,
}: {
  error: string | null
  notice: string | null
  partExtractionState: PartExtractionState
  staleStepDetectionResult: StepCalloutDetectionResult | null
}): UploadMessage | null {
  if (error) {
    return { text: error, tone: "error" }
  }

  if (staleStepDetectionResult) {
    return { text: "Detector changed. Recalculating step callouts.", tone: "info" }
  }

  if (partExtractionState.status === "processing") {
    return { text: "Extracting part rows from step callouts.", tone: "info" }
  }

  return notice ? { text: notice, tone: "info" } : null
}

export function createAttentionIssues({
  baggingPlan,
  staleStepDetectionResult,
  stepDetectionResult,
}: {
  baggingPlan: StepCalloutBaggingPlan | null
  staleStepDetectionResult: StepCalloutDetectionResult | null
  stepDetectionResult: StepCalloutDetectionResult | null
}): string[] {
  const attentionIssues: string[] = []

  if (staleStepDetectionResult) {
    attentionIssues.push("Detector changed; saved step analysis is being recalculated.")
  }

  if (stepDetectionResult && stepDetectionResult.callouts.length === 0) {
    attentionIssues.push("No step callouts detected.")
  }

  if (
    baggingPlan &&
    baggingPlan.bags.length === 0 &&
    stepDetectionResult &&
    countDetectedPartItems(stepDetectionResult) === 0
  ) {
    attentionIssues.push("No baggable callout parts detected.")
  }

  if (baggingPlan) {
    const reviewBagCount = baggingPlan.bags.filter((bag) => bag.status === "review").length

    if (reviewBagCount > 0) {
      attentionIssues.push(
        `${formatCount(reviewBagCount, COUNT_LABELS.bag)} need review before packing.`,
      )
    }
  }

  return attentionIssues
}

export function createManualFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function readMetadata(intakeState: PdfIntakeState) {
  return intakeState.status === "ready" ? intakeState.metadata : null
}
