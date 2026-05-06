"use client";

import {
  Box,
  Button,
  Container,
  Grid,
  Heading,
  HStack,
  Image,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  createEmptyLocalProjectData,
  createIndexedDbProjectStore,
  withPdfSessionMetadata,
  type LocalProjectData,
  type LocalProjectStore,
} from "@/domain/local-project-data";
import {
  extractPartListFromPdfSession,
  type ExtractPartListOptions,
  type PdfOcrProgress,
} from "@/domain/browser-pdf-ocr";
import type {
  ExtractedPartListItem,
  PartListExtractionResult,
} from "@/domain/part-list-extraction";
import {
  createPdfSessionFromFile,
  type PdfSession,
} from "@/domain/pdf-session";
import {
  attachCatalogColorsToInventory,
  attachCatalogPartsToInventory,
  fetchRebrickableCatalogParts,
  type RebrickableCatalogFetchResult,
} from "@/domain/rebrickable-catalog";
import {
  parseRebrickablePartsCsv,
  type RebrickableInventoryItem,
} from "@/domain/rebrickable-csv";

type AnalysisState = "idle" | "running" | "complete" | "failed";
type AnalyzePdfSession = typeof extractPartListFromPdfSession;
type FetchCatalogParts = typeof fetchRebrickableCatalogParts;
type CsvCatalogState = "idle" | "loading" | "complete" | "failed";

type CsvInventoryState = {
  catalogMatchedRows: number;
  catalogStatus: CsvCatalogState;
  catalogWarnings: string[];
  fileName: string;
  items: RebrickableInventoryItem[];
  warnings: string[];
};

type HomeShellProps = {
  analyzePdfSession?: AnalyzePdfSession;
  fetchCatalogParts?: FetchCatalogParts;
  projectStore?: LocalProjectStore;
};

