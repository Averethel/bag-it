#!/usr/bin/env node

const DEFAULT_APPROVAL_LABEL = "fixture-diff-approved"

const approvalLabel = process.env.BAG_ANALYSIS_FIXTURE_DIFF_APPROVAL_LABEL?.trim() ||
  DEFAULT_APPROVAL_LABEL

if (isEnvApproved()) {
  console.log("Fixture diff approval accepted from BAG_ANALYSIS_FIXTURE_DIFF_APPROVED.")
  process.exit(0)
}

const pullRequest = readPullRequestContext()

if (!pullRequest) {
  console.error(
    `Fixture diff approval requires PR label '${approvalLabel}', but no CircleCI pull request context was found.`,
  )
  process.exit(1)
}

const labels = await fetchPullRequestLabels(pullRequest)
const approved = labels.some((label) => label.toLowerCase() === approvalLabel.toLowerCase())

if (approved) {
  console.log(
    `Fixture diff approval label '${approvalLabel}' found on ${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}.`,
  )
  process.exit(0)
}

console.error(
  `Fixture diffs are not approved. Add PR label '${approvalLabel}' and rerun the CircleCI deployed e2e job to mark approved fixture diffs green.`,
)
process.exit(1)

function isEnvApproved() {
  const rawValue = process.env.BAG_ANALYSIS_FIXTURE_DIFF_APPROVED?.trim().toLowerCase()

  return rawValue === "1" || rawValue === "true" || rawValue === "yes"
}

function readPullRequestContext() {
  const pullRequestUrl = readFirstPullRequestUrl()

  if (!pullRequestUrl) {
    return null
  }

  const parsed = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(pullRequestUrl)

  if (!parsed) {
    return null
  }

  return {
    owner: parsed[1],
    repo: parsed[2],
    number: parsed[3],
  }
}

function readFirstPullRequestUrl() {
  const candidates = [
    process.env.CIRCLE_PULL_REQUEST,
    ...(process.env.CIRCLE_PULL_REQUESTS ?? "").split(","),
  ]

  return candidates.map((candidate) => candidate?.trim()).find(Boolean) ?? null
}

async function fetchPullRequestLabels({ owner, repo, number }) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "bag-it-fixture-diff-approval",
  }
  const githubToken = process.env.GITHUB_TOKEN?.trim()

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${number}/labels?per_page=100`,
    { headers },
  )

  if (!response.ok) {
    throw new Error(`GitHub labels request failed with ${response.status} ${response.statusText}`)
  }

  const labels = await response.json()

  if (!Array.isArray(labels)) {
    throw new Error("GitHub labels response was not an array.")
  }

  return labels
    .map((label) => typeof label?.name === "string" ? label.name : "")
    .filter(Boolean)
}
