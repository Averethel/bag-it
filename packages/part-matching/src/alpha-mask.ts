import type {
  PartMatchAlphaMask,
  PartMatchRenderedPixels,
} from "./contracts"

export function normalizeAlphaMask(
  alphaMask: PartMatchAlphaMask | null | undefined,
): Uint8ClampedArray | null {
  if (!alphaMask || !validDimensions(alphaMask.width, alphaMask.height)) {
    return null
  }

  return normalizeByteData(alphaMask.data, alphaMask.width * alphaMask.height)
}

export function normalizeRenderedPixels(
  renderedPixels: PartMatchRenderedPixels | null | undefined,
): Uint8ClampedArray | null {
  if (!renderedPixels || !validDimensions(renderedPixels.width, renderedPixels.height)) {
    return null
  }

  return normalizeByteData(renderedPixels.data, renderedPixels.width * renderedPixels.height * 4)
}

function normalizeByteData(
  data: Uint8ClampedArray | number[] | Record<string, number> | undefined,
  expectedLength: number,
): Uint8ClampedArray | null {
  if (!data) {
    return null
  }

  if (data instanceof Uint8ClampedArray) {
    return data.length >= expectedLength
      ? data.slice(0, expectedLength)
      : null
  }

  const bytes = new Uint8ClampedArray(expectedLength)

  if (Array.isArray(data)) {
    for (let index = 0; index < expectedLength; index += 1) {
      bytes[index] = clampByte(data[index] ?? 0)
    }

    return bytes
  }

  for (let index = 0; index < expectedLength; index += 1) {
    bytes[index] = clampByte(data[String(index)] ?? 0)
  }

  return bytes
}

function validDimensions(width: number, height: number): boolean {
  return Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
