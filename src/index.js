// inspired by: https://github.com/pmndrs/valtio

import delve from 'dlv'
import { configureSnapshot } from './snapshot.js'

const kTarget = Symbol('target')
const kSubscriptions = Symbol('subscribe')
const kParents = Symbol('parents')
const kIsRef = Symbol('isref')
const kCacheSnapshot = Symbol('cachesnapshot')

const _snapshot = configureSnapshot({ kTarget, kIsRef, kCacheSnapshot })

const batch = new Set()

function schedule (state, init) {
  batch.add(state)
  state[kCacheSnapshot].value = null

  const parents = state[kParents]

  if (parents.size) {
    parents.forEach(parent => {
      if (!batch.has(parent)) schedule(parent)
    })
  }

  if (init) {
    queueMicrotask(() => {
      const batchToProcess = Array.from(batch.values())
      batch.clear()
      batchToProcess.forEach(batchState => {
        batchState[kSubscriptions].forEach(handler => handler())
      })
    })
  }
}

function _subscribe (state, handler) {
  state[kSubscriptions].set(handler, handler)
  return () => {
    state[kSubscriptions].delete(handler)
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
  state = delve(state, prop)
  if (state && typeof state === 'object') {
    return _snapshot(state)
  }
  return state
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
  const subscriptions = new Map()
  const parents = new Set()
  const cacheSnapshot = { value: null }

  const state = new Proxy(target, {
    get (target, prop) {
      if (prop === kTarget) return target
      if (prop === kSubscriptions) return subscriptions
      if (prop === kParents) return parents
      if (prop === kCacheSnapshot) return cacheSnapshot

      if (!(Reflect.has(target, prop))) return

      let value = Reflect.get(target, prop)

      if (value === null || value === undefined) return value

      // ref
      if (value[kIsRef]) return value.__ref

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        let parents = value[kParents]
        if (!parents) {
          value = staty(value)
          Reflect.set(target, prop, value)
          parents = value[kParents]
        }
        parents.add(state)
        return value
      }

      return value
    },
    set (target, prop, value) {
      const oldValue = Reflect.get(target, prop)

      if (value && value[kIsRef]) {
        if (Reflect.set(target, prop, value)) {
          schedule(state, prop, true)
        }
        return true
      }

      // ref
      if (oldValue && oldValue[kIsRef]) {
        if (oldValue === value || oldValue.__ref === value) return true
        if (!value[kIsRef] && Reflect.set(oldValue, '__ref', value)) {
          schedule(state, prop, true)
        }
        return true
      }

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        let parents = value[kParents]
        if (!parents) {
          value = staty(value)
          parents = value[kParents]
        }
        parents.add(state)
      }

      if (Reflect.set(target, prop, value)) {
        schedule(state, prop, true)
        return true
      }

      return false
    }
  })

  return state
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
  let prevSnapshot

  if (!Array.isArray(prop)) {
    const { state: newState, prop: newProp } = _parseProp(state, prop, handler)
    prevSnapshot = newProp && snapshot(newState, newProp)
    return _subscribe(newState, () => {
      if (!newProp) handler(snapshot(newState))
      const nextSnapshot = snapshot(newState, newProp)
      if (prevSnapshot !== nextSnapshot) {
        prevSnapshot = nextSnapshot
        handler(nextSnapshot)
      }
    })
  }

  let scheduled = false
  prevSnapshot = snapshot(state, prop)
  const unsubscribes = prop.map(p => {
    const { state: newState } = _parseProp(state, p, handler)
    return _subscribe(newState, () => {
      if (!scheduled) {
        scheduled = true

        const nextSnapshot = snapshot(state, prop)

        let equal = true
        for (let i = 0; i < prop.length; i++) {
          if (prevSnapshot[i] !== nextSnapshot[i]) {
            equal = false
            break
          }
        }

        if (!equal) {
          prevSnapshot = nextSnapshot
          handler(nextSnapshot)
        }

        queueMicrotask(() => {
          scheduled = false
        })
      }
    })
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
  Object.defineProperty(obj, 'snapshot', { value: snapshot, writable: false, enumerable: false })
  return obj
}
