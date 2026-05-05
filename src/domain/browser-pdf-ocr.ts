import type { PdfSession } from "@/domain/pdf-session";

import type { RebrickableCatalogFetchResult } from "./rebrickable-catalog";
import {
  extractPartListFromOcrPages,
  summarizePartsListPage,
  type OcrPartCardText,
  type OcrPageText,
  type OcrTextBox,
  type OcrTextLine,
  type OcrTextWord,
  type PartListExtractionResult,
} from "./part-list-extraction";
import type { RebrickableInventoryItem } from "./rebrickable-csv";
import {
  attachCatalogImageDescriptorsToInventory,
  createVisualPartDescriptorFromImageData,
  type VisualPartDescriptor,
} from "./visual-part-matching";

export type PdfOcrProgress = {
  phase:
    | "loading-pdf"
    | "loading-ocr"
    | "rendering-page"
    | "ocr-page"
    | "extracting-parts"
    | "complete";
  pageNumber: number | null;
  pageCount: number | null;
  progress: number | null;
  message: string;
};

export type ExtractPartListOptions = {
  fetchCatalogParts?: (
    partNumbers: string[],
  ) => Promise<RebrickableCatalogFetchResult>;
  validationInventory?: RebrickableInventoryItem[];
  onProgress?: (progress: PdfOcrProgress) => void;
  renderScale?: number;
  workerCount?: number;
};

type PdfJsModule = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (options: {
    data: Uint8Array;
    disableFontFace?: boolean;
    isEvalSupported?: boolean;
  }) => {
    promise: Promise<PdfDocumentProxy>;
  };
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
};

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => {
    promise: Promise<void>;
  };
};

type PdfViewport = {
  width: number;
  height: number;
};

type TesseractModule = {
  createWorker: (
    langs?: string,
    oem?: number,
    options?: {
      logger?: (message: TesseractLoggerMessage) => void;
    },
  ) => Promise<TesseractWorker>;
  PSM: {
    AUTO: string;
    SPARSE_TEXT: string;
  };
};

type TesseractWorker = {
  setParameters: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<TesseractRecognizeResult>;
  terminate: () => Promise<unknown>;
};

type TesseractLoggerMessage = {
  status?: string;
  progress?: number;
};

type TesseractRecognizeResult = {
  data: TesseractPageData;
};

type TesseractPageData = {
  text?: string;
  confidence?: number;
  blocks?: TesseractBlock[] | null;
};

type TesseractBlock = {
  paragraphs?: TesseractParagraph[] | null;
};

type TesseractParagraph = {
  lines?: TesseractLine[] | null;
};

type TesseractLine = {
  words?: TesseractWord[] | null;
  text?: string;
  confidence?: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

type TesseractWord = {
  text?: string;
  confidence?: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

type OcrCardRegion = {
  bbox: OcrTextBox;
  visualColorRgb: string | null;
  visualDescriptor: VisualPartDescriptor | null;
};

export async function extractPartListFromPdfSession(
  pdfSession: PdfSession,
  options: ExtractPartListOptions = {},
): Promise<PartListExtractionResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF OCR can only run in the browser.");
  }

  options.onProgress?.({
    phase: "loading-pdf",
    pageNumber: null,
    pageCount: null,
    progress: null,
    message: "Loading PDF",
  });

  const pdfjs = (await import("pdfjs-dist/build/pdf.mjs")) as PdfJsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  let pdfDocument: PdfDocumentProxy | null = null;
  let workerEntries: OcrWorkerEntry[] = [];

  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfSession.bytes),
      disableFontFace: true,
      isEvalSupported: false,
    });
    pdfDocument = await loadingTask.promise;
    const activePdfDocument = pdfDocument;
    const pageCount = activePdfDocument.numPages;

    options.onProgress?.({
      phase: "loading-ocr",
      pageNumber: null,
      pageCount,
      progress: null,
      message: "Loading OCR workers",
    });

    const tesseract = (await import("tesseract.js")) as TesseractModule;
    const workerCount = Math.min(
      Math.max(1, options.workerCount ?? defaultWorkerCount),
      pageCount,
    );
    workerEntries = await Promise.all(
      Array.from({ length: workerCount }, async () =>
        createOcrWorker(tesseract, pageCount, options.onProgress),
      ),
    );

    await Promise.all(
      workerEntries.flatMap((workerEntry) => [
        workerEntry.worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
          user_defined_dpi: "240",
        }),
        workerEntry.quantityWorker.setParameters(workerEntry.quantityPageParameters),
      ]),
    );

    const discoveryResult = await discoverPartsListPages({
      pdfDocument: activePdfDocument,
      pageCount,
      renderScale: options.renderScale ?? defaultRenderScale,
      workerEntries,
      onProgress: options.onProgress,
    });

    options.onProgress?.({
      phase: "extracting-parts",
      pageNumber: null,
      pageCount,
      progress: null,
      message: "Reading part rows",
    });

    const extractionOptions =
      options.validationInventory !== undefined
        ? { validationInventory: options.validationInventory }
        : undefined;
    const initialExtractionResult = extractPartListFromOcrPages(
      discoveryResult.pages,
      extractionOptions,
    );
    const candidateCatalogParts = await fetchUnmatchedOcrCatalogParts(
      initialExtractionResult,
      options,
    );
    const descriptorEnrichedInventory = await enrichRelevantCatalogImageDescriptors(
      initialExtractionResult,
      options,
    );
    const extractionResult =
      candidateCatalogParts.length > 0 || descriptorEnrichedInventory !== null
        ? extractPartListFromOcrPages(discoveryResult.pages, {
            candidateCatalogParts,
            ...(descriptorEnrichedInventory !== null
              ? { validationInventory: descriptorEnrichedInventory }
              : options.validationInventory !== undefined
                ? { validationInventory: options.validationInventory }
              : {}),
          })
        : initialExtractionResult;

    options.onProgress?.({
      phase: "complete",
      pageNumber: null,
      pageCount,
      progress: 1,
      message: "Part list extracted",
    });

    return {
      ...extractionResult,
      warnings: [...extractionResult.warnings, ...discoveryResult.warnings],
    };
  } finally {
    await Promise.all(
      workerEntries.flatMap((workerEntry) => [
        workerEntry.worker.terminate(),
        workerEntry.quantityWorker.terminate(),
      ]),
    );
    await pdfDocument?.destroy();
  }
}

