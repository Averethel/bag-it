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
  createPdfSessionFromFile,
  type PdfSession,
} from "@/domain/pdf-session";

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
        "Manual bytes, rendered pages, and page crops stay in memory for the active session only.",
    };
  }

  if (stage.id === "analysis" && pdfSession) {
    return {
      status: "ready",
      statusLabel: "Ready",
      summary: `${pdfSession.metadata.fileName} is ready for local analysis.`,
      detail: "Page rendering and OCR have not run yet.",
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
  pdfSession: PdfSession | null;
  projectData: LocalProjectData | null;
  intakeError: string | null;
  isLoadingPdf: boolean;
  storageState: StorageState;
  manualInputRef: RefObject<HTMLInputElement | null>;
  onManualChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearManual: () => void;
};

function WorkflowPanel({
  stage,
  view,
  pdfSession,
  projectData,
  intakeError,
  isLoadingPdf,
  storageState,
  manualInputRef,
  onManualChange,
  onClearManual,
}: WorkflowPanelProps) {
  const isIntake = stage.id === "intake";
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
            {intakeError ? (
              <Text color="red.700" fontSize="sm" role="alert">
                {intakeError}
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

type HomeShellProps = {
  projectStore?: LocalProjectStore;
};

export function HomeShell({ projectStore }: HomeShellProps = {}) {
  const [activeStage, setActiveStage] = useState<WorkflowStageId>("intake");
  const [pdfSession, setPdfSession] = useState<PdfSession | null>(null);
  const [projectData, setProjectData] = useState<LocalProjectData | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [storageState, setStorageState] = useState<StorageState>("loading");
  const manualInputRef = useRef<HTMLInputElement>(null);
  const fileSelectionId = useRef(0);
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
  );

  function clearManualInput() {
    if (manualInputRef.current) {
      manualInputRef.current.value = "";
    }
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

  function clearPdfSession() {
    fileSelectionId.current += 1;
    setPdfSession(null);
    setIntakeError(null);
    setIsLoadingPdf(false);
    clearManualInput();
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
                  const view = buildStageView(stage, activeStage, pdfSession);
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
            intakeError={intakeError}
            isLoadingPdf={isLoadingPdf}
            manualInputRef={manualInputRef}
            onClearManual={clearPdfSession}
            onManualChange={handleManualChange}
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
