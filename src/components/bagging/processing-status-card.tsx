import { Badge, Box, HStack, Progress, Stack, Text } from "@chakra-ui/react"
import { AlertCircle, CheckCircle2, CircleDashed } from "lucide-react"

export type ProcessingStatusStep = {
  activity?: string | null
  detail?: string | null
  label: string
  progress: number
  state: "active" | "complete" | "failed" | "pending"
}

export function ProcessingStatusCard({
  steps,
}: {
  steps: readonly ProcessingStatusStep[]
}) {
  return (
    <Box border="sm" borderColor="bagging.border" bg="white" rounded="md" p="4">
      <Stack gap="3">
        <Text fontWeight="semibold">Processing status</Text>
        <Stack gap="3">
          {steps.map((step) => (
            <StatusRow key={step.label} {...step} />
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}

function StatusRow({ activity, detail, label, progress, state }: ProcessingStatusStep) {
  const color = state === "failed" ? "red.700" : state === "complete" ? "bagging.done" : "bagging.muted"
  const colorPalette = state === "failed" ? "red" : state === "complete" ? "green" : "yellow"
  const icon = state === "failed"
    ? <AlertCircle size={16} />
    : state === "complete"
      ? <CheckCircle2 size={16} />
      : <CircleDashed size={16} />
  const stateLabel =
    state === "complete"
      ? "Completed"
      : state === "active"
        ? "In progress"
        : state === "failed"
          ? "Failed"
          : "Waiting"

  return (
    <Stack gap="2">
      <HStack gap="2" justify="space-between" align="center">
        <HStack gap="2" color={color} minW="bagging.zero" align="center">
          <Box
            as="span"
            alignItems="center"
            aria-hidden="true"
            boxSize="4"
            display="inline-flex"
            flexShrink={0}
            justifyContent="center"
          >
            {icon}
          </Box>
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text fontSize="sm" fontWeight="semibold">
              {label}
            </Text>
            {detail ? (
              <Text color="fg.muted" fontSize="xs" lineHeight="short">
                {detail}
              </Text>
            ) : null}
            {activity ? (
              <Text color="fg.muted" fontSize="xs" lineHeight="short">
                {activity}
              </Text>
            ) : null}
          </Stack>
        </HStack>
        <Badge colorPalette={colorPalette} flexShrink={0} variant="subtle">
          {stateLabel}
        </Badge>
      </HStack>
      <Progress.Root value={progress} colorPalette={colorPalette} size="xs">
        <Progress.Track aria-label={`${label} progress`} overflow="hidden" position="relative">
          <Progress.Range />
          {state === "active" ? (
            <Box
              aria-hidden="true"
              bg="yellow.500"
              style={{
                animation: "bagging-progress-activity 1.4s ease-in-out infinite",
                bottom: 0,
                left: "-35%",
                opacity: 0.42,
                position: "absolute",
                top: 0,
                width: "35%",
              }}
            />
          ) : null}
        </Progress.Track>
      </Progress.Root>
    </Stack>
  )
}
