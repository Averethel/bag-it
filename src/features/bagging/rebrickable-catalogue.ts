import type { PartsListColor, PartsListPartCatalogue } from "./parts-list-extraction"

export type RebrickableColorRecord = {
  id: string
  isTransparent: boolean
  name: string
  rgb: string
}

export type RebrickablePartRecord = {
  imageUrl?: string
  name?: string
  partNum: string
}

export type RebrickableElementRecord = {
  colorId: string
  elementId: string
  partNum: string
}

export type RebrickablePartRelationshipRecord = {
  childPartNum: string
  parentPartNum: string
  relType: string
}

export type RebrickableCatalogueSnapshot = {
  downloadedAt?: string
  id: string
  schemaVersion?: number
  tables?: readonly {
    contentHash?: string
    fileName: string
    rowCount?: number
    sourceUrl?: string
  }[]
}

export type ExternalColorAliasRecord = {
  externalId: string
  externalName: string
  rebrickableId: string
  rebrickableName: string
  system: string
}

export type ExternalPartAliasRecord = {
  alias: string
  canonical: string
}

export function parseRebrickableColorsCsv(csvText: string): RebrickableColorRecord[] {
  const rows = parseCsv(csvText.trim())
  const [headers, ...records] = rows
  const idIndex = headers?.indexOf("id") ?? -1
  const nameIndex = headers?.indexOf("name") ?? -1
  const rgbIndex = headers?.indexOf("rgb") ?? -1
  const isTransparentIndex = headers?.indexOf("is_trans") ?? -1

  if (idIndex < 0 || nameIndex < 0 || rgbIndex < 0 || isTransparentIndex < 0) {
    throw new Error("Rebrickable colors CSV must include id, name, rgb, and is_trans columns.")
  }

  return records
    .map((row) => ({
      id: row[idIndex]?.trim() ?? "",
      isTransparent: (row[isTransparentIndex] ?? "").trim().toLowerCase() === "t",
      name: row[nameIndex]?.trim() ?? "",
      rgb: (row[rgbIndex] ?? "").trim().toUpperCase(),
    }))
    .filter((record) => record.id && record.name)
}

export function createPartsListColorsFromRebrickableColors(
  records: readonly RebrickableColorRecord[],
  {
    externalColorAliases = [],
  }: {
    externalColorAliases?: readonly ExternalColorAliasRecord[]
  } = {},
): PartsListColor[] {
  const studioColorCodesByRebrickableId = createStudioColorCodesByRebrickableId(externalColorAliases)

  return records
    .filter((record) => record.id !== "-1")
    .map((record) => ({
      aliases: createColorAliases(record, studioColorCodesByRebrickableId),
      id: record.id,
      isTransparent: record.isTransparent,
      name: record.name,
      rgb: record.rgb,
    }))
}

export function parseExternalColorAliasesCsv(csvText: string): ExternalColorAliasRecord[] {
  const rows = parseCsv(csvText.trim())
  const [headers, ...records] = rows
  const systemIndex = headers?.indexOf("system") ?? -1
  const externalIdIndex = headers?.indexOf("external_id") ?? -1
  const rebrickableIdIndex = headers?.indexOf("rebrickable_id") ?? -1
  const externalNameIndex = headers?.indexOf("external_name") ?? -1
  const rebrickableNameIndex = headers?.indexOf("rebrickable_name") ?? -1

  if (systemIndex < 0 || externalIdIndex < 0 || rebrickableIdIndex < 0) {
    throw new Error("External color aliases CSV must include system, external_id, and rebrickable_id columns.")
  }

  return records
    .map((row) => ({
      externalId: row[externalIdIndex]?.trim() ?? "",
      externalName: externalNameIndex >= 0 ? row[externalNameIndex]?.trim() ?? "" : "",
      rebrickableId: row[rebrickableIdIndex]?.trim() ?? "",
      rebrickableName: rebrickableNameIndex >= 0 ? row[rebrickableNameIndex]?.trim() ?? "" : "",
      system: row[systemIndex]?.trim() ?? "",
    }))
    .filter((record) => record.system && record.externalId && record.rebrickableId)
}

export function parseExternalPartAliasesCsv(csvText: string): ExternalPartAliasRecord[] {
  const rows = parseCsv(csvText.trim())
  const [headers, ...records] = rows
  const aliasIndex = headers?.indexOf("alias") ?? -1
  const canonicalIndex = headers?.indexOf("canonical") ?? -1

  if (aliasIndex < 0 || canonicalIndex < 0) {
    throw new Error("External part aliases CSV must include alias and canonical columns.")
  }

  return records
    .map((row) => ({
      alias: normalizeCataloguePart(row[aliasIndex] ?? ""),
      canonical: normalizeCataloguePart(row[canonicalIndex] ?? ""),
    }))
    .filter((record) => record.alias && record.canonical && record.alias !== record.canonical)
}

