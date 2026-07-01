import type { PartMatchColor } from "./contracts"

export function colorsAreCompatible(
  left: PartMatchColor | null | undefined,
  right: PartMatchColor | null | undefined,
): boolean {
  const leftTrustedKey = readTrustedManualColorKey(left)
  const rightTrustedKey = readTrustedManualColorKey(right)

  if (leftTrustedKey && rightTrustedKey) {
    return leftTrustedKey === rightTrustedKey
  }

  const leftNameKey = readNamedColorKey(left)
  const rightNameKey = readNamedColorKey(right)

  if (leftNameKey && rightNameKey) {
    return leftNameKey === rightNameKey
  }

  const leftKey = readUntrustedColorKey(left)
  const rightKey = readUntrustedColorKey(right)

  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

export function readColorKey(color: PartMatchColor | null | undefined): string | null {
  return readTrustedManualColorKey(color) ??
    readNamedColorKey(color) ??
    readUntrustedColorKey(color)
}

function readTrustedManualColorKey(color: PartMatchColor | null | undefined): string | null {
  return color?.manualClassTrusted && color.manualClassId
    ? `manual:${normalize(color.manualClassId)}`
    : null
}

function readNamedColorKey(color: PartMatchColor | null | undefined): string | null {
  return color?.name && color.family
    ? `name:${normalize(color.family)}:${normalize(color.name)}`
    : null
}

function readUntrustedColorKey(color: PartMatchColor | null | undefined): string | null {
  return color?.key ? `key:${normalize(color.key)}` : null
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}
