import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { type NextRequest, NextResponse } from "next/server"
import {
  parseExternalPartAliasesCsv,
  parseRebrickableElementsCsv,
  parseRebrickablePartsCsv,
} from "@/features/bagging/rebrickable-catalogue"
import { getCatalogueDirectory } from "@/server/catalogue-directory"
import {
  isCatalogueSnapshotUnavailableError,
  readActiveCatalogueSnapshot,
  readPinnedCatalogueSnapshot,
  type CatalogueSnapshotReadTarget,
} from "@/server/catalogue-snapshot"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const catalogueDir = getCatalogueDirectory()
const livePreviewBatchLimit = 500
const liveColorLookupLimit = 24
const livePreviewRequestSpacingMs = 1_000
const livePreviewMissTtlMs = 10 * 60 * 1_000
const livePreviewThrottleBackoffMs = 60 * 1_000
let genericPreviewByPartNumberCache: {
  promise: Promise<ReadonlyMap<string, CataloguePartPreview>>
  snapshotId: string
} | null = null
let canonicalPartNumberByAliasCache: {
  promise: Promise<ReadonlyMap<string, string>>
  snapshotId: string
} | null = null
let colorPreviewByPartColorCache: {
  promise: Promise<ReadonlyMap<string, CataloguePartPreview>>
  snapshotId: string
} | null = null
const livePartPreviewByKey = new Map<string, CataloguePartPreview>()
const livePartPreviewMissByKey = new Map<string, number>()
let nextLivePreviewRequestAt = 0
let livePreviewBackoffUntil = 0

type CataloguePartPreview = {
  colorId?: string
  fallbackImageUrl?: string
  imageUrl: string
  key: string
  name?: string
  partNumber: string
}

type RequestedPartPreview = {
  colorId?: string
  key: string
  lookupPartNumber?: string
  partNumber: string
}

type LivePartRecord = {
  name?: unknown
  part_img_url?: unknown
  part_num?: unknown
}

type LivePartColorRecord = {
  part?: unknown
  part_img_url?: unknown
}

type LivePreviewLookupResult = {
  cacheableMissKeys: Set<string>
  previews: CataloguePartPreview[]
}

type PartPreviewRequestPayload = {
  parts: RequestedPartPreview[]
  snapshotId: string | null
}