export function parseRebrickablePartsCsv(csvText: string): RebrickablePartRecord[] {
  const rows = parseCsv(csvText.trim())
  const [headers, ...records] = rows
  const imageUrlIndex = headers?.indexOf("part_img_url") ?? -1
  const nameIndex = headers?.indexOf("name") ?? -1
  const partIndex = headers?.indexOf("part_num") ?? -1

  if (partIndex < 0) {
    throw new Error("Rebrickable parts CSV must include part_num.")
  }

  return records
    .map((row) => {
      const imageUrl = imageUrlIndex >= 0 ? row[imageUrlIndex]?.trim() ?? "" : ""
      const name = nameIndex >= 0 ? row[nameIndex]?.trim() ?? "" : ""

      return {
        ...(imageUrl ? { imageUrl } : {}),
        ...(name ? { name } : {}),
        partNum: normalizeCataloguePart(row[partIndex] ?? ""),
      }
    })
    .filter((record) => record.partNum)
}

export function parseRebrickableElementsCsv(csvText: string): RebrickableElementRecord[] {
  const rows = parseCsv(csvText.trim())
  const [headers, ...records] = rows
  const colorIndex = headers?.indexOf("color_id") ?? -1
  const elementIndex = headers?.indexOf("element_id") ?? -1
  const partIndex = headers?.indexOf("part_num") ?? -1

  if (colorIndex < 0 || elementIndex < 0 || partIndex < 0) {
    throw new Error("Rebrickable elements CSV must include element_id, part_num, and color_id.")
  }

  return records
    .map((row) => ({
      colorId: row[colorIndex]?.trim() ?? "",
      elementId: row[elementIndex]?.trim() ?? "",
      partNum: normalizeCataloguePart(row[partIndex] ?? ""),
    }))
    .filter((record) => record.elementId && record.partNum && record.colorId)
}

export function parseRebrickablePartRelationshipsCsv(
  csvText: string,
): RebrickablePartRelationshipRecord[] {
  const rows = parseCsv(csvText.trim())
  const [headers, ...records] = rows
  const typeIndex = headers?.indexOf("rel_type") ?? -1
  const childIndex = headers?.indexOf("child_part_num") ?? -1
  const parentIndex = headers?.indexOf("parent_part_num") ?? -1

  if (typeIndex < 0 || childIndex < 0 || parentIndex < 0) {
    throw new Error(
      "Rebrickable part relationships CSV must include rel_type, child_part_num, and parent_part_num.",
    )
  }

  return records
    .map((row) => ({
      childPartNum: normalizeCataloguePart(row[childIndex] ?? ""),
      parentPartNum: normalizeCataloguePart(row[parentIndex] ?? ""),
      relType: row[typeIndex]?.trim() ?? "",
    }))
    .filter((record) => record.childPartNum && record.parentPartNum && record.relType)
}

export function createPartsListPartCatalogue({
  externalPartAliases = [],
  parts,
  relationships,
  snapshot,
}: {
  externalPartAliases?: readonly ExternalPartAliasRecord[]
  parts: readonly RebrickablePartRecord[] | readonly string[]
  relationships?: readonly RebrickablePartRelationshipRecord[]
  snapshot?: RebrickableCatalogueSnapshot | null
}): PartsListPartCatalogue {
  const partNameByPart = createPartNameByPart(parts)
  const partSet = new Set(
    parts
      .map((part) => normalizeCataloguePart(typeof part === "string" ? part : part.partNum))
      .filter(Boolean),
  )
  const assemblyComponentEdges: [string, string][] = []
  const moldEdges: [string, string][] = []
  const printParentByPart = new Map<string, string>()

  for (const relationship of relationships ?? []) {
    const child = normalizeCataloguePart(relationship.childPartNum)
    const parent = normalizeCataloguePart(relationship.parentPartNum)
    if (!child || !parent) {
      continue
    }

    if (relationship.relType === "P") {
      printParentByPart.set(child, parent)
    }

    if (relationship.relType === "A" || relationship.relType === "M") {
      moldEdges.push([child, parent])
    }

    if (relationship.relType === "B") {
      assemblyComponentEdges.push([child, parent])
    }
  }
  return {
    assemblyComponentsByPart: createAssemblyComponentsByPart(assemblyComponentEdges),
    assemblyParentsByComponent: createAssemblyParentsByComponent(assemblyComponentEdges),
    externalPartAliasByPart: new Map(
      [
        ...externalPartAliases,
        ...builtinManualPartAliases,
      ]
        .map(({ alias, canonical }) => [
          normalizeCataloguePart(alias),
          normalizeCataloguePart(canonical),
        ] as const)
        .filter(([alias, canonical]) => alias && canonical),
    ),
    moldFamilyByPart: createFamilyMap(moldEdges),
    partNameByPart,
    parts: partSet,
    printFamilyByBase: createPrintFamilyByBase(partSet),
    printParentByPart,
    singleLetterMoldVariantByPart: createSingleLetterMoldVariantMap(partSet),
    ...(snapshot ? { snapshot } : {}),
  }
}

