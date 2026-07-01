import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  BagsChecklistPanel,
  type PartMatchPrecomputeState,
} from "./bags-checklist-panel"
import { Provider } from "@/components/ui/provider"
import type {
  StepCalloutBaggingPlan,
  StepCalloutBagRow,
} from "@/features/bagging/step-callout-bagging"
import { createPreviewAssetStore } from "@/features/steps/preview-assets"

const EMPTY_PART_MATCH_PRECOMPUTE: PartMatchPrecomputeState = {
  groupsByBagId: new Map(),
  progress: null,
  status: "idle",
}

describe("BagsChecklistPanel", () => {
  it("lazy-mounts collapsed large checklist tables", async () => {
    const user = userEvent.setup()
    const { plan, rows } = createLargeChecklistFixture()

    render(
      <Provider>
        <BagsChecklistPanel
          checkedRowIds={new Set()}
          partMatchPrecompute={EMPTY_PART_MATCH_PRECOMPUTE}
          plan={plan}
          previewAssetStore={createPreviewAssetStore()}
          rows={rows}
          onRowCheckedChange={vi.fn()}
        />
      </Provider>,
    )

    expect(screen.getByText("Lazy color 1")).toBeInTheDocument()
    expect(screen.queryByText("Lazy color 200")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Bag 2/ }))

    expect(await screen.findByText("Lazy color 200")).toBeInTheDocument()
  })

  it("does not rerender unrelated checklist sections when one row changes", () => {
    const { plan, rows } = createTwoBagChecklistFixture()
    const previewAssetStore = createPreviewAssetStore()
    const onRowCheckedChange = vi.fn()
    let unrelatedColorReadCount = 0

    Object.defineProperty(rows[1]!.color, "name", {
      configurable: true,
      get: () => {
        unrelatedColorReadCount += 1
        return "Unrelated color"
      },
    })

    const view = render(
      <Provider>
        <BagsChecklistPanel
          checkedRowIds={new Set()}
          partMatchPrecompute={EMPTY_PART_MATCH_PRECOMPUTE}
          plan={plan}
          previewAssetStore={previewAssetStore}
          rows={rows}
          onRowCheckedChange={onRowCheckedChange}
        />
      </Provider>,
    )

    expect(screen.getByText("Unrelated color")).toBeInTheDocument()
    unrelatedColorReadCount = 0

    view.rerender(
      <Provider>
        <BagsChecklistPanel
          checkedRowIds={new Set([rows[0]!.id])}
          partMatchPrecompute={EMPTY_PART_MATCH_PRECOMPUTE}
          plan={plan}
          previewAssetStore={previewAssetStore}
          rows={rows}
          onRowCheckedChange={onRowCheckedChange}
        />
      </Provider>,
    )

    expect(unrelatedColorReadCount).toBe(0)
  })
})

function createTwoBagChecklistFixture(): {
  plan: StepCalloutBaggingPlan
  rows: StepCalloutBagRow[]
} {
  const firstRows = createRowsForBag({
    bagId: "bag-1",
    bagLabel: "Bag 1",
    bagNumber: 1,
    endIndex: 1,
    pageLabel: "Page 1",
    startIndex: 1,
  })
  const secondRows = createRowsForBag({
    bagId: "bag-2",
    bagLabel: "Bag 2",
    bagNumber: 2,
    endIndex: 2,
    pageLabel: "Page 2",
    startIndex: 2,
  })
  const rows = [...firstRows, ...secondRows]

  return {
    plan: createChecklistPlan([
      createPlanBag({
        id: "bag-1",
        label: "Bag 1",
        number: 1,
        pageLabel: "Page 1",
        partCount: firstRows.length,
      }),
      createPlanBag({
        id: "bag-2",
        label: "Bag 2",
        number: 2,
        pageLabel: "Page 2",
        partCount: secondRows.length,
      }),
    ], rows.length),
    rows,
  }
}

