<script setup>
import { computed, ref, watch } from 'vue'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import { stockConfirmation, finishStockConfirmation } from '../../composables/useStockConfirmation.js'

const counts = ref({})
watch(stockConfirmation, () => { counts.value = {} })
function number(key) {
  const raw = counts.value[key]
  if (raw === undefined || String(raw).trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const valid = computed(() => stockConfirmation.value?.every(row => number(row.key) !== null && number(row.key) >= row.minimum))
const fmt = value => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 6 })
function submit() {
  if (valid.value) finishStockConfirmation(Object.fromEntries(stockConfirmation.value.map(row => [row.key, number(row.key)])))
}
</script>

<template>
  <AppDialog v-if="stockConfirmation" visible aria-label="Conferir estoque antes da movimentação" @close="finishStockConfirmation()">
    <form class="ds-panel w-full max-w-lg rounded-xl p-5 text-gray-900 dark:text-gray-100" @submit.prevent="submit">
      <h2 class="text-lg font-semibold">Quanto há em estoque agora?</h2>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Conte antes de retirar ou acrescentar os materiais desta movimentação. Esta conferência será solicitada uma única vez por variação.</p>
      <div class="mt-5 max-h-[55dvh] space-y-5 overflow-y-auto pr-1">
        <section v-for="(row, index) in stockConfirmation" :key="row.key" class="space-y-2">
          <p class="text-sm font-semibold">{{ row.name }}</p>
          <p class="text-xs text-gray-600 dark:text-gray-400">{{ Object.entries(row.values).map(([key, value]) => `${key}: ${value}`).join(' · ') }}</p>
          <p class="text-xs text-gray-600 dark:text-gray-400">Saldo registrado: <span class="tabular-nums">{{ fmt(row.previousStock) }} {{ row.unit }}</span></p>
          <label :for="`stock-count-${index}`" class="block text-sm font-medium">Quantidade física antes da movimentação ({{ row.unit }})</label>
          <input :id="`stock-count-${index}`" v-model="counts[row.key]" type="number" inputmode="decimal" min="0" step="any" required class="ds-input w-full tabular-nums" placeholder="Informe a quantidade contada" :aria-describedby="`stock-count-preview-${index}`">
          <div :id="`stock-count-preview-${index}`" class="text-xs" aria-live="polite">
            <p v-if="number(row.key) !== null && number(row.key) < row.minimum" class="text-red-600 dark:text-red-400">A contagem não cobre a saída solicitada. São necessários {{ fmt(row.minimum) }} {{ row.unit }}. Cancele para revisar a movimentação.</p>
            <p v-else-if="number(row.key) !== null" class="text-gray-600 dark:text-gray-400">Ajuste: {{ number(row.key) - row.previousStock > 0 ? '+' : '' }}{{ fmt(number(row.key) - row.previousStock) }} {{ row.unit }} · Saldo após a movimentação: {{ fmt(number(row.key) + row.delta) }} {{ row.unit }}</p>
          </div>
        </section>
      </div>
      <p class="mt-5 text-xs text-gray-600 dark:text-gray-400">A diferença será registrada no histórico com seu nome. O ajuste e a movimentação serão salvos juntos.</p>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <AppButton type="button" variant="secondary" @click="finishStockConfirmation()">Cancelar</AppButton>
        <AppButton type="submit" variant="primary" :disabled="!valid">Conferir e movimentar</AppButton>
      </div>
    </form>
  </AppDialog>
</template>
