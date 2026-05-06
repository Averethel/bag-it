import { readLDrawFile as readLDrawFileFromDisk } from "./ldraw-library";

export type LDrawFileReader = (fileName: string) => Promise<string | null>;

export type RenderLDrawPartSvgOptions = {
  colorHex: string;
  partNumberCandidates: string[];
  readLDrawFile?: LDrawFileReader;
  size?: number;
};

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

type Matrix3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

type Transform = {
  matrix: Matrix3;
  translation: Vector3;
};

type Surface = {
  colorHex: string;
  points: Vector3[];
};

type Edge = {
  colorHex: string;
  points: [Vector3, Vector3];
};

type Geometry = {
  edges: Edge[];
  surfaces: Surface[];
};

const defaultSize = 96;
const maxRecursionDepth = 48;
const identityTransform: Transform = {
  matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  translation: { x: 0, y: 0, z: 0 },
};
const neutralColorHex = "#A0A5A9";
const edgeColorHex = "#4E5459";
const ldrawColorHexByCode: Record<string, string> = {
  "0": "#1B2A34",
  "1": "#0055BF",
  "2": "#237841",
  "3": "#008F9B",
  "4": "#C91A09",
  "5": "#C870A0",
  "6": "#583927",
  "7": "#9BA19D",
  "8": "#6D6E5C",
  "9": "#B4D2E3",
  "10": "#4B9F4A",
  "11": "#55A5AF",
  "12": "#F2705E",
  "13": "#FC97AC",
  "14": "#F2CD37",
  "15": "#FFFFFF",
  "16": neutralColorHex,
  "17": "#C2DAB8",
  "18": "#FBE696",
  "19": "#E4CD9E",
  "22": "#81007B",
  "25": "#FE8A18",
  "27": "#BBE90B",
  "71": "#A0A5A9",
  "72": "#6C6E68",
};

export async function renderLDrawPartSvg({
  colorHex,
  partNumberCandidates,
  readLDrawFile = readLDrawFileFromDisk,
  size = defaultSize,
}: RenderLDrawPartSvgOptions) {
  const baseColorHex = normalizeHexColor(colorHex) ?? neutralColorHex;

  for (const partNumberCandidate of partNumberCandidates) {
    const partFileName = toLDrawPartFileName(partNumberCandidate);

    if (!partFileName) {
      continue;
    }

    const geometry = createEmptyGeometry();
    const wasLoaded = await collectLDrawGeometry({
      activeColorHex: baseColorHex,
      fileName: partFileName,
      geometry,
      readLDrawFile,
      stack: [],
      transform: identityTransform,
    });

    if (wasLoaded && geometry.surfaces.length > 0) {
      return renderGeometrySvg({
        baseColorHex,
        geometry,
        partNumber: stripLDrawPartFileName(partFileName),
        size,
      });
    }
  }

  return null;
}

function createEmptyGeometry(): Geometry {
  return {
    edges: [],
    surfaces: [],
  };
}

async function collectLDrawGeometry({
  activeColorHex,
  fileName,
  geometry,
  readLDrawFile,
  stack,
  transform,
}: {
  activeColorHex: string;
  fileName: string;
  geometry: Geometry;
  readLDrawFile: LDrawFileReader;
  stack: string[];
  transform: Transform;
}) {
  if (stack.length >= maxRecursionDepth || stack.includes(fileName)) {
    return false;
  }

  const fileText = await readLDrawFile(fileName);

  if (!fileText) {
    return false;
  }

  const nextStack = [...stack, fileName];

  for (const rawLine of fileText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const tokens = line.split(/\s+/);
    const lineType = tokens[0];

    if (lineType === "1") {
      const childReference = parseSubfileReference(tokens);

      if (!childReference) {
        continue;
      }

      await collectLDrawGeometry({
        activeColorHex: readLDrawColorHex(childReference.colorCode, activeColorHex),
        fileName: childReference.fileName,
        geometry,
        readLDrawFile,
        stack: nextStack,
        transform: multiplyTransforms(transform, childReference.transform),
      });
    } else if (lineType === "2") {
      const edge = parseEdge(tokens, transform, activeColorHex);

      if (edge) {
        geometry.edges.push(edge);
      }
    } else if (lineType === "3" || lineType === "4") {
      const surface = parseSurface(tokens, transform, activeColorHex);

      if (surface) {
        geometry.surfaces.push(surface);
      }
    }
  }

  return true;
}

function parseSubfileReference(tokens: string[]) {
  if (tokens.length < 15) {
    return null;
  }

  const values = tokens.slice(2, 14).map(Number);

  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [x, y, z, a, b, c, d, e, f, g, h, i] = values as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const fileName = normalizeReferencedFileName(tokens.slice(14).join(" "));

  if (!fileName) {
    return null;
  }

  return {
    colorCode: tokens[1] ?? "16",
    fileName,
    transform: {
      matrix: [a, b, c, d, e, f, g, h, i] satisfies Matrix3,
      translation: { x, y, z },
    },
  };
}

