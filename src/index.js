// inspired by: https://github.com/pmndrs/valtio

import delve from 'dlv'
import debug from 'debug'

import { configureSnapshot } from './snapshot.js'

const log = debug('staty')
// log.log = (...args) => {
//   console.groupCollapsed(...args)
//   console.trace('Trace')
//   console.groupEnd()
// }

const kStaty = Symbol('staty')
const kSchedule = Symbol('schedule')
const kProcessBatch = Symbol('processBatch')

const _snapshot = configureSnapshot(kStaty, log)

function _subscribe (state, handler, prop, opts = {}) {
  const { ignore = null } = opts

  handler = { run: handler, ignore }

  const subscriptions = state[kStaty].subscriptions

  if (prop) {
    if (!subscriptions.props.has(prop)) {
      subscriptions.props.set(prop, new Set())
    }
    subscriptions.props.get(prop).add(handler)
  } else {
    subscriptions.default.add(handler)
  }

  return () => {
    if (prop) {
      subscriptions.props.get(prop).delete(handler)
    } else {
      subscriptions.default.delete(handler)
    }
  }
}

function _snapshotProp (state, prop) {
  const value = delve(state, prop)

  if (!value || typeof value !== 'object') {
    return value
  }

  if (value[kStaty]) {
    return _snapshot(value)
  }

  return _snapshot(state)[prop]
}

/**
 * @callback UnsubscribeFunction
 */

/**
 * Creates a new proxy-state
 *
 * @param {*} target
 * @returns {Proxy}
 */
export function staty (target = {}) {
  const internal = {
    target,
    subscriptions: {
      default: new Set(),
      props: new Map()
    },
    batch: new Set(),
    parent: null,
    cacheSnapshot: null,
    prop: null
  }

  function processBatch (opts = {}) {
    try {
      const jobs = Array.from(internal.batch.values())
      internal.batch.clear()
      jobs.forEach(handlers => {
        handlers.forEach(handler => {
          if (opts.patch && handler.ignore && handler.ignore.test(opts.patch)) return
          handler.run()
        })
      })
    } catch (err) {
      console.error(err)
    }
  }

  function schedule (state, prop, init) {
    const batch = internal.batch
    const subscriptions = state[kStaty].subscriptions

    for (const [key, handlers] of subscriptions.props.entries()) {
      if (prop.startsWith(`${key}.`) || prop === key) {
        batch.add(handlers)
      }
    }

    batch.add(subscriptions.default)

    state[kStaty].cacheSnapshot = null

    const parent = state[kStaty].parent
    if (parent && !batch.has(parent)) {
      schedule(parent, `${state[kStaty].prop}.${prop}`)
    }

    if (init) {
      queueMicrotask(() => {
        if (log.enabled) log('run %s %O', prop, snapshot(state))
        processBatch(batch)
      })
    }
  }

  const state = new Proxy(target, {
    get (target, prop) {
      if (prop === kStaty) return internal
      if (prop === kProcessBatch) {
        if (internal.parent) return internal.parent[kProcessBatch]
        return processBatch
      }
      if (prop === kSchedule) {
        if (internal.parent) return internal.parent[kSchedule]
        return schedule
      }

      if (!(Reflect.has(target, prop))) return

      let value = Reflect.get(target, prop)

      if (value === null || value === undefined) return value

      const internalStaty = value?.[kStaty]

      // ref
      if (internalStaty?.isRef) {
        internalStaty.prop = prop
        return value.__ref
      }

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        const parent = internalStaty?.parent

        if (parent && parent !== state) throw new Error('A staty object cannot have multiple parents')

        if (!parent) {
          value = staty(value)
          value[kStaty].prop = prop
          value[kStaty].parent = state
          Reflect.set(target, prop, value)
        }

        return value
      }

      return value
    },
    set (target, prop, value) {
      const oldValue = Reflect.get(target, prop)

      // start ref support
      if (value && value?.[kStaty]?.isRef) {
        if (Reflect.set(target, prop, value)) {
          value[kStaty].cacheSnapshot = null
          value[kStaty].prop = prop
          state[kSchedule](state, prop, true)
        }
        return true
      }

      if (oldValue && oldValue?.[kStaty]?.isRef) {
        if (oldValue === value || oldValue.__ref === value) return true
        if ((!value || !value?.[kStaty]?.isRef) && Reflect.set(oldValue, '__ref', value)) {
          oldValue[kStaty].cacheSnapshot = null
          state[kSchedule](state, prop, true)
        }
        return true
      }

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        const parent = value?.[kStaty]?.parent
        if (parent && parent !== state) throw new Error('A staty object cannot have multiple parents')

        if (!parent) {
          value = staty(value)
          value[kStaty].prop = prop
          value[kStaty].parent = state
        }
      }

      if (oldValue?.[kStaty]) {
        oldValue[kStaty].parent = null
      }

      if (Reflect.set(target, prop, value)) {
        state[kSchedule](state, prop, true)
        return true
      }

      return false
    },

    deleteProperty (target, prop) {
      if (!(prop in target)) return false
      if (Reflect.deleteProperty(target, prop)) {
        state[kSchedule](state, prop, true)
        return true
      }
    }
  })

  return state
}

