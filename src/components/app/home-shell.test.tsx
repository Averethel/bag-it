import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Provider } from "@/components/ui/provider";
import {
  createEmptyLocalProjectData,
  type LocalProjectData,
  type LocalProjectStore,
} from "@/domain/local-project-data";
import type { ExtractPartListOptions } from "@/domain/browser-pdf-ocr";
import type { RebrickableCatalogFetchResult } from "@/domain/rebrickable-catalog";
import type { PartListExtractionResult } from "@/domain/part-list-extraction";
import type { PdfSession } from "@/domain/pdf-session";

import { HomeShell } from "./home-shell";

function renderHomeShell(
  projectStore = createMemoryProjectStore(),
  analyzePdfSession?: (
    pdfSession: PdfSession,
    options?: ExtractPartListOptions,
  ) => Promise<PartListExtractionResult>,
  fetchCatalogParts?: (
    partNumbers: string[],
  ) => Promise<RebrickableCatalogFetchResult>,
) {
  const homeShellProps = {
    projectStore,
    ...(analyzePdfSession ? { analyzePdfSession } : {}),
    ...(fetchCatalogParts ? { fetchCatalogParts } : {}),
  };

  return render(
    <Provider>
      <HomeShell {...homeShellProps} />
    </Provider>,
  );
}

function createMemoryProjectStore(initialProjectData: LocalProjectData | null = null) {
  const savedProjectData: LocalProjectData[] = [];
  let projectData = initialProjectData;

  const store: LocalProjectStore & { savedProjectData: LocalProjectData[] } = {
    savedProjectData,
    load: vi.fn(async () => projectData),
    save: vi.fn(async (nextProjectData) => {
      projectData = nextProjectData;
      savedProjectData.push(nextProjectData);
    }),
    clear: vi.fn(async () => {
      projectData = null;
    }),
  };

  return store;
}

function projectDataWithManual(fileName: string): LocalProjectData {
  return {
    ...createEmptyLocalProjectData(),
    manual: {
      fileName,
      fileSize: 1_024,
      fileType: "application/pdf",
      lastModified: 1_700_000_000_000,
      pageCount: null,
    },
  };
}

function createCatalogFetchResult(
  parts: RebrickableCatalogFetchResult["parts"] = [],
  colorNamesById: RebrickableCatalogFetchResult["colorNamesById"] = {},
  colorRgbById: RebrickableCatalogFetchResult["colorRgbById"] = {},
): RebrickableCatalogFetchResult {
  return {
    parts,
    missingPartNumbers: [],
    warnings: [],
    colorNamesById,
    colorRgbById,
  };
}

