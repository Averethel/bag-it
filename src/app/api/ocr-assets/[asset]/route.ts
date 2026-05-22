import { NextResponse } from "next/server"
import {
  isPaddleOcrModelAssetFile,
  paddleOcrRemoteModelAssets,
} from "@/features/bagging/paddle-ocr-assets"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const runtime = "nodejs"

const browserCacheControl = "public, max-age=86400, stale-while-revalidate=604800"

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params
  if (!isPaddleOcrModelAssetFile(asset)) {
    return NextResponse.json({ error: "Unknown OCR model asset" }, { status: 404 })
  }

  const upstream = await fetchPaddleOcrAsset(paddleOcrRemoteModelAssets[asset])
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "OCR model asset unavailable" }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    headers: createOcrAssetResponseHeaders(upstream.headers),
    status: 200,
  })
}

async function fetchPaddleOcrAsset(url: string) {
  try {
    return await fetch(url, { cache: "no-store" })
  } catch {
    return new Response(null, { status: 502 })
  }
}

function createOcrAssetResponseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers({
    "Cache-Control": browserCacheControl,
    "Content-Type": upstreamHeaders.get("content-type") ?? "application/x-tar",
  })

  copyHeader(upstreamHeaders, headers, "content-length")
  copyHeader(upstreamHeaders, headers, "etag")
  copyHeader(upstreamHeaders, headers, "last-modified")

  return headers
}

function copyHeader(source: Headers, target: Headers, headerName: string) {
  const value = source.get(headerName)
  if (value) {
    target.set(headerName, value)
  }
}