function parseSurface(
  tokens: string[],
  transform: Transform,
  activeColorHex: string,
): Surface | null {
  const vertexCount = tokens[0] === "3" ? 3 : 4;
  const values = tokens.slice(2, 2 + vertexCount * 3).map(Number);

  if (
    values.length !== vertexCount * 3 ||
    values.some((value) => !Number.isFinite(value))
  ) {
    return null;
  }

  const points: Vector3[] = [];

  for (let index = 0; index < values.length; index += 3) {
    points.push(
      transformPoint(
        {
          x: values[index] ?? 0,
          y: values[index + 1] ?? 0,
          z: values[index + 2] ?? 0,
        },
        transform,
      ),
    );
  }

  return {
    colorHex: readLDrawColorHex(tokens[1] ?? "16", activeColorHex),
    points,
  };
}

function parseEdge(
  tokens: string[],
  transform: Transform,
  activeColorHex: string,
): Edge | null {
  const values = tokens.slice(2, 8).map(Number);

  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    colorHex:
      tokens[1] === "24"
        ? edgeColorHex
        : readLDrawColorHex(tokens[1] ?? "16", activeColorHex),
    points: [
      transformPoint(
        {
          x: values[0] ?? 0,
          y: values[1] ?? 0,
          z: values[2] ?? 0,
        },
        transform,
      ),
      transformPoint(
        {
          x: values[3] ?? 0,
          y: values[4] ?? 0,
          z: values[5] ?? 0,
        },
        transform,
      ),
    ],
  };
}

function multiplyTransforms(parent: Transform, child: Transform): Transform {
  return {
    matrix: multiplyMatrix(parent.matrix, child.matrix),
    translation: transformPoint(child.translation, parent),
  };
}

function multiplyMatrix(left: Matrix3, right: Matrix3): Matrix3 {
  return [
    left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
    left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
    left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
    left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
    left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
    left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
    left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
    left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
    left[6] * right[2] + left[7] * right[5] + left[8] * right[8],
  ];
}

function transformPoint(point: Vector3, transform: Transform): Vector3 {
  const { matrix, translation } = transform;

  return {
    x:
      matrix[0] * point.x +
      matrix[1] * point.y +
      matrix[2] * point.z +
      translation.x,
    y:
      matrix[3] * point.x +
      matrix[4] * point.y +
      matrix[5] * point.z +
      translation.y,
    z:
      matrix[6] * point.x +
      matrix[7] * point.y +
      matrix[8] * point.z +
      translation.z,
  };
}

function readLDrawColorHex(colorCode: string, activeColorHex: string) {
  if (colorCode === "16") {
    return activeColorHex;
  }

  if (colorCode === "24") {
    return edgeColorHex;
  }

  return ldrawColorHexByCode[colorCode] ?? activeColorHex;
}

function renderGeometrySvg({
  baseColorHex,
  geometry,
  partNumber,
  size,
}: {
  baseColorHex: string;
  geometry: Geometry;
  partNumber: string;
  size: number;
}) {
  const projection = projectGeometry(geometry, size);

  if (!projection) {
    return null;
  }

  const polygons = projection.polygons
    .sort((left, right) => left.depth - right.depth)
    .map((polygon) => {
      const points = polygon.points
        .map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`)
        .join(" ");

      return `<polygon points="${points}" fill="${shadeColor(
        polygon.colorHex,
        polygon.shade,
      )}" stroke="${shadeColor(polygon.colorHex, 0.62)}" stroke-width="1.4" stroke-linejoin="round" />`;
    })
    .join("");
  const edges = projection.edges
    .map(
      (edge) =>
        `<line x1="${formatNumber(edge.points[0].x)}" y1="${formatNumber(
          edge.points[0].y,
        )}" x2="${formatNumber(edge.points[1].x)}" y2="${formatNumber(
          edge.points[1].y,
        )}" stroke="${edge.colorHex}" stroke-width="1.2" stroke-linecap="round" />`,
    )
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" data-ldraw-part="${escapeAttribute(
      partNumber,
    )}" data-base-color="${baseColorHex}">`,
    `<title>${escapeText(partNumber)}</title>`,
    "<metadata>Rendered from LDraw.org Parts Library geometry licensed under CC BY 4.0.</metadata>",
    '<rect width="100%" height="100%" fill="none" />',
    polygons,
    edges,
    "</svg>",
  ].join("");
}

