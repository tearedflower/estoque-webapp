<script setup>
import { computed } from 'vue'
import { compareAttributeNames, variationAttributeRows } from '../../utils/attributes.js'

const props = defineProps({
  item: { type: Object, default: null },
  variation: { type: Object, default: null },
  tags: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
})

const rows = computed(() => {
  if (props.tags.length) {
    return props.tags
      .map(tag => ({ key: tag.key, value: tag.value }))
      .filter(tag => tag.key && String(tag.value ?? '').trim())
      .sort((a, b) => compareAttributeNames(a.key, b.key, props.item?.attributeOrder))
  }

  return variationAttributeRows(props.item, props.variation)
})
</script>

<template>
  <div v-if="rows.length" class="flex flex-wrap gap-1">
    <span
      v-for="row in rows"
      :key="`${row.extra}:${row.key}:${row.value}`"
      class="ds-attribute-tag inline-flex min-w-0 max-w-full items-center gap-0.5 rounded border px-2 py-0.5"
      :class="compact ? 'text-[11px]' : 'text-xs'"
    >
      <span class="font-medium">{{ row.key }}:</span>
      <span class="break-words min-w-0">{{ row.value }}</span>
    </span>
  </div>
  <span v-else class="text-xs text-gray-400 dark:text-gray-500">Sem atributos</span>
</template>
