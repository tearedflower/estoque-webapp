export function previousMonthPeriod(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

export function periodClosing(closings = [], period) {
  return closings.find(closing =>
    Number(closing.year) === Number(period?.year) &&
    Number(closing.month) === Number(period?.month)
  ) || null
}

export function closingInconsistencyCount(summary = {}) {
  const issues = summary.inconsistencies || {}
  return Number(issues.negativeStock || 0) +
    Number(issues.movementMath || 0) +
    Number(issues.partialMovements || 0)
}
