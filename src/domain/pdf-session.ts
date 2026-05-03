export type PdfSessionMetadata = {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  lastModified: number;
  loadedAt: string;
  byteLength: number;
  pageCount: number | null;
};

export type PdfSession = {
  file: File;
  bytes: Uint8Array;
  metadata: PdfSessionMetadata;
};

type CreatePdfSessionOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function createPdfSessionFromFile(
  file: File,
  options: CreatePdfSessionOptions = {},
): Promise<PdfSession> {
  if (!isPdfFile(file)) {
    throw new Error("Selected file must be a PDF.");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (!hasPdfHeader(bytes)) {
    throw new Error("Selected file does not look like a valid PDF.");
  }

  const loadedAt = (options.now ?? (() => new Date()))().toISOString();
  const id = (options.createId ?? createSessionId)();

  return {
    file,
    bytes,
    metadata: {
      id,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || "application/pdf",
      lastModified: file.lastModified,
      loadedAt,
      byteLength: bytes.byteLength,
      pageCount: null,
    },
  };
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `pdf-session-${Date.now().toString(36)}`;
}

function hasPdfHeader(bytes: Uint8Array) {
  return new TextDecoder()
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 1024)))
    .includes("%PDF-");
}
