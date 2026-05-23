import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  stepCalloutDetectorVersion,
  type StepCalloutDetectionResult,
} from "@/features/bagging/step-callout-detection"
import { renderWithProvider } from "@/test/render"
import { StepCalloutDebugPanel, StepCalloutMatchingDebugPanel, StepCalloutsPanel } from "./step-callouts-panel"

describe("StepCalloutsPanel", () => {
  it("renders detected step parts as a bag checklist grouped by bag or color", async () => {
    const user = userEvent.setup()

    renderWithProvider(<StepCalloutsPanel inventoryPartCount={480} result={createResult()} />)

    expect(screen.getByText("Bag checklist")).toBeVisible()
    expect(
      screen.getByText("1 draft bag from 2 callouts and 5 detected parts across 2 pages; full non-inventory manual."),
    ).toBeVisible()
    const diagnosticsPanel = screen.getByTestId("step-callout-quantity-diagnostics")
    expect(diagnosticsPanel).toHaveAttribute("data-bom-part-count", "480")
    expect(diagnosticsPanel).toHaveAttribute("data-detected-part-count", "5")
    expect(diagnosticsPanel).toHaveAttribute("data-missing-part-count", "475")
    expect(screen.getByText("Step coverage needs attention")).toBeVisible()
    expect(screen.getByText("0 of 5 detected parts checked.")).toBeVisible()
    expect(screen.getByTestId("step-bag-completion-summary")).toHaveTextContent("0% packed")
    expect(screen.getByRole("button", { name: "Bag" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Color" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByTestId("step-local-match-debug")).not.toBeInTheDocument()
    expect(screen.queryByTestId("step-callout-bag")).not.toBeInTheDocument()

    const bagGroup = screen.getByTestId("step-bag-checklist-group")
    expect(bagGroup).toHaveAttribute("data-group-mode", "bag")
    expect(bagGroup).toHaveAttribute("data-completion-percent", "0")
    expect(bagGroup).toHaveAttribute("data-row-count", "3")
    expect(bagGroup).toHaveAttribute("data-total-quantity", "5")
    expect(screen.getByText("Bag 1 · Steps 1-2")).toBeVisible()
    expect(screen.getByText("3 rows · Steps 1-2")).toBeVisible()

    const rows = screen.getAllByTestId("step-bag-part-row")
    expect(rows).toHaveLength(3)
    const greenRows = rows.filter((row) => row.getAttribute("data-color-name") === "Green")
    expect(greenRows).toHaveLength(2)
    expect(greenRows.map((row) => row.getAttribute("data-bag-number"))).toEqual(["1", "1"])
    expect(greenRows.map((row) => row.getAttribute("data-quantity"))).toEqual(["1", "2"])
    expect(greenRows.map((row) => row.getAttribute("data-step-indexes"))).toEqual(["1", "2"])
    expect(screen.getByRole("img", { name: "Detected part crop for Bag 1 step 1 item 1" })).toBeVisible()
    expect(screen.getByText("Step")).toBeVisible()
    expect(screen.queryByRole("button", { name: /Sort by Step/ })).not.toBeInTheDocument()
    expect(within(greenRows[0]!).getByTestId("step-callout-preview-step")).toHaveTextContent("1")
    expect(within(greenRows[1]!).getByTestId("step-callout-preview-step")).toHaveTextContent("2")

    const greenCheckbox = screen.getByRole("checkbox", {
      name: "Mark Bag 1 Green part from step 1 as packed",
    })
    expect(greenCheckbox).not.toBeChecked()
    await user.click(greenCheckbox)
    expect(greenCheckbox).toBeChecked()
    expect(screen.getByText("1 of 5 detected parts checked.")).toBeVisible()
    expect(screen.getByTestId("step-bag-completion-summary")).toHaveTextContent("20% packed")
    expect(bagGroup).toHaveAttribute("data-completion-percent", "20")

    await user.click(screen.getByRole("button", { name: "Color" }))
    expect(screen.getByRole("button", { name: "Bag" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Color" })).toHaveAttribute("aria-pressed", "true")
    const colorGroups = screen.getAllByTestId("step-bag-checklist-group")
    expect(colorGroups).toHaveLength(2)
    expect(colorGroups[0]).toHaveAttribute("data-group-mode", "color")
    expect(screen.getAllByText("Dark Bluish Gray").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Green").length).toBeGreaterThan(0)
    const greenGroup = colorGroups.find((group) => group.getAttribute("data-group-id") === "color:green")
    expect(greenGroup).toBeDefined()
    expect(greenGroup).toHaveAttribute("data-row-count", "2")
    expect(greenGroup).toHaveAttribute("data-total-quantity", "3")
    expect(screen.getByText("2 rows · Bags 1")).toBeVisible()
    expect(screen.getByText("1 row · Bags 1")).toBeVisible()
    expect(screen.getAllByTestId("step-bag-part-row")).toHaveLength(3)
    expect(screen.queryByRole("button", { name: /Sort by Qty/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Sort by Bag/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Sort by Color/ })).not.toBeInTheDocument()
    expect(screen.getAllByTestId("part-checklist-group-divider").map((divider) => divider.textContent)).toEqual([
      "Bag 1 · Steps 1-2",
      "Bag 1 · Steps 1-2",
    ])
  })

  it("supports hover enlargement and folding checklist groups", async () => {
    const user = userEvent.setup()

    renderWithProvider(<StepCalloutsPanel inventoryPartCount={480} result={createResult()} />)

    const group = screen.getByTestId("step-bag-checklist-group")
    expect(group).toHaveAttribute("data-state", "open")
    expect(screen.getAllByTestId("step-bag-part-row")).toHaveLength(3)

    await user.hover(screen.getByRole("img", { name: "Detected part crop for Bag 1 step 1 item 1" }))
    expect(await screen.findByRole("img", { name: "Detected part crop for Bag 1 step 1 item 1 enlarged" })).toBeVisible()

    const firstRow = screen.getAllByTestId("step-bag-part-row")[0]!
    await user.hover(within(firstRow).getByTestId("step-callout-preview-step"))
    expect(await screen.findByRole("img", { name: "Step 1 callout preview" })).toBeVisible()

    const groupTrigger = screen.getByRole("button", { name: /Bag 1 · Steps 1-2/ })

    await user.click(groupTrigger)
    expect(group).toHaveAttribute("data-state", "closed")
    expect(groupTrigger).toHaveAttribute("aria-expanded", "false")

    await user.click(groupTrigger)
    expect(group).toHaveAttribute("data-state", "open")
    expect(groupTrigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getAllByTestId("step-bag-part-row")).toHaveLength(3)
  })

  it("uses one color group across multiple bags", async () => {
    const user = userEvent.setup()
    const result = createMultiBagSameColorResult()

    renderWithProvider(<StepCalloutsPanel inventoryPartCount={100} result={result} />)

    const bagGroups = screen.getAllByTestId("step-bag-checklist-group")
    expect(bagGroups).toHaveLength(2)
    expect(bagGroups.map((group) => group.getAttribute("data-group-mode"))).toEqual(["bag", "bag"])

    await user.click(screen.getByRole("button", { name: "Color" }))

    const colorGroups = screen.getAllByTestId("step-bag-checklist-group")
    expect(colorGroups).toHaveLength(1)
    expect(colorGroups[0]).toHaveAttribute("data-group-mode", "color")
    expect(colorGroups[0]).toHaveAttribute("data-group-id", "color:green")
    expect(colorGroups[0]).toHaveAttribute("data-row-count", "2")
    expect(colorGroups[0]).toHaveAttribute("data-total-quantity", "100")
    expect(screen.getByText("2 rows · Bags 1, 2")).toBeVisible()
    expect(screen.getAllByTestId("part-checklist-group-divider").map((divider) => divider.textContent)).toEqual([
      "Bag 1 · Step 1",
      "Bag 2 · Step 2",
    ])
    expect(screen.getAllByTestId("step-bag-part-row").map((row) => row.getAttribute("data-bag-number"))).toEqual([
      "1",
      "2",
    ])
  })

  it("multiplies step quantities for checklist totals and row quantities", () => {
    renderWithProvider(
      <StepCalloutsPanel
        calloutMultipliers={{ "step-callout:p1:r1": 2 }}
        inventoryPartCount={480}
        result={createResult()}
      />,
    )

    expect(
      screen.getByText("1 draft bag from 2 callouts and 8 detected parts across 2 pages; full non-inventory manual."),
    ).toBeVisible()
    expect(screen.getByText("0 of 8 detected parts checked.")).toBeVisible()
    expect(screen.getByTestId("step-bag-checklist-group")).toHaveAttribute("data-total-quantity", "8")
    expect(screen.getByTestId("step-callout-quantity-diagnostics")).toHaveAttribute("data-missing-part-count", "472")
    expect(screen.getAllByTestId("step-bag-part-row").map((row) => row.getAttribute("data-quantity"))).toEqual([
      "4",
      "2",
      "2",
    ])
    expect(screen.getAllByTestId("step-bag-part-row").map((row) => row.getAttribute("data-step-multiplier"))).toEqual([
      "2",
      "2",
      "1",
    ])
    expect(screen.getAllByTestId("step-bag-part-row").map((row) => row.getAttribute("data-row-id")?.includes(":m2:"))).toEqual([
      true,
      true,
      false,
    ])
  })

  it("warns when multiplier-adjusted step quantities exceed the BOM quantity", () => {
    renderWithProvider(<StepCalloutsPanel inventoryPartCount={4} result={createResult()} />)

    const diagnosticsPanel = screen.getByTestId("step-callout-quantity-diagnostics")
    expect(diagnosticsPanel).toHaveAttribute("data-diagnostic-kind", "overage")
    expect(diagnosticsPanel).toHaveAttribute("data-bom-part-count", "4")
    expect(diagnosticsPanel).toHaveAttribute("data-detected-part-count", "5")
    expect(diagnosticsPanel).toHaveAttribute("data-missing-part-count", "0")
    expect(diagnosticsPanel).toHaveAttribute("data-overage-part-count", "1")
    expect(screen.getByText("Step quantity exceeds BOM")).toBeVisible()
    expect(screen.getByText("1 extra")).toBeVisible()
    expect(screen.getByText("Extra quantity")).toBeVisible()
  })

  it("moves callout crops and local match diagnostics to the debug panel", () => {
    renderWithProvider(<StepCalloutDebugPanel inventoryPartCount={480} result={createResult()} />)

    expect(screen.getByTestId("step-callout-debug-panel")).toBeVisible()
    expect(screen.getByTestId("step-callout-bag-debug-section")).toBeVisible()
    expect(screen.getByText("Detected callout debug")).toBeVisible()
    expect(screen.getByTestId("step-callout-bag")).toHaveAttribute("data-step-range", "1-2")
    expect(screen.getByTestId("step-callout-bag")).toHaveAttribute("data-page-range", "1-3")
    expect(screen.getByTestId("step-callout-bag")).toHaveAttribute("data-part-count", "5")
    expect(screen.getByTestId("step-callout-bag")).toHaveAttribute("data-policy-set-size", "small")
    expect(screen.getByRole("img", { name: "Step callout 1 on page 1" })).toBeVisible()
    expect(screen.getByRole("img", { name: "Step callout 1 on page 3" })).toBeVisible()
    expect(screen.getAllByTestId("step-callout-card")[0]).toHaveAttribute("data-page-number", "1")
    expect(screen.getAllByTestId("step-callout-card")[0]).toHaveAttribute("data-step-index", "1")
    expect(screen.getAllByTestId("step-callout-card")[0]).toHaveAttribute("data-part-type-count", "2")
    expect(screen.getByText("Step 1 · Page 1")).toBeVisible()
    expect(screen.getByText("Parts in this bag")).toBeVisible()
    expect(screen.getByText("Local part 2")).toBeVisible()
    expect(screen.getAllByRole("img", { name: "Callout crop for Local part 2" })[0]).toBeVisible()
    expect(screen.queryByText("Rebrickable")).not.toBeInTheDocument()
    expect(screen.queryByText("3005")).not.toBeInTheDocument()

    expect(screen.getByTestId("step-local-match-debug")).toBeVisible()
    expect(screen.getByText("Local match debug")).toBeVisible()
    expect(screen.getByText("1 grouped match · 1 single item")).toBeVisible()
    const debugGroups = screen.getAllByTestId("step-local-match-debug-group")
    expect(debugGroups).toHaveLength(2)
    expect(debugGroups[0]).toHaveAttribute("data-status", "grouped")
    expect(debugGroups[0]).toHaveAttribute("data-item-count", "2")
    expect(debugGroups[0]).toHaveAttribute("data-signature-status", "legacy")
    expect(debugGroups[0]).toHaveAttribute("data-step-indexes", "1,2")
    expect(screen.getAllByTestId("step-local-match-debug-item")).toHaveLength(3)
    expect(screen.getByRole("img", { name: "Local match crop step 1 item 1" })).toBeVisible()
    expect(screen.getByText("Rejected matches")).toBeVisible()
    expect(screen.getByTestId("step-local-match-rejection")).toHaveAttribute("data-reason", "foreground shape below 74%")
    expect(screen.getByRole("img", { name: "Rejected local match candidate step 2 item 1" })).toBeVisible()
  })

  it("renders page-grouped callout matching diagnostics with page previews shown by default", async () => {
    const user = userEvent.setup()
    const result = createResult()
    result.callouts[0].pageNumber = 3
    result.callouts[0].stepIndex = 2
    result.callouts[1].pageNumber = 1
    result.callouts[1].stepIndex = 1

    renderWithProvider(
      <StepCalloutMatchingDebugPanel
        pageRenders={[
          {
            dataUrl: "data:image/png;base64,page-three-full",
            height: 1000,
            pageNumber: 3,
            renderKind: "canvas",
            width: 700,
          },
        ]}
        result={result}
      />,
    )

    expect(screen.getByTestId("step-callout-matching-debug-panel")).toBeVisible()
    const partDiagnostic = screen.getByTestId("step-callout-part-diagnostic")
    expect(partDiagnostic).toHaveAttribute("data-part-type-count", "3")
    expect(partDiagnostic).toHaveAttribute("data-total-quantity", "5")
    expect(partDiagnostic).toHaveTextContent("3 part types represented · 5 total quantity")
    expect(screen.getByText("Build steps")).toBeVisible()
    expect(screen.getByText("2 callouts across 2 scanned pages.")).toBeVisible()
    expect(screen.getByTestId("step-callout-matching-debug-page-groups")).toBeVisible()
    expect(screen.getAllByTestId("step-callout-matching-debug-page-group").map((group) => group.dataset.pageNumber)).toEqual([
      "1",
      "3",
    ])
    expect(screen.getAllByTestId("step-callout-matching-debug-table")).toHaveLength(2)
    expect(screen.getAllByTestId("step-callout-matching-debug-row").map((row) => row.dataset.pageNumber)).toEqual([
      "1",
      "3",
    ])

    expect(screen.getAllByTestId("step-callout-matching-debug-row").map((row) => row.dataset.stepIndex)).toEqual([
      "1",
      "2",
    ])

    expect(screen.getByRole("img", { name: "Manual page 3 preview" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Preview page 3" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Preview step 2 label" })).not.toBeInTheDocument()

    await user.hover(screen.getByRole("button", { name: "Enlarge step 2 callout" }))
    expect(await screen.findByRole("img", { name: "Step 2 callout enlarged" })).toBeVisible()
  })

  it("lets build-step rows request multiplier changes", async () => {
    const user = userEvent.setup()
    const onCalloutMultiplierChange = vi.fn()

    renderWithProvider(
      <StepCalloutMatchingDebugPanel
        calloutMultipliers={{ "step-callout:p1:r1": 2 }}
        onCalloutMultiplierChange={onCalloutMultiplierChange}
        result={createResult()}
      />,
    )

    const rows = screen.getAllByTestId("step-callout-matching-debug-row")
    expect(rows[0]).toHaveAttribute("data-step-multiplier", "2")
    expect(rows[1]).toHaveAttribute("data-step-multiplier", "1")
    const partDiagnostic = screen.getByTestId("step-callout-part-diagnostic")
    expect(partDiagnostic).toHaveAttribute("data-part-type-count", "3")
    expect(partDiagnostic).toHaveAttribute("data-total-quantity", "8")
    expect(partDiagnostic).toHaveTextContent("3 part types represented · 8 total quantity")
    expect(screen.getAllByTestId("step-callout-multiplier-value").map((value) => value.textContent)).toEqual([
      "x2",
      "x1",
    ])
    expect(screen.getByRole("button", { name: "Decrease step 2 multiplier" })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Increase step 1 multiplier" }))
    expect(onCalloutMultiplierChange).toHaveBeenLastCalledWith("step-callout:p1:r1", 3)

    await user.click(screen.getByRole("button", { name: "Decrease step 1 multiplier" }))
    expect(onCalloutMultiplierChange).toHaveBeenLastCalledWith("step-callout:p1:r1", 1)
  })

  it("renders zero-part callouts in build steps diagnostics", () => {
    const result = createResult()
    result.callouts = [createZeroPartCallout(), ...result.callouts]
    result.scannedPageNumbers = [1, 3]

    renderWithProvider(<StepCalloutMatchingDebugPanel result={result} />)

    expect(screen.getByText("3 callouts across 2 scanned pages.")).toBeVisible()
    expect(screen.getAllByTestId("step-callout-matching-debug-row")).toHaveLength(3)
    expect(screen.getAllByText(/0 part types/)[0]).toBeVisible()
    expect(screen.getByText(/x889 y112 w178 h68/)).toBeVisible()
    expect(screen.getByText("Not bagged")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Increase step 8 multiplier" })).not.toBeInTheDocument()
  })

  it("loads missing page previews from the matching debug panel in batches", async () => {
    const loadPageRenders = vi.fn(async (pageNumbers: readonly number[]) =>
      pageNumbers.map((pageNumber) => ({
        dataUrl: `data:image/png;base64,page-${pageNumber}`,
        height: 1000,
        pageNumber,
        renderKind: "canvas" as const,
        width: 700,
      })),
    )

    const result = createResult()
    result.scannedPageNumbers = [1, 2, 3, 4]

    renderWithProvider(<StepCalloutMatchingDebugPanel loadPageRenders={loadPageRenders} result={result} />)

    await waitFor(() => expect(loadPageRenders).toHaveBeenNthCalledWith(1, [1, 2, 3]))
    await waitFor(() => expect(loadPageRenders).toHaveBeenNthCalledWith(2, [4]))
    expect(await screen.findByRole("img", { name: "Manual page 1 preview" })).toBeVisible()
    expect(screen.getByRole("img", { name: "Manual page 2 preview" })).toBeVisible()
    expect(screen.getByRole("img", { name: "Manual page 3 preview" })).toBeVisible()
    expect(screen.getByRole("img", { name: "Manual page 4 preview" })).toBeVisible()
  })

  it("renders scanned pages even when no build steps are detected on that page", () => {
    const result = createResult()
    result.scannedPageNumbers = [1, 2, 3]

    renderWithProvider(<StepCalloutMatchingDebugPanel result={result} />)

    expect(screen.getAllByTestId("step-callout-matching-debug-page-group").map((group) => group.dataset.pageNumber)).toEqual([
      "1",
      "2",
      "3",
    ])
    const rows = screen.getAllByTestId("step-callout-matching-debug-row")
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.dataset.pageNumber)).toEqual(["1", "3"])
    expect(screen.getByText("No build steps detected on this page.")).toBeVisible()
  })

  it("renders bag ranges from sorted callout order", () => {
    const result = createResult()
    result.callouts[0].stepIndex = 6
    result.callouts[1].stepIndex = 5

    renderWithProvider(<StepCalloutsPanel inventoryPartCount={480} result={result} />)

    expect(screen.getByText("Bag 1 · Steps 5-6")).toBeVisible()
    expect(screen.getByText("3 rows · Steps 5-6")).toBeVisible()
    expect(screen.getByTestId("step-bag-checklist-group")).toHaveAttribute("data-total-quantity", "5")
    expect(screen.getAllByTestId("step-bag-part-row")).toHaveLength(3)
    expect(screen.queryByTestId("step-callout-card")).not.toBeInTheDocument()
  })

  it("does not include zero-part callouts in bag checklist planning", () => {
    const result = createResult()
    result.callouts = [createZeroPartCallout(), ...result.callouts]

    renderWithProvider(<StepCalloutsPanel inventoryPartCount={480} result={result} />)

    expect(
      screen.getByText("1 draft bag from 2 callouts and 5 detected parts across 2 pages; full non-inventory manual."),
    ).toBeVisible()
    expect(screen.getAllByTestId("step-bag-part-row")).toHaveLength(3)
    expect(screen.queryByText(/0 part types/)).not.toBeInTheDocument()
  })
})

function createMultiBagSameColorResult(): StepCalloutDetectionResult {
  const result = createResult()

  return {
    ...result,
    callouts: result.callouts.map((callout, index) => ({
      ...callout,
      id: `step-callout:p${index + 1}:same-color`,
      indexOnPage: 1,
      pageNumber: index + 1,
      partItems: [
        {
          ...createPartItem(1, {
            item: { height: 58, width: 44, x: 24, y: 42 },
            part: { height: 36, width: 44, x: 24, y: 42 },
            quantity: { height: 12, width: 26, x: 32, y: 86 },
          }),
          id: `step-callout:p${index + 1}:same-color:item1`,
          quantity: {
            confidence: 0.92,
            text: "50",
            value: 50,
          },
        },
      ],
      stepIndex: index + 1,
    })),
    scannedPageNumbers: [1, 2],
    skippedBomPageNumbers: [],
  }
}

function createZeroPartCallout(): StepCalloutDetectionResult["callouts"][number] {
  return {
    confidence: 0.54,
    crop: {
      dataUrl: "data:image/png;base64,false-positive",
      height: 68,
      width: 178,
    },
    id: "step-callout:p3:false-positive",
    indexOnPage: 1,
    pageNumber: 3,
    partItems: [],
    sourceImage: {
      height: 900,
      unit: "step_pixel",
      width: 1400,
    },
    sourceRegion: {
      height: 68,
      unit: "step_pixel",
      width: 178,
      x: 889,
      y: 112,
    },
    stepIndex: 8,
  }
}

function createResult(): StepCalloutDetectionResult {
  return {
    callouts: [
      {
        confidence: 0.84,
        crop: {
          dataUrl: "data:image/png;base64,page-one",
          height: 140,
          width: 200,
        },
        id: "step-callout:p1:r1",
        indexOnPage: 1,
        pageNumber: 1,
        partItems: [
          createPartItem(1, {
            item: { height: 58, width: 44, x: 24, y: 42 },
            part: { height: 36, width: 44, x: 24, y: 42 },
            quantity: { height: 12, width: 26, x: 32, y: 86 },
          }),
          createPartItem(2, {
            item: { height: 62, width: 48, x: 88, y: 40 },
            part: { height: 40, width: 48, x: 88, y: 40 },
            quantity: { height: 12, width: 30, x: 96, y: 90 },
          }),
        ],
        sourceImage: {
          height: 900,
          unit: "step_pixel",
          width: 700,
        },
        sourceRegion: {
          height: 140,
          unit: "step_pixel",
          width: 200,
          x: 10,
          y: 20,
        },
        stepIndex: 1,
      },
      {
        confidence: 0.76,
        crop: {
          dataUrl: "data:image/png;base64,page-three",
          height: 110,
          width: 180,
        },
        id: "step-callout:p3:r1",
        indexOnPage: 1,
        pageNumber: 3,
        partItems: [
          {
            ...createPartItem(1, {
              item: { height: 58, width: 44, x: 24, y: 42 },
              part: { height: 36, width: 44, x: 24, y: 42 },
              quantity: { height: 12, width: 26, x: 32, y: 86 },
            }),
            id: "step-callout:p3:r1:item1",
            quantity: {
              confidence: 0.86,
              text: "2",
              value: 2,
            },
          },
        ],
        sourceImage: {
          height: 900,
          unit: "step_pixel",
          width: 700,
        },
        sourceRegion: {
          height: 110,
          unit: "step_pixel",
          width: 180,
          x: 14,
          y: 26,
        },
        stepIndex: 2,
      },
    ],
    detectorVersion: stepCalloutDetectorVersion,
    pageCount: 10,
    pageLimit: null,
    scannedPageNumbers: [1, 3],
    skippedBomPageNumbers: [2],
    status: "detected",
  }
}

function createPartItem(
  index: number,
  regions: {
    item: { height: number; width: number; x: number; y: number }
    part: { height: number; width: number; x: number; y: number }
    quantity: { height: number; width: number; x: number; y: number }
  },
) {
  return {
    bomImageMatch: index === 1
      ? {
          cataloguePartNumber: "3005",
          colorId: "6",
          colorName: "Green",
          colorScore: 0.98,
          confidence: 0.96,
          fallbackPreviewImageUrl: "https://example.test/parts/3005.png",
          partName: "Brick 1 x 1",
          partNumber: "3005",
          previewImageUrl: "https://example.test/parts/3005-green.png",
          quantity: 3,
          rowId: "row-green-plate",
          sourcePage: 9,
          visualScore: 0.94,
        }
      : null,
    confidence: 0.7,
    detectedColor: {
      confidence: 0.82,
      hex: index === 1 ? "#237823" : "#6c6e6c",
      name: index === 1 ? "Green" : "Dark Bluish Gray",
      rgb: index === 1
        ? { b: 35, g: 120, r: 35 }
        : { b: 108, g: 110, r: 108 },
    },
    id: `step-callout:p1:r1:item${index}`,
    localImageMatch: index === 1
      ? {
          confidence: 0.92,
          groupId: "step-local-image:g1:m1",
          groupIndex: 1,
          itemCount: 2,
          stepGroupIndex: 1,
          stepGroupRange: {
            end: 5,
            start: 1,
          },
        }
      : null,
    localImageRejectedMatches: index === 2
      ? [
          {
            aspectScore: 0.91,
            candidateColorHex: "#237823",
            candidateColorName: "Green",
            candidateCrop: {
              dataUrl: "data:image/png;base64,rejected-green",
              height: 36,
              width: 44,
            },
            candidateItemId: "step-callout:p3:r1:item1",
            candidateItemIndex: 1,
            candidateStepIndex: 2,
            colorScore: 0.97,
            compactnessScore: 0.88,
            coverageScore: 0.9,
            detailScore: 0.81,
            edgeScore: 0.7,
            embeddingScore: 0.86,
            reason: "foreground shape below 74%",
            score: 0.83,
            shapeScore: 0.7,
            source: "local_callout" as const,
            stepGroupRange: {
              end: 5,
              start: 1,
            },
            structureScore: 0.89,
            visualScore: 0.87,
          },
        ]
      : [],
    indexOnCallout: index,
    partCrop: {
      dataUrl: `data:image/png;base64,part-${index}`,
      height: regions.part.height,
      width: regions.part.width,
    },
    partRegion: {
      ...regions.part,
      unit: "step_pixel" as const,
    },
    quantityLabel: {
      crop: {
        dataUrl: `data:image/png;base64,quantity-${index}`,
        height: regions.quantity.height,
        width: regions.quantity.width,
      },
      region: {
        ...regions.quantity,
        unit: "step_pixel" as const,
      },
    },
    quantity: {
      confidence: 0.86,
      text: `${index}`,
      value: index,
    },
    sourceRegion: {
      ...regions.item,
      unit: "step_pixel" as const,
    },
  }
}