export function HomeShell({
  analyzePdfSession = extractPartListFromPdfSession,
  fetchCatalogParts = fetchRebrickableCatalogParts,
  projectStore,
}: HomeShellProps = {}) {
  const [pdfSession, setPdfSession] = useState<PdfSession | null>(null);
  const [projectData, setProjectData] = useState<LocalProjectData | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisProgress, setAnalysisProgress] = useState<PdfOcrProgress | null>(
    null,
  );
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [csvInventory, setCsvInventory] = useState<CsvInventoryState | null>(
    null,
  );
  const [csvError, setCsvError] = useState<string | null>(null);
  const [partListExtraction, setPartListExtraction] =
    useState<PartListExtractionResult | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const fileSelectionId = useRef(0);
  const csvSelectionId = useRef(0);
  const projectDataRef = useRef<LocalProjectData | null>(null);
  const hasLocalProjectMutation = useRef(false);
  const localProjectStore = useMemo(
    () => projectStore ?? createIndexedDbProjectStore(),
    [projectStore],
  );

  useEffect(() => {
    let isMounted = true;

    localProjectStore
      .load()
      .then((loadedProjectData) => {
        if (!isMounted || hasLocalProjectMutation.current) {
          return;
        }

        projectDataRef.current = loadedProjectData;
        setProjectData(loadedProjectData);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [localProjectStore]);

  useEffect(() => {
    const animationFrameId = window.requestAnimationFrame(() => {
      setHasHydrated(true);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const isRunning = analysisState === "running";
  const isCatalogLoading = csvInventory?.catalogStatus === "loading";
  const isHeroCollapsed = analysisState !== "idle";
  const hasCurrentAnalysisOutput =
    analysisState === "complete" && partListExtraction !== null;
  const canStartAnalysis =
    Boolean(pdfSession) &&
    !isRunning &&
    !isLoadingPdf &&
    !isCatalogLoading &&
    !hasCurrentAnalysisOutput;

  function clearManualInput() {
    if (manualInputRef.current) {
      manualInputRef.current.value = "";
    }
  }

  function clearCsvInput() {
    if (csvInputRef.current) {
      csvInputRef.current.value = "";
    }
  }

  function resetAnalysisOutput() {
    setAnalysisState("idle");
    setAnalysisProgress(null);
    setAnalysisError(null);
    setPartListExtraction(null);
  }

  async function handleManualFile(file: File) {
    const currentSelectionId = fileSelectionId.current + 1;
    fileSelectionId.current = currentSelectionId;
    setIsLoadingPdf(true);
    setIntakeError(null);
    resetAnalysisOutput();

    let nextPdfSession: PdfSession;

    try {
      nextPdfSession = await createPdfSessionFromFile(file);
    } catch (error) {
      if (fileSelectionId.current === currentSelectionId) {
        setPdfSession(null);
        setIntakeError(toErrorMessage(error));
        clearManualInput();
        setIsLoadingPdf(false);
      }

      return;
    }

    if (fileSelectionId.current !== currentSelectionId) {
      return;
    }

    hasLocalProjectMutation.current = true;
    setPdfSession(nextPdfSession);

    const nextProjectData = withPdfSessionMetadata(
      projectDataRef.current ?? projectData ?? createEmptyLocalProjectData(),
      nextPdfSession.metadata,
    );

    projectDataRef.current = nextProjectData;
    setProjectData(nextProjectData);

    try {
      await localProjectStore.save(nextProjectData);
    } catch {
      // The active PDF session still works if local metadata cannot be saved.
    } finally {
      if (fileSelectionId.current === currentSelectionId) {
        setIsLoadingPdf(false);
      }
    }
  }

  async function handleCsvFile(file: File) {
    const currentCsvSelectionId = csvSelectionId.current + 1;
    csvSelectionId.current = currentCsvSelectionId;
    setCsvError(null);
    resetAnalysisOutput();

    try {
      const csvText = await file.text();

      if (csvSelectionId.current !== currentCsvSelectionId) {
        return;
      }

      const parseResult = parseRebrickablePartsCsv(csvText);

      if (parseResult.items.length === 0) {
        setCsvInventory(null);
        setCsvError(parseResult.warnings[0] ?? "CSV did not contain any rows.");
        clearCsvInput();
        return;
      }

      const baseCsvInventory: CsvInventoryState = {
        catalogMatchedRows: 0,
        catalogStatus: "loading",
        catalogWarnings: [],
        fileName: file.name,
        items: parseResult.items,
        warnings: parseResult.warnings,
      };

      setCsvInventory(baseCsvInventory);

      try {
        const catalogResult = await fetchCatalogParts(
          collectDistinctPartNumbers(parseResult.items),
        );

        if (csvSelectionId.current !== currentCsvSelectionId) {
          return;
        }

        const colorEnrichedItems = attachCatalogColorsToInventory(
          parseResult.items,
          catalogResult.colorNamesById,
          catalogResult.colorRgbById,
        );
        const enrichedItems = attachCatalogPartsToInventory(
          colorEnrichedItems,
          catalogResult.parts,
        );

        setCsvInventory({
          ...baseCsvInventory,
          catalogMatchedRows: countInventoryRowsWithCatalog(enrichedItems),
          catalogStatus: "complete",
          catalogWarnings: buildCatalogWarnings(catalogResult),
          items: enrichedItems,
        });
      } catch (error) {
        if (csvSelectionId.current !== currentCsvSelectionId) {
          return;
        }

        setCsvInventory({
          ...baseCsvInventory,
          catalogStatus: "failed",
          catalogWarnings: [toErrorMessage(error)],
        });
      }
    } catch (error) {
      if (csvSelectionId.current !== currentCsvSelectionId) {
        return;
      }

      setCsvInventory(null);
      setCsvError(toErrorMessage(error));
      clearCsvInput();
    }
  }

  function handleManualChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void handleManualFile(file);
    }
  }

  function handleCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void handleCsvFile(file);
    }
  }

  function clearPdfSession() {
    fileSelectionId.current += 1;
    setPdfSession(null);
    setIntakeError(null);
    setIsLoadingPdf(false);
    resetAnalysisOutput();
    clearManualInput();
  }

  function clearCsvInventory() {
    csvSelectionId.current += 1;
    setCsvInventory(null);
    setCsvError(null);
    resetAnalysisOutput();
    clearCsvInput();
  }

  async function handleAnalyzeManual() {
    if (!pdfSession) {
      setAnalysisError("Select a manual PDF before running analysis.");
      return;
    }

    const currentSelectionId = fileSelectionId.current;

    setAnalysisState("running");
    setAnalysisError(null);
    setPartListExtraction(null);
    setAnalysisProgress({
      phase: "loading-pdf",
      pageNumber: null,
      pageCount: null,
      progress: null,
      message: "Starting local analysis",
    });

    try {
      const extractionOptions: ExtractPartListOptions = {
        fetchCatalogParts,
        onProgress: setAnalysisProgress,
      };

      if (csvInventory) {
        extractionOptions.validationInventory = csvInventory.items;
      }

      const extractionResult = await analyzePdfSession(pdfSession, extractionOptions);

      if (fileSelectionId.current !== currentSelectionId) {
        return;
      }

      setPartListExtraction(extractionResult);
      setAnalysisState("complete");
      setAnalysisProgress({
        phase: "complete",
        pageNumber: null,
        pageCount: extractionResult.pagesAnalyzed,
        progress: 1,
        message: "Inventory gathered",
      });
    } catch (error) {
      if (fileSelectionId.current !== currentSelectionId) {
        return;
      }

      setAnalysisError(toErrorMessage(error));
      setAnalysisState("failed");
    }
  }

  return (
    <Box
      as="main"
      bg="gray.50"
      data-hydrated={hasHydrated ? "true" : "false"}
      data-testid="home-shell"
      minH="100vh"
    >
      <Container maxW="6xl" py={{ base: "6", md: "10" }}>
        <Stack gap="0">
          <Box
            as="section"
            aria-hidden={isHeroCollapsed ? true : undefined}
            aria-label="Project introduction"
            data-state={isHeroCollapsed ? "collapsed" : "expanded"}
            data-testid="project-hero"
            maxH={isHeroCollapsed ? "0" : { base: "18rem", md: "15rem" }}
            mb={isHeroCollapsed ? "0" : { base: "6", md: "8" }}
            opacity={isHeroCollapsed ? "0" : "1"}
            overflow="hidden"
            pointerEvents={isHeroCollapsed ? "none" : "auto"}
            transform={isHeroCollapsed ? "translateY(-8px)" : "translateY(0)"}
            transition="max-height 300ms ease, opacity 220ms ease, transform 300ms ease, margin-bottom 300ms ease"
            willChange="max-height, opacity, transform, margin-bottom"
          >
            <Stack gap="3" maxW="4xl">
              <Heading as="h1" color="gray.950" size="3xl">
                Build MOCs like boxed LEGO sets.
              </Heading>
              <Text
                color="gray.700"
                fontSize={{ base: "md", md: "lg" }}
                lineHeight="1.7"
                maxW="3xl"
              >
                Bag It turns a MOC instruction manual into an ordered parts-bag
                workflow. Upload the PDF and optional Rebrickable CSV, then split
                the build into bags so it feels closer to opening an official
                LEGO set.
              </Text>
            </Stack>
          </Box>

          <Box
            as="section"
            aria-label="Upload files"
            bg="white"
            borderColor="gray.200"
            borderRadius="md"
            borderWidth="1px"
            mb={hasCurrentAnalysisOutput ? { base: "6", md: "8" } : "0"}
            p={{ base: "5", md: "6" }}
            transition="margin-bottom 220ms ease"
          >
            <Stack gap="5">
              <Stack gap="1">
                <Heading as="h2" color="gray.950" size="md">
                  Upload files
                </Heading>
                <Text color="gray.600" fontSize="sm">
                  Add the instruction manual and optional Rebrickable parts CSV.
                </Text>
              </Stack>

              <Grid gap="5" templateColumns={{ base: "1fr", md: "1fr 1fr" }}>
                <UploadCard
                  accept="application/pdf"
                  cardTestId="manual-upload-card"
                  disabled={isLoadingPdf || isRunning}
                  error={intakeError}
                  inputLabel="Manual PDF"
                  inputRef={manualInputRef}
                  inputTestId="manual-pdf-input"
                  onChange={handleManualChange}
                  onClear={clearPdfSession}
                  onFileDrop={handleManualFile}
                  canClear={Boolean(pdfSession)}
                  clearSlotTestId="manual-clear-slot"
                  dropzoneTestId="manual-upload-dropzone"
                  removeButtonLabel="Remove manual PDF"
                  title="Manual PDF"
                >
                  <ManualFileSummary pdfSession={pdfSession} />
                </UploadCard>

                <UploadCard
                  accept=".csv,text/csv"
                  cardTestId="csv-upload-card"
                  disabled={isRunning}
                  error={csvError}
                  inputLabel="Rebrickable parts CSV"
                  inputRef={csvInputRef}
                  inputTestId="parts-csv-input"
                  onChange={handleCsvChange}
                  onClear={clearCsvInventory}
                  onFileDrop={handleCsvFile}
                  canClear={Boolean(csvInventory)}
                  clearSlotTestId="csv-clear-slot"
                  dropzoneTestId="csv-upload-dropzone"
                  removeButtonLabel="Remove Rebrickable CSV"
                  title="Rebrickable CSV"
                >
                  <CsvFileSummary csvInventory={csvInventory} />
                </UploadCard>
              </Grid>

              <HStack
                borderColor="gray.200"
                borderTopWidth="1px"
                gap="4"
                justify="space-between"
                pt="5"
                wrap="wrap"
              >
                <Text color="gray.600" fontSize="sm">
                  {formatAnalysisCtaStatus({
                    hasCurrentAnalysisOutput,
                    isCatalogLoading,
                    isLoadingPdf,
                    isRunning,
                    pdfSession,
                  })}
                </Text>
                <Button
                  colorPalette="blue"
                  disabled={!canStartAnalysis}
                  loading={isRunning}
                  onClick={handleAnalyzeManual}
                  size="lg"
                >
                  Bag it
                </Button>
              </HStack>

              {isRunning || analysisState === "failed" ? (
                <AnalysisProgressPanel
                  analysisError={analysisError}
                  analysisProgress={analysisProgress}
                  analysisState={analysisState}
                />
              ) : null}
            </Stack>
          </Box>

          {partListExtraction && analysisState === "complete" ? (
            <InventoryOutput result={partListExtraction} />
          ) : null}
        </Stack>
      </Container>
    </Box>
  );
}

type UploadCardProps = {
  accept: string;
  canClear: boolean;
  cardTestId: string;
  children: ReactNode;
  clearSlotTestId: string;
  disabled: boolean;
  dropzoneTestId: string;
  error: string | null;
  inputLabel: string;
  inputRef: RefObject<HTMLInputElement | null>;
  inputTestId: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onFileDrop: (file: File) => Promise<void>;
  removeButtonLabel: string;
  title: string;
};

function UploadCard({
  accept,
  canClear,
  cardTestId,
  children,
  clearSlotTestId,
  disabled,
  dropzoneTestId,
  error,
  inputLabel,
  inputRef,
  inputTestId,
  onChange,
  onClear,
  onFileDrop,
  removeButtonLabel,
  title,
}: UploadCardProps) {
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const file = event.dataTransfer.files[0];

    if (file && !disabled) {
      void onFileDrop(file);
    }
  }

  return (
    <Box
      as="section"
      data-testid={cardTestId}
      display="grid"
      gap="3"
      gridTemplateRows="2rem minmax(9.5rem, 1fr) auto"
      h="full"
    >
      <Box
        alignItems="center"
        display="grid"
        gap="3"
        gridTemplateColumns="minmax(0, 1fr) 2rem"
      >
        <Heading as="h3" color="gray.950" size="sm">
          {title}
        </Heading>
        <Box data-testid={clearSlotTestId}>
          {canClear ? (
            <Button
              aria-label={removeButtonLabel}
              bg="white"
              borderColor="gray.400"
              color="gray.950"
              disabled={disabled}
              fontWeight="bold"
              minW="8"
              onClick={onClear}
              px="0"
              size="sm"
              variant="outline"
              _hover={{ bg: "gray.100", borderColor: "gray.600" }}
            >
              X
            </Button>
          ) : null}
        </Box>
      </Box>
      <Box
        as="label"
        alignContent="start"
        borderColor={error ? "red.300" : "gray.300"}
        borderRadius="md"
        borderStyle="dashed"
        borderWidth="1px"
        cursor={disabled ? "not-allowed" : "pointer"}
        data-testid={dropzoneTestId}
        display="grid"
        h="full"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        p="5"
        position="relative"
        transition="border-color 120ms ease, background 120ms ease"
        {...(disabled
          ? {}
          : { _hover: { bg: "gray.50", borderColor: "blue.400" } })}
      >
        <Input
          accept={accept}
          aria-label={inputLabel}
          data-testid={inputTestId}
          disabled={disabled}
          h="1px"
          onChange={onChange}
          opacity="0"
          overflow="hidden"
          position="absolute"
          ref={inputRef}
          type="file"
          w="1px"
        />
        <Stack gap="3">
          <Text color="gray.950" fontWeight="semibold">
            Drop file here or choose file
          </Text>
          {children}
        </Stack>
      </Box>

      {error ? (
        <Text color="red.700" fontSize="sm" role="alert">
          {error}
        </Text>
      ) : null}
    </Box>
  );
}

function formatAnalysisCtaStatus({
  hasCurrentAnalysisOutput,
  isCatalogLoading,
  isLoadingPdf,
  isRunning,
  pdfSession,
}: {
  hasCurrentAnalysisOutput: boolean;
  isCatalogLoading: boolean;
  isLoadingPdf: boolean;
  isRunning: boolean;
  pdfSession: PdfSession | null;
}) {
  if (isRunning) {
    return "Gathering inventory.";
  }

  if (isLoadingPdf) {
    return "Reading manual file.";
  }

  if (isCatalogLoading) {
    return "Checking CSV details.";
  }

  if (hasCurrentAnalysisOutput) {
    return "Inventory is ready.";
  }

  if (pdfSession) {
    return "Ready to gather inventory.";
  }

  return "Add a manual PDF to start.";
}

function ManualFileSummary({
  pdfSession,
}: {
  pdfSession: PdfSession | null;
}) {
  if (pdfSession) {
    return (
      <Stack gap="1">
        <Text color="gray.950" fontWeight="medium">
          {pdfSession.metadata.fileName}
        </Text>
        <Text color="gray.600" fontSize="sm">
          {formatByteSize(pdfSession.metadata.byteLength)}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="1">
      <Text color="gray.950" fontWeight="medium">
        No manual selected
      </Text>
    </Stack>
  );
}

function CsvFileSummary({
  csvInventory,
}: {
  csvInventory: CsvInventoryState | null;
}) {
  if (!csvInventory) {
    return (
      <Text color="gray.950" fontWeight="medium">
        No CSV loaded
      </Text>
    );
  }

  return (
    <Stack gap="2">
      <Text color="gray.950" fontWeight="medium">
        {csvInventory.fileName}
      </Text>
      <Text color="gray.600" fontSize="sm">
        {formatRowCount(csvInventory.items.length)}
      </Text>
      {csvInventory.catalogStatus === "failed" ? (
        <Text color="orange.700" fontSize="sm">
          Rebrickable catalog details are unavailable; CSV validation will use
          uploaded rows only.
        </Text>
      ) : null}
      {csvInventory.warnings.map((warning) => (
        <Text color="orange.700" fontSize="sm" key={warning}>
          {warning}
        </Text>
      ))}
      {csvInventory.catalogWarnings.map((warning) => (
        <Text color="orange.700" fontSize="sm" key={warning}>
          {warning}
        </Text>
      ))}
    </Stack>
  );
}

function AnalysisProgressPanel({
  analysisError,
  analysisProgress,
  analysisState,
}: {
  analysisError: string | null;
  analysisProgress: PdfOcrProgress | null;
  analysisState: AnalysisState;
}) {
  const progressValue = getProgressValue(analysisState, analysisProgress);

  return (
    <Box borderColor="gray.200" borderTopWidth="1px" pt="5">
      <Stack gap="3">
        <HStack gap="3" justify="space-between" wrap="wrap">
          <Stack gap="1">
            <Text color="gray.950" fontWeight="semibold">
              {analysisState === "failed"
                ? "Analysis needs attention"
                : "Gathering inventory"}
            </Text>
            <Text color="gray.600" fontSize="sm">
              {analysisProgress ? formatOcrProgress(analysisProgress) : "Preparing"}
            </Text>
          </Stack>
          <Text color="gray.600" fontSize="sm" fontWeight="medium">
            {progressValue}%
          </Text>
        </HStack>
        <Box
          aria-label="Analysis progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressValue}
          bg="gray.100"
          borderRadius="full"
          h="3"
          overflow="hidden"
          role="progressbar"
        >
          <Box
            bg={analysisState === "failed" ? "red.500" : "blue.500"}
            h="full"
            transition="width 160ms ease"
            w={`${progressValue}%`}
          />
        </Box>
        {analysisError ? (
          <Text color="red.700" fontSize="sm" role="alert">
            {analysisError}
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}

function InventoryOutput({ result }: { result: PartListExtractionResult }) {
  return (
    <Box
      as="section"
      aria-label="Analysis output"
      bg="white"
      borderColor="gray.200"
      borderRadius="md"
      borderWidth="1px"
      p={{ base: "5", md: "6" }}
    >
      <Stack gap="5">
        <Box aria-label="Output views" role="tablist">
          <Button
            aria-controls="inventory-panel"
            aria-selected="true"
            colorPalette="blue"
            id="inventory-tab"
            role="tab"
            size="sm"
            variant="solid"
          >
            Inventory
          </Button>
        </Box>
        <Box
          aria-labelledby="inventory-tab"
          id="inventory-panel"
          role="tabpanel"
        >
          <PartListOutput result={result} />
        </Box>
      </Stack>
    </Box>
  );
}

function PartListOutput({ result }: { result: PartListExtractionResult }) {
  const displayItems = result.items.filter(isDisplayablePartListItem);

  if (displayItems.length === 0) {
    return <Text color="gray.700">No candidate part rows were extracted.</Text>;
  }

  return (
    <Box borderColor="gray.200" borderRadius="md" borderWidth="1px" overflowX="auto">
      <Box as="table" aria-label="Inventory" borderCollapse="collapse" minW="760px" w="full">
        <Box as="thead" bg="gray.50">
          <Box as="tr">
            {["Quantity", "Image", "Part number", "Colour", "Part name"].map(
              (heading) => (
                <Box
                  as="th"
                  borderBottomWidth="1px"
                  borderColor="gray.200"
                  color="gray.600"
                  fontSize="xs"
                  fontWeight="bold"
                  key={heading}
                  px="3"
                  py="2"
                  textAlign="left"
                >
                  {heading}
                </Box>
              ),
            )}
          </Box>
        </Box>
        <Box as="tbody">
          {displayItems.map((item) => (
            <PartListOutputRow item={item} key={item.id} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function isDisplayablePartListItem(item: ExtractedPartListItem) {
  if (
    item.validationStatus !== "csv-no-match" &&
    item.validationStatus !== "catalog-no-match"
  ) {
    return true;
  }

  return Boolean(item.catalogPart || item.rebrickableColorId);
}

function PartListOutputRow({ item }: { item: ExtractedPartListItem }) {
  const quantity = getDisplayQuantity(item);
  const partNumber = getDisplayPartNumber(item);
  const colorName = getDisplayColorName(item);
  const partName = getDisplayPartName(item, partNumber, colorName);
  const imageUrl = getPartImageUrl(item, partNumber, colorName);

  return (
    <Box as="tr">
      <TableCell>{quantity}</TableCell>
      <TableCell>
        {imageUrl ? (
          <Image
            alt={partName}
            borderColor="gray.200"
            borderRadius="sm"
            borderWidth="1px"
            decoding="async"
            h="48px"
            loading="lazy"
            objectFit="contain"
            src={imageUrl}
            w="64px"
          />
        ) : (
          <Box
            alignItems="center"
            bg="gray.50"
            borderColor="gray.200"
            borderRadius="sm"
            borderWidth="1px"
            color="gray.500"
            display="flex"
            fontSize="xs"
            h="48px"
            justifyContent="center"
            w="64px"
          >
            No image
          </Box>
        )}
      </TableCell>
      <TableCell>{partNumber}</TableCell>
      <TableCell>
        <HStack gap="2">
          {item.colorRgb ? (
            <Box
              aria-hidden="true"
              bg={formatColorRgb(item.colorRgb) ?? "gray.100"}
              borderColor="gray.300"
              borderRadius="full"
              borderWidth="1px"
              boxSize="3"
            />
          ) : null}
          <Text as="span">{colorName}</Text>
        </HStack>
      </TableCell>
      <TableCell>{partName}</TableCell>
    </Box>
  );
}

const inferredColorNames = [
  "Dark Bluish Gray",
  "Light Bluish Gray",
  "Dark Blue",
  "Dark Green",
  "Dark Red",
  "Dark Tan",
  "Light Gray",
  "Medium Azure",
  "Medium Blue",
  "Reddish Brown",
  "Sand Blue",
  "Sand Green",
  "Bright Light Orange",
  "Bright Light Yellow",
  "Trans Clear",
  "Transparent",
  "Black",
  "Blue",
  "Brown",
  "Green",
  "Gray",
  "Grey",
  "Orange",
  "Purple",
  "Red",
  "Tan",
  "White",
  "Yellow",
].sort((left, right) => right.length - left.length);

function getDisplayQuantity(item: ExtractedPartListItem) {
  return String(item.quantity ?? inferQuantityFromRawText(item.rawText) ?? 1);
}

function getDisplayPartNumber(item: ExtractedPartListItem) {
  return (
    item.catalogPart?.partNumber ??
    item.partNumber ??
    item.ocrPartNumber ??
    inferPartNumberFromRawText(item.rawText) ??
    "Unknown part"
  );
}

function getDisplayColorName(item: ExtractedPartListItem) {
  return (
    item.colorName ??
    item.ocrColorName ??
    inferColorNameFromRawText(item.rawText) ??
    "Unknown colour"
  );
}

function getDisplayPartName(
  item: ExtractedPartListItem,
  partNumber: string,
  colorName: string,
) {
  return (
    item.catalogPart?.name ??
    item.description ??
    inferPartNameFromRawText(item.rawText, partNumber, colorName) ??
    partNumber
  );
}

function inferQuantityFromRawText(rawText: string) {
  const quantityMatch =
    rawText.match(/\bqty(?:uantity)?\.?\s*[:#-]?\s*(\d{1,4})\b/i) ??
    rawText.match(/\b(\d{1,4})\s*x\b/i) ??
    rawText.match(/^\s*(\d{1,4})\b/);

  if (!quantityMatch?.[1]) {
    return null;
  }

  const quantity = Number.parseInt(quantityMatch[1], 10);

  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function inferPartNumberFromRawText(rawText: string) {
  const partNumberMatch = rawText.match(
    /\b(?:\d{4,7}(?:[a-z][a-z0-9]*)?|\d{3}[a-z][a-z0-9]*)\b/i,
  );

  return partNumberMatch?.[0]?.toLowerCase() ?? null;
}

function inferColorNameFromRawText(rawText: string) {
  const normalizedRawText = normalizeColorText(rawText);

  return (
    inferredColorNames.find((colorName) =>
      normalizedRawText.includes(normalizeColorText(colorName)),
    ) ?? null
  );
}

function inferPartNameFromRawText(
  rawText: string,
  partNumber: string,
  colorName: string,
) {
  let partName = rawText
    .replace(/\bqty(?:uantity)?\.?\s*[:#-]?\s*/i, "")
    .replace(/^\s*\d{1,4}\s*x?\s*/i, " ");

  if (partNumber !== "Unknown part") {
    partName = partName.replace(new RegExp(`\\b${escapeRegExp(partNumber)}\\b`, "i"), " ");
  }

  if (colorName !== "Unknown colour") {
    partName = partName.replace(
      new RegExp(`\\b${escapeRegExp(colorName).replace(/\\ /g, "[ -]+")}\\b`, "i"),
      " ",
    );
  }

  const normalizedPartName = partName.replace(/\s+/g, " ").trim();

  return normalizedPartName || null;
}

function normalizeColorText(value: string) {
  return value.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function TableCell({ children }: { children: ReactNode }) {
  return (
    <Box
      as="td"
      borderBottomWidth="1px"
      borderColor="gray.100"
      color="gray.800"
      fontSize="sm"
      px="3"
      py="2"
      verticalAlign="middle"
    >
      {children}
    </Box>
  );
}

function getPartImageUrl(
  item: ExtractedPartListItem,
  partNumber: string,
  colorName: string,
) {
  const imageUrl =
    partNumber !== "Unknown part"
      ? `/api/catalog/part-image?partNumber=${encodeURIComponent(partNumber)}&source=rebrickable-cache-v1`
      : (item.catalogPart?.partImageUrl ?? null);
  const colorId =
    item.rebrickableColorId?.trim() ?? getKnownRebrickableColorId(colorName);

  if (!imageUrl) {
    return null;
  }

  if (
    colorId &&
    imageUrl.startsWith("/api/catalog/part-image") &&
    !imageUrl.includes("colorId=")
  ) {
    const separator = imageUrl.includes("?") ? "&" : "?";

    return `${imageUrl}${separator}colorId=${encodeURIComponent(colorId)}`;
  }

  return imageUrl;
}

const knownRebrickableColorIdsByName = new Map([
  ["black", "0"],
  ["blue", "1"],
  ["green", "2"],
  ["red", "4"],
  ["yellow", "14"],
  ["white", "15"],
  ["tan", "19"],
  ["orange", "25"],
  ["dark tan", "28"],
  ["transparent", "47"],
  ["trans clear", "47"],
  ["trans-clear", "47"],
  ["reddish brown", "70"],
  ["light bluish gray", "71"],
  ["light bluish grey", "71"],
  ["dark bluish gray", "72"],
  ["dark bluish grey", "72"],
  ["flat silver", "179"],
]);

function getKnownRebrickableColorId(colorName: string) {
  return knownRebrickableColorIdsByName.get(normalizeColorNameForImage(colorName));
}

function normalizeColorNameForImage(colorName: string) {
  return colorName
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatByteSize(byteLength: number) {
  if (byteLength < 1024) {
    return `${byteLength} B`;
  }

  if (byteLength < 1024 * 1024) {
    return `${(byteLength / 1024).toFixed(1)} KB`;
  }

  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRowCount(rowCount: number) {
  return `${rowCount} ${rowCount === 1 ? "row" : "rows"}`;
}

function formatOcrProgress(progress: PdfOcrProgress) {
  const pageStatus =
    progress.pageNumber !== null && progress.pageCount !== null
      ? `Page ${progress.pageNumber} of ${progress.pageCount}`
      : "Preparing";
  const percent =
    typeof progress.progress === "number"
      ? `, ${Math.round(progress.progress * 100)}%`
      : "";

  return `${pageStatus}: ${progress.message}${percent}`;
}

function getProgressValue(
  analysisState: AnalysisState,
  progress: PdfOcrProgress | null,
) {
  if (analysisState === "complete") {
    return 100;
  }

  if (analysisState === "failed") {
    return progress?.progress ? Math.round(progress.progress * 100) : 100;
  }

  if (typeof progress?.progress === "number") {
    return Math.min(99, Math.max(5, Math.round(progress.progress * 100)));
  }

  return 12;
}

function countInventoryRowsWithCatalog(items: RebrickableInventoryItem[]) {
  return items.filter((item) => item.catalogPart).length;
}

function collectDistinctPartNumbers(items: RebrickableInventoryItem[]) {
  return [...new Set(items.map((item) => item.partNumber))].sort();
}

function buildCatalogWarnings(result: RebrickableCatalogFetchResult) {
  const warnings = result.warnings.filter(
    (warning) => !isGeneratedCatalogCacheFallbackWarning(warning),
  );

  if (result.missingPartNumbers.length > 0) {
    warnings.push(
      `${result.missingPartNumbers.length} CSV parts were not returned by Rebrickable catalog lookup.`,
    );
  }

  return warnings;
}

function isGeneratedCatalogCacheFallbackWarning(warning: string) {
  return /using generated catalog cache/i.test(warning);
}

function formatColorRgb(colorRgb: string) {
  const normalizedColorRgb = colorRgb.trim().replace(/^#/, "");

  if (/^[0-9a-f]{6}$/i.test(normalizedColorRgb)) {
    return `#${normalizedColorRgb}`;
  }

  return null;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Could not load the selected PDF.";
}
