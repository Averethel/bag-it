import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react"
import { CheckCircle2, CircleDashed, LoaderCircle, XCircle } from "lucide-react"
import { Panel } from "./panel"

type StatusState = "pending" | "active" | "complete" | "failed"

export type StatusRow = {
  label: string
  detail: string
  state: StatusState
  progress: number
}

const icons = {
  pending: CircleDashed,
  active: LoaderCircle,
  complete: CheckCircle2,
  failed: XCircle,
}

const palettes = {
  pending: "gray",
  active: "blue",
  complete: "green",
  failed: "red",
}

export function ProcessingStatusCard({ rows }: { rows: StatusRow[] }) {
  return (
    <Panel>
      <Stack gap={4}>
        <Text fontWeight="semibold">Processing status</Text>
        <Stack gap={3}>
          {rows.map((row) => {
            const Icon = icons[row.state]

            return (
              <Stack key={row.label} gap={2}>
                <HStack justify="space-between" gap={2} minW={0}>
                  <HStack gap={2} minW={0} overflow="hidden">
                    <Box
                      alignItems="center"
                      animation={
                        row.state === "active"
                          ? "bagging-status-spin 0.9s linear infinite"
                          : undefined
                      }
                      data-processing-status-icon={row.state}
                      display="inline-flex"
                      flexShrink={0}
                      justifyContent="center"
                    >
                      <Icon size={16} aria-hidden="true" />
                    </Box>
                    <HStack gap={1.5} minW={0} overflow="hidden" whiteSpace="nowrap">
                      <Text flexShrink={0} fontSize="sm" fontWeight="medium">
                        {row.label}
                      </Text>
                      <Text
                        color="bagging.muted"
                        fontSize="xs"
                        lineHeight="1"
                        minW={0}
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                      >
                        {row.detail}
                      </Text>
                    </HStack>
                  </HStack>
                  <Badge colorPalette={palettes[row.state]} flexShrink={0} size="sm">
                    {row.state}
                  </Badge>
                </HStack>
                <Box
                  aria-label={`${row.label} progress`}
                  bg="bagging.surface.subtle"
                  borderRadius="full"
                  h="2"
                  overflow="hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={row.progress}
                >
                  <Box bg="bagging.action" h="full" width={`${row.progress}%`} />
                </Box>
              </Stack>
            )
          })}
        </Stack>
      </Stack>
    </Panel>
  )
}
