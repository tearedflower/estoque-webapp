<script setup>
import { computed, ref } from 'vue'
import { useSuppliers } from '../../composables/useSuppliers.js'
import { useToast } from '../../composables/useToast.js'

const { suppliers, addSupplier, editSupplier, toggleSupplierActive, deleteSupplier } = useSuppliers()
const { success, error } = useToast()

const search = ref('')
const statusFilter = ref('')
const adding = ref(false)
const newName = ref('')
const newDescription = ref('')
const editingId = ref(null)
const editName = ref('')
const editDescription = ref('')
const supplierSaving = ref(false)

const filteredSuppliers = computed(() => {
  const q = search.value.trim().toLowerCase()
  return suppliers.value.filter(s => (!statusFilter.value || (statusFilter.value === 'active') === Boolean(s.active)) &&
    (!q || s.name.toLowerCase().includes(q) || String(s.description || '').toLowerCase().includes(q)))
})

const canAddSupplier = computed(() => newName.value.trim().length > 0 && !supplierSaving.value)
const canEditSupplier = computed(() => editName.value.trim().length > 0 && !supplierSaving.value)

function startAdd() {
  adding.value = true
  newName.value = ''
  newDescription.value = ''
}

function cancelAdd() {
  adding.value = false
}

async function confirmAdd() {
  if (!canAddSupplier.value) return
  supplierSaving.value = true
  try {
    const result = await addSupplier(newName.value, newDescription.value)
    if (!result.ok) {
      error(result.error)
      return
    }
    success(result.existed ? 'Fornecedor ja estava cadastrado.' : 'Fornecedor adicionado.')
    adding.value = false
  } catch (e) {
    error(e.message)
  } finally {
    supplierSaving.value = false
  }
}

function startEdit(supplier) {
  editingId.value = supplier.id
  editName.value = supplier.name
  editDescription.value = supplier.description || ''
}

function cancelEdit() {
  editingId.value = null
}

async function confirmEdit() {
  if (!canEditSupplier.value) return
  supplierSaving.value = true
  try {
    const result = await editSupplier(editingId.value, {
      name: editName.value,
      description: editDescription.value,
    })
    if (!result.ok) {
      error(result.error)
      return
    }
    success('Fornecedor atualizado.')
    editingId.value = null
  } catch (e) {
    error(e.message)
  } finally {
    supplierSaving.value = false
  }
}

async function onToggle(supplier) {
  try {
    await toggleSupplierActive(supplier.id)
  } catch (e) {
    error(e.message)
  }
}

async function onDelete(supplier) {
  if (!confirm(`Excluir "${supplier.name}"?`)) return
  try {
    await deleteSupplier(supplier.id)
    success('Fornecedor removido.')
  } catch (e) {
    error(e.message)
  }
}
</script>

<template>
  <div class="registry-page w-full">
    <header class="registry-heading"><div><h2 class="text-lg font-semibold">Fornecedores</h2><p class="ds-muted text-sm mt-1">Gerencie os fornecedores e as observações usadas nas entradas de materiais.</p></div></header>
    <div class="ds-toolbar mb-4 justify-between">
      <input
        v-model="search"
        type="search"
        placeholder="Buscar fornecedor..."
        aria-label="Buscar fornecedores"
        class="ds-input sm:max-w-sm"
      />
      <select v-model="statusFilter" class="ds-input registry-status-filter" aria-label="Filtrar fornecedores por status"><option value="">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
      <span class="registry-count ds-muted">{{ filteredSuppliers.length }} {{ filteredSuppliers.length === 1 ? 'fornecedor' : 'fornecedores' }}</span>
      <button
        v-if="!adding"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700"
        @click="startAdd"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Novo fornecedor
      </button>
    </div>

    <div v-if="adding" class="mb-4 rounded-xl border border-primary-200 bg-primary-50/40 p-4 dark:border-primary-800 dark:bg-primary-900/10">
      <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Novo fornecedor</p>
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <input
          v-model="newName"
          type="text"
          placeholder="Nome do fornecedor"
          class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          autofocus
          @keydown.enter="confirmAdd"
          @keydown.escape="cancelAdd"
        />
        <input
          v-model="newDescription"
          type="text"
          placeholder="Observação opcional"
          class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          @keydown.enter="confirmAdd"
          @keydown.escape="cancelAdd"
        />
      </div>
      <p v-if="!newName.trim()" class="mt-2 text-xs text-amber-600 dark:text-amber-400">Informe o nome do fornecedor.</p>
      <div class="mt-3 flex gap-2">
        <button type="button" class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-[var(--ds-primary-text)] hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed" :disabled="!canAddSupplier" @click="confirmAdd">{{ supplierSaving ? 'Salvando...' : 'Salvar' }}</button>
        <button type="button" class="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed" :disabled="supplierSaving" @click="cancelAdd">Cancelar</button>
      </div>
    </div>

    <div class="ds-table-wrap overflow-x-auto">
      <table v-if="filteredSuppliers.length" class="ds-table registry-table">
        <thead><tr><th scope="col">Fornecedor</th><th scope="col">Observação</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead>
        <tbody>
          <tr
            v-for="supplier in filteredSuppliers"
            :key="supplier.id"
            class="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-700/30"
          >
            <template v-if="editingId === supplier.id">
              <td class="px-4 py-2">
                <input v-model="editName" class="w-full rounded border border-primary-400 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none dark:border-primary-500 dark:bg-gray-700 dark:text-gray-100" @keydown.enter="confirmEdit" @keydown.escape="cancelEdit" autofocus />
              </td>
              <td class="px-4 py-2">
                <input v-model="editDescription" class="w-full rounded border border-primary-400 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none dark:border-primary-500 dark:bg-gray-700 dark:text-gray-100" @keydown.enter="confirmEdit" @keydown.escape="cancelEdit" />
              </td>
              <td colspan="2" class="px-4 py-2">
                <div class="flex items-center gap-1">
                  <button class="p-1 text-green-600 hover:text-green-700 disabled:opacity-40 disabled:cursor-not-allowed" title="Salvar" :disabled="!canEditSupplier" @click="confirmEdit">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  </button>
                  <button class="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Cancelar" :disabled="supplierSaving" @click="cancelEdit">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </td>
            </template>
            <template v-else>
              <td data-label="Fornecedor" class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{{ supplier.name }}</td>
              <td data-label="Observação" class="px-4 py-3 text-gray-500 dark:text-gray-400">{{ supplier.description || '-' }}</td>
              <td data-label="Status" class="px-4 py-3 text-center">
                <button
                  type="button"
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
                  :class="supplier.active
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'"
                  :aria-label="`${supplier.active ? 'Desativar' : 'Ativar'} fornecedor ${supplier.name}`"
                  @click="onToggle(supplier)"
                >{{ supplier.active ? 'Ativo' : 'Inativo' }}</button>
              </td>
              <td data-label="Ações" class="px-4 py-3">
                <div class="flex items-center justify-center gap-1">
                  <button type="button" class="p-1 text-gray-400 transition-colors hover:text-amber-500" title="Editar" @click="startEdit(supplier)">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                  <button type="button" class="p-1 text-gray-400 transition-colors hover:text-red-500" title="Excluir" @click="onDelete(supplier)">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79" /></svg>
                  </button>
                </div>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
      <div v-else class="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        {{ search || statusFilter ? 'Nenhum fornecedor encontrado com esses filtros.' : 'Nenhum fornecedor cadastrado.' }}
      </div>
    </div>
  </div>
</template>
