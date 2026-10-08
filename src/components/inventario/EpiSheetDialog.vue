<script setup>
import { computed, nextTick, ref } from 'vue'
import { useDestinations } from '../../composables/useDestinations.js'
import { useEpis } from '../../composables/useEpis.js'
import { useItems } from '../../composables/useItems.js'
import { personStatusLabel, usePeople } from '../../composables/usePeople.js'
import { useMovements } from '../../composables/useMovements.js'
import { useToast } from '../../composables/useToast.js'
import { normalizeSearchText } from '../../utils/globalSearch.js'
import {
  buildCatalogEpiSheetRow,
  buildEpiKitRows,
  buildEpiSheetRows,
  catalogRowsForTarget,
} from '../../utils/epiSheet.js'
import AppDialog from '../ui/AppDialog.vue'
import AttributeBadges from '../ui/AttributeBadges.vue'

const props = defineProps({ canOperate: { type: Boolean, default: false } })
defineEmits(['close'])

const { people } = usePeople()
const { items, variations } = useItems()
const { activeRoleRules } = useEpis()
const { activeDestinations } = useDestinations()
const { movements, addMovementBatch } = useMovements()
const { success, error } = useToast()

const mode = ref(props.canOperate ? 'new' : 'history')
const search = ref('')
const selectedPersonId = ref('')
const registration = ref('')
const notes = ref('')
const deliveryDate = ref(todayInputValue())
const draftRows = ref([])
const submitting = ref(false)
const registrationRequestId = ref('')
const pickerOpen = ref(false)
const pickerRowId = ref('')
const pickerSearch = ref('')
const sheetEl = ref(null)
const blankDate = '        /         /'
const localBrandLogo = '/local-brand/logo.jpg'

const itemById = computed(() => new Map(items.value.map(item => [item.id, item])))
const variationById = computed(() => new Map(variations.value.map(variation => [variation.id, variation])))

const filteredPeople = computed(() => {
  const query = normalizeSearchText(search.value)
  if (!query) return people.value
  return people.value.filter(person =>
    normalizeSearchText(`${person.name} ${person.registration} ${person.role}`).includes(query)
  )
})

const selectedPerson = computed(() =>
  people.value.find(person => person.id === selectedPersonId.value) || null
)

const selectedPersonRules = computed(() => {
  const role = normalizeSearchText(selectedPerson.value?.role)
  if (!role) return []
  return activeRoleRules.value.filter(rule => normalizeSearchText(rule.roleName) === role)
})

const historyRows = computed(() => buildEpiSheetRows(movements.value, selectedPerson.value))

const draftSheetRows = computed(() => draftRows.value.map(row => {
  const selection = draftSelection(row)
  const date = deliveryDate.value ? `${deliveryDate.value}T12:00:00` : ''
  if (!selection) {
    return {
      id: `draft:${row.id}`,
      quantity: Number(row.quantity || 1),
      description: readableTargetLabel(row) || 'Selecione o EPI',
      size: '',
      ca: '',
      date,
      observation: '',
    }
  }
  return buildCatalogEpiSheetRow(selection.item, selection.variation, {
    id: `draft:${row.id}`,
    quantity: row.quantity,
    date,
  })
}))

const printableRows = computed(() =>
  mode.value === 'history' ? historyRows.value : draftSheetRows.value
)

const blankRows = computed(() => Array.from({ length: Math.max(24 - printableRows.value.length, 0) }))

const epiDestination = computed(() =>
  activeDestinations.value.find(destination => normalizeSearchText(destination.name) === 'epi') || null
)

const allEpiCatalogRows = computed(() => {
  const epiItems = new Set(items.value
    .filter(item => ['epi', 'epis'].includes(normalizeSearchText(item.group)))
    .map(item => item.id))
  return variations.value
    .filter(variation => epiItems.has(variation.itemId))
    .map(variation => ({ variation, item: itemById.value.get(variation.itemId) }))
    .filter(row => row.item)
})

const pickerDraftRow = computed(() => draftRows.value.find(row => row.id === pickerRowId.value) || null)

