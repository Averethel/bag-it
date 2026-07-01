import { Badge, HStack, Stack, Text } from "@chakra-ui/react"
import { AlertTriangle } from "lucide-react"
import { Panel } from "./panel"

export function AttentionCard({ issues }: { issues: string[] }) {
  if (issues.length === 0) {
    return null
  }

  return (
    <Panel>
      <Stack gap={3}>
        <HStack gap={2}>
          <AlertTriangle size={16} aria-hidden="true" />
          <Text fontWeight="semibold">Attention</Text>
        </HStack>
        <Stack gap={2}>
          {issues.map((item) => (
            <HStack key={item} justify="space-between" gap={3}>
              <Text color="bagging.muted" fontSize="sm">
                {item}
              </Text>
              <Badge colorPalette="gray" size="sm">
                placeholder
              </Badge>
            </HStack>
          ))}
        </Stack>
      </Stack>
    </Panel>
  )
}
