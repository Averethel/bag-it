import { expect, test } from "@playwright/test";

test("renders the base application shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Bag It/);
  await expect(page.getByRole("heading", { name: "Bag It" })).toBeVisible();
  await expect(page.getByText("Local First")).toBeVisible();
});
