import type {
  PartMatchGroupRunResult,
  PartMatchPrecomputeProgress,
  PartMatchRowInput,
} from "./part-match-group-progress"
import { runPartMatchGroupBucket } from "./part-match-group-runner"

type PartMatchWorkerRequest = {
  rows: PartMatchRowInput[]
  type: "compute"
}

type PartMatchWorkerResponse =
  | {
      progress: PartMatchPrecomputeProgress
      type: "progress"
    }
  | {
      groups: PartMatchGroupRunResult[]
      type: "complete"
    }
  | {
      errorMessage: string
      type: "error"
    }

function postProgress(progress: PartMatchPrecomputeProgress) {
  self.postMessage({
    progress,
    type: "progress",
  } satisfies PartMatchWorkerResponse)
}

self.onmessage = (event: MessageEvent<PartMatchWorkerRequest>) => {
  if (event.data.type !== "compute") {
    return
  }

  void computePartMatchGroups(event.data.rows)
}

async function computePartMatchGroups(rows: PartMatchRowInput[]) {
  try {
    const groups = await runPartMatchGroupBucket(rows, postProgress)

    self.postMessage({
      groups,
      type: "complete",
    } satisfies PartMatchWorkerResponse)
  } catch (error) {
    self.postMessage({
      errorMessage: partMatchWorkerErrorMessage(error),
      type: "error",
    } satisfies PartMatchWorkerResponse)
  }
}

function partMatchWorkerErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Part group worker failed"
}

export {}