function createPartNameByPart(parts: readonly RebrickablePartRecord[] | readonly string[]) {
  const names = new Map<string, string>()
  for (const part of parts) {
    if (typeof part === "string") {
      continue
    }

    const partNum = normalizeCataloguePart(part.partNum)
    if (partNum && part.name) {
      names.set(partNum, part.name)
    }
  }

  return names
}

const builtinManualPartAliases: readonly ExternalPartAliasRecord[] = [
  { alias: "3069pb0507", canonical: "3069bpr0148" },
  { alias: "3846p4d", canonical: "3846pr0023" },
  { alias: "3846p4g", canonical: "3846pr0039" },
  { alias: "40359a", canonical: "62808" },
  { alias: "52", canonical: "30385" },
]

function createAssemblyComponentsByPart(edges: readonly (readonly [string, string])[]) {
  const componentsByAssembly = new Map<string, Set<string>>()

  for (const [component, assembly] of edges) {
    if (!component || !assembly) {
      continue
    }

    const components = componentsByAssembly.get(assembly) ?? new Set<string>()
    components.add(component)
    componentsByAssembly.set(assembly, components)
  }

  return componentsByAssembly
}

function createAssemblyParentsByComponent(edges: readonly (readonly [string, string])[]) {
  const parentsByComponent = new Map<string, Set<string>>()

  for (const [component, assembly] of edges) {
    if (!component || !assembly) {
      continue
    }

    const parents = parentsByComponent.get(component) ?? new Set<string>()
    parents.add(assembly)
    parentsByComponent.set(component, parents)
  }

  return parentsByComponent
}

function createColorAliases(
  record: RebrickableColorRecord,
  studioColorCodesByRebrickableId: ReadonlyMap<string, readonly string[]>,
) {
  const aliases = new Set<string>()
  const name = record.name.trim()

  aliases.add(name)
  addGrayGreyAlias(aliases, name)
  addOcrRecoveryAliases(aliases, record)
  addTransparentAliases(aliases, name)
  addStudioColorCodeAliases(aliases, record.id, studioColorCodesByRebrickableId)

  return [...aliases].filter((alias) => alias !== name)
}

const fallbackStudioColorCodeAliasesByRebrickableId: Record<string, readonly string[]> = {
  "0": ["11"],
  "1": ["7"],
  "2": ["6"],
  "10": ["36"],
  "14": ["3"],
  "15": ["1"],
  "19": ["2"],
  "28": ["69"],
  "31": ["154"],
  "34": ["20"],
  "41": ["15"],
  "46": ["19"],
  "47": ["12"],
  "70": ["88"],
  "71": ["86"],
  "72": ["85"],
  "84": ["150"],
  "182": ["98"],
  "297": ["115"],
  "322": ["156"],
  "326": ["155"],
  "378": ["48"],
  "484": ["68"],
  "1103": ["77"],
}

export function createStudioColorCodeAlias(colorCode: string) {
  return `studio-${colorCode}`
}

export function getSupportedStudioColorCodeAlias(colorCode: string) {
  return /^[1-9]\d{0,2}$/.test(colorCode) ? createStudioColorCodeAlias(colorCode) : colorCode
}

function addStudioColorCodeAliases(
  aliases: Set<string>,
  rebrickableColorId: string,
  studioColorCodesByRebrickableId: ReadonlyMap<string, readonly string[]>,
) {
  for (const colorCode of studioColorCodesByRebrickableId.get(rebrickableColorId) ?? []) {
    aliases.add(createStudioColorCodeAlias(colorCode))
  }

  for (const alias of fallbackStudioColorCodeAliasesByRebrickableId[rebrickableColorId] ?? []) {
    aliases.add(createStudioColorCodeAlias(alias))
  }
}

function createStudioColorCodesByRebrickableId(externalColorAliases: readonly ExternalColorAliasRecord[]) {
  const codeByRebrickableId = new Map<string, string[]>()
  const rebrickableIdsByExternalCode = new Map<string, Set<string>>()
  for (const alias of externalColorAliases) {
    if (alias.system.toLowerCase() !== "bricklink" || !/^[1-9]\d{0,2}$/.test(alias.externalId)) {
      continue
    }

    const rebrickableIds = rebrickableIdsByExternalCode.get(alias.externalId) ?? new Set<string>()
    rebrickableIds.add(alias.rebrickableId)
    rebrickableIdsByExternalCode.set(alias.externalId, rebrickableIds)
  }

  for (const [externalCode, rebrickableIds] of rebrickableIdsByExternalCode) {
    if (rebrickableIds.size === 1) {
      addColorCode(codeByRebrickableId, [...rebrickableIds][0] ?? "", externalCode)
    }
  }

  return codeByRebrickableId
}

