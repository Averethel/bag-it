import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
const defaultBaseURL = "http://127.0.0.1:3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || defaultBaseURL;
const shouldStartLocalServer = isEquivalentLocalServerUrl(
  baseURL,
  defaultBaseURL,
);

function isEquivalentLocalServerUrl(candidate: string, expected: string) {
  try {
    const candidateUrl = new URL(candidate);
    const expectedUrl = new URL(expected);

    return (
      candidateUrl.protocol === expectedUrl.protocol &&
      candidateUrl.port === expectedUrl.port &&
      isLoopbackHost(candidateUrl.hostname) &&
      isLoopbackHost(expectedUrl.hostname)
    );
  } catch {
    return candidate === expected;
  }
}

function isLoopbackHost(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  ...(isCi ? { workers: 1 } : {}),
  reporter: isCi
    ? [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["junit", { outputFile: "test-results/playwright-junit.xml" }],
      ]
    : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  ...(shouldStartLocalServer
    ? {
        webServer: {
          command: "npm run start -- --hostname 127.0.0.1 --port 3000",
          url: baseURL,
          reuseExistingServer: !isCi,
          timeout: 120_000,
        },
      }
    : {}),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
