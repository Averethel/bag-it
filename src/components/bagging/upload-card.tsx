import { Box, Button, IconButton, Input, Stack, Text } from "@chakra-ui/react"
import { FileUp, Play, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { IconButtonTooltip } from "@/components/ui/icon-button-tooltip"
import { Panel } from "./panel"

export type UploadMessage = {
  text: string
  tone: "error" | "info"
}

export function UploadCard({
  fileName,
  metadataSummary,
  message,
  isProcessing,
  onFileChange,
  onPurge,
  onPrimaryAction,
}: {
  fileName: string | null
  metadataSummary: string | null
  message: UploadMessage | null
  isProcessing: boolean
  onFileChange: (file: File | null) => void
  onPurge: () => void
  onPrimaryAction: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const canRun = Boolean(fileName) && !isProcessing
  const statusLabel = metadataSummary
    ? "Read complete"
    : isProcessing
      ? "Reading manual"
      : fileName
        ? "Ready"
        : null

  function handleFiles(files: FileList | File[]) {
    const [file] = Array.from(files)
    onFileChange(file ?? null)
  }

  return (
    <Panel borderRadius="lg" p={{ base: 4, md: 3 }}>
      <Stack gap={{ base: 4, md: 3 }}>
        <Box position="relative">
          {fileName ? (
            <IconButtonTooltip label="Remove selected manual">
              <IconButton
                aria-label="Remove selected manual"
                color="red.700"
                position="absolute"
                right={2}
                size="sm"
                top={2}
                variant="ghost"
                zIndex={1}
                onClick={onPurge}
              >
                <Trash2 size={19} />
              </IconButton>
            </IconButtonTooltip>
          ) : null}
          <Box
            alignItems="center"
            borderColor={isDragging ? "bagging.action" : "moss.200"}
            borderRadius="md"
            borderStyle="dashed"
            borderWidth="2px"
            cursor={isProcessing ? "default" : "pointer"}
            display="flex"
            minH={{ base: "240px", md: "120px" }}
            position="relative"
            px={{ base: 5, md: 3 }}
            py={{ base: 6, md: 3 }}
            role="button"
            tabIndex={isProcessing ? -1 : 0}
            textAlign="center"
            transition="border-color 120ms ease, background-color 120ms ease"
            bg={isDragging ? "bagging.action.subtle" : "transparent"}
            onClick={() => {
              if (!isProcessing) {
                inputRef.current?.click()
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault()
              if (!isProcessing) {
                setIsDragging(true)
              }
            }}
            onDragOver={(event) => {
              event.preventDefault()
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setIsDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              if (!isProcessing) {
                handleFiles(event.dataTransfer.files)
              }
            }}
            onKeyDown={(event) => {
              if (isProcessing || (event.key !== "Enter" && event.key !== " ")) {
                return
              }

              event.preventDefault()
              inputRef.current?.click()
            }}
          >
            {statusLabel ? (
              <Box
                bg="bagging.action.subtle"
                borderRadius="md"
                color="bagging.action"
                fontSize={{ base: "md", md: "xs" }}
                fontWeight="medium"
                left={{ base: 3, md: 2 }}
                px={2.5}
                py={1}
                position="absolute"
                top={{ base: 3, md: 2 }}
                zIndex={1}
              >
                {statusLabel}
              </Box>
            ) : null}
            <Stack align="center" gap={{ base: 5, md: 2 }} width="full">
              <Box
                alignItems="center"
                bg="bagging.action.subtle"
                borderRadius="full"
                color="moss.700"
                display="flex"
                height={{ base: "88px", md: "44px" }}
                justifyContent="center"
                width={{ base: "88px", md: "44px" }}
              >
                <FileUp size={28} strokeWidth={2.2} aria-hidden="true" />
              </Box>

              {fileName ? (
                <Stack align="center" gap={2} maxW="full">
                  <Text
                    fontSize={{ base: "2xl", md: "md" }}
                    fontWeight="bold"
                    lineHeight="1.2"
                    maxW={{ base: "540px", md: "210px" }}
                    px={{ base: 6, md: 3 }}
                    truncate
                  >
                    {fileName}
                  </Text>
                  {metadataSummary ? (
                    <Text color="bagging.muted" fontSize={{ base: "md", md: "xs" }}>
                      {metadataSummary}
                    </Text>
                  ) : null}
                </Stack>
              ) : (
                <Text fontSize={{ base: "2xl", md: "md" }} fontWeight="bold">
                  Upload PDF manual
                </Text>
              )}
            </Stack>
          </Box>

          <Input
            ref={inputRef}
            accept="application/pdf,.pdf"
            aria-label="PDF manual"
            disabled={isProcessing}
            height="1px"
            opacity={0}
            overflow="hidden"
            position="absolute"
            tabIndex={-1}
            type="file"
            width="1px"
            onChange={(event) => {
              handleFiles(event.currentTarget.files ?? [])
            }}
          />
        </Box>

        {message ? (
          <Text
            color={message.tone === "error" ? "bagging.warning" : "bagging.muted"}
            fontSize="sm"
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </Text>
        ) : null}

        <Stack gap={2}>
          <Button
            bg={canRun ? "bagging.action" : "bagging.action.disabled"}
            color="white"
            disabled={!canRun}
            minH={{ base: "80px", md: "40px" }}
            onClick={onPrimaryAction}
            rounded="md"
            width="full"
            _hover={canRun ? { bg: "moss.600" } : undefined}
          >
            <Play size={20} aria-hidden="true" />
            <Text as="span" fontSize={{ base: "2xl", md: "md" }}>
              Bag it!
            </Text>
          </Button>
        </Stack>
      </Stack>
    </Panel>
  )
}