function addColorCode(codesByRebrickableId: Map<string, string[]>, rebrickableId: string, colorCode: string) {
  if (!rebrickableId || !/^[1-9]\d{0,2}$/.test(colorCode)) {
    return
  }

  const codes = codesByRebrickableId.get(rebrickableId) ?? []
  if (!codes.includes(colorCode)) {
    codes.push(colorCode)
  }
  codesByRebrickableId.set(rebrickableId, codes)
}

function addGrayGreyAlias(aliases: Set<string>, name: string) {
  if (/\bGray\b/i.test(name)) {
    aliases.add(name.replace(/\bGray\b/gi, "Grey"))
  }

  if (/\bGrey\b/i.test(name)) {
    aliases.add(name.replace(/\bGrey\b/gi, "Gray"))
  }
}

function addOcrRecoveryAliases(aliases: Set<string>, record: RebrickableColorRecord) {
  if (record.id === "71") {
    aliases.add("Bluish Gray")
    aliases.add("Bluish Grey")
  }

  if (record.id === "36") {
    aliases.add("Glowing Neon Red")
  }

  if (record.id === "46") {
    aliases.add("Glowing Neon Yellow")
  }

  if (record.id === "1055") {
    aliases.add("Satin Trans-Clear")
    aliases.add("Satin Clear")
  }
}

function addTransparentAliases(aliases: Set<string>, name: string) {
  if (/^Trans-/i.test(name)) {
    aliases.add(name.replace(/^Trans-/i, "Transparent "))
    aliases.add(name.replace(/^Trans-/i, "Trans "))
  }

  if (/^Transparent /i.test(name)) {
    aliases.add(name.replace(/^Transparent /i, "Trans-"))
    aliases.add(name.replace(/^Transparent /i, "Trans "))
  }
}

function createSingleLetterMoldVariantMap(parts: ReadonlySet<string>) {
  const variantByBase = new Map<string, string>()

  for (const part of parts) {
    if (!/^\d{3,}[a-z]$/.test(part)) {
      continue
    }

    const base = part.slice(0, -1)
    if (!parts.has(base) && !variantByBase.has(base)) {
      variantByBase.set(base, part)
    }
  }

  return variantByBase
}

function createFamilyMap(edges: readonly (readonly [string, string])[]) {
  const adjacency = new Map<string, Set<string>>()
  for (const [left, right] of edges) {
    addEdge(adjacency, left, right)
    addEdge(adjacency, right, left)
  }

  const familyByPart = new Map<string, Set<string>>()
  for (const part of adjacency.keys()) {
    if (familyByPart.has(part)) {
      continue
    }

    const family = new Set<string>()
    const queue = [part]
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current || family.has(current)) {
        continue
      }

      family.add(current)
      for (const next of adjacency.get(current) ?? []) {
        queue.push(next)
      }
    }

    for (const member of family) {
      familyByPart.set(member, family)
    }
  }

  return familyByPart
}

function createPrintFamilyByBase(parts: ReadonlySet<string>) {
  const familyByBase = new Map<string, Set<string>>()

  for (const part of parts) {
    const printedPart = parsePrintedPart(part)
    if (!printedPart) {
      continue
    }

    const family = familyByBase.get(printedPart.base) ?? new Set<string>()
    family.add(part)
    familyByBase.set(printedPart.base, family)
  }

  return familyByBase
}

function parsePrintedPart(partNumber: string) {
  const match = normalizeCataloguePart(partNumber).match(/^(\d+(?:[a-z]|c\d{2})?)(?:p|pb|pr|px)\d+$/)

  return match ? { base: match[1] ?? "" } : null
}

function addEdge(adjacency: Map<string, Set<string>>, left: string, right: string) {
  const values = adjacency.get(left) ?? new Set<string>()
  values.add(right)
  adjacency.set(left, values)
}

function normalizeCataloguePart(partNumber: string) {
  return partNumber.trim().toLowerCase()
}

function parseCsv(csvText: string) {
  const rows: string[][] = []
  let currentCell = ""
  let currentRow: string[] = []
  let inQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    const nextCharacter = csvText[index + 1]

    if (character === "\"" && inQuotes && nextCharacter === "\"") {
      currentCell += "\""
      index += 1
      continue
    }

    if (character === "\"") {
      inQuotes = !inQuotes
      continue
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ""
      continue
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1
      }

      currentRow.push(currentCell)
      rows.push(currentRow)
      currentCell = ""
      currentRow = []
      continue
    }

    currentCell += character
  }

  currentRow.push(currentCell)
  rows.push(currentRow)

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0))
}
