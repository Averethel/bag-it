import { describe, expect, it } from "vitest";

import { renderLDrawPartSvg } from "./ldraw-thumbnail";

describe("renderLDrawPartSvg", () => {
  it("renders actual LDraw polygons using the requested part color", async () => {
    const svg = await renderLDrawPartSvg({
      colorHex: "#C91A09",
      partNumberCandidates: ["3001"],
      readLDrawFile: createFixtureReader({
        "3001.dat": [
          "0 Brick 2 x 4",
          "4 16 -20 0 -40 20 0 -40 20 0 40 -20 0 40",
          "4 16 -20 24 -40 -20 0 -40 -20 0 40 -20 24 40",
        ].join("\n"),
      }),
    });

    expect(svg).not.toBeNull();
    expect(svg).toContain("<svg");
    expect(svg).toContain('data-ldraw-part="3001"');
    expect(svg).toContain('data-base-color="#C91A09"');
    expect(svg).toContain("<polygon");
  });

  it("resolves nested subfiles and applies their transforms", async () => {
    const svg = await renderLDrawPartSvg({
      colorHex: "#FFFFFF",
      partNumberCandidates: ["3024"],
      readLDrawFile: createFixtureReader({
        "3024.dat": [
          "0 Plate 1 x 1",
          "1 16 0 -8 0 1 0 0 0 1 0 0 0 1 stud.dat",
          "4 16 -10 0 -10 10 0 -10 10 0 10 -10 0 10",
        ].join("\n"),
        "stud.dat": [
          "0 Stud",
          "4 16 -6 0 -6 6 0 -6 6 0 6 -6 0 6",
          "4 16 -6 -4 -6 -6 0 -6 -6 0 6 -6 -4 6",
        ].join("\n"),
      }),
    });

    expect(svg).not.toBeNull();
    expect(svg?.match(/<polygon/g)).toHaveLength(3);
  });

  it("tries later part candidates when the requested number has no LDraw file", async () => {
    const svg = await renderLDrawPartSvg({
      colorHex: "#6C6E68",
      partNumberCandidates: ["98138pr0048", "98138"],
      readLDrawFile: createFixtureReader({
        "98138.dat": [
          "0 Round tile",
          "4 16 -10 0 -10 10 0 -10 10 0 10 -10 0 10",
        ].join("\n"),
      }),
    });

    expect(svg).not.toBeNull();
    expect(svg).toContain('data-ldraw-part="98138"');
  });
});

function createFixtureReader(files: Record<string, string>) {
  return async (fileName: string) => files[fileName.toLowerCase()] ?? null;
}
