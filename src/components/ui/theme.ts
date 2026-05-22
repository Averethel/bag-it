import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"

const bagItConfig = defineConfig({
  strictTokens: true,
  theme: {
    tokens: {
      borderStyles: {
        dashed: { value: "dashed" },
      },
      colors: {
        bagging: {
          swatch: {
            black: { value: "#1f2020" },
            darkRed: { value: "#7f1d1d" },
            lightBluishGray: { value: "#a9aaa6" },
            tan: { value: "#d6b883" },
          },
        },
      },
      borders: {
        bagging: {
          accent: { value: "3px solid" },
        },
      },
      lineHeights: {
        bagging: {
          hero: { value: "1.05" },
        },
      },
      sizes: {
        bagging: {
          overviewMax: { value: "920px" },
          panelMax: { value: "360px" },
          sidebar: { value: "360px" },
          pendingIcon: { value: "34px" },
          partListMax: { value: "560px" },
          zero: { value: "0" },
        },
      },
      spacing: {
        bagging: {
          none: { value: "0" },
        },
      },
    },
    semanticTokens: {
      colors: {
        bagging: {
          accent: { value: "#668c5a" },
          border: { value: "#d9dfd1" },
          borderStrong: { value: "#aeb8a8" },
          done: { value: "#2f6b3d" },
          iconBg: { value: "#e8efe2" },
          iconFg: { value: "#33513b" },
          imageBg: { value: "#eef1ea" },
          muted: { value: "#6a7168" },
          pageBg: { value: "#f7f8f5" },
          rowBorder: { value: "#e0e5db" },
          subtleBg: { value: "#fbfcf8" },
          text: { value: "#20251f" },
        },
      },
    },
  },
})

export const bagItSystem = createSystem(defaultConfig, bagItConfig)

export default bagItSystem
