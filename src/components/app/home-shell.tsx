"use client";

import { Badge, Box, Container, Heading, HStack, Stack, Text } from "@chakra-ui/react";

export function HomeShell() {
  return (
    <Box as="main" minH="100vh" bg="gray.50">
      <Container maxW="4xl" py={{ base: "16", md: "24" }}>
        <Stack gap="8">
          <HStack gap="3">
            <Badge colorPalette="blue" variant="solid">
              App Shell
            </Badge>
            <Badge colorPalette="green" variant="subtle">
              Local First
            </Badge>
          </HStack>

          <Stack gap="4">
            <Heading as="h1" size={{ base: "3xl", md: "5xl" }}>
              Bag It
            </Heading>
            <Text color="gray.700" fontSize={{ base: "lg", md: "xl" }} maxW="2xl">
              Base application setup is ready. Feature work will build on this
              local-only Next.js and Chakra UI foundation.
            </Text>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