export async function POST(request: NextRequest) {
  try {
    const { parts: requestedParts, snapshotId } = await readPartPreviewRequestPayload(request)
    if (requestedParts.length === 0) {
      return NextResponse.json({ previews: [], status: "available" })
    }
    const catalogueTarget = await getCatalogueTarget(snapshotId)

    const [genericPreviewByPartNumber, canonicalPartNumberByAlias] = await Promise.all([
      getGenericPreviewByPartNumber(catalogueTarget),
      getCanonicalPartNumberByAlias(catalogueTarget),
    ])
    const colorPreviewByPartColor = await getColorPreviewByPartColor(catalogueTarget)
    const requestedPreviewParts = requestedParts.map((part) => ({
      ...part,
      lookupPartNumber: canonicalPartNumberByAlias.get(part.partNumber) ?? part.partNumber,
    }))
    const previews = new Map<string, CataloguePartPreview>()
    const missingGenericRequests: RequestedPartPreview[] = []
    const missingColorRequests: RequestedPartPreview[] = []
    const missingColorGenericRequests: RequestedPartPreview[] = []

    for (const part of requestedPreviewParts) {
      const livePreview = livePartPreviewByKey.get(part.key) ?? livePartPreviewByKey.get(getPreviewLookupKey(part))
      if (livePreview) {
        previews.set(part.key, createRequestKeyedPreview(livePreview, part))
        continue
      }

      if (part.colorId) {
        const colorPreview = colorPreviewByPartColor.get(getPreviewLookupKey(part))
        if (colorPreview) {
          previews.set(part.key, createRequestKeyedPreview(colorPreview, part))
          continue
        }

        const genericPreview = genericPreviewByPartNumber.get(getPreviewLookupPartNumber(part))
        if (isLivePreviewBackedOff() || isLivePreviewMissCached(part.key)) {
          if (genericPreview) {
            previews.set(part.key, createColorKeyedGenericPreview(genericPreview, part))
          }
          continue
        }

        missingColorRequests.push(part)
        continue
      }

      if (isLivePreviewMissCached(part.key)) {
        continue
      }

      const genericPreview = genericPreviewByPartNumber.get(getPreviewLookupPartNumber(part))
      if (genericPreview) {
        previews.set(part.key, createRequestKeyedPreview(genericPreview, part))
      } else {
        missingGenericRequests.push(part)
      }
    }

    if (missingColorRequests.length > 0) {
      const liveColorResult = await fetchLiveColorPartPreviews(missingColorRequests, request.signal)
      const livePreviewByLookupKey = createLivePreviewByLookupKey(liveColorResult)

      for (const part of missingColorRequests) {
        if (previews.has(part.key)) {
          continue
        }

        const livePreview = livePreviewByLookupKey.get(getPreviewLookupKey(part))
        if (livePreview) {
          const genericPreview = genericPreviewByPartNumber.get(getPreviewLookupPartNumber(part))
          const lookupPreview = withFallbackPreviewMetadata(livePreview, genericPreview)
          const requestPreview = createRequestKeyedPreview(lookupPreview, part)
          livePartPreviewByKey.set(getPreviewLookupKey(part), lookupPreview)
          livePartPreviewByKey.set(part.key, requestPreview)
          previews.set(part.key, requestPreview)
          continue
        }

        const genericPreview = genericPreviewByPartNumber.get(getPreviewLookupPartNumber(part))
        if (genericPreview) {
          previews.set(part.key, createColorKeyedGenericPreview(genericPreview, part))
        } else {
          missingColorGenericRequests.push(part)
        }
        if (liveColorResult.cacheableMissKeys.has(getPreviewLookupKey(part))) {
          cacheLivePreviewMiss(part.key)
        }
      }
    }

    const genericFallbackRequests = [...missingGenericRequests, ...missingColorGenericRequests]
    if (genericFallbackRequests.length > 0) {
      const genericPartNumbersToFetch = [...new Set(genericFallbackRequests.map(getPreviewLookupPartNumber))]
        .filter((partNumber) => !isLivePreviewMissCached(getPartPreviewKey(partNumber)))
        .slice(0, livePreviewBatchLimit)
      const liveGenericResult = await fetchLiveGenericPartPreviews(genericPartNumbersToFetch, request.signal)
      const livePreviewByLookupKey = createLivePreviewByLookupKey(liveGenericResult)
      for (const livePreview of liveGenericResult.previews) {
        livePartPreviewByKey.set(livePreview.key, livePreview)
      }

      for (const part of genericFallbackRequests) {
        if (previews.has(part.key)) {
          continue
        }

        const livePreview = livePreviewByLookupKey.get(getGenericPreviewLookupKey(part))
        if (livePreview) {
          const requestPreview = part.colorId
            ? createColorKeyedGenericPreview(livePreview, part)
            : createRequestKeyedPreview(livePreview, part)
          livePartPreviewByKey.set(part.key, requestPreview)
          previews.set(part.key, requestPreview)
          continue
        }

        const genericPreviewLookupKey = getGenericPreviewLookupKey(part)
        if (liveGenericResult.cacheableMissKeys.has(genericPreviewLookupKey)) {
          cacheLivePreviewMiss(genericPreviewLookupKey)
          if (part.colorId) {
            cacheLivePreviewMiss(part.key)
          }
        }
      }
    }

    return NextResponse.json({
      previews: [...previews.values()],
      snapshot: catalogueTarget.snapshot,
      status: "available",
    })
  } catch {
    genericPreviewByPartNumberCache = null
    canonicalPartNumberByAliasCache = null
    colorPreviewByPartColorCache = null

    return NextResponse.json(
      {
        previews: [],
        status: "missing",
      },
      { status: 503 },
    )
  }
}

async function getCatalogueTarget(snapshotId: string | null) {
  if (!snapshotId) {
    return readActiveCatalogueSnapshot(catalogueDir)
  }

  try {
    return await readPinnedCatalogueSnapshot(catalogueDir, snapshotId)
  } catch (error) {
    if (isCatalogueSnapshotUnavailableError(error)) {
      return readActiveCatalogueSnapshot(catalogueDir)
    }

    throw error
  }
}

async function getGenericPreviewByPartNumber(target: CatalogueSnapshotReadTarget) {
  if (genericPreviewByPartNumberCache?.snapshotId !== target.snapshot.id) {
    genericPreviewByPartNumberCache = {
      promise: readGenericPreviewByPartNumber(target),
      snapshotId: target.snapshot.id,
    }
  }

  return genericPreviewByPartNumberCache.promise
}