async function fetchUnmatchedOcrCatalogParts(
  extractionResult: PartListExtractionResult,
  options: ExtractPartListOptions,
) {
  if (!options.fetchCatalogParts || !options.validationInventory?.length) {
    return [];
  }

  const unmatchedPartNumbers = [
    ...new Set(
      extractionResult.items
        .filter((item) => item.validationStatus === "csv-no-match")
        .map((item) => item.ocrPartNumber ?? item.partNumber)
        .filter((partNumber): partNumber is string => Boolean(partNumber)),
    ),
  ];

  if (unmatchedPartNumbers.length === 0) {
    return [];
  }

  options.onProgress?.({
    phase: "extracting-parts",
    pageNumber: null,
    pageCount: null,
    progress: null,
    message: "Checking unmatched OCR part numbers",
  });

  const catalogResult = await options.fetchCatalogParts(unmatchedPartNumbers);

  return catalogResult.parts;
}

async function enrichRelevantCatalogImageDescriptors(
  extractionResult: PartListExtractionResult,
  options: ExtractPartListOptions,
) {
  if (!options.validationInventory?.length) {
    return null;
  }

  const hasVisualDescriptors = extractionResult.items.some(
    (item) => item.visualDescriptor,
  );

  if (!hasVisualDescriptors) {
    return null;
  }

  const candidatePartNumbers = collectVisualDescriptorCandidatePartNumbers(
    extractionResult,
  );

  if (candidatePartNumbers.normalized.size === 0) {
    return null;
  }

  const targetRows = options.validationInventory.filter((inventoryItem) =>
    shouldAttachCatalogImageDescriptor(inventoryItem, candidatePartNumbers),
  );

  if (targetRows.length === 0) {
    return null;
  }

  options.onProgress?.({
    phase: "extracting-parts",
    pageNumber: null,
    pageCount: null,
    progress: null,
    message: "Comparing part thumbnails",
  });

  const targetRowIds = new Set(targetRows.map((inventoryItem) => inventoryItem.id));

  return attachCatalogImageDescriptorsToInventory(options.validationInventory, {
    shouldAttach: (inventoryItem) => targetRowIds.has(inventoryItem.id),
  });
}

function collectVisualDescriptorCandidatePartNumbers(
  extractionResult: PartListExtractionResult,
) {
  const normalized = new Set<string>();
  const bases = new Set<string>();

  extractionResult.items.forEach((item) => {
    if (!item.visualDescriptor) {
      return;
    }

    [item.ocrPartNumber, item.partNumber].forEach((partNumber) => {
      const normalizedPartNumber = normalizeCandidatePartNumber(partNumber);

      if (!normalizedPartNumber) {
        return;
      }

      normalized.add(normalizedPartNumber);

      const base = extractCandidatePartNumberBase(normalizedPartNumber);

      if (base) {
        bases.add(base);
      }
    });
  });

  return { bases, normalized };
}

function shouldAttachCatalogImageDescriptor(
  inventoryItem: RebrickableInventoryItem,
  candidatePartNumbers: { bases: Set<string>; normalized: Set<string> },
) {
  if (!inventoryItem.catalogPart?.partImageUrl) {
    return false;
  }

  return collectInventoryCandidatePartNumbers(inventoryItem).some((partNumber) => {
    const normalizedPartNumber = normalizeCandidatePartNumber(partNumber);

    if (!normalizedPartNumber) {
      return false;
    }

    const base = extractCandidatePartNumberBase(normalizedPartNumber);

    return (
      candidatePartNumbers.normalized.has(normalizedPartNumber) ||
      (base !== null && candidatePartNumbers.bases.has(base))
    );
  });
}

function collectInventoryCandidatePartNumbers(inventoryItem: RebrickableInventoryItem) {
  return [
    inventoryItem.partNumber,
    inventoryItem.catalogPart?.partNumber,
    inventoryItem.catalogPart?.requestedPartNumber,
    ...(inventoryItem.catalogPart?.aliases.map((alias) => alias.partNumber) ?? []),
  ];
}

function normalizeCandidatePartNumber(partNumber: string | null | undefined) {
  return partNumber?.trim().toLowerCase() ?? "";
}

function extractCandidatePartNumberBase(partNumber: string) {
  return partNumber.match(/^\d+/)?.[0] ?? null;
}

const defaultRenderScale = 3;
const defaultWorkerCount = 2;
const maxAutoPartsListScanPages = 64;
const partsListBoundaryNonPartPages = 2;
const minimumVisualCardCount = 4;

type OcrWorkerEntry = {
  quantityPageParameters: Record<string, string>;
  quantityWorker: TesseractWorker;
  worker: TesseractWorker;
  setCurrentPage: (pageNumber: number | null) => void;
};

async function createOcrWorker(
  tesseract: TesseractModule,
  pageCount: number,
  onProgress: ExtractPartListOptions["onProgress"],
): Promise<OcrWorkerEntry> {
  let currentOcrPage: number | null = null;
  const worker = await tesseract.createWorker("eng", 1, {
    logger(message) {
      if (currentOcrPage === null) {
        return;
      }

      onProgress?.({
        phase: "ocr-page",
        pageNumber: currentOcrPage,
        pageCount,
        progress: typeof message.progress === "number" ? message.progress : null,
        message: message.status ?? "Running OCR",
      });
    },
  });
  const quantityWorker = await tesseract.createWorker("eng", 1);
  const quantityPageParameters = {
    classify_bln_numeric_mode: "1",
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "0123456789xX×",
    tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
    user_defined_dpi: "240",
  };

  return {
    quantityPageParameters,
    quantityWorker,
    worker,
    setCurrentPage(pageNumber) {
      currentOcrPage = pageNumber;
    },
  };
}

type AnalyzePagesWithWorkerOptions = {
  pageNumbers: number[];
  pdfDocument: PdfDocumentProxy;
  pageCount: number;
  renderScale: number;
  workerEntry: OcrWorkerEntry;
  onProgress: ExtractPartListOptions["onProgress"];
};

