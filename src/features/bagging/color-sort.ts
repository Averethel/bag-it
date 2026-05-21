const colorNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})
const unresolvedColorSortRank = 999
const colorFamilySortPatterns = [
  [/\bblack\b/, 0],
  [/\bgr[ae]y\b|\bsilver\b/, 1],
  [/\bwhite\b|\bclear\b/, 2],
  [/\btan\b|\bnougat\b|\bflesh\b|\bsalmon\b/, 3],
  [/\bbrown\b|\bcopper\b|\brust\b/, 4],
  [/\bred\b|\bcoral\b/, 5],
  [/\borange\b/, 6],
  [/\byellow\b|\bgold\b/, 7],
  [/\bgreen\b|\bolive\b|\blime\b/, 8],
  [/\bblue\b|\bazure\b|\bturquoise\b|\baqua\b|\bteal\b|\bcyan\b/, 9],
  [/\bpurple\b|\bviolet\b|\blavender\b/, 10],
  [/\bpink\b|\bmagenta\b|\brose\b/, 11],
] as const
const colorBaseModifierPattern =
  /\b(?:bright|chrome|dark|earth|flat|glitter|glow|in|light|medium|metallic|milky|modulex|neon|opal|opaque|pearl|reddish|sand|satin|speckle|trans|transparent|very|yellowish)\b/g

type ColorSortKey = {
  baseName: string
  familyRank: number
  materialRank: number
  normalizedName: string
  shadeRank: number
}

export function compareColorNames(left: string, right: string) {
  const leftKey = getColorSortKey(left)
  const rightKey = getColorSortKey(right)

  return (
    leftKey.familyRank - rightKey.familyRank
    || colorNameCollator.compare(leftKey.baseName, rightKey.baseName)
    || leftKey.shadeRank - rightKey.shadeRank
    || leftKey.materialRank - rightKey.materialRank
    || colorNameCollator.compare(leftKey.normalizedName, rightKey.normalizedName)
  )
}

function getColorSortKey(colorName: string): ColorSortKey {
  const normalizedName = normalizeColorSortName(colorName)

  if (normalizedName === "unresolved color") {
    return {
      baseName: normalizedName,
      familyRank: unresolvedColorSortRank,
      materialRank: 0,
      normalizedName,
      shadeRank: 0,
    }
  }

  const baseName = getColorSortBaseName(normalizedName)

  return {
    baseName,
    familyRank: getColorFamilySortRank(baseName),
    materialRank: getColorMaterialSortRank(normalizedName),
    normalizedName,
    shadeRank: getColorShadeSortRank(normalizedName),
  }
}

function normalizeColorSortName(colorName: string) {
  return colorName
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\bbluish\s+gr[ae]y\b/g, "gray")
    .replace(/\bgr[ae]y\b/g, "gray")
    .replace(/\s+/g, " ")
}

function getColorSortBaseName(normalizedName: string) {
  const baseName = normalizedName
    .replace(colorBaseModifierPattern, " ")
    .replace(/\s+/g, " ")
    .trim()

  return baseName || normalizedName
}

function getColorFamilySortRank(baseName: string) {
  const matchedFamily = colorFamilySortPatterns.find(([pattern]) => pattern.test(baseName))

  return matchedFamily?.[1] ?? unresolvedColorSortRank - 1
}

function getColorShadeSortRank(normalizedName: string) {
  let rank = 0

  if (/\bblack\b/.test(normalizedName)) {
    rank -= 30
  }
  if (/\bdark\b/.test(normalizedName)) {
    rank -= 20
  }
  if (/\bearth\b/.test(normalizedName)) {
    rank -= 12
  }
  if (/\bsand\b/.test(normalizedName)) {
    rank -= 8
  }
  if (/\bmedium\b/.test(normalizedName)) {
    rank += 5
  }
  if (/\blight\b/.test(normalizedName)) {
    rank += 18
  }
  if (/\bbright\b/.test(normalizedName)) {
    rank += 8
  }
  if (/\bvery\b/.test(normalizedName)) {
    rank += 6
  }
  if (/\bneon\b/.test(normalizedName)) {
    rank += 10
  }

  return rank
}

function getColorMaterialSortRank(normalizedName: string) {
  if (/\btrans(?:parent)?\b/.test(normalizedName)) {
    return 20
  }
  if (/\bsatin\b/.test(normalizedName)) {
    return 25
  }
  if (/\bopal\b/.test(normalizedName)) {
    return 30
  }
  if (/\bpearl\b/.test(normalizedName)) {
    return 35
  }
  if (/\bflat\b|\bmetallic\b/.test(normalizedName)) {
    return 40
  }
  if (/\bchrome\b/.test(normalizedName)) {
    return 45
  }
  if (/\bspeckle\b|\bglitter\b/.test(normalizedName)) {
    return 50
  }

  return 0
}
