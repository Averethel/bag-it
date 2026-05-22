import { describe, expect, it } from "vitest"
import {
  getPaddleOcrLocalModelAssetPath,
  getPaddleOcrModelAssetUrl,
  isPaddleOcrModelAssetFile,
  paddleOcrModelAssetFiles,
  paddleOcrRemoteModelAssets,
} from "./paddle-ocr-assets"

describe("Paddle OCR model assets", () => {
  it("routes model downloads through same-origin OCR asset paths", () => {
    expect(getPaddleOcrLocalModelAssetPath(paddleOcrModelAssetFiles.detection)).toBe(
      "/api/ocr-assets/PP-OCRv5_mobile_det_onnx.tar",
    )
    expect(getPaddleOcrModelAssetUrl(paddleOcrModelAssetFiles.recognition, "http://localhost:3001")).toBe(
      "http://localhost:3001/api/ocr-assets/PP-OCRv5_mobile_rec_onnx.tar",
    )
  })

  it("only accepts the pinned PaddleOCR.js model archives", () => {
    expect(isPaddleOcrModelAssetFile(paddleOcrModelAssetFiles.detection)).toBe(true)
    expect(isPaddleOcrModelAssetFile(paddleOcrModelAssetFiles.recognition)).toBe(true)
    expect(isPaddleOcrModelAssetFile("other-model.tar")).toBe(false)
    expect(paddleOcrRemoteModelAssets[paddleOcrModelAssetFiles.detection]).toContain(
      "PP-OCRv5_mobile_det_onnx.tar",
    )
  })
})
