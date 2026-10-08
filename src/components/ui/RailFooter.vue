<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import AppButton from './AppButton.vue'

defineProps({
  isLoggedIn: { type: Boolean, default: false },
  userName: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
  canChangeVisualStyle: { type: Boolean, default: false },
  visualStyleName: { type: String, default: '' },
})

const emit = defineEmits(['login', 'change-password', 'logout', 'toggle-theme', 'toggle-visual-style'])
const accountOpen = ref(false)
const root = ref(null)

function run(action) {
  accountOpen.value = false
  emit(action)
}

function closeOutside(event) {
  if (accountOpen.value && event.target instanceof Node && !root.value?.contains(event.target)) {
    accountOpen.value = false
  }
}

onMounted(() => window.addEventListener('pointerdown', closeOutside))
onUnmounted(() => window.removeEventListener('pointerdown', closeOutside))
</script>

<template>
  <div class="ds-rail-footer">
    <div v-if="isLoggedIn" ref="root" class="relative min-w-0 flex-1" @keydown.esc.stop="accountOpen = false">
      <AppButton
        variant="ghost"
        size="sm"
        class="w-full !justify-start"
        title="Conta"
        :aria-expanded="accountOpen"
        @click="accountOpen = !accountOpen"
      >
        <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
        </svg>
        <span class="truncate">{{ userName }}</span>
      </AppButton>
      <div v-if="accountOpen" class="ds-menu ds-pop ds-pop-up absolute bottom-full left-0 mb-2 w-44 p-1">
        <button type="button" class="ds-menu-item text-sm" @click="run('change-password')">Trocar senha</button>
        <button type="button" class="ds-menu-item ds-menu-item-danger text-sm" @click="run('logout')">Sair</button>
      </div>
    </div>
    <AppButton
      v-else
      variant="ghost"
      size="sm"
      class="flex-1 !justify-start"
      title="Entrar"
      @click="$emit('login')"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0-2.25 2.25Z" />
      </svg>
      <span>Entrar</span>
    </AppButton>
    <AppButton
      v-if="canChangeVisualStyle"
      variant="ghost"
      size="icon"
      class="!h-9 !w-9 !min-w-9"
      :title="`Alternar aparência (${visualStyleName})`"
      aria-label="Alternar aparência"
      @click="$emit('toggle-visual-style')"
    >
      <span class="text-[10px] font-bold leading-none">98</span>
    </AppButton>
    <AppButton
      variant="ghost"
      size="icon"
      class="!h-9 !w-9 !min-w-9"
      title="Alternar tema claro/escuro"
      @click="$emit('toggle-theme')"
    >
      <svg v-if="isDark" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
      <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
      </svg>
    </AppButton>
  </div>
</template>
