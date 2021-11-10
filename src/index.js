// inspired by: https://github.com/pmndrs/valtio

import delve from 'dlv'
import debug from 'debug'

import { configureSnapshot } from './snapshot.js'

const log = debug('staty')
log.log = (...args) => {
  console.groupCollapsed(...args)
  console.trace('Trace')
  console.groupEnd()
}

const kStaty = Symbol('staty')
const kTarget = Symbol('target')
const kSubscriptions = Symbol('subscribe')
const kParent = Symbol('parents')
const kIsRef = Symbol('isRef')
const kCacheSnapshot = Symbol('cacheSnapshot')
const kSchedule = Symbol('schedule')
const kUnderProp = Symbol('underProp')
const kProcessBatch = Symbol('processBatch')

const _snapshot = configureSnapshot({ kTarget, kIsRef, kCacheSnapshot })

function _subscribe (state, handler, prop, opts = {}) {
  const { ignore = null } = opts

  handler = { run: handler, ignore }

  if (prop) {
    if (!state[kSubscriptions].props.has(prop)) {
      state[kSubscriptions].props.set(prop, new Set())
    }
    state[kSubscriptions].props.get(prop).add(handler)
  } else {
    state[kSubscriptions].default.add(handler)
  }

  return () => {
    if (prop) {
      state[kSubscriptions].props.get(prop).delete(handler)
    } else {
      state[kSubscriptions].default.delete(handler)
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
  const subscriptions = {
    default: new Set(),
    props: new Map()
  }

  const batch = new Set()
  const parent = { value: null }
  const cacheSnapshot = { value: null }
  let underProp

  function processBatch (opts = {}) {
    try {
      const jobs = Array.from(batch.values())
      batch.clear()
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
    for (const [key, handlers] of state[kSubscriptions].props.entries()) {
      if (prop.startsWith(key)) {
        batch.add(handlers)
      }
    }

    batch.add(state[kSubscriptions].default)

    state[kCacheSnapshot].value = null

    const parent = state[kParent]
    if (parent.value && !batch.has(parent.value)) {
      schedule(parent.value, `${state[kUnderProp]}.${prop}`, { batch })
    }

    if (init) {
      if (log.enabled) {
        log(`schedule${':' + prop} %O`, {
          state: snapshot(state),
          prop,
          subscriptionProps: Array.from(subscriptions.props.keys())
        })
      }

      queueMicrotask(() => {
        processBatch(batch)
      })
    }
  }

  const state = new Proxy(target, {
    get (target, prop) {
      if (prop === kStaty) return true
      if (prop === kTarget) return target
      if (prop === kSubscriptions) return subscriptions
      if (prop === kParent) return parent
      if (prop === kCacheSnapshot) return cacheSnapshot
      if (prop === kUnderProp) return underProp
      if (prop === kProcessBatch) return processBatch
      if (prop === kSchedule) {
        if (parent.value) return parent.value[kSchedule]
        return schedule
      }

      if (!(Reflect.has(target, prop))) return

      let value = Reflect.get(target, prop)

      if (value === null || value === undefined) return value

      // ref
      if (value[kIsRef]) return value.__ref

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        let parent = value[kParent]

        if (parent && parent.value && parent.value !== state) throw new Error('A staty object cannot have multiple parents')

        if (!parent) {
          value = staty(value)
          value[kUnderProp] = prop
          Reflect.set(target, prop, value)
          parent = value[kParent]
        }

        parent.value = state

        return value
      }

      return value
    },
    set (target, prop, value) {
      if (prop === kUnderProp) {
        underProp = value
        return true
      }

      const oldValue = Reflect.get(target, prop)

      // start ref support
      if (value && value[kIsRef]) {
        if (Reflect.set(target, prop, value)) {
          value[kCacheSnapshot].value = null
          state[kSchedule](state, prop, true)
        }
        return true
      }

      if (oldValue && oldValue[kIsRef]) {
        if (oldValue === value || oldValue.__ref === value) return true
        if ((!value || !value[kIsRef]) && Reflect.set(oldValue, '__ref', value)) {
          oldValue[kCacheSnapshot].value = null
          state[kSchedule](state, prop, true)
        }
        return true
      }

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        let parent = value[kParent]

        if (parent && parent.value && parent.value !== state) throw new Error('A staty object cannot have multiple parents')

        if (!parent) {
          value = staty(value)
          value[kUnderProp] = prop
          parent = value[kParent]
        }

        parent.value = state
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
  if (!state[kSubscriptions]) throw new Error('state is not valid')

  const result = {
    '*': state[kSubscriptions].default.size
  }

  let count = state[kSubscriptions].default.size
  state[kSubscriptions].props.forEach((listeners, prop) => {
    count += listeners.size
    result[prop] = listeners.size
  })

  for (const prop in state) {
    if (!state[prop]) continue

    if (state[prop][kSubscriptions]) {
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
 * @param {(ref: *) => *} [snapshot]
 * @returns {{ __ref: * }}
 */
export function ref (value, snapshot) {
  const obj = { __ref: value }
  Object.defineProperty(obj, kIsRef, { value: true, writable: false, enumerable: false })
  Object.defineProperty(obj, kCacheSnapshot, { value: { value: null }, writable: true, enumerable: false })
  Object.defineProperty(obj, 'snapshot', { value: snapshot, writable: false, enumerable: false })
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
