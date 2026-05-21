import type { ParsedPartsListPageRow, PartsListColor } from "./parts-list-extraction"
import type { PartsListNormalizationSummary } from "./parts-list-normalization"
import type { RebrickableCatalogueSnapshot } from "./rebrickable-catalogue"

type CatalogueColorsResponse = {
  colors?: PartsListColor[]
  snapshot?: RebrickableCatalogueSnapshot
}

export type PartsListCatalogueColorsResult = {
  colors: PartsListColor[]
  snapshot: RebrickableCatalogueSnapshot | null
}

type CataloguePartsNormalizationResponse = {
  normalization?: PartsListNormalizationSummary
  snapshot?: RebrickableCatalogueSnapshot
}

export type PartsListPartPreview = {
  colorId?: string
  fallbackImageUrl?: string
  imageUrl: string
  key: string
  name?: string
  partNumber: string
}

export type PartsListPartPreviewRequest = {
  colorId?: string | null
  partNumber: string
}

type PartsListPartPreviewInput = PartsListPartPreviewRequest | string

type CataloguePartPreviewsResponse = {
  previews?: PartsListPartPreview[]
  snapshot?: RebrickableCatalogueSnapshot
}

type PreloadPartsListCatalogueOptions = {
  timeoutMs?: number
}

export type FetchPartsListColorsOptions = {
  forceRefresh?: boolean
  signal?: AbortSignal
  snapshotId?: string | null
  timeoutMs?: number
}

let preloadedColorsPromise: Promise<PartsListCatalogueColorsResult> | null = null

export const fallbackPartsListColors = [
  { aliases: ["studio-11"], id: "0", name: "Black" },
  { aliases: ["Light Bluish Grey", "studio-86"], id: "71", name: "Light Bluish Gray" },
  { aliases: ["Dark Bluish Grey", "studio-85"], id: "72", name: "Dark Bluish Gray" },
  { aliases: ["studio-1"], id: "15", name: "White" },
  { aliases: ["studio-7"], id: "1", name: "Blue" },
  { id: "321", name: "Dark Azure" },
  { id: "4", name: "Red" },
  { aliases: ["studio-68"], id: "484", name: "Dark Orange" },
  { aliases: ["studio-3"], id: "14", name: "Yellow" },
  { aliases: ["Glowing Neon Red"], id: "36", name: "Trans-Red" },
  { aliases: ["Glowing Neon Yellow", "studio-19"], id: "46", name: "Trans-Yellow" },
  { aliases: ["studio-20"], id: "34", name: "Trans-Green" },
  { aliases: ["studio-98"], id: "182", name: "Trans-Orange" },
  { id: "57", name: "Trans-Neon Orange" },
  { aliases: ["studio-15"], id: "41", name: "Trans-Light Blue" },
  { id: "143", name: "Trans-Medium Blue" },
  { aliases: ["studio-6"], id: "2", name: "Green" },
  { aliases: ["studio-36"], id: "10", name: "Bright Green" },
  { id: "6", name: "Brown" },
  { aliases: ["Light Grey"], id: "7", name: "Light Gray" },
  { aliases: ["Dark Grey"], id: "8", name: "Dark Gray" },
  { aliases: ["studio-2"], id: "19", name: "Tan" },
  { aliases: ["studio-69"], id: "28", name: "Dark Tan" },
  { aliases: ["studio-88"], id: "70", name: "Reddish Brown" },
  { aliases: ["studio-150"], id: "84", name: "Medium Nougat" },
  { aliases: ["studio-154"], id: "31", name: "Lavender" },
  { aliases: ["studio-155"], id: "326", name: "Olive Green" },
  { aliases: ["studio-156"], id: "322", name: "Medium Azure" },
  { aliases: ["studio-48"], id: "378", name: "Sand Green" },
  { id: "179", name: "Flat Silver" },
  { aliases: ["studio-115"], id: "297", name: "Pearl Gold" },
  { id: "334", name: "Chrome Gold" },
  { id: "308", name: "Dark Brown" },
  { aliases: ["studio-77"], id: "1103", name: "Pearl Titanium" },
  { aliases: ["Transparent Clear", "Trans Clear", "studio-12"], id: "47", name: "Trans-Clear" },
  { aliases: ["Satin Trans-Clear", "Satin Clear"], id: "1055", name: "Opal Trans-Clear" },
  { id: "9999", name: "[No Color/Any Color]" },
] satisfies PartsListColor[]

