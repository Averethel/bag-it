import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
const defaultBaseURL = "http://127.0.0.1:3000";
const baseURL = resolveBaseURL(process.env.PLAYWRIGHT_BASE_URL);
const vercelAutomationBypassSecret =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const vercelAutomationBypassHeaders = vercelAutomationBypassSecret
  ? {
      "x-vercel-protection-bypass": vercelAutomationBypassSecret,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined;
const shouldStartLocalServer = isEquivalentLocalServerUrl(
  baseURL,
  defaultBaseURL,
);
const localServerHostname = getLocalServerHostname(baseURL);
const localServerURL = getLocalServerURL(baseURL);

function resolveBaseURL(configuredBaseURL: string | undefined) {
  const resolvedBaseURL = configuredBaseURL?.trim() || defaultBaseURL;

  return validateAbsoluteHttpURL(resolvedBaseURL, "PLAYWRIGHT_BASE_URL");
}

function validateAbsoluteHttpURL(value: string, sourceName: string) {
  let parsedURL: URL;

  try {
    parsedURL = new URL(value);
  } catch {
    throw new Error(
      `${sourceName} must be a valid absolute http(s) URL, but received: ${JSON.stringify(value)}`,
    );
  }

  if (parsedURL.protocol !== "http:" && parsedURL.protocol !== "https:") {
    throw new Error(
      `${sourceName} must use the http or https protocol, but received: ${JSON.stringify(value)}`,
    );
  }

  if (parsedURL.pathname === "/" && !parsedURL.search && !parsedURL.hash) {
    return parsedURL.origin;
  }

  return parsedURL.toString();
}

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
  const normalizedHostname = stripIpv6Brackets(hostname);

  return (
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "localhost" ||
    normalizedHostname === "::1"
  );
}

function getLocalServerHostname(candidate: string) {
  try {
    return stripIpv6Brackets(new URL(candidate).hostname);
  } catch {
    return stripIpv6Brackets(new URL(defaultBaseURL).hostname);
  }
}

function getLocalServerURL(candidate: string) {
  try {
    return new URL(candidate).origin;
  } catch {
    return new URL(defaultBaseURL).origin;
  }
}

function stripIpv6Brackets(hostname: string) {
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
    ...(vercelAutomationBypassHeaders
      ? { extraHTTPHeaders: vercelAutomationBypassHeaders }
      : {}),
  },
  ...(shouldStartLocalServer
    ? {
        webServer: {
          command: `npm run start -- --hostname ${localServerHostname} --port 3000`,
          url: localServerURL,
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
