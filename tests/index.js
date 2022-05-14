import { test } from 'uvu'
import * as assert from 'uvu/assert'
import util from 'util'

import { staty, subscribe, snapshot, ref, listeners, action } from '../src/index.js'

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

  subscribe(state.inner, () => {
    calls['inner.val']++
  }, {
    props: 'val'
  })

  subscribe(state.arr, () => {
    calls.arr++
  })

  subscribe(state.arr[2], () => {
    calls['arr.val']++
  }, {
    props: 'val'
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
  const date = new Date()
  const aSet = new Set(['v0', 'v1'])
  const aMap = new Map([['v0', 'v1'], ['k1', 'v1']])
  const aBuffer = Buffer.from('test')
  const obj = {
    val: 'str',
    num: 0,
    arr: [0, 1, { val: '2' }],
    inner: {
      date
    },
    nul: null,
    aSet,
    aMap,
    regex: /regex/,
    aBuffer
  }

  const state = staty(snapshot(obj))
  assert.equal(obj, snapshot(state))
  assert.is.not(obj, snapshot(state))

  // by prop

  assert.is(snapshot(state, 'sub.missing.prop'), undefined)
  assert.equal(snapshot(state, 'inner.date'), date)
  assert.equal(snapshot(state, 'aSet'), aSet)
  assert.equal(snapshot(state, 'aMap'), aMap)
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

test('disable cache snapshot', () => {
  const state = staty({
    val: 0,
    inner: {}
  }, { disableCache: true })

  const snap = snapshot(state)
  assert.is.not(snap, snapshot(state))

  state.val = 1

  const snap2 = snapshot(state)
  assert.is.not(snap, snap2)
  assert.is.not(snap.inner, snap2.inner)
  assert.is.not(snap2, snapshot(state))
  assert.is(snapshot(state, null, false), snapshot(state, null, false))
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

  subscribe(state, () => {
    calls++
    lastSnapshot = snapshot(state, ['num0', 'num1', 'arr'])
  }, {
    props: ['num0', 'num1', 'arr']
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

test('subscribe missing prop', () => {
  let calls = 0

  const state = staty({
    metadata: {}
  })

  subscribe(state, () => {
    calls++
  }, {
    props: 'metadata.missing'
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
    props: 'val'
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
  }, { props: 'prop0' }))

  unsubscribe.push(subscribe(state, () => {
    calls++
  }, { props: 'prop1.prop2' }))

  unsubscribe.push(subscribe(state, () => {
    calls++
  }, { props: ['prop0', 'prop1.prop2'] }))

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
  }, { props: 'inner' })

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
  }, { props: 'inner' })

  state.inner = {}
  state.inner.name = 'test'
  assert.is(calls, 4)
  const inner = state.inner
  delete state.inner
  inner.name = 'test2'
  assert.is(calls, 6)

  // ref
  state.ref = ref({}, () => {})
  delete state.ref
})

test('action', () => {
  let calls = 0

  const state = staty({
    inc: 0
  })

  subscribe(state, () => {
    calls++
  })

  action(() => {
    state.inc++
    state.inc++
  })

  assert.is(calls, 1)
})

test('action names', () => {
  let calls = 0

  const state = staty({
    prop0: 0
  })

  subscribe(state, () => {
    calls++
  }, { filter: { exclude: /internal/ } })

  subscribe(state, () => {
    calls++
  }, { filter: /internal/ })

  subscribe(state, () => {
    calls++
  }, { filter: 'action-string' })

  action(() => {
    state.prop0++
  }, 'internal')

  action(() => {
    state.prop0++
  }, 'action-string')

  assert.is(calls, 2)
})

test('action filter by symbol', () => {
  let calls = 0

  const state = staty({
    prop0: 0
  })

  const internal = Symbol('internal')

  subscribe(state, () => {
    calls++
  }, { filter: /test/ })

  subscribe(state, () => {
    calls++
  }, { filter: internal })

  action(() => {
    state.prop0++
  }, internal)

  assert.is(calls, 1)
})

test('readme', () => {
  let plan = 3

  const state = staty({
    count: 0
  })

  assert.equal(snapshot(state), { count: 0 })

  subscribe(state, () => {
    plan--
  })

  subscribe(state, () => {
    plan--
  }, { props: 'count' })

  subscribe(state, () => {
    plan--
  }, { props: ['count'] })

  state.count++
  assert.is(plan, 0)
  assert.is(state.count, 1)
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
  }, { props: 'inner.count', batch: true })

  subscribe(state, () => {
    calls.multiple++
  }, { props: ['count', 'inner.count'], batch: true })

  state.count++
  state.inner.count++

  await macroTask()

  assert.is(calls.root, 1)
  assert.is(calls.count, 1)
  assert.is(calls.innerCount, 1)
  assert.is(calls.multiple, 1)
})

test('array immutable operations', () => {
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

test('array mutable operations', () => {
  let calls = 0

  const state = staty({
    arr: [0, 1, 3]
  })

  subscribe(state, () => {
    calls++
  })

  state.arr.splice(0, 1)
  state.arr.pop()
  state.arr.shift()

  action(() => {
    state.arr.push('')
    state.arr.push('')
    state.arr.pop()
  })

  assert.is(calls, 4)
  assert.equal(snapshot(state).arr, [''])
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
  assert.is(state.bag.size, 1)
  obj.count++
  state.bag.delete(obj)
  assert.is(state.bag.size, 0)
  obj.count++
  assert.is(calls, 3)
  assert.equal(Array.from(state.bag.entries()), [])
})

test('map convertMapItems', () => {
  let calls = 0

  const state = staty({
    map: new Map([['key0', { count: 0 }]])
  })

  subscribe(state, () => {
    calls++
  })

  state.map.get('key0').count++
  const obj = { count: 0 }
  state.map.set('key1', obj)
  const liveObj = state.map.get('key1')
  liveObj.count++
  state.map.delete('key1')
  liveObj.count++
  assert.is(calls, 4)
})

test('autorun', () => {
  let calls = 0
  let callsByProps = 0

  const state = staty({
    count: 0,
    text: ''
  })

  subscribe(state, () => {
    calls++
  }, { autorun: true })

  subscribe(state, () => {
    callsByProps++
  }, { props: ['count'], autorun: true })

  state.count++
  state.text = 'change'

  assert.is(calls, 3)
  assert.is(callsByProps, 2)
})

test('action cancel', () => {
  let calls = 0

  const state = staty({
    count: 0
  })

  subscribe(state, () => {
    calls++
  })

  action(cancel => {
    state.count++
    cancel()
  })

  assert.is(calls, 0)
})

test.run()
