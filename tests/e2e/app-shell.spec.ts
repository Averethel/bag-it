import { expect, test } from "@playwright/test";

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
