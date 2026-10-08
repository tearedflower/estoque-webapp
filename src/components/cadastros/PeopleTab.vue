<script setup>
import { computed, inject, ref, watch } from 'vue'
import { PERSON_STATUSES, formatRoleName, personStatusLabel, usePeople } from '../../composables/usePeople.js'
import { useRoles } from '../../composables/useRoles.js'
import { useToast } from '../../composables/useToast.js'
import { parsePeopleCsv } from '../../utils/peopleCsv.js'
import * as api from '../../services/api.js'
import RolesTab from './RolesTab.vue'

const props = defineProps({
  initialSection: { type: String, default: 'funcionarios' },
})
const { people, addPerson, editPerson, togglePersonActive, deletePerson } = usePeople()
const { roles, activeRoles, addRole } = useRoles()
const { success, error } = useToast()
const environmentBadge = inject('environmentBadge', ref(null))
const isDev = computed(() =>
  import.meta.env.DEV ||
  environmentBadge.value?.env === 'DEV' ||
  (window.location.hostname === 'localhost' && window.location.port === '3001')
)

const newPersonName = ref('')
const newPersonRole = ref('')
const newPersonRegistration = ref('')
const newPersonStatus = ref('ativo')
const addingPerson = ref(false)
const peopleSection = ref(props.initialSection === 'cargos' ? 'cargos' : 'funcionarios')
const editingPersonId = ref(null)
const editPersonName = ref('')
const editPersonRole = ref('')
const editPersonRegistration = ref('')
const editPersonStatus = ref('ativo')
const personStatusFilter = ref(['all'])
const personSearch = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const selectedPersonIds = ref([])
const csvInput = ref(null)
const csvImporting = ref(false)
const csvImportSummary = ref('')
const bulkDeleting = ref(false)
const personSaving = ref(false)
const syncStatus = ref(null)
const syncSaving = ref(false)
const personStatusFilterLabels = {
  ativo: 'Ativas',
  inativo: 'Inativas',
  demitido: 'Demitidas',
  afastado: 'Afastadas',
}

const canAddPerson = computed(() => newPersonName.value.trim().length > 0 && !personSaving.value)
const canEditPerson = computed(() => editPersonName.value.trim().length > 0 && !personSaving.value)
const personStatusOptions = computed(() => [
  { id: 'all', label: 'Todas', count: people.value.length },
  ...PERSON_STATUSES.map(status => ({
    ...status,
    label: personStatusFilterLabels[status.id] || status.label,
    count: people.value.filter(person => personStatus(person) === status.id).length,
  })),
])
const filteredPeople = computed(() =>
  (personStatusFilter.value.includes('all')
    ? people.value
    : people.value.filter(person => personStatusFilter.value.includes(personStatus(person)))
  ).filter(person => {
    const q = normalizeSearch(personSearch.value)
    if (!q) return true
    return [person.name, person.registration, person.role, personStatusLabel(personStatus(person))]
      .some(value => normalizeSearch(value).includes(q))
  })
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredPeople.value.length / pageSize.value)))
const paginatedPeople = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredPeople.value.slice(start, start + pageSize.value)
})
const selectedPeople = computed(() => people.value.filter(person => selectedPersonIds.value.includes(person.id)))

watch([personStatusFilter, personSearch, pageSize], () => {
  currentPage.value = 1
  selectedPersonIds.value = []
})
watch(() => props.initialSection, section => {
  peopleSection.value = section === 'cargos' ? 'cargos' : 'funcionarios'
})
watch(currentPage, () => { selectedPersonIds.value = [] })
watch(people, () => {
  const ids = new Set(people.value.map(person => person.id))
  selectedPersonIds.value = selectedPersonIds.value.filter(id => ids.has(id))
})
watch(totalPages, total => {
  if (currentPage.value > total) currentPage.value = total
})
watch(isDev, async value => {
  if (!value) return
  try { syncStatus.value = await api.getPeopleRoleSync() } catch { syncStatus.value = null }
}, { immediate: true })

async function togglePeopleRoleSync() {
  if (syncSaving.value) return
  syncSaving.value = true
  try {
    const next = !syncStatus.value?.enabled
    syncStatus.value = await api.updatePeopleRoleSync(next)
    success(next ? 'Sincronizacao de pessoas e cargos ativada.' : 'Sincronizacao desativada.')
  } catch (cause) {
    error(cause.message || 'Nao foi possivel alterar a sincronizacao.')
  } finally {
    syncSaving.value = false
  }
}

