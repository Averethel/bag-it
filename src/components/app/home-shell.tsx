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
import { useMemo, useState, type ChangeEvent } from "react";

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
type WorkflowStageStatus = "current" | "ready" | "blocked";

type StageView = {
  status: WorkflowStageStatus;
  statusLabel: string;
  summary: string;
  detail: string;
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

function selectedFileName(event: ChangeEvent<HTMLInputElement>) {
  return event.target.files?.[0]?.name ?? null;
}

function buildStageView(
  stage: WorkflowStage,
  activeStage: WorkflowStageId,
  manualFileName: string | null,
): StageView {
  if (stage.id === "intake") {
    const status = activeStage === stage.id ? "current" : "ready";

    return {
      status,
      statusLabel: manualFileName
        ? "PDF selected"
        : status === "current"
          ? "Current"
          : "Ready",
      summary: manualFileName
        ? `${manualFileName} is selected for this browser session.`
        : "No manual selected.",
      detail:
        "Manual bytes, rendered pages, and page crops stay in memory for the active session only.",
    };
  }

  return {
    status: activeStage === stage.id ? "current" : "blocked",
    statusLabel: activeStage === stage.id ? "Blocked" : "Not ready",
    summary: downstreamStageSummaries[stage.id],
    detail: blockedStageDetails[stage.id],
  };
}

function statusColor(status: WorkflowStageStatus) {
  if (status === "current") {
    return "blue";
  }

  if (status === "ready") {
    return "green";
  }

  return "gray";
}

type WorkflowPanelProps = {
  stage: WorkflowStage;
  view: StageView;
  manualFileName: string | null;
  onManualChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function WorkflowPanel({
  stage,
  view,
  manualFileName,
  onManualChange,
}: WorkflowPanelProps) {
  const isIntake = stage.id === "intake";

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
              onChange={onManualChange}
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
                  {manualFileName ?? "No PDF selected"}
                </Text>
              </Stack>
            </Box>
          </Stack>
        ) : (
          <Box borderTopWidth="1px" borderColor="gray.200" pt="6">
            <Stack gap="2">
              <Text color="gray.900" fontWeight="semibold">
                Blocked state
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

export function HomeShell() {
  const [activeStage, setActiveStage] = useState<WorkflowStageId>("intake");
  const [manualFileName, setManualFileName] = useState<string | null>(null);

  const activeWorkflowStage = useMemo(
    () => workflowStages.find((stage) => stage.id === activeStage) ?? workflowStages[0],
    [activeStage],
  );
  const activeStageView = buildStageView(
    activeWorkflowStage,
    activeStage,
    manualFileName,
  );

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
                  const view = buildStageView(stage, activeStage, manualFileName);
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
            manualFileName={manualFileName}
            onManualChange={(event) => setManualFileName(selectedFileName(event))}
            stage={activeWorkflowStage}
            view={activeStageView}
          />
        </Grid>
      </Container>
    </Box>
  );
}
