import { Button, HStack, Input, Stack, Text } from "@chakra-ui/react"
import { Download, RotateCcw } from "lucide-react"
import { useRef } from "react"
import { Panel } from "./panel"

export function SessionControls({
  canDownload,
  isProcessing,
  onContinueSession,
  onDownloadSession,
}: {
  canDownload: boolean
  isProcessing: boolean
  onContinueSession: (file: File | null) => void
  onDownloadSession: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const detail = isProcessing
    ? "Session import and export pause while intake runs."
    : canDownload
      ? "Save or restore this manual session locally."
      : "Continue from a saved Bag It session file."

  return (
    <Panel>
      <Stack gap={3}>
        <Stack gap={1}>
          <Text fontWeight="semibold">Session</Text>
          <Text color="bagging.muted" fontSize="sm">
            {detail}
          </Text>
        </Stack>
        <HStack gap={2} align="stretch">
          <Button
            disabled={!canDownload || isProcessing}
            flex="1"
            size="sm"
            variant="outline"
            onClick={onDownloadSession}
          >
            <Download size={15} aria-hidden="true" />
            Download
          </Button>
          <Button
            disabled={isProcessing}
            flex="1"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            <RotateCcw size={15} aria-hidden="true" />
            Continue
          </Button>
          <Input
            ref={inputRef}
            accept=".bagit-session,.bagit-session.json,application/json"
            aria-label="Continue session file"
            height="1px"
            opacity={0}
            overflow="hidden"
            position="absolute"
            tabIndex={-1}
            type="file"
            width="1px"
            onChange={(event) => {
              const [file] = Array.from(event.currentTarget.files ?? [])
              onContinueSession(file ?? null)
              event.currentTarget.value = ""
            }}
          />
        </HStack>
      </Stack>
    </Panel>
  )
}
