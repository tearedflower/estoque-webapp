<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  ariaLabel: { type: String, required: true },
  align: { type: String, default: 'center' },
  persistent: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])
const dialogRef = ref(null)

async function syncDialog(visible) {
  await nextTick()
  if (visible && !dialogRef.value?.open) dialogRef.value?.showModal()
  if (!visible && dialogRef.value?.open) dialogRef.value.close()
}

function requestClose() {
  if (!props.persistent) emit('close')
}

watch(() => props.visible, syncDialog)
onMounted(() => syncDialog(props.visible))
onUnmounted(() => dialogRef.value?.close())
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="fixed inset-0 z-50 m-0 h-[100dvh] w-screen max-w-none bg-transparent p-0 backdrop:bg-[var(--ds-overlay)]"
      aria-modal="true"
      :aria-label="ariaLabel"
      @cancel.prevent="requestClose"
    >
      <div
        class="flex min-h-full justify-center overflow-y-auto"
        :class="align === 'top' ? 'items-start p-4 pt-[12vh]' : (align === 'start' ? 'items-start p-3 sm:p-6' : 'items-center p-4')"
        @mousedown.self="requestClose"
      >
        <slot />
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
/* Entrada suave do diálogo e do backdrop (saída instantânea) */
dialog[open] {
  transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1);
  @starting-style {
    opacity: 0;
  }
}
dialog[open]::backdrop {
  transition: opacity 160ms ease;
  @starting-style {
    opacity: 0;
  }
}
dialog[open] > div {
  transition: opacity 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
  @starting-style {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  dialog[open],
  dialog[open]::backdrop,
  dialog[open] > div {
    transition: none;
  }
}
</style>
