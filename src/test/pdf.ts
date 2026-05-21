export function createTestPdf(pageCount = 1, { encrypted = false }: { encrypted?: boolean } = {}) {
  const kids = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(" ")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`,
  ]

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>")
  }

  let trailerExtra = ""
  if (encrypted) {
    objects.push(
      "<< /Filter /Standard /V 1 /R 2 /O <00000000000000000000000000000000> /U <00000000000000000000000000000000> /P -4 >>",
    )
    trailerExtra = `/Encrypt ${objects.length} 0 R`
  }

  return buildPdf(objects, trailerExtra)
}

function buildPdf(objects: string[], trailerExtra: string) {
  let body = "%PDF-1.7\n"
  const offsets = [0]

  objects.forEach((content, index) => {
    offsets[index + 1] = byteLength(body)
    body += `${index + 1} 0 obj\n${content}\nendobj\n`
  })

  const xrefOffset = byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n`
  body += "0000000000 65535 f \n"

  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`
  }

  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra} >>\n`
  body += `startxref\n${xrefOffset}\n%%EOF`

  return body
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}