async function syncPeopleRolesNow() {
  if (syncSaving.value) return
  syncSaving.value = true
  try {
    syncStatus.value = await api.runPeopleRoleSync()
    success('Pessoas e cargos sincronizados com o PROD.')
  } catch (cause) {
    error(cause.message || 'Nao foi possivel sincronizar pessoas e cargos.')
  } finally {
    syncSaving.value = false
  }
}

function startAddPerson() { addingPerson.value = true; newPersonName.value = ''; newPersonRole.value = ''; newPersonRegistration.value = ''; newPersonStatus.value = 'ativo' }
function cancelAddPerson() { addingPerson.value = false }
async function confirmAddPerson() {
  if (!canAddPerson.value) return
  personSaving.value = true
  try {
    const r = await addPerson(newPersonName.value, newPersonRole.value, newPersonStatus.value, newPersonRegistration.value)
    if (!r.ok) { error(r.error); return }
    success('Pessoa adicionada.')
    addingPerson.value = false
  } finally {
    personSaving.value = false
  }
}
async function importPeopleCsv(event) {
  const file = event.target.files?.[0]
  if (!file || csvImporting.value) return
  csvImporting.value = true
  csvImportSummary.value = ''
  try {
    const parsed = parsePeopleCsv(await file.text())
    if (!parsed.rows.length) {
      error('CSV sem pessoas validas.')
      return
    }

    const rolesCreated = await createMissingRoles(parsed.rows)
    let created = 0
    let failed = parsed.skipped
    for (const row of parsed.rows) {
      try {
        const result = await addPerson(row.name, row.role, 'ativo')
        if (result.ok) created += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }

    csvImportSummary.value = [
      `${created} pessoa(s) importada(s).`,
      rolesCreated ? `${rolesCreated} cargo(s) cadastrado(s).` : '',
      failed ? `${failed} linha(s) ignorada(s).` : '',
    ].filter(Boolean).join(' ')
    if (created) success(csvImportSummary.value)
    else error('Nenhuma pessoa foi importada.')
  } finally {
    csvImporting.value = false
    if (csvInput.value) csvInput.value.value = ''
  }
}

async function createMissingRoles(rows) {
  const known = new Set(roles.value.map(role => normalizeSearch(role.name)))
  let created = 0
  for (const row of rows) {
    const roleName = formatRoleName(row.role)
    const key = normalizeSearch(roleName)
    if (!key || known.has(key)) continue
    const result = await addRole(roleName)
    known.add(key)
    if (result.ok) created += 1
  }
  return created
}
function startEditPerson(p) {
  editingPersonId.value = p.id
  editPersonName.value = p.name
  editPersonRole.value = p.role || ''
  editPersonRegistration.value = p.registration || ''
  editPersonStatus.value = p.status || (p.active ? 'ativo' : 'inativo')
}
function cancelEditPerson() { editingPersonId.value = null }
async function confirmEditPerson() {
  if (!canEditPerson.value) return
  personSaving.value = true
  try {
    const r = await editPerson(editingPersonId.value, {
      name: editPersonName.value,
      role: editPersonRole.value,
      registration: editPersonRegistration.value,
      status: editPersonStatus.value,
      active: editPersonStatus.value === 'ativo',
    })
    if (!r.ok) { error(r.error); return }
    success('Pessoa atualizada.')
    editingPersonId.value = null
  } finally {
    personSaving.value = false
  }
}
function onDeletePerson(p) {
  if (!confirm(`Excluir "${p.name}"?`)) return
  deletePerson(p.id)
  success('Pessoa removida.')
}

async function deleteSelectedPeople() {
  const rows = selectedPeople.value
  if (!rows.length || bulkDeleting.value) return
  if (!confirm(`Excluir ${rows.length} pessoa(s) selecionada(s)?`)) return
  bulkDeleting.value = true
  try {
    let removed = 0
    for (const person of rows) {
      try {
        await deletePerson(person.id)
        removed += 1
      } catch {}
    }
    selectedPersonIds.value = []
    if (removed) success(`${removed} pessoa(s) removida(s).`)
    if (removed < rows.length) error(`${rows.length - removed} pessoa(s) não foram removida(s).`)
  } finally {
    bulkDeleting.value = false
  }
}

function togglePersonSelection(personId) {
  selectedPersonIds.value = selectedPersonIds.value.includes(personId)
    ? selectedPersonIds.value.filter(id => id !== personId)
    : [...selectedPersonIds.value, personId]
}

function isPersonStatusFilterSelected(id) {
  return personStatusFilter.value.includes(id)
}

function togglePersonStatusFilter(id) {
  if (id === 'all') {
    personStatusFilter.value = ['all']
    return
  }
  const selected = personStatusFilter.value.includes('all')
    ? []
    : personStatusFilter.value.filter(status => status !== id)
  if (!personStatusFilter.value.includes(id)) selected.push(id)
  personStatusFilter.value = selected.length ? selected : ['all']
}

async function deleteAllPeopleDev() {
  if (!isDev.value || bulkDeleting.value || !people.value.length) return
  const total = people.value.length
  if (!confirm(`DEV: remover TODAS as ${total} pessoa(s)?`)) return
  bulkDeleting.value = true
  try {
    let removed = 0
    for (const person of [...people.value]) {
      try {
        await deletePerson(person.id)
        removed += 1
      } catch {}
    }
    selectedPersonIds.value = []
    if (removed) success(`DEV: ${removed} pessoa(s) removida(s).`)
    if (removed < total) error('Algumas pessoas não foram removidas.')
  } finally {
    bulkDeleting.value = false
  }
}

function personStatus(person) {
  return person.status || (person.active ? 'ativo' : 'inativo')
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function personStatusClass(person) {
  const status = personStatus(person)
  if (status === 'ativo') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  if (status === 'afastado') return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
  if (status === 'demitido') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
  return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
}
</script>
<template>
<!-- ===== Pessoas ===== -->
  <div>
    <div class="w-full">
      <p v-if="csvImportSummary" class="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">{{ csvImportSummary }}</p>
      <div v-if="isDev && syncStatus?.available" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div>
          <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">Sincronizar pessoas e cargos com o PROD</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">Quando ativo, alterações feitas no DEV são enviadas após um backup automático.</p>
          <p v-if="syncStatus.lastError" class="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{{ syncStatus.lastError }}</p>
        </div>
        <div class="flex items-center gap-2">
          <button v-if="syncStatus.enabled" type="button" class="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" :disabled="syncSaving" @click="syncPeopleRolesNow">Sincronizar agora</button>
          <button type="button" class="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" :class="syncStatus.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'" :disabled="syncSaving" :aria-pressed="syncStatus.enabled" @click="togglePeopleRoleSync">{{ syncStatus.enabled ? 'Ativada' : 'Desativada' }}</button>
        </div>
      </div>

      <template v-if="peopleSection === 'funcionarios'">
      <div class="ds-toolbar mb-4 justify-between">
        <nav class="ds-segmented inline-flex" aria-label="Seções de pessoas">
          <button
            type="button"
            class="ds-segmented-item"
            :class="peopleSection === 'funcionarios' ? 'ds-segmented-item-active' : ''"
            @click="peopleSection = 'funcionarios'"
          >
            Funcionários
          </button>
          <button
            type="button"
            class="ds-segmented-item"
            :class="peopleSection === 'cargos' ? 'ds-segmented-item-active' : ''"
            @click="peopleSection = 'cargos'"
          >
            Cargos
          </button>
        </nav>
        <div class="flex flex-wrap gap-2">
          <label class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
            {{ csvImporting ? 'Importando...' : 'Importar CSV' }}
            <input
              ref="csvInput"
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              :disabled="csvImporting"
              @change="importPeopleCsv"
            />
          </label>
          <button
            v-if="!addingPerson"
            class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700"
            @click="startAddPerson"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Nova pessoa
          </button>
          <button
            v-if="isDev"
            type="button"
            class="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
            :disabled="bulkDeleting || !people.length"
            title="Disponível apenas no ambiente de desenvolvimento"
            @click="deleteAllPeopleDev"
          >
            {{ bulkDeleting ? 'Removendo...' : 'Remover tudo do DEV' }}
          </button>
        </div>
      </div>

      <!-- Add form -->
      <div v-if="addingPerson" class="mb-4 rounded-xl border border-primary-300 dark:border-primary-700 bg-primary-50/40 dark:bg-primary-900/10 p-4 flex flex-col gap-3">
        <p class="text-xs font-semibold text-primary-600 dark:text-primary-400">Nova pessoa</p>
        <input
          v-model="newPersonName"
          placeholder="Nome completo"
          class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
          autofocus
          @keydown.enter="confirmAddPerson"
          @keydown.escape="cancelAddPerson"
        />
        <input
          v-model="newPersonRegistration"
          placeholder="Nº da matrícula (opcional)"
          class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
          @keydown.enter="confirmAddPerson"
          @keydown.escape="cancelAddPerson"
        />
        <div v-if="activeRoles.length">
          <select
            v-model="newPersonRole"
            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
          >
            <option value="">— Sem cargo —</option>
            <option v-for="r in activeRoles" :key="r.id" :value="r.name">{{ r.name }}</option>
          </select>
        </div>
        <div v-else class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          Nenhum cargo cadastrado. Adicione na sub-aba <strong>Cargos</strong> para vincular.
        </div>
        <select
          v-model="newPersonStatus"
          class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
        >
          <option v-for="status in PERSON_STATUSES" :key="status.id" :value="status.id">{{ status.label }}</option>
        </select>
        <p v-if="!newPersonName.trim()" class="text-xs text-amber-600 dark:text-amber-400">Informe o nome da pessoa.</p>
        <div class="flex gap-2">
          <button
            class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-[var(--ds-primary-text)] hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canAddPerson"
            @click="confirmAddPerson"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            {{ personSaving ? 'Salvando...' : 'Salvar' }}
          </button>
          <button class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" :disabled="personSaving" @click="cancelAddPerson">Cancelar</button>
        </div>
      </div>

      <!-- People table -->
      <div class="ds-toolbar mb-3 flex-col !items-stretch">
        <div>
          <p class="text-xs font-semibold text-gray-700 dark:text-gray-200">Buscar e filtrar</p>
          <p class="text-xs text-gray-400 dark:text-gray-500">{{ filteredPeople.length }} de {{ people.length }} pessoas</p>
        </div>
        <div class="grid gap-2 sm:grid-cols-[1fr_auto_6rem]">
          <input
            v-model="personSearch"
            type="search"
            placeholder="Buscar por nome, matrícula ou cargo..."
            class="ds-input"
          />
          <div class="flex min-h-10 flex-wrap items-center gap-1 rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-700">
            <button
              v-for="option in personStatusOptions"
              :key="option.id"
              type="button"
              class="rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
              :class="isPersonStatusFilterSelected(option.id)
                ? 'bg-primary-600 text-[var(--ds-primary-text)]'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100'"
              :aria-pressed="isPersonStatusFilterSelected(option.id)"
              @click="togglePersonStatusFilter(option.id)"
            >
              {{ option.label }} <span class="tabular-nums opacity-70">({{ option.count }})</span>
            </button>
          </div>
          <select
            v-model.number="pageSize"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="40">40</option>
          </select>
        </div>
      </div>
      <div class="ds-table-wrap overflow-x-auto">
        <div v-if="selectedPersonIds.length" class="flex flex-col gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-xs dark:border-red-900/40 dark:bg-red-950/20 sm:flex-row sm:items-center sm:justify-between">
          <span class="font-semibold text-red-700 dark:text-red-300">{{ selectedPersonIds.length }} pessoa(s) selecionada(s)</span>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="bulkDeleting"
            @click="deleteSelectedPeople"
          >
            {{ bulkDeleting ? 'Removendo...' : 'Excluir selecionadas' }}
          </button>
        </div>
        <table v-if="filteredPeople.length" class="ds-table table-fixed min-w-[40rem]">
          <thead>
            <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
              <th class="w-[34%] text-left px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Nome</th>
              <th class="w-[14%] text-left px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Matrícula</th>
              <th class="text-left px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Cargo</th>
              <th class="text-center px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-24">Status</th>
              <th class="px-4 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-36">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in paginatedPeople"
              :key="p.id"
              class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              :class="{
                'opacity-50': !p.active,
                'bg-primary-50/50 dark:bg-primary-900/10': selectedPersonIds.includes(p.id),
              }"
            >
              <!-- Editing row -->
              <template v-if="editingPersonId === p.id">
                <td class="px-4 py-3">
                  <input v-model="editPersonName" class="w-full px-2 py-1 text-sm border border-primary-400 dark:border-primary-500 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none" @keydown.enter="confirmEditPerson" @keydown.escape="cancelEditPerson" autofocus />
                </td>
                <td class="px-4 py-3">
                  <input v-model="editPersonRegistration" placeholder="Opcional" class="w-full px-2 py-1 text-sm border border-primary-400 dark:border-primary-500 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none" @keydown.enter="confirmEditPerson" @keydown.escape="cancelEditPerson" />
                </td>
                <td class="px-4 py-3">
                  <select v-if="activeRoles.length" v-model="editPersonRole" class="w-full px-2 py-1 text-sm border border-primary-400 dark:border-primary-500 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none">
                    <option value="">— Sem cargo —</option>
                    <option v-for="r in activeRoles" :key="r.id" :value="r.name">{{ r.name }}</option>
                  </select>
                  <span v-else class="text-xs text-gray-400 dark:text-gray-500 italic">Sem cargos cadastrados</span>
                </td>
                <td class="px-4 py-3">
                  <select v-model="editPersonStatus" class="w-full px-2 py-1 text-sm border border-primary-400 dark:border-primary-500 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none">
                    <option v-for="status in PERSON_STATUSES" :key="status.id" :value="status.id">{{ status.label }}</option>
                  </select>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-center gap-1">
                    <button class="p-1 text-green-500 hover:text-green-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Salvar" :disabled="!canEditPerson" @click="confirmEditPerson">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    </button>
                    <button class="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Cancelar" :disabled="personSaving" @click="cancelEditPerson">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </td>
              </template>
              <!-- Display row -->
              <template v-else>
                <td class="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{{ p.name }}</td>
                <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{{ p.registration || '—' }}</td>
                <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{{ p.role || '—' }}</td>
                <td class="px-4 py-3 text-center">
                  <button
                    class="px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors"
                    :class="personStatusClass(p)"
                    @click="togglePersonActive(p.id)"
                  >{{ personStatusLabel(personStatus(p)) }}</button>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-center gap-0.5">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 px-2 text-xs font-semibold transition-colors"
                      :class="selectedPersonIds.includes(p.id)
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-primary-700 dark:hover:bg-gray-700 dark:hover:text-primary-300'"
                      :aria-label="`${selectedPersonIds.includes(p.id) ? 'Remover' : 'Selecionar'} ${p.name}`"
                      :aria-pressed="selectedPersonIds.includes(p.id)"
                      :title="selectedPersonIds.includes(p.id) ? 'Remover da seleção' : 'Selecionar pessoa'"
                      @click="togglePersonSelection(p.id)"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" />
                        <path v-if="selectedPersonIds.includes(p.id)" stroke-linecap="round" stroke-linejoin="round" d="m8.5 12 2.25 2.25L15.5 9.5" />
                      </svg>
                    </button>
                    <button class="p-1 text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors" title="Editar" @click="startEditPerson(p)">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                    </button>
                    <button class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Excluir" @click="onDeletePerson(p)">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                    </button>
                  </div>
                </td>
              </template>
            </tr>
          </tbody>
        </table>

        <div v-if="filteredPeople.length" class="flex flex-col gap-2 border-t border-gray-200 bg-gray-50/70 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Página {{ currentPage }} de {{ totalPages }} · {{ filteredPeople.length }} registro(s)</span>
          <div class="flex items-center gap-1">
            <button type="button" class="rounded-lg px-2 py-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage <= 1" @click="currentPage--">Anterior</button>
            <button type="button" class="rounded-lg px-2 py-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage >= totalPages" @click="currentPage++">Próxima</button>
          </div>
        </div>

        <div v-else-if="people.length" class="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
          <p class="text-sm">Nenhuma pessoa encontrada.</p>
          <p class="text-xs mt-1">Troque a busca ou o filtro para ver outros cadastros.</p>
        </div>

        <!-- Empty state -->
        <div v-else class="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
          <svg class="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          <p class="text-sm">Nenhuma pessoa cadastrada.</p>
          <p class="text-xs mt-1">Clique em <strong>Nova pessoa</strong> para adicionar.</p>
        </div>
      </div>
      </template>

      <RolesTab v-else>
        <template #toolbar-start>
          <nav class="ds-segmented inline-flex" aria-label="Seções de pessoas">
            <button
              type="button"
              class="ds-segmented-item"
              :class="peopleSection === 'funcionarios' ? 'ds-segmented-item-active' : ''"
              @click="peopleSection = 'funcionarios'"
            >
              Funcionários
            </button>
            <button
              type="button"
              class="ds-segmented-item"
              :class="peopleSection === 'cargos' ? 'ds-segmented-item-active' : ''"
              @click="peopleSection = 'cargos'"
            >
              Cargos
            </button>
          </nav>
        </template>
        <template #toolbar-actions>
          <label class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
            {{ csvImporting ? 'Importando...' : 'Importar CSV' }}
            <input
              ref="csvInput"
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              :disabled="csvImporting"
              @change="importPeopleCsv"
            />
          </label>
        </template>
      </RolesTab>
    </div>
  </div>
</template>
