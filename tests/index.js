import { test } from 'uvu'
import * as assert from 'uvu/assert'
import util from 'util'

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

  subscribeByProp(state.inner, 'val', (val) => {
    calls['inner.val']++
    assert.is(val, 'change')
  })

  subscribe(state.arr, () => {
    calls.arr++
  })

  subscribeByProp(state.arr[2], 'val', (val) => {
    calls['arr.val']++
    assert.is(val, 'change')
  })

  state.inner.val = 'change'
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
  state.external = ref({ val: 'external' })
  assert.not.ok(util.types.isProxy(state.external))
  assert.equal(snapshot(state), {
    val: 'str',
    num: 0,
    arr: [0, 1, { val: '2' }],
    inner: {
      val: 'str',
      sub: { id: 'id' }
    },
    external: { val: 'external' }
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

test('subscribeByProp arrays', async () => {
  let calls = 0

  const state = staty({
    num0: 0,
    num1: 0,
    num2: 0,
    arr: []
  })

  subscribeByProp(state, ['num0', 'num1', 'arr'], ([num0, num1]) => {
    calls++
    assert.is(num0, 1)
    assert.is(num1, 1)
  })

  state.num0++
  state.num1++

  await macroTask()
  assert.is(calls, 1)

  state.arr.push(0)
  await macroTask()
  assert.is(calls, 2)

  state.num2 = 1
  await macroTask()
  assert.is(calls, 2)
})

test('array push/splice', async () => {
  let calls = 0

  const state = staty({
    arr: []
  })

  subscribe(state, () => {
    calls++
  })

  state.arr.push('val')
  await macroTask()

  state.arr.splice(0, 1)
  await macroTask()

  assert.is(calls, 2)
})

test('subscribe missing prop', async () => {
  let calls = 0

  const state = staty({
    metadata: {}
  })

  subscribeByProp(state, 'metadata.missing', () => {
    calls++
  })

  state.metadata.missing = 'change'
  await macroTask()

  assert.is(calls, 1)
})

test('unsubscribe', async () => {
  let calls = 0
  const subscriptions = []

  const state = staty({
    val: 0
  })

  subscriptions.push(subscribe(state, () => {
    calls++
  }))

  subscriptions.push(subscribeByProp(state, 'val', () => {
    calls++
  }))

  subscriptions.push(subscribeByProp(state, ['val'], () => {
    calls++
  }))

  state.val = 1
  await macroTask()
  assert.is(calls, 3)

  state.val = 1
  // unsubscribe should be immediately
  subscriptions.forEach(unsubscribe => unsubscribe())
  await macroTask()
  assert.is(calls, 3)
})

test('error comparing buffers on snapshots', () => {
  const state = staty({
    val: 0,
    buf: ref(Buffer.from('test'), buf => buf)
  })

  const prev = snapshot(state, 'buf')
  state.val++
  const next = snapshot(state, 'buf')

  assert.is(prev, next)
})

test.run()
