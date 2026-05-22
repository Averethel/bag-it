import type { BaggingOverviewContent, BaggingPart, BagPlan } from "./types"

export const mockParts = [
  {
    id: "3023",
    color: "Light bluish gray",
    name: "Plate 1 x 2",
    qty: 42,
    swatch: "bagging.swatch.lightBluishGray",
    imageUrl: "https://cdn.rebrickable.com/media/parts/elements/4211398.jpg",
  },
  {
    id: "3005",
    color: "Tan",
    name: "Brick 1 x 1",
    qty: 28,
    swatch: "bagging.swatch.tan",
    imageUrl: "https://cdn.rebrickable.com/media/parts/elements/4113915.jpg",
  },
  {
    id: "2431",
    color: "Dark red",
    name: "Tile 1 x 4 with Groove",
    qty: 18,
    swatch: "bagging.swatch.darkRed",
    imageUrl: "https://cdn.rebrickable.com/media/parts/elements/4539060.jpg",
  },
  {
    id: "60470b",
    color: "Black",
    name: "Plate Special 1 x 2 with Clips Horizontal",
    qty: 16,
    swatch: "bagging.swatch.black",
    imageUrl: "https://cdn.rebrickable.com/media/parts/elements/6310268.jpg",
  },
] satisfies BaggingPart[]

export const mockPartById = new Map(mockParts.map((part) => [part.id, part]))

export const mockBags = [
  {
    id: "bag-1",
    label: "Bag 1",
    range: "Steps 1-12",
    parts: 48,
    status: "Ready",
    checklist: [
      { partId: "3023", name: "Plate 1 x 2", color: "Light bluish gray", qty: 18 },
      { partId: "3005", name: "Brick 1 x 1", color: "Tan", qty: 14 },
      { partId: "60470b", name: "Plate Special 1 x 2 with Clips Horizontal", color: "Black", qty: 16 },
    ],
  },
  {
    id: "bag-2",
    label: "Bag 2",
    range: "Steps 13-24",
    parts: 53,
    status: "Ready",
    checklist: [
      { partId: "3023", name: "Plate 1 x 2", color: "Light bluish gray", qty: 20 },
      { partId: "3005", name: "Brick 1 x 1", color: "Tan", qty: 19 },
      { partId: "2431", name: "Tile 1 x 4", color: "Dark red", qty: 14 },
    ],
  },
  {
    id: "bag-3",
    label: "Bag 3",
    range: "Steps 25-37",
    parts: 45,
    status: "Review",
    checklist: [
      { partId: "3023", name: "Plate 1 x 2", color: "Light bluish gray", qty: 4 },
      { partId: "2431", name: "Tile 1 x 4", color: "Dark red", qty: 4 },
      { partId: "3005", name: "Brick 1 x 1", color: "Tan", qty: 8 },
    ],
  },
] satisfies BagPlan[]

export const mockOverviewContent = {
  badge: "MOC bag prep",
  title: "Turn a MOC manual into builder-ready bags",
  description:
    "Upload the original instructions, keep building from that PDF, and use Bag It to prepare companion guidance for parts, steps, and physical bags.",
  items: [
    {
      label: "Use the original manual",
      detail: "The PDF remains the build source of truth.",
    },
    {
      label: "Shape the parts and steps",
      detail: "Bag It prepares normalized parts and step ranges.",
    },
    {
      label: "Pack build-ready bags",
      detail: "Each bag maps to manual steps and a parts checklist.",
    },
  ],
} satisfies BaggingOverviewContent
