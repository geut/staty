import { test } from 'uvu'
import * as assert from 'uvu/assert'
import util from 'util'

import { actions } from '../src/action.js'
import { staty, subscribe, snapshot, ref, listeners, action } from '../src/index.js'

const macroTask = () => new Promise(resolve => setTimeout(resolve, 1))

test('staty return staty', () => {
  const state = staty({})
  assert.is(state, staty(state))
})

test('valid staty', () => {
  try {
    staty(true)
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'the `target` is not valid for staty')
  }
})

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
  const aArrayBuffer = new ArrayBuffer(2)
  const aDataView = new DataView(aArrayBuffer)

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
    aBuffer,
    aArrayBuffer,
    aDataView
  }

  const state = staty(obj)
  assert.equal(obj, snapshot(state))
  assert.is.not(obj, snapshot(state))

  // by prop

  assert.is(snapshot(state, 'sub.missing.prop'), undefined)
  assert.equal(snapshot(state, 'inner.date'), date)
  assert.equal(snapshot(state, 'aSet'), aSet)
  assert.equal(snapshot(state, 'aMap'), aMap)
})

test('snapshot cache inside subscription', () => {
  const state = staty({
    inc: 0
  })

  subscribe(state, () => {
    assert.is(snapshot(state), snapshot(state))
  })

  state.inc++
})

test('subscription error', () => {
  let onErrorCalls = 0

  const state = staty({
    inc: 0
  }, {
    onErrorSubscription () {
      onErrorCalls++
    }
  })

  subscribe(state, () => {
    throw new Error('test0')
  })

  subscribe(state, () => {
    throw new Error('test0')
  }, {
    onError: () => {
      onErrorCalls++
    }
  })

  const unsubscribe = subscribe(state, () => {
    throw new Error('test1')
  }, {
    before: true,
    onError: () => {
      onErrorCalls++
    }
  })

  try {
    state.inc++
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'test1')
  }

  assert.is(state.inc, 0)
  assert.is(onErrorCalls, 0)
  unsubscribe()

  try {
    state.inc++
  } catch (err) {
    assert.unreachable('should not have thrown')
  }

  assert.is(state.inc, 1)
  assert.is(onErrorCalls, 2)

  const warn = console.warn.bind(console)
  console.warn = () => {
    onErrorCalls++
  }

  const def = staty({})

  subscribe(def, () => {
    throw new Error('test')
  })

  def.change = 0

  console.warn = warn
  assert.is(def.change, 0)
  assert.is(onErrorCalls, 3)
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

  assert.equal(Object.keys(ref({ val: '0' })), ['val'])
  assert.equal(Object.keys(ref(true)), [])
  assert.equal(Reflect.getOwnPropertyDescriptor(ref({ val: '0' }), 'val'), {
    value: '0',
    writable: true,
    enumerable: true,
    configurable: true
  })
  assert.equal(Reflect.getOwnPropertyDescriptor(ref(true), 'val'), undefined)

  const r = ref({
    id: 'id',
    hello () {
      return 'hello'
    }
  })

  assert.is(r.id, 'id')
  assert.is(r.hello(), 'hello')
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
  }, {
    filter: name => !/internal/.test(name)
  })

  subscribe(state, () => {
    calls++
  }, {
    filter: name => /internal/.test(name)
  })

  subscribe(state, () => {
    calls++
  }, {
    filter: name => name === 'action-string'
  })

  action(() => {
    state.prop0++
  }, 'internal')

  action(() => {
    state.prop0++
  }, 'action-string')

  assert.is(calls, 3)
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

