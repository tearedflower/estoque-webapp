import { ref, computed } from 'vue'
import * as api from '../services/api.js'

const user = ref(null)

export function useAuth() {
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isLoggedIn = computed(() => !!user.value)
  const canOperate = computed(() => ['admin', 'operador'].includes(user.value?.role))

  async function login(name, pin) {
    try {
      const u = await api.login(name, pin)
      user.value = u
      return true
    } catch {
      return false
    }
  }

  async function logout() {
    await api.logout()
    user.value = null
  }

  async function checkSession() {
    try {
      const u = await api.getMe()
      user.value = u
    } catch {
      user.value = null
    }
  }

  async function changeOwnPassword(pin) {
    if (!user.value?.id) return { ok: false, error: 'Usuario nao autenticado.' }
    if (!pin || String(pin).trim().length < 4) return { ok: false, error: 'Senha deve ter ao menos 4 caracteres.' }
    try {
      await api.updateUser(user.value.id, { pin: String(pin).trim() })
      user.value = { ...user.value, mustChangePassword: false }
      localStorage.setItem('auth_user', JSON.stringify(user.value))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  return { user, isAdmin, isLoggedIn, canOperate, login, logout, checkSession, changeOwnPassword }
}