describe("HomeShell", () => {
  it("renders the intake workflow state by default", () => {
    renderHomeShell();

    expect(
      screen.getByRole("heading", { name: "Select manual PDF" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Manual processing workflow" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No active PDF")).toBeInTheDocument();
  });

  it("records a selected manual name for the active session", async () => {
    renderHomeShell();

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7"], "small-moc.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    expect(
      await screen.findByText(
        "small-moc.pdf is selected for this browser session.",
      ),
    ).toBeInTheDocument();
  });

  it("persists selected manual metadata without PDF bytes", async () => {
    const projectStore = createMemoryProjectStore();

    renderHomeShell(projectStore);

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7\nsecret-pdf-bytes"], "private-moc.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await screen.findByText(
      "private-moc.pdf is selected for this browser session.",
    );
    await waitFor(() => expect(projectStore.save).toHaveBeenCalledTimes(1));

    const serializedProjectData = JSON.stringify(projectStore.savedProjectData[0]);

    expect(serializedProjectData).toContain("private-moc.pdf");
    expect(serializedProjectData).not.toContain("%PDF-1.7");
    expect(serializedProjectData).not.toContain("secret-pdf-bytes");
    expect(serializedProjectData).not.toContain("byteLength");
  });

  it("rejects PDF-named files without PDF bytes", async () => {
    const projectStore = createMemoryProjectStore();

    renderHomeShell(projectStore);

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["not a pdf"], "fake.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    expect(
      await screen.findByText("Selected file does not look like a valid PDF."),
    ).toBeInTheDocument();
    expect(screen.getByText("No active PDF")).toBeInTheDocument();
    expect(screen.getByLabelText("Manual PDF")).toHaveValue("");
    expect(projectStore.save).not.toHaveBeenCalled();
  });

  it("does not let delayed local data overwrite a selected PDF", async () => {
    let resolveLoad: (projectData: LocalProjectData | null) => void = () => {};
    const savedProjectData: LocalProjectData[] = [];
    const projectStore: LocalProjectStore & {
      savedProjectData: LocalProjectData[];
    } = {
      savedProjectData,
      load: vi.fn(
        () =>
          new Promise<LocalProjectData | null>((resolve) => {
            resolveLoad = resolve;
          }),
      ),
      save: vi.fn(async (nextProjectData) => {
        savedProjectData.push(nextProjectData);
      }),
      clear: vi.fn(async () => undefined),
    };

    renderHomeShell(projectStore);

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7"], "new-session.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await screen.findByText(
      "new-session.pdf is selected for this browser session.",
    );

    resolveLoad(projectDataWithManual("stale-stored.pdf"));

    await waitFor(() => expect(projectStore.save).toHaveBeenCalledTimes(1));

    expect(screen.queryByText("stale-stored.pdf")).not.toBeInTheDocument();
    expect(screen.getAllByText("new-session.pdf")).toHaveLength(2);
    expect(projectStore.savedProjectData[0]?.manual?.fileName).toBe(
      "new-session.pdf",
    );
  });

  it("keeps the active PDF session when local metadata save fails", async () => {
    const projectStore = createMemoryProjectStore();

    vi.mocked(projectStore.save).mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    );

    renderHomeShell(projectStore);

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7"], "session-without-storage.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    expect(
      await screen.findByText(
        "session-without-storage.pdf is selected for this browser session.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Local storage unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("session-without-storage.pdf")).toHaveLength(2);
  });

  it("clears the active PDF session without deleting saved metadata", async () => {
    renderHomeShell();

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7"], "session-only.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await screen.findByText(
      "session-only.pdf is selected for this browser session.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear PDF" }));

    expect(screen.getByText("No active PDF")).toBeInTheDocument();
    expect(screen.getByText("session-only.pdf")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "session-only.pdf is selected for this browser session.",
      ),
    ).not.toBeInTheDocument();
  });

  it("restores local project metadata without restoring a PDF session", async () => {
    const projectData = projectDataWithManual("stored-moc.pdf");

    renderHomeShell(createMemoryProjectStore(projectData));

    expect(await screen.findByText("stored-moc.pdf")).toBeInTheDocument();
    expect(screen.getByText("No active PDF")).toBeInTheDocument();
    expect(screen.getByText("No manual selected.")).toBeInTheDocument();
  });

  it("keeps readiness badges consistent when moving off intake", () => {
    renderHomeShell();

    fireEvent.click(screen.getByRole("button", { name: /Analysis/ }));

    expect(screen.queryByText("Current")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Intake.*Ready/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Analysis.*Blocked/ }),
    ).toBeInTheDocument();
  });

  it("marks analysis ready after a PDF session is active", async () => {
    renderHomeShell();

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7"], "analysis-ready.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await screen.findByText(
      "analysis-ready.pdf is selected for this browser session.",
    );

    fireEvent.click(screen.getByRole("button", { name: /Analysis/ }));

    expect(
      screen.getByText("analysis-ready.pdf is ready for local analysis."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run OCR" })).toBeInTheDocument();
  });

  it("runs local OCR analysis and displays the extracted part list", async () => {
    const extractionResult: PartListExtractionResult = {
      items: [
        {
          id: "part-list-item-1",
          sequence: 1,
          pageNumber: 7,
          quantity: 2,
          partNumber: "2420",
          colorName: "Black",
          description: "Plate 2 x 2 Corner",
          confidence: 91,
          status: "complete",
          rawText: "Qty 2 2420 Black Plate 2 x 2 Corner",
          notes: [],
        },
        {
          id: "part-list-item-2",
          sequence: 2,
          pageNumber: 7,
          quantity: 7,
          partNumber: "2431",
          colorName: "Blue",
          description: "Tile 1 x 4",
          confidence: 88,
          status: "complete",
          rawText: "Qty 7 2431 Blue Tile 1 x 4",
          notes: [],
        },
      ],
      pagesAnalyzed: 8,
      candidatePageNumbers: [7, 8],
      selectedPageNumbers: [7, 8],
      warnings: [],
    };
    const analyzePdfSession = vi.fn<
      (
        pdfSession: PdfSession,
        options?: ExtractPartListOptions,
      ) => Promise<PartListExtractionResult>
    >(async () => extractionResult);
    const fetchCatalogParts = vi.fn(async () =>
      createCatalogFetchResult(
        [
          {
            requestedPartNumber: "2420",
            partNumber: "2420",
            name: "Plate 2 x 2 Corner",
            partImageUrl: null,
            partUrl: null,
            aliases: [],
          },
          {
            requestedPartNumber: "2431",
            partNumber: "2431",
            name: "Tile 1 x 4",
            partImageUrl: null,
            partUrl: null,
            aliases: [],
          },
        ],
        {
          "0": "Black",
          "1": "Blue",
        },
      ),
    );

    renderHomeShell(
      createMemoryProjectStore(),
      analyzePdfSession,
      fetchCatalogParts,
    );

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7"], "analysis.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Rebrickable parts CSV"), {
      target: {
        files: [
          new File(["Part,Color,Quantity\n2420,0,2\n2431,1,7"], "parts.csv", {
            type: "text/csv",
          }),
        ],
      },
    });

    await screen.findByText(
      "analysis.pdf is selected for this browser session.",
    );
    await screen.findByText("parts.csv (2 rows)");
    await screen.findByText("2 CSV rows have Rebrickable catalog details.");

    fireEvent.click(screen.getByRole("button", { name: /Analysis/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run OCR" }));

    expect(
      await screen.findByRole("heading", { name: "Review extracted inventory" }),
    ).toBeInTheDocument();
    expect(analyzePdfSession).toHaveBeenCalledTimes(1);
    expect(analyzePdfSession.mock.calls[0]?.[1]).toMatchObject({
      validationInventory: [
        expect.objectContaining({
          catalogPart: expect.objectContaining({ partNumber: "2420" }),
          colorName: "Black",
          partNumber: "2420",
          quantity: 2,
        }),
        expect.objectContaining({
          catalogPart: expect.objectContaining({ partNumber: "2431" }),
          colorName: "Blue",
          partNumber: "2431",
          quantity: 7,
        }),
      ],
      workerCount: 2,
    });
    expect(analyzePdfSession.mock.calls[0]?.[1]).not.toHaveProperty(
      "partsListPageLimit",
    );
    expect(screen.getByText("2 rows")).toBeInTheDocument();
    expect(screen.getByText("2420")).toBeInTheDocument();
    expect(screen.getByText("Plate 2 x 2 Corner")).toBeInTheDocument();
    expect(screen.getByText("2431")).toBeInTheDocument();
    expect(screen.getByText("Tile 1 x 4")).toBeInTheDocument();
  });

  it("continues with CSV-only validation when catalog lookup fails", async () => {
    const extractionResult: PartListExtractionResult = {
      items: [],
      pagesAnalyzed: 0,
      candidatePageNumbers: [],
      selectedPageNumbers: [],
      warnings: [],
    };
    const analyzePdfSession = vi.fn<
      (
        pdfSession: PdfSession,
        options?: ExtractPartListOptions,
      ) => Promise<PartListExtractionResult>
    >(async () => extractionResult);
    const fetchCatalogParts = vi.fn(async () => {
      throw new Error("Rebrickable catalog request timed out.");
    });

    renderHomeShell(
      createMemoryProjectStore(),
      analyzePdfSession,
      fetchCatalogParts,
    );

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7"], "analysis.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Rebrickable parts CSV"), {
      target: {
        files: [
          new File(["Part,Color,Quantity\n2420,0,2"], "parts.csv", {
            type: "text/csv",
          }),
        ],
      },
    });

    await screen.findByText(
      "Rebrickable catalog details are unavailable; CSV validation will use uploaded rows only.",
    );

    fireEvent.click(screen.getByRole("button", { name: /Analysis/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run OCR" }));

    await screen.findByRole("heading", { name: "Review extracted inventory" });
    expect(analyzePdfSession.mock.calls[0]?.[1]).toMatchObject({
      validationInventory: [
        expect.not.objectContaining({
          catalogPart: expect.anything(),
        }),
      ],
    });
  });

  it.each([
    ["Analysis", "Analyze manual locally", "Waiting for an active PDF session."],
    [
      "Inventory",
      "Review extracted inventory",
      "Waiting for classified parts-list pages.",
    ],
    [
      "Catalog",
      "Match Rebrickable catalog data",
      "Waiting for reviewed inventory rows.",
    ],
    [
      "CSV check",
      "Compare optional Rebrickable CSV",
      "Waiting for catalog-normalized inventory.",
    ],
    [
      "Steps",
      "Review build-step callouts",
      "Waiting for detected instruction pages.",
    ],
    [
      "Generate",
      "Generate build bags",
      "Waiting for reconciled step callouts.",
    ],
    ["Bag review", "Review bag split", "Waiting for generated bag boundaries."],
    ["Export", "Export bag lists", "Waiting for reviewed bag lists."],
  ])("can display the %s workflow panel", (buttonName, heading, blockedText) => {
    renderHomeShell();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(buttonName) }));

    expect(
      screen.getByRole("heading", { name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(blockedText)).toBeInTheDocument();
  });
});
