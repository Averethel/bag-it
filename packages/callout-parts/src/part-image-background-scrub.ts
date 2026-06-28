import type {
  CalloutPartAlphaMask,
  CalloutPartImage,
  CalloutPartPageInput,
  RgbColor,
} from "./contracts"
import { createFlatBackgroundModel, matchBackgroundColor, type BackgroundModel } from "./background-model"
import { readPixel } from "./pixels"

export function scrubPartImageBackground(
  page: CalloutPartPageInput,
  partImage: CalloutPartImage,
  background: RgbColor,
): CalloutPartImage {
  const backgroundModel = createFlatBackgroundModel(background)
  const alphaMask = scrubAlphaMask(page, partImage, backgroundModel)

  return {
    ...partImage,
    alphaMask,
  }
}

function scrubAlphaMask(
  page: CalloutPartPageInput,
  partImage: CalloutPartImage,
  backgroundModel: BackgroundModel,
): CalloutPartAlphaMask {
  const data = copyAlphaData(partImage.alphaMask)

  for (let y = 0; y < partImage.alphaMask.height; y += 1) {
    for (let x = 0; x < partImage.alphaMask.width; x += 1) {
      const maskIndex = y * partImage.alphaMask.width + x

      if (data[maskIndex] === 0) {
        continue
      }

      const pageX = partImage.region.x + x
      const pageY = partImage.region.y + y

      if (matchBackgroundColor(backgroundModel, readPixel(page, pageX, pageY)).isBackgroundLike) {
        data[maskIndex] = 0
      }
    }
  }

  return {
    ...partImage.alphaMask,
    data,
  }
}

function copyAlphaData(alphaMask: CalloutPartAlphaMask): Uint8ClampedArray {
  return alphaMask.data instanceof Uint8ClampedArray
    ? new Uint8ClampedArray(alphaMask.data)
    : new Uint8ClampedArray(Object.values(alphaMask.data))
}