type DiscoverPartsListPagesOptions = {
  pdfDocument: PdfDocumentProxy;
  pageCount: number;
  renderScale: number;
  workerEntries: OcrWorkerEntry[];
  onProgress: ExtractPartListOptions["onProgress"];
};

type PartListPageDiscoveryResult = {
  pages: OcrPageText[];
  warnings: string[];
};

async function discoverPartsListPages({
  pdfDocument,
  pageCount,
  renderScale,
  workerEntries,
  onProgress,
}: DiscoverPartsListPagesOptions): Promise<PartListPageDiscoveryResult> {
  const pages: OcrPageText[] = [];
  const warnings: string[] = [];
  let nextPageNumber = pageCount;
  let scannedPageCount = 0;
  let hasFoundPartsList = false;
  let nonPartPagesBeforePartsList = 0;

  while (
    nextPageNumber >= 1 &&
    scannedPageCount < maxAutoPartsListScanPages
  ) {
    const batchPageNumbers: number[] = [];

    while (
      nextPageNumber >= 1 &&
      batchPageNumbers.length < workerEntries.length &&
      scannedPageCount + batchPageNumbers.length < maxAutoPartsListScanPages
    ) {
      batchPageNumbers.push(nextPageNumber);
      nextPageNumber -= 1;
    }

    const batchPages = (
      await analyzePageBatch({
        pageNumbers: batchPageNumbers,
        pdfDocument,
        pageCount,
        renderScale,
        workerEntries,
        onProgress,
      })
    ).sort((left, right) => right.pageNumber - left.pageNumber);

    for (const page of batchPages) {
      const summary = summarizePartsListPage(page);

      pages.push(page);
      scannedPageCount += 1;

      if (summary.isLikelyPartsListPage) {
        hasFoundPartsList = true;
        nonPartPagesBeforePartsList = 0;
      } else if (hasFoundPartsList) {
        nonPartPagesBeforePartsList += 1;
      }

      if (
        hasFoundPartsList &&
        nonPartPagesBeforePartsList >= partsListBoundaryNonPartPages
      ) {
        return {
          pages: pages.sort((left, right) => left.pageNumber - right.pageNumber),
          warnings,
        };
      }
    }
  }

  if (!hasFoundPartsList) {
    warnings.push(
      "Automatic parts-list detection did not find a dense inventory section.",
    );
  } else if (nextPageNumber >= 1) {
    warnings.push(
      `Automatic parts-list detection stopped after ${scannedPageCount} pages.`,
    );
  }

  return {
    pages: pages.sort((left, right) => left.pageNumber - right.pageNumber),
    warnings,
  };
}

type AnalyzePageBatchOptions = {
  pageNumbers: number[];
  pdfDocument: PdfDocumentProxy;
  pageCount: number;
  renderScale: number;
  workerEntries: OcrWorkerEntry[];
  onProgress: ExtractPartListOptions["onProgress"];
};

async function analyzePageBatch({
  pageNumbers,
  pdfDocument,
  pageCount,
  renderScale,
  workerEntries,
  onProgress,
}: AnalyzePageBatchOptions) {
  if (pageNumbers.length === 0) {
    return [];
  }

  const activeWorkerEntries = workerEntries.slice(0, pageNumbers.length);

  return (
    await Promise.all(
      activeWorkerEntries.map((workerEntry, workerIndex) =>
        analyzePagesWithWorker({
          pageNumbers: pageNumbers.filter(
            (_, pageIndex) => pageIndex % activeWorkerEntries.length === workerIndex,
          ),
          pdfDocument,
          pageCount,
          renderScale,
          workerEntry,
          onProgress,
        }),
      ),
    )
  ).flat();
}

async function analyzePagesWithWorker({
  pageNumbers,
  pdfDocument,
  pageCount,
  renderScale,
  workerEntry,
  onProgress,
}: AnalyzePagesWithWorkerOptions) {
  const pages: OcrPageText[] = [];

  for (const pageNumber of pageNumbers) {
    onProgress?.({
      phase: "rendering-page",
      pageNumber,
      pageCount,
      progress: null,
      message: `Scanning page ${pageNumber} of ${pageCount} for parts-list rows`,
    });

    const page = await pdfDocument.getPage(pageNumber);
    const canvas = await renderPageToCanvas(page, renderScale);

    workerEntry.setCurrentPage(pageNumber);
    await workerEntry.quantityWorker.setParameters(
      workerEntry.quantityPageParameters,
    );

    const [result, quantityResult] = await Promise.all([
      workerEntry.worker.recognize(canvas, undefined, {
        blocks: true,
        text: true,
      }),
      workerEntry.quantityWorker.recognize(canvas, undefined, {
        blocks: true,
        text: true,
      }),
    ]);
    const lines = extractRecognizedLines(result.data, pageNumber);
    const recognizedWords = await appendTargetedQuantityWords({
      canvas,
      pageNumber,
      quantityWorker: workerEntry.quantityWorker,
      words: mergeQuantityCandidateWords(
        extractRecognizedWords(result.data, pageNumber),
        extractQuantityCandidateWords(quantityResult.data, pageNumber),
      ),
    });
    const words = attachVisualColorSamplesToWords(canvas, recognizedWords);
    const visualCardRegions = detectVisualCardRegions(canvas);

    pages.push({
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      cards: buildCardsFromRegions(pageNumber, visualCardRegions, lines, words),
      lines,
      words,
    });

    workerEntry.setCurrentPage(null);
    canvas.width = 0;
    canvas.height = 0;
  }

  return pages;
}

async function renderPageToCanvas(page: PdfPageProxy, scale: number) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Could not create a canvas for PDF OCR.");
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const renderTask = page.render({
    canvasContext: context,
    viewport,
  });

  await renderTask.promise;

  return canvas;
}

