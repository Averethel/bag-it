import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_PART_MATCH_LABEL_DIR,
  readPartMatchLabelSets,
  readPartMatchReportRowsByItemId,
} from "./part-match-label-eval.mjs"
import {
  DEFAULT_PART_MATCH_SOURCE_DIR,
  analyzePartMatchRules,
} from "./part-match-rule-analysis.mjs"

export const DEFAULT_PART_MATCH_REVIEW_QUEUE_DIR = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "review-queue",
)

const DEFAULT_BUCKETS = [
  "luma-detail-high-alpha",
  "combined-distance-low-alpha",
  "aspect-ratio-high-alpha",
]
const DEFAULT_HARD_NEGATIVE_LIMIT = 30
const DEFAULT_LIMIT_PER_BUCKET = 40
const LOW_ALPHA_DRIFT_MAX = 10

export async function writePartMatchReviewQueue({
  buckets = DEFAULT_BUCKETS,
  excludeDecisionPaths = [],
  generatedAt = new Date(),
  hardNegativeLimit = DEFAULT_HARD_NEGATIVE_LIMIT,
  labelDir = DEFAULT_PART_MATCH_LABEL_DIR,
  limitPerBucket = DEFAULT_LIMIT_PER_BUCKET,
  manualIds = null,
  outputDir = DEFAULT_PART_MATCH_REVIEW_QUEUE_DIR,
  scorerConfigPath = null,
  sourceDir = DEFAULT_PART_MATCH_SOURCE_DIR,
} = {}) {
  const analysis = analyzePartMatchRules({
    includePairs: true,
    labelDir,
    manualIds,
    scorerConfigPath,
    sourceDir,
  })
  const rowsByManual = await readReportRowsByManual({
    labelDir,
    manualIds,
  })
  const excludedPairIds = await readExcludedReviewPairIds(excludeDecisionPaths)
  const queue = buildPartMatchReviewQueue({
    analysis,
    buckets,
    excludedPairIds,
    generatedAt,
    hardNegativeLimit,
    limitPerBucket,
    rowsByManual,
  })

  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, "review-queue.json"), `${JSON.stringify(queue, null, 2)}\n`)
  await writeFile(path.join(outputDir, "review-queue-data.js"), renderDataScript(queue))
  await writeFile(path.join(outputDir, "review-queue.css"), renderReviewQueueCss())
  await writeFile(path.join(outputDir, "review-queue.js"), renderReviewQueueJs())
  await writeFile(path.join(outputDir, "index.html"), renderReviewQueueHtml())

  return {
    outputDir,
    queue,
  }
}

export function buildPartMatchReviewQueue({
  analysis,
  buckets = DEFAULT_BUCKETS,
  excludedPairIds = new Set(),
  generatedAt = new Date(),
  hardNegativeLimit = DEFAULT_HARD_NEGATIVE_LIMIT,
  limitPerBucket = DEFAULT_LIMIT_PER_BUCKET,
  rowsByManual = new Map(),
} = {}) {
  const bucketSet = new Set(buckets)
  const missedPairs = selectMissedPairs(analysis.pairs.sameMissedPairs, {
    bucketSet,
    excludedPairIds,
    limitPerBucket,
  })
  const hardNegativePairs = selectHardNegativePairs(analysis.pairs, {
    excludedPairIds,
    hardNegativeLimit,
  })
  const pairs = [
    ...missedPairs.map((pair) => reviewPair(pair, {
      kind: "missed-same",
      rowsByManual,
    })),
    ...hardNegativePairs.map((pair) => reviewPair(pair, {
      kind: pair.result.matched ? "false-positive-hard-negative" : "near-hard-negative",
      rowsByManual,
    })),
  ]

  return {
    buckets,
    generatedAt: generatedAt.toISOString(),
    pairCount: pairs.length,
    pairs,
    sourceScore: {
      groupTotals: analysis.groupTotals,
      pairTotals: analysis.pairTotals,
    },
    totals: summarizeReviewPairs(pairs),
    version: 1,
  }
}

async function readReportRowsByManual({
  labelDir,
  manualIds,
}) {
  const manualIdSet = manualIds ? new Set(manualIds) : null
  const result = new Map()

  for (const labelSet of readPartMatchLabelSets(labelDir)) {
    if (manualIdSet && !manualIdSet.has(labelSet.manualId)) {
      continue
    }

    const report = JSON.parse(await readFile(path.resolve(labelSet.reportPath), "utf8"))

    result.set(labelSet.manualId, readPartMatchReportRowsByItemId(report))
  }

  return result
}

