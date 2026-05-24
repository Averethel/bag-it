"use client"

import { Accordion, Badge, Box, Button, Flex, Grid, HoverCard, HStack, Image, Portal, Progress, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import { ImageIcon, Minus, Plus } from "lucide-react"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { compareColorNames } from "@/features/bagging/color-sort"
import {
  createStepCalloutBagChecklistRowId,
  createStepCalloutBaggingPlan,
  type StepCalloutBagPartGroup,
  type StepCalloutBagPlan,
  type StepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"
import {
  getStepCalloutMultiplier,
  normalizeStepCalloutMultiplier,
  setStepCalloutMultiplier,
  type StepCalloutMultiplierMap,
} from "@/features/bagging/step-callout-multipliers"
import type {
  DetectedStepCallout,
  DetectedStepCalloutPartImageSignature,
  DetectedStepCalloutPartItem,
  DetectedStepCalloutLocalImageRejectedMatch,
  StepCalloutDetectionResult,
} from "@/features/bagging/step-callout-detection"
import type { PdfPrivatePageRender } from "@/features/bagging/pdf-intake"
import {
  PartChecklistTable,
  type PartChecklistRow,
  type PartChecklistSortColumn,
} from "./part-checklist-table"

type StepBagGroupMode = "bag" | "color"

const stepQuantityFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})
const stepCalloutPreviewRenderBatchSize = 3
const allPartChecklistSortColumns = [
  "color",
  "completion",
  "location",
  "part",
  "quantity",
] as const satisfies readonly PartChecklistSortColumn[]
type StepCalloutPageRenderStatus = "idle" | "loading" | "unavailable"
const emptyStepCalloutMultiplierMap = Object.freeze({}) as StepCalloutMultiplierMap
const emptyPageRenders = [] as const satisfies readonly PdfPrivatePageRender[]
const emptyDetectedStepCallouts = [] as const satisfies readonly DetectedStepCallout[]
const stepBagChecklistBagPlainColumns = ["location"] as const satisfies readonly PartChecklistSortColumn[]

export function StepCalloutsPanel({
  calloutMultipliers = emptyStepCalloutMultiplierMap,
  checkedRowIds,
  inventoryPartCount,
  onCheckedRowIdsChange,
  result,
}: {
  calloutMultipliers?: StepCalloutMultiplierMap
  checkedRowIds?: ReadonlySet<string>
  inventoryPartCount?: number | null
  onCheckedRowIdsChange?: (checkedRowIds: ReadonlySet<string>) => void
  result: StepCalloutDetectionResult
}) {
  const [localCheckedRowIds, setLocalCheckedRowIds] = useState<ReadonlySet<string>>(() => new Set())
  const [groupMode, setGroupMode] = useState<StepBagGroupMode>("bag")
  const visibleCheckedRowIds = checkedRowIds ?? localCheckedRowIds
  const visibleCheckedRowIdsRef = useRef<ReadonlySet<string>>(visibleCheckedRowIds)
  const baggingPlan = useMemo(
    () => createStepCalloutBaggingPlan(result, { calloutMultipliers, inventoryPartCount }),
    [calloutMultipliers, inventoryPartCount, result],
  )
  const quantityDiagnostic = useMemo(
    () => getStepCalloutQuantityDiagnostic(baggingPlan, inventoryPartCount),
    [baggingPlan, inventoryPartCount],
  )
  const rows = useMemo(() => getStepBagChecklistRows(baggingPlan, calloutMultipliers), [baggingPlan, calloutMultipliers])
  const sections = useMemo(() => getStepBagChecklistSections(rows, groupMode), [groupMode, rows])
  const completion = useMemo(() => getStepBagChecklistCompletion(rows, visibleCheckedRowIds), [rows, visibleCheckedRowIds])
  const sectionDefaultValues = useMemo(() => sections.map((section) => section.id), [sections])
  const updateCheckedRowIds = useCallback((nextCheckedRowIds: ReadonlySet<string>) => {
    if (onCheckedRowIdsChange) {
      onCheckedRowIdsChange(nextCheckedRowIds)
      return
    }

    setLocalCheckedRowIds(nextCheckedRowIds)
  }, [onCheckedRowIdsChange])
  const updateCheckedRow = useCallback((rowId: string, checked: boolean) => {
    const current = visibleCheckedRowIdsRef.current
    if (current.has(rowId) === checked) {
      return
    }

    const next = new Set(current)
    if (checked) {
      next.add(rowId)
    } else {
      next.delete(rowId)
    }
    updateCheckedRowIds(next)
  }, [updateCheckedRowIds])

  useLayoutEffect(() => {
    visibleCheckedRowIdsRef.current = visibleCheckedRowIds
  }, [visibleCheckedRowIds])

  return (
    <Box
      data-testid="step-callouts-panel"
      border="sm"
      borderColor="bagging.border"
      bg="white"
      display="flex"
      flex="1"
      minH="bagging.zero"
      overflowY={{ base: "visible", lg: "auto" }}
      rounded="md"
      p="4"
    >
      <Stack gap="4" flex="1" minW="bagging.zero">
        <HStack justify="space-between" align="start" gap="4">
          <Stack gap="1" minW="bagging.zero">
            <Text fontWeight="semibold">Bag checklist</Text>
            <Text color="fg.muted" fontSize="sm">
              {getStepCalloutBagSummary(baggingPlan, result)}
            </Text>
          </Stack>
          <Stack align="end" gap="2" flexShrink={0}>
            <Badge colorPalette={result.status === "detected" ? "green" : "yellow"} variant="subtle">
              {result.status}
            </Badge>
            <StepBagGroupToggle mode={groupMode} onModeChange={setGroupMode} />
          </Stack>
        </HStack>
        {quantityDiagnostic ? <StepCalloutQuantityDiagnosticPanel diagnostic={quantityDiagnostic} /> : null}
        <StepBagCompletionIndicator completion={completion} />

        {sections.length > 0 ? (
          <Accordion.Root key={groupMode} multiple defaultValue={sectionDefaultValues} lazyMount unmountOnExit>
            <Stack gap="3">
              {sections.map((section) => (
                <StepBagChecklistSection
                  key={section.id}
                  checkedRowIds={visibleCheckedRowIds}
                  groupMode={groupMode}
                  onCheckedRowChange={updateCheckedRow}
                  onCheckedRowIdsChange={updateCheckedRowIds}
                  section={section}
                />
              ))}
            </Stack>
          </Accordion.Root>
        ) : (
          <Box
            border="sm"
            borderColor="bagging.border"
            borderStyle="dashed"
            bg="bagging.subtleBg"
            rounded="md"
            p="4"
          >
            <Text color="fg.muted" fontSize="sm">
              No step callouts with part images were detected across the non-inventory pages.
            </Text>
          </Box>
        )}
      </Stack>
    </Box>
  )
}

export function StepCalloutDebugPanel({
  calloutMultipliers = emptyStepCalloutMultiplierMap,
  inventoryPartCount,
  result,
}: {
  calloutMultipliers?: StepCalloutMultiplierMap
  inventoryPartCount?: number | null
  result: StepCalloutDetectionResult
}) {
  const baggingPlan = useMemo(
    () => createStepCalloutBaggingPlan(result, { calloutMultipliers, inventoryPartCount }),
    [calloutMultipliers, inventoryPartCount, result],
  )
  const quantityDiagnostic = useMemo(
    () => getStepCalloutQuantityDiagnostic(baggingPlan, inventoryPartCount),
    [baggingPlan, inventoryPartCount],
  )

  return (
    <Stack data-testid="step-callout-debug-panel" gap="4">
      {quantityDiagnostic ? <StepCalloutQuantityDiagnosticPanel diagnostic={quantityDiagnostic} /> : null}
      <StepCalloutLocalMatchDebugPanel result={result} />
      <StepCalloutBagDebugPanel baggingPlan={baggingPlan} result={result} />
    </Stack>
  )
}