async function getCanonicalPartNumberByAlias(target: CatalogueSnapshotReadTarget) {
  if (canonicalPartNumberByAliasCache?.snapshotId !== target.snapshot.id) {
    canonicalPartNumberByAliasCache = {
      promise: readCanonicalPartNumberByAlias(target),
      snapshotId: target.snapshot.id,
    }
  }

  return canonicalPartNumberByAliasCache.promise
}

async function getColorPreviewByPartColor(target: CatalogueSnapshotReadTarget) {
  if (colorPreviewByPartColorCache?.snapshotId !== target.snapshot.id) {
    colorPreviewByPartColorCache = {
      promise: readColorPreviewByPartColor(target),
      snapshotId: target.snapshot.id,
    }
  }

  return colorPreviewByPartColorCache.promise
}

async function readGenericPreviewByPartNumber(target: CatalogueSnapshotReadTarget) {
  const [csvText, canonicalPartNumberByAlias] = await Promise.all([
    readFile(join(target.directory, "parts.csv"), "utf8"),
    getCanonicalPartNumberByAlias(target),
  ])
  const previews = new Map(
    parseRebrickablePartsCsv(csvText)
      .filter((part) => part.imageUrl)
      .map((part) => {
        const partNumber = normalizePartNumber(part.partNum)

        return [
          partNumber,
          {
            imageUrl: part.imageUrl ?? "",
            key: getPartPreviewKey(partNumber),
            ...(part.name ? { name: part.name } : {}),
            partNumber,
          },
        ] as const
      }),
  )
  for (const [aliasPartNumber, canonicalPartNumber] of canonicalPartNumberByAlias) {
    const preview = previews.get(canonicalPartNumber)
    if (!aliasPartNumber || !preview || previews.has(aliasPartNumber)) {
      continue
    }

    previews.set(aliasPartNumber, createAliasGenericPreview(preview, aliasPartNumber))
  }

  return previews
}

async function readCanonicalPartNumberByAlias(target: CatalogueSnapshotReadTarget) {
  const aliasesCsvText = await readFile(join(target.directory, "ldraw_part_aliases.csv"), "utf8").catch(() => null)
  const aliases = aliasesCsvText ? parseExternalPartAliasesCsv(aliasesCsvText) : []

  return new Map(
    aliases
      .map((alias) => [normalizePartNumber(alias.alias), normalizePartNumber(alias.canonical)] as const)
      .filter(([alias, canonical]) => alias && canonical),
  )
}

async function readColorPreviewByPartColor(target: CatalogueSnapshotReadTarget) {
  const elementsCsvText = await readFile(join(target.directory, "elements.csv"), "utf8").catch(() => null)
  if (!elementsCsvText?.trim()) {
    return new Map<string, CataloguePartPreview>()
  }

  const [genericPreviewByPartNumber, canonicalPartNumberByAlias] = await Promise.all([
    getGenericPreviewByPartNumber(target),
    getCanonicalPartNumberByAlias(target),
  ])
  const previews = new Map<string, CataloguePartPreview>()
  const previewsByPartNumber = new Map<string, CataloguePartPreview[]>()

  for (const element of parseRebrickableElementsCsv(elementsCsvText)) {
    const partNumber = normalizePartNumber(element.partNum)
    const colorId = normalizeColorId(element.colorId)
    const elementId = element.elementId.trim()
    const key = getPartPreviewKey(partNumber, colorId)
    if (!partNumber || !colorId || !elementId || previews.has(key)) {
      continue
    }

    const genericPreview = genericPreviewByPartNumber.get(partNumber)
    const imageUrl = getElementImageUrl(elementId)
    const preview = {
      colorId,
      ...(genericPreview?.imageUrl && genericPreview.imageUrl !== imageUrl
        ? { fallbackImageUrl: genericPreview.imageUrl }
        : {}),
      imageUrl,
      key,
      ...(genericPreview?.name ? { name: genericPreview.name } : {}),
      partNumber,
    }
    previews.set(key, preview)

    const partPreviews = previewsByPartNumber.get(partNumber) ?? []
    partPreviews.push(preview)
    previewsByPartNumber.set(partNumber, partPreviews)
  }

  for (const [aliasPartNumber, canonicalPartNumber] of canonicalPartNumberByAlias) {
    const canonicalPreviews = previewsByPartNumber.get(canonicalPartNumber)
    if (!aliasPartNumber || !canonicalPreviews) {
      continue
    }

    for (const preview of canonicalPreviews) {
      if (!preview.colorId) {
        continue
      }

      const aliasKey = getPartPreviewKey(aliasPartNumber, preview.colorId)
      if (previews.has(aliasKey)) {
        continue
      }

      previews.set(aliasKey, {
        ...preview,
        key: aliasKey,
        partNumber: aliasPartNumber,
      })
    }
  }

  return previews
}