function detectVisualCardRegions(canvas: HTMLCanvasElement): OcrCardRegion[] {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return [];
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rowInkCounts = new Uint32Array(canvas.height);
  const columnInkCounts = new Uint32Array(canvas.width);
  const data = imageData.data;

  for (let y = 0; y < canvas.height; y += 1) {
    const rowOffset = y * canvas.width * 4;

    for (let x = 0; x < canvas.width; x += 1) {
      const offset = rowOffset + x * 4;
      const red = data[offset] ?? 255;
      const green = data[offset + 1] ?? 255;
      const blue = data[offset + 2] ?? 255;
      const alpha = data[offset + 3] ?? 255;

      if (alpha > 16 && isInkPixel(red, green, blue)) {
        rowInkCounts[y] = (rowInkCounts[y] ?? 0) + 1;
        columnInkCounts[x] = (columnInkCounts[x] ?? 0) + 1;
      }
    }
  }

  const contentBounds = findContentBounds(rowInkCounts, columnInkCounts);

  if (!contentBounds) {
    return [];
  }

  const rowBands = findProjectionBands(
    rowInkCounts,
    canvas.width,
    contentBounds.y0,
    contentBounds.y1,
    {
      activeRatio: 0.006,
      maxMergeGap: Math.max(24, Math.round(canvas.height * 0.018)),
      minSize: Math.max(40, Math.round(canvas.height * 0.025)),
    },
  );
  const columnBands = findProjectionBands(
    columnInkCounts,
    canvas.height,
    contentBounds.x0,
    contentBounds.x1,
    {
      activeRatio: 0.006,
      maxMergeGap: Math.max(24, Math.round(canvas.width * 0.02)),
      minSize: Math.max(40, Math.round(canvas.width * 0.035)),
    },
  );

  const regions = rowBands.flatMap((rowBand) =>
    columnBands.flatMap((columnBand): OcrCardRegion[] => {
      const bbox = expandBox(
        {
          x0: columnBand.start,
          y0: rowBand.start,
          x1: columnBand.end,
          y1: rowBand.end,
        },
        Math.max(6, Math.round(canvas.width * 0.004)),
        canvas.width,
        canvas.height,
      );

      return hasEnoughInk(rowInkCounts, columnInkCounts, bbox)
        ? [
            {
              bbox,
              visualColorRgb: sampleDominantCardColor(imageData, canvas.width, bbox),
              visualDescriptor: createVisualPartDescriptorFromImageData(
                imageData,
                bbox,
              ),
            },
          ]
        : [];
    }),
  );

  if (regions.length < minimumVisualCardCount) {
    return [];
  }

  return regions.sort((left, right) => {
    if (Math.abs(left.bbox.y0 - right.bbox.y0) > 12) {
      return left.bbox.y0 - right.bbox.y0;
    }

    return left.bbox.x0 - right.bbox.x0;
  });
}

function buildCardsFromRegions(
  pageNumber: number,
  cardRegions: OcrCardRegion[],
  lines: OcrTextLine[],
  words: OcrTextWord[],
): OcrPartCardText[] {
  return cardRegions
    .map((region) => {
      const regionWords = words.filter((word) =>
        pointInBox(centerX(word), centerY(word), region.bbox),
      );
      const regionLines = lines.filter((line) => {
        if (!line.bbox) {
          return false;
        }

        return pointInBox(
          (line.bbox.x0 + line.bbox.x1) / 2,
          (line.bbox.y0 + line.bbox.y1) / 2,
          region.bbox,
        );
      });

      return {
        pageNumber,
        bbox: region.bbox,
        visualColorRgb: region.visualColorRgb,
        visualDescriptor: region.visualDescriptor,
        lines: regionLines,
        words: regionWords,
      };
    })
    .filter((card) => card.words.length > 0 || card.lines.length > 0);
}

type ProjectionBand = {
  start: number;
  end: number;
};

function isInkPixel(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;

  return luminance < 246 || max - min > 28;
}

function sampleDominantCardColor(
  imageData: ImageData,
  canvasWidth: number,
  bbox: OcrTextBox,
) {
  return sampleDominantColorInBox(imageData, canvasWidth, bbox, {
    allowDarkFallback: true,
    sampleStep: 2,
  });
}

function samplePartThumbnailVisual(
  imageData: ImageData,
  canvasWidth: number,
  canvasHeight: number,
  cellBox: OcrTextBox,
  partNumberWord: OcrTextWord,
) {
  const searchBox = createPartThumbnailSearchBox(
    cellBox,
    partNumberWord,
    canvasWidth,
    canvasHeight,
  );

  if (!searchBox) {
    return {
      visualColorRgb: null,
      visualDescriptor: null,
    };
  }

  const thumbnailBox = findThumbnailInkBounds(imageData, canvasWidth, searchBox);
  const sampleBox = thumbnailBox ?? searchBox;

  return {
    visualColorRgb: sampleDominantColorInBox(imageData, canvasWidth, sampleBox, {
      allowDarkFallback: true,
      sampleStep: 2,
    }),
    visualDescriptor: createVisualPartDescriptorFromImageData(imageData, sampleBox),
  };
}

function sampleDominantColorInBox(
  imageData: ImageData,
  canvasWidth: number,
  bbox: OcrTextBox,
  options: { allowDarkFallback: boolean; sampleStep: number },
) {
  const quantizedColors = new Map<
    string,
    { count: number; red: number; green: number; blue: number }
  >();
  const sampleTop = Math.max(0, Math.floor(bbox.y0));
  const sampleBottom = Math.min(imageData.height, Math.ceil(bbox.y1));
  const sampleLeft = Math.max(0, Math.floor(bbox.x0));
  const sampleRight = Math.min(imageData.width, Math.ceil(bbox.x1));

  for (let y = sampleTop; y < sampleBottom; y += options.sampleStep) {
    const rowOffset = y * canvasWidth * 4;

    for (let x = sampleLeft; x < sampleRight; x += options.sampleStep) {
      const offset = rowOffset + x * 4;
      const red = imageData.data[offset] ?? 255;
      const green = imageData.data[offset + 1] ?? 255;
      const blue = imageData.data[offset + 2] ?? 255;
      const alpha = imageData.data[offset + 3] ?? 255;

      if (
        alpha <= 16 ||
        isLikelyCardBackground(red, green, blue) ||
        isLikelyHighlightPixel(red, green, blue)
      ) {
        continue;
      }

      const key = [
        Math.round(red / 16),
        Math.round(green / 16),
        Math.round(blue / 16),
      ].join(":");
      const color = quantizedColors.get(key) ?? {
        count: 0,
        red: 0,
        green: 0,
        blue: 0,
      };

      color.count += 1;
      color.red += red;
      color.green += green;
      color.blue += blue;
      quantizedColors.set(key, color);
    }
  }

  const clusters = [...quantizedColors.values()];
  const scoredClusters = clusters
    .map((cluster) => ({
      cluster,
      score: cluster.count * scoreColorCluster(cluster),
    }))
    .filter(
      ({ cluster }) =>
        options.allowDarkFallback || colorClusterLuminance(cluster) >= 24,
    )
    .sort((left, right) => right.score - left.score);
  const dominantColor =
    scoredClusters[0]?.cluster ??
    (options.allowDarkFallback
      ? clusters.sort((left, right) => right.count - left.count)[0]
      : undefined);

  if (!dominantColor || dominantColor.count < 8) {
    return null;
  }

  return rgbToHex(
    Math.round(dominantColor.red / dominantColor.count),
    Math.round(dominantColor.green / dominantColor.count),
    Math.round(dominantColor.blue / dominantColor.count),
  );
}

