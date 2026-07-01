import type { StepCalloutPageInput, StepCalloutRegion } from "./contracts"

export interface StepCalloutPixelComponent {
  pixelCount: number
  region: StepCalloutRegion
}

export type StepCalloutPixelPredicate = (pixelIndex: number) => boolean

interface ComponentSearchState {
  bottom: number
  left: number
  page: StepCalloutPageInput
  pending: number[]
  pixelCount: number
  right: number
  top: number
  visited: Uint8Array
}

export function findStepCalloutPixelComponents(
  page: StepCalloutPageInput,
  predicate: StepCalloutPixelPredicate,
): StepCalloutPixelComponent[] {
  const visited = new Uint8Array(page.width * page.height)
  const components: StepCalloutPixelComponent[] = []

  for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    addComponentIfPresent(components, page, visited, predicate, pixelIndex)
  }

  return components
}

function addComponentIfPresent(
  components: StepCalloutPixelComponent[],
  page: StepCalloutPageInput,
  visited: Uint8Array,
  predicate: StepCalloutPixelPredicate,
  pixelIndex: number,
): void {
  if (!claimPixel(visited, predicate, pixelIndex)) {
    return
  }

  components.push(readStepCalloutPixelComponent(page, visited, predicate, pixelIndex))
}

function readStepCalloutPixelComponent(
  page: StepCalloutPageInput,
  visited: Uint8Array,
  predicate: StepCalloutPixelPredicate,
  startIndex: number,
): StepCalloutPixelComponent {
  const startX = pixelX(startIndex, page.width)
  const startY = pixelY(startIndex, page.width)
  const state = createSearchState(page, visited, startIndex, startX, startY)

  while (state.pending.length > 0) {
    visitNextPixel(state, predicate)
  }

  return {
    pixelCount: state.pixelCount,
    region: {
      height: state.bottom - state.top + 1,
      width: state.right - state.left + 1,
      x: state.left,
      y: state.top,
    },
  }
}

function createSearchState(
  page: StepCalloutPageInput,
  visited: Uint8Array,
  startIndex: number,
  startX: number,
  startY: number,
): ComponentSearchState {
  return {
    bottom: startY,
    left: startX,
    page,
    pending: [startIndex],
    pixelCount: 0,
    right: startX,
    top: startY,
    visited,
  }
}

function visitNextPixel(
  state: ComponentSearchState,
  predicate: StepCalloutPixelPredicate,
): void {
  const pixelIndex = state.pending.pop()

  if (pixelIndex === undefined) {
    return
  }

  includePixel(state, pixelIndex)
  queueNeighborPixels(state, predicate, pixelIndex)
}

function includePixel(state: ComponentSearchState, pixelIndex: number): void {
  const x = pixelX(pixelIndex, state.page.width)
  const y = pixelY(pixelIndex, state.page.width)

  state.pixelCount += 1
  state.left = Math.min(state.left, x)
  state.right = Math.max(state.right, x)
  state.top = Math.min(state.top, y)
  state.bottom = Math.max(state.bottom, y)
}

function queueNeighborPixels(
  state: ComponentSearchState,
  predicate: StepCalloutPixelPredicate,
  pixelIndex: number,
): void {
  const x = pixelX(pixelIndex, state.page.width)
  const y = pixelY(pixelIndex, state.page.width)

  queuePixel(state, predicate, x - 1, y)
  queuePixel(state, predicate, x + 1, y)
  queuePixel(state, predicate, x, y - 1)
  queuePixel(state, predicate, x, y + 1)
}

function queuePixel(
  state: ComponentSearchState,
  predicate: StepCalloutPixelPredicate,
  x: number,
  y: number,
): void {
  if (!isPixelInPage(state.page, x, y)) {
    return
  }

  const pixelIndex = y * state.page.width + x

  if (claimPixel(state.visited, predicate, pixelIndex)) {
    state.pending.push(pixelIndex)
  }
}

function claimPixel(
  visited: Uint8Array,
  predicate: StepCalloutPixelPredicate,
  pixelIndex: number,
): boolean {
  if (visited[pixelIndex] === 1) {
    return false
  }

  visited[pixelIndex] = 1

  return predicate(pixelIndex)
}

function isPixelInPage(page: StepCalloutPageInput, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < page.width && y < page.height
}

function pixelX(pixelIndex: number, pageWidth: number): number {
  return pixelIndex % pageWidth
}

function pixelY(pixelIndex: number, pageWidth: number): number {
  return Math.floor(pixelIndex / pageWidth)
}