function createColorKeyedGenericPreview(preview: CataloguePartPreview, request: RequestedPartPreview) {
  return {
    ...(request.colorId ? { colorId: request.colorId } : {}),
    ...(preview.fallbackImageUrl ? { fallbackImageUrl: preview.fallbackImageUrl } : {}),
    imageUrl: preview.imageUrl,
    key: request.key,
    ...(preview.name ? { name: preview.name } : {}),
    partNumber: request.partNumber,
  }
}

function createAliasGenericPreview(preview: CataloguePartPreview, partNumber: string) {
  return {
    ...(preview.fallbackImageUrl ? { fallbackImageUrl: preview.fallbackImageUrl } : {}),
    imageUrl: preview.imageUrl,
    key: getPartPreviewKey(partNumber),
    ...(preview.name ? { name: preview.name } : {}),
    partNumber,
  }
}

function createRequestKeyedPreview(preview: CataloguePartPreview, request: RequestedPartPreview) {
  return {
    ...(request.colorId ? { colorId: request.colorId } : {}),
    ...(preview.fallbackImageUrl ? { fallbackImageUrl: preview.fallbackImageUrl } : {}),
    imageUrl: preview.imageUrl,
    key: request.key,
    ...(preview.name ? { name: preview.name } : {}),
    partNumber: request.partNumber,
  }
}

async function readPartPreviewRequestPayload(request: NextRequest): Promise<PartPreviewRequestPayload> {
  const payload = (await request.json().catch(() => null)) as { parts?: unknown; snapshotId?: unknown } | null
  if (!Array.isArray(payload?.parts)) {
    return { parts: [], snapshotId: getPayloadSnapshotId(payload) }
  }

  const requests = new Map<string, RequestedPartPreview>()
  for (const part of payload.parts) {
    const partNumber =
      typeof part === "string"
        ? normalizePartNumber(part)
        : isObjectRecord(part)
          ? normalizePartNumber(part.partNumber)
          : ""
    if (!partNumber) {
      continue
    }

    const colorId = isObjectRecord(part) ? normalizeColorId(part.colorId) : ""
    const request = {
      ...(colorId ? { colorId } : {}),
      key: getPartPreviewKey(partNumber, colorId),
      partNumber,
    }
    requests.set(request.key, request)
  }

  return {
    parts: [...requests.values()],
    snapshotId: getPayloadSnapshotId(payload),
  }
}

function getPayloadSnapshotId(payload: { snapshotId?: unknown } | null) {
  const snapshotId = payload?.snapshotId

  return typeof snapshotId === "string" && snapshotId.trim() ? snapshotId.trim() : null
}

async function fetchLiveColorPartPreviews(requests: readonly RequestedPartPreview[], signal: AbortSignal) {
  const apiKey = process.env.REBRICKABLE_API_KEY?.trim()
  if (!apiKey || requests.length === 0) {
    return createEmptyLivePreviewLookupResult()
  }

  const uniqueRequests = createUniqueColorPreviewRequests(requests).slice(0, liveColorLookupLimit)
  const result = createEmptyLivePreviewLookupResult()

  for (const request of uniqueRequests) {
    mergeLivePreviewLookupResult(result, await fetchLivePartColorPreview({ apiKey, request, signal }))
  }

  return result
}

async function fetchLiveGenericPartPreviews(partNumbers: readonly string[], signal: AbortSignal) {
  const apiKey = process.env.REBRICKABLE_API_KEY?.trim()
  if (!apiKey || partNumbers.length === 0 || isLivePreviewBackedOff()) {
    return createEmptyLivePreviewLookupResult()
  }

  return fetchLivePartsListPreviews({ apiKey, partNumbers, signal })
}

