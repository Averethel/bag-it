#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const REVIEW_ROOT = ".circleci-fixture-review"
const CONTINUE_URL = "https://circleci.com/api/v2/pipeline/continue"

const configuration = hasReviewMarkers(REVIEW_ROOT)
  ? createReviewRequiredConfig()
  : createReviewNotRequiredConfig()

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

console.log(hasReviewMarkers(REVIEW_ROOT)
  ? "Continued pipeline with fixture diff manual review."
  : "Continued pipeline without fixture diff manual review.")

function hasReviewMarkers(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return false
  }

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name)

    if (entry.isDirectory() && hasReviewMarkers(entryPath)) {
      return true
    }

    if (
      entry.isFile() &&
      entry.name === "review-required.txt" &&
      fs.readFileSync(entryPath, "utf8").trim() !== ""
    ) {
      return true
    }
  }

  return false
}

function createReviewRequiredConfig() {
  return `version: 2.1

jobs:
  fixture_diff_review_accepted:
    docker:
      - image: cimg/base:stable
    steps:
      - run:
          name: Record fixture diff approval
          command: echo "Fixture diff reports approved in CircleCI."

workflows:
  fixture_diff_review:
    jobs:
      - review_fixture_diff_reports:
          type: approval
      - fixture_diff_review_accepted:
          requires:
            - review_fixture_diff_reports
`
}

function createReviewNotRequiredConfig() {
  return `version: 2.1

jobs:
  fixture_diff_review_not_required:
    docker:
      - image: cimg/base:stable
    steps:
      - run:
          name: Record fixture diff review status
          command: echo "No fixture diff reports require manual review."

workflows:
  fixture_diff_review:
    jobs:
      - fixture_diff_review_not_required
`
}