export function StepCalloutMatchingDebugPanel({
  calloutMultipliers = emptyStepCalloutMultiplierMap,
  inventoryPartCount,
  loadPageRenders,
  onCalloutMultiplierChange,
  pageRenders = emptyPageRenders,
  result,
}: {
  calloutMultipliers?: StepCalloutMultiplierMap
  inventoryPartCount?: number | null
  loadPageRenders?: (pageNumbers: readonly number[]) => Promise<readonly PdfPrivatePageRender[]>
  onCalloutMultiplierChange?: (calloutId: string, multiplier: number) => void
  pageRenders?: readonly PdfPrivatePageRender[]
  result: StepCalloutDetectionResult
}) {
  const [loadedPageRenders, setLoadedPageRenders] = useState<readonly PdfPrivatePageRender[]>([])
  const [loadingPageNumbers, setLoadingPageNumbers] = useState<ReadonlySet<number>>(() => new Set())
  const [unavailablePageNumbers, setUnavailablePageNumbers] = useState<ReadonlySet<number>>(() => new Set())
  const [visibleCalloutMultipliers, setVisibleCalloutMultipliers] =
    useState<StepCalloutMultiplierMap>(calloutMultipliers)
  const visibleCalloutMultipliersRef = useRef(visibleCalloutMultipliers)
  const onCalloutMultiplierChangeRef = useRef(onCalloutMultiplierChange)
  const pageCalloutsByNumber = useMemo(() => getCalloutsByPageNumber(result.callouts), [result.callouts])
  const matchingRows = useMemo(() => getStepCalloutMatchingRows(result), [result])
  const pageGroups = useMemo(
    () => getStepCalloutMatchingPageGroups(matchingRows, result.scannedPageNumbers),
    [matchingRows, result.scannedPageNumbers],
  )
  const quantityDiagnostic = useMemo(
    () => getStepCalloutQuantityDiagnosticForResult(result, visibleCalloutMultipliers, inventoryPartCount),
    [inventoryPartCount, result, visibleCalloutMultipliers],
  )
  const partDiagnostic = useMemo(
    () => getStepCalloutPartDiagnosticForResult(result, visibleCalloutMultipliers),
    [result, visibleCalloutMultipliers],
  )
  const pageRenderByNumber = useMemo(
    () => mergePageRenderSources(pageRenders, loadedPageRenders),
    [loadedPageRenders, pageRenders],
  )
  const previewPageNumbers = useMemo(() => pageGroups.map((group) => group.pageNumber), [pageGroups])
  const previewPageNumbersToLoad = useMemo(
    () =>
      previewPageNumbers
        .filter((pageNumber) => !pageRenderByNumber.has(pageNumber) && !unavailablePageNumbers.has(pageNumber))
        .slice(0, stepCalloutPreviewRenderBatchSize),
    [pageRenderByNumber, previewPageNumbers, unavailablePageNumbers],
  )
  const previewPageNumbersToLoadKey = previewPageNumbersToLoad.join(",")

  useLayoutEffect(() => {
    visibleCalloutMultipliersRef.current = visibleCalloutMultipliers
    onCalloutMultiplierChangeRef.current = onCalloutMultiplierChange
  }, [onCalloutMultiplierChange, visibleCalloutMultipliers])

  useEffect(() => {
    let isCancelled = false
    visibleCalloutMultipliersRef.current = calloutMultipliers

    queueMicrotask(() => {
      if (!isCancelled) {
        setVisibleCalloutMultipliers(calloutMultipliers)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [calloutMultipliers, result])

  const updateVisibleCalloutMultiplier = useCallback((calloutId: string, multiplier: number) => {
    const current = visibleCalloutMultipliersRef.current
    const next = setStepCalloutMultiplier(current, calloutId, multiplier)
    if (next === current) {
      return
    }

    visibleCalloutMultipliersRef.current = next
    setVisibleCalloutMultipliers(next)
    onCalloutMultiplierChangeRef.current?.(calloutId, normalizeStepCalloutMultiplier(multiplier))
  }, [])

  useEffect(() => {
    let isCancelled = false
    queueMicrotask(() => {
      if (isCancelled) {
        return
      }

      setLoadedPageRenders([])
      setLoadingPageNumbers(new Set())
      setUnavailablePageNumbers(new Set())
    })

    return () => {
      isCancelled = true
    }
  }, [result])

  useEffect(() => {
    if (!loadPageRenders || !previewPageNumbersToLoadKey) {
      return
    }

    let isCancelled = false
    const requestedPageNumbers = parsePageNumberKey(previewPageNumbersToLoadKey)
    queueMicrotask(() => {
      if (!isCancelled) {
        setLoadingPageNumbers((current) => addPageNumbersToSet(current, requestedPageNumbers))
      }
    })

    void loadPageRenders(requestedPageNumbers)
      .then((renders) => {
        if (isCancelled) {
          return
        }

        const renderedPageNumbers = new Set(renders.map((render) => render.pageNumber))
        setLoadedPageRenders((current) => mergePageRenderList(current, renders))
        setUnavailablePageNumbers((current) =>
          addPageNumbersToSet(
            current,
            requestedPageNumbers.filter((pageNumber) => !renderedPageNumbers.has(pageNumber)),
          ),
        )
      })
      .catch(() => {
        if (!isCancelled) {
          setUnavailablePageNumbers((current) => addPageNumbersToSet(current, requestedPageNumbers))
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingPageNumbers((current) => removePageNumbersFromSet(current, requestedPageNumbers))
        }
      })

    return () => {
      isCancelled = true
    }
  }, [loadPageRenders, previewPageNumbersToLoadKey])

  return (
    <Box
      data-testid="step-callout-matching-debug-panel"
      border="sm"
      borderColor="bagging.border"
      bg="white"
      display="flex"
      flex="1"
      minH="bagging.zero"
      minW="bagging.zero"
      overflowY={{ base: "visible", lg: "auto" }}
      rounded="md"
      p="4"
    >
      <Stack gap="4" flex="1" minW="bagging.zero">
        <HStack justify="space-between" align="start" gap="4">
          <Stack gap="1" minW="bagging.zero">
            <Text fontWeight="semibold">Build steps</Text>
            <Text color="fg.muted" fontSize="sm">
              {result.callouts.length} {result.callouts.length === 1 ? "callout" : "callouts"} across{" "}
              {result.scannedPageNumbers.length} scanned {result.scannedPageNumbers.length === 1 ? "page" : "pages"}.
            </Text>
          </Stack>
          <Badge colorPalette={result.status === "detected" ? "green" : "yellow"} variant="subtle" flexShrink={0}>
            {result.status}
          </Badge>
        </HStack>
        {quantityDiagnostic ? <StepCalloutQuantityDiagnosticPanel diagnostic={quantityDiagnostic} /> : null}
        <StepCalloutPartDiagnosticPanel diagnostic={partDiagnostic} />

        {pageGroups.length > 0 ? (
          <Stack data-testid="step-callout-matching-debug-page-groups" gap="3">
            {pageGroups.map((group) => (
              <StepCalloutMatchingPageGroup
                key={group.pageNumber}
                group={group}
                pageCallouts={pageCalloutsByNumber.get(group.pageNumber) ?? emptyDetectedStepCallouts}
                pageRender={pageRenderByNumber.get(group.pageNumber) ?? null}
                pageRenderStatus={getStepCalloutPageRenderStatus(
                  group.pageNumber,
                  pageRenderByNumber.get(group.pageNumber) ?? null,
                  loadingPageNumbers,
                  unavailablePageNumbers,
                )}
                calloutMultipliers={visibleCalloutMultipliers}
                onCalloutMultiplierChange={updateVisibleCalloutMultiplier}
              />
            ))}
          </Stack>
        ) : (
          <Box border="sm" borderColor="bagging.border" borderStyle="dashed" bg="bagging.subtleBg" rounded="md" p="4">
            <Text color="fg.muted" fontSize="sm">
              No step callout rectangles were detected across the non-inventory pages.
            </Text>
          </Box>
        )}
      </Stack>
    </Box>
  )
}

export function StepCalloutLocalMatchDebugPanel({ result }: { result: StepCalloutDetectionResult }) {
  const localDebugGroups = getStepLocalMatchDebugGroups(result)

  return <StepLocalMatchDebugPanel groups={localDebugGroups} />
}

function StepCalloutPartDiagnosticPanel({ diagnostic }: { diagnostic: StepCalloutPartDiagnosticData }) {
  return (
    <Box
      data-testid="step-callout-part-diagnostic"
      data-part-type-count={diagnostic.partTypeCount}
      data-total-quantity={diagnostic.totalQuantity}
      border="sm"
      borderColor="bagging.border"
      bg="bagging.subtleBg"
      rounded="md"
      px="3"
      py="2"
    >
      <Text color="fg.muted" fontSize="sm">
        {formatPartTypeCount(diagnostic.partTypeCount)} represented · {stepQuantityFormatter.format(diagnostic.totalQuantity)} total quantity
      </Text>
    </Box>
  )
}

export function StepCalloutQuantityDiagnosticPanel({
  diagnostic,
  testId = "step-callout-quantity-diagnostics",
}: {
  diagnostic: StepCalloutQuantityDiagnostic
  testId?: string
}) {
  const isOverage = diagnostic.kind === "overage"
  const deltaPartCount = isOverage ? diagnostic.overagePartCount : diagnostic.missingPartCount
  const deltaLabel = isOverage ? "extra" : "missing"
  const metricLabel = isOverage ? "Extra quantity" : "Missing quantity"

  return (
    <Box
      data-testid={testId}
      data-bom-part-count={diagnostic.inventoryPartCount}
      data-detected-part-count={diagnostic.detectedPartCount}
      data-diagnostic-kind={diagnostic.kind}
      data-missing-part-count={diagnostic.missingPartCount}
      data-overage-part-count={diagnostic.overagePartCount}
      border="sm"
      borderColor="orange.200"
      bg="orange.50"
      rounded="md"
      p="3"
    >
      <Stack gap="3">
        <HStack justify="space-between" align="start" gap="3">
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text color="orange.800" fontSize="sm" fontWeight="semibold">
              {isOverage ? "Step quantity exceeds BOM" : "Step coverage needs attention"}
            </Text>
            <Text color="orange.700" fontSize="xs">
              {isOverage
                ? "Callout quantity is higher than the recognized BOM quantity."
                : "BOM quantity is higher than the parts found in step callouts."}
            </Text>
          </Stack>
          <Badge colorPalette="orange" variant="solid" flexShrink={0}>
            {stepQuantityFormatter.format(deltaPartCount)} {deltaLabel}
          </Badge>
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap="2">
          <StepDiagnosticMetric
            label="BOM quantity"
            value={stepQuantityFormatter.format(diagnostic.inventoryPartCount)}
          />
          <StepDiagnosticMetric
            label="Callout quantity"
            value={stepQuantityFormatter.format(diagnostic.detectedPartCount)}
          />
          <StepDiagnosticMetric
            label={metricLabel}
            value={stepQuantityFormatter.format(deltaPartCount)}
          />
        </SimpleGrid>
      </Stack>
    </Box>
  )
}

function StepDiagnosticMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <Box border="sm" borderColor="orange.200" bg="white" rounded="sm" p="2">
      <Stack gap="bagging.none">
        <Text color="fg.muted" fontSize="2xs" fontWeight="semibold" textTransform="uppercase">
          {label}
        </Text>
        <Text color="orange.800" fontSize="sm" fontWeight="semibold">
          {value}
        </Text>
      </Stack>
    </Box>
  )
}

function StepBagGroupToggle({
  mode,
  onModeChange,
}: {
  mode: StepBagGroupMode
  onModeChange: (mode: StepBagGroupMode) => void
}) {
  return (
    <HStack
      aria-label="Group bag parts"
      bg="bagging.subtleBg"
      border="sm"
      borderColor="bagging.border"
      gap="1"
      p="0.5"
      rounded="sm"
    >
      <Button
        aria-pressed={mode === "bag"}
        colorPalette={mode === "bag" ? "green" : "gray"}
        h="7"
        px="2.5"
        size="xs"
        type="button"
        variant={mode === "bag" ? "solid" : "ghost"}
        onClick={() => onModeChange("bag")}
      >
        Bag
      </Button>
      <Button
        aria-pressed={mode === "color"}
        colorPalette={mode === "color" ? "green" : "gray"}
        h="7"
        px="2.5"
        size="xs"
        type="button"
        variant={mode === "color" ? "solid" : "ghost"}
        onClick={() => onModeChange("color")}
      >
        Color
      </Button>
    </HStack>
  )
}

type StepCalloutMatchingPageGroupProps = {
  calloutMultipliers: StepCalloutMultiplierMap
  group: StepCalloutMatchingPageGroupData
  onCalloutMultiplierChange?: (calloutId: string, multiplier: number) => void
  pageCallouts: readonly DetectedStepCallout[]
  pageRender: PdfPrivatePageRender | null
  pageRenderStatus: StepCalloutPageRenderStatus
}

const StepCalloutMatchingPageGroup = memo(function StepCalloutMatchingPageGroup({
  calloutMultipliers,
  group,
  onCalloutMultiplierChange,
  pageCallouts,
  pageRender,
  pageRenderStatus,
}: StepCalloutMatchingPageGroupProps) {
  return (
    <Grid
      data-testid="step-callout-matching-debug-page-group"
      data-page-number={group.pageNumber}
      bg="white"
      border="sm"
      borderColor="bagging.border"
      rounded="md"
      overflow="hidden"
      templateColumns={{ base: "1fr", xl: "16rem minmax(0, 1fr)" }}
    >
      <Box bg="bagging.subtleBg" borderRight={{ xl: "sm" }} borderColor="bagging.rowBorder" p="3">
        <StepCalloutPagePreview
          pageNumber={group.pageNumber}
          pageCallouts={pageCallouts}
          pageRender={pageRender}
          status={pageRenderStatus}
        />
      </Box>
      <Stack gap="2" minW="bagging.zero" p="3">
        <HStack justify="space-between" gap="3">
          <Text fontSize="sm" fontWeight="semibold">
            Page {group.pageNumber}
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {group.rows.length} {group.rows.length === 1 ? "row" : "rows"}
          </Text>
        </HStack>
        <Box overflowX="auto">
          <Box
            as="table"
            data-testid="step-callout-matching-debug-table"
            borderCollapse="collapse"
            w="full"
            style={{ minWidth: "28rem" }}
          >
            <Box as="thead" bg="bagging.subtleBg">
              <Box as="tr">
                <Box as="th" borderBottom="sm" borderColor="bagging.rowBorder" color="fg.muted" fontSize="xs" fontWeight="semibold" p="2" textAlign="start" style={{ width: "10rem" }}>
                  Step
                </Box>
                <Box as="th" borderBottom="sm" borderColor="bagging.rowBorder" color="fg.muted" fontSize="xs" fontWeight="semibold" p="2" textAlign="start" style={{ width: "8rem" }}>
                  Multiplier
                </Box>
                <Box as="th" borderBottom="sm" borderColor="bagging.rowBorder" color="fg.muted" fontSize="xs" fontWeight="semibold" p="2" textAlign="start">
                  Step callout
                </Box>
              </Box>
            </Box>
            <Box as="tbody">
              {group.rows.length > 0 ? (
                group.rows.map((row) => (
                  <StepCalloutMatchingRow
                    key={row.id}
                    multiplier={getStepCalloutMultiplier(row.callout.id, calloutMultipliers)}
                    onMultiplierChange={onCalloutMultiplierChange}
                    row={row}
                  />
                ))
              ) : (
                <Box as="tr">
                  <Box as="td" borderBottom="sm" borderColor="bagging.rowBorder" color="fg.muted" fontSize="sm" p="3">
                    No build steps detected on this page.
                  </Box>
                  <Box as="td" borderBottom="sm" borderColor="bagging.rowBorder" />
                  <Box as="td" borderBottom="sm" borderColor="bagging.rowBorder" />
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Stack>
    </Grid>
  )
}, areStepCalloutMatchingPageGroupPropsEqual)

function areStepCalloutMatchingPageGroupPropsEqual(
  previous: StepCalloutMatchingPageGroupProps,
  next: StepCalloutMatchingPageGroupProps,
) {
  return previous.group === next.group &&
    previous.onCalloutMultiplierChange === next.onCalloutMultiplierChange &&
    previous.pageCallouts === next.pageCallouts &&
    previous.pageRender === next.pageRender &&
    previous.pageRenderStatus === next.pageRenderStatus &&
    haveEqualCalloutMultipliersForRows(previous.group.rows, previous.calloutMultipliers, next.calloutMultipliers)
}

function haveEqualCalloutMultipliersForRows(
  rows: readonly StepCalloutMatchingRowData[],
  previousMultipliers: StepCalloutMultiplierMap,
  nextMultipliers: StepCalloutMultiplierMap,
) {
  if (previousMultipliers === nextMultipliers) {
    return true
  }

  return rows.every(
    (row) => getStepCalloutMultiplier(row.callout.id, previousMultipliers) ===
      getStepCalloutMultiplier(row.callout.id, nextMultipliers),
  )
}

type StepCalloutMatchingRowProps = {
  multiplier: number
  onMultiplierChange?: (calloutId: string, multiplier: number) => void
  row: StepCalloutMatchingRowData
}

const StepCalloutMatchingRow = memo(function StepCalloutMatchingRow({
  multiplier,
  onMultiplierChange,
  row,
}: StepCalloutMatchingRowProps) {
  const partSummary = formatCalloutPartSummary(row.callout, multiplier)

  return (
    <>
      <Box
        as="tr"
        data-testid="step-callout-matching-debug-row"
        data-page-number={row.pageNumber}
        data-part-type-count={row.callout.partItems.length}
        data-row-kind="callout"
        data-source-region={formatSourceRegion(row.callout.sourceRegion)}
        data-step-index={row.stepIndex}
        data-step-multiplier={multiplier}
        _hover={{ bg: "bagging.subtleBg" }}
      >
        <Box as="td" p="2" verticalAlign="middle">
          <StepCalloutStepCell row={row} />
        </Box>
        <Box as="td" p="2" verticalAlign="middle">
          {row.callout.partItems.length > 0 ? (
            <StepCalloutMultiplierControl
              multiplier={multiplier}
              onMultiplierChange={(nextMultiplier) => onMultiplierChange?.(row.callout.id, nextMultiplier)}
              stepIndex={row.stepIndex}
            />
          ) : (
            <Text color="fg.muted" fontSize="xs">
              Not bagged
            </Text>
          )}
        </Box>
        <Box as="td" p="2" verticalAlign="middle">
          <StepCalloutCropPreviewHover row={row} />
        </Box>
      </Box>
      <Box as="tr" _hover={{ bg: "bagging.subtleBg" }}>
        <td colSpan={3} style={{ padding: 0 }}>
          <Box borderBottom="sm" borderColor="bagging.rowBorder" px="2" pb="2" pt="bagging.none">
            <Text color="fg.muted" fontSize="xs">
              {partSummary}
            </Text>
          </Box>
        </td>
      </Box>
    </>
  )
}, areStepCalloutMatchingRowPropsEqual)

function areStepCalloutMatchingRowPropsEqual(
  previous: StepCalloutMatchingRowProps,
  next: StepCalloutMatchingRowProps,
) {
  return previous.multiplier === next.multiplier &&
    previous.onMultiplierChange === next.onMultiplierChange &&
    previous.row === next.row
}

function StepCalloutMultiplierControl({
  multiplier,
  onMultiplierChange,
  stepIndex,
}: {
  multiplier: number
  onMultiplierChange: (multiplier: number) => void
  stepIndex: number
}) {
  return (
    <HStack
      data-testid="step-callout-multiplier-control"
      data-step-multiplier={multiplier}
      gap="1"
      align="center"
    >
      <Button
        aria-label={`Decrease step ${stepIndex} multiplier`}
        disabled={multiplier <= 1}
        h="7"
        minW="7"
        p="bagging.none"
        size="xs"
        type="button"
        variant="ghost"
        onClick={() => onMultiplierChange(Math.max(1, multiplier - 1))}
      >
        <Minus size={14} />
      </Button>
      <Text
        data-testid="step-callout-multiplier-value"
        fontSize="sm"
        fontWeight="semibold"
        minW="7"
        textAlign="center"
      >
        x{stepQuantityFormatter.format(multiplier)}
      </Text>
      <Button
        aria-label={`Increase step ${stepIndex} multiplier`}
        h="7"
        minW="7"
        p="bagging.none"
        size="xs"
        type="button"
        variant="ghost"
        onClick={() => onMultiplierChange(multiplier + 1)}
      >
        <Plus size={14} />
      </Button>
    </HStack>
  )
}

function StepCalloutPagePreview({
  pageCallouts,
  pageNumber,
  pageRender,
  status,
}: {
  pageCallouts: readonly DetectedStepCallout[]
  pageNumber: number
  pageRender: PdfPrivatePageRender | null
  status: StepCalloutPageRenderStatus
}) {
  const pageCalloutCount = pageCallouts.length

  return (
    <Stack align="stretch" gap="2" w="full">
      <HStack justify="space-between" gap="2">
        <Text fontSize="sm" fontWeight="semibold">
          Page {pageNumber}
        </Text>
        <Text color="fg.muted" fontSize="xs">
          {pageCalloutCount} {pageCalloutCount === 1 ? "callout" : "callouts"}
        </Text>
      </HStack>
      {pageRender?.dataUrl ? (
        <Box border="sm" borderColor="bagging.border" bg="bagging.imageBg" rounded="sm" overflow="hidden">
          <Image
            alt={`Manual page ${pageNumber} preview`}
            display="block"
            maxH="80"
            objectFit="contain"
            src={pageRender.dataUrl}
            w="full"
          />
        </Box>
      ) : (
        <Flex
          align="center"
          justify="center"
          border="sm"
          borderColor="bagging.border"
          borderStyle="dashed"
          bg="white"
          color="fg.muted"
          h="40"
          rounded="sm"
        >
          <Text fontSize="xs">
            {status === "loading" ? "Loading page preview." : "No page preview rendered."}
          </Text>
        </Flex>
      )}
    </Stack>
  )
}

function StepCalloutStepCell({ row }: { row: StepCalloutMatchingRowData }) {
  return (
    <Text fontSize="sm" fontWeight="semibold">
      {row.stepIndex}
    </Text>
  )
}

function StepCalloutCropPreviewHover({ row }: { row: StepCalloutMatchingRowData }) {
  const callout = row.callout
  return (
    <HoverCard.Root closeDelay={80} lazyMount openDelay={120} unmountOnExit>
      <HoverCard.Trigger asChild>
        <Button
          aria-label={`Enlarge step ${callout.stepIndex} callout`}
          justifyContent="flex-start"
          minH="14"
          minW="bagging.zero"
          p="bagging.none"
          type="button"
          variant="ghost"
          w="full"
          _hover={{ bg: "transparent" }}
        >
          <HStack gap="3" minW="bagging.zero" textAlign="start" w="full">
            <Flex
              align="center"
              justify="center"
              border="sm"
              borderColor="bagging.border"
              bg="bagging.imageBg"
              h="14"
              w="28"
              rounded="sm"
              overflow="hidden"
              flexShrink={0}
            >
              <Image
                alt={`Step ${callout.stepIndex} callout thumbnail`}
                src={callout.crop.dataUrl}
                maxH="full"
                decoding="async"
                loading="lazy"
                maxW="full"
                objectFit="contain"
              />
            </Flex>
            <Stack gap="bagging.none" minW="bagging.zero">
              <Text fontSize="sm" fontWeight="medium" truncate>
                Callout {callout.indexOnPage}
              </Text>
            </Stack>
          </HStack>
        </Button>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content bg="white" border="sm" borderColor="bagging.border" rounded="md" shadow="lg" p="3" w="xl">
            <Stack gap="2">
              <Flex align="center" justify="center" maxH="96" bg="bagging.imageBg" border="sm" borderColor="bagging.border" rounded="sm" overflow="hidden">
                <Image
                  alt={`Step ${callout.stepIndex} callout enlarged`}
                  src={callout.crop.dataUrl}
                  maxH="96"
                  maxW="full"
                  objectFit="contain"
                />
              </Flex>
              <Stack gap="bagging.none">
                <Text fontSize="sm" fontWeight="medium">
                  Step {callout.stepIndex} · Page {callout.pageNumber}
                </Text>
                <Text color="fg.muted" fontSize="xs">
                  Callout {callout.indexOnPage} · {formatPartTypeCount(callout.partItems.length)}
                </Text>
              </Stack>
            </Stack>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  )
}

function StepBagCompletionIndicator({ completion }: { completion: StepBagChecklistCompletion }) {
  const completedQuantity = stepQuantityFormatter.format(completion.completedQuantity)
  const totalQuantity = stepQuantityFormatter.format(completion.totalQuantity)

  return (
    <Stack gap="2" px="3">
      <HStack gap="3" justify="space-between" align="center">
        <Text color="fg.muted" fontSize="sm">
          Bag parts packed
        </Text>
        <Text data-testid="step-bag-completion-summary" fontSize="sm" fontWeight="semibold">
          {completion.percent}% packed
        </Text>
      </HStack>
      <Progress.Root value={completion.percent} colorPalette={completion.percent === 100 ? "green" : "yellow"} size="xs">
        <Progress.Track aria-label="Bag parts packed progress">
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      <Text color="fg.muted" fontSize="xs">
        {completedQuantity} of {totalQuantity} detected parts checked.
      </Text>
    </Stack>
  )
}

function StepBagSectionProgress({ completion }: { completion: StepBagChecklistCompletion }) {
  return (
    <Stack gap="1">
      <Progress.Root value={completion.percent} colorPalette={completion.percent === 100 ? "green" : "yellow"} size="xs">
        <Progress.Track aria-label="Checklist group packed progress">
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      <Text color="fg.muted" fontSize="2xs">
        {stepQuantityFormatter.format(completion.completedQuantity)} of{" "}
        {stepQuantityFormatter.format(completion.totalQuantity)} packed
      </Text>
    </Stack>
  )
}

type StepBagChecklistSectionProps = {
  checkedRowIds: ReadonlySet<string>
  groupMode: StepBagGroupMode
  onCheckedRowChange: (rowId: string, checked: boolean) => void
  onCheckedRowIdsChange: (checkedRowIds: ReadonlySet<string>) => void
  section: StepBagChecklistSectionData
}

const StepBagChecklistSection = memo(function StepBagChecklistSection({
  checkedRowIds,
  groupMode,
  onCheckedRowChange,
  onCheckedRowIdsChange,
  section,
}: StepBagChecklistSectionProps) {
  const sectionCompletion = useMemo(
    () => getStepBagChecklistCompletion(section.rows, checkedRowIds),
    [checkedRowIds, section.rows],
  )
  const tableRows = useMemo(
    () => section.rows.map((row, index) =>
      createStepBagPartChecklistRow(row, {
        dividerLabel: groupMode === "color" && (index === 0 || row.bagNumber !== section.rows[index - 1]?.bagNumber)
          ? `${row.bagLabel} · ${formatStepRange(row.bagStepRange)}`
          : undefined,
      })
    ),
    [groupMode, section.rows],
  )
  const plainColumns = groupMode === "color" ? allPartChecklistSortColumns : stepBagChecklistBagPlainColumns

  return (
    <Accordion.Item
      data-testid="step-bag-checklist-group"
      data-completion-percent={sectionCompletion.percent}
      data-group-mode={groupMode}
      data-group-id={section.id}
      data-row-count={section.rows.length}
      data-total-quantity={section.totalQuantity}
      value={section.id}
      border="sm"
      borderColor="bagging.rowBorder"
      rounded="md"
      overflow="hidden"
      bg="white"
    >
      <Accordion.ItemTrigger px="3" py="3">
        <Stack flex="1" gap="2" minW="bagging.zero" textAlign="start">
          <HStack justify="space-between" align="center" gap="3" minW="bagging.zero">
            <HStack gap="2.5" minW="bagging.zero">
              {section.colorHex ? <StepBagColorSwatch colorHex={section.colorHex} /> : null}
              <Stack gap="bagging.none" minW="bagging.zero">
                <Text fontSize="sm" fontWeight="semibold" truncate>
                  {section.label}
                </Text>
                <Text color="fg.muted" fontSize="xs" truncate>
                  {section.description}
                </Text>
              </Stack>
            </HStack>
            <HStack gap="2" flexShrink={0}>
              <Badge colorPalette={sectionCompletion.percent === 100 ? "green" : "yellow"} variant="subtle">
                {sectionCompletion.percent}%
              </Badge>
              <Badge colorPalette="green" variant="subtle">
                x{stepQuantityFormatter.format(section.totalQuantity)}
              </Badge>
            </HStack>
          </HStack>
          <StepBagSectionProgress completion={sectionCompletion} />
        </Stack>
        <Accordion.ItemIndicator />
      </Accordion.ItemTrigger>
      <Accordion.ItemContent>
        <Accordion.ItemBody
          px="3"
          pb="3"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: `${getStepBagSectionIntrinsicHeight(section.rows.length)}px`,
          }}
        >
          <PartChecklistTable
            checkedRowIds={checkedRowIds}
            locationColumnLabel="Step"
            onCheckedRowChange={onCheckedRowChange}
            onCheckedRowIdsChange={onCheckedRowIdsChange}
            plainColumns={plainColumns}
            rows={tableRows}
            showConfidence={false}
            titleColumnLabel="Bag"
          />
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  )
}, areStepBagChecklistSectionPropsEqual)

function areStepBagChecklistSectionPropsEqual(
  previous: StepBagChecklistSectionProps,
  next: StepBagChecklistSectionProps,
) {
  return previous.groupMode === next.groupMode &&
    previous.onCheckedRowChange === next.onCheckedRowChange &&
    previous.onCheckedRowIdsChange === next.onCheckedRowIdsChange &&
    previous.section === next.section &&
    haveEqualCheckedStateForRows(previous.section.rows, previous.checkedRowIds, next.checkedRowIds)
}

function haveEqualCheckedStateForRows(
  rows: readonly StepBagChecklistRow[],
  previousCheckedRowIds: ReadonlySet<string>,
  nextCheckedRowIds: ReadonlySet<string>,
) {
  if (previousCheckedRowIds === nextCheckedRowIds) {
    return true
  }

  return rows.every((row) => previousCheckedRowIds.has(row.id) === nextCheckedRowIds.has(row.id))
}

function createStepBagPartChecklistRow(
  row: StepBagChecklistRow,
  options: { dividerLabel?: string } = {},
): PartChecklistRow {
  return {
    checkboxLabel: `Mark ${row.bagLabel} ${row.colorName} part from step ${row.stepIndex} as packed`,
    color: {
      hex: row.colorHex,
      name: row.colorName,
    },
    dataAttributes: {
      "data-bag-number": row.bagNumber,
      "data-callout-id": row.calloutId,
      "data-color-confidence": row.colorConfidence,
      "data-color-hex": row.colorHex,
      "data-color-name": row.colorName,
      "data-item-count": row.itemCount,
      "data-item-index": row.itemIndex,
      "data-step-multiplier": row.multiplier,
      "data-quantity": row.quantity,
      "data-quantity-confidence": row.quantityConfidence,
      "data-quantity-estimated": row.quantityIsEstimated ? "true" : "false",
      "data-source-item-ids": row.sourceItemIds.join(","),
      "data-step-indexes": row.stepIndexes.join(","),
      "data-testid": "step-bag-part-row",
    },
    dividerLabel: options.dividerLabel,
    id: row.id,
    image: ({ opacity }) => <StepBagPartPreviewImage opacity={opacity} row={row} />,
    locationLabel: <StepCalloutPreviewStep row={row} />,
    quantity: row.quantity,
    quantityDetail: <StepBagQuantityLabelCrop row={row} />,
    sortValues: {
      color: row.colorName,
      location: row.stepIndex + row.itemIndex / 1000,
      part: row.bagLabel,
    },
    subtitle: `Item ${row.itemIndex}`,
    title: row.bagLabel,
  }
}

function StepCalloutPreviewStep({ row }: { row: StepBagChecklistRow }) {
  const imageAlt = `Step ${row.stepIndex} callout preview`

  return (
    <HoverCard.Root closeDelay={80} lazyMount openDelay={120} unmountOnExit>
      <HoverCard.Trigger asChild>
        <Box
          as="span"
          aria-label={`Preview callout for step ${row.stepIndex}`}
          data-testid="step-callout-preview-step"
          color="fg"
          fontWeight="medium"
          textDecoration="underline"
          textDecorationStyle="dotted"
          textUnderlineOffset="3px"
          style={{ cursor: "help" }}
        >
          {row.stepIndex}
        </Box>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content bg="white" border="sm" borderColor="bagging.border" rounded="md" shadow="lg" p="3" w="80">
            <Stack gap="2">
              <Box border="sm" borderColor="bagging.border" bg="bagging.imageBg" rounded="sm" overflow="hidden">
                <Image
                  alt={imageAlt}
                  display="block"
                  src={row.calloutCrop.dataUrl}
                  maxH="64"
                  objectFit="contain"
                  w="full"
                />
              </Box>
              <Stack gap="bagging.none">
                <Text fontSize="sm" fontWeight="medium">
                  Step {row.stepIndex}
                </Text>
                <Text color="fg.muted" fontSize="xs">
                  Page {row.pageNumber} · Callout {row.calloutIndexOnPage}
                </Text>
              </Stack>
            </Stack>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  )
}

function StepBagQuantityLabelCrop({ row }: { row: StepBagChecklistRow }) {
  return (
    <Box
      aria-label={`Detected quantity label crop for ${row.bagLabel} step ${row.stepIndex} item ${row.itemIndex}`}
      data-testid="step-bag-quantity-label-crop"
      border="sm"
      borderColor="bagging.border"
      bg="bagging.imageBg"
      rounded="xs"
      overflow="hidden"
      w="8"
      h="4"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Image
        alt=""
        src={row.quantityLabelCrop.dataUrl}
        maxW="full"
        maxH="full"
        objectFit="contain"
        loading="lazy"
        decoding="async"
      />
    </Box>
  )
}

function StepBagPartPreviewImage({
  opacity = 1,
  row,
}: {
  opacity?: number
  row: StepBagChecklistRow
}) {
  const imageAlt = `Detected part crop for ${row.bagLabel} step ${row.stepIndex} item ${row.itemIndex}`
  const image = (
    <Image
      alt={imageAlt}
      src={row.representativeCrop.dataUrl}
      maxW="full"
      maxH="full"
      objectFit="contain"
      loading="lazy"
      decoding="async"
    />
  )

  return (
    <HoverCard.Root closeDelay={80} lazyMount openDelay={120} unmountOnExit>
      <HoverCard.Trigger asChild>
        <Flex
          align="center"
          justify="center"
          w="12"
          h="11"
          bg="bagging.imageBg"
          border="sm"
          borderColor="bagging.border"
          rounded="sm"
          overflow="hidden"
          style={{ opacity, transition: "opacity 120ms ease" }}
        >
          {image}
        </Flex>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content bg="white" border="sm" borderColor="bagging.border" rounded="md" shadow="lg" p="3" w="60">
            <Stack gap="2">
              <Flex align="center" justify="center" h="44" bg="bagging.imageBg" rounded="sm">
                <Image
                  alt={`${imageAlt} enlarged`}
                  src={row.representativeCrop.dataUrl}
                  maxW="full"
                  maxH="full"
                  objectFit="contain"
                />
              </Flex>
              <Stack gap="bagging.none">
                <Text fontSize="sm" fontWeight="medium" truncate>
                  {row.colorName}
                </Text>
                <Text color="fg.muted" fontSize="xs" truncate>
                  Bag {row.bagNumber} · Steps {formatStepIndexes(row.stepIndexes)}
                </Text>
              </Stack>
            </Stack>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  )
}

function StepBagColorSwatch({ colorHex }: { colorHex: string }) {
  return (
    <Box
      data-testid="step-bag-color-swatch"
      aria-hidden="true"
      boxSize="3.5"
      rounded="sm"
      border="sm"
      borderColor="blackAlpha.300"
      flexShrink={0}
      style={{ backgroundColor: colorHex }}
    />
  )
}

function StepCalloutBagDebugPanel({
  baggingPlan,
  result,
}: {
  baggingPlan: StepCalloutBaggingPlan
  result: StepCalloutDetectionResult
}) {
  return (
    <Box
      data-testid="step-callout-bag-debug-section"
      border="sm"
      borderColor="bagging.rowBorder"
      bg="bagging.subtleBg"
      rounded="md"
      p="3"
    >
      <Stack gap="3">
        <HStack justify="space-between" align="start" gap="3">
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text fontSize="sm" fontWeight="semibold">
              Detected callout debug
            </Text>
            <Text color="fg.muted" fontSize="xs">
              {getStepCalloutBagSummary(baggingPlan, result)}
            </Text>
          </Stack>
          <Badge colorPalette={result.status === "detected" ? "green" : "yellow"} variant="subtle" flexShrink={0}>
            {result.status}
          </Badge>
        </HStack>

        {baggingPlan.bags.length > 0 ? (
          <Stack gap="3">
            {baggingPlan.bags.map((bag) => (
              <StepCalloutBagCard key={bag.id} bag={bag} />
            ))}
          </Stack>
        ) : (
          <Text color="fg.muted" fontSize="sm">
            No step callout rectangles were detected across the non-inventory pages.
          </Text>
        )}
      </Stack>
    </Box>
  )
}

function StepCalloutBagCard({ bag }: { bag: StepCalloutBagPlan }) {
  return (
    <Box
      data-testid="step-callout-bag"
      data-bag-status={bag.status}
      data-part-count={bag.partCount}
      data-page-range={`${bag.pageRange.start}-${bag.pageRange.end}`}
      data-policy-set-size={bag.policy.setSizeBand}
      data-step-count={bag.callouts.length}
      data-step-range={`${bag.stepRange.start}-${bag.stepRange.end}`}
      border="sm"
      borderColor="bagging.rowBorder"
      rounded="md"
      overflow="hidden"
      bg="bagging.subtleBg"
    >
      <Stack gap="3" p="3">
        <HStack justify="space-between" align="start" gap="3">
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text fontSize="sm" fontWeight="semibold">
              {bag.label} · {formatStepRange(bag.stepRange)}
            </Text>
            <Text color="fg.muted" fontSize="xs">
              Pages {formatNumberRange(bag.pageRange)}
              {" · "}
              {bag.callouts.length} {bag.callouts.length === 1 ? "callout" : "callouts"}
              {" · "}
              {bag.partCount} detected {bag.partCount === 1 ? "part" : "parts"}
            </Text>
          </Stack>
          <HStack gap="2" flexShrink={0}>
            <Badge colorPalette={bag.status === "draft" ? "green" : "yellow"} variant="subtle">
              {bag.status === "draft" ? "Draft" : "Review"}
            </Badge>
          </HStack>
        </HStack>

        {bag.reviewReasons.length > 0 ? (
          <Text color="fg.muted" fontSize="xs">
            {bag.reviewReasons.join("; ")}
          </Text>
        ) : null}

        <SimpleGrid columns={{ base: 1, xl: 2 }} gap="3">
          {bag.callouts.map((callout) => (
            <StepCalloutSourceCard key={callout.id} callout={callout} />
          ))}
        </SimpleGrid>

        <Stack gap="2">
          <HStack justify="space-between" align="center" gap="3">
            <Text color="fg.muted" fontSize="xs" fontWeight="semibold" textTransform="uppercase">
              Parts in this bag
            </Text>
            <Text color="fg.muted" fontSize="xs">
              Target {bag.policy.minParts}-{bag.policy.maxParts} parts · about {bag.policy.targetSteps} steps
            </Text>
          </HStack>
          {bag.partGroups.length > 0 ? (
            <SimpleGrid columns={{ base: 1, xl: 2 }} gap="2">
              {bag.partGroups.map((group) => (
                <StepCalloutBagPartGroupCard key={group.id} group={group} />
              ))}
            </SimpleGrid>
          ) : (
            <Text color="fg.muted" fontSize="sm">
              No part callouts detected in this bag.
            </Text>
          )}
        </Stack>
      </Stack>
    </Box>
  )
}

function StepCalloutSourceCard({ callout }: { callout: DetectedStepCallout }) {
  return (
    <Box
      data-testid="step-callout-card"
      data-page-number={callout.pageNumber}
      data-part-type-count={callout.partItems.length}
      data-source-region={formatSourceRegion(callout.sourceRegion)}
      data-step-index={callout.stepIndex}
      border="sm"
      borderColor="bagging.rowBorder"
      rounded="md"
      overflow="hidden"
      bg="white"
    >
      <Stack gap="2" p="2">
        <HStack justify="space-between" align="start" gap="3">
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text fontSize="sm" fontWeight="semibold">
              Step {callout.stepIndex} · Page {callout.pageNumber}
            </Text>
            <Text color="fg.muted" fontSize="xs">
              Callout {callout.indexOnPage}
              {" · "}
              {formatPartTypeCount(callout.partItems.length)}
            </Text>
          </Stack>
          <Badge colorPalette="green" variant="subtle" flexShrink={0}>
            {Math.round(callout.confidence * 100)}%
          </Badge>
        </HStack>

        <Box border="sm" borderColor="bagging.border" bg="white" rounded="sm" overflow="hidden" maxW="xl">
          <Image
            alt={`Step callout ${callout.indexOnPage} on page ${callout.pageNumber}`}
            display="block"
            src={callout.crop.dataUrl}
            w="full"
          />
        </Box>

        <Text color="fg.muted" fontSize="xs">
          {formatSourceRegion(callout.sourceRegion)}
        </Text>
      </Stack>
    </Box>
  )
}

function StepLocalMatchDebugPanel({ groups }: { groups: readonly StepLocalMatchDebugGroup[] }) {
  const groupedCount = groups.filter((group) => group.items.length > 1).length
  const singleCount = groups.length - groupedCount

  return (
    <Stack
      data-testid="step-local-match-debug"
      border="sm"
      borderColor="bagging.rowBorder"
      bg="bagging.subtleBg"
      rounded="md"
      p="3"
      gap="3"
    >
      <HStack justify="space-between" align="start" gap="3">
        <Stack gap="bagging.none" minW="bagging.zero">
          <Text fontSize="sm" fontWeight="semibold">
            Local match debug
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {groupedCount} grouped {groupedCount === 1 ? "match" : "matches"} · {singleCount} single{" "}
            {singleCount === 1 ? "item" : "items"}
          </Text>
        </Stack>
        <Badge colorPalette="blue" variant="subtle" flexShrink={0}>
          Local only
        </Badge>
      </HStack>

      {groups.length > 0 ? (
        <SimpleGrid columns={{ base: 1, xl: 2 }} gap="2">
          {groups.map((group) => (
            <StepLocalMatchDebugGroupCard key={group.id} group={group} />
          ))}
        </SimpleGrid>
      ) : (
        <Text color="fg.muted" fontSize="sm">
          No local part crops were detected for matching.
        </Text>
      )}
    </Stack>
  )
}

function StepLocalMatchDebugGroupCard({ group }: { group: StepLocalMatchDebugGroup }) {
  const isGrouped = group.items.length > 1
  const signatureStatus = getLocalDebugSignatureStatus(group)

  return (
    <Box
      data-testid="step-local-match-debug-group"
      data-confidence={group.confidence ?? ""}
      data-group-id={group.localGroupId ?? ""}
      data-item-count={group.items.length}
      data-signature-status={signatureStatus}
      data-status={isGrouped ? "grouped" : "single"}
      data-step-indexes={group.stepIndexes.join(",")}
      border="sm"
      borderColor="bagging.rowBorder"
      bg="white"
      rounded="sm"
      p="2"
    >
      <Stack gap="2">
        <HStack justify="space-between" align="start" gap="2">
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>
              {isGrouped ? `Local group ${group.label}` : "Single local item"}
            </Text>
            <Text color="fg.muted" fontSize="xs">
              Steps {formatStepIndexes(group.stepIndexes)}
              {group.stepGroupRange ? ` · Window ${formatNumberRange(group.stepGroupRange)}` : ""}
            </Text>
          </Stack>
          <HStack gap="1.5" flexShrink={0}>
            <Badge colorPalette={isGrouped ? "blue" : "yellow"} variant="subtle">
              {isGrouped ? "Grouped" : "Single"}
            </Badge>
            {group.confidence != null ? (
              <Badge colorPalette="gray" variant="subtle">
                {Math.round(group.confidence * 100)}%
              </Badge>
            ) : null}
          </HStack>
        </HStack>

        <HStack gap="2" flexWrap="wrap">
          <Badge colorPalette={signatureStatus === "current" ? "green" : "orange"} variant="subtle">
            {signatureStatus === "current" ? "current signature" : "legacy signature"}
          </Badge>
          <Text color="fg.muted" fontSize="xs">
            {group.items.length} detected {group.items.length === 1 ? "item" : "items"}
          </Text>
        </HStack>

        <SimpleGrid columns={{ base: 1, sm: Math.min(3, Math.max(1, group.items.length)) }} gap="2">
          {group.items.map((entry) => (
            <StepLocalMatchDebugItemCard key={entry.item.id} entry={entry} />
          ))}
        </SimpleGrid>
      </Stack>
    </Box>
  )
}

function StepLocalMatchDebugItemCard({ entry }: { entry: StepLocalMatchDebugItem }) {
  const quantity = entry.item.quantity.value ?? "?"
  const rejectedMatches = entry.item.localImageRejectedMatches ?? []

  return (
    <Box
      data-testid="step-local-match-debug-item"
      data-color={entry.item.detectedColor.name}
      data-item-id={entry.item.id}
      data-quantity={quantity}
      data-step-index={entry.callout.stepIndex}
      border="sm"
      borderColor="bagging.border"
      bg="bagging.subtleBg"
      rounded="xs"
      p="1.5"
    >
      <Stack gap="1">
        <HStack justify="space-between" gap="2">
          <Text color="fg.muted" fontSize="2xs" fontWeight="semibold">
            Step {entry.callout.stepIndex} · Item {entry.item.indexOnCallout}
          </Text>
          <Badge colorPalette="green" variant="subtle">
            x{quantity}
          </Badge>
        </HStack>
        <Box h="20" display="grid" placeItems="center">
          <Image
            alt={`Local match crop step ${entry.callout.stepIndex} item ${entry.item.indexOnCallout}`}
            display="block"
            maxH="20"
            objectFit="contain"
            src={entry.item.partCrop.dataUrl}
            w="full"
          />
        </Box>
        <HStack gap="1.5" minW="bagging.zero">
          <Box
            aria-hidden="true"
            border="sm"
            borderColor="blackAlpha.300"
            boxSize="2.5"
            flexShrink={0}
            rounded="xs"
            style={{ backgroundColor: entry.item.detectedColor.hex }}
          />
          <Text color="fg.muted" fontSize="2xs" lineClamp={1}>
            {entry.item.detectedColor.name}
          </Text>
        </HStack>
        {rejectedMatches.length > 0 ? (
          <Stack gap="1.5" data-testid="step-local-match-rejections">
            <Text color="fg.muted" fontSize="2xs" fontWeight="semibold" textTransform="uppercase">
              Rejected matches
            </Text>
            <SimpleGrid columns={{ base: 1, md: Math.min(2, rejectedMatches.length) }} gap="1.5">
              {rejectedMatches.map((match) => (
                <StepLocalRejectedMatchCard key={`${match.candidateItemId}:${match.reason}`} match={match} />
              ))}
            </SimpleGrid>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  )
}

function StepLocalRejectedMatchCard({ match }: { match: DetectedStepCalloutLocalImageRejectedMatch }) {
  return (
    <Box
      data-testid="step-local-match-rejection"
      data-candidate-item-id={match.candidateItemId}
      data-candidate-item-index={match.candidateItemIndex}
      data-candidate-step-index={match.candidateStepIndex}
      data-color-score={match.colorScore}
      data-reason={match.reason}
      data-score={match.score}
      data-shape-score={match.shapeScore}
      border="sm"
      borderColor="orange.200"
      bg="orange.50"
      rounded="xs"
      p="1.5"
    >
      <Stack gap="1">
        <HStack justify="space-between" align="start" gap="2">
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text fontSize="2xs" fontWeight="semibold">
              Step {match.candidateStepIndex} · Item {match.candidateItemIndex}
            </Text>
            <Text color="orange.700" fontSize="2xs" lineClamp={2}>
              {match.reason}
            </Text>
          </Stack>
          <Badge colorPalette="orange" variant="subtle" flexShrink={0}>
            {Math.round(match.score * 100)}%
          </Badge>
        </HStack>

        <Box h="16" display="grid" placeItems="center">
          <Image
            alt={`Rejected local match candidate step ${match.candidateStepIndex} item ${match.candidateItemIndex}`}
            display="block"
            maxH="16"
            objectFit="contain"
            src={match.candidateCrop.dataUrl}
            w="full"
          />
        </Box>

        <HStack gap="1.5" flexWrap="wrap">
          <MetricBadge label="Shape" value={match.shapeScore} />
          <MetricBadge label="Struct" value={match.structureScore} />
          <MetricBadge label="Color" value={match.colorScore} />
        </HStack>
      </Stack>
    </Box>
  )
}

function MetricBadge({ label, value }: { label: string; value: number }) {
  return (
    <Badge colorPalette={value >= 0.9 ? "green" : value >= 0.78 ? "yellow" : "orange"} variant="subtle">
      {label} {Math.round(value * 100)}%
    </Badge>
  )
}

function StepCalloutBagPartGroupCard({
  group,
}: {
  group: StepCalloutBagPartGroup
}) {
  const title = getPartGroupTitle(group)

  return (
    <Box
      data-testid="step-callout-bag-part-group"
      data-detected-color={group.colorName}
      data-catalogue-part-number={group.cataloguePartNumber ?? ""}
      data-color-id={group.colorId ?? ""}
      data-detected-color-hex={group.colorHex}
      data-detected-color-confidence={group.colorConfidence}
      data-item-count={group.itemCount}
      data-match-confidence={group.matchConfidence ?? ""}
      data-match-row-id={group.rowId ?? ""}
      data-match-status={group.matchStatus}
      data-fallback-preview-image-url={group.fallbackPreviewImageUrl ?? ""}
      data-part-name={group.partName ?? ""}
      data-part-number={group.partNumber ?? ""}
      data-preview-image-url={group.previewImageUrl ?? ""}
      data-quantity={group.quantity}
      data-quantity-confidence={group.quantityConfidence}
      data-quantity-estimated={group.quantityIsEstimated ? "true" : "false"}
      data-source-item-ids={group.sourceItemIds.join(",")}
      data-step-indexes={group.stepIndexes.join(",")}
      border="sm"
      borderColor="bagging.rowBorder"
      bg="white"
      rounded="sm"
      p="2"
    >
      <Stack gap="2" minW="bagging.zero">
        <HStack justify="space-between" align="start" gap="3" minW="bagging.zero">
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>
              {title}
            </Text>
            <Text color="fg.muted" fontSize="xs">
              Local visual group
            </Text>
          </Stack>
          <HStack gap="2" align="center" minW="bagging.zero" flexWrap="wrap">
            <Badge colorPalette={group.quantityIsEstimated ? "yellow" : "green"} variant="subtle" flexShrink={0}>
              x{group.quantity}{group.quantityIsEstimated ? " est." : ""}
            </Badge>
            <Text color="fg.muted" fontSize="xs">
              {group.itemCount} detected {group.itemCount === 1 ? "item" : "items"}
            </Text>
            <Badge colorPalette={group.itemCount > 1 ? "blue" : "yellow"} variant="subtle" flexShrink={0}>
              {group.itemCount > 1 ? "Grouped" : "Single"}
            </Badge>
          </HStack>
        </HStack>

        <SimpleGrid columns={1} gap="2">
          <StepPartComparisonImage
            alt={`Callout crop for ${title}`}
            label="Callout"
            src={group.representativeCrop.dataUrl}
          />
        </SimpleGrid>

        <Stack gap="1.5" minW="bagging.zero">
          <HStack gap="2" align="center" minW="bagging.zero" flexWrap="wrap">
            <Box
              aria-hidden="true"
              border="sm"
              borderColor="blackAlpha.300"
              boxSize="3"
              flexShrink={0}
              rounded="xs"
              style={{ backgroundColor: group.colorHex }}
            />
            <Text color="fg.muted" fontSize="xs">
              {group.colorName}
            </Text>
            <Text color="fg.muted" fontSize="xs">
              Qty {Math.round(group.quantityConfidence * 100)}%
            </Text>
            <Text color="fg.muted" fontSize="xs">
              Color {Math.round(group.colorConfidence * 100)}%
            </Text>
          </HStack>
          <Text color="fg.muted" fontSize="xs">
            Steps {formatStepIndexes(group.stepIndexes)}
          </Text>
        </Stack>
      </Stack>
    </Box>
  )
}

function StepPartComparisonImage({
  alt,
  fallbackSrc,
  label,
  src,
}: {
  alt: string
  fallbackSrc?: string
  label: string
  src: string
}) {
  const [failedSrcs, setFailedSrcs] = useState<readonly string[]>([])
  const resolvedSrc = !failedSrcs.includes(src)
    ? src
    : fallbackSrc && !failedSrcs.includes(fallbackSrc)
      ? fallbackSrc
      : null

  function handleImageError() {
    if (!resolvedSrc) {
      return
    }

    setFailedSrcs((current) => current.includes(resolvedSrc) ? current : [...current, resolvedSrc])
  }

  return (
    <Box border="sm" borderColor="bagging.border" bg="bagging.subtleBg" rounded="xs" p="1">
      <Stack gap="1" align="stretch">
        <Text color="fg.muted" fontSize="2xs" fontWeight="semibold" textTransform="uppercase">
          {label}
        </Text>
        <Box h="24" display="grid" placeItems="center">
          {resolvedSrc ? (
            <Image
              alt={alt}
              display="block"
              maxH="24"
              objectFit="contain"
              src={resolvedSrc}
              w="full"
              onError={handleImageError}
            />
          ) : (
            <Stack align="center" gap="1" color="fg.muted" px="2" textAlign="center">
              <Box as={ImageIcon} aria-hidden="true" boxSize="4" />
              <Text fontSize="2xs">Preview unavailable</Text>
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  )
}

function getPartGroupTitle(group: StepCalloutBagPartGroup) {
  return `Local part ${group.displayIndex}`
}

function getStepLocalMatchDebugGroups(result: StepCalloutDetectionResult): StepLocalMatchDebugGroup[] {
  const groupsById = new Map<string, MutableStepLocalMatchDebugGroup>()

  for (const callout of result.callouts) {
    for (const item of callout.partItems) {
      const localGroupId = item.localImageMatch?.groupId ?? null
      const groupId = localGroupId ?? `single:${item.id}`
      const group = groupsById.get(groupId) ?? {
        confidence: item.localImageMatch?.confidence ?? null,
        id: groupId,
        items: [],
        label: item.localImageMatch ? `m${item.localImageMatch.groupIndex}` : `item ${item.indexOnCallout}`,
        localGroupId,
        stepGroupIndex: item.localImageMatch?.stepGroupIndex ?? Number.MAX_SAFE_INTEGER,
        stepGroupRange: item.localImageMatch?.stepGroupRange ?? null,
        stepIndexes: new Set<number>(),
      }

      group.items.push({ callout, item })
      group.stepIndexes.add(callout.stepIndex)
      groupsById.set(groupId, group)
    }
  }

  return [...groupsById.values()]
    .sort((left, right) =>
      left.stepGroupIndex - right.stepGroupIndex ||
      (left.items[0]?.callout.stepIndex ?? 0) - (right.items[0]?.callout.stepIndex ?? 0) ||
      (left.items[0]?.item.indexOnCallout ?? 0) - (right.items[0]?.item.indexOnCallout ?? 0)
    )
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) =>
        left.callout.stepIndex - right.callout.stepIndex ||
        left.item.indexOnCallout - right.item.indexOnCallout
      ),
      stepIndexes: [...group.stepIndexes].sort((left, right) => left - right),
    }))
}

function getLocalDebugSignatureStatus(group: StepLocalMatchDebugGroup) {
  return group.items.every((entry) => hasCurrentLocalDebugSignature(entry.item.imageSignature ?? null))
    ? "current"
    : "legacy"
}

function hasCurrentLocalDebugSignature(signature: DetectedStepCalloutPartImageSignature | null) {
  return Boolean(
    signature?.bottomProfile &&
    signature.topProfile &&
    signature.boundsHeight &&
    signature.boundsWidth &&
    signature.pixelCount,
  )
}

function getStepCalloutBagSummary(plan: StepCalloutBaggingPlan, result: StepCalloutDetectionResult) {
  const pageText = `${result.scannedPageNumbers.length} ${result.scannedPageNumbers.length === 1 ? "page" : "pages"}`
  const bagText = `${plan.bags.length} draft ${plan.bags.length === 1 ? "bag" : "bags"}`
  const calloutText = `${plan.detectedStepCount} ${plan.detectedStepCount === 1 ? "callout" : "callouts"}`
  const partText = `${plan.detectedPartCount} detected ${plan.detectedPartCount === 1 ? "part" : "parts"}`
  const scopeText = result.pageLimit == null
    ? "full non-inventory manual"
    : `first ${result.pageLimit} non-inventory pages`

  return `${bagText} from ${calloutText} and ${partText} across ${pageText}; ${scopeText}.`
}

export function getStepCalloutQuantityDiagnostic(
  plan: StepCalloutBaggingPlan,
  inventoryPartCount?: number | null,
): StepCalloutQuantityDiagnostic | null {
  return getStepCalloutQuantityDiagnosticForDetectedPartCount(plan.detectedPartCount, inventoryPartCount)
}

export function getStepCalloutQuantityDiagnosticForResult(
  result: StepCalloutDetectionResult,
  calloutMultipliers: StepCalloutMultiplierMap,
  inventoryPartCount?: number | null,
): StepCalloutQuantityDiagnostic | null {
  return getStepCalloutQuantityDiagnosticForDetectedPartCount(
    getStepCalloutTotalQuantity(result, calloutMultipliers),
    inventoryPartCount,
  )
}

function getStepCalloutQuantityDiagnosticForDetectedPartCount(
  detectedPartCount: number,
  inventoryPartCount?: number | null,
): StepCalloutQuantityDiagnostic | null {
  if (inventoryPartCount == null || inventoryPartCount === detectedPartCount) {
    return null
  }

  const overagePartCount = Math.max(0, detectedPartCount - inventoryPartCount)
  const missingPartCount = Math.max(0, inventoryPartCount - detectedPartCount)

  return {
    detectedPartCount,
    kind: overagePartCount > 0 ? "overage" : "missing",
    inventoryPartCount,
    missingPartCount,
    overagePartCount,
  }
}

function getStepCalloutPartDiagnosticForResult(
  result: StepCalloutDetectionResult,
  calloutMultipliers: StepCalloutMultiplierMap,
): StepCalloutPartDiagnosticData {
  return {
    partTypeCount: result.callouts.reduce((sum, callout) => sum + callout.partItems.length, 0),
    totalQuantity: getStepCalloutTotalQuantity(result, calloutMultipliers),
  }
}

function getStepBagChecklistRows(
  plan: StepCalloutBaggingPlan,
  calloutMultipliers: StepCalloutMultiplierMap,
): StepBagChecklistRow[] {
  return plan.bags.flatMap((bag, bagIndex) =>
    bag.callouts.flatMap((callout) => {
      const multiplier = getStepCalloutMultiplier(callout.id, calloutMultipliers)

      return callout.partItems.map((item) => {
        const quantity = (item.quantity.value ?? 1) * multiplier

        return {
          bagId: bag.id,
          bagLabel: bag.label,
          bagNumber: bagIndex + 1,
          bagStepRange: bag.stepRange,
          calloutCrop: callout.crop,
          calloutId: callout.id,
          calloutIndexOnPage: callout.indexOnPage,
          colorConfidence: item.detectedColor.confidence,
          colorHex: item.detectedColor.hex,
          colorName: item.detectedColor.name,
          id: createStepCalloutBagChecklistRowId({
            bagId: bag.id,
            calloutId: callout.id,
            itemId: item.id,
            multiplier,
          }),
          itemCount: 1,
          itemIndex: item.indexOnCallout,
          multiplier,
          quantity,
          quantityConfidence: item.quantity.confidence,
          quantityIsEstimated: item.quantity.value == null,
          quantityLabelCrop: item.quantityLabel.crop,
          pageNumber: callout.pageNumber,
          representativeCrop: item.partCrop,
          sourceItemIds: [item.id],
          stepIndex: callout.stepIndex,
          stepIndexes: [callout.stepIndex],
        } satisfies StepBagChecklistRow
      })
    })
  )
}

function getStepBagChecklistSections(
  rows: readonly StepBagChecklistRow[],
  groupMode: StepBagGroupMode,
): StepBagChecklistSectionData[] {
  if (groupMode === "color") {
    const sectionsByColor = new Map<string, StepBagChecklistRow[]>()
    for (const row of rows) {
      const colorKey = normalizeStepBagColorName(row.colorName)
      const colorRows = sectionsByColor.get(colorKey)
      if (colorRows) {
        colorRows.push(row)
      } else {
        sectionsByColor.set(colorKey, [row])
      }
    }

    return [...sectionsByColor.entries()]
      .map(([colorKey, colorRows]) => {
        const firstRow = colorRows[0]
        const bagNumbers = getUniqueSortedNumbers(colorRows.map((row) => row.bagNumber))

        return {
          colorHex: firstRow?.colorHex ?? "",
          description: `${colorRows.length} ${colorRows.length === 1 ? "row" : "rows"} · Bags ${formatNumberList(bagNumbers)}`,
          id: `color:${colorKey}`,
          label: firstRow?.colorName ?? "Unknown color",
          rows: sortStepBagRows(colorRows),
          totalQuantity: getStepBagRowsQuantity(colorRows),
        } satisfies StepBagChecklistSectionData
      })
      .sort((left, right) => compareColorNames(left.label, right.label))
  }

  const sectionsByBag = new Map<string, StepBagChecklistRow[]>()
  for (const row of rows) {
    const bagRows = sectionsByBag.get(row.bagId)
    if (bagRows) {
      bagRows.push(row)
    } else {
      sectionsByBag.set(row.bagId, [row])
    }
  }

  return [...sectionsByBag.entries()].map(([bagId, bagRows]) => {
    const firstRow = bagRows[0]
    const stepRange = firstRow?.bagStepRange ?? { end: 0, start: 0 }

    return {
      colorHex: null,
      description: `${bagRows.length} ${bagRows.length === 1 ? "row" : "rows"} · ${formatStepRange(stepRange)}`,
      id: `bag:${bagId}`,
      label: firstRow ? `${firstRow.bagLabel} · ${formatStepRange(stepRange)}` : "Bag",
      rows: sortStepBagRows(bagRows),
      totalQuantity: getStepBagRowsQuantity(bagRows),
    } satisfies StepBagChecklistSectionData
  })
}

function sortStepBagRows(rows: readonly StepBagChecklistRow[]) {
  return [...rows].sort((left, right) =>
    left.bagNumber - right.bagNumber ||
    left.stepIndex - right.stepIndex ||
    compareColorNames(left.colorName, right.colorName) ||
    left.itemIndex - right.itemIndex
  )
}

function getStepBagChecklistCompletion(
  rows: readonly StepBagChecklistRow[],
  checkedRowIds: ReadonlySet<string>,
) {
  const totalQuantity = getStepBagRowsQuantity(rows)
  const completedQuantity = rows.reduce(
    (sum, row) => (checkedRowIds.has(row.id) ? sum + row.quantity : sum),
    0,
  )

  return {
    completedQuantity,
    percent: totalQuantity > 0 ? Math.round((completedQuantity / totalQuantity) * 100) : 0,
    totalQuantity,
  }
}

function getStepBagRowsQuantity(rows: readonly StepBagChecklistRow[]) {
  return rows.reduce((sum, row) => sum + row.quantity, 0)
}

function getStepBagSectionIntrinsicHeight(rowCount: number) {
  return Math.min(1600, Math.max(180, rowCount * 72))
}

function getUniqueSortedNumbers(values: readonly number[]) {
  return [...new Set(values)].sort((left, right) => left - right)
}

function formatNumberList(values: readonly number[]) {
  if (values.length === 0) {
    return "unknown"
  }

  return values.join(", ")
}

function normalizeStepBagColorName(colorName: string) {
  return colorName
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\bbluish\s+gr[ae]y\b/g, "bluish gray")
    .replace(/\bgr[ae]y\b/g, "gray")
    .replace(/\s+/g, " ")
    || "unknown color"
}

