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
const kIsRef = Symbol('isref')
const kCacheSnapshot = Symbol('cachesnapshot')
const kSchedule = Symbol('kSchedule')

const _snapshot = configureSnapshot({ kTarget, kIsRef, kCacheSnapshot })

function _subscribe (state, handler, prop) {
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

function _parseProp (state, prop) {
  prop = prop.split('.')

  const value = delve(state, prop)
  if (value && typeof value === 'object' && value[kSubscriptions]) {
    return { state: value }
  } else {
    const parent = prop.length === 1 ? state : delve(state, prop.slice(0, -1))
    return { state: parent, prop: prop.slice(-1)[0] }
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

  function schedule (state, prop, init) {
    batch.add(state)
    state[kCacheSnapshot].value = null

    const parent = state[kParent]
    if (parent.value && !batch.has(parent.value)) {
      schedule(parent.value)
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
        try {
          const batchToProcess = Array.from(batch.values())
          batch.clear()
          state[kSubscriptions].props.get(prop)?.forEach(handler => handler())
          batchToProcess.forEach(batchState => {
            batchState[kSubscriptions].default.forEach(handler => handler())
          })
        } catch (err) {
          console.error(err)
        }
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
          Reflect.set(target, prop, value)
          parent = value[kParent]
        }

        parent.value = state

        return value
      }

      return value
    },
    set (target, prop, value) {
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
          parent = value[kParent]
        }

        parent.value = state
      }

      if (Reflect.set(target, prop, value)) {
        state[kSchedule](state, prop, true)
        return true
      }

      return false
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
 * @returns {UnsubscribeFunction}
 */
export function subscribe (state, handler) {
  return _subscribe(state, handler)
}

/**
 * Subscribe for changes in a specific prop of the state
 *
 * @param {Proxy} state
 * @param {(String|Array<String>)} prop
 * @param {function} handler
 * @returns {UnsubscribeFunction}
 */
export function subscribeByProp (state, prop, handler) {
  if (!Array.isArray(prop)) {
    const { state: newState, prop: newProp } = _parseProp(state, prop, handler)
    return _subscribe(newState, () => {
      if (!newProp) return handler(snapshot(newState))
      handler(snapshot(newState, newProp))
    }, newProp)
  }

  let scheduled = false
  const unsubscribes = prop.map(p => {
    const { state: newState, prop: newProp } = _parseProp(state, p, handler)
    return _subscribe(newState, () => {
      if (!scheduled) {
        scheduled = true
        handler(snapshot(state, prop))

        queueMicrotask(() => {
          scheduled = false
        })
      }
    }, newProp)
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
export const snapshot = (state, prop) => {
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
export const ref = (value, snapshot) => {
  const obj = { __ref: value }
  Object.defineProperty(obj, kIsRef, { value: true, writable: false, enumerable: false })
  Object.defineProperty(obj, kCacheSnapshot, { value: { value: null }, writable: true, enumerable: false })
  Object.defineProperty(obj, 'snapshot', { value: snapshot, writable: false, enumerable: false })
  return obj
}
