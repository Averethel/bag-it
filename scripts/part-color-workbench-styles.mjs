export const PART_COLOR_WORKBENCH_STYLES = `
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.45;
}

* {
  box-sizing: border-box;
}

body {
  background: #f5f7f9;
  color: #172026;
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

.workbench-app {
  margin: 0 auto;
  max-width: 1680px;
  padding: 24px;
}

.topbar {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 16px;
}

.topbar h1 {
  font-size: 24px;
  letter-spacing: 0;
  margin: 0 0 6px;
}

.muted {
  color: #62717d;
}

.summary-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  margin: 12px 0 18px;
}

.summary-item {
  background: #fff;
  border: 1px solid #d7dee5;
  border-radius: 6px;
  padding: 10px;
}

.summary-item span {
  color: #62717d;
  display: block;
  font-size: 12px;
  margin-bottom: 2px;
}

.summary-item strong {
  font-size: 20px;
  font-weight: 700;
}

.banner {
  background: #fff1f2;
  border: 1px solid #fda4af;
  border-radius: 6px;
  color: #991b1b;
  margin: 12px 0;
  padding: 10px 12px;
}

.chunk-nav {
  align-items: center;
  background: #fff;
  border: 1px solid #d7dee5;
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px;
}

.chunk-link {
  border: 1px solid #c8d1da;
  border-radius: 4px;
  color: #172026;
  padding: 5px 8px;
  text-decoration: none;
}

.chunk-current {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}

.toolbar {
  align-items: center;
  background: #fff;
  border: 1px solid #d7dee5;
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
  padding: 10px;
  position: sticky;
  top: 0;
  z-index: 3;
}

.filter-label {
  align-items: center;
  border: 1px solid #c8d1da;
  border-radius: 4px;
  display: inline-flex;
  gap: 6px;
  padding: 6px 8px;
}

.filter-label input {
  margin: 0;
}

.row-search-label {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.row-search-input {
  border: 1px solid #94a3b8;
  border-radius: 4px;
  min-height: 34px;
  min-width: 260px;
  padding: 5px 8px;
}

.toolbar button,
.toolbar a {
  align-items: center;
  border-radius: 4px;
  display: inline-flex;
  min-height: 34px;
  padding: 6px 10px;
  text-decoration: none;
}

.toolbar button {
  background: #0f766e;
  border: 0;
  color: #fff;
  cursor: pointer;
}

.toolbar button.secondary,
.toolbar a {
  background: #eef2f6;
  border: 1px solid #c8d1da;
  color: #172026;
}

.toolbar button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.spacer {
  flex: 1 1 auto;
}

.visible-count {
  color: #334155;
  font-weight: 700;
}

.json-output {
  border: 1px solid #94a3b8;
  border-radius: 6px;
  display: none;
  min-height: 180px;
  padding: 10px;
  width: 100%;
}

.table-wrap {
  background: #fff;
  border: 1px solid #d7dee5;
  border-radius: 6px;
  overflow: auto;
}

table {
  border-collapse: collapse;
  min-width: 1500px;
  width: 100%;
}

th,
td {
  border-bottom: 1px solid #d7dee5;
  padding: 8px;
  text-align: left;
  vertical-align: top;
}

th {
  background: #f0f3f6;
  color: #475569;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: uppercase;
}

tr[hidden] {
  display: none;
}

.row-search-match {
  box-shadow: inset 4px 0 0 #0f766e;
}

.crop {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #d8dee4 25%, transparent 25%),
    linear-gradient(-45deg, #d8dee4 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d8dee4 75%),
    linear-gradient(-45deg, transparent 75%, #d8dee4 75%);
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
  background-size: 12px 12px;
  border: 1px solid #8c959f;
  max-height: 80px;
  max-width: 124px;
  object-fit: contain;
}

.source-preview-frame {
  display: inline-block;
  line-height: 0;
  position: relative;
}

.source-preview {
  background: #fff;
  border: 1px solid #8c959f;
  display: block;
  max-height: 150px;
  max-width: 260px;
  object-fit: contain;
}

.source-marker {
  border: 2px solid #0284c7;
  box-shadow: 0 0 0 1px #ffffff, 0 0 0 3px rgba(2, 132, 199, .2);
  pointer-events: none;
  position: absolute;
}

.swatch,
.chip-swatch {
  border: 1px solid #8c959f;
  display: inline-block;
  vertical-align: middle;
}

.swatch {
  height: 22px;
  margin-right: 8px;
  width: 38px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 280px;
}

.chip {
  align-items: center;
  border: 1px solid #d8dee4;
  display: inline-flex;
  gap: 4px;
  padding: 2px 4px;
  white-space: nowrap;
}

.chip-swatch {
  height: 14px;
  width: 22px;
}

.badge {
  border-radius: 3px;
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  margin: 2px 4px 2px 0;
  padding: 2px 5px;
  text-transform: uppercase;
}

.badge-conflict,
.badge-drift,
.badge-mismatch,
.badge-missing {
  background: #fee2e2;
  color: #991b1b;
}

.badge-excluded,
.badge-unknown {
  background: #e2e8f0;
  color: #334155;
}

.badge-review,
.badge-close-pair {
  background: #fef3c7;
  color: #92400e;
}

.badge-match {
  background: #dcfce7;
  color: #166534;
}

.expected-color-picker {
  min-width: 260px;
  position: relative;
}

.expected-color-input,
.note-input,
.role-select {
  border: 1px solid #94a3b8;
  border-radius: 4px;
  padding: 5px 6px;
}

.expected-color-input {
  width: 100%;
}

.expected-color-input-invalid {
  border-color: #dc2626;
  box-shadow: 0 0 0 2px rgba(220, 38, 38, .16);
}

.expected-color-menu {
  background: #fff;
  border: 1px solid #94a3b8;
  border-radius: 4px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, .18);
  left: 0;
  max-height: 260px;
  overflow-y: auto;
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 8;
}

.expected-color-option {
  background: #fff;
  border: 0;
  color: #172026;
  cursor: pointer;
  display: block;
  padding: 6px 8px;
  text-align: left;
  width: 100%;
}

.expected-color-option:hover,
.expected-color-option:focus,
.expected-color-option-active {
  background: #e0f2fe;
  outline: none;
}

.expected-color-empty {
  color: #62717d;
  padding: 6px 8px;
}

.note-input {
  min-width: 220px;
}

@media (max-width: 900px) {
  .workbench-app {
    padding: 12px;
  }

  .topbar {
    display: block;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }

}
`
