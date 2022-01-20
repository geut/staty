import { test } from 'uvu'
import * as assert from 'uvu/assert'
import util from 'util'

import { staty, subscribe, snapshot, ref, listeners, transaction } from '../src/index.js'

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
    rootBatched: 0,
    arr: 0,
    inner: 0,
    'arr.val': 0,
    'inner.val': 0
  }

  subscribe(state, () => {
    calls.root++
  })

  subscribe(state, () => {
    calls.rootBatched++
  }, { batch: true })

  subscribe(state.inner, () => {
    calls.inner++
  })

  subscribe(state.inner, (val) => {
    calls['inner.val']++
    assert.is(val, 'change')
  }, {
    filter: 'val'
  })

  subscribe(state.arr, () => {
    calls.arr++
  })

  subscribe(state.arr[2], (val) => {
    calls['arr.val']++
    assert.is(val, 'change')
  }, {
    filter: 'val'
  })

  state.inner.val = 'change'
  state.arr[2].val = 'change'

  await macroTask()

  assert.equal(calls, {
    root: 2,
    rootBatched: 1,
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

test('recursive updates', () => {
  let calls = 0
  const snapshots = []

  const state = staty({
    val: 0
  })

  snapshots.push(snapshot(state))

  subscribe(state, () => {
    calls++
    snapshots.push(snapshot(state))
    if (state.val < 10) {
      state.val++
    }
  })

  state.val++

  assert.is(calls, 10)
  assert.equal(snapshots, [...Array(11).keys()].map(val => ({ val })))
})

test('cache snapshot', () => {
  const state = staty({
    val: 0,
    inner: {}
  })

  const snap = snapshot(state)
  assert.is(snap, snapshot(state))

  state.val = 1

  const snap2 = snapshot(state)
  assert.is.not(snap, snap2)
  assert.is(snap.inner, snap2.inner)
  assert.is(snap2, snapshot(state))
})

test('subscribe by prop arrays', () => {
  let calls = 0

  const state = staty({
    num0: 0,
    num1: 0,
    num2: 0,
    arr: []
  })

  let lastSnapshot

  subscribe(state, (snapshot) => {
    calls++
    lastSnapshot = snapshot
  }, {
    filter: ['num0', 'num1', 'arr']
  })

  state.num0++
  state.num1++

  assert.is(calls, 2)

  state.arr.push(0)
  assert.is(calls, 3)

  state.num2 = 1
  assert.is(calls, 3)

  assert.equal(lastSnapshot, snapshot(state, ['num0', 'num1', 'arr']))
})

test('array push/slice', () => {
  let calls = 0

  const state = staty({
    arr: [{ id: '0' }, { id: '1' }]
  })

  subscribe(state, (snap) => {
    calls++
  })

  subscribe(state.arr, () => {
    calls++
  })

  state.arr.push('val')
  state.arr = state.arr.slice(0, 1)
  state.arr[0].id = 'changed'

  assert.is(calls, 5)
})

test('subscribe missing prop', () => {
  let calls = 0

  const state = staty({
    metadata: {}
  })

  subscribe(state, () => {
    calls++
  }, {
    filter: 'metadata.missing'
  })

  state.metadata.missing = 'change'
  assert.is(calls, 1)
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

test('error by set references as undefined', () => {
  const state = staty({
    val: ref({}, val => val)
  })

  assert.not.throws(() => {
    state.val = undefined
  })
})

test('compare references', () => {
  let calls = 0

  const state = staty({
    val: ref({}, () => {
      return {}
    }),
    num: 0
  })

  subscribe(state, () => {
    calls++
  }, {
    filter: 'val'
  })

  state.val = {}
  state.num = 1
  assert.is(calls, 1)
})

test('unsubscribe', () => {
  let calls = 0

  const state = staty({
    prop0: undefined,
    prop1: {
      prop2: undefined,
      prop3: [{ prop4: undefined }]
    }
  })

  const unsubscribe = []

  unsubscribe.push(subscribe(state, () => {
    calls++
  }))

  unsubscribe.push(subscribe(state, () => {
    calls++
  }, { filter: 'prop0' }))

  unsubscribe.push(subscribe(state, () => {
    calls++
  }, { filter: 'prop1.prop2' }))

  unsubscribe.push(subscribe(state, () => {
    calls++
  }, { filter: ['prop0', 'prop1.prop2'] }))

  unsubscribe.push(subscribe(state.prop1.prop3[0], () => {
    calls++
  }))

  assert.is(listeners(state).count, 6)

  state.prop0 = 1
  state.prop1.prop2 = 1
  state.prop1.prop3[0].prop4 = 1
  assert.is(calls, 8)

  unsubscribe.forEach(unsubscribe => unsubscribe())
  assert.is(listeners(state).count, 0)
})

test('delete key', () => {
  let calls = 0

  const state = staty({
    prop0: 1,
    inner: {
      prop1: 1
    }
  })

  subscribe(state, () => {
    calls++
  })

  subscribe(state, () => {
    calls++
  }, { filter: 'inner' })

  delete state.inner

  assert.is(calls, 2)
})

test('unparent', () => {
  let calls = 0

  const state = staty({
    inner: {}
  })

  subscribe(state, () => {
    calls++
  })

  subscribe(state, () => {
    calls++
  }, { filter: 'inner' })

  state.inner = {}
  state.inner.name = 'test'
  assert.is(calls, 4)
})

test('transaction', () => {
  let calls = 0

  const state = staty({
    inc: 0
  })

  subscribe(state, () => {
    calls++
  })

  transaction(() => {
    state.inc++
    state.inc++
  })

  assert.is(calls, 1)
})

test('transaction names', () => {
  let calls = 0

  const state = staty({
    prop0: 0
  })

  subscribe(state, () => {
    calls++
  }, { transactionFilter: { exclude: /internal/ } })

  subscribe(state, () => {
    calls++
  }, { transactionFilter: /internal/ })

  transaction(() => {
    state.prop0++
  }, 'internal')

  assert.is(calls, 1)
})

test('readme', () => {
  let plan = 3

  const state = staty({
    count: 0
  })

  assert.equal(snapshot(state), { count: 0 })

  subscribe(state, state => {
    assert.equal(snapshot(state), { count: 1 })
    plan--
  })

  subscribe(state, count => {
    assert.is(count, 1)
    plan--
  }, { filter: 'count' })

  subscribe(state, ([count]) => {
    assert.is(count, 1)
    plan--
  }, { filter: ['count'] })

  state.count++
  assert.is(plan, 0)
})

test('no snapshot', () => {
  let plan = 1
  const state = staty({
    count: 0
  })

  subscribe(state, state => {
    assert.is(state, undefined)
    plan--
  }, { snapshot: false })

  state.count++
  assert.is(plan, 0)
})

test('array mutable operations', () => {
  let calls = 0

  const state = staty({
    arr: [0, 1, 3]
  })

  subscribe(state, (state) => {
    calls++
  })

  state.arr.splice(0, 1)
  state.arr.pop()
  state.arr.shift()

  assert.is(calls, 3)
})

test('batch', async () => {
  const calls = {
    root: 0,
    count: 0,
    innerCount: 0,
    multiple: 0
  }

  const state = staty({
    count: 0,
    inner: {
      count: 0
    }
  })

  subscribe(state, () => {
    calls.root++
  }, { batch: true })

  subscribe(state, () => {
    calls.count++
  }, { batch: true })

  subscribe(state, () => {
    calls.innerCount++
  }, { filter: 'inner.count', batch: true })

  subscribe(state, () => {
    calls.multiple++
  }, { filter: ['count', 'inner.count'], batch: true })

  state.count++
  state.inner.count++

  await macroTask()

  assert.is(calls.root, 1)
  assert.is(calls.count, 1)
  assert.is(calls.innerCount, 1)
  assert.is(calls.multiple, 1)
})

test('set', () => {
  let calls = 0

  const state = staty({
    bag: new Set()
  })

  subscribe(state, () => {
    calls++
  })

  const obj = staty({ count: 0 })
  state.bag.add(obj)
  obj.count++
  state.bag.delete(obj)
  obj.count++
  assert.is(calls, 3)
})

test('map', () => {
  let calls = 0

  const state = staty({
    map: new Map()
  })

  subscribe(state, () => {
    calls++
  })

  const obj = staty({ count: 0 })
  state.map.set('key1', obj)
  obj.count++
  state.map.delete('key1')
  obj.count++
  assert.is(calls, 3)
})

test.run()
