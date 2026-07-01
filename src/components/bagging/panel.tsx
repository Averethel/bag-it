import { Box, type BoxProps } from "@chakra-ui/react"

export function Panel(props: BoxProps) {
  return (
    <Box
      bg="bagging.surface"
      borderColor="bagging.border"
      borderRadius="panel"
      borderWidth="1px"
      p={4}
      {...props}
    />
  )
}
