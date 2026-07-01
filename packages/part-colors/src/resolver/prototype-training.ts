import {
  colorDistanceCiede2000,
  rgbToLab,
  rgbToLch,
} from "../color-space"
import type { RgbColor } from "../contracts"
import { routeColorFamily } from "./family-routing"
import type { ColorPrototype, PrototypeSet, TrainingExample } from "./types"

export const AGGREGATE_PROTOTYPE_CLUSTER_DISTANCE_LIMIT = 4
export const AGGREGATE_PROTOTYPE_MINIMUM_SUPPORT = 4

export interface PrototypeTrainingOptions {
  clusterDistanceLimit?: number
  minimumSupport?: number
}

interface PrototypeCluster {
  examples: TrainingExample[]
  expectedName: string
  rgb: RgbColor
}

export function trainColorPrototypes(
  examples: readonly TrainingExample[],
  options: PrototypeTrainingOptions = {},
): PrototypeSet {
  const clusterDistanceLimit = options.clusterDistanceLimit ?? AGGREGATE_PROTOTYPE_CLUSTER_DISTANCE_LIMIT
  const minimumSupport = options.minimumSupport ?? AGGREGATE_PROTOTYPE_MINIMUM_SUPPORT
  const clusters: PrototypeCluster[] = []

  for (const example of [...examples].sort(compareTrainingExamples)) {
    const cluster = findNearestCluster(clusters, example, clusterDistanceLimit)

    if (cluster) {
      cluster.examples.push(example)
      cluster.rgb = averageRgb(cluster.examples)
      continue
    }

    clusters.push({
      examples: [example],
      expectedName: example.expectedName,
      rgb: example.feature.rgb,
    })
  }

  return {
    prototypes: clusters
      .filter((cluster) => cluster.examples.length >= minimumSupport)
      .map(createPrototype)
      .sort(compareColorPrototypes),
  }
}

function findNearestCluster(
  clusters: readonly PrototypeCluster[],
  example: TrainingExample,
  clusterDistanceLimit: number,
): PrototypeCluster | null {
  const expectedName = normalizeName(example.expectedName)
  const ranked = clusters
    .filter((cluster) => normalizeName(cluster.expectedName) === expectedName)
    .map((cluster) => ({
      cluster,
      distance: colorDistanceCiede2000(example.feature.rgb, cluster.rgb),
    }))
    .sort((left, right) => left.distance - right.distance)
  const nearest = ranked[0]

  return nearest && nearest.distance <= clusterDistanceLimit ? nearest.cluster : null
}

function createPrototype(cluster: PrototypeCluster, clusterIndex: number): ColorPrototype {
  const examples = cluster.examples
  const rgb = averageRgb(examples)
  const lab = rgbToLab(rgb)
  const lch = rgbToLch(rgb)
  const first = examples[0]

  if (!first) {
    throw new Error("Cannot train a color prototype without examples.")
  }

  return {
    expectedName: first.expectedName,
    family: routeColorFamily(lch),
    id: createPrototypeId(first.expectedName, clusterIndex),
    lab,
    rgb,
    support: examples.length,
  }
}

function averageRgb(examples: readonly TrainingExample[]): RgbColor {
  return {
    b: Math.round(average(examples.map((example) => example.feature.rgb.b))),
    g: Math.round(average(examples.map((example) => example.feature.rgb.g))),
    r: Math.round(average(examples.map((example) => example.feature.rgb.r))),
  }
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
}

function compareTrainingExamples(left: TrainingExample, right: TrainingExample): number {
  return normalizeName(left.expectedName).localeCompare(normalizeName(right.expectedName)) ||
    left.feature.family.localeCompare(right.feature.family) ||
    left.feature.lab.l - right.feature.lab.l ||
    left.feature.lab.a - right.feature.lab.a ||
    left.feature.lab.b - right.feature.lab.b ||
    left.feature.id.localeCompare(right.feature.id)
}

function compareColorPrototypes(left: ColorPrototype, right: ColorPrototype): number {
  return normalizeName(left.expectedName).localeCompare(normalizeName(right.expectedName)) ||
    left.rgb.r - right.rgb.r ||
    left.rgb.g - right.rgb.g ||
    left.rgb.b - right.rgb.b ||
    left.id.localeCompare(right.id)
}

function createPrototypeId(expectedName: string, clusterIndex: number): string {
  return `prototype-${slugName(expectedName)}-${String(clusterIndex + 1).padStart(3, "0")}`
}

function slugName(name: string): string {
  return normalizeName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
