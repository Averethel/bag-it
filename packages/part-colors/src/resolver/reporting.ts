import type { PartColorCalibrationResult } from "../contracts"

export interface ResolverReportSummary {
  classes: number
  detectedRows: number
  rawClasses: number
  skippedRows: number
}

export function summarizeResolverResult(result: PartColorCalibrationResult): ResolverReportSummary {
  return {
    classes: result.classes.length,
    detectedRows: result.colorsByPartId.size,
    rawClasses: result.rawClasses?.length ?? result.classes.length,
    skippedRows: result.skippedPartIds.length,
  }
}
