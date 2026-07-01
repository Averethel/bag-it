#!/usr/bin/env node

import { spawnSync } from "node:child_process"

const result = spawnSync(npmExecutable(), [
  "run",
  "validate:e2e-fixtures",
  "--",
  ...process.argv.slice(2),
], {
  encoding: "utf8",
  stdio: "inherit",
})

if (result.error) {
  throw result.error
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}
