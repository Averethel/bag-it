const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function digestNumbers(values: readonly number[]): string {
  let hash = FNV_OFFSET_BASIS

  for (const value of values) {
    hash ^= Math.max(0, Math.min(255, Math.round(value)))
    hash = Math.imul(hash, FNV_PRIME)
  }

  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function digestString(value: string): string {
  let hash = FNV_OFFSET_BASIS

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }

  return (hash >>> 0).toString(16).padStart(8, "0")
}
