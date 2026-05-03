import { join } from "node:path";

import { expect, test } from "@playwright/test";

const smallManualPath = join(
  process.cwd(),
  "tests",
  "fixtures",
  "mock-mocs",
  "small",
  "manual.pdf",
);

test("renders the manual workflow shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Bag It/);
  await expect(
    page.getByRole("heading", { name: "Select manual PDF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Manual processing workflow" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Analysis/ }).click();

  await expect(
    page.getByRole("heading", { name: "Analyze manual locally" }),
  ).toBeVisible();
  await expect(page.getByText("Waiting for an active PDF session.")).toBeVisible();
});

test("keeps PDF bytes session-only while restoring local metadata", async ({
  page,
}) => {
  const nonGetRequests: Array<{
    method: string;
    postData: string;
    url: string;
  }> = [];

  page.on("request", (request) => {
    if (request.method() !== "GET") {
      nonGetRequests.push({
        method: request.method(),
        postData: request.postData() ?? "",
        url: request.url(),
      });
    }
  });

  await page.goto("/");
  const appOrigin = new URL(page.url()).origin;

  await page.getByTestId("manual-pdf-input").setInputFiles(smallManualPath);

  await expect(page.getByText("Saved locally")).toBeVisible();
  await expect(page.getByText("manual.pdf").first()).toBeVisible();

  const persistedProjectData = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bag-it-local-projects");

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const projectData = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").get("default");

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    database.close();

    function containsBinary(value: unknown): boolean {
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        return true;
      }

      if (value instanceof Blob) {
        return true;
      }

      if (!value || typeof value !== "object") {
        return false;
      }

      return Object.values(value as Record<string, unknown>).some(containsBinary);
    }

    return {
      hasBinary: containsBinary(projectData),
      serialized: JSON.stringify(projectData),
    };
  });

  expect(persistedProjectData.hasBinary).toBe(false);
  expect(persistedProjectData.serialized).toContain("manual.pdf");
  expect(persistedProjectData.serialized).not.toContain("%PDF");
  expect(persistedProjectData.serialized).not.toContain("byteLength");
  expect(
    nonGetRequests.filter(
      (request) =>
        request.method !== "OPTIONS" && new URL(request.url).origin === appOrigin,
    ),
  ).toEqual([]);
  expect(
    nonGetRequests.some(
      (request) =>
        request.postData.includes("%PDF") ||
        request.postData.includes("manual.pdf"),
    ),
  ).toBe(false);

  await page.reload();

  await expect(page.getByText("No active PDF")).toBeVisible();
  await expect(page.getByText("manual.pdf")).toBeVisible();

  await page.getByRole("button", { name: /Analysis/ }).click();

  await expect(page.getByText("Waiting for an active PDF session.")).toBeVisible();
});
