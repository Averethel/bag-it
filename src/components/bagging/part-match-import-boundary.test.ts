import { readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_STEP_CALLOUT_DETECTOR_VERSION,
  DEFAULT_STEP_PART_COLOR_CALIBRATION_VERSION,
  DEFAULT_STEP_PART_EXTRACTOR_VERSION,
} from "./detector-client-boundary"
import {
  STEP_CALLOUT_DETECTOR_V2_VERSION,
  STEP_PART_COLOR_CALIBRATION_V2_VERSION,
  STEP_PART_EXTRACTOR_V2_VERSION,
} from "@/features/steps/v2/browser-step-detector-adapter"

const INITIAL_UI_MODULES = [
  "src/components/bagging/bagging-app.tsx",
  "src/components/bagging/bagging-app-layout.tsx",
  "src/components/bagging/detector-client-boundary.ts",
  "src/components/bagging/bags-checklist-panel.tsx",
  "src/components/bagging/output-tabs.tsx",
  "src/components/bagging/part-match-group-progress.ts",
  "src/components/bagging/part-match-precompute-runtime.ts",
  "src/components/bagging/use-preview-generation.ts",
  "src/components/bagging/use-precomputed-part-match-groups.ts",
  "src/components/bagging/use-step-analysis-job.ts",
] as const

const BLOCKED_RUNTIME_SCORER_IMPORTS = new Set([
  "@bag-it/part-matching",
  "./cnn-part-pair-scorer",
  "./part-match-group-runner",
  "./part-match-suggested-scorer",
])

const BLOCKED_INITIAL_ANALYSIS_RUNTIME_IMPORTS = new Set([
  "@/features/pdf/browser-pdf-parser",
  "@/features/steps/v2/browser-step-detector-adapter",
  "@/features/steps/v2/runtime-preview-assets",
])

type ImportReference = {
  line: number
  modulePath: string
  sourcePath: string
}

describe("part match import boundaries", () => {
  it("keeps scorer runtime imports out of initial UI modules", () => {
    const violations = INITIAL_UI_MODULES.flatMap((sourcePath) =>
      readStaticRuntimeImports(sourcePath)
        .filter(({ modulePath }) => BLOCKED_RUNTIME_SCORER_IMPORTS.has(modulePath))
    )

    expect(violations).toEqual([])
  })

  it("loads the group runner through a lazy boundary", () => {
    const dynamicImports = readDynamicImports("src/components/bagging/part-match-precompute-runtime.ts")
      .filter(({ modulePath }) => modulePath === "./part-match-group-runner")

    expect(dynamicImports).toHaveLength(1)
  })

  it("keeps detector and PDF runtime imports out of initial UI modules", () => {
    const violations = INITIAL_UI_MODULES.flatMap((sourcePath) =>
      readStaticRuntimeImports(sourcePath)
        .filter(({ modulePath }) => BLOCKED_INITIAL_ANALYSIS_RUNTIME_IMPORTS.has(modulePath))
    )

    expect(violations).toEqual([])
  })

  it("loads detector and PDF runtime through lazy defaults", () => {
    const dynamicModulePaths = new Set(
      readDynamicImports("src/components/bagging/detector-client-boundary.ts")
        .map(({ modulePath }) => modulePath),
    )

    expect(dynamicModulePaths.has("@/features/pdf/browser-pdf-parser")).toBe(true)
    expect(dynamicModulePaths.has("@/features/steps/v2/browser-step-detector-adapter")).toBe(true)
    expect(dynamicModulePaths.has("@/features/steps/v2/runtime-preview-assets")).toBe(true)
  })

  it("keeps lazy default detector versions aligned with the runtime adapter", () => {
    expect(DEFAULT_STEP_CALLOUT_DETECTOR_VERSION).toBe(STEP_CALLOUT_DETECTOR_V2_VERSION)
    expect(DEFAULT_STEP_PART_COLOR_CALIBRATION_VERSION).toBe(STEP_PART_COLOR_CALIBRATION_V2_VERSION)
    expect(DEFAULT_STEP_PART_EXTRACTOR_VERSION).toBe(STEP_PART_EXTRACTOR_V2_VERSION)
  })
})

function readStaticRuntimeImports(sourcePath: string): ImportReference[] {
  const sourceFile = readSourceFile(sourcePath)
  const imports: ImportReference[] = []

  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) {
      return
    }

    if (!isRuntimeImport(node)) {
      return
    }

    imports.push({
      line: lineNumberFor(sourceFile, node),
      modulePath: node.moduleSpecifier.text,
      sourcePath,
    })
  })

  return imports
}

function readDynamicImports(sourcePath: string): ImportReference[] {
  const sourceFile = readSourceFile(sourcePath)
  const imports: ImportReference[] = []

  visit(sourceFile, (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({
        line: lineNumberFor(sourceFile, node),
        modulePath: node.arguments[0].text,
        sourcePath,
      })
    }
  })

  return imports
}

function readSourceFile(sourcePath: string): ts.SourceFile {
  const absolutePath = path.join(process.cwd(), sourcePath)
  const source = readFileSync(absolutePath, "utf8")

  return ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function isRuntimeImport(node: ts.ImportDeclaration): boolean {
  const importClause = node.importClause

  if (!importClause || importClause.isTypeOnly) {
    return Boolean(!importClause)
  }

  if (importClause.name) {
    return true
  }

  const namedBindings = importClause.namedBindings
  if (!namedBindings || ts.isNamespaceImport(namedBindings)) {
    return true
  }

  return namedBindings.elements.some((element) => !element.isTypeOnly)
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node)
  ts.forEachChild(node, (child) => visit(child, callback))
}

function lineNumberFor(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}
