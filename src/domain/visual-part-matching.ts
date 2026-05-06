import type { RebrickableInventoryItem } from "./rebrickable-csv";

export type VisualPartDescriptor = {
  aspectRatio: number;
  dominantRgb: string | null;
  fillRatio: number;
  xHistogram: number[];
  yHistogram: number[];
};

const histogramBinCount = 8;
const descriptorSampleSize = 192;
const descriptorCache = new Map<string, Promise<VisualPartDescriptor | null>>();

type CatalogImageDescriptorRequest = {
  colorId: string | null;
  partNumber: string;
};

export function createVisualPartDescriptorFromImageData(
  imageData: ImageData,
  bbox: { x0: number; y0: number; x1: number; y1: number },
): VisualPartDescriptor | null {
  const sampleLeft = Math.max(0, Math.floor(bbox.x0));
  const sampleTop = Math.max(0, Math.floor(bbox.y0));
  const sampleRight = Math.min(imageData.width, Math.ceil(bbox.x1));
  const sampleBottom = Math.min(imageData.height, Math.ceil(bbox.y1));
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let activePixels = 0;
  const colorClusters = new Map<
    string,
    { count: number; red: number; green: number; blue: number }
  >();

  for (let y = sampleTop; y < sampleBottom; y += 1) {
    const rowOffset = y * imageData.width * 4;

    for (let x = sampleLeft; x < sampleRight; x += 1) {
      const offset = rowOffset + x * 4;
      const red = imageData.data[offset] ?? 255;
      const green = imageData.data[offset + 1] ?? 255;
      const blue = imageData.data[offset + 2] ?? 255;
      const alpha = imageData.data[offset + 3] ?? 255;

      if (!isLikelyPartPixel(red, green, blue, alpha)) {
        continue;
      }

      activePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const colorKey = [
        Math.round(red / 18),
        Math.round(green / 18),
        Math.round(blue / 18),
      ].join(":");
      const colorCluster = colorClusters.get(colorKey) ?? {
        count: 0,
        red: 0,
        green: 0,
        blue: 0,
      };

      colorCluster.count += 1;
      colorCluster.red += red;
      colorCluster.green += green;
      colorCluster.blue += blue;
      colorClusters.set(colorKey, colorCluster);
    }
  }

  if (activePixels < 18 || !Number.isFinite(minX)) {
    return null;
  }

  const foregroundWidth = Math.max(1, maxX - minX + 1);
  const foregroundHeight = Math.max(1, maxY - minY + 1);
  const xHistogram = Array.from({ length: histogramBinCount }, () => 0);
  const yHistogram = Array.from({ length: histogramBinCount }, () => 0);

  for (let y = minY; y <= maxY; y += 1) {
    const rowOffset = y * imageData.width * 4;

    for (let x = minX; x <= maxX; x += 1) {
      const offset = rowOffset + x * 4;
      const red = imageData.data[offset] ?? 255;
      const green = imageData.data[offset + 1] ?? 255;
      const blue = imageData.data[offset + 2] ?? 255;
      const alpha = imageData.data[offset + 3] ?? 255;

      if (!isLikelyPartPixel(red, green, blue, alpha)) {
        continue;
      }

      const xBin = Math.min(
        histogramBinCount - 1,
        Math.floor(((x - minX) / foregroundWidth) * histogramBinCount),
      );
      const yBin = Math.min(
        histogramBinCount - 1,
        Math.floor(((y - minY) / foregroundHeight) * histogramBinCount),
      );

      xHistogram[xBin] = (xHistogram[xBin] ?? 0) + 1;
      yHistogram[yBin] = (yHistogram[yBin] ?? 0) + 1;
    }
  }

  normalizeHistogram(xHistogram);
  normalizeHistogram(yHistogram);

  return {
    aspectRatio: foregroundWidth / foregroundHeight,
    dominantRgb: readDominantRgb(colorClusters),
    fillRatio: activePixels / (foregroundWidth * foregroundHeight),
    xHistogram,
    yHistogram,
  };
}

