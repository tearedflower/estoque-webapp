<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, required: true },
  label: { type: String, default: '' },
  domain: { type: String, default: 'default' },
  size: { type: String, default: 'sm' },
})

const resolvedLabel = computed(() => props.label || props.status)

const tone = computed(() => {
  if (props.domain === 'motor') {
    return {
      ativo: 'success',
      em_manutencao: 'warning',
      reserva: 'brand',
      inativo: 'neutral',
    }[props.status] || 'neutral'
  }

  return {
    entrada: 'success',
    saida: 'danger',
    aberto: 'brand',
    em_andamento: 'warning',
    finalizado: 'success',
    cancelado: 'neutral',
  }[props.status] || props.status || 'neutral'
})

const sizeClasses = computed(() => ({
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
}[props.size] || 'px-2 py-0.5 text-[11px]')
)
</script>

<template>
  <span
    class="status-badge inline-flex items-center whitespace-nowrap rounded-full font-medium leading-none"
    :class="[`status-badge-${tone}`, sizeClasses]"
  >
    {{ resolvedLabel }}
  </span>
</template>

<style scoped>
.status-badge { --badge-color: var(--ds-text-muted); color: var(--badge-color); background: color-mix(in srgb, var(--badge-color) 12%, var(--ds-panel)); border: 1px solid color-mix(in srgb, var(--badge-color) 24%, var(--ds-panel)); }
.status-badge-brand { --badge-color: var(--ds-info); }
.status-badge-success { --badge-color: var(--ds-success); }
.status-badge-warning { --badge-color: var(--ds-warning); }
.status-badge-danger { --badge-color: var(--ds-danger); }
</style>
