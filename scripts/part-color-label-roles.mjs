export const PART_COLOR_LABEL_ROLES = [
  "gate",
  "train",
  "holdout",
  "active",
  "excluded",
]

const VALID_LABEL_ROLES = new Set(PART_COLOR_LABEL_ROLES)
const SCORED_LABEL_ROLES = new Set(["gate", "train", "holdout", "active"])
const TRAINABLE_LABEL_ROLES = new Set(["gate", "train"])

export function defaultPartColorLabelRole(status) {
  return status === "gate" ? "gate" : "active"
}

export function normalizePartColorLabelRole(label, fallbackStatus = "active", context = "part color label") {
  const role = label?.role ?? defaultPartColorLabelRole(fallbackStatus)

  if (!VALID_LABEL_ROLES.has(role)) {
    throw new Error(`${context}.role must be one of ${PART_COLOR_LABEL_ROLES.join(", ")}.`)
  }

  return role
}

export function normalizePartColorLabel(label, {
  context = "part color label",
  fallbackStatus = "active",
} = {}) {
  return {
    cropHash: label.cropHash ?? null,
    expectedName: label.expectedName,
    itemId: label.itemId,
    note: label.note ?? null,
    role: normalizePartColorLabelRole(label, fallbackStatus, context),
  }
}

export function isPartColorLabelScored(label) {
  return SCORED_LABEL_ROLES.has(label.role)
}

export function isPartColorLabelTrainable(label) {
  return TRAINABLE_LABEL_ROLES.has(label.role)
}

export function countPartColorLabelRoles(labels) {
  const counts = Object.fromEntries(PART_COLOR_LABEL_ROLES.map((role) => [role, 0]))

  for (const label of labels) {
    const role = label.role ?? "active"

    if (role in counts) {
      counts[role] += 1
    }
  }

  return counts
}