const pickerCandidates = computed(() => {
  const row = pickerDraftRow.value
  if (!row) return []
  const candidates = row.ruleId
    ? catalogRowsForTarget(items.value, variations.value, row)
    : allEpiCatalogRows.value
  const query = normalizeSearchText(pickerSearch.value)
  if (!query) return candidates
  return candidates.filter(candidate => normalizeSearchText([
    candidate.item.name,
    candidate.item.group,
    candidate.item.category,
    candidate.item.subcategory,
    ...Object.entries(candidate.variation.values || {}).flat(),
    ...Object.entries(candidate.variation.extras || {}).flat(),
  ].join(' ')).includes(query))
})

const kitValidationError = computed(() => {
  if (!props.canOperate) return 'Seu acesso permite apenas reimprimir fichas.'
  if (!selectedPerson.value) return 'Selecione um funcionário.'
  if (!isActivePerson(selectedPerson.value)) return 'A nova entrega exige um funcionário ativo.'
  if (!draftRows.value.length) return 'Adicione ao menos um EPI ao kit.'
  if (!deliveryDate.value) return 'Informe a data de entrega.'
  if (!epiDestination.value) return 'Cadastre ou ative o destino EPI antes de registrar a entrega.'

  const totals = new Map()
  for (const row of draftRows.value) {
    const quantity = Number(row.quantity)
    if (!Number.isInteger(quantity) || quantity <= 0) return 'Todas as quantidades devem ser números inteiros maiores que zero.'
    const selection = draftSelection(row)
    if (!selection) return `Escolha o item e a variação de ${readableTargetLabel(row) || 'todas as linhas'}.`
    totals.set(row.variationId, (totals.get(row.variationId) || 0) + quantity)
  }

  for (const [variationId, quantity] of totals) {
    const variation = variationById.value.get(variationId)
    if (!variation || quantity > Number(variation.stock || 0)) {
      const item = variation ? itemById.value.get(variation.itemId) : null
      return `Estoque insuficiente para ${item?.name || 'uma das variações selecionadas'}.`
    }
  }
  return ''
})

const canRegister = computed(() => !submitting.value && !kitValidationError.value)

function todayInputValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function isActivePerson(person) {
  return person?.active !== false && (person?.status || 'ativo') === 'ativo'
}

function readableTargetLabel(target) {
  const label = String(target?.targetLabel || target?.targetKey || '').trim()
  if (!label) return ''
  const parts = label.split('>').map(part => part.trim()).filter(Boolean)
  return parts[parts.length - 1] || label
}

function draftSelection(row) {
  const variation = variationById.value.get(row.variationId)
  const item = variation ? itemById.value.get(variation.itemId) : null
  if (!variation || !item || item.id !== row.itemId) return null
  return { item, variation }
}

function resetDraftRows() {
  draftRows.value = buildEpiKitRows(selectedPersonRules.value, items.value, variations.value)
  deliveryDate.value = todayInputValue()
  registrationRequestId.value = ''
}

function selectPerson(person) {
  selectedPersonId.value = person.id
  registration.value = person.registration || ''
  notes.value = ''
  resetDraftRows()
}

function setMode(nextMode) {
  if (nextMode === 'new' && !props.canOperate) return
  mode.value = nextMode
  if (nextMode === 'new' && selectedPerson.value && !draftRows.value.length) resetDraftRows()
}

function addDraftRow() {
  const row = {
    id: `custom:${crypto.randomUUID()}`,
    ruleId: '',
    targetType: '',
    targetKey: '',
    targetLabel: 'EPI adicional',
    quantity: 1,
    itemId: '',
    variationId: '',
  }
  draftRows.value.push(row)
  registrationRequestId.value = ''
  openPicker(row)
}

function removeDraftRow(row) {
  draftRows.value = draftRows.value.filter(current => current.id !== row.id)
  registrationRequestId.value = ''
}

function openPicker(row) {
  pickerRowId.value = row.id
  pickerSearch.value = ''
  pickerOpen.value = true
}