function createPartThumbnailSearchBox(
  cellBox: OcrTextBox,
  partNumberWord: OcrTextWord,
  pageWidth: number,
  pageHeight: number,
) {
  const cellWidth = cellBox.x1 - cellBox.x0;
  const cellHeight = cellBox.y1 - cellBox.y0;
  const paddingX = Math.max(6, cellWidth * 0.08);
  const paddingY = Math.max(4, cellHeight * 0.05);
  const partNumberTop = partNumberWord.bbox.y0;
  const upperBottom = Math.min(
    partNumberTop - paddingY,
    cellBox.y0 + cellHeight * 0.78,
  );
  const fallbackBottom = cellBox.y0 + cellHeight * 0.64;
  const y1 = upperBottom > cellBox.y0 + 18 ? upperBottom : fallbackBottom;

  if (y1 <= cellBox.y0 + 12) {
    return null;
  }

  return {
    x0: Math.max(0, cellBox.x0 + paddingX),
    y0: Math.max(0, cellBox.y0 + paddingY),
    x1: Math.min(pageWidth, cellBox.x1 - paddingX),
    y1: Math.min(pageHeight, y1),
  };
}

function findThumbnailInkBounds(
  imageData: ImageData,
  canvasWidth: number,
  searchBox: OcrTextBox,
) {
  const x0 = Math.max(0, Math.floor(searchBox.x0));
  const y0 = Math.max(0, Math.floor(searchBox.y0));
  const x1 = Math.min(imageData.width, Math.ceil(searchBox.x1));
  const y1 = Math.min(imageData.height, Math.ceil(searchBox.y1));
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let activePixels = 0;

  for (let y = y0; y < y1; y += 2) {
    const rowOffset = y * canvasWidth * 4;

    for (let x = x0; x < x1; x += 2) {
      const offset = rowOffset + x * 4;
      const red = imageData.data[offset] ?? 255;
      const green = imageData.data[offset + 1] ?? 255;
      const blue = imageData.data[offset + 2] ?? 255;
      const alpha = imageData.data[offset + 3] ?? 255;

      if (!isLikelyThumbnailPixel(red, green, blue, alpha)) {
        continue;
      }

      activePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (activePixels < 12 || !Number.isFinite(minX)) {
    return null;
  }

  return expandBox(
    {
      x0: minX,
      y0: minY,
      x1: maxX + 1,
      y1: maxY + 1,
    },
    Math.max(4, Math.round((x1 - x0) * 0.03)),
    imageData.width,
    imageData.height,
  );
}

function isLikelyCardBackground(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;

  return luminance > 244 && max - min < 18;
}

function isLikelyHighlightPixel(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;

  return luminance > 232 && max - min < 34;
}

function isLikelyThumbnailPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
) {
  if (alpha <= 16 || isLikelyCardBackground(red, green, blue)) {
    return false;
  }

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;

  return luminance < 238 || max - min > 24;
}

function scoreColorCluster(cluster: {
  count: number;
  red: number;
  green: number;
  blue: number;
}) {
  const luminance = colorClusterLuminance(cluster);
  const saturation = colorClusterSaturation(cluster);

  if (luminance < 22) {
    return 0.45;
  }

  if (luminance > 225 && saturation < 0.12) {
    return 0.35;
  }

  return 1 + saturation * 0.65;
}

function colorClusterLuminance(cluster: {
  count: number;
  red: number;
  green: number;
  blue: number;
}) {
  const red = cluster.red / cluster.count;
  const green = cluster.green / cluster.count;
  const blue = cluster.blue / cluster.count;

  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function colorClusterSaturation(cluster: {
  count: number;
  red: number;
  green: number;
  blue: number;
}) {
  const red = cluster.red / cluster.count;
  const green = cluster.green / cluster.count;
  const blue = cluster.blue / cluster.count;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  return max === 0 ? 0 : (max - min) / max;
}

function rgbToHex(red: number, green: number, blue: number) {
  return [red, green, blue]
    .map((component) =>
      Math.max(0, Math.min(255, component)).toString(16).padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

function findContentBounds(
  rowInkCounts: Uint32Array,
  columnInkCounts: Uint32Array,
) {
  const y0 = firstActiveIndex(rowInkCounts, 8);
  const y1 = lastActiveIndex(rowInkCounts, 8);
  const x0 = firstActiveIndex(columnInkCounts, 8);
  const x1 = lastActiveIndex(columnInkCounts, 8);

  if (x0 === null || x1 === null || y0 === null || y1 === null) {
    return null;
  }

  return { x0, y0, x1, y1 };
}

function firstActiveIndex(counts: Uint32Array, threshold: number) {
  for (let index = 0; index < counts.length; index += 1) {
    if ((counts[index] ?? 0) >= threshold) {
      return index;
    }
  }

  return null;
}

function lastActiveIndex(counts: Uint32Array, threshold: number) {
  for (let index = counts.length - 1; index >= 0; index -= 1) {
    if ((counts[index] ?? 0) >= threshold) {
      return index + 1;
    }
  }

  return null;
}

function findProjectionBands(
  counts: Uint32Array,
  crossAxisLength: number,
  start: number,
  end: number,
  options: {
    activeRatio: number;
    maxMergeGap: number;
    minSize: number;
  },
) {
  const threshold = Math.max(2, Math.round(crossAxisLength * options.activeRatio));
  const rawBands: ProjectionBand[] = [];
  let activeStart: number | null = null;

  for (let index = start; index < end; index += 1) {
    if ((counts[index] ?? 0) >= threshold) {
      activeStart ??= index;
    } else if (activeStart !== null) {
      rawBands.push({ start: activeStart, end: index });
      activeStart = null;
    }
  }

  if (activeStart !== null) {
    rawBands.push({ start: activeStart, end });
  }

  return mergeProjectionBands(rawBands, options.maxMergeGap).filter(
    (band) => band.end - band.start >= options.minSize,
  );
}

function mergeProjectionBands(bands: ProjectionBand[], maxMergeGap: number) {
  const mergedBands: ProjectionBand[] = [];

  bands.forEach((band) => {
    const previousBand = mergedBands[mergedBands.length - 1];

    if (previousBand && band.start - previousBand.end <= maxMergeGap) {
      previousBand.end = band.end;
      return;
    }

    mergedBands.push({ ...band });
  });

  return mergedBands;
}

function expandBox(
  box: OcrTextBox,
  padding: number,
  pageWidth: number,
  pageHeight: number,
): OcrTextBox {
  return {
    x0: Math.max(0, box.x0 - padding),
    y0: Math.max(0, box.y0 - padding),
    x1: Math.min(pageWidth, box.x1 + padding),
    y1: Math.min(pageHeight, box.y1 + padding),
  };
}

function hasEnoughInk(
  rowInkCounts: Uint32Array,
  columnInkCounts: Uint32Array,
  box: OcrTextBox,
) {
  const rowInk = sumCounts(rowInkCounts, Math.floor(box.y0), Math.ceil(box.y1));
  const columnInk = sumCounts(
    columnInkCounts,
    Math.floor(box.x0),
    Math.ceil(box.x1),
  );

  return rowInk > 24 && columnInk > 24;
}

function sumCounts(counts: Uint32Array, start: number, end: number) {
  let total = 0;

  for (let index = Math.max(0, start); index < Math.min(counts.length, end); index += 1) {
    total += counts[index] ?? 0;
  }

  return total;
}

const ocrExactPartNumberPattern =
  /^(?:\d{4,7}(?:[a-z][a-z0-9]*)?|\d{3}[a-z][a-z0-9]*)$/i;

async function appendTargetedQuantityWords({
  canvas,
  pageNumber,
  quantityWorker,
  words,
}: {
  canvas: HTMLCanvasElement;
  pageNumber: number;
  quantityWorker: TesseractWorker;
  words: OcrTextWord[];
}) {
  const partNumberWords = words
    .filter((word) => ocrExactPartNumberPattern.test(word.text))
    .sort(compareOcrWordsTopToBottom);

  if (partNumberWords.length === 0) {
    return words;
  }

  const targetedQuantityWords: OcrTextWord[] = [];

  for (const { cellBox, partNumberWord } of inferPartNumberCellBoxes(
    partNumberWords,
    canvas.width,
    canvas.height,
  )) {
    if (hasNearbyQuantityCandidateWord(words, partNumberWord, cellBox)) {
      continue;
    }

    const quantityBoxes = createPartQuantitySearchBoxes(
      cellBox,
      partNumberWord,
      canvas.width,
      canvas.height,
    );

    if (quantityBoxes.length === 0) {
      continue;
    }

    for (const quantityBox of quantityBoxes) {
      targetedQuantityWords.push(
        ...(await recognizeQuantityWordsInBox({
          canvas,
          pageNumber,
          quantityBox,
          quantityWorker,
        })),
      );
    }
  }

  return mergeQuantityCandidateWords(words, targetedQuantityWords);
}

function inferPartNumberCellBoxes(
  partNumberWords: OcrTextWord[],
  pageWidth: number,
  pageHeight: number,
) {
  const cells: { cellBox: OcrTextBox; partNumberWord: OcrTextWord }[] = [];
  const partNumberRows = clusterOcrPartNumberRows(partNumberWords);
  const rowCenters = partNumberRows.map((row) => averageOcrWordCenterY(row));

  partNumberRows.forEach((row, rowIndex) => {
    const sortedRow = [...row].sort((left, right) => centerX(left) - centerX(right));
    const currentRowCenter = rowCenters[rowIndex] ?? averageOcrWordCenterY(row);
    const previousRowCenter = rowCenters[rowIndex - 1] ?? null;
    const nextRowCenter = rowCenters[rowIndex + 1] ?? null;
    const estimatedRowGap =
      nextRowCenter !== null
        ? nextRowCenter - currentRowCenter
        : previousRowCenter !== null
          ? currentRowCenter - previousRowCenter
          : pageHeight;
    const rowTop =
      rowIndex === 0
        ? Math.max(0, currentRowCenter - estimatedRowGap * 0.65)
        : ((previousRowCenter ?? currentRowCenter) + currentRowCenter) / 2;
    const rowBottom =
      rowIndex === partNumberRows.length - 1
        ? Math.min(pageHeight, currentRowCenter + estimatedRowGap * 0.55)
        : (currentRowCenter + (nextRowCenter ?? currentRowCenter)) / 2;

    sortedRow.forEach((partNumberWord, columnIndex) => {
      const previousPartNumberWord = sortedRow[columnIndex - 1];
      const nextPartNumberWord = sortedRow[columnIndex + 1];
      const columnLeft = previousPartNumberWord
        ? (centerX(previousPartNumberWord) + centerX(partNumberWord)) / 2
        : Math.max(0, centerX(partNumberWord) - pageWidth * 0.12);
      const columnRight = nextPartNumberWord
        ? (centerX(partNumberWord) + centerX(nextPartNumberWord)) / 2
        : Math.min(pageWidth, centerX(partNumberWord) + pageWidth * 0.12);
      const cellBox = expandBox(
        {
          x0: columnLeft,
          y0: rowTop,
          x1: columnRight,
          y1: rowBottom,
        },
        Math.max(8, Math.round(pageWidth * 0.004)),
        pageWidth,
        pageHeight,
      );

      cells.push({ cellBox, partNumberWord });
    });
  });

  return cells;
}

async function recognizeQuantityWordsInBox({
  canvas,
  pageNumber,
  quantityBox,
  quantityWorker,
}: {
  canvas: HTMLCanvasElement;
  pageNumber: number;
  quantityBox: OcrTextBox;
  quantityWorker: TesseractWorker;
}) {
  const cropScale = 3;
  const cropWidth = Math.max(1, Math.ceil(quantityBox.x1 - quantityBox.x0));
  const cropHeight = Math.max(1, Math.ceil(quantityBox.y1 - quantityBox.y0));
  const cropCanvas = document.createElement("canvas");
  const cropContext = cropCanvas.getContext("2d", { willReadFrequently: true });

  if (!cropContext) {
    return [];
  }

  cropCanvas.width = cropWidth * cropScale;
  cropCanvas.height = cropHeight * cropScale;
  cropContext.fillStyle = "#fff";
  cropContext.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropContext.drawImage(
    canvas,
    Math.floor(quantityBox.x0),
    Math.floor(quantityBox.y0),
    cropWidth,
    cropHeight,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height,
  );

  const result = await quantityWorker.recognize(cropCanvas, undefined, {
    blocks: true,
    text: true,
  });
  const words = extractQuantityCandidateWords(result.data, pageNumber).map((word) => ({
    ...word,
    bbox: {
      x0: quantityBox.x0 + word.bbox.x0 / cropScale,
      y0: quantityBox.y0 + word.bbox.y0 / cropScale,
      x1: quantityBox.x0 + word.bbox.x1 / cropScale,
      y1: quantityBox.y0 + word.bbox.y1 / cropScale,
    },
  }));

  cropCanvas.width = 0;
  cropCanvas.height = 0;

  return words;
}

function createPartQuantitySearchBoxes(
  cellBox: OcrTextBox,
  partNumberWord: OcrTextWord,
  pageWidth: number,
  pageHeight: number,
) {
  const cellWidth = cellBox.x1 - cellBox.x0;
  const cellHeight = cellBox.y1 - cellBox.y0;
  const paddingX = Math.max(4, cellWidth * 0.04);
  const lineBox = {
    x0: Math.max(0, cellBox.x0 + paddingX),
    y0: Math.max(0, Math.max(cellBox.y0, partNumberWord.bbox.y0 - cellHeight * 0.18)),
    x1: Math.min(pageWidth, cellBox.x1 - paddingX),
    y1: Math.min(
      pageHeight,
      Math.min(cellBox.y1, partNumberWord.bbox.y1 + cellHeight * 0.22),
    ),
  };
  const cornerBox = {
    x0: Math.max(0, cellBox.x0 + paddingX),
    y0: Math.max(0, cellBox.y0 + Math.max(4, cellHeight * 0.04)),
    x1: Math.min(pageWidth, cellBox.x0 + cellWidth * 0.58),
    y1: Math.min(pageHeight, cellBox.y0 + cellHeight * 0.62),
  };
  const lowerBox = {
    x0: Math.max(0, cellBox.x0 + paddingX),
    y0: Math.max(0, cellBox.y0 + cellHeight * 0.52),
    x1: Math.min(pageWidth, cellBox.x1 - paddingX),
    y1: Math.min(pageHeight, cellBox.y1 - Math.max(2, cellHeight * 0.02)),
  };

  return [lineBox, cornerBox, lowerBox].filter(
    (box) => box.x1 > box.x0 + 8 && box.y1 > box.y0 + 8,
  );
}

function hasNearbyQuantityCandidateWord(
  words: OcrTextWord[],
  partNumberWord: OcrTextWord,
  cellBox: OcrTextBox,
) {
  const cellWidth = Math.max(1, cellBox.x1 - cellBox.x0);
  const cellHeight = Math.max(1, cellBox.y1 - cellBox.y0);

  return words.some((word) => {
    if (!isQuantityCandidateText(word.text)) {
      return false;
    }

    const wordCenterX = centerX(word);
    const wordCenterY = centerY(word);

    return (
      pointInBox(wordCenterX, wordCenterY, cellBox) &&
      Math.abs(wordCenterX - centerX(partNumberWord)) <= cellWidth * 0.58 &&
      Math.abs(wordCenterY - centerY(partNumberWord)) <= cellHeight * 0.42
    );
  });
}

function attachVisualColorSamplesToWords(
  canvas: HTMLCanvasElement,
  words: OcrTextWord[],
) {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return words;
  }

  const partNumberWords = words
    .filter((word) => ocrExactPartNumberPattern.test(word.text))
    .sort(compareOcrWordsTopToBottom);

  if (partNumberWords.length === 0) {
    return words;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const partNumberRows = clusterOcrPartNumberRows(partNumberWords);
  const rowCenters = partNumberRows.map((row) => averageOcrWordCenterY(row));
  const visualColorsByWord = new Map<OcrTextWord, string | null>();
  const visualDescriptorsByWord = new Map<
    OcrTextWord,
    VisualPartDescriptor | null
  >();

  partNumberRows.forEach((row, rowIndex) => {
    const sortedRow = [...row].sort((left, right) => centerX(left) - centerX(right));
    const currentRowCenter = rowCenters[rowIndex] ?? averageOcrWordCenterY(row);
    const previousRowCenter = rowCenters[rowIndex - 1] ?? null;
    const nextRowCenter = rowCenters[rowIndex + 1] ?? null;
    const estimatedRowGap =
      nextRowCenter !== null
        ? nextRowCenter - currentRowCenter
        : previousRowCenter !== null
          ? currentRowCenter - previousRowCenter
          : canvas.height;
    const rowTop =
      rowIndex === 0
        ? Math.max(0, currentRowCenter - estimatedRowGap * 0.65)
        : ((previousRowCenter ?? currentRowCenter) + currentRowCenter) / 2;
    const rowBottom =
      rowIndex === partNumberRows.length - 1
        ? Math.min(canvas.height, currentRowCenter + estimatedRowGap * 0.55)
        : (currentRowCenter + (nextRowCenter ?? currentRowCenter)) / 2;

    sortedRow.forEach((partNumberWord, columnIndex) => {
      const previousPartNumberWord = sortedRow[columnIndex - 1];
      const nextPartNumberWord = sortedRow[columnIndex + 1];
      const columnLeft = previousPartNumberWord
        ? (centerX(previousPartNumberWord) + centerX(partNumberWord)) / 2
        : Math.max(0, centerX(partNumberWord) - canvas.width * 0.12);
      const columnRight = nextPartNumberWord
        ? (centerX(partNumberWord) + centerX(nextPartNumberWord)) / 2
        : Math.min(canvas.width, centerX(partNumberWord) + canvas.width * 0.12);
      const cellBox = expandBox(
        {
          x0: columnLeft,
          y0: rowTop,
          x1: columnRight,
          y1: rowBottom,
        },
        Math.max(8, Math.round(canvas.width * 0.004)),
        canvas.width,
        canvas.height,
      );

      const visualSample = samplePartThumbnailVisual(
        imageData,
        canvas.width,
        canvas.height,
        cellBox,
        partNumberWord,
      );

      visualColorsByWord.set(partNumberWord, visualSample.visualColorRgb);
      visualDescriptorsByWord.set(partNumberWord, visualSample.visualDescriptor);
    });
  });

  return words.map((word) =>
    visualColorsByWord.has(word)
      ? {
          ...word,
          visualColorRgb: visualColorsByWord.get(word) ?? null,
          visualDescriptor: visualDescriptorsByWord.get(word) ?? null,
        }
      : word,
  );
}

function clusterOcrPartNumberRows(partNumberWords: OcrTextWord[]) {
  const rows: OcrTextWord[][] = [];

  partNumberWords.forEach((word) => {
    const wordHeight = Math.max(1, word.bbox.y1 - word.bbox.y0);
    const matchingRow = rows.find((row) => {
      const rowCenter = averageOcrWordCenterY(row);
      const threshold = Math.max(wordHeight * 2.5, 36);

      return Math.abs(centerY(word) - rowCenter) <= threshold;
    });

    if (matchingRow) {
      matchingRow.push(word);
      return;
    }

    rows.push([word]);
  });

  return rows;
}

function averageOcrWordCenterY(words: OcrTextWord[]) {
  return words.reduce((total, word) => total + centerY(word), 0) / words.length;
}

function compareOcrWordsTopToBottom(left: OcrTextWord, right: OcrTextWord) {
  if (Math.abs(left.bbox.y0 - right.bbox.y0) > 12) {
    return left.bbox.y0 - right.bbox.y0;
  }

  return left.bbox.x0 - right.bbox.x0;
}

function pointInBox(x: number, y: number, box: OcrTextBox) {
  return x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
}

function centerX(word: OcrTextWord) {
  return (word.bbox.x0 + word.bbox.x1) / 2;
}

function centerY(word: OcrTextWord) {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function extractRecognizedWords(
  pageData: TesseractPageData,
  pageNumber: number,
): OcrTextWord[] {
  return (
    pageData.blocks?.flatMap((block) =>
      block.paragraphs?.flatMap((paragraph) =>
        paragraph.lines?.flatMap((line) => line.words ?? []) ?? [],
      ) ?? [],
    ) ?? []
  )
    .flatMap((word): OcrTextWord[] => {
      if (!word.bbox || !word.text?.trim()) {
        return [];
      }

      return [
        {
          pageNumber,
          text: word.text,
          confidence:
            typeof word.confidence === "number" ? word.confidence : null,
          bbox: word.bbox,
        },
      ];
    })
    .sort((left, right) => {
      if (Math.abs(left.bbox.y0 - right.bbox.y0) > 12) {
        return left.bbox.y0 - right.bbox.y0;
      }

      return left.bbox.x0 - right.bbox.x0;
    });
}

function extractQuantityCandidateWords(
  pageData: TesseractPageData,
  pageNumber: number,
) {
  return extractRecognizedWords(pageData, pageNumber).filter((word) =>
    isQuantityCandidateText(word.text),
  );
}

function mergeQuantityCandidateWords(
  words: OcrTextWord[],
  quantityWords: OcrTextWord[],
) {
  if (quantityWords.length === 0) {
    return words;
  }

  const mergedWords = [...words];

  quantityWords.forEach((quantityWord) => {
    const duplicateWord = mergedWords.some(
      (word) =>
        normalizeQuantityCandidateText(word.text) ===
          normalizeQuantityCandidateText(quantityWord.text) &&
        Math.abs(centerX(word) - centerX(quantityWord)) <= 16 &&
        Math.abs(centerY(word) - centerY(quantityWord)) <= 16,
    );

    if (!duplicateWord) {
      mergedWords.push(quantityWord);
    }
  });

  return mergedWords.sort(compareOcrWordsTopToBottom);
}

function isQuantityCandidateText(text: string) {
  const normalizedText = normalizeQuantityCandidateText(text);

  return (
    /^\d{1,3}x$/i.test(normalizedText) ||
    /^x\d{1,3}$/i.test(normalizedText) ||
    /^x$/i.test(normalizedText) ||
    /^\d{1,3}$/i.test(normalizedText)
  );
}

function normalizeQuantityCandidateText(text: string) {
  return text.replace(/[×✕]/g, "x").replace(/[^0-9x]/gi, "").toLowerCase();
}

function extractRecognizedLines(
  pageData: TesseractPageData,
  pageNumber: number,
): OcrTextLine[] {
  const blockLines = pageData.blocks?.flatMap((block) =>
    block.paragraphs?.flatMap((paragraph) => paragraph.lines ?? []) ?? [],
  );
  const lines = blockLines?.length
    ? blockLines.map((line): OcrTextLine => ({
        pageNumber,
        text: line.text ?? "",
        confidence: typeof line.confidence === "number" ? line.confidence : null,
        bbox: line.bbox ?? null,
      }))
    : fallbackTextLines(pageData, pageNumber);

  return lines
    .filter((line) => line.text.trim().length > 0)
    .sort((left, right) => {
      const leftBox = left.bbox;
      const rightBox = right.bbox;

      if (!leftBox || !rightBox) {
        return 0;
      }

      if (Math.abs(leftBox.y0 - rightBox.y0) > 12) {
        return leftBox.y0 - rightBox.y0;
      }

      return leftBox.x0 - rightBox.x0;
    });
}

function fallbackTextLines(
  pageData: TesseractPageData,
  pageNumber: number,
): OcrTextLine[] {
  return (pageData.text ?? "")
    .split(/\r?\n/)
    .map((text): OcrTextLine => ({
      pageNumber,
      text,
      confidence:
        typeof pageData.confidence === "number" ? pageData.confidence : null,
      bbox: null,
    }));
}
