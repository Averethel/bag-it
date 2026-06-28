import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  comparePartColorReportRegressionSnapshot,
  DEFAULT_PART_COLOR_REPORT_REGRESSION_DIR,
  readPartColorReportRegressionSnapshots,
} from "./part-color-report-regression.mjs"
import {
  comparePartCropReportRegressionSnapshot,
  DEFAULT_PART_CROP_REPORT_REGRESSION_DIR,
  readPartCropReportRegressionSnapshots,
} from "./part-crop-report-regression.mjs"
import {
  DEFAULT_PART_COLOR_LABEL_DIR,
  evaluatePartColorLabelFiles,
} from "./part-color-label-eval.mjs"
import {
  DEFAULT_PART_MATCH_LABEL_DIR,
  evaluatePartMatchLabelFiles,
} from "./part-match-label-eval.mjs"

export const REQUIRED_DETECTOR_TUNING_GATES = {
  color: ["02-middle-wall"],
  crop: ["lower-courtyard-crops"],
}

export function validateDetectorRegressionGates(options = {}) {
  const colorSnapshotDir = options.colorSnapshotDir ?? DEFAULT_PART_COLOR_REPORT_REGRESSION_DIR
  const colorLabelDir = options.colorLabelDir ?? DEFAULT_PART_COLOR_LABEL_DIR
  const partMatchLabelDir = options.partMatchLabelDir ?? DEFAULT_PART_MATCH_LABEL_DIR
  const cropSnapshotDir = options.cropSnapshotDir ?? DEFAULT_PART_CROP_REPORT_REGRESSION_DIR
  const strict = options.strict === true
  const runSavedSessions = options.runSavedSessions !== false
  const messages = []

  const color = validateSnapshotGroup({
    compareSnapshot: comparePartColorReportRegressionSnapshot,
    label: "part color report",
    readSnapshots: () => readPartColorReportRegressionSnapshots(colorSnapshotDir),
    requiredIds: strict ? REQUIRED_DETECTOR_TUNING_GATES.color : [],
  })
  messages.push(...color.messages)

  const colorLabels = evaluatePartColorLabelFiles({ labelDir: colorLabelDir })

  messages.push(...colorLabels.messages)

  if (colorLabels.failed) {
    throw new Error("Part color label gate failed.")
  }

  const partMatchLabels = evaluatePartMatchLabelFiles({ labelDir: partMatchLabelDir })

  messages.push(...partMatchLabels.messages)

  if (partMatchLabels.failed) {
    throw new Error("Part match label gate failed.")
  }

  const crop = validateSnapshotGroup({
    compareSnapshot: comparePartCropReportRegressionSnapshot,
    label: "part crop report",
    readSnapshots: () => readPartCropReportRegressionSnapshots(cropSnapshotDir),
    requiredIds: strict ? REQUIRED_DETECTOR_TUNING_GATES.crop : [],
  })
  messages.push(...crop.messages)

  if (runSavedSessions) {
    runBagAnalysisE2EFixtureGate()
    messages.push("Bag-analysis e2e fixture gate passed.")
  } else {
    messages.push("Bag-analysis e2e fixture gate skipped by option.")
  }

  return {
    colorLabelCount: colorLabels.labelCount,
    colorLabelFileCount: colorLabels.labelFileCount,
    colorSnapshotCount: color.count,
    cropSnapshotCount: crop.count,
    partMatchLabelCount: partMatchLabels.labelCount,
    partMatchLabelFileCount: partMatchLabels.labelFileCount,
    messages,
  }
}

function validateSnapshotGroup({ compareSnapshot, label, readSnapshots, requiredIds }) {
  const snapshots = readSnapshots()
  const messages = []

  if (snapshots.length === 0) {
    if (requiredIds.length > 0) {
      throw new Error(`Missing required ${label} snapshots: ${requiredIds.join(", ")}`)
    }

    messages.push(`No ${label} snapshots found; skipping ${label} gate.`)
    return { count: 0, messages }
  }

  const snapshotIds = new Set(snapshots.map(({ snapshot }) => snapshot.id))
  const missingRequiredIds = requiredIds.filter((id) => !snapshotIds.has(id))

  if (missingRequiredIds.length > 0) {
    throw new Error(`Missing required ${label} snapshots: ${missingRequiredIds.join(", ")}`)
  }

  for (const { snapshot, snapshotPath } of snapshots) {
    const { actual, expected } = compareSnapshot(snapshot)

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label} regression failed: ${snapshotPath}`)
    }
  }

  messages.push(`Validated ${snapshots.length} ${label} snapshot(s).`)
  return { count: snapshots.length, messages }
}

function runBagAnalysisE2EFixtureGate() {
  const result = spawnSync(npmExecutable(), ["run", "test:e2e"], {
    encoding: "utf8",
    stdio: "inherit",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`Bag-analysis e2e fixture gate failed with exit code ${result.status ?? "unknown"}.`)
  }
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

function parseCliOptions(argv) {
  return {
    runSavedSessions: !argv.includes("--skip-saved-sessions") && !argv.includes("--skip-e2e-fixtures"),
    strict: argv.includes("--strict"),
  }
}

function runCli(argv) {
  const result = validateDetectorRegressionGates(parseCliOptions(argv))

  for (const message of result.messages) {
    console.log(message)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2))
}
