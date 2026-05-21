"use client"

import { Badge, Box, Button, Flex, IconButton, Input, Stack, Text } from "@chakra-ui/react"
import { FileUp, Play, Trash2 } from "lucide-react"
import { useState, type ChangeEvent, type CSSProperties, type DragEvent } from "react"

const hiddenInputStyle = {
  height: 1,
  margin: -1,
  opacity: 0,
  position: "absolute",
  width: 1,
} satisfies CSSProperties

export function ManualFlowCard({
  canPurge = false,
  canStart,
  isRunning,
  manualName,
  onManualSelected,
  onPurge,
  onStart,
  recoveryText,
  recoveryTone = "error",
  runningLabel = "Bagging...",
  startLabel = "Bag it!",
  statusText,
}: {
  canPurge?: boolean
  canStart: boolean
  isRunning: boolean
  manualName: string | null
  onManualSelected: (file: File) => void
  onPurge?: () => void
  onStart: () => void
  recoveryText?: string | null
  recoveryTone?: "error" | "success" | "warning"
  runningLabel?: string
  startLabel?: string
  statusText?: string | null
}) {
  const [isDragging, setIsDragging] = useState(false)
  const recoveryPalette = getRecoveryPalette(recoveryTone)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      onManualSelected(file)
    }
    event.currentTarget.value = ""
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    const file = event.dataTransfer.files[0]
    if (file) {
      onManualSelected(file)
    }
  }

  return (
    <Box border="sm" borderColor="bagging.border" bg="white" rounded="md" p="4" position="relative">
      {canPurge && onPurge ? (
        <IconButton
          aria-label="Remove uploaded manual"
          title="Remove uploaded manual"
          type="button"
          variant="ghost"
          colorPalette="red"
          size="sm"
          position="absolute"
          top="2"
          right="2"
          zIndex="docked"
          onClick={onPurge}
        >
          <Trash2 size={16} />
        </IconButton>
      ) : null}
      <Stack gap="4">
        <Box
          as="label"
          data-testid="manual-drop-zone"
          border="sm"
          borderStyle="dashed"
          borderColor={isDragging ? "bagging.accent" : "bagging.borderStrong"}
          bg={isDragging ? "bagging.iconBg" : "bagging.subtleBg"}
          rounded="md"
          p="5"
          overflow="hidden"
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ cursor: "pointer" }}
          _focusWithin={{
            borderColor: "bagging.accent",
            outlineColor: "bagging.accent",
            outlineOffset: "2px",
            outlineStyle: "solid",
            outlineWidth: "2px",
          }}
        >
          <Stack align="center" gap="3" textAlign="center">
            <Flex
              aria-hidden="true"
              align="center"
              justify="center"
              rounded="full"
              bg="bagging.iconBg"
              color="bagging.iconFg"
              boxSize="11"
            >
              <FileUp size={22} />
            </Flex>
            <Stack align="center" gap="1" w="full">
              <Flex align="center" justify="center" gap="2" maxW="full" minH="6">
                <Text
                  fontWeight="semibold"
                  minW="bagging.zero"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  {manualName ?? "Upload PDF manual"}
                </Text>
                {statusText ? (
                  <Badge
                    aria-live="polite"
                    colorPalette={recoveryText ? recoveryPalette : "green"}
                    data-testid="manual-status-badge"
                    flexShrink={0}
                    variant="subtle"
                  >
                    {statusText}
                  </Badge>
                ) : null}
              </Flex>
              {recoveryText ? (
                <Text color={`${recoveryPalette}.700`} fontSize="sm">
                  {recoveryText}
                </Text>
              ) : null}
            </Stack>
            <Input
              aria-label="Upload PDF manual"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              style={hiddenInputStyle}
            />
          </Stack>
        </Box>

        <Button
          type="button"
          colorPalette="green"
          onClick={onStart}
          disabled={isRunning || !canStart}
        >
          <Play size={16} />
          {isRunning ? runningLabel : startLabel}
        </Button>
      </Stack>
    </Box>
  )
}

function getRecoveryPalette(tone: "error" | "success" | "warning") {
  switch (tone) {
    case "error":
      return "red"
    case "success":
      return "green"
    case "warning":
      return "yellow"
  }
}
