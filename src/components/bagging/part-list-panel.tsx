import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react"
import type { BaggingPart, CheckedItemChangeHandler } from "@/features/bagging/types"
import { InventoryRow, partToInventoryItem } from "./inventory-row"

export function PartListPanel({
  checkedItemIds,
  onCheckedItemChange,
  parts,
}: {
  checkedItemIds: ReadonlySet<string>
  onCheckedItemChange: CheckedItemChangeHandler
  parts: readonly BaggingPart[]
}) {
  return (
    <Box border="sm" borderColor="bagging.border" bg="white" rounded="md" p="4">
      <Stack gap="3">
        <HStack justify="space-between" align="start">
          <Text color="fg.muted" fontSize="sm">
            Normalized Rebrickable-style rows for the selected manual.
          </Text>
          <Badge colorPalette="green" variant="subtle">
            {parts.length} parts
          </Badge>
        </HStack>
        <Stack
          gap="bagging.none"
          maxH={{ lg: "bagging.partListMax" }}
          overflowY={{ base: "visible", lg: "auto" }}
        >
          <HStack
            display={{ base: "none", md: "flex" }}
            gap="3"
            px="3"
            py="2"
            color="fg.muted"
            fontSize="xs"
            fontWeight="semibold"
          >
            <Text w="8" flexShrink={0} />
            <Text w="16" flexShrink={0}>
              Qty
            </Text>
            <Text w="14" flexShrink={0}>
              Image
            </Text>
            <Text w="36" flexShrink={0}>
              Color
            </Text>
            <Text flex="1" minW="bagging.zero">
              Part name
            </Text>
          </HStack>
          {parts.map((part) => {
            const trackingId = `inventory-${part.id}`

            return (
              <InventoryRow
                key={part.id}
                checked={checkedItemIds.has(trackingId)}
                checkboxLabel={`Track ${part.qty} ${part.color} ${part.name}`}
                item={partToInventoryItem(part)}
                trackingId={trackingId}
                onCheckedChange={onCheckedItemChange}
              />
            )
          })}
        </Stack>
      </Stack>
    </Box>
  )
}
