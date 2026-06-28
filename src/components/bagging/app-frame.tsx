import { Box, Container, Grid, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import type { ReactNode } from "react"

export function AppFrame({
  sidebar,
  children,
}: {
  sidebar: ReactNode
  children: ReactNode
}) {
  return (
    <Box minH="100vh" bg="bagging.canvas" color="bagging.text">
      <Container maxW="7xl" py={{ base: 6, md: 5 }} px={{ base: 4, md: 5, xl: 6 }}>
        <Stack gap={{ base: 8, md: 5 }}>
          <Stack gap={{ base: 5, md: 3 }}>
            <Box
              alignSelf="start"
              bg="bagging.action.subtle"
              borderRadius="md"
              color="bagging.action"
              fontSize={{ base: "md", md: "xs" }}
              fontWeight="medium"
              px={{ base: 3, md: 2 }}
              py={{ base: 1, md: 0.5 }}
            >
              MOC bag prep
            </Box>
            <Heading
              as="h1"
              fontSize={{ base: "4xl", md: "3xl", xl: "4xl" }}
              fontWeight="bold"
              letterSpacing="0"
              lineHeight="1.05"
              maxW="full"
              whiteSpace={{ base: "normal", xl: "nowrap" }}
            >
              Turn a MOC manual into builder-ready bags
            </Heading>
            <Text
              color="bagging.muted"
              fontSize={{ base: "xl", md: "md", xl: "lg" }}
              lineHeight="1.45"
              maxW="5xl"
            >
              Upload the original instructions, keep building from that PDF, and
              use Bag It to prepare companion guidance for parts, steps, and
              physical bags.
            </Text>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={{ base: 3, md: 3 }}>
              <HeroPoint
                title="Use the original manual"
                detail="The PDF remains the build source of truth."
              />
              <HeroPoint
                title="Shape the parts and steps"
                detail="Bag It prepares normalized parts and step ranges."
              />
              <HeroPoint
                title="Pack build-ready bags"
                detail="Each bag maps to manual steps and a parts checklist."
              />
            </SimpleGrid>
          </Stack>

          <Grid
            alignItems="start"
            gap={{ base: 5, xl: 4 }}
            templateColumns={{ base: "1fr", xl: "320px minmax(0, 1fr)" }}
          >
            <Stack
              gap={{ base: 5, md: 3 }}
              maxH={{ xl: "calc(100vh - var(--chakra-spacing-8))" }}
              overflowY={{ xl: "auto" }}
              pb={{ xl: 1 }}
              position={{ xl: "sticky" }}
              top={{ xl: 4 }}
            >
              {sidebar}
            </Stack>
            <Box minW={0}>{children}</Box>
          </Grid>
        </Stack>
      </Container>
    </Box>
  )
}

function HeroPoint({ title, detail }: { title: string; detail: string }) {
  return (
    <Box
      bg="bagging.surface"
      borderLeftColor="bagging.action"
      borderLeftWidth="4px"
      minH={{ base: "122px", md: "80px" }}
      px={{ base: 5, md: 4 }}
      py={{ base: 4, md: 2.5 }}
    >
      <Stack gap={1}>
        <Text fontSize={{ base: "xl", md: "md" }} fontWeight="bold" lineHeight="1.2">
          {title}
        </Text>
        <Text color="bagging.muted" fontSize={{ base: "lg", md: "sm" }}>
          {detail}
        </Text>
      </Stack>
    </Box>
  )
}
