import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const smallManualPath = join(
  process.cwd(),
  "tests",
  "fixtures",
  "mock-mocs",
  "small",
  "manual.pdf",
);
const readOnlyRequestMethods = new Set(["GET", "HEAD", "OPTIONS"]);

test("renders the manual workflow shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-shell")).toHaveAttribute(
    "data-hydrated",
    "true",
  );

  await expect(page).toHaveTitle(/Bag It/);
  await expect(
    page.getByRole("heading", { name: "Build MOCs like boxed LEGO sets." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Manual processing workflow" }),
  ).toBeHidden();
  await expect(page.getByTestId("manual-upload-dropzone")).toBeVisible();
  await expect(page.getByTestId("csv-upload-dropzone")).toBeVisible();
  await expect(page.getByText("No manual selected")).toBeVisible();
  await expect(page.getByText("No CSV loaded")).toBeVisible();
  await expect(page.getByRole("region", { name: "Upload files" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bag it" })).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Analysis controls" }),
  ).toBeHidden();
  await expect(page.getByText("Local project data")).toBeHidden();
});

test("keeps PDF bytes session-only while restoring local metadata", async ({
  page,
}) => {
  const mutatingRequests: Array<{
    method: string;
    postData: string;
    url: string;
  }> = [];

  page.on("request", (request) => {
    if (!readOnlyRequestMethods.has(request.method())) {
      mutatingRequests.push({
        method: request.method(),
        postData: request.postData() ?? "",
        url: request.url(),
      });
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("home-shell")).toHaveAttribute(
    "data-hydrated",
    "true",
  );
  const appOrigin = new URL(page.url()).origin;
  await expect(page.getByText("No manual selected")).toBeVisible();

  await page.getByTestId("manual-pdf-input").setInputFiles(smallManualPath);

  await expect(page.getByText("manual.pdf").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Bag it" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Remove manual PDF" })).toHaveText(
    "X",
  );

  await expect
    .poll(async () => (await readPersistedProjectData(page)).serialized)
    .toContain("manual.pdf");

  const persistedProjectData = await readPersistedProjectData(page);

  expect(persistedProjectData.hasBinary).toBe(false);
  expect(persistedProjectData.serialized).toContain("manual.pdf");
  expect(persistedProjectData.serialized).not.toContain("%PDF");
  expect(persistedProjectData.serialized).not.toContain("byteLength");
  expect(
    mutatingRequests.filter(
      (request) => new URL(request.url).origin === appOrigin,
    ),
  ).toEqual([]);
  expect(
    mutatingRequests.some(
      (request) =>
        request.postData.includes("%PDF") ||
        request.postData.includes("manual.pdf"),
    ),
  ).toBe(false);

  await page.reload();

  await expect(page.getByText("No manual selected")).toBeVisible();
  await expect(page.getByText("Previous manual")).toBeHidden();
  await expect(page.getByText("manual.pdf")).toBeHidden();
  await expect(page.getByRole("button", { name: "Bag it" })).toBeDisabled();
});

async function readPersistedProjectData(page: Page) {
  return page.evaluate(async () => {
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
}
