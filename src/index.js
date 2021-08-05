// inspired by: https://github.com/pmndrs/valtio

import delve from 'dlv'
import { configureSnapshot } from './snapshot.js'

const kTarget = Symbol('target')
const kSubscriptions = Symbol('subscribe')
const kParents = Symbol('parents')
const kIsRef = Symbol('kIsRef')

const _snapshot = configureSnapshot({ kTarget, kIsRef })

const batch = new Set()

function schedule (state, init) {
  batch.add(state)

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

function _subscribe (state, handler, prop) {
  let lastValue = prop && state[prop]
  state[kSubscriptions].set(handler, () => {
    if (!prop || lastValue !== state[prop]) {
      lastValue = state[prop]
      handler(state[prop])
    }
  })
  return () => {
    state[kSubscriptions].delete(handler)
  }
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

  const state = new Proxy(target, {
    get (target, prop) {
      if (prop === kTarget) return target
      if (prop === kSubscriptions) return subscriptions
      if (prop === kParents) return parents

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
  prop = Array.isArray(prop) || prop.split('.')

  const value = delve(state, prop)
  if (value && typeof value === 'object' && value[kSubscriptions]) {
    return _subscribe(value, handler)
  } else {
    const parent = prop.length === 1 ? state : delve(value, prop.slice(0, -1))
    return _subscribe(parent, handler, prop.slice(-1)[0])
  }
}

/**
 * Creates a snapshot of the state
 *
 * @param {Proxy} state
 * @param {(String|Array<String>)} [prop]
 * @returns {Object}
 */
export const snapshot = (state, prop) => {
  state = prop ? delve(state, prop) : state
  if (state && typeof state === 'object') {
    return _snapshot(state)
  }
  return state
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