async function fetchLivePartsListPreviews({
  apiKey,
  partNumbers,
  signal,
}: {
  apiKey: string
  partNumbers: readonly string[]
  signal: AbortSignal
}) {
  if (partNumbers.length === 0 || isLivePreviewBackedOff()) {
    return createEmptyLivePreviewLookupResult()
  }

  try {
    const boundedPartNumbers = partNumbers.slice(0, livePreviewBatchLimit)
    const params = new URLSearchParams({
      inc_part_details: "1",
      page_size: String(Math.min(boundedPartNumbers.length, livePreviewBatchLimit)),
      part_nums: boundedPartNumbers.join(","),
    })
    await waitForLivePreviewRequestSlot(signal)
    const response = await fetch(`https://rebrickable.com/api/v3/lego/parts/?${params}`, {
      headers: {
        Authorization: `key ${apiKey}`,
      },
      signal,
    })

    if (!response.ok) {
      if (response.status === 429) {
        applyLivePreviewBackoff(response)
      }
      return createEmptyLivePreviewLookupResult()
    }

    const payload = (await response.json()) as { results?: LivePartRecord[] }
    const previews = (payload.results ?? [])
      .map((part) => createPreviewFromLivePart(part))
      .filter((part): part is CataloguePartPreview => Boolean(part?.partNumber && part.imageUrl))
    const previewKeys = new Set(previews.map((preview) => preview.key))
    const cacheableMissKeys = new Set(
      boundedPartNumbers
        .map((partNumber) => getPartPreviewKey(partNumber))
        .filter((key) => !previewKeys.has(key)),
    )

    return {
      cacheableMissKeys,
      previews,
    }
  } catch {
    return createEmptyLivePreviewLookupResult()
  }
}

async function fetchLivePartColorPreview({
  apiKey,
  request,
  signal,
}: {
  apiKey: string
  request: RequestedPartPreview
  signal: AbortSignal
}) {
  if (!request.colorId || isLivePreviewBackedOff()) {
    return createEmptyLivePreviewLookupResult()
  }

  const lookupKey = getPreviewLookupKey(request)

  try {
    await waitForLivePreviewRequestSlot(signal)
    const response = await fetch(
      `https://rebrickable.com/api/v3/lego/parts/${encodeURIComponent(getPreviewLookupPartNumber(request))}/colors/${encodeURIComponent(request.colorId)}/`,
      {
        headers: {
          Authorization: `key ${apiKey}`,
        },
        signal,
      },
    )

    if (!response.ok) {
      if (response.status === 429) {
        applyLivePreviewBackoff(response)
        return createEmptyLivePreviewLookupResult()
      }

      return {
        cacheableMissKeys: response.status === 404 ? new Set([lookupKey]) : new Set<string>(),
        previews: [],
      }
    }

    const payload = (await response.json()) as LivePartColorRecord
    const preview = createPreviewFromLivePartColor(payload, request)
    if (!preview) {
      return {
        cacheableMissKeys: new Set([lookupKey]),
        previews: [],
      }
    }

    return {
      cacheableMissKeys: new Set<string>(),
      previews: [preview],
    }
  } catch {
    return createEmptyLivePreviewLookupResult()
  }
}

function createEmptyLivePreviewLookupResult(): LivePreviewLookupResult {
  return {
    cacheableMissKeys: new Set(),
    previews: [],
  }
}

function createLivePreviewByLookupKey(result: LivePreviewLookupResult) {
  return new Map(result.previews.map((preview) => [preview.key, preview] as const))
}

function mergeLivePreviewLookupResult(target: LivePreviewLookupResult, source: LivePreviewLookupResult) {
  target.previews.push(...source.previews)
  for (const key of source.cacheableMissKeys) {
    target.cacheableMissKeys.add(key)
  }
}

async function waitForLivePreviewRequestSlot(signal: AbortSignal) {
  if (signal.aborted) {
    throw new Error("Preview request aborted.")
  }

  const now = Date.now()
  const waitMs = Math.max(0, nextLivePreviewRequestAt - now)
  nextLivePreviewRequestAt = Math.max(now, nextLivePreviewRequestAt) + livePreviewRequestSpacingMs

  if (waitMs > 0) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timeoutId)
        signal.removeEventListener("abort", abort)
        reject(new Error("Preview request aborted."))
      }
      const finish = () => {
        signal.removeEventListener("abort", abort)
        resolve()
      }
      const timeoutId = setTimeout(finish, waitMs)
      signal.addEventListener("abort", abort, { once: true })
    })
  }
}

