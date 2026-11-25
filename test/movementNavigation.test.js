import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('switching entry and exit preserves search and the selected material in both directions', () => {
  const source = readFileSync(new URL('../src/views/MovimentacoesView.vue', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('function switchSubTab('), source.indexOf('// ===== Step flow'))
  for (const currentStep of [1, 3]) {
    const state = {
      validSubTabs: ['entrada', 'saida', 'historico'], activeSubTab: { value: 'saida' },
      step: { value: currentStep }, suppressFlowReset: { value: false },
      nextTick: callback => callback(), focusRef() {}, qtyInputEl: {}, searchInputEl: {},
      adaptFormForSubTab() {},
    }
    let search = 'Luva de raspa'
    let selectedMaterial = currentStep === 3 ? 'luva-1' : null
    state.resetFlow = () => { search = ''; selectedMaterial = null }
    const switchTab = new Function(...Object.keys(state), `${body}; return switchSubTab`)(...Object.values(state))
    for (const target of ['entrada', 'saida']) {
      switchTab(target)
      assert.equal(state.activeSubTab.value, target)
      assert.equal(search, 'Luva de raspa')
      assert.equal(selectedMaterial, currentStep === 3 ? 'luva-1' : null)
    }
    switchTab('historico')
    assert.equal(search, '')
  }
})
