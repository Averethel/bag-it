import { memo, useMemo, useState, type ReactNode } from "react"
import {
  Accordion,
  Badge,
  Box,
  HStack,
  Stack,
  Text,
} from "@chakra-ui/react"
import {
  createBagChecklistAccordionValueKey,
  createBagChecklistCheckedRowIdSet,
  createDefaultExpandedBagGroupValues,
  createProgressSummary,
  type BagChecklistGroup,
  type BagChecklistProgressSummary,
} from "./bag-checklist-table-model"
import { COUNT_LABELS, formatCountRatio } from "@/lib/count-format"

export function BagChecklistAccordion({
  checkedRowIdsKeyByGroupId,
  groups,
  isLargeChecklist,
  renderGroupBody,
}: {
  checkedRowIdsKeyByGroupId: ReadonlyMap<string, string>
  groups: readonly BagChecklistGroup[]
  isLargeChecklist: boolean
  renderGroupBody: (args: {
    checkedRowIds: ReadonlySet<string>
    group: BagChecklistGroup
  }) => ReactNode
}) {
  const defaultAccordionValue = createDefaultExpandedBagGroupValues(
    groups,
    isLargeChecklist,
  )
  const accordionValueKey = createBagChecklistAccordionValueKey(groups, isLargeChecklist)
  const [expandedGroups, setExpandedGroups] = useState(() => ({
    key: "",
    values: [] as string[],
  }))
  const activeExpandedGroupValues =
    expandedGroups.key === accordionValueKey
      ? expandedGroups.values
      : defaultAccordionValue
  const expandedGroupValueSet = new Set(activeExpandedGroupValues)

  return (
    <Accordion.Root
      key={accordionValueKey}
      collapsible
      display="flex"
      flexDirection="column"
      gap={3}
      multiple
      onValueChange={(details) =>
        setExpandedGroups({
          key: accordionValueKey,
          values: details.value,
        })
      }
      overflow="visible"
      value={activeExpandedGroupValues}
    >
      {groups.map((group) => {
        const checkedRowIdsKey = checkedRowIdsKeyByGroupId.get(group.id) ?? ""

        return (
          <BagChecklistAccordionItem
            key={group.id}
            checkedRowIdsKey={checkedRowIdsKey}
            group={group}
            isBodyMounted={!isLargeChecklist || expandedGroupValueSet.has(group.id)}
            renderGroupBody={renderGroupBody}
          />
        )
      })}
    </Accordion.Root>
  )
}

const BagChecklistAccordionItem = memo(function BagChecklistAccordionItem({
  checkedRowIdsKey,
  group,
  isBodyMounted,
  renderGroupBody,
}: {
  checkedRowIdsKey: string
  group: BagChecklistGroup
  isBodyMounted: boolean
  renderGroupBody: (args: {
    checkedRowIds: ReadonlySet<string>
    group: BagChecklistGroup
  }) => ReactNode
}) {
  const checkedRowIds = useMemo(
    () => createBagChecklistCheckedRowIdSet(checkedRowIdsKey),
    [checkedRowIdsKey],
  )
  const progress = useMemo(
    () => createProgressSummary(group.rows, checkedRowIds),
    [checkedRowIds, group.rows],
  )

  return (
    <Accordion.Item
      bg="transparent"
      borderColor={group.status === "review" ? "bagging.review.border" : "bagging.border"}
      borderRadius="panel"
      borderWidth="1px"
      overflow="visible"
      value={group.id}
      _focusWithin={{ zIndex: 5 }}
      _hover={{ zIndex: 5 }}
    >
      <Accordion.ItemTrigger
        alignItems="center"
        cursor="pointer"
        display="flex"
        gap={3}
        px={{ base: 3, md: 2 }}
        py={{ base: 3, md: 2 }}
        textAlign="left"
        w="full"
        _hover={{ bg: "bagging.surface.subtle" }}
      >
        <HStack flex="1" justify="space-between" minW={0}>
          <HStack gap={2} minW={0}>
            {group.colorSwatchHex ? (
              <Box
                aria-hidden="true"
                bg={group.colorSwatchHex}
                borderColor="bagging.border"
                borderRadius="sm"
                borderWidth="1px"
                boxSize="16px"
                flexShrink={0}
              />
            ) : null}
            <Text fontWeight="semibold" truncate>
              {group.title}
            </Text>
          </HStack>
          <HStack gap={2} flexShrink={0}>
            {group.status === "review" ? (
              <Badge colorPalette="orange">review</Badge>
            ) : null}
            <Badge colorPalette="gray">{group.badge}</Badge>
          </HStack>
        </HStack>
        <Accordion.ItemIndicator color="bagging.muted" />
      </Accordion.ItemTrigger>

      <Box px={{ base: 3, md: 2 }} pb={{ base: 3, md: 2 }} pt={0}>
        <GroupProgressSummary progress={progress} />
      </Box>

      <Accordion.ItemContent overflow="visible" css={{ overflow: "visible !important" }}>
        <Accordion.ItemBody
          overflow="visible"
          px={{ base: 3, md: 2 }}
          pb={{ base: 3, md: 2 }}
          pt={0}
          css={{
            contentVisibility: "auto",
            containIntrinsicSize: "360px",
          }}
        >
          {isBodyMounted ? renderGroupBody({ checkedRowIds, group }) : null}
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  )
})

function GroupProgressSummary({
  progress,
}: {
  progress: BagChecklistProgressSummary
}) {
  return (
    <Stack gap={1}>
      <HStack justify="space-between">
        <Text color="bagging.muted" fontSize="xs">
          {formatCountRatio(
            progress.checkedQuantity,
            progress.totalQuantity,
            COUNT_LABELS.part,
          )} packed
        </Text>
        <Text color="bagging.muted" fontSize="xs">
          {progress.percent}%
        </Text>
      </HStack>
      <BagChecklistProgressBar
        label="Bag section packed progress"
        value={progress.percent}
        valueText={`${progress.percent}% packed`}
      />
    </Stack>
  )
}

export function BagChecklistProgressBar({
  label,
  value,
  valueText,
}: {
  label: string
  value: number
  valueText: string
}) {
  return (
    <Box
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={value}
      aria-valuetext={valueText}
      bg="bagging.surface.subtle"
      borderRadius="full"
      h="2"
      overflow="hidden"
      role="progressbar"
    >
      <Box bg="bagging.action" h="full" width={`${value}%`} />
    </Box>
  )
}
