export function formatPersonName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s'-])(\p{L})/gu, (_, before, letter) => before + letter.toLocaleUpperCase('pt-BR'))
}

export function formatRoleName(value) {
  return formatPersonName(value)
}

export function roleNameKey(value) {
  return formatRoleName(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}
