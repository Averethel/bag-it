import {
  BAG_CHECKLIST_COLLATOR,
  type BagChecklistPartGroup,
} from "./bag-checklist-table-model"
import {
  PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL,
  type PartMatchGroupRunResult,
  type PartMatchPrecomputeProgress,
  type PartMatchRenderedPixels,
  type PartMatchRowInput,
} from "./part-match-group-progress"
import type { StepCalloutBagRow } from "@/features/bagging/step-callout-bagging"
import type { PartMaskPreviewAsset } from "@/features/steps/preview-assets"

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

export type PartMatchWorkerTransferPayload = {
  rows: PartMatchRowInput[]
  transferList: Transferable[]
}

export function partMatchPrecomputeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Part grouping failed"
}

export function computePartMatchGroupsOffMainThread(
  matcherRows: PartMatchRowInput[],
  onProgress: (progress: PartMatchPrecomputeProgress) => void,
  signal?: AbortSignal,
): Promise<PartMatchGroupRunResult[]> {
  throwIfPartMatchAborted(signal)

  if (typeof Worker === "undefined") {
    return computePartMatchGroupsOnMainThread(matcherRows, onProgress, signal)
  }

  const buckets = createPartMatchWorkerBuckets(matcherRows)

  if (buckets.length === 0) {
    return Promise.resolve([])
  }

  if (buckets.length > 1) {
    return computePartMatchGroupBucketsOffMainThread(buckets, onProgress, signal)
  }

  return computePartMatchGroupBucketOffMainThread(buckets[0] ?? matcherRows, onProgress, signal)
}

export function createPartMatchWorkerTransferPayload(
  matcherRows: readonly PartMatchRowInput[],
): PartMatchWorkerTransferPayload {
  const transferList: Transferable[] = []

  return {
    rows: matcherRows.map((row) => ({
      ...row,
      alphaMask: clonePartMatchAlphaMaskForWorkerTransfer(row.alphaMask, transferList),
      renderedPixels: clonePartMatchRenderedPixelsForWorkerTransfer(row.renderedPixels, transferList),
    })),
    transferList,
  }
}

export function createPartMatchGroupsByBag(
  rows: readonly StepCalloutBagRow[],
  workerGroups: readonly PartMatchGroupRunResult[],
): ReadonlyMap<string, BagChecklistPartGroup[]> {
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const groupsByBagId = new Map<string, BagChecklistPartGroup[]>()

  for (const workerGroup of workerGroups) {
    const groupRows = workerGroup.group.rowIds
      .map((rowId) => rowById.get(rowId))
      .filter((row): row is StepCalloutBagRow => Boolean(row))

    if (groupRows.length < 2) {
      continue
    }

    const bagId = workerGroup.group.bagId
    groupsByBagId.set(bagId, [
      ...(groupsByBagId.get(bagId) ?? []),
      {
        group: workerGroup.group,
        lane: workerGroup.lane,
        rows: groupRows,
      },
    ])
  }

  return groupsByBagId
}