function projectGeometry(geometry: Geometry, size: number) {
  const projectedSurfaces = geometry.surfaces.map((surface) => ({
    colorHex: surface.colorHex,
    points: surface.points.map(projectPoint),
    shade: calculateSurfaceShade(surface.points),
  }));
  const projectedEdges = geometry.edges.map((edge) => ({
    colorHex: edge.colorHex,
    points: edge.points.map(projectPoint) as [ProjectedPoint, ProjectedPoint],
  }));
  const allPoints = [
    ...projectedSurfaces.flatMap((surface) => surface.points),
    ...projectedEdges.flatMap((edge) => edge.points),
  ];

  if (allPoints.length === 0) {
    return null;
  }

  const bounds = allPoints.reduce(
    (currentBounds, point) => ({
      maxX: Math.max(currentBounds.maxX, point.x),
      maxY: Math.max(currentBounds.maxY, point.y),
      minX: Math.min(currentBounds.minX, point.x),
      minY: Math.min(currentBounds.minY, point.y),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    },
  );
  const padding = size * 0.12;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((size - padding * 2) / width, (size - padding * 2) / height);
  const offsetX = (size - width * scale) / 2 - bounds.minX * scale;
  const offsetY = (size - height * scale) / 2 - bounds.minY * scale;

  return {
    edges: projectedEdges.map((edge) => ({
      colorHex: edge.colorHex,
      points: edge.points.map((point) =>
        normalizeProjectedPoint(point, scale, offsetX, offsetY),
      ) as [ProjectedPoint, ProjectedPoint],
    })),
    polygons: projectedSurfaces.map((surface) => ({
      colorHex: surface.colorHex,
      depth:
        surface.points.reduce((sum, point) => sum + point.depth, 0) /
        surface.points.length,
      points: surface.points.map((point) =>
        normalizeProjectedPoint(point, scale, offsetX, offsetY),
      ),
      shade: surface.shade,
    })),
  };
}

type ProjectedPoint = {
  depth: number;
  x: number;
  y: number;
};

function projectPoint(point: Vector3): ProjectedPoint {
  const yRotation = (-35 * Math.PI) / 180;
  const xRotation = (-26 * Math.PI) / 180;
  const cosY = Math.cos(yRotation);
  const sinY = Math.sin(yRotation);
  const cosX = Math.cos(xRotation);
  const sinX = Math.sin(xRotation);
  const xAfterY = cosY * point.x + sinY * point.z;
  const zAfterY = -sinY * point.x + cosY * point.z;
  const yAfterX = cosX * point.y - sinX * zAfterY;
  const zAfterX = sinX * point.y + cosX * zAfterY;

  return {
    depth: zAfterX,
    x: xAfterY,
    y: yAfterX,
  };
}

function normalizeProjectedPoint(
  point: ProjectedPoint,
  scale: number,
  offsetX: number,
  offsetY: number,
): ProjectedPoint {
  return {
    depth: point.depth,
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  };
}

function calculateSurfaceShade(points: Vector3[]) {
  if (points.length < 3) {
    return 0.82;
  }

  const firstPoint = points[0];
  const secondPoint = points[1];
  const thirdPoint = points[2];

  if (!firstPoint || !secondPoint || !thirdPoint) {
    return 0.82;
  }

  const normal = normalizeVector(
    crossProduct(
      subtractVectors(secondPoint, firstPoint),
      subtractVectors(thirdPoint, firstPoint),
    ),
  );
  const light = normalizeVector({ x: -0.45, y: -0.75, z: 0.55 });
  const intensity = Math.abs(dotProduct(normal, light));

  return 0.72 + intensity * 0.28;
}

function subtractVectors(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function crossProduct(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function dotProduct(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);

  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function toLDrawPartFileName(partNumber: string) {
  const normalizedPartNumber = partNumber
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .toLowerCase()
    .trim();

  if (
    !normalizedPartNumber ||
    normalizedPartNumber.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }

  return normalizedPartNumber.endsWith(".dat")
    ? normalizedPartNumber
    : `${normalizedPartNumber}.dat`;
}

function normalizeReferencedFileName(fileName: string) {
  return toLDrawPartFileName(fileName);
}

function stripLDrawPartFileName(fileName: string) {
  return fileName.replace(/^parts\//, "").replace(/\.dat$/i, "");
}

function normalizeHexColor(value: string) {
  const normalizedValue = value.trim().replace(/^#/, "").toUpperCase();

  return /^[0-9A-F]{6}$/.test(normalizedValue) ? `#${normalizedValue}` : null;
}

function shadeColor(colorHex: string, shade: number) {
  const normalizedColor = normalizeHexColor(colorHex) ?? neutralColorHex;
  const color = normalizedColor.slice(1);
  const red = parseInt(color.slice(0, 2), 16);
  const green = parseInt(color.slice(2, 4), 16);
  const blue = parseInt(color.slice(4, 6), 16);

  return `#${toHexChannel(red * shade)}${toHexChannel(
    green * shade,
  )}${toHexChannel(blue * shade)}`;
}

function toHexChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escapeText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}
