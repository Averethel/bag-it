import { join, resolve } from "node:path"

export function getCatalogueDirectory() {
  const configuredDirectory = process.env.BAG_IT_CATALOGUE_DIR?.trim()

  return configuredDirectory
    ? resolve(configuredDirectory)
    : join(process.cwd(), ".bag-it", "private", "catalogue")
}