export function yieldToBrowser(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

export function createPartMatchRowsKey(rows: readonly StepCalloutBagRow[]): string {
  return rows.map((row) => {
    const partWidth = row.partCrop?.region.width ?? row.anchor.partRegion.width
    const partHeight = row.partCrop?.region.height ?? row.anchor.partRegion.height

    return `${row.id}:${row.bagId}:${row.calloutId}:${row.color.key}:${partWidth}x${partHeight}`
  }).join("|")
}

export function createPartMaskAssetByItemId(
  partMaskAssets: readonly PartMaskPreviewAsset[],
): ReadonlyMap<string, PartMaskPreviewAsset> {
  return new Map(partMaskAssets.map((asset) => [asset.partItemId, asset]))
}

export function createPartMatchRowInput(
  row: StepCalloutBagRow,
  partMaskAssetByItemId: ReadonlyMap<string, PartMaskPreviewAsset>,
): PartMatchRowInput {
  const renderedPixels = normalizePartMaskRenderedPixels(
    partMaskAssetByItemId.get(row.itemId)?.renderedPixels,
  )

  return {
    alphaMask: row.partImageAlphaMask,
    bagId: row.bagId,
    calloutId: row.calloutId,
    color: {
      family: row.color.family,
      key: row.color.key,
      manualClassId: row.color.manualClassId,
      manualClassTrusted: row.color.manualClassTrusted,
      name: row.color.name,
      status: row.color.status,
    },
    itemId: row.itemId,
    partRegion: row.partCrop?.region ?? row.anchor.partRegion,
    renderedPixels,
    rowId: row.id,
  }
}

function computePartMatchGroupBucketOffMainThread(
  matcherRows: PartMatchRowInput[],
  onProgress: (progress: PartMatchPrecomputeProgress) => void,
  signal?: AbortSignal,
): Promise<PartMatchGroupRunResult[]> {
  return new Promise((resolve, reject) => {
    throwIfPartMatchAborted(signal)

    const worker = new Worker(new URL("./part-match-groups.worker.ts", import.meta.url), {
      type: "module",
    })
    let settled = false

    const rejectWithAbort = () => {
      if (settled) {
        return
      }

      settled = true
      signal?.removeEventListener("abort", rejectWithAbort)
      worker.terminate()
      reject(createPartMatchAbortError())
    }
    signal?.addEventListener("abort", rejectWithAbort, { once: true })

    worker.onmessage = (event: MessageEvent<PartMatchWorkerResponse>) => {
      if (settled || signal?.aborted) {
        return
      }

      if (event.data.type === "progress") {
        onProgress(event.data.progress)
        return
      }

      if (event.data.type === "error") {
        settled = true
        signal?.removeEventListener("abort", rejectWithAbort)
        worker.terminate()
        reject(new Error(event.data.errorMessage || "Part group worker failed"))
        return
      }

      settled = true
      signal?.removeEventListener("abort", rejectWithAbort)
      worker.terminate()
      resolve(event.data.groups)
    }

    worker.onerror = () => {
      if (settled) {
        return
      }

      settled = true
      signal?.removeEventListener("abort", rejectWithAbort)
      worker.terminate()
      reject(new Error("Part group worker failed"))
    }

    worker.onmessageerror = () => {
      if (settled) {
        return
      }

      settled = true
      signal?.removeEventListener("abort", rejectWithAbort)
      worker.terminate()
      reject(new Error("Part group worker message failed"))
    }

    const transferPayload = createPartMatchWorkerTransferPayload(matcherRows)

    worker.postMessage({
      rows: transferPayload.rows,
      type: "compute",
    }, transferPayload.transferList)
  })
}

function clonePartMatchAlphaMaskForWorkerTransfer(
  alphaMask: PartMatchRowInput["alphaMask"],
  transferList: Transferable[],
): PartMatchRowInput["alphaMask"] {
  if (!alphaMask) {
    return alphaMask
  }

  return {
    ...alphaMask,
    data: clonePartMatchByteDataForWorkerTransfer(alphaMask.data, transferList),
  }
}

function clonePartMatchRenderedPixelsForWorkerTransfer(
  renderedPixels: PartMatchRowInput["renderedPixels"],
  transferList: Transferable[],
): PartMatchRowInput["renderedPixels"] {
  if (!renderedPixels) {
    return renderedPixels
  }

  return {
    ...renderedPixels,
    data: clonePartMatchByteDataForWorkerTransfer(renderedPixels.data, transferList),
  }
}

function clonePartMatchByteDataForWorkerTransfer(
  data: NonNullable<PartMatchRowInput["alphaMask"]>["data"],
  transferList: Transferable[],
): NonNullable<PartMatchRowInput["alphaMask"]>["data"] {
  if (data instanceof Uint8ClampedArray) {
    const clonedData = new Uint8ClampedArray(data)

    if (clonedData.buffer instanceof ArrayBuffer) {
      transferList.push(clonedData.buffer)
    }

    return clonedData
  }

  return Array.isArray(data) ? [...data] : { ...data }
}

async function computePartMatchGroupBucketsOffMainThread(
  buckets: PartMatchRowInput[][],
  onProgress: (progress: PartMatchPrecomputeProgress) => void,
  signal?: AbortSignal,
): Promise<PartMatchGroupRunResult[]> {
  throwIfPartMatchAborted(signal)

  const fanoutAbortController = new AbortController()
  const fanoutSignal = fanoutAbortController.signal
  const abortFanout = () => {
    fanoutAbortController.abort()
  }
  const total = buckets.length * PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL
  const completedByBucket = new Map<number, number>()
  const workerCount = resolvePartMatchWorkerCount(buckets.length)
  const results: PartMatchGroupRunResult[][] = []
  let nextBucketIndex = 0

  signal?.addEventListener("abort", abortFanout, { once: true })

  const runNextBucket = async (): Promise<void> => {
    throwIfPartMatchAborted(fanoutSignal)

    const bucketIndex = nextBucketIndex
    nextBucketIndex += 1

    if (bucketIndex >= buckets.length) {
      return
    }

    results[bucketIndex] = await computePartMatchGroupBucketOffMainThread(
      buckets[bucketIndex] ?? [],
      (progress) => {
        if (fanoutSignal.aborted) {
          return
        }

        completedByBucket.set(bucketIndex, progress.completed)
        onProgress({
          completed: sumCompletedPartMatchBuckets(completedByBucket),
          label: progress.label,
          total,
        })
      },
      fanoutSignal,
    )

    await runNextBucket()
  }

  try {
    await Promise.all(Array.from({ length: workerCount }, () => runNextBucket()))
  } catch (error) {
    abortFanout()
    throw error
  } finally {
    signal?.removeEventListener("abort", abortFanout)
  }

  return results
    .flat()
    .sort(comparePartMatchGroupRunResults)
}

async function computePartMatchGroupsOnMainThread(
  matcherRows: PartMatchRowInput[],
  onProgress: (progress: PartMatchPrecomputeProgress) => void,
  signal?: AbortSignal,
): Promise<PartMatchGroupRunResult[]> {
  const buckets = createPartMatchWorkerBuckets(matcherRows)
  const targetBuckets = buckets.length > 0 ? buckets : [matcherRows]
  const groups: PartMatchGroupRunResult[] = []
  const total = targetBuckets.length * PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL
  let completed = 0

  onProgress({
    completed: 0,
    label: "Loading CNN scorer",
    total,
  })

  throwIfPartMatchAborted(signal)
  const { runPartMatchGroupBucket } = await import("./part-match-group-runner")
  throwIfPartMatchAborted(signal)

  for (const bucket of targetBuckets) {
    throwIfPartMatchAborted(signal)
    await yieldToBrowser()
    throwIfPartMatchAborted(signal)
    groups.push(...await runPartMatchGroupBucket(bucket, (progress) => {
      if (signal?.aborted) {
        return
      }

      onProgress({
        completed: completed + progress.completed,
        label: progress.label,
        total,
      })
    }))
    completed += PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL
  }

  return groups.sort(comparePartMatchGroupRunResults)
}

function throwIfPartMatchAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createPartMatchAbortError()
  }
}

