"use client"

import { Box, Button, Input, Stack } from "@chakra-ui/react"
import { Download, Upload } from "lucide-react"
import { useRef, type ChangeEvent, type CSSProperties } from "react"

const hiddenInputStyle = {
  height: 1,
  margin: -1,
  opacity: 0,
  position: "absolute",
  width: 1,
} satisfies CSSProperties

export function SessionControlsCard({
  canDownloadSession = false,
  isRunning,
  onDownloadSession,
  onSessionSelected,
}: {
  canDownloadSession?: boolean
  isRunning: boolean
  onDownloadSession?: () => void
  onSessionSelected?: (file: File) => void
}) {
  const sessionInputRef = useRef<HTMLInputElement | null>(null)

  function handleSessionFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      onSessionSelected?.(file)
    }
    event.currentTarget.value = ""
  }

  return (
    <Box border="sm" borderColor="bagging.border" bg="white" rounded="md" p="4">
      <Stack gap="2">
        <Button
          w="full"
          type="button"
          variant="outline"
          disabled={isRunning || !canDownloadSession || !onDownloadSession}
          onClick={onDownloadSession}
        >
          <Download size={16} />
          Download session
        </Button>
        <Button
          w="full"
          type="button"
          variant="outline"
          disabled={isRunning || !onSessionSelected}
          onClick={() => sessionInputRef.current?.click()}
        >
          <Upload size={16} />
          Continue session
        </Button>
        <Input
          ref={sessionInputRef}
          aria-label="Upload Bag It session"
          type="file"
          accept="application/json,.json,.bagit,.bagit.json"
          onChange={handleSessionFileChange}
          style={hiddenInputStyle}
        />
      </Stack>
    </Box>
  )
}
