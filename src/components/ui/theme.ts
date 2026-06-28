import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        moss: {
          50: { value: "#edf8ef" },
          100: { value: "#d5ecd8" },
          200: { value: "#a9dab0" },
          400: { value: "#99d8a8" },
          500: { value: "#18a84f" },
          600: { value: "#11863f" },
          700: { value: "#1e5f31" },
          900: { value: "#12381f" },
        },
        paper: {
          50: { value: "#f8faf7" },
          100: { value: "#edf0eb" },
          200: { value: "#d9ded5" },
          800: { value: "#273026" },
          900: { value: "#151a14" },
        },
      },
      fonts: {
        heading: { value: "var(--font-geist-sans), sans-serif" },
        body: { value: "var(--font-geist-sans), sans-serif" },
        mono: { value: "var(--font-geist-mono), monospace" },
      },
      radii: {
        panel: { value: "0.5rem" },
      },
    },
    semanticTokens: {
      colors: {
        "bagging.canvas": {
          value: { base: "{colors.paper.50}", _dark: "{colors.paper.900}" },
        },
        "bagging.surface": {
          value: { base: "white", _dark: "{colors.paper.800}" },
        },
        "bagging.surface.subtle": {
          value: { base: "{colors.paper.100}", _dark: "{colors.gray.800}" },
        },
        "bagging.border": {
          value: { base: "{colors.paper.200}", _dark: "{colors.gray.700}" },
        },
        "bagging.text": {
          value: { base: "{colors.gray.900}", _dark: "{colors.gray.50}" },
        },
        "bagging.muted": {
          value: { base: "{colors.gray.600}", _dark: "{colors.gray.400}" },
        },
        "bagging.action": {
          value: { base: "{colors.moss.500}", _dark: "{colors.moss.200}" },
        },
        "bagging.action.disabled": {
          value: { base: "{colors.moss.400}", _dark: "{colors.moss.900}" },
        },
        "bagging.action.subtle": {
          value: { base: "{colors.moss.50}", _dark: "{colors.moss.900}" },
        },
        "bagging.warning": {
          value: { base: "{colors.orange.600}", _dark: "{colors.orange.300}" },
        },
        "bagging.review.surface": {
          value: { base: "{colors.orange.50}", _dark: "{colors.orange.950}" },
        },
        "bagging.review.surface.hover": {
          value: { base: "{colors.orange.100}", _dark: "{colors.orange.900}" },
        },
        "bagging.review.border": {
          value: { base: "{colors.orange.300}", _dark: "{colors.orange.400}" },
        },
        "bagging.review.border.subtle": {
          value: { base: "{colors.orange.200}", _dark: "{colors.orange.400}" },
        },
        "bagging.preview": {
          value: { base: "{colors.blue.50}", _dark: "{colors.blue.950}" },
        },
      },
      shadows: {
        "bagging.review.ring": {
          value: {
            base: "0 0 0 1px {colors.orange.300}",
            _dark: "0 0 0 1px {colors.orange.400}",
          },
        },
      },
    },
  },
})

export const system = createSystem(defaultConfig, config)
