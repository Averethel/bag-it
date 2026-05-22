import { Box, Container, Stack } from "@chakra-ui/react"
import type { ReactNode } from "react"

export function BaggingPageFrame({ children }: { children: ReactNode }) {
  return (
    <Box minH="vh" bg="bagging.pageBg" color="bagging.text">
      <Container
        maxW="7xl"
        minH="vh"
        h={{ lg: "vh" }}
        display="flex"
        flexDirection="column"
        overflow={{ lg: "hidden" }}
        px={{ base: "4", md: "6" }}
        py={{ base: "6", md: "10" }}
      >
        <Stack flex="1" minH="bagging.zero" gap={{ base: "6", md: "8" }}>
          {children}
        </Stack>
      </Container>
    </Box>
  )
}
