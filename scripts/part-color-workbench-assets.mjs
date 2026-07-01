import { PART_COLOR_WORKBENCH_SCRIPT } from "./part-color-workbench-client.mjs"
import { PART_COLOR_WORKBENCH_STYLES } from "./part-color-workbench-styles.mjs"

export async function readPartColorWorkbenchAssets() {
  return {
    script: PART_COLOR_WORKBENCH_SCRIPT,
    styles: PART_COLOR_WORKBENCH_STYLES,
  }
}

export function renderPartColorWorkbenchHtml(data, { dataScriptName = "workbench-data.js" } = {}) {
  const title = data.config.manualId
    ? `Part Color Label Workbench - ${escapeHtml(data.config.manualId)}`
    : "Part Color Label Workbench"

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="./workbench.css">
  <script src="./${escapeAttribute(dataScriptName)}"></script>
  <script defer src="./workbench.js"></script>
</head>
<body>
  <noscript>This private workbench needs JavaScript for filtering and label export.</noscript>
  <main id="part-color-workbench" class="workbench-app" aria-live="polite">
    <p>Loading part color workbench...</p>
  </main>
</body>
</html>
`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char])
}

function escapeAttribute(value) {
  return escapeHtml(value)
}
