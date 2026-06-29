import { defineConfig, type ReporterDescription } from "@playwright/test"

const port = Number(process.env.PORT ?? process.env.PLAYWRIGHT_PORT ?? 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const desktopViewport = {
  height: 1100,
  width: 1280,
}
const reporter: ReporterDescription[] = process.env.CI
  ? [
      ["list"],
      ["html", { open: "never" }],
      [
        "junit",
        {
          outputFile: process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE ??
            "test-results/playwright-junit.xml",
        },
      ],
    ]
  : [["list"], ["html", { open: "never" }]]

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  timeout: 15 * 60 * 1000,
  expect: {
    timeout: 30 * 1000,
  },
  reporter,
  use: {
    baseURL,
    ...(vercelBypassSecret
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": vercelBypassSecret,
            "x-vercel-set-bypass-cookie": "true",
          },
        }
      : {}),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        channel: "chrome",
        viewport: desktopViewport,
      },
    },
    {
      name: "chromium",
      use: {
        viewport: desktopViewport,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `PORT=${port} "${process.execPath}" node_modules/next/dist/bin/next start`,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        url: baseURL,
      },
})
