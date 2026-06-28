export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (!shouldRetryWithTsExtension(specifier, error)) {
      throw error
    }

    return nextResolve(`${specifier}.ts`, context)
  }
}

function shouldRetryWithTsExtension(specifier, error) {
  return (
    error?.code === "ERR_MODULE_NOT_FOUND" &&
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !specifier.endsWith(".ts")
  )
}
