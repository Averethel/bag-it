import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Provider } from "@/components/ui/provider";
import {
  createEmptyLocalProjectData,
  type LocalProjectData,
  type LocalProjectStore,
} from "@/domain/local-project-data";

import { HomeShell } from "./home-shell";

function renderHomeShell(projectStore = createMemoryProjectStore()) {
  return render(
    <Provider>
      <HomeShell projectStore={projectStore} />
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
    expect(screen.getByText("Ready state")).toBeInTheDocument();
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
