<script setup>
import { computed } from 'vue'
import AttributeBadges from '../ui/AttributeBadges.vue'
import { epiVariationCa } from '../../utils/epiSheet.js'

const props = defineProps({
  item: { type: Object, required: true },
  variations: { type: Array, required: true },
  allowedCas: { type: Array, default: () => [] },
  single: Boolean,
  selectedId: { type: String, default: '' },
  disabled: Boolean,
})
const emit = defineEmits(['toggle-ca', 'select'])
const rows = computed(() => props.variations.map(variation => ({
  variation,
  ca: epiVariationCa(variation.values, variation.extras),
})))
</script>

<template>
  <p v-if="!variations.length" class="rounded-lg border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
    Nenhuma variação encontrada.
  </p>
  <div v-else class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
    <table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
      <thead class="bg-gray-50 text-left text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <tr>
          <th scope="col" class="px-4 py-2.5">Variação</th>
          <th scope="col" class="px-4 py-2.5 text-right">Estoque</th>
          <th scope="col" class="px-4 py-2.5 text-right">{{ single ? 'Ação' : 'Aceitar CA' }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
        <tr v-for="{ variation, ca } in rows" :key="variation.id"
          :class="{ 'bg-primary-50 dark:bg-primary-900/20': single ? selectedId === variation.id : allowedCas.includes(ca) }">
          <td class="px-4 py-3">
            <AttributeBadges :item="item" :variation="variation" compact />
            <span v-if="!ca" class="text-xs text-gray-500 dark:text-gray-400">Sem CA</span>
          </td>
          <td class="whitespace-nowrap px-4 py-3 text-right font-semibold" :class="variation.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'">
            {{ variation.stock }} {{ item.unit }}
          </td>
          <td class="px-4 py-3 text-right">
            <button v-if="single" type="button" class="whitespace-nowrap rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
              :aria-pressed="selectedId === variation.id" :disabled="disabled" @click="emit('select', variation)">
              {{ selectedId === variation.id ? 'Selecionada' : 'Selecionar' }}
            </button>
            <input v-else type="checkbox" class="h-4 w-4 accent-primary-600"
              :aria-label="`Aceitar CA ${ca || 'não cadastrado'}`"
              :checked="allowedCas.includes(ca)"
              :disabled="disabled || variation.active === false || !/^\d{1,12}$/.test(ca)"
              @change="emit('toggle-ca', ca)" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
