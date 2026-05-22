import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { Provider } from "@/components/ui/provider"

export function renderWithProvider(ui: ReactNode, userOptions?: Parameters<typeof userEvent.setup>[0]) {
  const user = userEvent.setup(userOptions)

  return {
    user,
    ...render(<Provider>{ui}</Provider>),
  }
}
