// inspired by: https://github.com/pmndrs/valtio

/**
 * @typedef {Record<string, { $$count: number; $$props?: Listeners }>} Listeners
 */

/**
 * @callback UnsubscribeFunction
 */

import { batchHandler } from './batch.js'
import { kStaty, isValidForStaty } from './constants.js'
import { RefStaty } from './types/ref.js'
import { createProxy } from './proxy.js'

function _subscribe (state, handler, prop, opts = {}) {
  const { filter = null, before = false } = opts

  handler = { run: handler, filter, before }

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

const defaultOnReadOnly = (target, prop, value) => {
  console.warn('snapshots are readonly', { target, prop, value })
}

const CACHE = new WeakMap()

/**
 * Creates a new proxy-state
 *
 * @template {object} T
 * @param {T} target
 * @param {object} [opts]
 * @param {(target: T, prop: unknown, value: unknown) => {}} [opts.onReadOnly]
 * @param {(state: T) => {}} [opts.onAction]
 * @returns {T}
 */
export function staty (target, opts = {}) {
  const {
    onReadOnly = defaultOnReadOnly,
    onAction
  } = opts

  if (target?.[kStaty]) return target

  const targetType = Object.prototype.toString.call(target)

  if (!isValidForStaty(targetType)) {
    throw new Error('the `target` is not valid for staty')
  }

  if (CACHE.has(/** @type {object} */(target))) {
    return CACHE.get(/** @type {object} */(target))
  }

  const proxyOptions = { onReadOnly }

  const state = createProxy(proxyOptions, target, undefined, undefined, targetType)

  if (onAction) {
    onAction(state)
    state[kStaty].setOnAction(onAction)
  }

  CACHE.set(/** @type {object} */(target), state)

  return state
}

/**
 * Get subscription listeners count
 *
 * @template {object} T
 * @param {T} state
 * @returns {{ $$count: number, $$props: Listeners }}
 */
export function listeners (state) {
  if (!state || !state[kStaty] || state[kStaty].isRef) throw new Error('state is not valid')

  const internal = state[kStaty]

  const subscriptions = internal.subscriptions

  /** @type {Listeners} */
  const props = {}

  let count = subscriptions.default.size

  subscriptions.props.forEach((listeners, prop) => {
    props[prop] = { $$count: listeners.size }
    count += listeners.size
  })

  internal.forEach((val, prop) => {
    if (val?.[kStaty] && !val[kStaty].isRef) {
      const res = listeners(val)
      count += res.$$count
      if (props[prop]) {
        props[prop].$$count += res.$$count
        props[prop].$$props = res.$$props
      } else {
        props[prop] = res
      }
    }
  })

  return {
    $$count: count,
    $$props: props
  }
}

/**
 * Subscribe for changes in the state
 *
 * @template {object} T
 * @param {T} state
 * @param {() => void} handler
 * @param {Object} [opts]
 * @param {string|string[]} [opts.props] props to subscribe
 * @param {(actionName: string) => boolean} [opts.filter] subscribe only for specific action names
 * @param {boolean} [opts.batch=false] execute in batch turning the subscription into async
 * @param {boolean} [opts.autorun=false] run immediately
 * @param {boolean} [opts.before=false] run before finish the action. A good place to validate changes
 * @returns {UnsubscribeFunction}
 */
export function subscribe (state, handler, opts = {}) {
  if (!state || !state[kStaty] || state[kStaty].isRef) throw new Error('state is not valid')

  const {
    props,
    filter,
    batch = false,
    autorun = false,
    before = false
  } = opts

  if (batch && before) throw new Error('batch=true with before=true is not possible')
  if (autorun && before) throw new Error('autorun=true with before=true is not possible')

  const subscribeProps = {
    filter,
    before
  }

  if (batch) {
    const userHandler = handler
    handler = () => batchHandler(userHandler)
  }

  let dispose
  if (!props) {
    dispose = _subscribe(state, handler, null, subscribeProps)
    if (autorun) handler()
    return dispose
  }

  if (!Array.isArray(props)) {
    dispose = _subscribe(state, () => {
      return handler()
    }, props, subscribeProps)
    if (autorun) handler()
    return dispose
  }

  let scheduled = false
  const unsubscribes = props.map(prop => {
    return _subscribe(state, () => {
      if (!batch) return handler()

      if (!scheduled) {
        scheduled = true
        queueMicrotask(() => {
          scheduled = false
        })
        return handler()
      }
    }, prop, subscribeProps)
  })

  if (autorun) handler()
  return () => unsubscribes.forEach(unsubscribe => unsubscribe())
}

/**
 * Add a ref to another object
 *
 * @template {object} T
 * @template {object | T} M
 * @param {T} value
 * @param {(ref: T) => M} [mapSnapshot]
 * @param {boolean} [cache] enable cache
 * @returns {T & RefStaty}
 */
export function ref (value, mapSnapshot, cache) {
  const internal = new RefStaty(value, mapSnapshot, cache)

  const obj = new Proxy(internal, {
    get (_, prop) {
      if (prop === kStaty) return internal
      if (typeof internal.value[prop] === 'function') return (...args) => internal.value[prop](...args)
      return internal.value[prop]
    },
    getOwnPropertyDescriptor (_, prop) {
      try {
        return Reflect.getOwnPropertyDescriptor(internal.value, prop)
      } catch (err) {
        return undefined
      }
    },
    ownKeys () {
      try {
        return Reflect.ownKeys(internal.value)
      } catch (err) {
        return []
      }
    }
  })

  return /** @type {T & RefStaty} */(obj)
}

// /**
//  * @param {Proxy<} target
//  * @returns {Proxy<target> is target}
//  */
// export function release (target) {
//   return new Proxy(target, {
//     get: () => {
//       return null
//     }
//   })
// }

export { snapshot } from './snapshot.js'
export { action } from './action.js'
