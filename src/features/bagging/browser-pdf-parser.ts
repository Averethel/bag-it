import type {
  PdfDocumentParser,
  PdfReadableDocument,
  PdfReadablePage,
} from "./pdf-intake"

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs")
type PdfJsDocument = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>
type PdfJsPage = Awaited<ReturnType<PdfJsDocument["getPage"]>>
type PdfJsRenderParameters = Parameters<PdfJsPage["render"]>[0]

const workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

let pdfJsPromise: Promise<PdfJsModule> | null = null

export const parseBrowserPdfDocument: PdfDocumentParser = async (bytes, { signal } = {}) => {
  if (signal?.aborted) {
    throw new Error("PDF parsing was cancelled.")
  }

  const pdfJs = await loadPdfJs()
  if (signal?.aborted) {
    throw new Error("PDF parsing was cancelled.")
  }

  const pdfData = bytes.slice()
  const loadingTask = pdfJs.getDocument({
    data: pdfData,
    useWorkerFetch: false,
  })
  const abortLoading = () => {
    void loadingTask.destroy()
  }
  signal?.addEventListener("abort", abortLoading, { once: true })
  if (signal?.aborted) {
    await loadingTask.destroy()
    throw new Error("PDF parsing was cancelled.")
  }

  try {
    const document = await loadingTask.promise
    if (signal?.aborted) {
      await document.destroy()
      throw new Error("PDF parsing was cancelled.")
    }

    return wrapPdfJsDocument(document)
  } finally {
    signal?.removeEventListener("abort", abortLoading)
  }
}

function loadPdfJs() {
  pdfJsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfJs) => {
    pdfJs.GlobalWorkerOptions.workerSrc = workerSrc
    return pdfJs
  })

  return pdfJsPromise
}

function wrapPdfJsDocument(document: PdfJsDocument): PdfReadableDocument {
  return {
    destroy: () => document.destroy(),
    getPage: async (pageNumber) => wrapPdfJsPage(await document.getPage(pageNumber)),
    numPages: document.numPages,
  }
}

function wrapPdfJsPage(page: PdfJsPage): PdfReadablePage {
  return {
    cleanup: () => page.cleanup(),
    getTextContent: async () => {
      const textContent = await page.getTextContent()

      return {
        items: textContent.items.map((item) => ({
          str: "str" in item ? item.str : "",
          transform: "transform" in item ? item.transform : undefined,
          width: "width" in item ? item.width : undefined,
          height: "height" in item ? item.height : undefined,
        })),
      }
    },
    getViewport: (options) => page.getViewport(options),
    pageNumber: page.pageNumber,
    render: ({ canvas, canvasContext, viewport }) =>
      page.render({
        canvas,
        canvasContext,
        viewport: viewport as PdfJsRenderParameters["viewport"],
      }),
  }
}