test('action rollback', () => {
  let calls = 0

  const date = new Date()

  const state = staty({
    inc: 0,
    substate: {
      name: 'tincho'
    },
    arr: ['value0', 'value1', { val: 0 }],
    map: new Map([['key0', 'val0']]),
    set: new Set(['val0']),
    date: ref(date, val => val.toISOString()),
    ref: ref({ value: 'ref' }),
    staty: staty({
      title: 'test'
    })
  })

  subscribe(state, () => {
    calls++
  })

  try {
    action(() => {
      state.inc++
      state.inc++
      state.newProp = 'hello'
      state.substate.name = 'test'
      state.substate2 = {
        subchange: 'helo'
      }
      state.substate2.subchange = 'has different'
      state.arr.push('value2')
      state.arr[2].val = 2
      state.map.set('key1', 'val1')
      state.map.delete('key0')
      state.set.add('val1')
      state.set.delete('val0')
      const date = new Date()
      state.date = date

      assert.equal(snapshot(state), {
        inc: 2,
        substate: { name: 'test' },
        arr: ['value0', 'value1', { val: 2 }, 'value2'],
        map: new Map([
          ['key1', 'val1']
        ]),
        set: new Set(['val1']),
        newProp: 'hello',
        substate2: { subchange: 'has different' },
        date: date.toISOString(),
        ref: { value: 'ref' },
        staty: {
          title: 'test'
        }
      })

      delete state.date
      state.arr = ['new array']

      assert.equal(snapshot(state), {
        inc: 2,
        substate: { name: 'test' },
        arr: ['new array'],
        map: new Map([
          ['key1', 'val1']
        ]),
        set: new Set(['val1']),
        newProp: 'hello',
        substate2: { subchange: 'has different' },
        ref: { value: 'ref' },
        staty: {
          title: 'test'
        }
      })

      state.arr.push('item1')
      state.arr.push('item2')
      state.arr.splice(0, 1)

      assert.equal(snapshot(state), {
        inc: 2,
        substate: { name: 'test' },
        arr: ['item1', 'item2'],
        map: new Map([
          ['key1', 'val1']
        ]),
        set: new Set(['val1']),
        newProp: 'hello',
        substate2: { subchange: 'has different' },
        ref: { value: 'ref' },
        staty: {
          title: 'test'
        }
      })

      const newref = { other: 'newref' }
      state.ref = ref(newref)
      state.staty = staty({
        other: 'state'
      })

      assert.equal(snapshot(state), {
        inc: 2,
        substate: { name: 'test' },
        arr: ['item1', 'item2'],
        map: new Map([
          ['key1', 'val1']
        ]),
        set: new Set(['val1']),
        newProp: 'hello',
        substate2: { subchange: 'has different' },
        ref: { other: 'newref' },
        staty: {
          other: 'state'
        }
      })

      state.ref = newref
      state.newref = ref(newref)
      delete state.staty
      delete state.ignore

      assert.equal(snapshot(state), {
        inc: 2,
        substate: { name: 'test' },
        arr: ['item1', 'item2'],
        map: new Map([
          ['key1', 'val1']
        ]),
        set: new Set(['val1']),
        newProp: 'hello',
        substate2: { subchange: 'has different' },
        ref: { other: 'newref' },
        newref: { other: 'newref' }
      })

      throw new Error('test')
    })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'test')
  }

  assert.is(calls, 0)
  assert.equal(snapshot(state), {
    inc: 0,
    substate: {
      name: 'tincho'
    },
    arr: ['value0', 'value1', { val: 0 }],
    map: new Map([['key0', 'val0']]),
    set: new Set(['val0']),
    date: date.toISOString(),
    ref: { value: 'ref' },
    staty: {
      title: 'test'
    }
  })
})

test('atomic rollback', () => {
  const state = staty({
    inc: 0
  })

  subscribe(state, () => {
    if (state.inc === 1) {
      throw new Error('global')
    }
  }, {
    before: true
  })

  subscribe(state, () => {
    if (state.inc === 2) {
      throw new Error('prop')
    }
  }, {
    before: true,
    props: 'inc'
  })

  try {
    state.inc = 1
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'global')
  }

  try {
    state.inc = 2
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'prop')
  }
})

test('subscribe before', () => {
  let calls = 0

  const state = staty({
    inc: 0
  })

  subscribe(state, () => {
    calls++
  })

  subscribe(state, () => {
    if (state.inc === 1) throw new Error('cannot increase inc')
  }, { before: true })

  try {
    state.inc++
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'cannot increase inc')
  }

  assert.is(calls, 0)
})

test('fix issue where ref cache is not updated', () => {
  const state = staty({
    ref: ref('test', (val) => ({ val }))
  })

  state.ref = 'change'
  assert.equal(snapshot(state), { ref: { val: 'change' } }) // cache generated
  assert.is(snapshot(state), snapshot(state)) // from cache
  state.ref = 'change2' // it should clear the cache
  assert.equal(snapshot(state), { ref: { val: 'change2' } })
})

test('release action on unhandle error', async () => {
  const state = staty({
    inc: 0
  }, {
    onErrorSubscription (err) {
      throw err
    }
  })

  try {
    subscribe(state, () => {
      throw new Error('test')
    })

    state.inc++
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'test')
    assert.is(actions.current, undefined)
  }
})

