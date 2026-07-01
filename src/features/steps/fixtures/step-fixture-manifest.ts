import type { StepFixtureManifestEntry } from "./step-fixture-types"

const sourceSpecPath = "tests/fixtures/steps/sources/step-fixture-sources.ts"

export const stepFixtureManifest = [
  {
    id: "simple-blue-callouts",
    sourceKind: "synthetic",
    sourceSpecPath,
    generatedPdfPath: "tests/fixtures/steps/generated/simple-blue-callouts.pdf",
    expectedPath: "tests/fixtures/steps/expected/simple-blue-callouts.json",
    purpose: "small upload and detector smoke fixture with bordered callouts and varied fills",
    browserE2eCandidate: true,
  },
  {
    id: "multi-page-multi-callout",
    sourceKind: "synthetic",
    sourceSpecPath,
    generatedPdfPath: "tests/fixtures/steps/generated/multi-page-multi-callout.pdf",
    expectedPath: "tests/fixtures/steps/expected/multi-page-multi-callout.json",
    purpose: "page coverage and callout ordering across several pages",
    browserE2eCandidate: false,
  },
  {
    id: "repeated-step-multiplier",
    sourceKind: "synthetic",
    sourceSpecPath,
    generatedPdfPath: "tests/fixtures/steps/generated/repeated-step-multiplier.pdf",
    expectedPath: "tests/fixtures/steps/expected/repeated-step-multiplier.json",
    purpose: "baseline for repeated-step multiplier handling",
    browserE2eCandidate: false,
  },
  {
    id: "noisy-false-positive",
    sourceKind: "synthetic",
    sourceSpecPath,
    generatedPdfPath: "tests/fixtures/steps/generated/noisy-false-positive.pdf",
    expectedPath: "tests/fixtures/steps/expected/noisy-false-positive.json",
    purpose: "false-positive pressure from callout-like decorations",
    browserE2eCandidate: false,
  },
  {
    id: "quantity-and-crop-units",
    sourceKind: "synthetic",
    sourceSpecPath,
    generatedPdfPath: "tests/fixtures/steps/generated/quantity-and-crop-units.pdf",
    expectedPath: "tests/fixtures/steps/expected/quantity-and-crop-units.json",
    purpose: "targeted quantity-label and part-crop unit fixture",
    browserE2eCandidate: false,
  },
] as const satisfies readonly StepFixtureManifestEntry[]
