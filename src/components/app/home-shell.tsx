"use client";

import {
  Badge,
  Box,
  Button,
  Container,
  Grid,
  Heading,
  HStack,
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
  PartListValidationSummary,
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

const workflowStages = [
  {
    id: "intake",
    label: "Intake",
    title: "Select manual PDF",
    eyebrow: "Manual intake",
  },
  {
    id: "analysis",
    label: "Analysis",
    title: "Analyze manual locally",
    eyebrow: "Page processing",
  },
  {
    id: "inventory-review",
    label: "Inventory",
    title: "Review extracted inventory",
    eyebrow: "Parts list",
  },
  {
    id: "catalog-matching",
    label: "Catalog",
    title: "Match Rebrickable catalog data",
    eyebrow: "Part metadata",
  },
  {
    id: "csv-validation",
    label: "CSV check",
    title: "Compare optional Rebrickable CSV",
    eyebrow: "Validation",
  },
  {
    id: "step-review",
    label: "Steps",
    title: "Review build-step callouts",
    eyebrow: "Instructions",
  },
  {
    id: "bag-generation",
    label: "Generate",
    title: "Generate build bags",
    eyebrow: "Bag allocation",
  },
  {
    id: "bag-review",
    label: "Bag review",
    title: "Review bag split",
    eyebrow: "Packing plan",
  },
  {
    id: "export",
    label: "Export",
    title: "Export bag lists",
    eyebrow: "Output",
  },
] as const;

type WorkflowStage = (typeof workflowStages)[number];
type WorkflowStageId = WorkflowStage["id"];
type WorkflowStageStatus = "ready" | "blocked";

type StageView = {
  status: WorkflowStageStatus;
  statusLabel: string;
  summary: string;
  detail: string;
};

type StorageState = "loading" | "ready" | "saving" | "saved" | "unavailable";
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

const blockedStageDetails: Record<Exclude<WorkflowStageId, "intake">, string> = {
  analysis: "Waiting for an active PDF session.",
  "inventory-review": "Waiting for classified parts-list pages.",
  "catalog-matching": "Waiting for reviewed inventory rows.",
  "csv-validation": "Waiting for catalog-normalized inventory.",
  "step-review": "Waiting for detected instruction pages.",
  "bag-generation": "Waiting for reconciled step callouts.",
  "bag-review": "Waiting for generated bag boundaries.",
  export: "Waiting for reviewed bag lists.",
};

const downstreamStageSummaries: Record<Exclude<WorkflowStageId, "intake">, string> = {
  analysis: "No local page analysis has run.",
  "inventory-review": "No extracted inventory rows.",
  "catalog-matching": "No Rebrickable catalog matches.",
  "csv-validation": "No optional CSV validation report.",
  "step-review": "No detected step ranges or callouts.",
  "bag-generation": "No generated 40 to 60 piece bag ranges.",
  "bag-review": "No bag boundaries to review.",
  export: "No per-bag output to export.",
};

function stageNumber(stage: WorkflowStage) {
  return String(workflowStages.indexOf(stage) + 1).padStart(2, "0");
}

function buildStageView(
  stage: WorkflowStage,
  activeStage: WorkflowStageId,
  pdfSession: PdfSession | null,
  csvInventory: CsvInventoryState | null,
  analysisState: AnalysisState,
  partListExtraction: PartListExtractionResult | null,
): StageView {
  const manualFileName = pdfSession?.metadata.fileName ?? null;

  if (stage.id === "intake") {
    return {
      status: "ready",
      statusLabel: manualFileName ? "PDF selected" : "Ready",
      summary: manualFileName
        ? `${manualFileName} is selected for this browser session.`
        : "No manual selected.",
      detail:
        "Manual bytes, rendered pages, page crops, and raw OCR stay in memory for the active session only.",
    };
  }

  if (stage.id === "analysis" && pdfSession) {
    if (analysisState === "running") {
      return {
        status: "ready",
        statusLabel: "Running",
        summary: `${pdfSession.metadata.fileName} is being analyzed locally.`,
        detail: "Rendered pages and OCR output remain in memory only.",
      };
    }

    if (partListExtraction) {
      return {
        status: "ready",
        statusLabel: "Complete",
        summary: `${partListExtraction.items.length} candidate part rows were extracted.`,
        detail: "Validated rows can move forward without manual correction.",
      };
    }

    return {
      status: "ready",
      statusLabel: "Ready",
      summary: `${pdfSession.metadata.fileName} is ready for local analysis.`,
      detail: csvInventory
        ? `${csvInventory.items.length} CSV rows will be used as validation candidates.`
        : "Page rendering and OCR have not run yet. Rebrickable catalog validation will run without a CSV.",
    };
  }

  if (stage.id === "inventory-review" && partListExtraction) {
    return {
      status: "ready",
      statusLabel: "Ready",
      summary: `${partListExtraction.items.length} candidate part rows are available in PDF read order.`,
      detail: "Only unresolved quantity, part, or color fields should block automation.",
    };
  }

  return {
    status: "blocked",
    statusLabel: activeStage === stage.id ? "Blocked" : "Not ready",
    summary: downstreamStageSummaries[stage.id],
    detail: blockedStageDetails[stage.id],
  };
}

function statusColor(status: WorkflowStageStatus) {
  if (status === "ready") {
    return "green";
  }

  return "gray";
}

type WorkflowPanelProps = {
  stage: WorkflowStage;
  view: StageView;
  csvError: string | null;
  csvInputRef: RefObject<HTMLInputElement | null>;
  csvInventory: CsvInventoryState | null;
  pdfSession: PdfSession | null;
  projectData: LocalProjectData | null;
  intakeError: string | null;
  isLoadingPdf: boolean;
  storageState: StorageState;
  analysisError: string | null;
  analysisProgress: PdfOcrProgress | null;
  analysisState: AnalysisState;
  partListExtraction: PartListExtractionResult | null;
  manualInputRef: RefObject<HTMLInputElement | null>;
  onAnalyzeManual: () => void;
  onClearCsv: () => void;
  onManualChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCsvChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearManual: () => void;
};

function WorkflowPanel({
  stage,
  view,
  csvError,
  csvInputRef,
  csvInventory,
  pdfSession,
  projectData,
  intakeError,
  isLoadingPdf,
  storageState,
  analysisError,
  analysisProgress,
  analysisState,
  partListExtraction,
  manualInputRef,
  onAnalyzeManual,
  onClearCsv,
  onManualChange,
  onCsvChange,
  onClearManual,
}: WorkflowPanelProps) {
  const isIntake = stage.id === "intake";
  const isAnalysis = stage.id === "analysis";
  const isInventoryReview = stage.id === "inventory-review";
  const manualFileName = pdfSession?.metadata.fileName ?? null;

  return (
    <Box
      as="section"
      aria-labelledby="workflow-panel-title"
      borderWidth="1px"
      borderColor="gray.200"
      bg="white"
      borderRadius="md"
      minH="460px"
      p={{ base: "5", md: "8" }}
    >
      <Stack gap="7">
        <Stack gap="3">
          <HStack gap="3" wrap="wrap">
            <Badge colorPalette={statusColor(view.status)} variant="subtle">
              {view.statusLabel}
            </Badge>
            <Text color="gray.500" fontSize="sm" fontWeight="medium">
              {stage.eyebrow}
            </Text>
          </HStack>

          <Stack gap="2">
            <Heading id="workflow-panel-title" as="h1" size="2xl">
              {stage.title}
            </Heading>
            <Text color="gray.700" fontSize="md" maxW="3xl">
              {view.summary}
            </Text>
          </Stack>
        </Stack>

        {isIntake ? (
          <Stack gap="5" maxW="xl">
            <Input
              aria-label="Manual PDF"
              accept="application/pdf"
              bg="white"
              borderColor="gray.300"
              data-testid="manual-pdf-input"
              disabled={isLoadingPdf}
              onChange={onManualChange}
              ref={manualInputRef}
              type="file"
            />
            <Input
              aria-label="Rebrickable parts CSV"
              accept=".csv,text/csv"
              bg="white"
              borderColor="gray.300"
              data-testid="parts-csv-input"
              onChange={onCsvChange}
              ref={csvInputRef}
              type="file"
            />
            <Box
              borderWidth="1px"
              borderColor="gray.200"
              bg="gray.50"
              borderRadius="md"
              p="4"
            >
              <Stack gap="1">
                <Text color="gray.600" fontSize="sm" fontWeight="medium">
                  Active manual
                </Text>
                <Text color="gray.900" fontSize="md">
                  {manualFileName ?? "No active PDF"}
                </Text>
                {pdfSession ? (
                  <Text color="gray.600" fontSize="sm">
                    {formatByteSize(pdfSession.metadata.byteLength)} loaded in memory
                    for this session.
                  </Text>
                ) : null}
              </Stack>
            </Box>
            <Box
              borderWidth="1px"
              borderColor="gray.200"
              bg="gray.50"
              borderRadius="md"
              p="4"
            >
              <Stack gap="1">
                <Text color="gray.600" fontSize="sm" fontWeight="medium">
                  Rebrickable CSV validation
                </Text>
                <Text color="gray.900" fontSize="md">
                  {csvInventory
                    ? `${csvInventory.fileName} (${csvInventory.items.length} rows)`
                    : "No CSV loaded"}
                </Text>
                <Text color="gray.600" fontSize="sm">
                  CSV rows validate OCR output but do not create inventory rows.
                </Text>
                {csvInventory ? (
                  <Text
                    color={
                      csvInventory.catalogStatus === "failed"
                        ? "orange.700"
                        : "gray.600"
                    }
                    fontSize="sm"
                  >
                    {formatCsvCatalogStatus(csvInventory)}
                  </Text>
                ) : null}
                {csvInventory?.warnings.map((warning) => (
                  <Text color="orange.700" fontSize="sm" key={warning}>
                    {warning}
                  </Text>
                ))}
                {csvInventory?.catalogWarnings.map((warning) => (
                  <Text color="orange.700" fontSize="sm" key={warning}>
                    {warning}
                  </Text>
                ))}
              </Stack>
            </Box>
            {intakeError ? (
              <Text color="red.700" fontSize="sm" role="alert">
                {intakeError}
              </Text>
            ) : null}
            {csvError ? (
              <Text color="red.700" fontSize="sm" role="alert">
                {csvError}
              </Text>
            ) : null}
            <HStack gap="3" wrap="wrap">
              <Button
                colorPalette="gray"
                disabled={!pdfSession || isLoadingPdf}
                onClick={onClearManual}
                variant="outline"
              >
                Clear PDF
              </Button>
              <Button
                colorPalette="gray"
                disabled={!csvInventory}
                onClick={onClearCsv}
                variant="outline"
              >
                Clear CSV
              </Button>
              <Text color="gray.600" fontSize="sm">
                {storageStatusLabel(storageState)}
              </Text>
            </HStack>
            <Box
              borderWidth="1px"
              borderColor="gray.200"
              bg="gray.50"
              borderRadius="md"
              p="4"
            >
              <Stack gap="1">
                <Text color="gray.600" fontSize="sm" fontWeight="medium">
                  Local project data
                </Text>
                <Text color="gray.900" fontSize="md">
                  {projectData?.manual?.fileName ?? "No saved manual metadata"}
                </Text>
                <Text color="gray.600" fontSize="sm">
                  {projectData?.manual
                    ? "Original PDF name and size are saved as metadata only."
                    : "No derived project data saved yet."}
                </Text>
              </Stack>
            </Box>
          </Stack>
        ) : isAnalysis && pdfSession ? (
          <AnalysisPanel
            analysisError={analysisError}
            analysisProgress={analysisProgress}
            analysisState={analysisState}
            onAnalyzeManual={onAnalyzeManual}
            partListExtraction={partListExtraction}
            pdfSession={pdfSession}
            isCatalogLoading={csvInventory?.catalogStatus === "loading"}
            csvInventory={csvInventory}
          />
        ) : isInventoryReview && partListExtraction ? (
          <PartListOutput result={partListExtraction} />
        ) : (
          <Box borderTopWidth="1px" borderColor="gray.200" pt="6">
            <Stack gap="2">
              <Text color="gray.900" fontWeight="semibold">
                {view.status === "ready" ? "Ready state" : "Blocked state"}
              </Text>
              <Text color="gray.700">{view.detail}</Text>
            </Stack>
          </Box>
        )}

        {isIntake ? (
          <Box borderTopWidth="1px" borderColor="gray.200" pt="5">
            <Text color="gray.600" fontSize="sm">
              {view.detail}
            </Text>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}

type AnalysisPanelProps = {
  analysisError: string | null;
  analysisProgress: PdfOcrProgress | null;
  analysisState: AnalysisState;
  csvInventory: CsvInventoryState | null;
  isCatalogLoading: boolean;
  onAnalyzeManual: () => void;
  partListExtraction: PartListExtractionResult | null;
  pdfSession: PdfSession | null;
};

function AnalysisPanel({
  analysisError,
  analysisProgress,
  analysisState,
  csvInventory,
  isCatalogLoading,
  onAnalyzeManual,
  partListExtraction,
  pdfSession,
}: AnalysisPanelProps) {
  const isRunning = analysisState === "running";

  return (
    <Box borderTopWidth="1px" borderColor="gray.200" pt="6">
      <Stack gap="5" maxW="3xl">
        <HStack gap="3" wrap="wrap">
          <Button
            colorPalette="blue"
            disabled={!pdfSession || isRunning || isCatalogLoading}
            loading={isRunning}
            onClick={onAnalyzeManual}
          >
            Run OCR
          </Button>
          <Text color="gray.600" fontSize="sm">
            {analysisProgress?.message ?? "No analysis has run."}
          </Text>
        </HStack>
        <Text color="gray.600" fontSize="sm">
          {csvInventory
            ? `${csvInventory.items.length} CSV rows will validate the manual OCR result. ${formatCsvCatalogStatus(csvInventory)}`
            : "No CSV loaded; OCR part numbers will be checked against the Rebrickable catalog."}
        </Text>

        {analysisProgress ? (
          <Box
            borderWidth="1px"
            borderColor="gray.200"
            bg="gray.50"
            borderRadius="md"
            p="4"
          >
            <Stack gap="1">
              <Text color="gray.600" fontSize="sm" fontWeight="medium">
                OCR progress
              </Text>
              <Text color="gray.900" fontSize="md">
                {formatOcrProgress(analysisProgress)}
              </Text>
            </Stack>
          </Box>
        ) : null}

        {analysisError ? (
          <Text color="red.700" fontSize="sm" role="alert">
            {analysisError}
          </Text>
        ) : null}

        {partListExtraction ? (
          <PartListSummary result={partListExtraction} />
        ) : null}
      </Stack>
    </Box>
  );
}

function PartListSummary({ result }: { result: PartListExtractionResult }) {
  return (
    <Box
      borderWidth="1px"
      borderColor="gray.200"
      bg="gray.50"
      borderRadius="md"
      p="4"
    >
      <Stack gap="2">
        <Text color="gray.600" fontSize="sm" fontWeight="medium">
          First-pass part list
        </Text>
        <Text color="gray.900">
          {result.items.length} rows from pages{" "}
          {formatPageList(result.selectedPageNumbers)}.
        </Text>
        {result.validationSummary ? (
          <Text color="gray.700" fontSize="sm">
            {formatValidationSummary(result.validationSummary)}
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}

function PartListOutput({ result }: { result: PartListExtractionResult }) {
  return (
    <Stack gap="5">
      <HStack gap="3" wrap="wrap">
        <Badge colorPalette="blue" variant="subtle">
          {result.items.length} rows
        </Badge>
        <Badge colorPalette="gray" variant="subtle">
          {result.pagesAnalyzed} pages analyzed
        </Badge>
        <Badge colorPalette="green" variant="subtle">
          Pages {formatPageList(result.selectedPageNumbers)}
        </Badge>
        {result.validationSummary ? (
          <Badge colorPalette="purple" variant="subtle">
            {result.validationSummary.exactMatches +
              result.validationSummary.aliasMatches}{" "}
            {result.validationSummary.source === "csv"
              ? "CSV matches"
              : "catalog matches"}
          </Badge>
        ) : null}
      </HStack>
      {result.validationSummary ? (
        <Text color="gray.700" fontSize="sm">
          {formatValidationDetail(result.validationSummary)}
        </Text>
      ) : null}

      {result.warnings.map((warning) => (
        <Text color="orange.700" fontSize="sm" key={warning}>
          {warning}
        </Text>
      ))}

      {result.items.length > 0 ? (
        <Box
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          overflowX="auto"
        >
          <Box
            as="table"
            borderCollapse="collapse"
            minW="900px"
            w="full"
          >
            <Box as="thead" bg="gray.50">
              <Box as="tr">
                {[
                  "#",
                  "Page",
                  "Qty",
                  "Part",
                  "Color",
                  "Description",
                  "Confidence",
                  "Validation",
                  "OCR row",
                ].map((heading) => (
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
                ))}
              </Box>
            </Box>
            <Box as="tbody">
              {result.items.map((item) => (
                <PartListOutputRow item={item} key={item.id} />
              ))}
            </Box>
          </Box>
        </Box>
      ) : (
        <Text color="gray.700">No candidate part rows were extracted.</Text>
      )}
    </Stack>
  );
}

function PartListOutputRow({ item }: { item: ExtractedPartListItem }) {
  return (
    <Box as="tr">
      <TableCell>{item.sequence}</TableCell>
      <TableCell>{item.pageNumber}</TableCell>
      <TableCell>{item.quantity ?? "Review"}</TableCell>
      <TableCell>
        <Stack gap="1">
          <Text>{item.partNumber ?? "Review"}</Text>
          {item.ocrPartNumber ? (
            <Text color="gray.600" fontSize="xs">
              OCR: {item.ocrPartNumber}
            </Text>
          ) : null}
        </Stack>
      </TableCell>
      <TableCell>
        <Stack gap="1">
          <Text>{item.colorName ?? "Review"}</Text>
          {item.ocrColorName ? (
            <Text color="gray.600" fontSize="xs">
              OCR: {item.ocrColorName}
            </Text>
          ) : null}
        </Stack>
      </TableCell>
      <TableCell>{item.description ?? "—"}</TableCell>
      <TableCell>{formatConfidence(item.confidence)}</TableCell>
      <TableCell>{formatValidationStatus(item.validationStatus)}</TableCell>
      <TableCell>
        <Stack gap="1">
          <Text color="gray.800" fontSize="sm">
            {item.rawText}
          </Text>
          {item.notes.length > 0 ? (
            <Text color="orange.700" fontSize="xs">
              {item.notes.join(" ")}
            </Text>
          ) : null}
        </Stack>
      </TableCell>
    </Box>
  );
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
      verticalAlign="top"
    >
      {children}
    </Box>
  );
}

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
  const [activeStage, setActiveStage] = useState<WorkflowStageId>("intake");
  const [pdfSession, setPdfSession] = useState<PdfSession | null>(null);
  const [projectData, setProjectData] = useState<LocalProjectData | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [storageState, setStorageState] = useState<StorageState>("loading");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisProgress, setAnalysisProgress] = useState<PdfOcrProgress | null>(
    null,
  );
  const [analysisError, setAnalysisError] = useState<string | null>(null);
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
        setStorageState("ready");
      })
      .catch(() => {
        if (isMounted) {
          setStorageState("unavailable");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [localProjectStore]);

  const activeWorkflowStage = useMemo(
    () => workflowStages.find((stage) => stage.id === activeStage) ?? workflowStages[0],
    [activeStage],
  );
  const activeStageView = buildStageView(
    activeWorkflowStage,
    activeStage,
    pdfSession,
    csvInventory,
    analysisState,
    partListExtraction,
  );

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

  async function handleManualChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

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
    setStorageState("saving");

    try {
      await localProjectStore.save(nextProjectData);

      if (fileSelectionId.current === currentSelectionId) {
        setStorageState("saved");
      }
    } catch {
      if (fileSelectionId.current === currentSelectionId) {
        setStorageState("unavailable");
      }
    } finally {
      if (fileSelectionId.current === currentSelectionId) {
        setIsLoadingPdf(false);
      }
    }
  }

  async function handleCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

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
          parseResult.items.map((item) => item.partNumber),
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
      setActiveStage("inventory-review");
    } catch (error) {
      if (fileSelectionId.current !== currentSelectionId) {
        return;
      }

      setAnalysisError(toErrorMessage(error));
      setAnalysisState("failed");
    }
  }

  return (
    <Box as="main" minH="100vh" bg="gray.50">
      <Container maxW="7xl" py={{ base: "6", md: "10" }}>
        <Grid gap="6" templateColumns={{ base: "1fr", lg: "320px 1fr" }}>
          <Box
            as="nav"
            aria-label="Manual processing workflow"
            borderWidth="1px"
            borderColor="gray.200"
            bg="white"
            borderRadius="md"
            p="4"
          >
            <Stack gap="3">
              <Stack gap="1" px="2">
                <Text color="gray.500" fontSize="xs" fontWeight="bold">
                  Bag It
                </Text>
                <Heading as="h2" size="md">
                  Workflow
                </Heading>
              </Stack>

              <Stack gap="2">
                {workflowStages.map((stage) => {
                  const view = buildStageView(
                    stage,
                    activeStage,
                    pdfSession,
                    csvInventory,
                    analysisState,
                    partListExtraction,
                  );
                  const isActive = stage.id === activeStage;

                  return (
                    <Button
                      aria-current={isActive ? "step" : undefined}
                      colorPalette="blue"
                      h="auto"
                      justifyContent="flex-start"
                      key={stage.id}
                      onClick={() => setActiveStage(stage.id)}
                      px="3"
                      py="3"
                      variant={isActive ? "solid" : "ghost"}
                    >
                      <HStack gap="3" w="full" justify="space-between">
                        <HStack gap="3">
                          <Text as="span" color={isActive ? "white" : "gray.500"}>
                            {stageNumber(stage)}
                          </Text>
                          <Text as="span">{stage.label}</Text>
                        </HStack>
                        <Badge
                          colorPalette={statusColor(view.status)}
                          variant={isActive ? "solid" : "subtle"}
                        >
                          {view.statusLabel}
                        </Badge>
                      </HStack>
                    </Button>
                  );
                })}
              </Stack>
            </Stack>
          </Box>

          <WorkflowPanel
            csvError={csvError}
            csvInputRef={csvInputRef}
            csvInventory={csvInventory}
            intakeError={intakeError}
            isLoadingPdf={isLoadingPdf}
            analysisError={analysisError}
            analysisProgress={analysisProgress}
            analysisState={analysisState}
            manualInputRef={manualInputRef}
            onAnalyzeManual={handleAnalyzeManual}
            onClearCsv={clearCsvInventory}
            onClearManual={clearPdfSession}
            onCsvChange={handleCsvChange}
            onManualChange={handleManualChange}
            partListExtraction={partListExtraction}
            pdfSession={pdfSession}
            projectData={projectData}
            stage={activeWorkflowStage}
            storageState={storageState}
            view={activeStageView}
          />
        </Grid>
      </Container>
    </Box>
  );
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

function formatOcrProgress(progress: PdfOcrProgress) {
  const pageStatus =
    progress.pageNumber && progress.pageCount
      ? `Page ${progress.pageNumber} of ${progress.pageCount}`
      : "Preparing";
  const percent =
    typeof progress.progress === "number"
      ? `, ${Math.round(progress.progress * 100)}%`
      : "";

  return `${pageStatus}: ${progress.message}${percent}`;
}

function formatPageList(pageNumbers: number[]) {
  if (pageNumbers.length === 0) {
    return "none";
  }

  return pageNumbers.join(", ");
}

function formatConfidence(confidence: number | null) {
  if (confidence === null) {
    return "Unknown";
  }

  return `${Math.round(confidence)}%`;
}

function formatValidationStatus(
  validationStatus: ExtractedPartListItem["validationStatus"],
) {
  if (validationStatus === "catalog-exact-match") {
    return "Catalog exact";
  }

  if (validationStatus === "catalog-alias-match") {
    return "Catalog alias";
  }

  if (validationStatus === "catalog-no-match") {
    return "No catalog match";
  }

  if (validationStatus === "csv-exact-match") {
    return "CSV exact";
  }

  if (validationStatus === "csv-alias-match") {
    return "CSV alias";
  }

  if (validationStatus === "csv-no-match") {
    return "No CSV match";
  }

  return "Not checked";
}

function formatValidationSummary(summary: PartListValidationSummary) {
  const matchedRows = summary.exactMatches + summary.aliasMatches;

  if (summary.source === "catalog") {
    return `Rebrickable catalog validation matched ${matchedRows} rows and suggested ${summary.aliasMatches} aliases.`;
  }

  return `CSV validation matched ${matchedRows} rows and suggested ${summary.aliasMatches} aliases.`;
}

function formatValidationDetail(summary: PartListValidationSummary) {
  if (summary.source === "catalog") {
    return `${summary.unmatchedRows} OCR rows had no Rebrickable catalog match. CSV upload remains optional for stronger color and quantity validation.`;
  }

  return `${summary.unmatchedRows} OCR rows had no CSV match; ${summary.unusedCsvRows} CSV rows were not seen in this manual scan.`;
}

function formatCsvCatalogStatus(csvInventory: CsvInventoryState) {
  if (csvInventory.catalogStatus === "loading") {
    return "Fetching Rebrickable catalog details.";
  }

  if (csvInventory.catalogStatus === "failed") {
    return "Rebrickable catalog details are unavailable; CSV validation will use uploaded rows only.";
  }

  if (csvInventory.catalogStatus === "complete") {
    return `${csvInventory.catalogMatchedRows} CSV rows have Rebrickable catalog details.`;
  }

  return "Rebrickable catalog details have not been requested.";
}

function countInventoryRowsWithCatalog(items: RebrickableInventoryItem[]) {
  return items.filter((item) => item.catalogPart).length;
}

function buildCatalogWarnings(result: RebrickableCatalogFetchResult) {
  const warnings = [...result.warnings];

  if (result.missingPartNumbers.length > 0) {
    warnings.push(
      `${result.missingPartNumbers.length} CSV parts were not returned by Rebrickable catalog lookup.`,
    );
  }

  return warnings;
}

function storageStatusLabel(storageState: StorageState) {
  if (storageState === "loading") {
    return "Loading local data";
  }

  if (storageState === "saving") {
    return "Saving local data";
  }

  if (storageState === "saved") {
    return "Saved locally";
  }

  if (storageState === "unavailable") {
    return "Local storage unavailable";
  }

  return "Local data ready";
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Could not load the selected PDF.";
}
