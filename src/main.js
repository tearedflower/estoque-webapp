import { createApp } from 'vue'
import './style.css'
import './ui-system.css'
import './registry.css'
import App from './App.vue'
import { applyStoredTheme } from './composables/useTheme.js'

applyStoredTheme()

createApp(App).mount('#app')