export function scoreVisualPartDescriptorMatch(
  left: VisualPartDescriptor | null | undefined,
  right: VisualPartDescriptor | null | undefined,
) {
  if (!left || !right) {
    return 0;
  }

  const xProjectionScore = scoreHistogramMatch(left.xHistogram, right.xHistogram);
  const yProjectionScore = scoreHistogramMatch(left.yHistogram, right.yHistogram);
  const aspectDelta = Math.abs(Math.log(left.aspectRatio / right.aspectRatio));
  const aspectScore = clamp01(1 - aspectDelta / 0.72);
  const fillScore = clamp01(1 - Math.abs(left.fillRatio - right.fillRatio) / 0.42);
  const colorScore = scoreDescriptorColorMatch(left.dominantRgb, right.dominantRgb);

  return Math.round(
    (xProjectionScore * 0.26 +
      yProjectionScore * 0.26 +
      aspectScore * 0.24 +
      fillScore * 0.14 +
      colorScore * 0.1) *
      100,
  );
}

export async function attachCatalogImageDescriptorsToInventory(
  inventory: RebrickableInventoryItem[],
  options: {
    shouldAttach?: (inventoryItem: RebrickableInventoryItem) => boolean;
  } = {},
) {
  const descriptorByKey = new Map<string, VisualPartDescriptor | null>();
  const targetItems = inventory.filter((inventoryItem) => {
    const partNumber = inventoryItem.catalogPart?.partNumber;

    return Boolean(partNumber) && (options.shouldAttach?.(inventoryItem) ?? true);
  });

  await runWithConcurrency(
    [
      ...new Map(
        targetItems.flatMap((item) => {
          const partNumber = item.catalogPart?.partNumber;

          if (!partNumber) {
            return [];
          }

          const request = {
            colorId: readCatalogImageDescriptorColorId(item),
            partNumber,
          };

          return [[createDescriptorCacheKey(request), request]];
        }),
      ).values(),
    ],
    4,
    async (request) => {
      descriptorByKey.set(
        createDescriptorCacheKey(request),
        await fetchCatalogImageDescriptor(request),
      );
    },
  );

  return inventory.map((inventoryItem) => {
    const partNumber = inventoryItem.catalogPart?.partNumber;
    const descriptorKey = partNumber
      ? createDescriptorCacheKey({
          colorId: readCatalogImageDescriptorColorId(inventoryItem),
          partNumber,
        })
      : null;

    if (!descriptorKey || !descriptorByKey.has(descriptorKey)) {
      return inventoryItem;
    }

    return {
      ...inventoryItem,
      catalogImageDescriptor: descriptorByKey.get(descriptorKey) ?? null,
    };
  });
}

async function fetchCatalogImageDescriptor(request: CatalogImageDescriptorRequest) {
  const cacheKey = createDescriptorCacheKey(request);
  const cachedDescriptor = descriptorCache.get(cacheKey);

  if (cachedDescriptor) {
    return cachedDescriptor;
  }

  const descriptorPromise = fetchCatalogImageDescriptorUncached(request).then(
    (descriptor) => {
      if (descriptor === null) {
        descriptorCache.delete(cacheKey);
      }

      return descriptor;
    },
    (error: unknown) => {
      descriptorCache.delete(cacheKey);
      throw error;
    },
  );
  descriptorCache.set(cacheKey, descriptorPromise);

  return descriptorPromise;
}

async function fetchCatalogImageDescriptorUncached({
  colorId,
  partNumber,
}: CatalogImageDescriptorRequest) {
  if (typeof document === "undefined") {
    return null;
  }

  const searchParams = new URLSearchParams({
    partNumber,
    source: "rebrickable-cache-v1",
  });

  if (colorId) {
    searchParams.set("colorId", colorId);
  }

  const response = await fetch(
    `/api/catalog/part-image?${searchParams.toString()}`,
  );

  if (!response.ok) {
    return null;
  }

  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob).catch(() => null);

  if (!imageBitmap) {
    return null;
  }

  const scale = Math.min(
    1,
    descriptorSampleSize / Math.max(imageBitmap.width, imageBitmap.height),
  );
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    imageBitmap.close();
    return null;
  }

  canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
  canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));
  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
  imageBitmap.close();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const descriptor = createVisualPartDescriptorFromImageData(imageData, {
    x0: 0,
    y0: 0,
    x1: canvas.width,
    y1: canvas.height,
  });

  canvas.width = 0;
  canvas.height = 0;

  return descriptor;
}