function selectVariation(candidate) {
  const row = pickerDraftRow.value
  if (!row || Number(candidate.variation.stock || 0) <= 0) return
  row.itemId = candidate.item.id
  row.variationId = candidate.variation.id
  registrationRequestId.value = ''
  pickerOpen.value = false
}

function movementLine(row) {
  const { item, variation } = draftSelection(row)
  return {
    variationId: variation.id,
    itemId: item.id,
    itemName: item.name,
    itemGroup: item.group,
    itemCategory: item.category || '',
    itemSubcategory: item.subcategory || '',
    itemUnit: item.unit,
    variationValues: { ...(variation.values || {}) },
    variationExtras: { ...(variation.extras || {}) },
    qty: Number(row.quantity),
  }
}

async function registerAndPrint() {
  if (!canRegister.value) {
    if (kitValidationError.value) error(kitValidationError.value)
    return
  }
  const total = draftRows.value.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  if (!confirm(`Registrar a entrega de ${total} unidade(s) de EPI para ${selectedPerson.value.name} e imprimir a ficha?`)) return

  submitting.value = true
  try {
    if (!registrationRequestId.value) {
      registrationRequestId.value = `epi_${crypto.randomUUID().replaceAll('-', '')}`
    }
    const created = await addMovementBatch('saida', draftRows.value.map(movementLine), {
      date: `${deliveryDate.value}T12:00:00`,
      requestedBy: selectedPerson.value.name,
      requestedByPersonId: selectedPerson.value.id,
      destination: 'EPI',
      destinationId: epiDestination.value.id,
      destinationOther: false,
    }, registrationRequestId.value)

    for (const movement of created) {
      const variation = variationById.value.get(movement.variationId)
      if (variation) { variation.stock = movement.stockAfter; variation.stockConfirmed = movement.stockConfirmed !== false }
    }
    success(`${created.length} saída(s) de EPI registrada(s).`)
    await nextTick()
    printSheet()
    mode.value = 'history'
    draftRows.value = []
    registrationRequestId.value = ''
  } catch (cause) {
    error(cause.message || 'Não foi possível registrar a entrega de EPI.')
  } finally {
    submitting.value = false
  }
}

function formatDate(value) {
  if (!value) return blankDate
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? blankDate : date.toLocaleDateString('pt-BR')
}

function printSheet() {
  if (!sheetEl.value) return
  const frame = document.createElement('iframe')
  frame.title = 'Impressão da ficha de EPI'
  frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0'
  document.body.appendChild(frame)

  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map(element => element.outerHTML)
    .join('')
  const printDocument = frame.contentDocument
  printDocument.open()
  printDocument.write(`<!doctype html><html><head><base href="${document.baseURI}">${styles}<style>@page{size:A4 landscape;margin:0}html,body{margin:0!important;background:#fff!important}body{box-sizing:border-box!important;padding:7mm!important}.epi-sheet-document{width:100%!important;min-width:0!important;box-shadow:none!important}</style></head><body>${sheetEl.value.outerHTML}</body></html>`)
  printDocument.close()

  let printed = false
  const print = () => {
    if (printed) return
    printed = true
    frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
    frame.contentWindow.focus()
    frame.contentWindow.print()
    window.setTimeout(() => frame.remove(), 60000)
  }
  frame.onload = print
  window.setTimeout(print, 250)
}
</script>

