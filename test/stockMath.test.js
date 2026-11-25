import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateStockAfter, hasEnoughStock, isAdminStockAdjustment, parsePositiveQty } from '../server/utils/stockMath.js'

test('parsePositiveQty accepts only positive finite numbers', () => {
  assert.equal(parsePositiveQty(3), 3)
  assert.equal(parsePositiveQty('2.5'), 2.5)
  assert.equal(parsePositiveQty(0), null)
  assert.equal(parsePositiveQty(-1), null)
  assert.equal(parsePositiveQty('abc'), null)
  assert.equal(parsePositiveQty(true), null)
  assert.equal(parsePositiveQty([2]), null)
})

test('calculateStockAfter adds entries and subtracts exits', () => {
  assert.equal(calculateStockAfter('entrada', 10, 4), 14)
  assert.equal(calculateStockAfter('saida', 10, 4), 6)
})

test('hasEnoughStock blocks negative exit stock', () => {
  assert.equal(hasEnoughStock('saida', 3, 4), false)
  assert.equal(hasEnoughStock('saida', 3, 3), true)
  assert.equal(hasEnoughStock('entrada', 0, 100), true)
  assert.equal(hasEnoughStock('entrada', -4, 2), true)
  assert.equal(hasEnoughStock('saida', -4, 2), false)
})

test('calculateStockAfter rejects invalid movement type', () => {
  assert.throws(() => calculateStockAfter('ajuste', 10, 1), /Tipo de movimentacao invalido/)
})

test('only admins can bypass exit details for stock adjustments', () => {
  assert.equal(isAdminStockAdjustment('AJUSTE', 'admin'), true)
  assert.equal(isAdminStockAdjustment(' ajuste ', 'admin'), true)
  assert.equal(isAdminStockAdjustment('AJUSTE', 'operador'), false)
  assert.equal(isAdminStockAdjustment('NF-E', 'admin'), false)
})
