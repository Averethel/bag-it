#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const manifestPath = path.join(
  process.cwd(),
  "tests/e2e/fixtures/bag-analysis/manifest.json",
)

function loadManualIds() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))

  if (!Array.isArray(manifest.cases)) {
    throw new Error(`${manifestPath} does not contain a cases array`)
  }

  return manifest.cases.map((fixtureCase) => fixtureCase.id)
}

function printCircleCiTestNames(manualIds) {
  for (const manualId of manualIds) {
    console.log(manualId)
  }
}

function readSelectedInput(argv) {
  if (argv.length > 0) {
    return argv.join("\n")
  }

  return fs.readFileSync(0, "utf8")
}

function selectManualIds(input, manualIds) {
  const manualIdSet = new Set(input.match(/manual-\d+/g) ?? [])

  return manualIds.filter((manualId) => manualIdSet.has(manualId))
}

function writeSelectedManualIds(selectedManualIds) {
  const selectedCasesFile = process.env.BAG_ANALYSIS_SELECTED_CASES_FILE

  if (!selectedCasesFile) {
    return
  }

  writeManualIdsFile(selectedCasesFile, selectedManualIds)
}

function writeFailedManualIds(failedManualIds) {
  const failedCasesFile = process.env.BAG_ANALYSIS_FAILED_CASES_FILE

  if (!failedCasesFile) {
    return
  }

  writeManualIdsFile(failedCasesFile, failedManualIds)
}

function writeManualIdsFile(filePath, manualIds) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(
    filePath,
    manualIds.length > 0 ? `${manualIds.join("\n")}\n` : "",
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function runPlaywright(selectedManualIds) {
  if (selectedManualIds.length === 0) {
    console.log("No bag-analysis fixture cases assigned to this CircleCI node.")
    return 0
  }

  fs.mkdirSync("test-results", { recursive: true })
  process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE ??= path.join(
    "test-results",
    `bag-analysis-junit-${process.env.CIRCLE_NODE_INDEX ?? "local"}.xml`,
  )

  const grepPattern = `\\b(${selectedManualIds.map(escapeRegExp).join("|")})\\b`
  const result = spawnSync(
    "corepack",
    [
      "pnpm",
      "exec",
      "playwright",
      "test",
      "tests/e2e/bag-analysis.spec.ts",
      "--project=chrome",
      "--grep",
      grepPattern,
    ],
    {
      env: process.env,
      stdio: "inherit",
    },
  )

  if (result.error) {
    throw result.error
  }

  const status = result.status ?? 1

  if (status !== 0) {
    writeFailedManualIds(readFailedManualIds(process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE, manualIds))
  }

  return status
}

function readFailedManualIds(junitPath, manualIds) {
  if (!junitPath || !fs.existsSync(junitPath)) {
    return []
  }

  const manualIdSet = new Set(manualIds)
  const failedManualIds = []
  const xml = fs.readFileSync(junitPath, "utf8")
  const testcasePattern = /<testcase\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>/g

  for (const match of xml.matchAll(testcasePattern)) {
    if (!/<(?:error|failure)\b/.test(match[2])) {
      continue
    }

    const manualId = match[1].match(/manual-\d+/)?.[0]

    if (manualId && manualIdSet.has(manualId) && !failedManualIds.includes(manualId)) {
      failedManualIds.push(manualId)
    }
  }

  return failedManualIds
}

const argv = process.argv.slice(2)
const manualIds = loadManualIds()

if (argv.includes("--list")) {
  printCircleCiTestNames(manualIds)
  process.exit(0)
}

const selectedManualIds = selectManualIds(readSelectedInput(argv), manualIds)
writeSelectedManualIds(selectedManualIds)
process.exit(runPlaywright(selectedManualIds))
