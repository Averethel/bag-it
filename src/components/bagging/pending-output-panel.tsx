import { Box, Flex, Stack, Text } from "@chakra-ui/react"
import type { ReactNode } from "react"

export function PendingOutputPanel({
  icon,
  message,
}: {
  icon: ReactNode
  message: string
}) {
  return (
    <Box
      display="flex"
      flex="1"
      minH="bagging.zero"
      border="sm"
      borderColor="bagging.border"
      bg="white"
      rounded="md"
      p="4"
    >
      <Flex
        flex="1"
        minH="60"
        align="center"
        justify="center"
        border="sm"
        borderStyle="dashed"
        borderColor="bagging.border"
        rounded="md"
        bg="bagging.subtleBg"
        px="4"
        textAlign="center"
      >
        <Stack align="center" gap="2" maxW="bagging.panelMax">
          <Flex
            aria-hidden="true"
            align="center"
            justify="center"
            boxSize="bagging.pendingIcon"
            rounded="full"
            bg="bagging.iconBg"
            color="bagging.iconFg"
          >
            {icon}
          </Flex>
          <Text fontWeight="semibold">Waiting for analysis</Text>
          <Text color="fg.muted" fontSize="sm">
            {message}
          </Text>
        </Stack>
      </Flex>
    </Box>
  )
}