<template>
  <AppDialog visible aria-label="Gerar ficha individual de EPI" @close="$emit('close')">
    <section class="flex h-[92vh] w-[min(98vw,1600px)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">Controle de EPIs</p>
          <h2 class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Ficha individual de EPI</h2>
        </div>
        <div class="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          <button type="button" class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40" :class="mode === 'new' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'" :disabled="!props.canOperate" @click="setMode('new')">Nova entrega</button>
          <button type="button" class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors" :class="mode === 'history' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'" @click="setMode('history')">Reimprimir histórico</button>
        </div>
        <div class="flex items-center gap-2">
          <button v-if="mode === 'new'" type="button" class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!canRegister" @click="registerAndPrint">
            {{ submitting ? 'Registrando...' : 'Registrar entrega e imprimir' }}
          </button>
          <button v-else type="button" class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-[var(--ds-primary-text)] transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!selectedPerson" @click="printSheet">Imprimir ficha</button>
          <button type="button" class="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" @click="$emit('close')">Fechar</button>
        </div>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-[28rem_1fr]">
        <aside class="min-h-0 overflow-y-auto border-r border-gray-200 dark:border-gray-700">
          <div class="border-b border-gray-200 p-4 dark:border-gray-700">
            <label class="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Funcionário</label>
            <input v-model="search" type="search" placeholder="Buscar funcionário..." class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
            <div class="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <button v-for="person in filteredPeople" :key="person.id" type="button" class="flex w-full items-start justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800" :class="selectedPersonId === person.id ? 'bg-primary-50 text-primary-800 dark:bg-primary-950/50 dark:text-primary-200' : 'text-gray-800 dark:text-gray-200'" @click="selectPerson(person)">
                <span class="min-w-0"><span class="block truncate text-sm font-semibold">{{ person.name }}</span><span class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ person.role || 'Sem cargo' }}</span></span>
                <span v-if="person.status !== 'ativo'" class="shrink-0 text-[10px] font-semibold uppercase text-gray-400">{{ personStatusLabel(person.status) }}</span>
              </button>
              <p v-if="!filteredPeople.length" class="p-4 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum funcionário encontrado.</p>
            </div>
          </div>

          <div v-if="selectedPerson" class="space-y-4 p-4">
            <div class="grid grid-cols-2 gap-3">
              <label class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Matrícula nesta ficha
                <input v-model="registration" type="text" class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
              </label>
              <label v-if="mode === 'new'" class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Data da entrega
                <input v-model="deliveryDate" type="date" class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" @change="registrationRequestId = ''" />
              </label>
            </div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Observação da ficha
              <input v-model="notes" type="text" class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
            </label>

            <template v-if="mode === 'new'">
              <div class="flex items-center justify-between">
                <div><h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Kit da nova entrega</h3><p class="text-xs text-gray-500 dark:text-gray-400">Destino: EPI</p></div>
                <button type="button" class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" @click="addDraftRow">Adicionar EPI</button>
              </div>

              <div v-if="draftRows.length" class="space-y-2">
                <article v-for="row in draftRows" :key="row.id" class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div class="flex items-start gap-2">
                    <button type="button" class="min-w-0 flex-1 rounded-lg bg-gray-50 p-2 text-left hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700" @click="openPicker(row)">
                      <template v-if="draftSelection(row)">
                        <span class="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ draftSelection(row).item.name }}</span>
                        <AttributeBadges class="mt-1" :item="draftSelection(row).item" :variation="draftSelection(row).variation" compact />
                        <span class="mt-1 block text-xs text-gray-500 dark:text-gray-400">Estoque: {{ draftSelection(row).variation.stock }} {{ draftSelection(row).item.unit }}</span>
                      </template>
                      <template v-else><span class="block text-sm font-semibold text-primary-600 dark:text-primary-400">Escolher item e variação</span><span class="mt-1 block truncate text-xs text-gray-500 dark:text-gray-400">{{ readableTargetLabel(row) }}</span></template>
                    </button>
                    <button type="button" class="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30" title="Remover EPI" @click="removeDraftRow(row)">×</button>
                  </div>
                  <label class="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Quantidade
                    <input v-model.number="row.quantity" type="number" min="1" step="1" class="w-24 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" @input="registrationRequestId = ''" />
                  </label>
                </article>
              </div>
              <p v-else class="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">O cargo não possui EPIs configurados. Adicione as linhas manualmente.</p>
              <p v-if="kitValidationError" class="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{{ kitValidationError }}</p>
            </template>

            <div v-else class="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              A reimpressão reúne todas as retiradas de EPI registradas e não altera o estoque.
            </div>
          </div>
        </aside>

        <main class="min-w-0 overflow-auto bg-gray-100 p-5 dark:bg-gray-950">
          <div v-if="!selectedPerson" class="grid h-full place-items-center text-center text-sm text-gray-500 dark:text-gray-400"><div><p class="font-semibold text-gray-700 dark:text-gray-200">Selecione um funcionário</p><p class="mt-1">O cargo preencherá automaticamente o kit da nova entrega.</p></div></div>

          <section v-else ref="sheetEl" class="epi-sheet-document mx-auto min-w-[1050px] bg-white text-black shadow-xl">
            <div class="epi-sheet-top">
              <div class="epi-sheet-identification">
                <div class="epi-sheet-heading"><img :src="localBrandLogo" alt="Colorindo" /><h1>FICHA INDIVIDUAL DE EPI</h1></div>
                <h2>{{ selectedPerson.name }}</h2>
                <div class="epi-sheet-person-meta"><p class="epi-sheet-role"><strong>CARGO:</strong> {{ selectedPerson.role || '' }}</p><p><strong>MATRÍCULA:</strong> {{ registration }}</p></div>
                <p class="epi-sheet-note"><strong>OBS:</strong> {{ notes }}</p>
              </div>

              <div class="epi-sheet-term">
                <h3>TERMO DE COMPROMISSO</h3>
                <p>Declaro que recebi orientação sobre o uso correto do EPI fornecido pela empresa e que estou ciente da legislação abaixo discriminada, comprometendo-me a cumpri-la.</p>
                <p><strong>Port. nº 3.214, de 08/06/78, do MTb, NR-1, item 1.8 — CABE AO EMPREGADO:</strong></p>
                <p>A) Cumprir as disposições legais e regulamentares sobre Segurança e Medicina do Trabalho, inclusive as ordens de serviço expedidas pelo empregador;</p>
                <p>B) Usar o EPI fornecido pelo empregador;</p>
                <p>C) Usá-lo para a finalidade a que se destina;</p>
                <p>D) Responsabilizar-se por sua guarda e conservação;</p>
                <p>E) Comunicar ao empregador qualquer alteração que o torne impróprio para uso.</p>
                <p><strong>NR-1, subitem 1.8.1:</strong> Constitui ato faltoso a recusa injustificada do empregado ao cumprimento do disposto no item anterior. <strong>CLT — Art. 462, § 1º:</strong> em caso de dano causado pelo empregado, o desconto será lícito desde que esta possibilidade tenha sido acordada, ou na ocorrência de dolo do empregado.</p>
                <div class="epi-sheet-term-signature"><span>Assinatura do empregado</span></div>
              </div>
            </div>

            <table>
              <thead><tr><th>Quant.</th><th>EPI (Descrição / Fabricante / Modelo)</th><th>Tamanho</th><th>Número do CA</th><th>Data entrega</th><th>Ass. empregado</th><th>Observações</th></tr></thead>
              <tbody>
                <tr v-for="row in printableRows" :key="row.id"><td>{{ row.quantity }}</td><td>{{ row.description }}</td><td>{{ row.size }}</td><td>{{ row.ca }}</td><td class="epi-sheet-date">{{ formatDate(row.date) }}</td><td></td><td>{{ row.observation }}</td></tr>
                <tr v-for="(_, index) in blankRows" :key="`blank:${index}`"><td></td><td></td><td></td><td></td><td class="epi-sheet-date">{{ blankDate }}</td><td></td><td></td></tr>
              </tbody>
            </table>
            <footer class="epi-sheet-approvals"><div><span></span><p>Visto da Supervisão</p></div><div><span></span><p>Visto COMSEG / CIPA</p></div><div><span></span><p>Visto SESMT</p></div></footer>
          </section>
        </main>
      </div>
    </section>

    <AppDialog v-if="pickerOpen" visible aria-label="Selecionar item e variação de EPI" @close="pickerOpen = false">
      <section class="flex max-h-[80vh] w-[min(92vw,760px)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <header class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700"><div><h3 class="font-semibold text-gray-900 dark:text-gray-100">Escolher item e variação</h3><p class="text-xs text-gray-500 dark:text-gray-400">{{ readableTargetLabel(pickerDraftRow) || 'Todos os EPIs do catálogo' }}</p></div><button type="button" class="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" @click="pickerOpen = false">Fechar</button></header>
        <div class="border-b border-gray-200 p-4 dark:border-gray-700"><input v-model="pickerSearch" type="search" placeholder="Buscar item, tamanho, modelo ou CA..." class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" /></div>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <button v-for="candidate in pickerCandidates" :key="candidate.variation.id" type="button" class="mb-2 flex w-full items-start justify-between gap-4 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-400 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-700 dark:hover:bg-primary-950/30" :disabled="Number(candidate.variation.stock || 0) <= 0" @click="selectVariation(candidate)">
            <span class="min-w-0"><span class="block font-semibold text-gray-900 dark:text-gray-100">{{ candidate.item.name }}</span><AttributeBadges class="mt-1" :item="candidate.item" :variation="candidate.variation" compact /></span>
            <span class="shrink-0 text-xs font-semibold" :class="Number(candidate.variation.stock || 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'">Estoque: {{ candidate.variation.stock }} {{ candidate.item.unit }}</span>
          </button>
          <p v-if="!pickerCandidates.length" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma variação encontrada para esta regra.</p>
        </div>
      </section>
    </AppDialog>
  </AppDialog>
