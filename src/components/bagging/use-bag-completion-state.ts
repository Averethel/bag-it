import { startTransition, useCallback, useEffect, useMemo, useState } from "react"
import type { PendingBagCompletionRestore } from "./bagging-app-types"
import {
  transferCheckedBagRowsByAnchor,
  type StepCalloutBagCompletionAnchor,
} from "@/features/bagging/bag-completion-anchors"
import {
  restoreCheckedBagRowsById,
  type StepCalloutBagRow,
  type StepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"
import { COUNT_LABELS, formatCount } from "@/lib/count-format"

export function useBagCompletionState({
  bagRows,
  baggingPlan,
  manualFingerprint,
  setNotice,
}: {
  bagRows: StepCalloutBagRow[]
  baggingPlan: StepCalloutBaggingPlan | null
  manualFingerprint: string | null
  setNotice: (notice: string | null) => void
}) {
  const [checkedBagCompletions, setCheckedBagCompletions] = useState<
    Record<string, StepCalloutBagCompletionAnchor>
  >({})
  const [pendingBagCompletionRestore, setPendingBagCompletionRestore] =
    useState<PendingBagCompletionRestore | null>(null)
  const bagRowById = useMemo(
    () => new Map(bagRows.map((row) => [row.id, row])),
    [bagRows],
  )
  const bagRowIdsKey = useMemo(
    () => bagRows.map((row) => row.id).join("\n"),
    [bagRows],
  )
  const checkedBagRowIds = useMemo(
    () => new Set(Object.keys(checkedBagCompletions)),
    [checkedBagCompletions],
  )

  useEffect(() => {
    if (!pendingBagCompletionRestore || !manualFingerprint || !baggingPlan) {
      return
    }

    let cancelled = false

    if (bagRows.length === 0) {
      const noticeMessage =
        pendingBagCompletionRestore.checkedBagRowIds.length > 0 ||
        pendingBagCompletionRestore.checkedBagCompletionAnchors.length > 0
          ? "Saved packed rows could not be restored because no baggable rows exist."
          : null

      queueMicrotask(() => {
        if (cancelled) {
          return
        }

        setCheckedBagCompletions({})
        setPendingBagCompletionRestore(null)
        if (noticeMessage) {
          setNotice(noticeMessage)
        }
      })

      return () => {
        cancelled = true
      }
    }

    if (pendingBagCompletionRestore.transferByAnchor) {
      const transfer = transferCheckedBagRowsByAnchor(
        pendingBagCompletionRestore.checkedBagCompletionAnchors,
        bagRows,
        manualFingerprint,
      )
      const noticeMessage =
        transfer.restoredCount > 0 || transfer.droppedCount > 0
          ? `${formatCount(transfer.restoredCount, COUNT_LABELS.packedRow)} restored; ${formatCount(
              transfer.droppedCount,
              COUNT_LABELS.ambiguousRow,
            )} dropped after recalculation.`
          : null

      queueMicrotask(() => {
        if (cancelled) {
          return
        }

        setCheckedBagCompletions(transfer.checkedRows)
        setPendingBagCompletionRestore(null)
        if (noticeMessage) {
          setNotice(noticeMessage)
        }
      })

      return () => {
        cancelled = true
      }
    }

    const restoredRows = restoreCheckedBagRowsById(
      pendingBagCompletionRestore.checkedBagRowIds,
      bagRows,
    )
    const restoredRowCount = Object.keys(restoredRows).length

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setCheckedBagCompletions(restoredRows)
      setPendingBagCompletionRestore(null)
      if (restoredRowCount > 0) {
        setNotice(
          `${formatCount(restoredRowCount, COUNT_LABELS.packedRow)} restored from saved session.`,
        )
      }
    })

    return () => {
      cancelled = true
    }
  }, [bagRows, baggingPlan, manualFingerprint, pendingBagCompletionRestore, setNotice])

  useEffect(() => {
    if (pendingBagCompletionRestore) {
      return
    }

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setCheckedBagCompletions((current) => {
        const currentIds = Object.keys(current)

        if (currentIds.length === 0) {
          return current
        }

        const pruned = restoreCheckedBagRowsById(currentIds, bagRows)

        return Object.keys(pruned).length === currentIds.length ? current : pruned
      })
    })

    return () => {
      cancelled = true
    }
  }, [bagRowIdsKey, bagRows, pendingBagCompletionRestore])

  const resetBagCompletions = useCallback(() => {
    setCheckedBagCompletions({})
    setPendingBagCompletionRestore(null)
  }, [])

  const handleBagRowCheckedChange = useCallback(
    (rowId: string, checked: boolean) => {
      const row = bagRowById.get(rowId)

      if (!row) {
        return
      }

      startTransition(() => {
        setCheckedBagCompletions((current) => {
          if (!checked) {
            const next = { ...current }

            delete next[rowId]
            return next
          }

          return {
            ...current,
            [rowId]: row.anchor,
          }
        })
      })
    },
    [bagRowById],
  )

  return {
    checkedBagCompletions,
    checkedBagRowIds,
    handleBagRowCheckedChange,
    resetBagCompletions,
    setPendingBagCompletionRestore,
  }
}