function createLargeChecklistFixture(): {
  plan: StepCalloutBaggingPlan
  rows: StepCalloutBagRow[]
} {
  const firstRows = createRowsForBag({
    bagId: "bag-1",
    bagLabel: "Bag 1",
    bagNumber: 1,
    endIndex: 130,
    pageLabel: "Pages 1-130",
    startIndex: 1,
  })
  const secondRows = createRowsForBag({
    bagId: "bag-2",
    bagLabel: "Bag 2",
    bagNumber: 2,
    endIndex: 260,
    pageLabel: "Pages 131-260",
    startIndex: 131,
  })
  const rows = [...firstRows, ...secondRows]

  return {
    plan: createChecklistPlan(
      [
        createPlanBag({
          id: "bag-1",
          label: "Bag 1",
          number: 1,
          pageLabel: "Pages 1-130",
          partCount: firstRows.length,
        }),
        createPlanBag({
          id: "bag-2",
          label: "Bag 2",
          number: 2,
          pageLabel: "Pages 131-260",
          partCount: secondRows.length,
        }),
      ],
      rows.length,
    ),
    rows,
  }
}

function createChecklistPlan(
  bags: StepCalloutBaggingPlan["bags"],
  rowCount: number,
): StepCalloutBaggingPlan {
  return {
    bags,
    detectedPartCount: rowCount,
    detectedStepCount: rowCount,
    heuristicVersion: "step-callout-bagging-v6",
    policy: {
      band: "large",
      maxParts: 170,
      maxTargetSteps: 14,
      minParts: 95,
      overfillToleranceParts: 25,
      source: "detected-callout-quantity",
      targetParts: 130,
      targetSteps: 14,
      tinyBagThreshold: 12,
    },
    rawPartRowCount: rowCount,
    setPieceCount: rowCount,
  }
}

function createPlanBag({
  id,
  label,
  number,
  pageLabel,
  partCount,
}: {
  id: string
  label: string
  number: number
  pageLabel: string
  partCount: number
}): StepCalloutBaggingPlan["bags"][number] {
  return {
    callouts: [],
    id,
    label,
    number,
    pageRange: {
      end: number === 1 ? 130 : 260,
      label: pageLabel,
      pages: [],
      start: number === 1 ? 1 : 131,
    },
    partCount,
    reviewReasons: [],
    status: "draft",
    stepRange: {
      end: number === 1 ? 130 : 260,
      start: number === 1 ? 1 : 131,
    },
    unknownQuantityCount: 0,
  }
}

function createRowsForBag({
  bagId,
  bagLabel,
  bagNumber,
  endIndex,
  pageLabel,
  startIndex,
}: {
  bagId: string
  bagLabel: string
  bagNumber: number
  endIndex: number
  pageLabel: string
  startIndex: number
}): StepCalloutBagRow[] {
  return Array.from({ length: endIndex - startIndex + 1 }, (_value, index) => {
    const itemIndex = startIndex + index
    const region = {
      height: 10,
      width: 10,
      x: itemIndex,
      y: itemIndex,
    }

    return {
      anchor: {
        calloutRegion: region,
        itemIndexOnCallout: itemIndex,
        manualFingerprint: "manual",
        pageNumber: itemIndex,
        pageRenderHeight: 140,
        pageRenderWidth: 100,
        partRegion: region,
      },
      bagId,
      bagLabel,
      bagNumber,
      bagPageLabel: pageLabel,
      calloutBackgroundHex: "#ffffff",
      calloutCrop: null,
      calloutId: `callout-${itemIndex}`,
      calloutIndexOnPage: 0,
      color: {
        confidence: 1,
        family: "lazy",
        key: `lazy-color-${itemIndex}`,
        manualClassId: null,
        manualClassTrusted: false,
        name: `Lazy color ${itemIndex}`,
        status: "exact",
        swatchHex: "#6C6E68",
      },
      id: `${bagId}-row-${itemIndex}`,
      itemId: `${bagId}-item-${itemIndex}`,
      itemIndexOnCallout: itemIndex,
      pagePreview: null,
      partCrop: null,
      partImageAlphaMask: null,
      quantity: 1,
      quantityEstimated: false,
      quantityLabelCrop: null,
      quantityText: "1",
      sourcePageNumber: itemIndex,
      stepIndex: itemIndex,
    }
  })
}
