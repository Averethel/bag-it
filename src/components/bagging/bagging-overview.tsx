import { Badge, Box, Grid, Heading, Stack, Text } from "@chakra-ui/react"
import type { OverviewItem } from "@/features/bagging/types"

export function BaggingOverview({
  badge,
  description,
  items,
  title,
}: {
  badge: string
  description: string
  items: readonly OverviewItem[]
  title: string
}) {
  return (
    <Stack gap="4" maxW="bagging.overviewMax">
      <Badge alignSelf="flex-start" colorPalette="green" variant="subtle">
        {badge}
      </Badge>
      <Heading as="h1" size={{ base: "2xl", md: "4xl" }} lineHeight="bagging.hero">
        {title}
      </Heading>
      <Text color="fg.muted" fontSize={{ base: "md", md: "lg" }}>
        {description}
      </Text>
      <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap="3">
        {items.map((item) => (
          <Box
            key={item.label}
            borderLeft="bagging.accent"
            borderColor="bagging.accent"
            bg="whiteAlpha.700"
            px="3"
            py="2"
          >
            <Text fontWeight="semibold">{item.label}</Text>
            <Text color="fg.muted" fontSize="sm">
              {item.detail}
            </Text>
          </Box>
        ))}
      </Grid>
    </Stack>
  )
}
