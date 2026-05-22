import { Buffer } from "node:buffer"

import { expect, test } from "@playwright/test"

test("renders the bagging shell and accepts a PDF selection", async ({ page }) => {
  await page.goto("/")

  await expect(page).toHaveTitle(/Bag It/)
  await expect(page.getByRole("heading", { name: "Turn a MOC manual into builder-ready bags" })).toBeVisible()
  await expect(page.getByText("Use the original manual")).toBeVisible()

  const startButton = page.getByRole("button", { name: "Bag it!" })
  await expect(page.getByLabel("Upload PDF manual")).toBeAttached()
  await expect(startButton).toBeDisabled()

  await page.getByLabel("Upload PDF manual").setInputFiles({
    name: "smoke-manual.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
  })

  await expect(page.getByText("smoke-manual.pdf")).toBeVisible()
  await expect(startButton).toBeEnabled()
  await expect(page.getByRole("button", { name: "Remove uploaded manual" })).toBeVisible()
})
