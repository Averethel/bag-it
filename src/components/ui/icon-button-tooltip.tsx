import { Portal, Tooltip } from "@chakra-ui/react"
import type { ReactElement } from "react"

export function IconButtonTooltip({
  children,
  label,
}: {
  children: ReactElement
  label: string
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  )
}
