import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Provider } from "@/components/ui/provider";

import { HomeShell } from "./home-shell";

describe("HomeShell", () => {
  it("renders the base app shell", () => {
    render(
      <Provider>
        <HomeShell />
      </Provider>,
    );

    expect(
      screen.getByRole("heading", { name: "Bag It" }),
    ).toBeInTheDocument();
    expect(screen.getByText("App Shell")).toBeInTheDocument();
    expect(screen.getByText("Local First")).toBeInTheDocument();
  });
});
