import { describe, expect, it } from "vitest"
import {
  detectStepCalloutPageCandidates,
  detectStepCallouts,
  inferStepCalloutEvidenceManualStyle,
  resolveStepCalloutsFromPageEvidence,
  scoreStepCalloutPageEvidence,
} from "../detector"
import { createStepCalloutPageInput } from "../page-input"

describe("detectStepCallouts", () => {
  it("matches the staged page-local detector flow", () => {
    const pages = [
      createBlankPage(1),
      createBlankPage(2),
    ]
    const candidates = pages.flatMap(detectStepCalloutPageCandidates)
    const manualStyle = inferStepCalloutEvidenceManualStyle(pages, candidates)
    const evidence = pages.flatMap((page) =>
      scoreStepCalloutPageEvidence(
        page,
        candidates.filter((candidate) => candidate.pageNumber === page.pageNumber),
        manualStyle,
      ),
    )

    expect(resolveStepCalloutsFromPageEvidence(pages, candidates, evidence))
      .toEqual(detectStepCallouts(pages))
  })
})

function createBlankPage(pageNumber: number) {
  const width = 64
  const height = 48
  const data = new Uint8ClampedArray(width * height * 4)

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255
    data[index + 1] = 255
    data[index + 2] = 255
    data[index + 3] = 255
  }

  return createStepCalloutPageInput({
    data,
    height,
    pageNumber,
    width,
  })
}