test('not override snapshots', () => {
  const calls = []

  const state = staty({
    inc: 0,
    inner: {
      readonly: true
    },
    arr: [1, 2],
    map: new Map(),
    set: new Set(),
    ref: ref({ val: 'test' })
  }, {
    onReadOnly (_, prop) {
      calls.push(prop)
    }
  })

  const snap = snapshot(state)

  snap.inc++
  snap.inner.readonly = false
  snap.arr.push(3)
  snap.map.set('key', 'val')
  snap.set.add('val')
  snap.ref.val = 'i can change'
  assert.equal(snap.ref, { val: 'i can change' })

  const warn = console.warn.bind(console)
  console.warn = () => {
    calls.push('global')
  }
  snapshot(staty({})).change = true
  console.warn = warn
  assert.equal(calls, ['inc', 'readonly', 'push', 'set', 'add', 'global'])
})

test('map collections', () => {
  let calls = 0

  const state = staty({
    map: new Map()
  })

  subscribe(state, () => {
    calls++
  })

  state.map.set(0, 'test')
  state.map.set(0, 'test') // should not do anything
  state.map.delete(0)
  state.map.delete(0) // should not do anything
  const inner = {
    val: 0
  }
  state.map.set('inner', inner)
  state.map.set('inner', inner) // should not do anything
  state.map.get('inner').val++
  state.map.delete('inner')
  state.map.set('inner', staty({
    val: 0
  }))
  state.map.get('inner').val++
  state.map.delete('inner')

  assert.is(state.map.size, 0)

  state.map.set(0, 'test')
  state.map.set(1, 'test')
  state.map.set('2', 'test')

  assert.is(state.map.size, 3)
  state.map.clear()
  assert.is(state.map.size, 0)

  state.map.set(0, 'test')
  state.map.set(1, 'test')
  state.map.set('2', 'test')

  assert.is(state.map.size, 3)
  action(() => {
    state.map.clear()
  })
  assert.is(state.map.size, 0)

  assert.is(calls, 16)
})

test('set collections', () => {
  let calls = 0

  const state = staty({
    set: new Set()
  })

  subscribe(state, () => {
    calls++
  })

  state.set.delete('test') // should not do anything
  state.set.add('test')
  state.set.delete('test')
  let inner = {
    val: 0
  }
  state.set.add(inner)
  state.set.add(inner) // duplicate should not do anything
  state.set.values().next().value.val++
  state.set.delete(inner)
  inner = staty({
    val: 0
  })
  state.set.add(inner)
  inner.val++
  state.set.delete(inner)
  assert.is(state.set.size, 0)

  state.set.add(0)
  state.set.add(0) // duplicate should not do anything
  state.set.add(1)
  state.set.add('2')

  assert.is(state.set.size, 3)
  state.set.clear()
  assert.is(state.set.size, 0)

  state.set.add(0)
  state.set.add(1)
  state.set.add('2')

  assert.is(state.set.size, 3)
  action(() => {
    state.set.clear()
  })
  assert.is(state.set.size, 0)

  assert.is(calls, 16)
})

test('rollback with map collections', () => {
  const state = staty({
    map: new Map()
  })

  const inner = {
    val: 'test'
  }

  state.map.set('inner', inner)

  subscribe(state, () => {
    throw new Error('test')
  }, {
    before: true
  })

  try {
    state.map.delete('inner')
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'test')
    assert.is(state.map.size, 1)
  }

  try {
    state.map.set('inner', { other: 'val' })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'test')
    assert.is(state.map.size, 1)
  }
})

test('rollback with set collections', () => {
  const state = staty({
    set: new Set()
  })

  const inner = {
    val: 'test'
  }

  state.set.add(inner)

  subscribe(state, () => {
    throw new Error('test')
  }, {
    before: true
  })

  try {
    state.set.delete(inner)
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'test')
    assert.is(state.set.size, 1)
  }

  try {
    state.set.add({ other: 'val' })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.is(err.message, 'test')
    assert.is(state.set.size, 1)
  }
})

test('ref cache snapshot', () => {
  const state = staty({
    ref: ref('test', null, true),
    refWithMap: ref('test', (val) => ({ val }), true)
  })

  assert.equal(snapshot(state), {
    ref: 'test',
    refWithMap: {
      val: 'test'
    }
  })
})

test('valid only staty snapshot', () => {
  try {
    snapshot({})
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
  }
})

test.run()
