import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import {
  Accordion,
  Badge,
  Box,
  Grid,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react"
import {
  AlertTriangle,
  Minus,
  PackageCheck,
  Plus,
  ScanSearch,
} from "lucide-react"
import {
  BagsChecklistPanel,
  NoBaggableCalloutsPanel,
} from "./bags-checklist-panel"
import { displayColorSwatchHex } from "./bagging-color-display"
import { Panel } from "./panel"
import { PartItemsTable, type PartItemsTableRow } from "./part-items-table"
import { PreviewCard, PreviewTextHandle } from "./preview-card"
import type { PartMatchPrecomputeState } from "./use-precomputed-part-match-groups"
import { IconButtonTooltip } from "@/components/ui/icon-button-tooltip"
import {
  type StepCalloutBagRow,
  type StepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"
import {
  MAX_STEP_CALLOUT_MULTIPLIER,
  calloutMultiplierFor,
  normalizeStepCalloutMultiplier,
  type StepCalloutMultiplierMap,
} from "@/features/bagging/step-callout-multipliers"
import type {
  DetectedStepCallout,
  DetectedStepCalloutPartItem,
  StepCalloutDetectionResult,
  StepPageAttentionItem,
} from "@/features/steps/step-detection-contracts"
import {
  type PreviewAssetStore,
  type RegionPreviewSource,
} from "@/features/steps/preview-assets"
import { COUNT_LABELS, formatCount } from "@/lib/count-format"

export type { PartMatchPrecomputeProgress } from "./part-match-group-progress"
export {
  usePrecomputedPartMatchGroups,
  type PartMatchPrecomputeState,
} from "./use-precomputed-part-match-groups"

const PART_ROW_PREVIEW_MAX_ZOOM_SCALE = 3
const PART_ROW_PREVIEW_THUMBNAIL_MAX_SIZE = 64
const BUILD_STEPS_RENDER_ROOT_MARGIN_VIEWPORTS = 2
const BUILD_STEPS_RENDER_ROOT_MARGIN_MIN_PX = 1_200
const BUILD_STEP_SKELETON_PART_ROW_HEIGHT_PX = 88
const BUILD_STEP_SKELETON_TABLE_HEADER_HEIGHT_PX = 42

export type BuildStepAnalysisProgress = {
  activePageValue: string
  scannedPagesValue: string
  detectedCalloutsValue: string
  detectedPartItemsValue: string
  phaseLabel: string
  progress: number
  statusText: string
}

type OutputTabValue = "build-steps" | "bags"

export const OutputTabs = memo(function OutputTabs({
  bagRows,
  baggingPlan,
  calloutMultipliers,
  checkedBagRowIds,
  detectionResult,
  hasManual,
  isProcessing,
  onBagRowCheckedChange,
  onBuildStepPagePriorityChange,
  onCalloutMultiplierChange,
  pageCount,
  partMatchPrecompute,
  previewAssetStore,
  analysisProgress,
}: {
  bagRows: StepCalloutBagRow[]
  baggingPlan: StepCalloutBaggingPlan | null
  calloutMultipliers: StepCalloutMultiplierMap
  checkedBagRowIds: ReadonlySet<string>
  detectionResult: StepCalloutDetectionResult | null
  hasManual: boolean
  isProcessing: boolean
  onBagRowCheckedChange: (rowId: string, checked: boolean) => void
  onBuildStepPagePriorityChange?: (pageNumber: number, isPriority: boolean) => void
  onCalloutMultiplierChange: (calloutId: string, multiplier: number) => void
  pageCount: number | null
  partMatchPrecompute: PartMatchPrecomputeState
  previewAssetStore: PreviewAssetStore
  analysisProgress: BuildStepAnalysisProgress | null
}) {
  const [activeTab, setActiveTab] = useState<OutputTabValue>("build-steps")
  const [hasMountedBagsTab, setHasMountedBagsTab] = useState(false)
  const shouldMountBagsTab = activeTab === "bags" || hasMountedBagsTab
  const buildStepsDetail = detectionResult
    ? `${formatCount(detectionResult.callouts.length, COUNT_LABELS.callout)} across ${formatCount(
        detectionResult.scannedPageNumbers.length,
        COUNT_LABELS.scannedPage,
      )}.`
    : isProcessing
      ? "Analyzing manual. Build steps appear after part extraction."
    : pageCount
    ? `${formatCount(pageCount, COUNT_LABELS.page)} ready for step scanning. Step-callout detection arrives next.`
    : hasManual
      ? "Manual selected. Step-callout scanning arrives after intake."
      : "Waiting for analysis"

  return (
    <Panel p={0} overflow="visible">
      <Tabs.Root
        value={activeTab}
        variant="line"
        onValueChange={(details) => {
          const nextTab = details.value === "bags" ? "bags" : "build-steps"

          setActiveTab(nextTab)

          if (nextTab === "bags") {
            setHasMountedBagsTab(true)
          }
        }}
      >
        <Tabs.List
          bg="bagging.surface"
          borderBottomColor="bagging.border"
          borderBottomWidth="1px"
          borderTopRadius="panel"
          overflow="visible"
          position={{ xl: "sticky" }}
          px={{ base: 4, md: 3 }}
          pt={{ base: 3, md: 2 }}
          top={{ xl: 4 }}
          zIndex={6}
          _before={{
            bg: "bagging.canvas",
            content: '""',
            display: { base: "none", xl: "block" },
            h: 4,
            insetInline: "-1px",
            pointerEvents: "none",
            position: "absolute",
            top: -4,
            zIndex: -1,
          }}
          _after={{
            bg: "bagging.border",
            content: '""',
            display: "block",
            h: "1px",
            insetInline: 0,
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            zIndex: 1,
          }}
        >
          <Tabs.Trigger value="build-steps">
            <ScanSearch size={16} aria-hidden="true" />
            Build steps
          </Tabs.Trigger>
          <Tabs.Trigger value="bags">
            <PackageCheck size={16} aria-hidden="true" />
            Bags
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="build-steps" p={{ base: 4, md: 3 }}>
          {detectionResult ? (
            <BuildStepsPanel
              calloutMultipliers={calloutMultipliers}
              onPagePriorityChange={onBuildStepPagePriorityChange}
              previewAssetStore={previewAssetStore}
              result={detectionResult}
              onCalloutMultiplierChange={onCalloutMultiplierChange}
            />
          ) : analysisProgress ? (
            <BuildStepsProgressPanel progress={analysisProgress} />
          ) : (
            <PendingPanel
              badge={pageCount ? "ready" : hasManual ? "selected" : "waiting"}
              title="Build steps"
              detail={buildStepsDetail}
            />
          )}
        </Tabs.Content>

        <Tabs.Content value="bags" p={{ base: 4, md: 3 }}>
          {shouldMountBagsTab ? (
            baggingPlan ? (
              baggingPlan.bags.length > 0 ? (
                <BagsChecklistPanel
                  checkedRowIds={checkedBagRowIds}
                  partMatchPrecompute={partMatchPrecompute}
                  plan={baggingPlan}
                  previewAssetStore={previewAssetStore}
                  rows={bagRows}
                  onRowCheckedChange={onBagRowCheckedChange}
                />
              ) : (
                <NoBaggableCalloutsPanel plan={baggingPlan} />
              )
            ) : (
              <PendingPanel
                badge="pending"
                title="Bag checklist"
                detail="Bag assignments and packing checklists will appear after recognition and bagging are available."
              />
            )
          ) : null}
        </Tabs.Content>

      </Tabs.Root>
    </Panel>
  )
})

function BuildStepsPanel({
  calloutMultipliers,
  onPagePriorityChange,
  previewAssetStore,
  result,
  onCalloutMultiplierChange,
}: {
  calloutMultipliers: StepCalloutMultiplierMap
  onPagePriorityChange?: (pageNumber: number, isPriority: boolean) => void
  previewAssetStore: PreviewAssetStore
  result: StepCalloutDetectionResult
  onCalloutMultiplierChange: (calloutId: string, multiplier: number) => void
}) {
  const pageGroups = useMemo(() => createBuildStepPageGroups(result), [result])
  const pageValueKey = pageGroups.map((pageGroup) => pageValue(pageGroup.pageNumber)).join(",")
  const defaultExpandedPageValues = createDefaultExpandedPageValues(pageGroups)
  const [expandedPages, setExpandedPages] = useState(() => ({
    key: pageValueKey,
    values: defaultExpandedPageValues,
  }))
  const activeExpandedPageValues = expandedPages.key === pageValueKey
    ? expandedPages.values
    : defaultExpandedPageValues
  const expandedPageValueSet = new Set(activeExpandedPageValues)

  return (
    <Stack gap={{ base: 4, md: 3 }} minH={{ base: "360px", md: "520px" }}>
      <HStack justify="space-between" align="start">
        <Stack gap={1}>
          <Text fontSize={{ base: "xl", md: "md" }} fontWeight="semibold">
            Build steps
          </Text>
          <Text color="bagging.muted" fontSize={{ base: "md", md: "sm" }}>
            {formatCount(result.callouts.length, COUNT_LABELS.callout)} across{" "}
            {formatCount(result.scannedPageNumbers.length, COUNT_LABELS.scannedPage)}
          </Text>
        </Stack>
        <Badge colorPalette={result.status === "detected" ? "green" : "orange"}>
          {result.status === "detected" ? "detected" : "empty"}
        </Badge>
      </HStack>

      <Accordion.Root
        collapsible
        display="flex"
        flexDirection="column"
        gap={3}
        multiple
        onValueChange={(details) =>
          setExpandedPages({
            key: pageValueKey,
            values: details.value,
          })
        }
        overflow="visible"
        value={activeExpandedPageValues}
      >
        {pageGroups.map((pageGroup) => {
          const value = pageValue(pageGroup.pageNumber)
          const renderKey = buildStepPageRenderKey(pageGroup)

          return (
            <BuildStepPageAccordionItem
              key={renderKey}
              calloutMultipliers={calloutMultipliers}
              isExpanded={expandedPageValueSet.has(value)}
              onCalloutMultiplierChange={onCalloutMultiplierChange}
              onPagePriorityChange={onPagePriorityChange}
              pageGroup={pageGroup}
              previewAssetStore={previewAssetStore}
              value={value}
            />
          )
        })}
      </Accordion.Root>
    </Stack>
  )
}

function createBuildStepPageGroups(result: StepCalloutDetectionResult): BuildStepPageGroup[] {
  const previewByPage = new Map(
    (result.pagePreviews ?? []).map((preview) => [preview.pageNumber, preview]),
  )
  const calloutsByPage = new Map<number, DetectedStepCallout[]>()
  const possibleMultipliersByPage = new Map<number, StepPageAttentionItem[]>()

  for (const callout of result.callouts) {
    calloutsByPage.set(callout.pageNumber, [
      ...(calloutsByPage.get(callout.pageNumber) ?? []),
      callout,
    ])
  }

  for (const item of result.pageAttentionItems ?? []) {
    if (item.kind !== "possible-step-multiplier") {
      continue
    }

    possibleMultipliersByPage.set(item.pageNumber, [
      ...(possibleMultipliersByPage.get(item.pageNumber) ?? []),
      item,
    ])
  }

  return result.scannedPageNumbers.map((pageNumber) => ({
    callouts: calloutsByPage.get(pageNumber) ?? [],
    pageNumber,
    possibleStepMultiplierItems: possibleMultipliersByPage.get(pageNumber) ?? [],
    preview: previewByPage.get(pageNumber) ?? null,
  }))
}

function createDefaultExpandedPageValues(pageGroups: readonly BuildStepPageGroup[]): string[] {
  return pageGroups.map((pageGroup) => pageValue(pageGroup.pageNumber))
}

type BuildStepPageGroup = {
  callouts: DetectedStepCallout[]
  pageNumber: number
  possibleStepMultiplierItems: StepPageAttentionItem[]
  preview: StepCalloutDetectionResult["pagePreviews"][number] | null
}

function BuildStepPageAccordionItem({
  calloutMultipliers,
  isExpanded,
  onCalloutMultiplierChange,
  onPagePriorityChange,
  pageGroup,
  previewAssetStore,
  value,
}: {
  calloutMultipliers: StepCalloutMultiplierMap
  isExpanded: boolean
  onCalloutMultiplierChange: (calloutId: string, multiplier: number) => void
  onPagePriorityChange?: (pageNumber: number, isPriority: boolean) => void
  pageGroup: BuildStepPageGroup
  previewAssetStore: PreviewAssetStore
  value: string
}) {
  const hasStepMultiplierAttention = pageGroup.possibleStepMultiplierItems.length > 0
  const attentionId = pageMultiplierAttentionId(pageGroup.pageNumber)
  const { ref, shouldMountBody } = useBuildStepPageRenderWindow(
    isExpanded,
    onPagePriorityChange,
    pageGroup.pageNumber,
  )
  const bodyState = !isExpanded ? "collapsed" : shouldMountBody ? "mounted" : "skeleton"

  return (
    <Accordion.Item
      bg={hasStepMultiplierAttention ? "bagging.review.surface" : "transparent"}
      borderColor={hasStepMultiplierAttention ? "bagging.review.border" : "bagging.border"}
      borderRadius="panel"
      borderWidth="1px"
      boxShadow={hasStepMultiplierAttention ? "bagging.review.ring" : "none"}
      data-attention-kind={hasStepMultiplierAttention ? "possible-step-multiplier" : undefined}
      overflow="visible"
      position="relative"
      value={value}
      zIndex={0}
      _before={
        hasStepMultiplierAttention
          ? {
              bg: "bagging.warning",
              borderBottomLeftRadius: "panel",
              borderTopLeftRadius: "panel",
              bottom: 2,
              content: '""',
              left: 0,
              position: "absolute",
              top: 2,
              w: "3px",
            }
          : undefined
      }
      _focusWithin={{ zIndex: 5 }}
      _hover={{ zIndex: 5 }}
    >
      <Box
        ref={ref}
        data-v2-page-body-state={bodyState}
        data-v2-page-callout-count={pageGroup.callouts.length}
        data-v2-page-number={pageGroup.pageNumber}
        overflow="visible"
      >
        <Accordion.ItemTrigger
          aria-describedby={hasStepMultiplierAttention ? attentionId : undefined}
          alignItems="center"
          cursor="pointer"
          data-v2-page-trigger={pageGroup.pageNumber}
          display="flex"
          gap={3}
          px={{ base: 3, md: 2 }}
          py={{ base: 3, md: 2 }}
          textAlign="left"
          w="full"
          _hover={{ bg: "bagging.surface.subtle" }}
        >
          <HStack flex="1" justify="space-between" minW={0}>
            <Text fontWeight="semibold" truncate>
              Page {pageGroup.pageNumber}
            </Text>
            <HStack gap={2} flexShrink={0}>
              {hasStepMultiplierAttention ? (
                <Badge colorPalette="orange">
                  {formatCount(pageGroup.possibleStepMultiplierItems.length, COUNT_LABELS.review)}
                </Badge>
              ) : null}
              <Badge colorPalette={pageGroup.callouts.length > 0 ? "green" : "gray"}>
                {formatCount(pageGroup.callouts.length, COUNT_LABELS.callout)}
              </Badge>
            </HStack>
          </HStack>
          <Accordion.ItemIndicator color="bagging.muted" />
        </Accordion.ItemTrigger>

        {isExpanded ? (
          <Accordion.ItemContent
            data-v2-page-body-state={bodyState}
            overflow="visible"
            css={{ overflow: "visible !important" }}
          >
            <Accordion.ItemBody
              overflow="visible"
              px={{ base: 3, md: 2 }}
              pb={{ base: 3, md: 2 }}
              pt={0}
            >
              {shouldMountBody ? (
                <BuildStepPageBody
                  attentionId={attentionId}
                  calloutMultipliers={calloutMultipliers}
                  hasStepMultiplierAttention={hasStepMultiplierAttention}
                  onCalloutMultiplierChange={onCalloutMultiplierChange}
                  pageGroup={pageGroup}
                  previewAssetStore={previewAssetStore}
                />
              ) : (
                <BuildStepPageSkeleton
                  hasStepMultiplierAttention={hasStepMultiplierAttention}
                  pageGroup={pageGroup}
                />
              )}
            </Accordion.ItemBody>
          </Accordion.ItemContent>
        ) : null}
      </Box>
    </Accordion.Item>
  )
}

function BuildStepPageBody({
  attentionId,
  calloutMultipliers,
  hasStepMultiplierAttention,
  onCalloutMultiplierChange,
  pageGroup,
  previewAssetStore,
}: {
  attentionId: string
  calloutMultipliers: StepCalloutMultiplierMap
  hasStepMultiplierAttention: boolean
  onCalloutMultiplierChange: (calloutId: string, multiplier: number) => void
  pageGroup: BuildStepPageGroup
  previewAssetStore: PreviewAssetStore
}) {
  return (
    <Stack gap={3}>
      <PreviewCard
        alt={`Page ${pageGroup.pageNumber} preview`}
        imageDataUrl={pageGroup.preview?.imageDataUrl}
        imageSize={pageGroup.preview ?? undefined}
        minH="220px"
        pageNumber={pageGroup.pageNumber}
        pendingLabel="Preparing page"
        previewAssetStore={previewAssetStore}
        title="Page preview"
      />

      {hasStepMultiplierAttention ? (
        <PageMultiplierAttention
          id={attentionId}
          items={pageGroup.possibleStepMultiplierItems}
        />
      ) : null}

      {pageGroup.callouts.length === 0 ? (
        <Text color="bagging.muted" fontSize="sm">
          No callouts found on this page.
        </Text>
      ) : (
        <Stack gap={2}>
          {pageGroup.callouts.map((callout) => (
            <CalloutStepPanel
              key={callout.id}
              callout={callout}
              multiplier={calloutMultiplierFor(calloutMultipliers, callout.id)}
              onMultiplierChange={onCalloutMultiplierChange}
              pagePreview={pageGroup.preview}
              previewAssetStore={previewAssetStore}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}

function BuildStepPageSkeleton({
  hasStepMultiplierAttention,
  pageGroup,
}: {
  hasStepMultiplierAttention: boolean
  pageGroup: BuildStepPageGroup
}) {
  return (
    <Stack
      aria-hidden="true"
      data-v2-page-skeleton={pageGroup.pageNumber}
      gap={3}
    >
      <BuildStepSkeletonCard
        minH="220px"
        title="Page preview"
        visualStyle={aspectRatioStyle(pageGroup.preview)}
      />

      {hasStepMultiplierAttention ? (
        <Box
          bg="bagging.review.surface"
          borderColor="bagging.review.border.subtle"
          borderRadius="md"
          borderWidth="1px"
          px={3}
          py={2}
        >
          <Stack gap={2}>
            <BuildStepSkeletonLine maxW="160px" />
            <BuildStepSkeletonLine maxW="60%" />
          </Stack>
        </Box>
      ) : null}

      {pageGroup.callouts.length === 0 ? (
        <Box
          bg="bagging.preview"
          borderColor="bagging.border"
          borderRadius="md"
          borderStyle="dashed"
          borderWidth="1px"
          h="9"
        />
      ) : (
        <Stack gap={2}>
          {pageGroup.callouts.map((callout) => (
            <Box
              key={callout.id}
              bg="bagging.surface.subtle"
              borderColor="bagging.border"
              borderRadius="panel"
              borderWidth="1px"
              p={3}
            >
              <Grid
                alignItems="start"
                gap={3}
                minW={0}
                templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) minmax(0, 2fr)" }}
              >
                <BuildStepSkeletonCard
                  minH="132px"
                  title="Callout preview"
                  visualStyle={aspectRatioStyle(callout.crop.region)}
                />
                <Stack gap={3} minW={0}>
                  <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
                    <BuildStepSkeletonMetric />
                    <BuildStepSkeletonMetric />
                    <BuildStepSkeletonMetric />
                    <BuildStepSkeletonMetric />
                  </SimpleGrid>
                  <Box
                    bg="bagging.surface"
                    borderColor="bagging.border"
                    borderRadius="md"
                    borderWidth="1px"
                    minH={`${estimatedPartRowsTableHeight(callout)}px`}
                    overflow="hidden"
                  >
                    <Box
                      bg="bagging.surface.subtle"
                      borderBottomColor="bagging.border"
                      borderBottomWidth="1px"
                      h={`${BUILD_STEP_SKELETON_TABLE_HEADER_HEIGHT_PX}px`}
                    />
                    <Stack gap={3} p={3}>
                      {Array.from({ length: Math.min(3, Math.max(1, callout.partItems.length)) })
                        .map((_row, index) => (
                          <BuildStepSkeletonLine
                            key={`${callout.id}-skeleton-row-${index}`}
                            maxW={index % 2 === 0 ? "72%" : "54%"}
                          />
                        ))}
                    </Stack>
                  </Box>
                </Stack>
              </Grid>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

function BuildStepSkeletonCard({
  minH,
  title,
  visualStyle,
}: {
  minH: string
  title: string
  visualStyle?: CSSProperties
}) {
  return (
    <Box
      bg="bagging.surface.subtle"
      borderColor="bagging.border"
      borderRadius="panel"
      borderWidth="1px"
      p={3}
    >
      <Stack gap={2}>
        <Text color="bagging.muted" fontSize="xs" fontWeight="medium">
          {title}
        </Text>
        <Box
          bg="bagging.preview"
          borderColor="bagging.border"
          borderRadius="panel"
          borderStyle="dashed"
          borderWidth="1px"
          minH={minH}
          style={visualStyle}
          w="full"
        />
      </Stack>
    </Box>
  )
}

function BuildStepSkeletonMetric() {
  return (
    <Stack gap={1}>
      <BuildStepSkeletonLine maxW="56px" size="xs" />
      <BuildStepSkeletonLine maxW="72px" />
    </Stack>
  )
}

function BuildStepSkeletonLine({
  maxW,
  size = "sm",
}: {
  maxW: string
  size?: "sm" | "xs"
}) {
  return (
    <Box
      bg="bagging.border"
      borderRadius="full"
      h={size === "xs" ? "2" : "3"}
      maxW={maxW}
      opacity={0.7}
      w="full"
    />
  )
}

function estimatedPartRowsTableHeight(callout: DetectedStepCallout) {
  return BUILD_STEP_SKELETON_TABLE_HEADER_HEIGHT_PX +
    Math.max(1, callout.partItems.length) * BUILD_STEP_SKELETON_PART_ROW_HEIGHT_PX
}

function aspectRatioStyle(size: { height: number; width: number } | null | undefined): CSSProperties | undefined {
  if (!size?.height || !size.width) {
    return undefined
  }

  return {
    aspectRatio: `${size.width} / ${size.height}`,
  }
}

function buildStepPageRenderKey(pageGroup: BuildStepPageGroup) {
  return [
    pageGroup.pageNumber,
    pageGroup.callouts
      .map((callout) => `${callout.id}:${callout.partItems.length}`)
      .join(","),
    pageGroup.possibleStepMultiplierItems.length,
  ].join("|")
}

function useBuildStepPageRenderWindow(
  isExpanded: boolean,
  onPagePriorityChange: ((pageNumber: number, isPriority: boolean) => void) | undefined,
  pageNumber: number,
) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [hasMountedBody, setHasMountedBody] = useState(
    () => typeof IntersectionObserver === "undefined",
  )

  useEffect(() => {
    if (!isExpanded) {
      onPagePriorityChange?.(pageNumber, false)
      return
    }

    const node = ref.current

    if (!node || typeof IntersectionObserver === "undefined") {
      onPagePriorityChange?.(pageNumber, true)
      return () => onPagePriorityChange?.(pageNumber, false)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextIsNearViewport = Boolean(entry?.isIntersecting)
        onPagePriorityChange?.(pageNumber, nextIsNearViewport)
        if (nextIsNearViewport) {
          setHasMountedBody(true)
        }
      },
      { rootMargin: buildStepRenderRootMargin() },
    )

    onPagePriorityChange?.(pageNumber, false)
    observer.observe(node)

    return () => {
      observer.disconnect()
      onPagePriorityChange?.(pageNumber, false)
    }
  }, [isExpanded, onPagePriorityChange, pageNumber])

  return {
    ref,
    shouldMountBody: isExpanded && hasMountedBody,
  }
}

function buildStepRenderRootMargin() {
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight
  const margin = Math.max(
    BUILD_STEPS_RENDER_ROOT_MARGIN_MIN_PX,
    Math.ceil(viewportHeight * BUILD_STEPS_RENDER_ROOT_MARGIN_VIEWPORTS),
  )

  return `${margin}px 0px`
}

function PageMultiplierAttention({
  id,
  items,
}: {
  id: string
  items: StepPageAttentionItem[]
}) {
  return (
    <Box
      bg="bagging.review.surface"
      borderColor="bagging.review.border.subtle"
      borderRadius="md"
      borderWidth="1px"
      id={id}
      px={3}
      py={2}
    >
      <Stack gap={1}>
        <HStack gap={2}>
          <AlertTriangle size={15} aria-hidden="true" />
          <Text fontSize="sm" fontWeight="semibold">
            Possible step multiplier
          </Text>
        </HStack>
        <Text color="bagging.muted" fontSize="sm">
          Outside-callout labels: {formatPageAttentionLabels(items)}. Review the step multiplier controls.
        </Text>
      </Stack>
    </Box>
  )
}

function formatPageAttentionLabels(items: StepPageAttentionItem[]) {
  return items
    .map((item) => `${item.text} ${item.source === "text" ? "text" : "raster"}`)
    .join(", ")
}

function pageMultiplierAttentionId(pageNumber: number) {
  return `page-${pageNumber}-possible-step-multiplier-attention`
}

function CalloutStepPanel({
  callout,
  multiplier,
  onMultiplierChange,
  pagePreview,
  previewAssetStore,
}: {
  callout: DetectedStepCallout
  multiplier: number
  onMultiplierChange: (calloutId: string, multiplier: number) => void
  pagePreview: StepCalloutDetectionResult["pagePreviews"][number] | null
  previewAssetStore: PreviewAssetStore
}) {
  const hasPartRows = callout.partItems.length > 0
  const calloutRegionPreview = pagePreview
    ? createRegionPreviewSource(pagePreview, callout.crop.region)
    : undefined

  return (
    <Box
      bg="bagging.surface.subtle"
      borderColor="bagging.border"
      borderRadius="panel"
      borderWidth="1px"
      data-v2-callout-id={callout.id}
      data-v2-callout-step={callout.stepIndex}
      data-v2-part-count={callout.partItems.length}
      p={3}
    >
      <Grid
        gap={3}
        minW={0}
        templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) minmax(0, 2fr)" }}
        alignItems="start"
      >
        <PreviewCard
          alt={`Callout ${callout.stepIndex} crop`}
          imageSize={callout.crop.region}
          imageDataUrl={callout.crop.imageDataUrl}
          minH="132px"
          pendingLabel="Preparing page"
          previewAssetStore={previewAssetStore}
          regionPreview={calloutRegionPreview}
          thumbnailMaxW={PREVIEW_INLINE_CALLOUT_MAX_W}
          title="Callout preview"
        />

        <Stack gap={3} minW={0}>
          <Grid
            alignItems="start"
            columnGap={3}
            rowGap={2}
            templateColumns={{
              base: "repeat(2, minmax(0, 1fr))",
              md: hasPartRows
                ? "max-content 136px max-content max-content"
                : "max-content max-content max-content",
            }}
          >
            <CalloutHeaderMetric label="Step">
              <Text fontWeight="semibold">{callout.stepIndex}</Text>
            </CalloutHeaderMetric>
            {hasPartRows ? (
              <CalloutHeaderMetric label="Multiplier">
                <StepMultiplierControl
                  callout={callout}
                  value={multiplier}
                  onChange={(nextMultiplier) =>
                    onMultiplierChange(callout.id, nextMultiplier)
                  }
                />
              </CalloutHeaderMetric>
            ) : null}
            <CalloutHeaderMetric label="Part types">
              <Text fontWeight="semibold">{callout.partItems.length}</Text>
            </CalloutHeaderMetric>
            <CalloutHeaderMetric label="Total qty">
              <Text fontWeight="semibold">
                {calloutTotalQuantityLabel(callout, multiplier)}
              </Text>
            </CalloutHeaderMetric>
          </Grid>

          <CalloutPartRows
            callout={callout}
            multiplier={multiplier}
            pagePreview={pagePreview}
            previewAssetStore={previewAssetStore}
          />
        </Stack>
      </Grid>
    </Box>
  )
}

function CalloutHeaderMetric({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <Stack gap={1} minW={0}>
      <Text color="bagging.muted" fontSize="xs" lineHeight="4">
        {label}
      </Text>
      <Box
        alignItems="center"
        display="flex"
        h="8"
        minW={0}
        overflow="visible"
      >
        {children}
      </Box>
    </Stack>
  )
}

function StepMultiplierControl({
  callout,
  value,
  onChange,
}: {
  callout: DetectedStepCallout
  value: number
  onChange: (multiplier: number) => void
}) {
  const normalizedValue = normalizeStepCalloutMultiplier(value)
  const decrementLabel = `Decrease step ${callout.stepIndex} multiplier`
  const incrementLabel = `Increase step ${callout.stepIndex} multiplier`

  return (
    <HStack gap={1} w="fit-content">
      <IconButtonTooltip label={decrementLabel}>
        <IconButton
          aria-label={decrementLabel}
          disabled={normalizedValue <= 1}
          h="8"
          minW="8"
          size="xs"
          variant="outline"
          onClick={() => onChange(normalizedValue - 1)}
        >
          <Minus size={13} aria-hidden="true" />
        </IconButton>
      </IconButtonTooltip>
      <Input
        aria-label={`Step ${callout.stepIndex} multiplier`}
        h="8"
        max={MAX_STEP_CALLOUT_MULTIPLIER}
        min={1}
        step={1}
        textAlign="center"
        type="number"
        value={normalizedValue}
        w="56px"
        onChange={(event) => {
          onChange(normalizeStepCalloutMultiplier(event.currentTarget.valueAsNumber))
        }}
      />
      <IconButtonTooltip label={incrementLabel}>
        <IconButton
          aria-label={incrementLabel}
          disabled={normalizedValue >= MAX_STEP_CALLOUT_MULTIPLIER}
          h="8"
          minW="8"
          size="xs"
          variant="outline"
          onClick={() => onChange(normalizedValue + 1)}
        >
          <Plus size={13} aria-hidden="true" />
        </IconButton>
      </IconButtonTooltip>
    </HStack>
  )
}

type PartItemWithOptionalCrops = DetectedStepCalloutPartItem & {
  type?: string
  quantityLabel?: DetectedStepCalloutPartItem["quantityLabel"] & {
    crop?: {
      imageDataUrl?: string
      region?: DetectedStepCalloutPartItem["quantityLabel"]["region"]
    }
  }
  partCrop?: {
    imageDataUrl?: string
    region?: DetectedStepCalloutPartItem["partRegion"]
  }
  partImage?: {
    imageDataUrl?: string
    region?: DetectedStepCalloutPartItem["partRegion"]
  }
}

function CalloutPartRows({
  callout,
  multiplier,
  pagePreview,
  previewAssetStore,
}: {
  callout: DetectedStepCallout
  multiplier: number
  pagePreview: StepCalloutDetectionResult["pagePreviews"][number] | null
  previewAssetStore: PreviewAssetStore
}) {
  if (callout.partItems.length === 0) {
    return (
      <Badge alignSelf="start" colorPalette="orange">
        Not bagged
      </Badge>
    )
  }

  const rows: PartItemsTableRow[] = callout.partItems.map((item) => ({
    colorConfidence: item.detectedColor?.confidence ?? null,
    colorFamily: item.detectedColor?.family ?? "unknown",
    colorName: partColorName(item),
    colorSwatchHex: displayColorSwatchHex(partColorName(item), item.detectedColor?.swatchHex ?? null),
    id: `${item.id}:x${multiplier}`,
    partRegion: item.partImage?.region ?? item.partRegion,
    quantityRegion: item.quantityLabel.region,
    quantityText: quantityText(item),
    quantityValue: item.quantity.value,
    quantityPreview: (
      <PreviewCard
        alt={`Callout ${callout.stepIndex} quantity ${item.indexOnCallout + 1} crop`}
        imageSize={quantityCropSize(item)}
        imageSizing="original"
        imageDataUrl={quantityCropImage(item)}
        maxZoomScale={PART_ROW_PREVIEW_MAX_ZOOM_SCALE}
        minH="72px"
        pendingLabel="Preparing page"
        previewAssetStore={previewAssetStore}
        regionPreview={
          pagePreview
            ? createRegionPreviewSource(
                pagePreview,
                item.quantityLabel.crop?.region ?? item.quantityLabel.region,
              )
            : undefined
        }
      />
    ),
    partPreview: (
      <PreviewCard
        alt={`Callout ${callout.stepIndex} part ${item.indexOnCallout + 1} crop`}
        imageSize={partCropSize(item)}
        imageSizing="original"
        imageDataUrl={partCropImage(item)}
        maxZoomScale={PART_ROW_PREVIEW_MAX_ZOOM_SCALE}
        minH="112px"
        partMaskItemId={item.id}
        pendingLabel="Preparing page"
        previewBackground={callout.inferredBackground.hex}
        previewAssetStore={previewAssetStore}
        regionPreview={
          pagePreview
            ? createRegionPreviewSource(pagePreview, item.partImage?.region ?? item.partRegion)
            : undefined
        }
        thumbnailMaxPixels={PART_ROW_PREVIEW_THUMBNAIL_MAX_SIZE}
      />
    ),
  }))

  return (
    <PartItemsTable
      ariaLabel={`Part rows for page ${callout.pageNumber} callout ${callout.indexOnPage + 1}`}
      rows={rows}
    />
  )
}

function calloutTotalQuantityLabel(callout: DetectedStepCallout, multiplier: number) {
  const summary = callout.partItems.reduce(
    (current, item) => {
      if (item.quantity.value === null) {
        return {
          ...current,
          unknownCount: current.unknownCount + 1,
        }
      }

      return {
        ...current,
        total: current.total + item.quantity.value * multiplier,
      }
    },
    { total: 0, unknownCount: 0 },
  )

  const unknownCount = summary.unknownCount * multiplier

  if (unknownCount === 0) {
    return String(summary.total)
  }

  if (summary.total === 0) {
    return `${unknownCount} unknown`
  }

  return `${summary.total} + ${unknownCount} unknown`
}

function quantityText(item: DetectedStepCalloutPartItem) {
  return item.quantity.value === null ? item.quantity.text || "Unknown" : `${item.quantity.value}x`
}

function quantityCropImage(item: DetectedStepCalloutPartItem) {
  return (item as PartItemWithOptionalCrops).quantityLabel?.crop?.imageDataUrl
}

function partCropImage(item: DetectedStepCalloutPartItem) {
  const itemWithCrops = item as PartItemWithOptionalCrops

  return itemWithCrops.partImage?.imageDataUrl ?? itemWithCrops.partCrop?.imageDataUrl
}

function quantityCropSize(item: DetectedStepCalloutPartItem) {
  return item.quantityLabel.crop?.region ?? item.quantityLabel.region
}

function partCropSize(item: DetectedStepCalloutPartItem) {
  return item.partImage?.region ?? item.partCrop?.region ?? item.partRegion
}

function partColorName(item: DetectedStepCalloutPartItem) {
  if (!item.detectedColor) {
    return "Unknown"
  }

  return item.detectedColor.status === "family"
    ? `${item.detectedColor.family} family`
    : item.detectedColor.name
}

function BuildStepsProgressPanel({ progress }: { progress: BuildStepAnalysisProgress }) {
  return (
    <Stack gap={{ base: 4, md: 3 }} minH={{ base: "360px", md: "520px" }}>
      <HStack align="start" justify="space-between">
        <Stack gap={1}>
          <Text fontSize={{ base: "xl", md: "md" }} fontWeight="semibold">
            Build steps
          </Text>
          <Text color="bagging.muted" fontSize={{ base: "md", md: "sm" }}>
            {progress.statusText}
          </Text>
        </Stack>
        <Badge colorPalette="blue">{progress.phaseLabel}</Badge>
      </HStack>

      <Box
        alignItems="center"
        borderColor="moss.100"
        borderRadius="panel"
        borderStyle="dashed"
        borderWidth="1px"
        display="flex"
        flex="1"
        justifyContent="center"
        minH={{ base: "240px", md: "360px" }}
        px={{ base: 4, md: 3 }}
        py={8}
      >
        <Stack gap={5} maxW="560px" textAlign="center" w="full">
          <Stack align="center" gap={3}>
            <Box
              alignItems="center"
              bg="bagging.action.subtle"
              borderRadius="full"
              color="bagging.action"
              display="flex"
              h={{ base: "64px", md: "44px" }}
              justifyContent="center"
              w={{ base: "64px", md: "44px" }}
            >
              <ScanSearch size={22} aria-hidden="true" />
            </Box>
            <Stack gap={1}>
              <Text fontSize={{ base: "xl", md: "md" }} fontWeight="semibold">
                {progress.phaseLabel}
              </Text>
              <Text color="bagging.muted" fontSize={{ base: "md", md: "sm" }}>
                Results pending while browser work runs.
              </Text>
            </Stack>
          </Stack>

          <SimpleGrid columns={{ base: 1, sm: 4 }} gap={2} textAlign="left">
            <ProgressMetric label="Active page" value={progress.activePageValue} />
            <ProgressMetric label="Pages scanned" value={progress.scannedPagesValue} />
            <ProgressMetric label="Callouts" value={progress.detectedCalloutsValue} />
            <ProgressMetric label="Part rows" value={progress.detectedPartItemsValue} />
          </SimpleGrid>

          <Box
            aria-label="Build steps analysis progress"
            bg="bagging.surface.subtle"
            borderRadius="full"
            h="2"
            overflow="hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.progress}
          >
            <Box bg="bagging.action" h="full" width={`${progress.progress}%`} />
          </Box>
        </Stack>
      </Box>
    </Stack>
  )
}

function ProgressMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box
      bg="bagging.surface"
      borderColor="bagging.border"
      borderRadius="md"
      borderWidth="1px"
      minW={0}
      px={3}
      py={2}
    >
      <Text color="bagging.muted" fontSize="xs">
        {label}
      </Text>
      <Text fontSize={{ base: "lg", md: "sm" }} fontWeight="semibold" overflowWrap="anywhere">
        {value}
      </Text>
    </Box>
  )
}

function pageValue(pageNumber: number) {
  return `page-${pageNumber}`
}

function createRegionPreviewSource(
  pagePreview: StepCalloutDetectionResult["pagePreviews"][number],
  region: RegionPreviewSource["region"],
): RegionPreviewSource {
  return {
    baseHeight: pagePreview.height,
    baseWidth: pagePreview.width,
    pageNumber: pagePreview.pageNumber,
    region,
  }
}

const PREVIEW_INLINE_CALLOUT_MAX_W = "420px"

function PendingPanel({
  badge,
  title,
  detail,
}: {
  badge: string
  title: string
  detail: string
}) {
  return (
    <Stack gap={{ base: 4, md: 3 }} minH={{ base: "360px", md: "520px" }}>
      <HStack justify="space-between" align="start">
        <Stack gap={1}>
          <Text fontSize={{ base: "xl", md: "md" }} fontWeight="semibold">
            {title}
          </Text>
          <Text color="bagging.muted" fontSize={{ base: "md", md: "sm" }}>
            {detail}
          </Text>
        </Stack>
        <Badge colorPalette="gray">{badge}</Badge>
      </HStack>

      <Box
        alignItems="center"
        borderColor="moss.100"
        borderRadius="panel"
        borderStyle="dashed"
        borderWidth="1px"
        display="flex"
        flex="1"
        justifyContent="center"
        minH={{ base: "240px", md: "360px" }}
        px={4}
        py={8}
      >
        <Stack align="center" gap={3} maxW="360px" textAlign="center">
          <Box
            alignItems="center"
            bg="bagging.action.subtle"
            borderRadius="full"
            color="bagging.action"
            display="flex"
            h={{ base: "64px", md: "44px" }}
            justifyContent="center"
            w={{ base: "64px", md: "44px" }}
          >
            <PackageCheck size={22} aria-hidden="true" />
          </Box>
          <Text fontSize={{ base: "xl", md: "md" }} fontWeight="semibold">
            Waiting for analysis
          </Text>
          <Text color="bagging.muted" fontSize={{ base: "md", md: "sm" }}>
            {detail}
          </Text>
        </Stack>
      </Box>
    </Stack>
  )
}