</template>

<style scoped>
.epi-sheet-document { font-family: Arial, sans-serif; font-size: 9px; }
.epi-sheet-top { display: grid; grid-template-columns: 43% 57%; border: 1.5px solid #000; border-bottom: 0; }
.epi-sheet-identification, .epi-sheet-term { min-width: 0; }
.epi-sheet-identification { border-right: 1.5px solid #000; }
.epi-sheet-heading { display: grid; grid-template-columns: 105px 1fr; min-height: 70px; align-items: center; border-bottom: 1px solid #000; }
.epi-sheet-heading img { width: 86px; max-height: 62px; margin: auto; object-fit: contain; }
.epi-sheet-heading h1 { font-size: 19px; font-weight: 700; text-align: center; }
.epi-sheet-identification h2 { margin: 0; padding: 5px; border-bottom: 1px solid #000; font-size: 15px; font-weight: 700; text-align: center; text-decoration: underline; text-transform: uppercase; }
.epi-sheet-person-meta { display: grid; grid-template-columns: 72% 28%; border-bottom: 1px solid #000; }
.epi-sheet-person-meta p, .epi-sheet-note { min-height: 27px; margin: 0; padding: 7px; }
.epi-sheet-person-meta p:first-child { border-right: 1px solid #000; }
.epi-sheet-role { font-size: 11px; }
.epi-sheet-term { padding: 5px 8px; font-size: 7px; line-height: 1.22; }
.epi-sheet-term h3 { margin: 0 0 3px; text-align: center; font-size: 10px; font-weight: 700; }
.epi-sheet-term p { margin: 1px 0; }
.epi-sheet-term-signature { display: flex; min-height: 32px; align-items: end; justify-content: center; margin-top: 10px; text-align: center; }
.epi-sheet-term-signature span { width: 70%; padding-top: 5px; border-top: 1px solid #000; }
.epi-sheet-document table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.epi-sheet-document th, .epi-sheet-document td { height: 18px; border: 1px solid #000; padding: 2px 4px; }
.epi-sheet-document th { text-align: center; text-transform: uppercase; }
.epi-sheet-document th:nth-child(1) { width: 6%; }
.epi-sheet-document th:nth-child(2) { width: 38%; }
.epi-sheet-document th:nth-child(3) { width: 7%; }
.epi-sheet-document th:nth-child(4) { width: 9%; }
.epi-sheet-document th:nth-child(5) { width: 9%; }
.epi-sheet-document th:nth-child(6) { width: 17%; }
.epi-sheet-document th:nth-child(7) { width: 14%; }
.epi-sheet-document td:not(:nth-child(2)):not(:nth-child(7)) { text-align: center; }
.epi-sheet-date { white-space: pre; }
.epi-sheet-approvals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 50px; padding: 34px 45px 8px; text-align: center; }
.epi-sheet-approvals span { display: block; border-top: 1px solid #000; }
.epi-sheet-approvals p { margin: 4px 0 0; }
</style>
