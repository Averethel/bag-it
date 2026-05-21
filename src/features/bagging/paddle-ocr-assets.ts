export const paddleOcrTextDetectionModelName = "PP-OCRv5_mobile_det"
export const paddleOcrTextRecognitionModelName = "PP-OCRv5_mobile_rec"

export const paddleOcrModelAssetFiles = {
  detection: "PP-OCRv5_mobile_det_onnx.tar",
  recognition: "PP-OCRv5_mobile_rec_onnx.tar",
} as const

export const paddleOcrRemoteModelAssets = {
  [paddleOcrModelAssetFiles.detection]:
    "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx.tar",
  [paddleOcrModelAssetFiles.recognition]:
    "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_onnx.tar",
} as const

export type PaddleOcrModelAssetFile = keyof typeof paddleOcrRemoteModelAssets

export function isPaddleOcrModelAssetFile(asset: string): asset is PaddleOcrModelAssetFile {
  return Object.hasOwn(paddleOcrRemoteModelAssets, asset)
}

export function getPaddleOcrLocalModelAssetPath(asset: PaddleOcrModelAssetFile) {
  return `/api/ocr-assets/${asset}`
}

export function getPaddleOcrModelAssetUrl(asset: PaddleOcrModelAssetFile, origin?: string) {
  const path = getPaddleOcrLocalModelAssetPath(asset)

  return origin ? new URL(path, origin).toString() : path
}