function createPartMatchAbortError(): Error {
  const error = new Error("Part grouping cancelled")
  error.name = "AbortError"
  return error
}

function createPartMatchWorkerBuckets(
  matcherRows: readonly PartMatchRowInput[],
): PartMatchRowInput[][] {
  const rowsByBagId = new Map<string, PartMatchRowInput[]>()

  for (const row of matcherRows) {
    rowsByBagId.set(row.bagId, [...(rowsByBagId.get(row.bagId) ?? []), row])
  }

  return [...rowsByBagId.entries()]
    .sort(([leftBagId], [rightBagId]) => BAG_CHECKLIST_COLLATOR.compare(leftBagId, rightBagId))
    .map(([, rows]) => rows)
    .filter((rows) => rows.length >= 2)
}

function resolvePartMatchWorkerCount(bucketCount: number): number {
  const hardwareConcurrency =
    typeof navigator === "undefined" || !Number.isFinite(navigator.hardwareConcurrency)
      ? 2
      : Math.floor(navigator.hardwareConcurrency)

  return Math.max(1, Math.min(bucketCount, 4, Math.max(1, hardwareConcurrency - 2)))
}

function sumCompletedPartMatchBuckets(completedByBucket: ReadonlyMap<number, number>): number {
  let total = 0

  for (const completed of completedByBucket.values()) {
    total += completed
  }

  return total
}

function comparePartMatchGroupRunResults(
  left: PartMatchGroupRunResult,
  right: PartMatchGroupRunResult,
): number {
  return (
    BAG_CHECKLIST_COLLATOR.compare(left.group.bagId, right.group.bagId) ||
    BAG_CHECKLIST_COLLATOR.compare(left.group.groupId, right.group.groupId)
  )
}

function normalizePartMaskRenderedPixels(
  renderedPixels: PartMaskPreviewAsset["renderedPixels"] | undefined,
): PartMatchRenderedPixels | null {
  if (!renderedPixels || renderedPixels.width <= 0 || renderedPixels.height <= 0) {
    return null
  }

  return {
    data: renderedPixels.data,
    height: renderedPixels.height,
    width: renderedPixels.width,
  }
}