function formatPartTypeCount(count: number) {
  return `${count} ${count === 1 ? "part type" : "part types"}`
}

function formatTotalPartQuantity(count: number) {
  return `${stepQuantityFormatter.format(count)} total ${count === 1 ? "part" : "parts"}`
}

function formatCalloutPartSummary(callout: DetectedStepCallout, multiplier: number) {
  return `${formatPartTypeCount(callout.partItems.length)} · ${formatTotalPartQuantity(getCalloutTotalQuantity(callout, multiplier))}`
}

function getStepCalloutTotalQuantity(
  result: StepCalloutDetectionResult,
  calloutMultipliers: StepCalloutMultiplierMap,
) {
  return result.callouts.reduce(
    (sum, callout) => sum + getCalloutTotalQuantity(callout, getStepCalloutMultiplier(callout.id, calloutMultipliers)),
    0,
  )
}

function getCalloutTotalQuantity(callout: DetectedStepCallout, multiplier: number) {
  return callout.partItems.reduce((sum, item) => sum + getCalloutItemQuantity(item) * multiplier, 0)
}

function getCalloutItemQuantity(item: DetectedStepCalloutPartItem) {
  const value = item.quantity.value

  return value != null && Number.isFinite(value) && value > 0 ? value : 1
}

function formatStepRange(range: { end: number; start: number }) {
  return range.start === range.end ? `Step ${range.start}` : `Steps ${range.start}-${range.end}`
}

