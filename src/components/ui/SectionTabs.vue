<script setup>
import AppLink from './AppLink.vue'
defineProps({
  routeTab: { type: String, default: '' },
  modelValue: { type: String, required: true },
  tabs: { type: Array, default: () => [] },
  variant: { type: String, default: 'segmented' },
  ariaLabel: { type: String, default: 'Seções' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <nav
    :class="variant === 'line' ? 'ds-scroll-x flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700' : 'ds-segmented'"
    :aria-label="ariaLabel"
  >
    <component
      :is="routeTab ? AppLink : 'button'"
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :target="routeTab ? { tab: routeTab, subTab: tab.id } : undefined"
      :class="variant === 'line'
        ? ['relative inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors', modelValue === tab.id ? 'text-primary-700 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200']
        : ['ds-segmented-item', modelValue === tab.id ? 'ds-segmented-item-active' : '']"
      @navigate="$emit('update:modelValue', tab.id)"
      @click="!routeTab && $emit('update:modelValue', tab.id)"
    >
      <svg v-if="tab.icon" class="h-4 w-4" fill="none" stroke="currentColor" :stroke-width="variant === 'line' ? 2 : 1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" :d="tab.icon" />
      </svg>
      {{ tab.label }}
      <span
        v-if="variant === 'line' && modelValue === tab.id"
        class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary-600 dark:bg-primary-400"
      ></span>
    </component>
  </nav>
</template>
