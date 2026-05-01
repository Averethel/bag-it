import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Provider } from "@/components/ui/provider";

import { HomeShell } from "./home-shell";

function renderHomeShell() {
  return render(
    <Provider>
      <HomeShell />
    </Provider>,
  );
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
    expect(screen.getByText("No PDF selected")).toBeInTheDocument();
  });

  it("records a selected manual name for the active session", () => {
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

    expect(screen.getByText("small-moc.pdf")).toBeInTheDocument();
    expect(
      screen.getByText(
        "small-moc.pdf is selected for this browser session.",
      ),
    ).toBeInTheDocument();
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
