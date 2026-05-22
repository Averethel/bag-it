"use client"

import { Accordion, Badge, Box, Button, Flex, HoverCard, HStack, Image, Portal, Progress, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import { ImageIcon } from "lucide-react"
import { useState } from "react"
import { compareColorNames } from "@/features/bagging/color-sort"
import {
  createStepCalloutBaggingPlan,
  type StepCalloutBagPartGroup,
  type StepCalloutBagPlan,
  type StepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"
import type {
  DetectedStepCallout,
  DetectedStepCalloutPartImageSignature,
  DetectedStepCalloutPartItem,
  DetectedStepCalloutLocalImageRejectedMatch,
  StepCalloutDetectionResult,
} from "@/features/bagging/step-callout-detection"
import {
  PartChecklistTable,
  type PartChecklistRow,
  type PartChecklistSortColumn,
} from "./part-checklist-table"

type StepBagGroupMode = "bag" | "color"

const stepQuantityFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})
const allPartChecklistSortColumns = [
  "color",
  "completion",
  "location",
  "part",
  "quantity",
] as const satisfies readonly PartChecklistSortColumn[]

export function StepCalloutsPanel({
  inventoryPartCount,
  result,
}: {
  inventoryPartCount?: number | null
  result: StepCalloutDetectionResult
}) {
  const [checkedRowIds, setCheckedRowIds] = useState<ReadonlySet<string>>(() => new Set())
  const [groupMode, setGroupMode] = useState<StepBagGroupMode>("bag")
  const baggingPlan = createStepCalloutBaggingPlan(result, { inventoryPartCount })
  const rows = getStepBagChecklistRows(baggingPlan)
  const sections = getStepBagChecklistSections(rows, groupMode)
  const completion = getStepBagChecklistCompletion(rows, checkedRowIds)

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
        <StepBagCompletionIndicator completion={completion} />

        {sections.length > 0 ? (
          <Accordion.Root key={groupMode} multiple defaultValue={sections.map((section) => section.id)} lazyMount>
            <Stack gap="3">
              {sections.map((section) => (
                <StepBagChecklistSection
                  key={section.id}
                  checkedRowIds={checkedRowIds}
                  groupMode={groupMode}
                  onCheckedRowIdsChange={setCheckedRowIds}
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
              No step callout rectangles were detected across the non-inventory pages.
            </Text>
          </Box>
        )}
      </Stack>
    </Box>
  )
}

export function StepCalloutDebugPanel({
  inventoryPartCount,
  result,
}: {
  inventoryPartCount?: number | null
  result: StepCalloutDetectionResult
}) {
  const baggingPlan = createStepCalloutBaggingPlan(result, { inventoryPartCount })

  return (
    <Stack data-testid="step-callout-debug-panel" gap="4">
      <StepCalloutLocalMatchDebugPanel result={result} />
      <StepCalloutBagDebugPanel baggingPlan={baggingPlan} result={result} />
    </Stack>
  )
}

export function StepCalloutLocalMatchDebugPanel({ result }: { result: StepCalloutDetectionResult }) {
  const localDebugGroups = getStepLocalMatchDebugGroups(result)

  return <StepLocalMatchDebugPanel groups={localDebugGroups} />
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

function StepBagChecklistSection({
  checkedRowIds,
  groupMode,
  onCheckedRowIdsChange,
  section,
}: {
  checkedRowIds: ReadonlySet<string>
  groupMode: StepBagGroupMode
  onCheckedRowIdsChange: (checkedRowIds: ReadonlySet<string>) => void
  section: StepBagChecklistSectionData
}) {
  const sectionCompletion = getStepBagChecklistCompletion(section.rows, checkedRowIds)
  const tableRows = section.rows.map((row, index) =>
    createStepBagPartChecklistRow(row, {
      dividerLabel: groupMode === "color" && (index === 0 || row.bagNumber !== section.rows[index - 1]?.bagNumber)
        ? `${row.bagLabel} · ${formatStepRange(row.bagStepRange)}`
        : undefined,
    })
  )
  const plainColumns = groupMode === "color" ? allPartChecklistSortColumns : (["location"] as const)

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
        <Accordion.ItemBody px="3" pb="3">
          <PartChecklistTable
            checkedRowIds={checkedRowIds}
            locationColumnLabel="Step"
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
    <HoverCard.Root openDelay={120} closeDelay={80}>
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
        loading="eager"
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
      loading="eager"
      decoding="async"
    />
  )

  return (
    <HoverCard.Root openDelay={120} closeDelay={80}>
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

function getStepBagChecklistRows(plan: StepCalloutBaggingPlan): StepBagChecklistRow[] {
  return plan.bags.flatMap((bag, bagIndex) =>
    bag.callouts.flatMap((callout) =>
      callout.partItems.map((item) => {
        const quantity = item.quantity.value ?? 1

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
          id: `${bag.id}:${callout.id}:${item.id}`,
          itemCount: 1,
          itemIndex: item.indexOnCallout,
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
    )
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
      sectionsByColor.set(colorKey, [...(sectionsByColor.get(colorKey) ?? []), row])
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
    sectionsByBag.set(row.bagId, [...(sectionsByBag.get(row.bagId) ?? []), row])
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