/**
 * Get subscription listeners count
 *
 * @param {Proxy} state
 * @returns {{ listeners: { default: Number, props: Object }, count }}
 */
export function listeners (state) {
  if (!state[kStaty]) throw new Error('state is not valid')

  const subscriptions = state[kStaty].subscriptions

  const result = {
    '*': subscriptions.default.size
  }

  let count = subscriptions.default.size
  subscriptions.props.forEach((listeners, prop) => {
    count += listeners.size
    result[prop] = listeners.size
  })

  for (const prop in state) {
    if (!state[prop]) continue

    if (state[prop][kStaty]) {
      const value = listeners(state[prop])
      result[prop] = value.listeners
      count += value.count
      continue
    }
  }

  return { listeners: result, count }
}

/**
 * Subscribe for changes in the state
 *
 * @param {Proxy} state
 * @param {function} handler
 * @param {Object} opts
 * @returns {UnsubscribeFunction}
 */
export function subscribe (state, handler, opts = {}) {
  return _subscribe(state, handler, null, opts)
}

/**
 * Subscribe for changes in a specific prop of the state
 *
 * @param {Proxy} state
 * @param {(String|Array<String>)} prop
 * @param {function} handler
 * @param {Object} opts
 * @returns {UnsubscribeFunction}
 */
export function subscribeByProp (state, prop, handler, opts = {}) {
  if (!Array.isArray(prop)) {
    return _subscribe(state, () => {
      handler(snapshot(state, prop))
    }, prop, opts)
  }

  let scheduled = false
  const props = prop
  const unsubscribes = prop.map(prop => {
    return _subscribe(state, () => {
      if (!scheduled) {
        scheduled = true
        handler(snapshot(state, props))

        queueMicrotask(() => {
          scheduled = false
        })
      }
    }, prop, opts)
  })

  return () => unsubscribes.forEach(unsubscribe => unsubscribe())
}

/**
 * Creates a snapshot of the state
 *
 * @param {Proxy} state
 * @param {(String|Array<String>)} [prop]
 * @returns {Object}
 */
export function snapshot (state, prop) {
  if (Array.isArray(prop)) {
    return prop.map(p => _snapshotProp(state, p))
  }

  if (typeof prop === 'string') {
    return _snapshotProp(state, prop)
  }

  return _snapshot(state)
}

/**
 * Add a ref to another object
 *
 * @param {*} value
 * @param {(ref: *) => *} [mapSnapshot]
 * @returns {{ __ref: * }}
 */
export function ref (value, mapSnapshot) {
  const obj = { __ref: value }
  Object.defineProperty(obj, kStaty, {
    value: {
      isRef: true,
      cacheSnapshot: null,
      mapSnapshot,
      prop: null
    },
    writable: true,
    enumerable: false
  })
  return obj
}

/**
 * Change values of the state
 * @param {*} state
 * @param {Function} handler
 */
export function patch (state, handler, name = '*') {
  // force to run subscribers
  state[kProcessBatch]()
  const result = handler(state)
  state[kProcessBatch]({ patch: name })
  return result
}
