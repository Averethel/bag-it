#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const REVIEW_ROOT = ".circleci-fixture-review"
const CONTINUE_URL = "https://circleci.com/api/v2/pipeline/continue"

const reviewMarkers = countMarkers(REVIEW_ROOT, "review-required.txt")
const unapprovedMarkers = countMarkers(REVIEW_ROOT, "unapproved-failures.txt")
const configuration = createContinuationConfig({ reviewMarkers, unapprovedMarkers })

if (process.argv.includes("--print")) {
  process.stdout.write(configuration)
  process.exit(0)
}

const continuationKey = process.env.CIRCLE_CONTINUATION_KEY

if (!continuationKey) {
  throw new Error("CIRCLE_CONTINUATION_KEY is required to continue the CircleCI pipeline.")
}

const response = await fetch(CONTINUE_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    "continuation-key": continuationKey,
    configuration,
  }),
})

if (!response.ok) {
  const body = await response.text()
  throw new Error(`CircleCI continuation failed with ${response.status}: ${body}`)
}

console.log(formatContinuationMessage({ reviewMarkers, unapprovedMarkers }))

function countMarkers(rootDir, markerName) {
  if (!fs.existsSync(rootDir)) {
    return 0
  }

  let count = 0

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name)

    if (entry.isDirectory()) {
      count += countMarkers(entryPath, markerName)
      continue
    }

    if (
      entry.isFile() &&
      entry.name === markerName &&
      fs.readFileSync(entryPath, "utf8").trim() !== ""
    ) {
      count += 1
    }
  }

  return count
}

function createContinuationConfig({
  reviewMarkers,
  unapprovedMarkers,
}) {
  if (unapprovedMarkers > 0) {
    return createReviewBlockedConfig({ unapprovedMarkers })
  }

  if (reviewMarkers > 0) {
    return createReviewRequiredConfig({ reviewMarkers })
  }

  return createReviewNotRequiredConfig()
}

function createReviewRequiredConfig({ reviewMarkers }) {
  return `version: 2.1

jobs:
  fixture_diff_review_gate:
    docker:
      - image: cimg/base:stable
    steps:
      - run:
          name: Record fixture diff approval
          command: echo "Approved ${reviewMarkers} fixture diff shard(s) in CircleCI."

workflows:
  fixture_diff_review:
    jobs:
      - review_fixture_diff_reports:
          type: approval
      - fixture_diff_review_gate:
          requires:
            - review_fixture_diff_reports
`
}

function createReviewNotRequiredConfig() {
  return `version: 2.1

jobs:
  fixture_diff_review_gate:
    docker:
      - image: cimg/base:stable
    steps:
      - run:
          name: Record fixture diff review status
          command: echo "No fixture diff reports require manual review."

workflows:
  fixture_diff_review:
    jobs:
      - fixture_diff_review_gate
`
}

function createReviewBlockedConfig({ unapprovedMarkers }) {
  return `version: 2.1

jobs:
  fixture_diff_review_gate:
    docker:
      - image: cimg/base:stable
    steps:
      - run:
          name: Reject non-fixture deployed e2e failure
          command: |
            echo "Deployed e2e had ${unapprovedMarkers} unapproved failure shard(s)."
            echo "Manual fixture review cannot override non-fixture failures."
            exit 1

workflows:
  fixture_diff_review:
    jobs:
      - fixture_diff_review_gate
`
}

function formatContinuationMessage({
  reviewMarkers,
  unapprovedMarkers,
}) {
  if (unapprovedMarkers > 0) {
    return `Continued pipeline with red fixture review gate for ${unapprovedMarkers} unapproved failure shard(s).`
  }

  if (reviewMarkers > 0) {
    return `Continued pipeline with manual fixture review for ${reviewMarkers} shard(s).`
  }

  return "Continued pipeline without fixture diff manual review."
}
