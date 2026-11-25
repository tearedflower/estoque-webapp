import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRecentDateTime } from '../src/utils/recentDateTime.js'

test('formats only the latest 48 hours as relative time', () => {
  const now = new Date('2026-07-29T12:00:00Z')
  assert.equal(formatRecentDateTime('2026-07-29T11:30:00Z', now), 'há 30 minutos')
  assert.equal(formatRecentDateTime('2026-07-29T11:00:00Z', now), 'há 1 hora')
  assert.equal(formatRecentDateTime('2026-07-28T12:00:00Z', now), 'há 1 dia')
  assert.equal(formatRecentDateTime('2026-07-27T12:00:00Z', now), '')
})
