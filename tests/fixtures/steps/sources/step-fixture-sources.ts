import type {
  StepFixtureColor,
  StepFixtureRegion,
  SyntheticLDrawPartId,
  SyntheticStepFixtureSource,
} from "../../../../src/features/steps/fixtures/step-fixture-types"

const defaultCalloutFill = "#f7edcf"
const defaultCalloutStroke = "#111111"
const renderWidth = 1200

const calloutFills = {
  blue: "#e5f2ff",
  cream: "#f7edcf",
  yellow: "#fff1ad",
  white: "#ffffff",
} as const

const colors = {
  black: color("Black", "#1b1c1e", "black"),
  blue: color("Bright Blue", "#0055bf", "blue"),
  green: color("Bright Green", "#4b9f4a", "green"),
  red: color("Bright Red", "#c91a09", "red"),
  tan: color("Brick Yellow", "#dec69c", "tan"),
  yellow: color("Bright Yellow", "#f2cd37", "yellow"),
} as const

export const syntheticStepFixtureSources: SyntheticStepFixtureSource[] = [
  {
    id: "simple-blue-callouts",
    purpose: "small upload and detector smoke fixture with bordered callouts and varied fills",
    renderWidth,
    browserE2eCandidate: true,
    pages: [
      page("Cover render before first build step", []),
      page("Simple bordered callouts", [
        callout("simple-page-1-callout-1", box(60, 120, 250, 126), [
          row("simple-1-red-plate", "2x", 2, box(88, 145, 70, 46), "3023-plate-1x2", colors.red),
          row("simple-1-blue-tile", "1x", 1, box(202, 145, 70, 46), "3069b-tile-1x2", colors.blue),
        ], { fill: calloutFills.cream }),
        callout("simple-page-1-callout-2", box(330, 330, 210, 122), [
          row("simple-2-green-bar", "4x", 4, box(392, 352, 92, 42), "3710-plate-1x4", colors.green),
        ], { fill: calloutFills.blue }),
      ]),
    ],
  },
  {
    id: "multi-page-multi-callout",
    purpose: "page coverage and callout ordering across several pages",
    renderWidth,
    browserE2eCandidate: false,
    pages: [
      page("Multi page 1", [
        callout("multi-page-1-callout-1", box(56, 110, 205, 118), [
          row("multi-1-red", "1x", 1, box(130, 132, 64, 42), "3023-plate-1x2", colors.red),
        ]),
        callout("multi-page-1-callout-2", box(330, 118, 205, 118), [
          row("multi-2-blue", "3x", 3, box(404, 140, 64, 42), "3069b-tile-1x2", colors.blue),
        ]),
      ]),
      page("Multi page 2 has no callouts", [], [
        trap("multi-page-2-frame", box(80, 210, 410, 220), "instruction frame", "#ffffff", "#9aa5b1"),
      ]),
      page("Multi page 3", [
        callout("multi-page-3-callout-1", box(58, 96, 200, 118), [
          row("multi-3-green", "2x", 2, box(118, 118, 84, 38), "3710-plate-1x4", colors.green),
        ], { fill: calloutFills.yellow }),
        callout("multi-page-3-callout-2", box(318, 100, 205, 118), [
          row("multi-4-tan", "6x", 6, box(392, 122, 64, 42), "3023-plate-1x2", colors.tan),
        ], { fill: calloutFills.white }),
        callout("multi-page-3-zero-part", box(190, 300, 210, 74), [], { baggable: false, label: "0 visible parts" }),
      ]),
    ],
  },
  {
    id: "repeated-step-multiplier",
    purpose: "baseline for repeated-step multiplier handling",
    renderWidth,
    browserE2eCandidate: false,
    pages: [
      page("Repeated step multiplier", [
        callout("repeat-callout-base", box(68, 130, 252, 126), [
          row("repeat-red-plate", "2x", 2, box(96, 155, 70, 46), "3023-plate-1x2", colors.red),
          row("repeat-black-pin", "1x", 1, box(210, 155, 46, 46), "6141-round-plate-1x1", colors.black),
        ]),
        callout("repeat-callout-multiplied", box(330, 328, 220, 130), [
          row("repeat-yellow-tile", "3x", 3, box(408, 368, 70, 42), "3069b-tile-1x2", colors.yellow),
        ], { expectedMultiplier: 2, label: "Repeat this step 2x" }),
      ]),
    ],
  },
  {
    id: "noisy-false-positive",
    purpose: "false-positive pressure from callout-like decorations",
    renderWidth,
    browserE2eCandidate: false,
    pages: [
      page("Noisy false-positive traps", [
        callout("noisy-real-callout", box(70, 112, 218, 120), [
          row("noisy-real-blue", "2x", 2, box(136, 138, 88, 40), "3710-plate-1x4", colors.blue),
        ]),
      ], [
        trap("noisy-title-panel", box(336, 96, 190, 66), "blue title panel", "#dff0ff", "#2f74b5"),
        trap("noisy-empty-box", box(72, 320, 220, 90), "empty callout-like box", "#eef7ff", "#2f74b5"),
        trap("noisy-model-frame", box(330, 300, 190, 176), "model frame", "#ffffff", "#2f74b5"),
        trap("noisy-label-chip", box(92, 520, 108, 38), "page label chip", "#e5f2ff", "#2f74b5"),
      ]),
    ],
  },
  {
    id: "quantity-and-crop-units",
    purpose: "targeted quantity-label and part-crop unit fixture",
    renderWidth,
    browserE2eCandidate: false,
    pages: [
      page("Quantity and crop unit cases", [
        callout("quantity-crop-callout-1", box(62, 118, 280, 128), [
          row("quantity-12-red", "12x", 12, box(98, 146, 68, 44), "3023-plate-1x2", colors.red),
          row("quantity-10-green", "10x", 10, box(220, 148, 84, 40), "3710-plate-1x4", colors.green),
        ]),
        callout("quantity-crop-callout-2", box(330, 334, 220, 122), [
          row("quantity-tight-blue", "8x", 8, box(416, 360, 42, 42), "6141-round-plate-1x1", colors.blue),
        ]),
      ]),
    ],
  },
]

