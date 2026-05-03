import { describe, expect, it } from "vitest";

import type { PdfSessionMetadata } from "./pdf-session";

import {
  assertSafeLocalProjectData,
  createEmptyLocalProjectData,
  serializeLocalProjectData,
  withPdfSessionMetadata,
} from "./local-project-data";

const pdfMetadata: PdfSessionMetadata = {
  id: "session-1",
  fileName: "manual.pdf",
  fileSize: 32,
  fileType: "application/pdf",
  lastModified: 1_700_000_000_000,
  loadedAt: "2026-01-01T00:00:00.000Z",
  byteLength: 32,
  pageCount: null,
};

describe("local project data", () => {
  it("persists only safe manual metadata from a PDF session", () => {
    const projectData = withPdfSessionMetadata(
      createEmptyLocalProjectData({
        projectId: "project-1",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      }),
      pdfMetadata,
      { now: () => new Date("2026-01-01T00:01:00.000Z") },
    );

    expect(projectData.manual).toEqual({
      fileName: "manual.pdf",
      fileSize: 32,
      fileType: "application/pdf",
      lastModified: 1_700_000_000_000,
      pageCount: null,
    });
    expect(serializeLocalProjectData(projectData)).not.toContain("%PDF");
    expect(serializeLocalProjectData(projectData)).not.toContain("byteLength");
    expect(serializeLocalProjectData(projectData)).not.toContain("session-1");
  });

  it("rejects binary data and manual byte fields before persistence", () => {
    expect(() =>
      assertSafeLocalProjectData({
        schemaVersion: 1,
        projectId: "project-1",
        pdfBytes: "%PDF-1.7",
      }),
    ).toThrow("$.pdfBytes is not allowed in local project data.");

    expect(() =>
      assertSafeLocalProjectData({
        schemaVersion: 1,
        projectId: "project-1",
        manual: new Uint8Array([37, 80, 68, 70]),
      }),
    ).toThrow("$.manual contains non-persistable binary manual data.");
  });
});