export async function fetchPartsListColors({
  forceRefresh = false,
  signal,
  snapshotId,
  timeoutMs = 3_000,
}: FetchPartsListColorsOptions = {}): Promise<PartsListColor[]> {
  const { colors } = await fetchPartsListCatalogueColors({ forceRefresh, signal, snapshotId, timeoutMs })

  return colors
}

export async function fetchPartsListCatalogueColors({
  forceRefresh = false,
  signal,
  snapshotId,
  timeoutMs = 3_000,
}: FetchPartsListColorsOptions = {}): Promise<PartsListCatalogueColorsResult> {
  if (!snapshotId && !forceRefresh && preloadedColorsPromise && timeoutMs === 3_000) {
    const result = await resolvePreloadedValue(preloadedColorsPromise, {
      fallback: createFallbackCatalogueColorsResult(),
      signal,
      timeoutMs,
    })
    if (result.didUseFallback) {
      preloadedColorsPromise = null
    }

    return result.value
  }

  return requestPartsListColors({ signal, snapshotId, timeoutMs })
}

export async function fetchPartsListPartPreviews(
  parts: readonly PartsListPartPreviewInput[],
  {
    signal,
    snapshotId,
    timeoutMs = 40_000,
  }: FetchPartsListColorsOptions = {},
): Promise<ReadonlyMap<string, PartsListPartPreview>> {
  const requestedParts = normalizeRequestedPartPreviewRequests(parts)
  if (requestedParts.length === 0) {
    return new Map()
  }

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()

  try {
    if (signal?.aborted) {
      return new Map()
    }

    signal?.addEventListener("abort", abort, { once: true })
    const response = await fetch("/api/catalogue/part-previews", {
      body: JSON.stringify({
        parts: requestedParts,
        ...(snapshotId ? { snapshotId } : {}),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    })

    if (!response.ok) {
      return new Map()
    }

    const payload = (await response.json()) as CataloguePartPreviewsResponse

    return new Map(
      (payload.previews ?? [])
        .filter((preview) => preview.partNumber && preview.imageUrl)
        .map((preview) => {
          const key = preview.key || getPartsListPartPreviewKey(preview)

          return [key, { ...preview, key }] as const
        }),
    )
  } catch {
    return new Map()
  } finally {
    globalThis.clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abort)
  }
}

export async function fetchPartsListNormalization(
  rows: readonly ParsedPartsListPageRow[],
  {
    signal,
    snapshotId,
    timeoutMs = 40_000,
  }: FetchPartsListColorsOptions = {},
): Promise<PartsListNormalizationSummary | null> {
  const requestedRows = normalizeRequestedNormalizationRows(rows)
  if (requestedRows.length === 0) {
    return null
  }

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()

  try {
    if (signal?.aborted) {
      return null
    }

    signal?.addEventListener("abort", abort, { once: true })
    const response = await fetch("/api/catalogue/parts", {
      body: JSON.stringify({
        rows: requestedRows,
        ...(snapshotId ? { snapshotId } : {}),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as CataloguePartsNormalizationResponse
    return payload.normalization ?? null
  } catch {
    return null
  } finally {
    globalThis.clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abort)
  }
}

export function getPartsListPartPreviewKey(
  requestOrPartNumber: PartsListPartPreviewRequest | string,
  colorId?: string | null,
) {
  const partNumber =
    typeof requestOrPartNumber === "string"
      ? normalizePartNumber(requestOrPartNumber)
      : normalizePartNumber(requestOrPartNumber.partNumber)
  const resolvedColorId =
    typeof requestOrPartNumber === "string"
      ? normalizeColorId(colorId)
      : normalizeColorId(requestOrPartNumber.colorId)

  return `${partNumber}:${resolvedColorId || "any"}`
}

export function preloadPartsListCatalogue({
  timeoutMs = 10_000,
}: PreloadPartsListCatalogueOptions = {}) {
  if (typeof window === "undefined") {
    return Promise.resolve(false)
  }

  preloadedColorsPromise ??= requestPartsListColors({ timeoutMs })

  return preloadedColorsPromise
    .then(() => true)
    .catch(() => false)
}

async function requestPartsListColors({
  signal,
  snapshotId,
  timeoutMs = 3_000,
}: FetchPartsListColorsOptions = {}): Promise<PartsListCatalogueColorsResult> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()

  try {
    if (signal?.aborted) {
      return createFallbackCatalogueColorsResult()
    }

    signal?.addEventListener("abort", abort, { once: true })
    const response = await fetch(getCatalogueApiPath("/api/catalogue/colors", snapshotId), {
      signal: controller.signal,
    })

    if (!response.ok) {
      return createFallbackCatalogueColorsResult()
    }

    const payload = (await response.json()) as CatalogueColorsResponse

    return {
      colors: payload.colors?.length ? payload.colors : fallbackPartsListColors,
      snapshot: payload.snapshot ?? null,
    }
  } catch {
    return createFallbackCatalogueColorsResult()
  } finally {
    globalThis.clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abort)
  }
}

function createFallbackCatalogueColorsResult(): PartsListCatalogueColorsResult {
  return {
    colors: fallbackPartsListColors,
    snapshot: null,
  }
}

function getCatalogueApiPath(path: string, snapshotId: string | null | undefined) {
  if (!snapshotId) {
    return path
  }

  const params = new URLSearchParams({ snapshotId })

  return `${path}?${params}`
}

function normalizeRequestedNormalizationRows(rows: readonly ParsedPartsListPageRow[]) {
  return rows
    .filter((row) => row.partNumber && row.quantity > 0 && row.sourcePage > 0)
    .map((row) => ({
      color: row.color,
      part: row.part,
      partNumber: row.partNumber,
      quantity: row.quantity,
      sourcePage: row.sourcePage,
      sourceTextRange: row.sourceTextRange,
    }))
}

function normalizeRequestedPartPreviewRequests(parts: readonly PartsListPartPreviewInput[]) {
  const requests = new Map<string, PartsListPartPreviewRequest>()

  for (const part of parts) {
    const partNumber = normalizePartNumber(typeof part === "string" ? part : part.partNumber)
    if (!partNumber) {
      continue
    }

    const colorId = typeof part === "string" ? "" : normalizeColorId(part.colorId)
    const request = {
      partNumber,
      ...(colorId ? { colorId } : {}),
    }
    requests.set(getPartsListPartPreviewKey(request), request)
  }

  return [...requests.values()]
}

function normalizePartNumber(partNumber: string) {
  return partNumber.trim().toLowerCase()
}

function normalizeColorId(colorId: string | null | undefined) {
  return colorId?.trim() ?? ""
}

async function resolvePreloadedValue<T>(
  promise: Promise<T>,
  {
    fallback,
    signal,
    timeoutMs,
  }: {
    fallback: T
    signal?: AbortSignal
    timeoutMs: number
  },
) {
  if (signal?.aborted) {
    return { didUseFallback: true, value: fallback }
  }

  let abort: (() => void) | null = null
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null

  try {
    return await Promise.race([
      promise.then((value) => ({ didUseFallback: false, value })),
      new Promise<{ didUseFallback: true; value: T }>((resolve) => {
        const resolveFallback = () => resolve({ didUseFallback: true, value: fallback })
        abort = resolveFallback
        timeoutId = globalThis.setTimeout(resolveFallback, timeoutMs)
        signal?.addEventListener("abort", abort, { once: true })
      }),
    ])
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId)
    }
    if (abort) {
      signal?.removeEventListener("abort", abort)
    }
  }
}
