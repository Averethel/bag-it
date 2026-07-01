export interface BrowserWorkerPool<
  TRequest extends { id: number },
  TResponse extends { error?: string; id: number },
> {
  run: (
    request: TRequest,
    transfer: Transferable[],
    signal: AbortSignal | undefined,
  ) => Promise<TResponse>
  terminate: () => void
}

export function createBrowserWorkerPool<
  TRequest extends { id: number },
  TResponse extends { error?: string; id: number },
>(
  createWorker: () => Worker,
  workerCount: number,
): BrowserWorkerPool<TRequest, TResponse> {
  const workers = Array.from({ length: workerCount }, createWorker)
  const lanes = workers.map(() => Promise.resolve())
  let nextWorkerIndex = 0
  let nextRequestId = 1

  return {
    run: (request, transfer, signal) => {
      const workerIndex = nextWorkerIndex
      const requestWithId = {
        ...request,
        id: nextRequestId,
      }
      nextRequestId += 1
      nextWorkerIndex = (nextWorkerIndex + 1) % workers.length

      const task = lanes[workerIndex].then(() =>
        postWorkerMessage<TRequest, TResponse>(
          workers[workerIndex],
          requestWithId as TRequest,
          transfer,
          signal,
        ),
      )

      lanes[workerIndex] = task.then(() => undefined, () => undefined)

      return task
    },
    terminate: () => {
      for (const worker of workers) {
        worker.terminate()
      }
    },
  }
}

function postWorkerMessage<
  TRequest extends { id: number },
  TResponse extends { error?: string; id: number },
>(
  worker: Worker,
  request: TRequest,
  transfer: Transferable[],
  signal: AbortSignal | undefined,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", handleMessage)
      worker.removeEventListener("error", handleError)
      worker.removeEventListener("messageerror", handleMessageError)
      signal?.removeEventListener("abort", handleAbort)
    }
    const rejectWith = (error: unknown) => {
      cleanup()
      reject(error)
    }
    const handleAbort = () => {
      rejectWith(new DOMException("Operation cancelled.", "AbortError"))
    }
    const handleMessage = (event: MessageEvent<TResponse>) => {
      const response = event.data

      if (response.id !== request.id) {
        return
      }

      cleanup()

      if (response.error) {
        reject(new Error(response.error))
        return
      }

      resolve(response)
    }
    const handleError = (event: ErrorEvent) => {
      rejectWith(new Error(event.message || "Worker failed."))
    }
    const handleMessageError = () => {
      rejectWith(new Error("Worker message could not be decoded."))
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }

    signal?.addEventListener("abort", handleAbort, { once: true })
    worker.addEventListener("message", handleMessage)
    worker.addEventListener("error", handleError)
    worker.addEventListener("messageerror", handleMessageError)
    worker.postMessage(request, transfer)
  })
}
