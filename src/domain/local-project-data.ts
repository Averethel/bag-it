import type { PdfSessionMetadata } from "@/domain/pdf-session";

export const localProjectDatabaseName = "bag-it-local-projects";
export const localProjectStoreName = "projects";
export const defaultLocalProjectId = "default";

export type PersistedJson =
  | string
  | number
  | boolean
  | null
  | PersistedJson[]
  | { [key: string]: PersistedJson };

export type PersistedManualMetadata = {
  fileName: string;
  fileSize: number;
  fileType: string;
  lastModified: number;
  pageCount: number | null;
};

export type LocalProjectData = {
  schemaVersion: 1;
  projectId: string;
  updatedAt: string;
  manual: PersistedManualMetadata | null;
  inventoryRows: PersistedJson[];
  catalogMatches: PersistedJson[];
  validationReports: PersistedJson[];
  bagSplits: PersistedJson[];
  reviewDecisions: PersistedJson[];
  exportSettings: PersistedJson | null;
};

export type LocalProjectStore = {
  load: () => Promise<LocalProjectData | null>;
  save: (projectData: LocalProjectData) => Promise<void>;
  clear: () => Promise<void>;
};

type CreateLocalProjectDataOptions = {
  projectId?: string;
  now?: () => Date;
};

type IndexedDbProjectStoreOptions = {
  databaseName?: string;
  storeName?: string;
  projectId?: string;
};

const forbiddenPersistedKeys = new Set([
  "arrayBuffer",
  "bytes",
  "crop",
  "crops",
  "file",
  "manualBytes",
  "manualFile",
  "ocrLines",
  "ocrText",
  "pageImage",
  "pageImages",
  "pdfBytes",
  "rawText",
  "rawOcr",
  "rawOcrOutput",
  "renderedPage",
  "renderedPages",
  "sourceText",
  "textLines",
]);

export function createEmptyLocalProjectData(
  options: CreateLocalProjectDataOptions = {},
): LocalProjectData {
  return {
    schemaVersion: 1,
    projectId: options.projectId ?? defaultLocalProjectId,
    updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    manual: null,
    inventoryRows: [],
    catalogMatches: [],
    validationReports: [],
    bagSplits: [],
    reviewDecisions: [],
    exportSettings: null,
  };
}

export function withPdfSessionMetadata(
  projectData: LocalProjectData,
  metadata: PdfSessionMetadata,
  options: CreateLocalProjectDataOptions = {},
): LocalProjectData {
  const nextProjectData: LocalProjectData = {
    ...projectData,
    updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    manual: {
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      fileType: metadata.fileType,
      lastModified: metadata.lastModified,
      pageCount: metadata.pageCount,
    },
  };

  assertSafeLocalProjectData(nextProjectData);

  return nextProjectData;
}

export function serializeLocalProjectData(projectData: LocalProjectData) {
  assertSafeLocalProjectData(projectData);

  return JSON.stringify(projectData);
}

export function assertSafeLocalProjectData(value: unknown, path = "$"): void {
  if (isBinaryLike(value)) {
    throw new Error(`${path} contains non-persistable binary manual data.`);
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSafeLocalProjectData(item, `${path}[${index}]`);
    });
    return;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (forbiddenPersistedKeys.has(key)) {
      throw new Error(`${path}.${key} is not allowed in local project data.`);
    }

    assertSafeLocalProjectData(nestedValue, `${path}.${key}`);
  });
}

export function createIndexedDbProjectStore(
  options: IndexedDbProjectStoreOptions = {},
): LocalProjectStore {
  const databaseName = options.databaseName ?? localProjectDatabaseName;
  const storeName = options.storeName ?? localProjectStoreName;
  const projectId = options.projectId ?? defaultLocalProjectId;

  return {
    async load() {
      const database = await openProjectDatabase(databaseName, storeName);

      try {
        const transaction = database.transaction(storeName, "readonly");
        const transactionDone = transactionToPromise(transaction);
        const store = transaction.objectStore(storeName);
        const result = await requestToPromise<LocalProjectData | undefined>(
          store.get(projectId) as IDBRequest<LocalProjectData | undefined>,
        );
        await transactionDone;

        if (result) {
          assertSafeLocalProjectData(result);
        }

        return result ?? null;
      } finally {
        database.close();
      }
    },

    async save(projectData) {
      assertSafeLocalProjectData(projectData);

      const database = await openProjectDatabase(databaseName, storeName);

      try {
        const transaction = database.transaction(storeName, "readwrite");
        const transactionDone = transactionToPromise(transaction);
        const store = transaction.objectStore(storeName);

        await requestToPromise(store.put(projectData));
        await transactionDone;
      } finally {
        database.close();
      }
    },

    async clear() {
      const database = await openProjectDatabase(databaseName, storeName);

      try {
        const transaction = database.transaction(storeName, "readwrite");
        const transactionDone = transactionToPromise(transaction);
        const store = transaction.objectStore(storeName);

        await requestToPromise(store.delete(projectId));
        await transactionDone;
      } finally {
        database.close();
      }
    },
  };
}

function openProjectDatabase(databaseName: string, storeName: string) {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "projectId" });
      }
    };
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.oncomplete = () => resolve();
  });
}

function isBinaryLike(value: unknown) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return true;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return true;
  }

  return false;
}
