import { computed, onMounted, onUnmounted, ref } from 'vue'

const releaseSelector = 'meta[name="app-release"]'
const checkIntervalMs = 60_000

export function useAppUpdate() {
  const pendingRelease = ref('')
  const dismissedRelease = ref('')
  const updateAvailable = computed(() => Boolean(pendingRelease.value && pendingRelease.value !== dismissedRelease.value))

  function dismissUpdate() {
    dismissedRelease.value = pendingRelease.value
  }
  let timer
  let checking = false

  async function checkForUpdate() {
    const current = document.querySelector(releaseSelector)?.content
    if (!current || checking || document.visibilityState !== 'visible') return

    checking = true
    try {
      const response = await fetch(window.location.pathname, {
        cache: 'no-store',
        headers: { Accept: 'text/html' },
      })
      if (!response.ok) return

      const html = new DOMParser().parseFromString(await response.text(), 'text/html')
      const latest = html.querySelector(releaseSelector)?.content
      if (latest) pendingRelease.value = latest === current ? '' : latest
    } catch {
      // A transient connection failure can be retried on the next check.
    } finally {
      checking = false
    }
  }

  onMounted(() => {
    if (!document.querySelector(releaseSelector)) return
    checkForUpdate()
    timer = window.setInterval(checkForUpdate, checkIntervalMs)
    document.addEventListener('visibilitychange', checkForUpdate)
    window.addEventListener('focus', checkForUpdate)
  })

  onUnmounted(() => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', checkForUpdate)
    window.removeEventListener('focus', checkForUpdate)
  })

  return { updateAvailable, dismissUpdate, reloadApp: () => window.location.reload() }
}
