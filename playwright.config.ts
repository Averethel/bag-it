import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
const defaultBaseURL = "http://127.0.0.1:3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || defaultBaseURL;
const shouldStartLocalServer = isEquivalentLocalServerUrl(
  baseURL,
  defaultBaseURL,
);
const localServerHostname = getLocalServerHostname(baseURL);

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
  const normalizedHostname = normalizeHostname(hostname);

  return (
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "localhost" ||
    normalizedHostname === "::1"
  );
}

function getLocalServerHostname(candidate: string) {
  try {
    return normalizeHostname(new URL(candidate).hostname);
  } catch {
    return normalizeHostname(new URL(defaultBaseURL).hostname);
  }
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[(.*)]$/, "$1");
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
          command: `npm run start -- --hostname ${localServerHostname} --port 3000`,
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
