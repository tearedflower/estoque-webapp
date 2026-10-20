<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import AppButton from './AppButton.vue'
import AppLink from './AppLink.vue'

defineProps({ groups: { type: Array, required: true } })
const emit = defineEmits(['navigate'])
const root = ref(null)
const mobileOpen = ref(false)

function closeMenus() {
  root.value?.querySelectorAll('details[open]').forEach(menu => { menu.open = false })
  mobileOpen.value = false
}

function navigate(target) {
  closeMenus()
  emit('navigate', target)
}

function closeOutside(event) {
  if (!root.value?.contains(event.target)) closeMenus()
  else root.value.querySelectorAll('details[open]').forEach(menu => {
    if (!menu.contains(event.target)) menu.open = false
  })
}

function handleKeydown(event) {
  const menu = event.target.closest('details')
  if (event.key === 'Escape') {
    if (menu?.open) {
      menu.open = false
      menu.querySelector('summary').focus()
    } else if (mobileOpen.value) {
      closeMenus()
      root.value.querySelector('button').focus()
    } else return
    event.stopPropagation()
    event.preventDefault()
  } else if (menu && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    menu.open = true
    const links = [...menu.querySelectorAll('a')]
    const index = links.indexOf(event.target)
    const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length
    links[next]?.focus()
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', closeOutside)
  window.addEventListener('focusin', closeOutside)
  window.addEventListener('hashchange', closeMenus)
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', closeOutside)
  window.removeEventListener('focusin', closeOutside)
  window.removeEventListener('hashchange', closeMenus)
})
</script>

<template>
  <div ref="root" class="ds-primary-navigation" @keydown="handleKeydown">
    <AppButton
      class="min-[640px]:!hidden" variant="ghost" size="icon"
      aria-controls="main-navigation" :aria-expanded="mobileOpen"
      :aria-label="mobileOpen ? 'Fechar navegação' : 'Abrir navegação'"
      @click="mobileOpen ? closeMenus() : mobileOpen = true"
    >
      <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </AppButton>
    <nav id="main-navigation" class="ds-topnav" :class="{ 'ds-topnav-open': mobileOpen }" aria-label="Navegação principal">
      <template v-for="group in groups" :key="group.id">
        <details v-if="group.tabs.length > 1" class="ds-nav-group" name="primary-navigation">
          <summary class="ds-nav-link" :class="{ 'ds-nav-link-active': group.active }">
            <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" :d="group.icon" /></svg>
            {{ group.label }}
            <svg class="ds-nav-chevron" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m7 10 5 5 5-5" /></svg>
          </summary>
          <div class="ds-nav-dropdown ds-pop">
            <AppLink
              v-for="tab in group.tabs" :key="tab.id" :target="tab.target || tab.id"
              class="ds-nav-link" :class="{ 'ds-nav-link-active': tab.active }"
              :aria-current="tab.active ? 'page' : undefined" @navigate="navigate"
            >{{ tab.label }}</AppLink>
          </div>
        </details>
        <AppLink
          v-else :target="group.target || group.defaultTab"
          class="ds-nav-link" :class="{ 'ds-nav-link-active': group.active }"
          :aria-current="group.active ? 'page' : undefined" @navigate="navigate"
        >
          <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" :d="group.icon" /></svg>
          {{ group.label }}
        </AppLink>
      </template>
    </nav>
  </div>
</template>
