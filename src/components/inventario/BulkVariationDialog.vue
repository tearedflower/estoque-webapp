<script setup>
import { computed, ref, watch } from 'vue'
import { useItems } from '../../composables/useItems.js'
import { useToast } from '../../composables/useToast.js'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import DestinationTreePicker from '../ui/DestinationTreePicker.vue'

const props = defineProps({ rows: { type: Array, required: true }, initialField: { type: String, default: 'attribute' }, initialAttribute: { type: String, default: '' } })
const emit = defineEmits(['close', 'saved'])
const { editVariationsBulk } = useItems()
const { error, success } = useToast()
const field = ref(props.initialField)
const attribute = ref(props.initialAttribute)
const value = ref('')
const linked = ref([])
const locationText = ref('')
const onlyEmpty = ref(true)
const mode = ref('add')
const saving = ref(false)
const attributes = computed(() => [...new Set(props.rows.flatMap(row => row.item.attributes || []))].sort())
const suggestions = computed(() => [...new Set(props.rows.map(row => row.variation.values?.[attribute.value]).filter(Boolean))])
const models = computed(() => new Set(props.rows.map(row => row.item.id)).size)
const affected = computed(() => props.rows.filter(row => {
  if (!onlyEmpty.value) return true
  if (field.value === 'attribute') return !String(row.variation.values?.[attribute.value] ?? '').trim()
  if (field.value === 'minStock') return row.variation.minStock == null
  if (field.value === 'locations') return !(row.variation.locations?.length || row.variation.location)
  return !row.variation.destinations?.length
}).length)
watch(field, () => { value.value = ''; linked.value = []; locationText.value = ''; onlyEmpty.value = field.value === 'attribute' || field.value === 'minStock' })

function addLocation() {
  const text = locationText.value.trim()
  if (text && !linked.value.includes(text)) linked.value.push(text)
  locationText.value = ''
}
async function save() {
  if (saving.value) return
  if (field.value === 'locations') addLocation()
  if (field.value === 'attribute' && (!attribute.value.trim() || !value.value.trim())) { error('Informe o atributo e o valor.'); return }
  if (field.value === 'minStock' && (String(value.value).trim() === '' || !Number.isFinite(Number(value.value)) || Number(value.value) < 0)) { error('Informe um mínimo igual ou maior que zero.'); return }
  if (['locations', 'destinations'].includes(field.value) && !linked.value.length && mode.value !== 'replace') { error('Selecione pelo menos um local ou destino.'); return }
  saving.value = true
  try {
    const result = await editVariationsBulk(props.rows.map(row => row.variation.id), {
      field: field.value, name: attribute.value, value: field.value === 'minStock' ? Number(value.value) : field.value === 'attribute' ? value.value : linked.value,
      onlyEmpty: onlyEmpty.value, mode: mode.value,
    })
    success(`${result.updated} de ${result.selected} variações atualizadas.`)
    emit('saved', result)
  } catch (cause) { error(cause.message) }
  finally { saving.value = false }
}
</script>

<template>
  <AppDialog visible aria-label="Editar variações selecionadas" :persistent="saving" @close="emit('close')">
    <form class="w-full max-w-xl rounded-2xl bg-white p-5 text-gray-800 shadow-xl dark:bg-gray-900 dark:text-gray-100 sm:p-6" @submit.prevent="save">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar {{ rows.length }} {{ rows.length === 1 ? 'variação' : 'variações' }}</h2>
      <p class="mt-1 text-sm text-gray-500">{{ models }} {{ models === 1 ? 'modelo selecionado' : 'modelos selecionados' }} · escreva uma vez e aplique à seleção.</p>
      <label class="mt-5 block text-sm font-medium">Campo a alterar
        <select v-model="field" class="ds-input mt-1 w-full" :disabled="saving">
          <option value="attribute">Atributo</option><option value="locations">Locais</option><option value="destinations">Destinos</option><option value="minStock">Estoque mínimo</option>
        </select>
      </label>
      <div v-if="field === 'attribute'" class="mt-4 grid gap-3 sm:grid-cols-2">
        <label class="text-sm font-medium">Atributo
          <input v-model="attribute" list="bulk-attribute-names" class="ds-input mt-1 w-full" placeholder="Ex.: Bico" maxlength="128" required :disabled="saving" />
          <datalist id="bulk-attribute-names"><option v-for="name in attributes" :key="name" :value="name" /></datalist>
        </label>
        <label class="text-sm font-medium">Valor
          <input v-model="value" list="bulk-attribute-values" class="ds-input mt-1 w-full" placeholder="Ex.: Composite" maxlength="500" required :disabled="saving" />
          <datalist id="bulk-attribute-values"><option v-for="suggestion in suggestions" :key="suggestion" :value="suggestion" /></datalist>
        </label>
        <p class="text-xs text-gray-500 sm:col-span-2">Um atributo novo será adicionado aos modelos selecionados.</p>
      </div>
      <label v-else-if="field === 'minStock'" class="mt-4 block text-sm font-medium">Estoque mínimo
        <input v-model="value" class="ds-input mt-1 w-full" type="number" min="0" step="1" required :disabled="saving" />
      </label>
      <div v-else class="mt-4 space-y-3">
        <label class="block text-sm font-medium">Como aplicar
          <select v-model="mode" class="ds-input mt-1 w-full" :disabled="saving"><option value="add">Adicionar aos existentes</option><option value="replace">Substituir a lista inteira</option><option value="remove">Remover da lista</option></select>
        </label>
        <label class="block text-sm font-medium">{{ field === 'locations' ? 'Locais' : 'Destinos' }}</label>
        <DestinationTreePicker :key="field" v-model="linked" multiple :source="field === 'locations' ? 'locations' : 'destinations'" :placeholder="field === 'locations' ? 'Buscar local...' : 'Buscar destino...'" />
        <div v-if="field === 'locations'" class="flex gap-2">
          <input v-model="locationText" aria-label="Digitar um local" class="ds-input min-w-0 flex-1" placeholder="Ou digite o local e adicione" :disabled="saving" @keydown.enter.prevent="addLocation" />
          <AppButton :disabled="saving || !locationText.trim()" @click="addLocation">Adicionar</AppButton>
        </div>
        <p v-if="mode === 'replace'" class="text-xs text-gray-500">A lista vazia remove todos os vínculos desse campo nas variações selecionadas.</p>
      </div>
      <label class="mt-4 flex items-center gap-2 text-sm"><input v-model="onlyEmpty" type="checkbox" :disabled="saving" /> Preencher somente campos vazios</label>
      <div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
        <p class="font-medium">{{ affected }} {{ affected === 1 ? 'variação será considerada' : 'variações serão consideradas' }}</p>
        <p class="mt-1 text-xs text-gray-500">{{ rows.slice(0, 4).map(row => [row.item.name, ...Object.values(row.variation.values || {}).filter(Boolean)].join(' · ')).join('; ') }}{{ rows.length > 4 ? '; …' : '' }}</p>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <AppButton :disabled="saving" @click="emit('close')">Cancelar</AppButton>
        <AppButton type="submit" variant="primary" :disabled="saving || !affected">{{ saving ? 'Salvando…' : 'Aplicar à seleção' }}</AppButton>
      </div>
    </form>
  </AppDialog>
</template>
