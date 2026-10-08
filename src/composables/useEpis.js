import { ref, computed } from 'vue'
import * as api from '../services/api.js'

const roleRules = ref([])
const periodicities = ref([])
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

function sortRules(list) {
  return [...list].sort((a, b) =>
    collator.compare(a.roleName || '', b.roleName || '') ||
    collator.compare(a.targetLabel || a.targetKey || '', b.targetLabel || b.targetKey || '')
  )
}

function sortPeriods(list) {
  return [...list].sort((a, b) =>
    collator.compare(a.targetLabel || a.targetKey || '', b.targetLabel || b.targetKey || '')
  )
}

function normalizeTarget(target) {
  return {
    targetType: String(target.targetType || '').trim(),
    targetKey: String(target.targetKey || '').trim(),
    targetLabel: String(target.targetLabel || '').trim(),
  }
}

export function useEpis() {
  async function loadData() {
    const [rules, periods] = await Promise.all([
      api.getEpiRoleRules(),
      api.getEpiPeriodicities(),
    ])
    roleRules.value = sortRules(rules)
    periodicities.value = sortPeriods(periods)
  }

  const activeRoleRules = computed(() => sortRules(roleRules.value.filter(r => r.active)))
  const activePeriodicities = computed(() => sortPeriods(periodicities.value.filter(p => p.active)))

  async function addRoleRule(roleName, target, days = 30, quantity = 1) {
    const cleanRole = String(roleName || '').trim()
    const cleanTarget = normalizeTarget(target)
    const cleanDays = Number(days)
    const cleanQuantity = Number(quantity)
    if (!cleanRole) return { ok: false, error: 'Cargo obrigatorio.' }
    if (!cleanTarget.targetType || !cleanTarget.targetKey) return { ok: false, error: 'EPI obrigatorio.' }
    if (!Number.isInteger(cleanDays) || cleanDays < 0) return { ok: false, error: 'Periodicidade invalida.' }
    if (!Number.isInteger(cleanQuantity) || cleanQuantity <= 0) return { ok: false, error: 'Quantidade invalida.' }
    if (roleRules.value.some(r =>
      r.roleName.toLowerCase() === cleanRole.toLowerCase() &&
      r.targetType === cleanTarget.targetType &&
      r.targetKey === cleanTarget.targetKey
    )) return { ok: false, error: 'Este EPI ja esta vinculado ao cargo.' }

    try {
      const created = await api.createEpiRoleRule({ roleName: cleanRole, ...cleanTarget, days: cleanDays, quantity: cleanQuantity, active: true })
      roleRules.value = sortRules([...roleRules.value, created])
      return { ok: true, rule: created }
    } catch (cause) {
      return { ok: false, error: cause.message || 'Nao foi possivel vincular o EPI ao cargo.' }
    }
  }

  async function editRoleRule(id, changes) {
    const current = roleRules.value.find(r => r.id === id)
    if (!current) return { ok: false, error: 'Regra nao encontrada.' }
    const updated = await api.updateEpiRoleRule(id, { ...current, ...changes })
    Object.assign(current, updated)
    roleRules.value = sortRules(roleRules.value)
    return { ok: true, rule: updated }
  }

  async function deleteRoleRule(id) {
    await api.deleteEpiRoleRule(id)
    roleRules.value = roleRules.value.filter(r => r.id !== id)
  }

  async function addPeriodicity(target, days) {
    const cleanTarget = normalizeTarget(target)
    const cleanDays = Number(days)
    if (!cleanTarget.targetType || !cleanTarget.targetKey) return { ok: false, error: 'EPI obrigatorio.' }
    if (!Number.isInteger(cleanDays) || cleanDays <= 0) return { ok: false, error: 'Periodicidade invalida.' }
    if (periodicities.value.some(p => p.targetType === cleanTarget.targetType && p.targetKey === cleanTarget.targetKey)) {
      return { ok: false, error: 'Periodicidade ja cadastrada para este EPI.' }
    }

    const created = await api.createEpiPeriodicity({ ...cleanTarget, days: cleanDays, active: true })
    periodicities.value = sortPeriods([...periodicities.value, created])
    return { ok: true, periodicity: created }
  }

  async function editPeriodicity(id, changes) {
    const current = periodicities.value.find(p => p.id === id)
    if (!current) return { ok: false, error: 'Periodicidade nao encontrada.' }
    const updated = await api.updateEpiPeriodicity(id, { ...current, ...changes })
    Object.assign(current, updated)
    periodicities.value = sortPeriods(periodicities.value)
    return { ok: true, periodicity: updated }
  }

  async function deletePeriodicity(id) {
    await api.deleteEpiPeriodicity(id)
    periodicities.value = periodicities.value.filter(p => p.id !== id)
  }

  return {
    roleRules,
    periodicities,
    activeRoleRules,
    activePeriodicities,
    loadData,
    addRoleRule,
    editRoleRule,
    deleteRoleRule,
    addPeriodicity,
    editPeriodicity,
    deletePeriodicity,
  }
}
