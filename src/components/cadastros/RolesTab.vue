<script setup>
import { computed, inject, ref, watch } from 'vue'
import { usePeople } from '../../composables/usePeople.js'
import { useRoles } from '../../composables/useRoles.js'
import { useToast } from '../../composables/useToast.js'

const { roles, addRole, editRole, toggleRoleActive, deleteRole } = useRoles()
const { loadData: loadPeople } = usePeople()
const { success, error } = useToast()
const environmentBadge = inject('environmentBadge', ref(null))
const isDev = computed(() =>
  import.meta.env.DEV ||
  environmentBadge.value?.env === 'DEV' ||
  (window.location.hostname === 'localhost' && window.location.port === '3001')
)

const newRoleName = ref('')
const newRoleDesc = ref('')
const addingRole = ref(false)
const editingRoleId = ref(null)
const editRoleName = ref('')
const editRoleDesc = ref('')
const roleSearch = ref('')
const roleStatusFilter = ref('all')
const currentPage = ref(1)
const pageSize = ref(20)
const selectedRoleIds = ref([])
const roleSaving = ref(false)
const bulkDeleting = ref(false)

const canAddRole = computed(() => newRoleName.value.trim().length > 0 && !roleSaving.value)
const canEditRole = computed(() => editRoleName.value.trim().length > 0 && !roleSaving.value)
const roleStatusOptions = computed(() => [
  { id: 'all', label: 'Todos', count: roles.value.length },
  { id: 'active', label: 'Ativos', count: roles.value.filter(role => role.active).length },
  { id: 'inactive', label: 'Inativos', count: roles.value.filter(role => !role.active).length },
])
const filteredRoles = computed(() =>
  roles.value
    .filter(role =>
      roleStatusFilter.value === 'all' ||
      (roleStatusFilter.value === 'active' && role.active) ||
      (roleStatusFilter.value === 'inactive' && !role.active)
    )
    .filter(role => {
      const q = normalizeSearch(roleSearch.value)
      if (!q) return true
      return [role.name, role.description, role.active ? 'ativo' : 'inativo']
        .some(value => normalizeSearch(value).includes(q))
    })
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredRoles.value.length / pageSize.value)))
const paginatedRoles = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRoles.value.slice(start, start + pageSize.value)
})
const selectedRoles = computed(() => roles.value.filter(role => selectedRoleIds.value.includes(role.id)))

watch([roleStatusFilter, roleSearch, pageSize], () => {
  currentPage.value = 1
  selectedRoleIds.value = []
})
watch(currentPage, () => { selectedRoleIds.value = [] })
watch(roles, () => {
  const ids = new Set(roles.value.map(role => role.id))
  selectedRoleIds.value = selectedRoleIds.value.filter(id => ids.has(id))
})
watch(totalPages, total => {
  if (currentPage.value > total) currentPage.value = total
})

function startAddRole() { addingRole.value = true; newRoleName.value = ''; newRoleDesc.value = '' }
function cancelAddRole() { addingRole.value = false }
async function confirmAddRole() {
  if (!canAddRole.value) return
  roleSaving.value = true
  try {
    const r = await addRole(newRoleName.value, newRoleDesc.value)
    if (!r.ok) { error(r.error); return }
    success('Cargo adicionado.')
    addingRole.value = false
  } finally {
    roleSaving.value = false
  }
}

function startEditRole(r) {
  editingRoleId.value = r.id
  editRoleName.value = r.name
  editRoleDesc.value = r.description || ''
}
function cancelEditRole() { editingRoleId.value = null }
async function confirmEditRole() {
  if (!canEditRole.value) return
  roleSaving.value = true
  try {
    const r = await editRole(editingRoleId.value, { name: editRoleName.value, description: editRoleDesc.value })
    if (!r.ok) { error(r.error); return }
    await loadPeople()
    success('Cargo atualizado.')
    editingRoleId.value = null
  } finally {
    roleSaving.value = false
  }
}

async function onDeleteRole(r) {
  if (!confirm(`Excluir cargo "${r.name}"?`)) return
  try {
    const result = await deleteRole(r.id)
    if (result?.ok === false) { error(result.error); return }
    success('Cargo removido.')
  } catch (e) {
    error(e.message)
  }
}

