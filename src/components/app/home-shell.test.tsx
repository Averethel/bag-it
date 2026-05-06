import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
    colorIdsByName: Object.fromEntries(
      Object.entries(colorNamesById).map(([colorId, colorName]) => [
        colorName.toLowerCase(),
        colorId,
      ]),
    ),
    colorNamesById,
    colorRgbById,
    elementIdsByPartColor: {},
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe("HomeShell", () => {
  it("renders an upload-first shell without manual workflow navigation", () => {
    renderHomeShell();

    expect(
      screen.getByRole("heading", { name: "Build MOCs like boxed LEGO sets." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Bag It turns a MOC instruction manual into an ordered parts-bag workflow/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Upload the PDF and optional Rebrickable CSV, then split the build into bags/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("project-hero")).toHaveAttribute(
      "data-state",
      "expanded",
    );
    expect(screen.getByTestId("project-hero")).not.toHaveAttribute(
      "aria-hidden",
    );
    expect(
      screen.queryByRole("navigation", { name: "Manual processing workflow" }),
    ).not.toBeInTheDocument();
    const uploadPane = screen.getByRole("region", { name: "Upload files" });

    expect(
      within(uploadPane).getByTestId("manual-upload-dropzone"),
    ).toBeInTheDocument();
    expect(within(uploadPane).getByTestId("csv-upload-dropzone")).toBeInTheDocument();
    expect(within(uploadPane).getByTestId("manual-upload-card")).toBeInTheDocument();
    expect(within(uploadPane).getByTestId("csv-upload-card")).toBeInTheDocument();
    expect(within(uploadPane).getByTestId("manual-clear-slot")).toBeInTheDocument();
    expect(within(uploadPane).getByTestId("csv-clear-slot")).toBeInTheDocument();
    expect(screen.getByText("No manual selected")).toBeInTheDocument();
    expect(screen.getByText("No CSV loaded")).toBeInTheDocument();
    expect(within(uploadPane).getByRole("button", { name: "Bag it" })).toBeDisabled();
    expect(
      screen.queryByRole("region", { name: "Analysis controls" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Analysis" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Local project data")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Manual bytes, rendered pages, page crops/),
    ).not.toBeInTheDocument();
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

    expect(await screen.findByText("small-moc.pdf")).toBeInTheDocument();
    expect(screen.getByText("8 B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bag it" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove manual PDF" })).toHaveTextContent(
      "X",
    );
    expect(
      within(screen.getByTestId("manual-clear-slot")).getByRole("button", {
        name: "Remove manual PDF",
      }),
    ).toBeVisible();
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

    await screen.findByText("private-moc.pdf");
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
    expect(screen.getByText("No manual selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Manual PDF")).toHaveValue("");
    expect(projectStore.save).not.toHaveBeenCalled();
  });

  it("supports drag and drop for the manual PDF and optional CSV", async () => {
    const fetchCatalogParts = vi.fn(async () =>
      createCatalogFetchResult(
        [
          {
            requestedPartNumber: "2420",
            partNumber: "2420",
            name: "Plate 2 x 2 Corner",
            partImageUrl: "/api/catalog/part-image?partNumber=2420",
            partUrl: null,
            aliases: [],
          },
        ],
        {
          "0": "Black",
        },
        {
          "0": "05131D",
        },
      ),
    );

    renderHomeShell(createMemoryProjectStore(), undefined, fetchCatalogParts);

    fireEvent.drop(screen.getByTestId("manual-upload-dropzone"), {
      dataTransfer: {
        files: [
          new File(["%PDF-1.7"], "dragged-manual.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.drop(screen.getByTestId("csv-upload-dropzone"), {
      dataTransfer: {
        files: [
          new File(["Part,Color,Quantity\n2420,0,2"], "dragged-parts.csv", {
            type: "text/csv",
          }),
        ],
      },
    });

    expect(await screen.findByText("dragged-manual.pdf")).toBeInTheDocument();
    expect(await screen.findByText("dragged-parts.csv")).toBeInTheDocument();
    expect(screen.getByText("1 row")).toBeInTheDocument();
    await waitFor(() => expect(fetchCatalogParts).toHaveBeenCalledWith(["2420"]));
    expect(
      screen.queryByText(/CSV row has Rebrickable catalog details/),
    ).not.toBeInTheDocument();
  });

  it("hides generated catalog cache fallback warnings from the upload summary", async () => {
    const fetchCatalogParts = vi.fn(async () => ({
      ...createCatalogFetchResult(),
      warnings: [
        "Live catalog request failed with HTTP 403; using generated catalog cache.",
      ],
    }));

    renderHomeShell(createMemoryProjectStore(), undefined, fetchCatalogParts);

    fireEvent.change(screen.getByLabelText("Rebrickable parts CSV"), {
      target: {
        files: [
          new File(["Part,Color,Quantity\n2420,0,2"], "parts.csv", {
            type: "text/csv",
          }),
        ],
      },
    });

    expect(await screen.findByText("parts.csv")).toBeInTheDocument();
    expect(await screen.findByText("1 row")).toBeInTheDocument();
    await waitFor(() => expect(fetchCatalogParts).toHaveBeenCalledWith(["2420"]));
    expect(
      screen.queryByText(/Live catalog request failed with HTTP 403/),
    ).not.toBeInTheDocument();
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

    await screen.findByText("new-session.pdf");

    resolveLoad(projectDataWithManual("stale-stored.pdf"));

    await waitFor(() => expect(projectStore.save).toHaveBeenCalledTimes(1));

    expect(screen.queryByText("stale-stored.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("new-session.pdf")).toBeInTheDocument();
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
      await screen.findByText("session-without-storage.pdf"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bag it" })).toBeEnabled();
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

    await screen.findByText("session-only.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Remove manual PDF" }));

    expect(screen.getByText("No manual selected")).toBeInTheDocument();
    expect(screen.queryByText("session-only.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Previous manual")).not.toBeInTheDocument();
  });

  it("does not show restored local project metadata as an active manual", async () => {
    const projectData = projectDataWithManual("stored-moc.pdf");
    const projectStore = createMemoryProjectStore(projectData);

    renderHomeShell(projectStore);

    await waitFor(() => expect(projectStore.load).toHaveBeenCalledTimes(1));
    expect(screen.getByText("No manual selected")).toBeInTheDocument();
    expect(screen.queryByText("stored-moc.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Previous manual")).not.toBeInTheDocument();
  });

  it("runs local OCR analysis from the Bag it CTA and displays the inventory tab", async () => {
    const extractionDeferred = createDeferred<PartListExtractionResult>();
    const extractionResult: PartListExtractionResult = {
      items: [
        {
          id: "part-list-item-1",
          sequence: 1,
          pageNumber: 7,
          quantity: 2,
          partNumber: "2420",
          colorName: "Black",
          colorRgb: "05131D",
          rebrickableColorId: "0",
          catalogPart: {
            requestedPartNumber: "2420",
            partNumber: "2420",
            name: "Plate 2 x 2 Corner",
            partImageUrl: "https://img.example.test/stale-2420-placeholder.png",
            partUrl: null,
            aliases: [],
          },
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
          colorRgb: "0055BF",
          rebrickableColorId: "1",
          catalogPart: {
            requestedPartNumber: "2431",
            partNumber: "2431",
            name: "Tile 1 x 4",
            partImageUrl: "/api/catalog/part-image?partNumber=2431",
            partUrl: null,
            aliases: [],
          },
          description: "Tile 1 x 4",
          confidence: 88,
          status: "complete",
          rawText: "Qty 7 2431 Blue Tile 1 x 4",
          notes: [],
        },
        {
          id: "part-list-item-3",
          sequence: 3,
          pageNumber: 8,
          quantity: null,
          partNumber: null,
          colorName: null,
          description: null,
          confidence: 62,
          status: "needs-review",
          rawText: "Qty 4 3020 Black Plate 2 x 4",
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
    >(async (_pdfSession, options) => {
      options?.onProgress?.({
        phase: "extracting-parts",
        pageNumber: null,
        pageCount: 8,
        progress: 0.35,
        message: "Reading part rows",
      });

      return extractionDeferred.promise;
    });
    const fetchCatalogParts = vi.fn(async () =>
      createCatalogFetchResult(
        [
          {
            requestedPartNumber: "2420",
            partNumber: "2420",
            name: "Plate 2 x 2 Corner",
            partImageUrl: "/api/catalog/part-image?partNumber=2420",
            partUrl: null,
            aliases: [],
          },
          {
            requestedPartNumber: "2431",
            partNumber: "2431",
            name: "Tile 1 x 4",
            partImageUrl: "/api/catalog/part-image?partNumber=2431",
            partUrl: null,
            aliases: [],
          },
        ],
        {
          "0": "Black",
          "1": "Blue",
        },
        {
          "0": "05131D",
          "1": "0055BF",
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
          new File(
            ["Part,Color,Quantity\n2420,0,2\n2431,1,7\n2420,0,1"],
            "parts.csv",
            {
              type: "text/csv",
            },
          ),
        ],
      },
    });

    await screen.findByText("analysis.pdf");
    await screen.findByText("3 rows");
    await waitFor(() =>
      expect(fetchCatalogParts).toHaveBeenCalledWith(["2420", "2431"]),
    );
    expect(
      screen.queryByText(/CSV rows have Rebrickable catalog details/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bag it" }));

    expect(screen.getByTestId("project-hero")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
    expect(screen.getByTestId("project-hero")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(await screen.findByText("Gathering inventory")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Analysis progress" }),
    ).toBeInTheDocument();

    extractionDeferred.resolve(extractionResult);

    expect(await screen.findByRole("tab", { name: "Inventory" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Bag it" })).toBeDisabled();
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
        expect.objectContaining({
          catalogPart: expect.objectContaining({ partNumber: "2420" }),
          colorName: "Black",
          partNumber: "2420",
          quantity: 1,
        }),
      ],
    });
    expect(analyzePdfSession.mock.calls[0]?.[1]).not.toHaveProperty(
      "workerCount",
    );
    expect(analyzePdfSession.mock.calls[0]?.[1]).not.toHaveProperty(
      "partsListPageLimit",
    );

    const inventoryTable = screen.getByRole("table", { name: "Inventory" });

    expect(
      within(inventoryTable)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Quantity", "Image", "Part number", "Colour", "Part name"]);
    expect(within(inventoryTable).getByText("2")).toBeInTheDocument();
    expect(within(inventoryTable).getByText("2420")).toBeInTheDocument();
    expect(within(inventoryTable).getAllByText("Black").length).toBeGreaterThan(0);
    expect(within(inventoryTable).getByText("4")).toBeInTheDocument();
    expect(within(inventoryTable).getByText("3020")).toBeInTheDocument();
    expect(within(inventoryTable).getByText("Plate 2 x 4")).toBeInTheDocument();
    expect(
      within(inventoryTable).getByRole("img", {
        name: "Plate 2 x 2 Corner",
      }),
    ).toHaveAttribute(
      "src",
      "/api/catalog/part-image?partNumber=2420&source=rebrickable-cache-v1&colorId=0",
    );
    expect(
      within(inventoryTable).getByRole("img", {
        name: "Plate 2 x 4",
      }),
    ).toHaveAttribute(
      "src",
      "/api/catalog/part-image?partNumber=3020&source=rebrickable-cache-v1&colorId=0",
    );
    expect(screen.queryByText("Page")).not.toBeInTheDocument();
    expect(screen.queryByText("Confidence")).not.toBeInTheDocument();
    expect(screen.queryByText("OCR row")).not.toBeInTheDocument();
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("does not render unvalidated OCR noise rows in the inventory table", async () => {
    const extractionResult: PartListExtractionResult = {
      items: [
        {
          id: "part-list-item-1",
          sequence: 1,
          pageNumber: 7,
          quantity: 4,
          partNumber: "3024",
          colorName: "White",
          rebrickableColorId: "15",
          catalogPart: {
            requestedPartNumber: "3024",
            partNumber: "3024",
            name: "Plate 1 x 1",
            partImageUrl: null,
            partUrl: null,
            aliases: [],
          },
          description: "Plate 1 x 1",
          confidence: 90,
          status: "complete",
          rawText: "4 3024 White Plate 1 x 1",
          notes: [],
        },
        {
          id: "part-list-item-2",
          sequence: 2,
          pageNumber: 7,
          quantity: 1,
          partNumber: "1141",
          colorName: null,
          description: "ax",
          confidence: 45,
          status: "needs-review",
          rawText: "1 ax 1141",
          notes: ["No matching row was found in the uploaded CSV."],
          validationStatus: "csv-no-match",
        },
      ],
      pagesAnalyzed: 7,
      candidatePageNumbers: [7],
      selectedPageNumbers: [7],
      warnings: [],
    };
    const analyzePdfSession = vi.fn<
      (
        pdfSession: PdfSession,
        options?: ExtractPartListOptions,
      ) => Promise<PartListExtractionResult>
    >(async () => extractionResult);

    renderHomeShell(createMemoryProjectStore(), analyzePdfSession);

    fireEvent.change(screen.getByLabelText("Manual PDF"), {
      target: {
        files: [
          new File(["%PDF-1.7"], "analysis.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await screen.findByText("analysis.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Bag it" }));

    const inventoryTable = await screen.findByRole("table", { name: "Inventory" });

    expect(within(inventoryTable).getByText("3024")).toBeInTheDocument();
    expect(within(inventoryTable).queryByText("1141")).not.toBeInTheDocument();
    expect(within(inventoryTable).queryByText("ax")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Bag it" }));

    await screen.findByRole("tab", { name: "Inventory" });
    expect(analyzePdfSession.mock.calls[0]?.[1]).toMatchObject({
      validationInventory: [
        expect.not.objectContaining({
          catalogPart: expect.anything(),
        }),
      ],
    });
  });

  it("ignores stale CSV reads when a newer CSV is selected first", async () => {
    const staleCsv = createDeferred<string>();
    const freshCsv = createDeferred<string>();
    const fetchCatalogParts = vi.fn(async () => createCatalogFetchResult());

    renderHomeShell(
      createMemoryProjectStore(),
      undefined,
      fetchCatalogParts,
    );

    fireEvent.change(screen.getByLabelText("Rebrickable parts CSV"), {
      target: {
        files: [
          {
            name: "stale.csv",
            text: () => staleCsv.promise,
          } as unknown as File,
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Rebrickable parts CSV"), {
      target: {
        files: [
          {
            name: "fresh.csv",
            text: () => freshCsv.promise,
          } as unknown as File,
        ],
      },
    });

    freshCsv.resolve("Part,Color,Quantity\n2431,1,7");

    await screen.findByText("fresh.csv");
    await screen.findByText("1 row");

    staleCsv.resolve("Part,Color,Quantity\n2420,0,2");

    await waitFor(() => {
      expect(screen.queryByText("stale.csv")).not.toBeInTheDocument();
      expect(fetchCatalogParts).toHaveBeenCalledTimes(1);
      expect(fetchCatalogParts).toHaveBeenCalledWith(["2431"]);
    });
  });
});
