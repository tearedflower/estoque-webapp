<script setup>
import { routeHref, isPlainLinkClick } from '../../utils/navigation.js'
const props = defineProps({ target: { type: [String, Object], required: true } })
const emit = defineEmits(['navigate'])
function navigate(event) {
  if (!isPlainLinkClick(event)) return
  event.preventDefault()
  emit('navigate', props.target)
}
</script>

<template><a :href="routeHref(target)" @click="navigate"><slot /></a></template>
