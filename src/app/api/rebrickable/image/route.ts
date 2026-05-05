import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedImageHosts = new Set(["cdn.rebrickable.com"]);
const requestTimeoutMs = 10_000;

export async function GET(request: Request) {
  const imageUrl = new URL(request.url).searchParams.get("url");
  const parsedImageUrl = parseAllowedImageUrl(imageUrl);

  if (!parsedImageUrl) {
    return NextResponse.json(
      { error: "Only Rebrickable CDN image URLs are supported." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(parsedImageUrl, {
      cache: "force-cache",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Image request failed with HTTP ${response.status}.` },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Rebrickable URL did not return an image." },
        { status: 502 },
      );
    }

    return new NextResponse(response.body, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
      status: 200,
    });
  } catch (error) {
    return NextResponse.json(
      { error: toImageProxyErrorMessage(error) },
      { status: 502 },
    );
  }
}

function parseAllowedImageUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || !allowedImageHosts.has(url.hostname)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function toImageProxyErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "Rebrickable image request timed out.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Rebrickable image request failed.";
}
