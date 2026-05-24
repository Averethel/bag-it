import { Stack, Tabs } from "@chakra-ui/react"
import { Boxes, Bug, PackageCheck, Search } from "lucide-react"
import type { ReactNode } from "react"

export function OutputTabs({
  bags,
  debug,
  matchingDebug,
  parts,
}: {
  bags: ReactNode
  debug?: ReactNode
  matchingDebug?: ReactNode
  parts: ReactNode
}) {
  return (
    <Tabs.Root
      defaultValue="parts"
      variant="line"
      lazyMount
      display="flex"
      flexDirection="column"
      flex="1"
      minH="bagging.zero"
      minW="bagging.zero"
      maxW="full"
      w="full"
    >
      <Stack flex="1" minH="bagging.zero" minW="bagging.zero" maxW="full" w="full" gap="4">
        <Tabs.List maxW="full" minW="bagging.zero" overflowX="auto">
          <Tabs.Trigger value="parts" flexShrink={0}>
            <Boxes size={16} />
            Part list
          </Tabs.Trigger>
          <Tabs.Trigger value="matching" flexShrink={0}>
            <Search size={16} />
            Build steps
          </Tabs.Trigger>
          <Tabs.Trigger value="bags" flexShrink={0}>
            <PackageCheck size={16} />
            Bags
          </Tabs.Trigger>
          {debug ? (
            <Tabs.Trigger value="debug" flexShrink={0}>
              <Bug size={16} />
              Debug
            </Tabs.Trigger>
          ) : null}
        </Tabs.List>

        <Tabs.Content value="parts" display="flex" flex="1" minH="bagging.zero" minW="bagging.zero" maxW="full" overflow={{ lg: "hidden" }}>
          {parts}
        </Tabs.Content>
        <Tabs.Content value="matching" display="flex" flex="1" minH="bagging.zero" minW="bagging.zero" maxW="full" overflow={{ lg: "hidden" }}>
          {matchingDebug}
        </Tabs.Content>
        <Tabs.Content value="bags" display="flex" flex="1" minH="bagging.zero" minW="bagging.zero" maxW="full" overflow={{ lg: "hidden" }}>
          {bags}
        </Tabs.Content>
        {debug ? (
          <Tabs.Content value="debug" display="flex" flex="1" minH="bagging.zero" minW="bagging.zero" maxW="full" overflow={{ lg: "hidden" }}>
            {debug}
          </Tabs.Content>
        ) : null}
      </Stack>
    </Tabs.Root>
  )
}
