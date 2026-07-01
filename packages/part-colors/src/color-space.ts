import type { RgbColor } from "./contracts"

export interface LabColor {
  a: number
  b: number
  l: number
}

export interface LchColor {
  c: number
  h: number
  l: number
}

export function rgbToHex(rgb: RgbColor): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`
}

export function colorDistanceCiede2000(left: RgbColor, right: RgbColor): number {
  return ciede2000(rgbToLab(left), rgbToLab(right))
}

export function rgbToLch(rgb: RgbColor): LchColor {
  return labToLch(rgbToLab(rgb))
}

export function rgbToLab(rgb: RgbColor): LabColor {
  const linearRgb = {
    b: srgbChannelToLinear(rgb.b / 255),
    g: srgbChannelToLinear(rgb.g / 255),
    r: srgbChannelToLinear(rgb.r / 255),
  }
  const xyz = {
    x: linearRgb.r * 0.4124564 + linearRgb.g * 0.3575761 + linearRgb.b * 0.1804375,
    y: linearRgb.r * 0.2126729 + linearRgb.g * 0.7151522 + linearRgb.b * 0.072175,
    z: linearRgb.r * 0.0193339 + linearRgb.g * 0.119192 + linearRgb.b * 0.9503041,
  }
  const xr = labPivot(xyz.x / 0.95047)
  const yr = labPivot(xyz.y)
  const zr = labPivot(xyz.z / 1.08883)

  return {
    a: 500 * (xr - yr),
    b: 200 * (yr - zr),
    l: 116 * yr - 16,
  }
}

function labToLch(lab: LabColor): LchColor {
  return {
    c: Math.hypot(lab.a, lab.b),
    h: hueDegrees(lab.b, lab.a),
    l: lab.l,
  }
}

function srgbChannelToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function labPivot(value: number): number {
  return value > 216 / 24389 ? Math.cbrt(value) : (841 / 108) * value + 4 / 29
}

function ciede2000(left: LabColor, right: LabColor): number {
  const c1 = Math.hypot(left.a, left.b)
  const c2 = Math.hypot(right.a, right.b)
  const cBar = (c1 + c2) / 2
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)))
  const a1Prime = (1 + g) * left.a
  const a2Prime = (1 + g) * right.a
  const c1Prime = Math.hypot(a1Prime, left.b)
  const c2Prime = Math.hypot(a2Prime, right.b)
  const h1Prime = hueDegrees(left.b, a1Prime)
  const h2Prime = hueDegrees(right.b, a2Prime)
  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) *
    Math.sin(degreesToRadians(deltaHuePrime(c1Prime, c2Prime, h1Prime, h2Prime) / 2))
  const lBarPrime = (left.l + right.l) / 2
  const cBarPrime = (c1Prime + c2Prime) / 2
  const hBarPrime = meanHuePrime(c1Prime, c2Prime, h1Prime, h2Prime)
  const t = 1 -
    0.17 * Math.cos(degreesToRadians(hBarPrime - 30)) +
    0.24 * Math.cos(degreesToRadians(2 * hBarPrime)) +
    0.32 * Math.cos(degreesToRadians(3 * hBarPrime + 6)) -
    0.2 * Math.cos(degreesToRadians(4 * hBarPrime - 63))
  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2))
  const rc = 2 * Math.sqrt(cBarPrime ** 7 / (cBarPrime ** 7 + 25 ** 7))
  const sl = 1 + (0.015 * (lBarPrime - 50) ** 2) / Math.sqrt(20 + (lBarPrime - 50) ** 2)
  const sc = 1 + 0.045 * cBarPrime
  const sh = 1 + 0.015 * cBarPrime * t
  const rt = -Math.sin(degreesToRadians(2 * deltaTheta)) * rc
  const lTerm = (right.l - left.l) / sl
  const cTerm = (c2Prime - c1Prime) / sc
  const hTerm = deltaHPrime / sh

  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm)
}

function hueDegrees(b: number, a: number): number {
  if (a === 0 && b === 0) {
    return 0
  }

  const hue = radiansToDegrees(Math.atan2(b, a))

  return hue >= 0 ? hue : hue + 360
}

function deltaHuePrime(c1Prime: number, c2Prime: number, h1Prime: number, h2Prime: number): number {
  if (c1Prime * c2Prime === 0) {
    return 0
  }

  const difference = h2Prime - h1Prime

  if (Math.abs(difference) <= 180) {
    return difference
  }

  return difference > 180 ? difference - 360 : difference + 360
}

function meanHuePrime(c1Prime: number, c2Prime: number, h1Prime: number, h2Prime: number): number {
  if (c1Prime * c2Prime === 0) {
    return h1Prime + h2Prime
  }

  if (Math.abs(h1Prime - h2Prime) <= 180) {
    return (h1Prime + h2Prime) / 2
  }

  return h1Prime + h2Prime < 360 ? (h1Prime + h2Prime + 360) / 2 : (h1Prime + h2Prime - 360) / 2
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI
}