function page(
  title: string,
  callouts: ReturnType<typeof callout>[],
  falsePositiveTraps: ReturnType<typeof trap>[] = [],
) {
  return {
    width: 600,
    height: 800,
    title,
    callouts,
    falsePositiveTraps,
  }
}

function callout(
  id: string,
  region: StepFixtureRegion,
  partRows: ReturnType<typeof row>[],
  options: {
    baggable?: boolean
    expectedMultiplier?: number
    fill?: string
    label?: string
    stroke?: string
  } = {},
) {
  return {
    id,
    region,
    fill: options.fill ?? defaultCalloutFill,
    stroke: options.stroke ?? defaultCalloutStroke,
    partRows,
    baggable: options.baggable,
    expectedMultiplier: options.expectedMultiplier,
    label: options.label,
  }
}

function row(
  id: string,
  quantityText: string,
  quantityValue: number,
  partRegion: StepFixtureRegion,
  ldrawPartId: SyntheticLDrawPartId,
  colorValue: StepFixtureColor,
) {
  return {
    id,
    quantityText,
    quantityValue,
    quantityLabelRegion: quantityBelowPart(quantityText, partRegion),
    partRegion,
    color: colorValue,
    ldrawPartId,
    imageSignatureId: `${id}-signature`,
  }
}

function trap(
  id: string,
  region: StepFixtureRegion,
  label: string,
  fill: string,
  stroke: string,
) {
  return { id, region, label, fill, stroke }
}

function box(x: number, y: number, width: number, height: number): StepFixtureRegion {
  return { x, y, width, height }
}

function quantityBelowPart(quantityText: string, partRegion: StepFixtureRegion): StepFixtureRegion {
  const width = quantityText.length >= 3 ? 44 : 34

  return {
    x: Math.round(partRegion.x + (partRegion.width - width) / 2),
    y: partRegion.y + partRegion.height + 8,
    width,
    height: 18,
  }
}

function color(name: string, hex: string, family: string): StepFixtureColor {
  return {
    name,
    hex,
    rgb: hexToRgb(hex),
    family,
  }
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "")

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}
