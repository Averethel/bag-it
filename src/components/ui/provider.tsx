"use client"

import { ChakraProvider } from "@chakra-ui/react"
import { bagItSystem } from "./theme"

export function Provider({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={bagItSystem}>{children}</ChakraProvider>
}
