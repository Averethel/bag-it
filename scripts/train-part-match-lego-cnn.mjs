#!/usr/bin/env node
import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const privatePython = path.join(rootDir, ".bag-it", "private", "ml-venv", "bin", "python")
const python = process.env.PART_MATCH_PYTHON || (existsSync(privatePython) ? privatePython : "python3")
const script = path.join(rootDir, "scripts", "train-part-match-lego-cnn.py")

const child = spawn(python, [script, ...process.argv.slice(2)], {
  cwd: rootDir,
  env: {
    ...process.env,
    TORCH_HOME: process.env.TORCH_HOME || path.join(rootDir, ".bag-it", "private", "torch-cache"),
  },
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
