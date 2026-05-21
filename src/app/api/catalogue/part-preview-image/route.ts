import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const maxPreviewImageBytes = 1_500_000
const allowedPreviewImageHosts = new Set(["cdn.rebrickable.com"])

export async function GET(request: NextRequest) {
  const imageUrl = getAllowedPreviewImageUrl(new URL(request.url).searchParams.get("url"))
  if (!imageUrl) {
    return NextResponse.json(
      {
        message: "Use a valid Rebrickable catalogue preview image URL.",
        status: "invalid_preview_url",
      },
      { status: 400 },
    )
  }

  try {
    const response = await fetch(imageUrl, {
      cache: "force-cache",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: request.signal,
    })
    if (!response.ok) {
      return NextResponse.json(
        {
          status: "preview_unavailable",
        },
        { status: response.status },
      )
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        {
          status: "invalid_preview_response",
        },
        { status: 415 },
      )
    }

    const imageBytes = await response.arrayBuffer()
    if (imageBytes.byteLength > maxPreviewImageBytes) {
      return NextResponse.json(
        {
          status: "preview_too_large",
        },
        { status: 413 },
      )
    }

    return new NextResponse(imageBytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(imageBytes.byteLength),
        "Content-Type": contentType,
      },
      status: 200,
    })
  } catch {
    return NextResponse.json(
      {
        status: "preview_unavailable",
      },
      { status: 503 },
    )
  }
}

function getAllowedPreviewImageUrl(value: string | null) {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || !allowedPreviewImageHosts.has(url.hostname)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}
