import { describe, expect, it } from "vitest";

import { createPdfSessionFromFile, isPdfFile } from "./pdf-session";

describe("pdf session", () => {
  it("creates an in-memory PDF session from a selected file", async () => {
    const file = new File(["%PDF-1.7\nfixture"], "manual.pdf", {
      lastModified: 1_700_000_000_000,
      type: "application/pdf",
    });

    const session = await createPdfSessionFromFile(file, {
      createId: () => "session-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(session.file).toBe(file);
    expect(new TextDecoder().decode(session.bytes)).toBe("%PDF-1.7\nfixture");
    expect(session.metadata).toEqual({
      id: "session-1",
      fileName: "manual.pdf",
      fileSize: file.size,
      fileType: "application/pdf",
      lastModified: 1_700_000_000_000,
      loadedAt: "2026-01-01T00:00:00.000Z",
      byteLength: file.size,
      pageCount: null,
    });
  });

  it("accepts PDFs when the header appears near the start of the file", async () => {
    const file = new File(["\n%PDF-1.7\nfixture"], "manual.pdf", {
      type: "application/pdf",
    });

    await expect(createPdfSessionFromFile(file)).resolves.toMatchObject({
      metadata: {
        fileName: "manual.pdf",
      },
    });
  });

  it("rejects non-PDF files", async () => {
    const file = new File(["not a pdf"], "manual.txt", { type: "text/plain" });

    expect(isPdfFile(file)).toBe(false);
    await expect(createPdfSessionFromFile(file)).rejects.toThrow(
      "Selected file must be a PDF.",
    );
  });

  it("rejects PDF-named files without a PDF header", async () => {
    const file = new File(["not a pdf"], "manual.pdf", {
      type: "application/pdf",
    });

    expect(isPdfFile(file)).toBe(true);
    await expect(createPdfSessionFromFile(file)).rejects.toThrow(
      "Selected file does not look like a valid PDF.",
    );
  });
});