async function readExcludedReviewPairIds(decisionPaths) {
  const ids = new Set()

  for (const decisionPath of decisionPaths) {
    const payload = JSON.parse(await readFile(path.resolve(decisionPath), "utf8"))

    if (!Array.isArray(payload.decisions)) {
      throw new Error(`Part match review decisions ${decisionPath} must contain decisions[].`)
    }

    for (const decision of payload.decisions) {
      if (!decision.manualId || !decision.left || !decision.right) {
        continue
      }

      ids.add(pairId(decision))
      ids.add(pairId({
        left: decision.right,
        manualId: decision.manualId,
        right: decision.left,
      }))
    }
  }

  return ids
}

function selectMissedPairs(pairs, {
  bucketSet,
  excludedPairIds,
  limitPerBucket,
}) {
  const counts = new Map()

  return pairs.filter((pair) => {
    if (excludedPairIds.has(pairId(pair))) {
      return false
    }

    const bucket = classifyMiss(pair)

    if (!bucketSet.has(bucket)) {
      return false
    }

    const count = counts.get(bucket) ?? 0

    if (count >= limitPerBucket) {
      return false
    }

    counts.set(bucket, count + 1)
    return true
  })
}

function selectHardNegativePairs(pairs, {
  excludedPairIds,
  hardNegativeLimit,
}) {
  const falsePositivePairs = pairs.falsePositivePairs
    .filter((pair) => !excludedPairIds.has(pairId(pair)))
  const falsePositiveIds = new Set(falsePositivePairs.map(pairId))
  const nearPairs = pairs.differentPairs
    .filter((pair) => !falsePositiveIds.has(pairId(pair)))
    .filter((pair) => !excludedPairIds.has(pairId(pair)))
    .filter((pair) => !pair.result.matched)
    .sort((left, right) => hardNegativeRiskScore(right) - hardNegativeRiskScore(left))
    .slice(0, Math.max(0, hardNegativeLimit - falsePositivePairs.length))

  return [
    ...falsePositivePairs,
    ...nearPairs,
  ].slice(0, hardNegativeLimit)
}

function reviewPair(pair, {
  kind,
  rowsByManual,
}) {
  const rowsById = rowsByManual.get(pair.manualId) ?? new Map()
  const leftRow = rowsById.get(pair.left) ?? null
  const rightRow = rowsById.get(pair.right) ?? null

  return {
    bucket: kind === "missed-same" ? classifyMiss(pair) : "hard-negative",
    id: pairId(pair),
    kind,
    left: reviewRow(leftRow, {
      expectedPartKey: pair.leftKey,
      itemId: pair.left,
    }),
    manualId: pair.manualId,
    metrics: pair.metrics,
    reasons: pair.result.reasons,
    right: reviewRow(rightRow, {
      expectedPartKey: pair.rightKey,
      itemId: pair.right,
    }),
  }
}

function reviewRow(row, {
  expectedPartKey,
  itemId,
}) {
  return {
    bagLabel: row?.bagLabel ?? "",
    calloutId: row?.calloutId ?? "",
    colorName: row?.color?.name ?? row?.color?.family ?? "Unknown",
    cropHash: row?.cropHash ?? "",
    expectedPartKey,
    imageDataUrl: row?.imageDataUrl ?? null,
    itemId,
    pageNumber: row?.pageNumber ?? null,
    quantity: row?.quantity ?? null,
    rowId: row?.rowId ?? itemId,
    stepIndex: row?.stepIndex ?? null,
  }
}

function classifyMiss(pair) {
  const reasons = new Set(pair.result.reasons)
  const alphaBucket = pair.metrics.alpha <= LOW_ALPHA_DRIFT_MAX
    ? "low-alpha"
    : "high-alpha"

  if (reasons.has("color")) {
    return "color-conflict"
  }

  if (reasons.has("aspect ratio differs")) {
    return `aspect-ratio-${alphaBucket}`
  }

  if (reasons.has("stud/detail structure differs")) {
    return "structure"
  }

  if (reasons.has("luma detail differs")) {
    return `luma-detail-${alphaBucket}`
  }

  if (reasons.has("combined visual distance too high")) {
    return `combined-distance-${alphaBucket}`
  }

  return "other"
}

function hardNegativeRiskScore(pair) {
  const confidence = pair.metrics.confidence ?? 0
  const alpha = boundedCloseness(pair.metrics.alpha, 32)
  const edge = boundedCloseness(pair.metrics.edge, 40.5)
  const projection = boundedCloseness(pair.metrics.projection, 0.1)
  const profile = boundedCloseness(Math.max(
    pair.metrics.top,
    pair.metrics.lower,
    pair.metrics.left,
    pair.metrics.right,
  ), 0.17)

  return confidence * 2 + alpha + edge + projection + profile
}

