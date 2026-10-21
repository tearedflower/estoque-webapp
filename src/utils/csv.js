export function serializeCsv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '').replace(/\r?\n/g, ' ').trim()
    if (typeof value === 'string' && /^[=+@-]/.test(text)) text = "'" + text
    return `"${text.replace(/"/g, '""')}"`
  }).join(';')).join('\r\n')
}