function cacheLivePreviewMiss(key: string) {
  livePartPreviewMissByKey.set(key, Date.now() + livePreviewMissTtlMs)
}

function isLivePreviewMissCached(key: string) {
  const expiresAt = livePartPreviewMissByKey.get(key)
  if (!expiresAt) {
    return false
  }

  if (expiresAt > Date.now()) {
    return true
  }

  livePartPreviewMissByKey.delete(key)
  return false
}

function isLivePreviewBackedOff() {
  return livePreviewBackoffUntil > Date.now()
}

function applyLivePreviewBackoff(response: Response) {
  const retryAfterSeconds = Number(response.headers.get("retry-after"))
  const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds * 1_000
    : livePreviewThrottleBackoffMs

  livePreviewBackoffUntil = Math.max(livePreviewBackoffUntil, Date.now() + retryAfterMs)
}

function createPreviewFromLivePart(part: LivePartRecord, colorId?: string) {
  const imageUrl = typeof part.part_img_url === "string" ? part.part_img_url.trim() : ""
  const name = typeof part.name === "string" ? part.name.trim() : ""
  const partNumber = typeof part.part_num === "string" ? normalizePartNumber(part.part_num) : ""
  if (!imageUrl || !partNumber) {
    return null
  }

  return {
    ...(colorId ? { colorId } : {}),
    imageUrl,
    key: getPartPreviewKey(partNumber, colorId),
    ...(name ? { name } : {}),
    partNumber,
  }
}

function createPreviewFromLivePartColor(partColor: LivePartColorRecord, request: RequestedPartPreview) {
  const imageUrl = typeof partColor.part_img_url === "string" ? partColor.part_img_url.trim() : ""
  if (!imageUrl || !request.colorId) {
    return null
  }

  const partDetails = isObjectRecord(partColor.part) ? partColor.part : null
  const name = typeof partDetails?.name === "string" ? partDetails.name.trim() : ""
  const responsePartNumber = typeof partDetails?.part_num === "string" ? normalizePartNumber(partDetails.part_num) : ""
  const partNumber = responsePartNumber || getPreviewLookupPartNumber(request)

  return {
    colorId: request.colorId,
    imageUrl,
    key: getPartPreviewKey(partNumber, request.colorId),
    ...(name ? { name } : {}),
    partNumber,
  }
}

function withFallbackPreviewMetadata(
  preview: CataloguePartPreview,
  fallbackPreview: CataloguePartPreview | undefined,
) {
  const fallbackName = preview.name ? undefined : fallbackPreview?.name
  const fallbackImageUrl = fallbackPreview?.imageUrl && fallbackPreview.imageUrl !== preview.imageUrl
    ? fallbackPreview.imageUrl
    : undefined
  if (!fallbackName && !fallbackImageUrl) {
    return preview
  }

  return {
    ...preview,
    ...(fallbackImageUrl ? { fallbackImageUrl } : {}),
    ...(fallbackName ? { name: fallbackName } : {}),
  }
}

function createUniqueColorPreviewRequests(requests: readonly RequestedPartPreview[]) {
  const requestsByLookupKey = new Map<string, RequestedPartPreview>()
  for (const request of requests) {
    if (!request.colorId) {
      continue
    }

    requestsByLookupKey.set(getPreviewLookupKey(request), request)
  }

  return [...requestsByLookupKey.values()]
}

function getPreviewLookupPartNumber(request: RequestedPartPreview) {
  return request.lookupPartNumber ?? request.partNumber
}

function getPreviewLookupKey(request: RequestedPartPreview) {
  return getPartPreviewKey(getPreviewLookupPartNumber(request), request.colorId)
}

function getGenericPreviewLookupKey(request: RequestedPartPreview) {
  return getPartPreviewKey(getPreviewLookupPartNumber(request))
}

function getPartPreviewKey(partNumber: string, colorId?: string | null) {
  return `${normalizePartNumber(partNumber)}:${normalizeColorId(colorId) || "any"}`
}

function getElementImageUrl(elementId: string) {
  return `https://cdn.rebrickable.com/media/parts/elements/${encodeURIComponent(elementId)}.jpg`
}

function normalizePartNumber(partNumber: unknown) {
  return typeof partNumber === "string" ? partNumber.trim().toLowerCase() : ""
}

function normalizeColorId(colorId: unknown) {
  return typeof colorId === "string" ? colorId.trim() : ""
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