function boundedCloseness(value, max) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, 1 - Math.min(1, value / max))
}

function summarizeReviewPairs(pairs) {
  const byBucket = countBy(pairs, (pair) => pair.bucket)
  const byKind = countBy(pairs, (pair) => pair.kind)

  return {
    byBucket,
    byKind,
  }
}

function countBy(values, readKey) {
  const counts = new Map()

  for (const value of values) {
    const key = readKey(value)

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Object.fromEntries([...counts.entries()].sort((left, right) =>
    left[0].localeCompare(right[0])
  ))
}

function pairId(pair) {
  return createHash("sha1")
    .update(`${pair.manualId}\0${pair.left}\0${pair.right}`)
    .digest("hex")
    .slice(0, 12)
}

function renderReviewQueueHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Part match review queue</title>
  <link rel="stylesheet" href="review-queue.css">
</head>
<body>
  <main id="part-match-review-queue"></main>
  <script src="review-queue-data.js"></script>
  <script src="review-queue.js"></script>
</body>
</html>`
}

function renderDataScript(queue) {
  return `window.PART_MATCH_REVIEW_QUEUE_DATA = ${JSON.stringify(queue, null, 2)};\n`
}

function renderReviewQueueCss() {
  return `
* { box-sizing: border-box; }
body { background: #f5f7fb; color: #162033; font-family: system-ui, sans-serif; margin: 0; }
main { display: grid; gap: 12px; padding: 16px; }
.toolbar { background: #fff; border: 1px solid #d6deea; border-radius: 8px; padding: 12px; position: sticky; top: 0; z-index: 10; }
h1 { font-size: 20px; line-height: 1.2; margin: 0 0 4px; }
.muted { color: #64748b; font-size: 12px; }
.controls { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(150px, 1fr)); margin-top: 10px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
label { color: #475569; display: grid; font-size: 12px; gap: 4px; }
select, textarea { border: 1px solid #aab6c6; border-radius: 5px; font: inherit; padding: 7px; width: 100%; }
textarea { display: none; min-height: 120px; }
textarea.visible { display: block; margin-top: 10px; }
button { background: #165b3a; border: 1px solid #165b3a; border-radius: 5px; color: #fff; cursor: pointer; font: inherit; padding: 7px 10px; }
button.secondary { background: #fff; border-color: #9aa7b8; color: #162033; }
button.selected { background: #1f5f8b; border-color: #1f5f8b; }
.queue { display: grid; gap: 12px; }
.pair { background: #fff; border: 1px solid #d6deea; border-radius: 8px; display: grid; gap: 10px; padding: 12px; }
.pair-header { align-items: start; display: flex; gap: 10px; justify-content: space-between; }
.pair-title { font-weight: 700; overflow-wrap: anywhere; }
.pair-meta { color: #475569; font-size: 12px; line-height: 1.4; }
.pair-body { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.part { border: 1px solid #d6deea; border-radius: 8px; display: grid; gap: 8px; padding: 10px; }
.image { align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; display: flex; height: 180px; justify-content: center; padding: 8px; }
.image img { max-height: 100%; max-width: 100%; object-fit: contain; }
.image.empty { color: #64748b; font-size: 12px; }
.row-title { font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
.status-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.badge { background: #e7eef6; border-radius: 999px; color: #334155; display: inline-flex; font-size: 11px; padding: 2px 7px; }
.metrics { color: #334155; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.45; white-space: pre-wrap; }
@media (max-width: 820px) {
  .controls { grid-template-columns: 1fr; }
  .pair-body { grid-template-columns: 1fr; }
}
`
}

function renderReviewQueueJs() {
  return `
(function () {
  const data = window.PART_MATCH_REVIEW_QUEUE_DATA;
  const root = document.getElementById("part-match-review-queue");
  const storageKey = "bag-it-part-match-review-queue:" + data.generatedAt;
  let decisions = readDecisions();
  let bucketFilter = "all";
  let kindFilter = "all";
  let statusFilter = "unreviewed";
  let manualFilter = "all";

  function render() {
    root.innerHTML = "";
    root.appendChild(renderToolbar());
    root.appendChild(renderQueue());
  }

  function renderToolbar() {
    const toolbar = document.createElement("section");
    toolbar.className = "toolbar";
    const title = document.createElement("h1");
    title.textContent = "Part match review queue";
    const summary = document.createElement("div");
    summary.className = "muted";
    summary.textContent = data.pairCount + " pairs. Decisions stay in this browser until exported.";
    const controls = document.createElement("div");
    controls.className = "controls";
    controls.appendChild(selectControl("Manual", manualFilter, optionsFor("manualId", "All manuals"), function (value) {
      manualFilter = value;
      render();
    }));
    controls.appendChild(selectControl("Bucket", bucketFilter, optionsFor("bucket", "All buckets"), function (value) {
      bucketFilter = value;
      render();
    }));
    controls.appendChild(selectControl("Kind", kindFilter, optionsFor("kind", "All kinds"), function (value) {
      kindFilter = value;
      render();
    }));
    controls.appendChild(selectControl("Status", statusFilter, [
      ["all", "All statuses"],
      ["unreviewed", "Unreviewed"],
      ["same", "Same"],
      ["different", "Different"],
      ["bad-crop", "Bad crop"],
      ["ignore", "Ignore"]
    ], function (value) {
      statusFilter = value;
      render();
    }));

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.appendChild(button("Export decisions", "", writeOutput));
    actions.appendChild(button("Download decisions", "secondary", downloadDecisions));
    actions.appendChild(button("Clear decisions", "secondary", function () {
      decisions = {};
      persistDecisions();
      render();
    }));

    const output = document.createElement("textarea");
    output.id = "decision-output";
    output.readOnly = true;

    toolbar.appendChild(title);
    toolbar.appendChild(summary);
    toolbar.appendChild(controls);
    toolbar.appendChild(actions);
    toolbar.appendChild(output);
    return toolbar;
  }

  function renderQueue() {
    const queue = document.createElement("section");
    queue.className = "queue";
    const pairs = data.pairs.filter(matchesFilters);

    if (pairs.length === 0) {
      const empty = document.createElement("section");
      empty.className = "pair muted";
      empty.textContent = "No pairs match the current filters.";
      queue.appendChild(empty);
      return queue;
    }

    pairs.forEach(function (pair) {
      queue.appendChild(renderPair(pair));
    });
    return queue;
  }

  function renderPair(pair) {
    const section = document.createElement("section");
    section.className = "pair";
    const decision = decisions[pair.id] || { status: "unreviewed" };
    const header = document.createElement("header");
    header.className = "pair-header";
    const title = document.createElement("div");
    title.innerHTML = "";
    const titleText = document.createElement("div");
    titleText.className = "pair-title";
    titleText.textContent = pair.manualId + " / " + pair.bucket;
    const meta = document.createElement("div");
    meta.className = "pair-meta";
    meta.textContent = pair.kind + " / " + pair.reasons.join(", ");
    title.appendChild(titleText);
    title.appendChild(meta);
    header.appendChild(title);
    header.appendChild(renderDecisionButtons(pair, decision.status));

    const body = document.createElement("section");
    body.className = "pair-body";
    body.appendChild(renderPart(pair.left, "Left"));
    body.appendChild(renderPart(pair.right, "Right"));

    const metrics = document.createElement("div");
    metrics.className = "metrics";
    metrics.textContent = formatMetrics(pair.metrics);

    section.appendChild(header);
    section.appendChild(body);
    section.appendChild(metrics);
    return section;
  }

  function renderPart(row, title) {
    const part = document.createElement("section");
    part.className = "part";
    const image = document.createElement("div");
    image.className = "image" + (row.imageDataUrl ? "" : " empty");

    if (row.imageDataUrl) {
      const img = document.createElement("img");
      img.src = row.imageDataUrl;
      img.alt = title + " crop";
      image.appendChild(img);
    } else {
      image.textContent = "No crop";
    }

    const rowTitle = document.createElement("div");
    rowTitle.className = "row-title";
    rowTitle.textContent = row.itemId;
    const meta = document.createElement("div");
    meta.className = "pair-meta";
    meta.textContent = row.expectedPartKey + " / " + row.bagLabel + " / p" + (row.pageNumber || "?") + " / step " + (row.stepIndex || "?") + " / " + row.colorName + " / qty " + (row.quantity || "?");

    part.appendChild(image);
    part.appendChild(rowTitle);
    part.appendChild(meta);
    return part;
  }

  function renderDecisionButtons(pair, status) {
    const group = document.createElement("div");
    group.className = "status-buttons";
    [
      ["same", "Same"],
      ["different", "Different"],
      ["bad-crop", "Bad crop"],
      ["ignore", "Ignore"]
    ].forEach(function (entry) {
      const value = entry[0];
      const item = button(entry[1], status === value ? "selected" : "secondary", function () {
        decisions[pair.id] = {
          bucket: pair.bucket,
          kind: pair.kind,
          left: pair.left.itemId,
          manualId: pair.manualId,
          right: pair.right.itemId,
          status: value
        };
        persistDecisions();
        render();
      });
      group.appendChild(item);
    });
    return group;
  }

  function matchesFilters(pair) {
    const decision = decisions[pair.id];
    const status = decision ? decision.status : "unreviewed";

    return (manualFilter === "all" || pair.manualId === manualFilter) &&
      (bucketFilter === "all" || pair.bucket === bucketFilter) &&
      (kindFilter === "all" || pair.kind === kindFilter) &&
      (statusFilter === "all" || status === statusFilter);
  }

  function optionsFor(key, allLabel) {
    const values = Array.from(new Set(data.pairs.map(function (pair) {
      return pair[key];
    }))).sort();

    return [["all", allLabel]].concat(values.map(function (value) {
      return [value, value];
    }));
  }

  function selectControl(labelText, value, options, onChange) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const select = document.createElement("select");
    options.forEach(function (entry) {
      const option = document.createElement("option");
      option.value = entry[0];
      option.textContent = entry[1];
      option.selected = entry[0] === value;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      onChange(select.value);
    });
    label.appendChild(select);
    return label;
  }

  function button(text, className, onClick) {
    const element = document.createElement("button");
    element.textContent = text;
    if (className) {
      element.className = className;
    }
    element.addEventListener("click", onClick);
    return element;
  }

  function writeOutput() {
    const output = document.getElementById("decision-output");
    output.value = JSON.stringify(decisionPayload(), null, 2);
    output.classList.add("visible");
  }

  function downloadDecisions() {
    const blob = new Blob([JSON.stringify(decisionPayload(), null, 2) + "\\n"], {
      type: "application/json"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "part-match-review-decisions.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function decisionPayload() {
    return {
      generatedAt: new Date().toISOString(),
      queueGeneratedAt: data.generatedAt,
      decisions: Object.values(decisions).sort(function (left, right) {
        return left.manualId.localeCompare(right.manualId) ||
          left.left.localeCompare(right.left) ||
          left.right.localeCompare(right.right);
      })
    };
  }

  function formatMetrics(metrics) {
    return [
      "confidence " + number(metrics.confidence),
      "alpha " + number(metrics.alpha),
      "edge " + number(metrics.edge),
      "luma " + number(metrics.luma),
      "lumaEdge " + number(metrics.lumaEdge),
      "projection " + number(metrics.projection),
      "coverage " + number(metrics.coverage),
      "aspect " + number(metrics.aspectRatio)
    ].join(" / ");
  }

  function number(value) {
    return Number.isFinite(value) ? value.toFixed(4) : "n/a";
  }

  function readDecisions() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  }

  function persistDecisions() {
    localStorage.setItem(storageKey, JSON.stringify(decisions));
  }

  render();
}());
`
}

function readOption(argv, name) {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

function parseManualIds(value) {
  return value
    ? value.split(",").map((manualId) => manualId.trim()).filter(Boolean)
    : null
}

function parseBuckets(value) {
  return value
    ? value.split(",").map((bucket) => bucket.trim()).filter(Boolean)
    : DEFAULT_BUCKETS
}

function parsePaths(value) {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : []
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isFinite(parsed) ? parsed : fallback
}

async function runCli() {
  const argv = process.argv.slice(2)
  const result = await writePartMatchReviewQueue({
    buckets: parseBuckets(readOption(argv, "--buckets")),
    excludeDecisionPaths: parsePaths(readOption(argv, "--exclude-decision-path")),
    hardNegativeLimit: parseInteger(readOption(argv, "--hard-negative-limit"), DEFAULT_HARD_NEGATIVE_LIMIT),
    labelDir: readOption(argv, "--label-dir") ?? DEFAULT_PART_MATCH_LABEL_DIR,
    limitPerBucket: parseInteger(readOption(argv, "--limit-per-bucket"), DEFAULT_LIMIT_PER_BUCKET),
    manualIds: parseManualIds(readOption(argv, "--manual-ids")),
    outputDir: readOption(argv, "--output-dir") ?? DEFAULT_PART_MATCH_REVIEW_QUEUE_DIR,
    scorerConfigPath: readOption(argv, "--scorer-config"),
    sourceDir: readOption(argv, "--source-dir") ?? DEFAULT_PART_MATCH_SOURCE_DIR,
  })

  console.log(`Wrote part match review queue to ${result.outputDir}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
