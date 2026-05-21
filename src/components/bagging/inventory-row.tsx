"use client"

import { Box, Checkbox, Flex, HStack, Image, Stack, Text } from "@chakra-ui/react"
import type { BaggingPart, CheckedItemChangeHandler } from "@/features/bagging/types"

type InventorySwatchToken = BaggingPart["swatch"] | "bagging.border"

export type InventoryRowItem = {
  id: string
  color: string
  imageUrl: string
  name: string
  qty: number
  swatch: InventorySwatchToken
}

export function InventoryRow({
  checked,
  checkboxLabel,
  flushX = false,
  item,
  onCheckedChange,
  trackingId,
}: {
  checked: boolean
  checkboxLabel: string
  flushX?: boolean
  item: InventoryRowItem
  onCheckedChange: CheckedItemChangeHandler
  trackingId: string
}) {
  const rowContentOpacity = checked ? 0.58 : 1

  return (
    <HStack
      data-testid="inventory-row"
      data-selected={checked ? "true" : "false"}
      gap="3"
      alignItems="center"
      borderTop="sm"
      borderColor="bagging.rowBorder"
      bg={checked ? "bagging.subtleBg" : "transparent"}
      px={flushX ? undefined : "3"}
      py="3"
      style={{ transition: "background-color 120ms ease" }}
    >
      <Box w="8" flexShrink={0}>
        <TrackCheckbox
          ariaLabel={checkboxLabel}
          checked={checked}
          id={trackingId}
          onCheckedChange={onCheckedChange}
        />
      </Box>
      <Text
        w={{ base: "11", md: "16" }}
        flexShrink={0}
        fontWeight="semibold"
        style={{ opacity: rowContentOpacity, transition: "opacity 120ms ease" }}
      >
        {item.qty}
      </Text>
      <RebrickablePartImage opacity={rowContentOpacity} part={item} />
      <ColorLabel color={item.color} opacity={rowContentOpacity} swatch={item.swatch} />
      <Stack
        data-testid="inventory-row-details"
        flex="1"
        minW="bagging.zero"
        style={{ opacity: rowContentOpacity, transition: "opacity 120ms ease" }}
      >
        <Text fontWeight="medium" truncate>
          {item.name}
        </Text>
        <Text color="fg.muted" fontSize="xs" truncate>
          {item.id}
        </Text>
      </Stack>
    </HStack>
  )
}

export function partToInventoryItem(part: BaggingPart): InventoryRowItem {
  return {
    id: part.id,
    color: part.color,
    imageUrl: part.imageUrl,
    name: part.name,
    qty: part.qty,
    swatch: part.swatch,
  }
}

function TrackCheckbox({
  ariaLabel,
  checked,
  id,
  onCheckedChange,
}: {
  ariaLabel: string
  checked: boolean
  id: string
  onCheckedChange: CheckedItemChangeHandler
}) {
  return (
    <Checkbox.Root
      aria-label={ariaLabel}
      checked={checked}
      onCheckedChange={(details) => onCheckedChange(id, details.checked === true)}
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
    </Checkbox.Root>
  )
}

function RebrickablePartImage({ opacity, part }: { opacity: number; part: InventoryRowItem }) {
  return (
    <Flex
      align="center"
      justify="center"
      w="14"
      h="11"
      bg="bagging.imageBg"
      border="sm"
      borderColor="bagging.border"
      rounded="sm"
      overflow="hidden"
      style={{ opacity, transition: "opacity 120ms ease" }}
    >
      <Image
        alt={`${part.color} ${part.name}`}
        src={part.imageUrl}
        maxW="full"
        maxH="full"
        objectFit="contain"
      />
    </Flex>
  )
}

function ColorLabel({ color, opacity, swatch }: { color: string; opacity: number; swatch: InventorySwatchToken }) {
  return (
    <HStack
      gap="2"
      minW="bagging.zero"
      w={{ base: "24", md: "36" }}
      flexShrink={0}
      style={{ opacity, transition: "opacity 120ms ease" }}
    >
      <Box
        aria-hidden="true"
        boxSize="3.5"
        rounded="sm"
        bg={swatch}
        border="sm"
        borderColor="blackAlpha.300"
        flexShrink={0}
      />
      <Text color="fg.muted" fontSize="sm" truncate>
        {color}
      </Text>
    </HStack>
  )
}