async function deleteSelectedRoles() {
  const rows = selectedRoles.value
  if (!rows.length || bulkDeleting.value) return
  if (!confirm(`Excluir ${rows.length} cargo(s) selecionado(s)?`)) return
  bulkDeleting.value = true
  try {
    let removed = 0
    for (const role of rows) {
      try {
        await deleteRole(role.id)
        removed += 1
      } catch {}
    }
    selectedRoleIds.value = []
    if (removed) success(`${removed} cargo(s) removido(s).`)
    if (removed < rows.length) error(`${rows.length - removed} cargo(s) nao foram removido(s).`)
  } finally {
    bulkDeleting.value = false
  }
}

async function deleteAllRolesDev() {
  if (!isDev.value || bulkDeleting.value || !roles.value.length) return
  const total = roles.value.length
  if (!confirm(`DEV: remover TODOS os ${total} cargo(s)?`)) return
  bulkDeleting.value = true
  try {
    let removed = 0
    for (const role of [...roles.value]) {
      try {
        await deleteRole(role.id)
        removed += 1
      } catch {}
    }
    selectedRoleIds.value = []
    if (removed) success(`DEV: ${removed} cargo(s) removido(s).`)
    if (removed < total) error('Alguns cargos nao foram removidos.')
  } finally {
    bulkDeleting.value = false
  }
}

