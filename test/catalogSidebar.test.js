import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { matchesSearchTokens, searchTokens } from '../src/utils/globalSearch.js'

test('catalog filters search labels and values without changing selections or the material search', async () => {
  const props = reactive({ groups: ['Conexões Pneumáticas', 'Peças Industriais'], activeGroup: null, activeCategory: null, activeSubcategory: null,
    search: 'luva', facets: [
      { key: 'category', label: 'Categoria', selected: [], options: [{ value: 'Proteção das mãos', count: 3 }] },
      { key: 'attr:Marca', label: 'Marca', selected: ['Maximus'], options: [{ value: 'Maximus', count: 3 }, { value: 'São José', count: 2 }] },
      { key: 'attr:CA', label: 'CA', selected: [], options: [{ value: '123', count: 1 }] },
    ] })
  const source = readFileSync(new URL('../src/components/ui/AppSidebar.vue', import.meta.url), 'utf8')
    .split('<script setup>')[1].split('</script>')[0].replace(/^import .*$/gm, '')
  const events = []
  const scope = effectScope()
  try {
    const sidebar = scope.run(() => new Function('computed', 'reactive', 'ref', 'watch', 'matchesSearchTokens', 'searchTokens', 'defineProps', 'defineEmits',
      `${source}\nreturn { filterSearch, visibleGroups, visibleFacets, isExpanded, toggleSection, clearFilters }`
    )(computed, reactive, ref, watch, matchesSearchTokens, searchTokens, () => props, () => (...args) => events.push(args)))
    sidebar.filterSearch.value = 'pneumaticas conexoes'
    assert.deepEqual(sidebar.visibleGroups.value, ['Conexões Pneumáticas'])
    props.activeGroup = 'EPI'
    await nextTick()
    assert.equal(sidebar.filterSearch.value, '')
    assert.equal(sidebar.isExpanded(props.facets[0]), false)
    assert.equal(sidebar.isExpanded(props.facets[1]), false)
    assert.equal(sidebar.isExpanded(props.facets[2]), false)
    sidebar.toggleSection(props.facets[1])
    assert.equal(sidebar.isExpanded(props.facets[1]), true)
    sidebar.toggleSection(props.facets[0])
    assert.equal(sidebar.isExpanded(props.facets[0]), true)
    assert.equal(sidebar.isExpanded(props.facets[1]), false)
    sidebar.filterSearch.value = 'jose sao'
    assert.deepEqual(sidebar.visibleFacets.value[0].options, [{ value: 'São José', count: 2 }])
    assert.equal(sidebar.isExpanded(props.facets[1]), true)
    assert.deepEqual(props.facets[1].selected, ['Maximus'])
    assert.equal(props.facets[1].options.length, 2)
    assert.equal(props.search, 'luva')
    sidebar.filterSearch.value = 'marca'
    assert.equal(sidebar.visibleFacets.value[0].options.length, 2)
    sidebar.clearFilters()
    assert.equal(sidebar.filterSearch.value, '')
    assert.deepEqual(events, [['clear-filters']])
    sidebar.filterSearch.value = 'abc'
    props.activeCategory = 'Proteção das mãos'
    await nextTick()
    assert.equal(sidebar.filterSearch.value, '')
  } finally { scope.stop() }
})