function readCatalogImageDescriptorColorId(inventoryItem: RebrickableInventoryItem) {
  const colorId = inventoryItem.color.trim();

  return /^\d{1,8}$/.test(colorId) ? colorId : null;
}

function createDescriptorCacheKey({
  colorId,
  partNumber,
}: CatalogImageDescriptorRequest) {
  return `${partNumber}:${colorId ?? ""}`;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;

        if (item !== undefined) {
          await worker(item);
        }
      }
    }),
  );
}

function normalizeHistogram(histogram: number[]) {
  const total = histogram.reduce((sum, count) => sum + count, 0);

  if (total === 0) {
    return;
  }

  for (let index = 0; index < histogram.length; index += 1) {
    histogram[index] = (histogram[index] ?? 0) / total;
  }
}

function scoreHistogramMatch(left: number[], right: number[]) {
  const length = Math.max(left.length, right.length);
  let delta = 0;

  for (let index = 0; index < length; index += 1) {
    delta += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }

  return clamp01(1 - delta / 2);
}

function scoreDescriptorColorMatch(
  leftRgb: string | null,
  rightRgb: string | null,
) {
  const left = parseRgbHex(leftRgb);
  const right = parseRgbHex(rightRgb);

  if (!left || !right) {
    return 0.5;
  }

  return clamp01(1 - colorDistance(left, right) / 210);
}

function readDominantRgb(
  colorClusters: Map<
    string,
    { count: number; red: number; green: number; blue: number }
  >,
) {
  const dominantCluster = [...colorClusters.values()]
    .map((cluster) => ({
      cluster,
      score: cluster.count * scoreColorCluster(cluster),
    }))
    .sort((left, right) => right.score - left.score)[0]?.cluster;

  if (!dominantCluster || dominantCluster.count === 0) {
    return null;
  }

  return rgbToHex(
    Math.round(dominantCluster.red / dominantCluster.count),
    Math.round(dominantCluster.green / dominantCluster.count),
    Math.round(dominantCluster.blue / dominantCluster.count),
  );
}

function isLikelyPartPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
) {
  if (alpha <= 16) {
    return false;
  }

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;

  return luminance < 246 || max - min > 24;
}

function scoreColorCluster(cluster: {
  count: number;
  red: number;
  green: number;
  blue: number;
}) {
  const red = cluster.red / cluster.count;
  const green = cluster.green / cluster.count;
  const blue = cluster.blue / cluster.count;
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
  const saturation = colorSaturation(red, green, blue);

  if (luminance < 22) {
    return 0.45;
  }

  if (luminance > 225 && saturation < 0.12) {
    return 0.35;
  }

  return 1 + saturation * 0.65;
}

function parseRgbHex(value: string | null) {
  const normalizedValue = value?.trim().replace(/^#/, "") ?? "";

  if (!/^[0-9A-F]{6}$/i.test(normalizedValue)) {
    return null;
  }

  return {
    red: Number.parseInt(normalizedValue.slice(0, 2), 16),
    green: Number.parseInt(normalizedValue.slice(2, 4), 16),
    blue: Number.parseInt(normalizedValue.slice(4, 6), 16),
  };
}

function colorDistance(
  left: { red: number; green: number; blue: number },
  right: { red: number; green: number; blue: number },
) {
  const redDelta = left.red - right.red;
  const greenDelta = left.green - right.green;
  const blueDelta = left.blue - right.blue;

  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
}

function colorSaturation(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  return max === 0 ? 0 : (max - min) / max;
}

function rgbToHex(red: number, green: number, blue: number) {
  return [red, green, blue]
    .map((component) =>
      Math.max(0, Math.min(255, component)).toString(16).padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