function formatNumberRange(range: { end: number; start: number }) {
  return range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`
}

function formatStepIndexes(stepIndexes: readonly number[]) {
  if (stepIndexes.length === 0) {
    return "unknown"
  }

  return stepIndexes.join(", ")
}

function formatSourceRegion(region: DetectedStepCallout["sourceRegion"]) {
  return `x${region.x} y${region.y} w${region.width} h${region.height} ${region.unit}`
}

function getCalloutsByPageNumber(callouts: readonly DetectedStepCallout[]) {
  const calloutsByPage = new Map<number, DetectedStepCallout[]>()

  for (const callout of callouts) {
    const pageCallouts = calloutsByPage.get(callout.pageNumber)
    if (pageCallouts) {
      pageCallouts.push(callout)
    } else {
      calloutsByPage.set(callout.pageNumber, [callout])
    }
  }

  return calloutsByPage
}

function mergePageRenderSources(
  primaryRenders: readonly PdfPrivatePageRender[],
  secondaryRenders: readonly PdfPrivatePageRender[],
) {
  const pageRenderByNumber = new Map<number, PdfPrivatePageRender>()

  for (const pageRender of secondaryRenders) {
    pageRenderByNumber.set(pageRender.pageNumber, pageRender)
  }
  for (const pageRender of primaryRenders) {
    pageRenderByNumber.set(pageRender.pageNumber, pageRender)
  }

  return pageRenderByNumber
}

function mergePageRenderList(
  current: readonly PdfPrivatePageRender[],
  incoming: readonly PdfPrivatePageRender[],
) {
  if (incoming.length === 0) {
    return current
  }

  return [...mergePageRenderSources(incoming, current).values()].sort(
    (left, right) => left.pageNumber - right.pageNumber,
  )
}

function addPageNumbersToSet(current: ReadonlySet<number>, pageNumbers: readonly number[]) {
  if (pageNumbers.length === 0) {
    return current
  }

  const next = new Set(current)
  const previousSize = next.size
  for (const pageNumber of pageNumbers) {
    next.add(pageNumber)
  }

  return next.size === previousSize ? current : next
}

function removePageNumbersFromSet(current: ReadonlySet<number>, pageNumbers: readonly number[]) {
  if (pageNumbers.length === 0) {
    return current
  }

  const next = new Set(current)
  for (const pageNumber of pageNumbers) {
    next.delete(pageNumber)
  }

  return next.size === current.size ? current : next
}

function parsePageNumberKey(pageNumberKey: string) {
  return pageNumberKey
    .split(",")
    .map((pageNumber) => Number(pageNumber))
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
}

function getStepCalloutPageRenderStatus(
  pageNumber: number,
  pageRender: PdfPrivatePageRender | null,
  loadingPageNumbers: ReadonlySet<number>,
  unavailablePageNumbers: ReadonlySet<number>,
): StepCalloutPageRenderStatus {
  if (pageRender?.dataUrl) {
    return "idle"
  }
  if (loadingPageNumbers.has(pageNumber)) {
    return "loading"
  }
  if (unavailablePageNumbers.has(pageNumber)) {
    return "unavailable"
  }

  return "idle"
}

function getStepCalloutMatchingRows(result: StepCalloutDetectionResult): StepCalloutMatchingRowData[] {
  return result.callouts.map((callout): StepCalloutMatchingRowData => ({
    callout,
    id: `callout:${callout.id}`,
    pageNumber: callout.pageNumber,
    sortCalloutIndex: callout.indexOnPage,
    stepIndex: callout.stepIndex,
  }))
}

function getStepCalloutMatchingPageGroups(
  rows: readonly StepCalloutMatchingRowData[],
  scannedPageNumbers: readonly number[],
) {
  const groupByPageNumber = new Map<number, StepCalloutMatchingRowData[]>()

  for (const pageNumber of scannedPageNumbers) {
    groupByPageNumber.set(pageNumber, [])
  }

  for (const row of rows) {
    const groupRows = groupByPageNumber.get(row.pageNumber)
    if (groupRows) {
      groupRows.push(row)
    } else {
      groupByPageNumber.set(row.pageNumber, [row])
    }
  }

  return [...groupByPageNumber.entries()]
    .sort(([leftPageNumber], [rightPageNumber]) => leftPageNumber - rightPageNumber)
    .map(([pageNumber, groupRows]): StepCalloutMatchingPageGroupData => ({
      pageNumber,
      rows: [...groupRows].sort((left, right) =>
        left.stepIndex - right.stepIndex ||
        left.sortCalloutIndex - right.sortCalloutIndex
      ),
    }))
}

type StepCalloutMatchingRowData = {
  callout: DetectedStepCallout
  id: string
  pageNumber: number
  sortCalloutIndex: number
  stepIndex: number
}

type StepCalloutMatchingPageGroupData = {
  pageNumber: number
  rows: readonly StepCalloutMatchingRowData[]
}

type StepLocalMatchDebugItem = {
  callout: DetectedStepCallout
  item: DetectedStepCalloutPartItem
}

type StepLocalMatchDebugGroup = {
  confidence: number | null
  id: string
  items: readonly StepLocalMatchDebugItem[]
  label: string
  localGroupId: string | null
  stepGroupIndex: number
  stepGroupRange: { end: number; start: number } | null
  stepIndexes: readonly number[]
}

type MutableStepLocalMatchDebugGroup = Omit<StepLocalMatchDebugGroup, "items" | "stepIndexes"> & {
  items: StepLocalMatchDebugItem[]
  stepIndexes: Set<number>
}

type StepBagChecklistCompletion = {
  completedQuantity: number
  percent: number
  totalQuantity: number
}

type StepCalloutPartDiagnosticData = {
  partTypeCount: number
  totalQuantity: number
}

export type StepCalloutQuantityDiagnostic = {
  detectedPartCount: number
  inventoryPartCount: number
  kind: "missing" | "overage"
  missingPartCount: number
  overagePartCount: number
}

type StepBagChecklistRow = {
  bagId: string
  bagLabel: string
  bagNumber: number
  bagStepRange: { end: number; start: number }
  calloutCrop: DetectedStepCallout["crop"]
  calloutId: string
  calloutIndexOnPage: number
  colorConfidence: number
  colorHex: string
  colorName: string
  id: string
  itemCount: number
  itemIndex: number
  multiplier: number
  pageNumber: number
  quantity: number
  quantityConfidence: number
  quantityIsEstimated: boolean
  quantityLabelCrop: DetectedStepCalloutPartItem["quantityLabel"]["crop"]
  representativeCrop: StepCalloutBagPartGroup["representativeCrop"]
  sourceItemIds: readonly string[]
  stepIndex: number
  stepIndexes: readonly number[]
}

type StepBagChecklistSectionData = {
  colorHex: string | null
  description: string
  id: string
  label: string
  rows: readonly StepBagChecklistRow[]
  totalQuantity: number
}
