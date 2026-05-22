import { Accordion, Badge, Box, HStack, Stack, Text } from "@chakra-ui/react"
import type {
  BagChecklistItem,
  BaggingPart,
  BagPlan,
  CheckedItemChangeHandler,
} from "@/features/bagging/types"
import { InventoryRow, type InventoryRowItem } from "./inventory-row"

export function BagsPanel({
  bags,
  checkedItemIds,
  onCheckedItemChange,
  partById,
}: {
  bags: readonly BagPlan[]
  checkedItemIds: ReadonlySet<string>
  onCheckedItemChange: CheckedItemChangeHandler
  partById: ReadonlyMap<string, BaggingPart>
}) {
  return (
    <Box border="sm" borderColor="bagging.border" bg="white" rounded="md" p="4">
      <Accordion.Root multiple defaultValue={[bags[0]?.id ?? ""]}>
        <Stack gap="3">
          {bags.map((bag) => (
            <Accordion.Item
              key={bag.id}
              value={bag.id}
              border="sm"
              borderColor="bagging.rowBorder"
              rounded="md"
              overflow="hidden"
            >
              <Accordion.ItemTrigger px="4" py="3">
                <HStack flex="1" justify="space-between" gap="3" textAlign="start">
                  <Stack gap="bagging.none">
                    <Text fontWeight="semibold">{bag.label}</Text>
                    <Text color="fg.muted" fontSize="sm">
                      {bag.range}
                      {" \u00b7 "}
                      {bag.parts} parts
                    </Text>
                  </Stack>
                  <Badge colorPalette={bag.status === "Ready" ? "green" : "yellow"} variant="subtle">
                    {bag.status}
                  </Badge>
                </HStack>
                <Accordion.ItemIndicator />
              </Accordion.ItemTrigger>
              <Accordion.ItemContent>
                <Accordion.ItemBody px="4" pb="4">
                  <Stack gap="bagging.none">
                    {bag.checklist.map((item) => (
                      <BagPartRow
                        key={`${bag.id}-${item.partId}`}
                        bagId={bag.id}
                        checkedItemIds={checkedItemIds}
                        item={item}
                        onCheckedItemChange={onCheckedItemChange}
                        part={partById.get(item.partId)}
                      />
                    ))}
                  </Stack>
                </Accordion.ItemBody>
              </Accordion.ItemContent>
            </Accordion.Item>
          ))}
        </Stack>
      </Accordion.Root>
    </Box>
  )
}

function BagPartRow({
  bagId,
  checkedItemIds,
  item,
  onCheckedItemChange,
  part,
}: {
  bagId: string
  checkedItemIds: ReadonlySet<string>
  item: BagChecklistItem
  onCheckedItemChange: CheckedItemChangeHandler
  part: BaggingPart | undefined
}) {
  const trackingId = `${bagId}-${item.partId}`
  const rowPart = bagItemToInventoryItem(item, part)

  return (
    <InventoryRow
      checked={checkedItemIds.has(trackingId)}
      checkboxLabel={`Track ${item.qty} ${item.color} ${item.name} for ${trackingId}`}
      flushX
      item={rowPart}
      trackingId={trackingId}
      onCheckedChange={onCheckedItemChange}
    />
  )
}

function bagItemToInventoryItem(
  item: BagChecklistItem,
  part: BaggingPart | undefined,
): InventoryRowItem {
  return {
    id: item.partId,
    color: item.color,
    imageUrl: part?.imageUrl ?? "",
    name: item.name,
    qty: item.qty,
    swatch: part?.swatch ?? "bagging.border",
  }
}
