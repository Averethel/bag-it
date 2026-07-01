export const PART_COLOR_WORKBENCH_SCRIPT = String.raw`
(() => {
  const data = window.partColorWorkbenchData
  const root = document.getElementById("part-color-workbench")

  if (!root) {
    return
  }

  if (!data) {
    root.innerHTML = "<p>Workbench data missing. Regenerate the report.</p>"
    return
  }

  root.innerHTML = renderApp(data)

  const visibleCount = root.querySelector("#visible-count")
  const output = root.querySelector("#label-json-output")
  const status = root.querySelector("#label-export-status")
  const filterInputs = Array.from(root.querySelectorAll(".workbench-filter"))
  const rowSearchInput = root.querySelector("#row-search")
  const rows = Array.from(root.querySelectorAll(".workbench-row"))
  const expectedColorInputs = rows.map((row) => row.querySelector(".expected-color-input")).filter(Boolean)
  const colorOptions = Array.isArray(data.colorOptions) ? data.colorOptions : []
  const validColorOptions = new Set(colorOptions)

  function applyFilters() {
    const activeFilters = filterInputs
      .filter((filter) => filter.checked)
      .map((filter) => filter.dataset.filter)
    const searchQuery = normalizeSearchText(rowSearchInput?.value || "")
    let visible = 0

    for (const row of rows) {
      const matchesFilters = activeFilters.length === 0 ||
        activeFilters.some((filter) => row.getAttribute("data-filter-" + filter) === "true")
      const matchesSearch = !searchQuery || normalizeSearchText(row.dataset.searchText || "").includes(searchQuery)
      const show = matchesFilters && matchesSearch

      row.hidden = !show
      row.classList.toggle("row-search-match", Boolean(searchQuery) && matchesSearch)
      if (show) {
        visible += 1
      }
    }

    visibleCount.textContent = "Showing " + visible + " of " + rows.length + " rows"
  }

  function buildLabels() {
    return rows
      .map((row) => {
        const expectedName = row.querySelector(".expected-color-input").value.trim()
        const note = row.querySelector(".note-input").value.trim()
        const role = row.querySelector(".role-select").value

        if (!expectedName && !note && role !== "excluded") {
          return null
        }

        return {
          itemId: row.dataset.itemId,
          ...(expectedName ? { expectedName } : {}),
          role: expectedName ? role : "excluded",
          ...(row.dataset.cropHash ? { cropHash: row.dataset.cropHash } : {}),
          ...(note ? { note } : {}),
        }
      })
      .filter(Boolean)
  }

  function buildExport() {
    return {
      manualId: data.config.manualId,
      reportPath: data.config.reportPath,
      status: data.config.status,
      labels: buildLabels(),
    }
  }

  function renderJson() {
    const text = JSON.stringify(buildExport(), null, 2) + "\n"

    output.value = text
    output.style.display = "block"
    return text
  }

  async function copyLabels() {
    if (data.config.exportBlocked) {
      return
    }

    if (!validateExpectedColorInputs()) {
      return
    }

    const text = renderJson()

    if (await copyTextToClipboard(text)) {
      status.textContent = "Copied label JSON."
      return
    }

    output.focus()
    output.select()
    status.textContent = "Copy blocked by browser. Press Command-C on the selected label JSON below."
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // Fall through to the file://-friendly selection copy path.
    }

    return copySelectedOutput()
  }

  function copySelectedOutput() {
    output.focus()
    output.select()

    try {
      return document.execCommand?.("copy") === true
    } catch {
      return false
    }
  }

  function downloadLabels() {
    if (data.config.exportBlocked) {
      return
    }

    if (!validateExpectedColorInputs()) {
      return
    }

    const text = renderJson()
    const blob = new Blob([text], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = data.config.exportFileName || (data.config.manualId || "part-color-labels") + ".json"
    link.click()
    URL.revokeObjectURL(url)
    status.textContent = "Downloaded label JSON."
  }

  function validateExpectedColorInputs() {
    const invalidInputs = expectedColorInputs
      .filter((input) => input?.value.trim() && !validColorOptions.has(input.value.trim()))

    for (const input of expectedColorInputs) {
      input.classList.remove("expected-color-input-invalid")
    }

    if (invalidInputs.length === 0) {
      return true
    }

    for (const input of invalidInputs) {
      input.classList.add("expected-color-input-invalid")
    }

    invalidInputs[0].focus()
    status.textContent = "Choose a catalog color from the suggestions, or clear the field and mark excluded."
    return false
  }

  function setupExpectedColorControls() {
    const pickers = Array.from(root.querySelectorAll(".expected-color-picker"))

    for (const [index, picker] of pickers.entries()) {
      const input = picker.querySelector(".expected-color-input")
      const menu = picker.querySelector(".expected-color-menu")

      if (!input || !menu) {
        continue
      }

      menu.dataset.pickerId = String(index + 1)
      input.addEventListener("focus", () => renderExpectedColorSuggestions(input, menu, colorOptions))
      input.addEventListener("input", () => renderExpectedColorSuggestions(input, menu, colorOptions))
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeExpectedColorMenu(input, menu)
        } else if (event.key === "Tab") {
          event.preventDefault()
          closeExpectedColorMenu(input, menu)
          focusAdjacentExpectedColorInput(input, event.shiftKey ? -1 : 1)
        } else if (event.key === "ArrowDown") {
          event.preventDefault()
          moveExpectedColorMenuSelection(input, menu, colorOptions, 1)
        } else if (event.key === "ArrowUp") {
          event.preventDefault()
          moveExpectedColorMenuSelection(input, menu, colorOptions, -1)
        } else if (event.key === "Enter" && !menu.hidden) {
          const selectedOption = readSelectedExpectedColorOption(menu) ?? menu.querySelector(".expected-color-option")

          if (selectedOption) {
            event.preventDefault()
            selectExpectedColor(input, menu, selectedOption.dataset.colorName)
          }
        }
      })
      input.addEventListener("blur", () => {
        window.setTimeout(() => closeExpectedColorMenu(input, menu), 120)
      })
      menu.addEventListener("mousedown", (event) => event.preventDefault())
      menu.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
          return
        }

        const option = event.target.closest(".expected-color-option")

        if (option) {
          selectExpectedColor(input, menu, option.dataset.colorName)
        }
      })
    }
  }

  function setupLabelingTabOrder() {
    for (const element of root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')) {
      element.tabIndex = element.classList.contains("expected-color-input") ? 0 : -1
    }
  }

  function focusAdjacentExpectedColorInput(currentInput, direction) {
    const focusableInputs = expectedColorInputs.filter((input) => {
      const row = input.closest(".workbench-row")

      return row && !row.hidden
    })

    if (!focusableInputs.length) {
      return
    }

    const currentIndex = focusableInputs.indexOf(currentInput)
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + focusableInputs.length) % focusableInputs.length

    focusableInputs[nextIndex].focus()
  }

  for (const filter of filterInputs) {
    filter.addEventListener("change", applyFilters)
  }

  rowSearchInput?.addEventListener("input", applyFilters)
  root.querySelector("#clear-filters").addEventListener("click", () => {
    for (const filter of filterInputs) {
      filter.checked = false
    }
    if (rowSearchInput) {
      rowSearchInput.value = ""
    }
    applyFilters()
  })
  root.querySelector("#copy-label-json").addEventListener("click", copyLabels)
  root.querySelector("#download-label-json").addEventListener("click", downloadLabels)

  setupLabelingTabOrder()
  setupExpectedColorControls()
  setupInitialRowSearch()
  applyFilters()

  function setupInitialRowSearch() {
    const hash = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : ""

    if (!hash || !rowSearchInput) {
      return
    }

    rowSearchInput.value = hash
    const targetRow = rows.find((row) => row.dataset.itemId === hash)

    if (targetRow) {
      window.setTimeout(() => targetRow.scrollIntoView?.({ block: "center" }), 0)
    }
  }
})()

function renderApp(data) {
  return [
    renderHeader(data),
    renderChunkNav(data),
    renderToolbar(data),
    '<textarea id="label-json-output" class="json-output" readonly aria-label="Generated label JSON"></textarea>',
    renderRows(data),
  ].join("")
}

function renderChunkNav(data) {
  if (!data.chunks || data.chunks.length <= 1) {
    return ""
  }

  const chunk = data.config.chunk || {}
  const pageText = "Part " + escapeHtml(String(chunk.index || "")) +
    " of " + escapeHtml(String(chunk.count || data.chunks.length)) +
    " · rows " + escapeHtml(String(chunk.startRow || 0)) +
    "-" + escapeHtml(String(chunk.endRow || 0)) +
    " of " + escapeHtml(String(chunk.totalRows || data.totals.rows || 0))

  return [
    '<nav class="chunk-nav" aria-label="Workbench chunks">',
    '<strong>' + pageText + '</strong>',
    data.chunks.map(renderChunkLink).join(""),
    '</nav>',
  ].join("")
}

function renderChunkLink(chunk) {
  const label = escapeHtml(chunk.label) + " " + escapeHtml(chunk.rowRange)

  if (chunk.current) {
    return '<span class="chunk-link chunk-current" aria-current="page">' + label + "</span>"
  }

  return '<a class="chunk-link" href="./' + escapeAttribute(chunk.href) + '">' + label + "</a>"
}

function renderHeader(data) {
  const labelText = data.labels
    ? escapeHtml(String(data.labels.matched)) + "/" + escapeHtml(String(data.labels.total)) + " matched"
    : "No labels loaded"

  return [
    '<header class="topbar">',
    '<div>',
    '<h1>Part Color Label Workbench</h1>',
    '<div class="muted">' + escapeHtml(data.config.manualId || "manual") + " / " + escapeHtml(data.config.colorSource || "unknown source") + '</div>',
    '<div class="muted">Generated ' + escapeHtml(data.config.generatedAt || "") + '</div>',
    '</div>',
    '<div class="muted">Labels live under .bag-it/private/part-color-reports/labels</div>',
    '</header>',
    data.config.exportBlocked ? renderBlockedBanner(data.config.exportBlockReasons) : "",
    '<section class="summary-grid" aria-label="Report summary">',
    renderSummaryItem("Rows", data.totals.rows),
    renderSummaryItem("Classes", data.totals.classes),
    renderSummaryItem("Raw classes", data.totals.rawClasses),
    renderSummaryItem("Review", data.totals.reviewRows),
    renderSummaryItem("Unknown", data.totals.unknownRows),
    renderSummaryItem("Labels", labelText),
    '</section>',
  ].join("")
}

function renderBlockedBanner(reasons) {
  return '<div class="banner"><strong>Training export blocked:</strong> regenerate a current saved-app-result report before exporting training labels. Reasons: ' +
    escapeHtml((reasons || []).join(", ")) +
    ".</div>"
}

function renderSummaryItem(label, value) {
  return '<div class="summary-item"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(String(value)) + "</strong></div>"
}

function renderToolbar(data) {
  return [
    '<section class="toolbar" aria-label="Workbench controls">',
    data.filters.map(renderFilter).join(""),
    '<button type="button" class="secondary" id="clear-filters">Clear filters</button>',
    '<label class="row-search-label">Find <input id="row-search" class="row-search-input" type="search" placeholder="row id, page, step, color"></label>',
    '<span class="spacer"></span>',
    '<span class="visible-count" id="visible-count"></span>',
    '<button type="button" id="copy-label-json"' + (data.config.exportBlocked ? " disabled" : "") + ">Copy label JSON</button>",
    '<button type="button" id="download-label-json"' + (data.config.exportBlocked ? " disabled" : "") + ">Download labels</button>",
    '<a href="./details.html">Details</a>',
    '<a href="./report.json">report.json</a>',
    '<span class="muted" id="label-export-status"></span>',
    '</section>',
  ].join("")
}

function renderFilter(filter) {
  return '<label class="filter-label"><input type="checkbox" class="workbench-filter" data-filter="' +
    escapeAttribute(filter.id) +
    '"> ' +
    escapeHtml(filter.label) +
    ' <span class="muted">(' +
    escapeHtml(String(filter.count)) +
    ")</span></label>"
}

function renderRows(data) {
  if (!data.rows.length) {
    return "<p>No rows available for labeling.</p>"
  }

  return [
    '<div class="table-wrap">',
    '<table>',
    '<thead><tr><th>Part</th><th>Source</th><th>Chips</th><th>Current</th><th>Expected</th><th>Role</th><th>Note</th><th>Badges</th><th>Row</th></tr></thead>',
    '<tbody id="workbench-rows">',
    data.rows.map((row) => renderRow(row, data)).join(""),
    '</tbody>',
    '</table>',
    '</div>',
  ].join("")
}

function renderRow(row, data) {
  const role = row.labelRole || data.config.defaultRole || "active"
  const flagAttributes = Object.entries(row.flags || {})
    .map(([name, value]) => ' data-filter-' + escapeAttribute(name) + '="' + (value ? "true" : "false") + '"')
    .join("")

  return [
    '<tr class="workbench-row" data-item-id="' + escapeAttribute(row.itemId) + '" data-crop-hash="' + escapeAttribute(row.cropHash || "") + '" data-search-text="' + escapeAttribute(createRowSearchText(row)) + '"' + flagAttributes + ">",
    "<td>" + renderCrop(row.imageDataUrl) + "</td>",
    "<td>" + renderSourcePreview(row, data) + "</td>",
    "<td>" + renderChips(row.sampleChips) + "</td>",
    "<td>" + renderColor(row) + "</td>",
    "<td>" + renderExpectedColorInput(data.colorOptions, row) + "</td>",
    "<td>" + renderRoleSelect(data.roles, role) + "</td>",
    '<td><input class="note-input" type="text" value="' + escapeAttribute(row.labelNote || "") + '" aria-label="Label note for ' + escapeAttribute(row.itemId) + '"></td>',
    "<td>" + renderBadges(row.badges) + "</td>",
    '<td><span class="muted">' + escapeHtml(row.itemId) + "</span><br>p" + escapeHtml(String(row.pageNumber || "")) + " step " + escapeHtml(String(row.stepIndex || "")) + "</td>",
    "</tr>",
  ].join("")
}

function createRowSearchText(row) {
  return [
    row.itemId,
    row.colorName,
    row.labelExpectedName,
    row.manualClassId,
    row.rawManualClassId,
    row.swatchHex,
    row.pageNumber ? "page " + row.pageNumber : "",
    row.stepIndex ? "step " + row.stepIndex : "",
  ].filter(Boolean).join(" ")
}

function renderCrop(imageDataUrl) {
  return imageDataUrl
    ? '<a href="' + escapeAttribute(imageDataUrl) + '" target="_blank" rel="noreferrer"><img class="crop" alt="" src="' + escapeAttribute(imageDataUrl) + '"></a>'
    : ""
}

function renderExpectedColorInput(colorOptions, row) {
  const selectedName = readExpectedColorSelection(colorOptions, row)

  return '<div class="expected-color-picker"><input class="expected-color-input" type="text" autocomplete="off" value="' +
    escapeAttribute(selectedName) +
    '" placeholder="Type color" aria-label="Expected color for ' +
    escapeAttribute(row.itemId) +
    '" aria-autocomplete="list" aria-expanded="false">' +
    '<div class="expected-color-menu" role="listbox" hidden></div></div>'
}

function readExpectedColorSelection(colorOptions, row) {
  if (row.labelExpectedName) {
    return row.labelExpectedName
  }

  if (!row.colorName || row.colorName === "Unknown") {
    return ""
  }

  return (colorOptions || []).includes(row.colorName) ? row.colorName : ""
}

function renderSourcePreview(row, data) {
  const preview = data.sourcePreviewsById?.[row.sourcePreviewId]

  if (!preview?.imageDataUrl) {
    return '<span class="muted">No source preview</span>'
  }

  const markerStyle = markerStyleForRegion(row.partRegion, preview.region)

  return [
    '<a href="' + escapeAttribute(preview.imageDataUrl) + '" target="_blank" rel="noreferrer">',
    '<span class="source-preview-frame">',
    '<img class="source-preview" alt="Callout source for ' + escapeAttribute(row.itemId) + '" src="' + escapeAttribute(preview.imageDataUrl) + '">',
    markerStyle ? '<span class="source-marker" style="' + escapeAttribute(markerStyle) + '"></span>' : "",
    "</span>",
    "</a>",
  ].join("")
}

function markerStyleForRegion(partRegion, sourceRegion) {
  if (!partRegion || !sourceRegion || sourceRegion.width <= 0 || sourceRegion.height <= 0) {
    return ""
  }

  const left = (partRegion.x - sourceRegion.x) / sourceRegion.width
  const top = (partRegion.y - sourceRegion.y) / sourceRegion.height
  const right = (partRegion.x + partRegion.width - sourceRegion.x) / sourceRegion.width
  const bottom = (partRegion.y + partRegion.height - sourceRegion.y) / sourceRegion.height

  if (![left, top, right, bottom].every(Number.isFinite)) {
    return ""
  }

  const clampedLeft = clampRatio(left)
  const clampedTop = clampRatio(top)
  const clampedRight = clampRatio(right)
  const clampedBottom = clampRatio(bottom)
  const width = Math.max(0, clampedRight - clampedLeft)
  const height = Math.max(0, clampedBottom - clampedTop)

  if (width <= 0 || height <= 0) {
    return ""
  }

  return [
    "left:" + formatCssPercent(clampedLeft),
    "top:" + formatCssPercent(clampedTop),
    "width:" + formatCssPercent(width),
    "height:" + formatCssPercent(height),
  ].join(";")
}

function clampRatio(value) {
  return Math.max(0, Math.min(1, value))
}

function formatCssPercent(value) {
  return (value * 100).toFixed(3) + "%"
}

function renderColor(row) {
  return [
    row.swatchHex ? '<span class="swatch" style="background:' + escapeAttribute(row.swatchHex) + '"></span>' : "",
    escapeHtml(row.colorName || "Unknown"),
    '<br><span class="muted">',
    escapeHtml(row.colorStatus || "unknown"),
    " / ",
    row.manualClassTrusted ? "trusted" : "untrusted",
    "</span>",
  ].join("")
}

function renderRoleSelect(roles, selectedRole) {
  return '<select class="role-select" aria-label="Label role">' +
    roles.map((role) => '<option value="' + escapeAttribute(role) + '"' + (role === selectedRole ? " selected" : "") + ">" + escapeHtml(role) + "</option>").join("") +
    "</select>"
}

function renderBadges(badges) {
  return (badges || [])
    .map((badge) => '<span class="badge badge-' + escapeAttribute(badge.kind) + '">' + escapeHtml(badge.label) + "</span>")
    .join(" ")
}

function renderChips(chips) {
  if (!chips || !chips.length) {
    return ""
  }

  return '<div class="chips">' + chips.slice(0, 6).map((chip) => [
    '<span class="chip">',
    '<span class="chip-swatch" style="background:' + escapeAttribute(chip.hex) + '"></span>',
    escapeHtml(chip.hex || ""),
    " ",
    formatPercent(chip.coverage),
    "</span>",
  ].join("")).join("") + "</div>"
}

function formatPercent(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(Math.round(value * 100)) + "%"
    : ""
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

function renderExpectedColorSuggestions(input, menu, colorOptions) {
  const matches = matchExpectedColors(colorOptions, input.value).slice(0, 14)
  const pickerId = menu.dataset.pickerId || "0"

  input.classList.remove("expected-color-input-invalid")
  input.setAttribute("aria-expanded", "true")
  menu.hidden = false
  menu.innerHTML = matches.length > 0
    ? matches.map((name, index) => renderExpectedColorMenuOption(name, index, pickerId)).join("")
    : '<div class="expected-color-empty">No matches</div>'
  setExpectedColorMenuSelection(input, menu, matches.length > 0 ? 0 : -1)
}

function renderExpectedColorMenuOption(name, index, pickerId) {
  return '<button type="button" class="expected-color-option" role="option" id="expected-color-option-' +
    escapeAttribute(pickerId) +
    "-" +
    escapeAttribute(String(index)) +
    '" data-option-index="' +
    escapeAttribute(String(index)) +
    '" data-color-name="' +
    escapeAttribute(name) +
    '">' +
    escapeHtml(name) +
    "</button>"
}

function matchExpectedColors(colorOptions, value) {
  const query = normalizeColorQuery(value)

  if (!query) {
    return colorOptions.slice(0, 14)
  }

  const terms = query.split(" ")

  return colorOptions
    .map((name) => ({ name, key: normalizeColorQuery(name) }))
    .filter((entry) => terms.every((term) => entry.key.includes(term)))
    .sort((left, right) =>
      colorMatchRank(left.key, query) - colorMatchRank(right.key, query) ||
      left.name.localeCompare(right.name),
    )
    .map((entry) => entry.name)
}

function colorMatchRank(key, query) {
  if (key === query) {
    return 0
  }

  if (key.startsWith(query)) {
    return 1
  }

  return key.indexOf(query) >= 0 ? 2 : 3
}

function normalizeColorQuery(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9#_-]+/g, " ").trim()
}

function moveExpectedColorMenuSelection(input, menu, colorOptions, direction) {
  if (menu.hidden) {
    renderExpectedColorSuggestions(input, menu, colorOptions)
  }

  const options = Array.from(menu.querySelectorAll(".expected-color-option"))

  if (!options.length) {
    return
  }

  const currentIndex = Number(menu.dataset.activeIndex ?? "-1")
  const nextIndex = currentIndex < 0
    ? (direction > 0 ? 0 : options.length - 1)
    : (currentIndex + direction + options.length) % options.length

  setExpectedColorMenuSelection(input, menu, nextIndex)
  options[nextIndex].scrollIntoView?.({ block: "nearest" })
}

function setExpectedColorMenuSelection(input, menu, index) {
  const options = Array.from(menu.querySelectorAll(".expected-color-option"))

  for (const option of options) {
    const active = Number(option.dataset.optionIndex) === index

    option.classList.toggle("expected-color-option-active", active)
    option.setAttribute("aria-selected", active ? "true" : "false")
  }

  menu.dataset.activeIndex = String(index)

  const selectedOption = readSelectedExpectedColorOption(menu)

  if (selectedOption) {
    input.setAttribute("aria-activedescendant", selectedOption.id)
  } else {
    input.removeAttribute("aria-activedescendant")
  }
}

function readSelectedExpectedColorOption(menu) {
  const activeIndex = Number(menu.dataset.activeIndex ?? "-1")

  if (activeIndex < 0) {
    return null
  }

  return menu.querySelector('.expected-color-option[data-option-index="' + activeIndex + '"]')
}

function selectExpectedColor(input, menu, colorName) {
  input.value = colorName || ""
  closeExpectedColorMenu(input, menu)
  input.focus()
}

function closeExpectedColorMenu(input, menu) {
  input.setAttribute("aria-expanded", "false")
  input.removeAttribute("aria-activedescendant")
  menu.hidden = true
  menu.dataset.activeIndex = "-1"
}
`
