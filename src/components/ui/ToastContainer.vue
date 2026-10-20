<script setup>
import { useToast } from '../../composables/useToast.js'

const { toasts } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-5 right-5 z-[9999] flex max-w-[min(36rem,calc(100vw-2.5rem))] flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="ds-toast rounded-lg border px-4 py-3 text-sm font-medium"
          :class="{
            'ds-toast-success': toast.type === 'success',
            'ds-toast-error': toast.type === 'error'
          }"
        >
          <div class="flex items-center gap-3">
            <span class="min-w-0 flex-1">{{ toast.message }}</span>
            <button
              v-if="toast.action"
              type="button"
              class="ds-toast-action rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
              @click="toast.action.onClick"
            >
              {{ toast.action.label }}
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.ds-toast { --toast-color: var(--ds-info); color: var(--ds-text); background: var(--ds-panel); border-color: var(--ds-border); border-left: 3px solid var(--toast-color); box-shadow: var(--ds-shadow-pop); }
.ds-toast-success { --toast-color: var(--ds-success); }
.ds-toast-error { --toast-color: var(--ds-danger); }
.ds-toast-action { color: var(--ds-text); background: var(--ds-surface); }
.ds-toast-action:hover { background: var(--ds-surface-hover); }
.toast-enter-active {
  transition: opacity 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.toast-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}
.toast-move {
  transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move {
    transition: none;
  }
}
</style>
