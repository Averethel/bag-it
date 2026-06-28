import { useEffect, useMemo, useState } from "react"
import type { BagChecklistPartGroup } from "./bag-checklist-table-model"
import {
  PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL,
  createPartMatchProgress,
  type PartMatchPrecomputeProgress,
} from "./part-match-group-progress"
import {
  computePartMatchGroupsOffMainThread,
  createPartMaskAssetByItemId,
  createPartMatchGroupsByBag,
  createPartMatchRowInput,
  createPartMatchRowsKey,
  partMatchPrecomputeErrorMessage,
  yieldToBrowser,
} from "./part-match-precompute-runtime"
import type { StepCalloutBagRow } from "@/features/bagging/step-callout-bagging"
import type { PartMaskPreviewAsset } from "@/features/steps/preview-assets"

export type PartMatchPrecomputeStatus = "idle" | "preparing" | "ready" | "failed"

export type PartMatchPrecomputeState = {
  errorMessage?: string
  groupsByBagId: ReadonlyMap<string, BagChecklistPartGroup[]>
  progress: PartMatchPrecomputeProgress | null
  status: PartMatchPrecomputeStatus
  waitingForPartPreviews?: {
    ready: number
    total: number
  }
}

const EMPTY_PART_MATCH_GROUPS_BY_BAG_ID: ReadonlyMap<string, BagChecklistPartGroup[]> = new Map()

export function usePrecomputedPartMatchGroups({
  partMaskAssets,
  partMaskPreviewsComplete,
  rows,
}: {
  partMaskAssets: readonly PartMaskPreviewAsset[]
  partMaskPreviewsComplete: boolean
  rows: StepCalloutBagRow[]
}): PartMatchPrecomputeState {
  const [state, setState] = useState<PartMatchPrecomputeState>(() => ({
    groupsByBagId: EMPTY_PART_MATCH_GROUPS_BY_BAG_ID,
    progress: null,
    status: "idle",
  }))
  const rowsKey = useMemo(() => createPartMatchRowsKey(rows), [rows])
  const partMaskAssetByItemId = useMemo(
    () => createPartMaskAssetByItemId(partMaskAssets),
    [partMaskAssets],
  )

  useEffect(() => {
    let cancelled = false
    const expectedPartMaskCount = rows.filter((row) => Boolean(row.partImageAlphaMask)).length
    const readyPartMaskCount = rows.filter((row) =>
      Boolean(row.partImageAlphaMask && partMaskAssetByItemId.has(row.itemId))
    ).length

    if (rows.length < 2) {
      void yieldToBrowser().then(() => {
        if (!cancelled) {
          setState({
            groupsByBagId: EMPTY_PART_MATCH_GROUPS_BY_BAG_ID,
            progress: null,
            status: "idle",
          })
        }
      })

      return () => {
        cancelled = true
      }
    }

    if (
      expectedPartMaskCount > 0 &&
      readyPartMaskCount < expectedPartMaskCount &&
      !partMaskPreviewsComplete
    ) {
      void yieldToBrowser().then(() => {
        if (!cancelled) {
          setState({
            groupsByBagId: EMPTY_PART_MATCH_GROUPS_BY_BAG_ID,
            progress: null,
            status: "idle",
            waitingForPartPreviews: {
              ready: readyPartMaskCount,
              total: expectedPartMaskCount,
            },
          })
        }
      })

      return () => {
        cancelled = true
      }
    }

    const abortController = new AbortController()

    async function precomputeGroups() {
      await Promise.resolve()

      if (cancelled) {
        return
      }

      setState({
        groupsByBagId: EMPTY_PART_MATCH_GROUPS_BY_BAG_ID,
        progress: createPartMatchProgress("Preparing part scorer", 0, PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL),
        status: "preparing",
        waitingForPartPreviews: undefined,
      })

      await yieldToBrowser()

      if (cancelled) {
        return
      }

      try {
        const workerGroups = await computePartMatchGroupsOffMainThread(
          rows.map((row) => createPartMatchRowInput(row, partMaskAssetByItemId)),
          (progress) => {
            if (cancelled) {
              return
            }

            setState((currentState) => ({
              ...currentState,
              progress,
            }))
          },
          abortController.signal,
        )

        if (cancelled) {
          return
        }

        setState({
          groupsByBagId: createPartMatchGroupsByBag(rows, workerGroups),
          progress: null,
          status: "ready",
          waitingForPartPreviews: undefined,
        })
      } catch (error) {
        if (!cancelled) {
          setState({
            errorMessage: partMatchPrecomputeErrorMessage(error),
            groupsByBagId: EMPTY_PART_MATCH_GROUPS_BY_BAG_ID,
            progress: null,
            status: "failed",
            waitingForPartPreviews: undefined,
          })
        }
      }
    }

    void precomputeGroups()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [partMaskAssetByItemId, partMaskPreviewsComplete, rows, rowsKey])

  return state
}
