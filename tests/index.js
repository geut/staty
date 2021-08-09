import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { staty, subscribe, subscribeByProp, snapshot, ref } from '../src/index.js'

const macroTask = () => new Promise(resolve => setTimeout(resolve, 1))

test('subscription', async () => {
  const state = staty({
    val: 'str',
    num: 0,
    arr: [0, 1, { val: '2' }],
    inner: {
      val: 'str'
    }
  })

  const calls = {
    root: 0,
    arr: 0,
    inner: 0,
    'arr.val': 0,
    'inner.val': 0
  }

  subscribe(state, () => {
    calls.root++
  })

  subscribe(state.inner, () => {
    calls.inner++
  })

  subscribeByProp(state.inner, 'val', () => {
    calls['inner.val']++
  })

  subscribe(state.arr, () => {
    calls.arr++
  })

  subscribeByProp(state.arr[2], 'val', () => {
    calls['arr.val']++
  })

  state.inner.val = 'change1'
  state.arr[2].val = 'change'

  await macroTask()

  assert.equal(calls, {
    root: 1,
    arr: 1,
    inner: 1,
    'arr.val': 1,
    'inner.val': 1
  })
})

test('snapshot', () => {
  const state = staty({
    val: 'str',
    num: 0,
    arr: [0, 1, { val: '2' }],
    inner: {
      val: 'str'
    },
    nul: null
  })

  assert.equal(state, snapshot(state))
  assert.is.not(state, snapshot(state))
})

test('ref', () => {
  const state = staty({
    val: 'str',
    num: 0,
    arr: [0, 1, ref({ val: '2' })],
    inner: {
      val: 'str',
      sub: ref({ id: 'id', val: 'val' }, o => ({ id: o.id }))
    }
  })

  assert.is(state.arr[2].val, '2')
  assert.is(state.inner.sub.val, 'val')
  state.inner.sub.val = 'changed'
  assert.is(state.inner.sub.val, 'changed')
  assert.equal(snapshot(state), {
    val: 'str',
    num: 0,
    arr: [0, 1, { val: '2' }],
    inner: {
      val: 'str',
      sub: { id: 'id' }
    }
  })
})

test('recursive updates', async () => {
  let calls = 0
  const snapshots = []

  const state = staty({
    val: 0
  })

  subscribe(state, () => {
    calls++
    snapshots.push(snapshot(state))
    state.val = 2
  })

  state.val = 1

  await macroTask()

  assert.is(calls, 2)
  assert.equal(snapshots, [
    { val: 1 },
    { val: 2 }
  ])
})

test('cache snapshot', async () => {
  const state = staty({
    val: 0
  })

  const snap = snapshot(state)
  assert.is(snap, snapshot(state))

  state.val = 1

  const snap2 = snapshot(state)
  assert.is.not(snap, snap2)
  assert.is(snap2, snapshot(state))
})

test.run()
