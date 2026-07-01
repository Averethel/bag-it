import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

export interface BagAnalysisFixtureManifestValidationOptions {
  fixtureDir: string
  isPathIgnored?: (relativeRepoPath: string) => boolean
  manifestPath?: string
}

export function assertValidBagAnalysisFixtureManifest(
  manifest: unknown,
  options: BagAnalysisFixtureManifestValidationOptions,
): void {
  const failures = validateBagAnalysisFixtureManifest(manifest, options)

  if (failures.length > 0) {
    throw new Error([
      `${options.manifestPath ?? "bag-analysis manifest"} is invalid:`,
      ...failures.map((failure) => `- ${failure}`),
    ].join("\n"))
  }
}

export function validateBagAnalysisFixtureManifest(
  manifest: unknown,
  options: BagAnalysisFixtureManifestValidationOptions,
): string[] {
  const failures: string[] = []
  const manifestLabel = options.manifestPath ?? "bag-analysis manifest"

  if (!isRecord(manifest)) {
    return [`${manifestLabel} must be a JSON object`]
  }

  if (typeof manifest.schemaVersion !== "number") {
    failures.push(`${manifestLabel}.schemaVersion must be a number`)
  }

  if (!Array.isArray(manifest.cases)) {
    failures.push(`${manifestLabel}.cases must be an array`)
    return failures
  }

  if (manifest.cases.length === 0) {
    failures.push(`${manifestLabel}.cases must contain at least one fixture`)
  }

  for (const [index, fixtureCase] of manifest.cases.entries()) {
    failures.push(...validateFixtureCase(fixtureCase, index, options))
  }

  return failures
}

function validateFixtureCase(
  fixtureCase: unknown,
  index: number,
  options: BagAnalysisFixtureManifestValidationOptions,
): string[] {
  const failures: string[] = []
  const label = `cases[${index}]`

  if (!isRecord(fixtureCase)) {
    return [`${label} must be an object`]
  }

  const caseLabel = typeof fixtureCase.id === "string" && fixtureCase.id.trim().length > 0
    ? fixtureCase.id
    : label

  expectString(fixtureCase.id, `${caseLabel}.id`, failures)
  expectString(fixtureCase.regressionType, `${caseLabel}.regressionType`, failures)
  expectNumber(fixtureCase.expectedCallouts, `${caseLabel}.expectedCallouts`, failures)
  expectNumber(fixtureCase.expectedPartRows, `${caseLabel}.expectedPartRows`, failures)
  expectNumber(fixtureCase.expectedColorRows, `${caseLabel}.expectedColorRows`, failures)
  expectOptionalNumberArray(fixtureCase.pages, `${caseLabel}.pages`, failures)
  expectOptionalNumberArray(fixtureCase.contextPages, `${caseLabel}.contextPages`, failures)
  expectOptionalPageCountMap(fixtureCase.expectedPageCounts, `${caseLabel}.expectedPageCounts`, failures)

  if (fixtureCase.sourceKind !== "user-approved-manual") {
    failures.push(`${caseLabel}.sourceKind must be user-approved-manual`)
  }

  if (fixtureCase.approvalStatus !== "approved") {
    failures.push(`${caseLabel}.approvalStatus must be approved`)
  }

  validateFixturePath(fixtureCase.inputSessionPath, `${caseLabel}.inputSessionPath`, options, failures)
  validateFixturePath(fixtureCase.calloutsPath, `${caseLabel}.calloutsPath`, options, failures)
  validateFixturePath(fixtureCase.partsPath, `${caseLabel}.partsPath`, options, failures)

  return failures
}

function validateFixturePath(
  fixturePath: unknown,
  label: string,
  options: BagAnalysisFixtureManifestValidationOptions,
  failures: string[],
): void {
  if (typeof fixturePath !== "string" || fixturePath.trim().length === 0) {
    failures.push(`${label} must be a non-empty string`)
    return
  }

  const fixtureDirectory = path.resolve(options.fixtureDir)
  const absolutePath = path.resolve(fixtureDirectory, fixturePath)
  const relativeFixturePath = path.relative(fixtureDirectory, absolutePath)

  if (relativeFixturePath.startsWith("..") || path.isAbsolute(relativeFixturePath)) {
    failures.push(`${label} must stay inside ${options.fixtureDir}`)
    return
  }

  if (!existsSync(absolutePath)) {
    failures.push(`${label} file does not exist: ${fixturePath}`)
    return
  }

  const relativeRepoPath = path.relative(process.cwd(), absolutePath)
  const isIgnored = options.isPathIgnored ?? isIgnoredByGit

  if (isIgnored(relativeRepoPath)) {
    failures.push(`${label} must not be ignored by git: ${fixturePath}`)
  }
}

function expectString(value: unknown, label: string, failures: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    failures.push(`${label} must be a non-empty string`)
  }
}

function expectNumber(value: unknown, label: string, failures: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failures.push(`${label} must be a finite number`)
  }
}

function expectOptionalNumberArray(
  value: unknown,
  label: string,
  failures: string[],
): void {
  if (value === null) {
    return
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    failures.push(`${label} must be null or an array of finite numbers`)
  }
}

function expectOptionalPageCountMap(
  value: unknown,
  label: string,
  failures: string[],
): void {
  if (value === null) {
    return
  }

  if (!isRecord(value) || Object.values(value).some((count) => typeof count !== "number" || !Number.isFinite(count))) {
    failures.push(`${label} must be null or a page-count object`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isIgnoredByGit(relativeRepoPath: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "--quiet", "--", relativeRepoPath], {
      cwd: process.cwd(),
      stdio: "ignore",
    })
    return true
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null

    if (status === 1) {
      return false
    }

    throw error
  }
}