function toggleRoleSelection(roleId) {
  selectedRoleIds.value = selectedRoleIds.value.includes(roleId)
    ? selectedRoleIds.value.filter(id => id !== roleId)
    : [...selectedRoleIds.value, roleId]
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
</script>

<template>
  <div class="w-full">
    <div class="ds-toolbar mb-4 justify-between">
      <div class="flex flex-wrap gap-2">
        <slot name="toolbar-start"></slot>
      </div>
      <div class="flex flex-wrap gap-2">
        <slot name="toolbar-actions"></slot>
        <button
          v-if="!addingRole"
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700"
          @click="startAddRole"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Novo cargo
        </button>
        <button
          v-if="isDev"
          type="button"
          class="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
          :disabled="bulkDeleting || !roles.length"
          title="Disponivel apenas no ambiente de desenvolvimento"
          @click="deleteAllRolesDev"
        >
          {{ bulkDeleting ? 'Removendo...' : 'Remover tudo do DEV' }}
        </button>
      </div>
    </div>

    <div v-if="addingRole" class="mb-4 flex flex-col gap-3 rounded-xl border border-primary-300 bg-primary-50/40 p-4 dark:border-primary-700 dark:bg-primary-900/10">
      <p class="text-xs font-semibold text-primary-600 dark:text-primary-400">Novo cargo</p>
      <input
        v-model="newRoleName"
        placeholder="Nome do cargo (ex: Técnico, Supervisor, Almoxarife...)"
        class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:border-primary-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-600"
        autofocus
        @keydown.enter="confirmAddRole"
        @keydown.escape="cancelAddRole"
      />
      <input
        v-model="newRoleDesc"
        placeholder="Descrição (opcional)"
        class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:border-primary-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-600"
        @keydown.enter="confirmAddRole"
        @keydown.escape="cancelAddRole"
      />
      <p v-if="!newRoleName.trim()" class="text-xs text-amber-600 dark:text-amber-400">Informe o nome do cargo.</p>
      <div class="flex gap-2">
        <button
          class="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canAddRole"
          @click="confirmAddRole"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          {{ roleSaving ? 'Salvando...' : 'Salvar' }}
        </button>
        <button class="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600" :disabled="roleSaving" @click="cancelAddRole">Cancelar</button>
      </div>
    </div>

    <div class="ds-toolbar mb-3 flex-col !items-stretch">
      <div>
        <p class="text-xs font-semibold text-gray-700 dark:text-gray-200">Buscar e filtrar</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">{{ filteredRoles.length }} de {{ roles.length }} cargos</p>
      </div>
      <div class="grid gap-2 sm:grid-cols-[1fr_auto_6rem]">
        <input
          v-model="roleSearch"
          type="search"
          placeholder="Buscar por cargo ou descrição..."
          class="ds-input"
        />
        <div class="flex min-h-10 flex-wrap items-center gap-1 rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-700">
          <button
            v-for="option in roleStatusOptions"
            :key="option.id"
            type="button"
            class="rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
            :class="roleStatusFilter === option.id
              ? 'bg-primary-600 text-[var(--ds-primary-text)]'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100'"
            :aria-pressed="roleStatusFilter === option.id"
            @click="roleStatusFilter = option.id"
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

    <div class="ds-table-wrap overflow-hidden">
      <div v-if="selectedRoleIds.length" class="flex flex-col gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-xs dark:border-red-900/40 dark:bg-red-950/20 sm:flex-row sm:items-center sm:justify-between">
        <span class="font-semibold text-red-700 dark:text-red-300">{{ selectedRoleIds.length }} cargo(s) selecionado(s)</span>
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg bg-[var(--ds-danger-solid)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--ds-danger-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="bulkDeleting"
          @click="deleteSelectedRoles"
        >
          {{ bulkDeleting ? 'Removendo...' : 'Excluir selecionados' }}
        </button>
      </div>

      <table v-if="filteredRoles.length" class="ds-table">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
            <th class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Cargo</th>
            <th class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Descrição</th>
            <th class="w-24 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
            <th class="w-32 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in paginatedRoles"
            :key="r.id"
            class="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-700/30"
            :class="{
              'opacity-50': !r.active,
              'bg-primary-50/50 dark:bg-primary-900/10': selectedRoleIds.includes(r.id),
            }"
          >
            <template v-if="editingRoleId === r.id">
              <td class="px-4 py-2">
                <input v-model="editRoleName" class="w-full rounded border border-primary-400 bg-white px-2 py-1 text-sm text-gray-800 focus:outline-none dark:border-primary-500 dark:bg-gray-700 dark:text-gray-100" @keydown.enter="confirmEditRole" @keydown.escape="cancelEditRole" autofocus />
              </td>
              <td class="px-4 py-2">
                <input v-model="editRoleDesc" placeholder="Descrição..." class="w-full rounded border border-primary-400 bg-white px-2 py-1 text-sm text-gray-800 focus:outline-none dark:border-primary-500 dark:bg-gray-700 dark:text-gray-100" @keydown.enter="confirmEditRole" @keydown.escape="cancelEditRole" />
              </td>
              <td colspan="2" class="px-4 py-2">
                <div class="flex items-center gap-1">
                  <button class="p-1 text-green-500 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-40" title="Salvar" :disabled="!canEditRole" @click="confirmEditRole">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  </button>
                  <button class="p-1 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40" title="Cancelar" :disabled="roleSaving" @click="cancelEditRole">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </td>
            </template>
            <template v-else>
              <td class="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{{ r.name }}</td>
              <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{{ r.description || '—' }}</td>
              <td class="px-4 py-3 text-center">
                <button
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
                  :class="r.active
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'"
                  @click="toggleRoleActive(r.id)"
                >{{ r.active ? 'Ativo' : 'Inativo' }}</button>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-center gap-0.5">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 px-2 text-xs font-semibold transition-colors"
                    :class="selectedRoleIds.includes(r.id)
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-primary-700 dark:hover:bg-gray-700 dark:hover:text-primary-300'"
                    :aria-label="`${selectedRoleIds.includes(r.id) ? 'Remover' : 'Selecionar'} ${r.name}`"
                    :aria-pressed="selectedRoleIds.includes(r.id)"
                    :title="selectedRoleIds.includes(r.id) ? 'Remover da seleção' : 'Selecionar cargo'"
                    @click="toggleRoleSelection(r.id)"
                  >
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9" />
                      <path v-if="selectedRoleIds.includes(r.id)" stroke-linecap="round" stroke-linejoin="round" d="m8.5 12 2.25 2.25L15.5 9.5" />
                    </svg>
                  </button>
                  <button class="p-1 text-gray-400 transition-colors hover:text-amber-500 dark:hover:text-amber-400" title="Editar" @click="startEditRole(r)">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                  <button class="p-1 text-gray-400 transition-colors hover:text-red-500 dark:hover:text-red-400" title="Excluir" @click="onDeleteRole(r)">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                  </button>
                </div>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <div v-if="filteredRoles.length" class="flex flex-col gap-2 border-t border-gray-200 bg-gray-50/70 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
        <span>Página {{ currentPage }} de {{ totalPages }} · {{ filteredRoles.length }} registro(s)</span>
        <div class="flex items-center gap-1">
          <button type="button" class="rounded-lg px-2 py-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage <= 1" @click="currentPage--">Anterior</button>
          <button type="button" class="rounded-lg px-2 py-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700" :disabled="currentPage >= totalPages" @click="currentPage++">Próxima</button>
        </div>
      </div>

      <div v-else-if="roles.length" class="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
        <p class="text-sm">Nenhum cargo encontrado.</p>
        <p class="mt-1 text-xs">Troque a busca ou o filtro para ver outros cadastros.</p>
      </div>

      <div v-else class="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
        <svg class="mx-auto mb-2 h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
        <p class="text-sm">Nenhum cargo cadastrado.</p>
        <p class="mt-1 text-xs">Clique em <strong>Novo cargo</strong> para adicionar.</p>
      </div>
    </div>
  </div>
</template>
