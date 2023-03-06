
// inspired by: https://github.com/pmndrs/valtio
import { batchHandler } from './batch.js'
import { kStaty, isObject, isArray, isMap, isSet } from './constants.js'
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

/**
 * Creates a new proxy-state
 *
 * @param {*} target
 * @param {object} [opts]
 * @param {(target: any, prop: any, value: any) => {}} [opts.onReadOnly]
 * @param {(state: Proxy) => {}} [opts.onAction]
 * @returns {Proxy}
 */
export function staty (target, opts = {}) {
  const {
    targetType = Object.prototype.toString.call(target),
    onReadOnly = defaultOnReadOnly,
    onAction
  } = opts

  if (target?.[kStaty]) return target

  if (targetType !== isObject && targetType !== isArray && targetType !== isMap && targetType !== isSet) {
    throw new Error('the `target` is not valid for staty')
  }

  const proxyOptions = { onReadOnly }

  const state = createProxy(proxyOptions, target)

  if (onAction) {
    onAction(state)
    state[kStaty].setOnAction(onAction)
  }

  return state
}

/**
 * @typedef {{ listeners: { default: Number, props: Object }, count }} ListenersReport
 */

/**
 * Get subscription listeners count
 *
 * @param {Proxy} state
 * @returns {ListenersReport}
 */
export function listeners (state) {
  if (!state || !state[kStaty] || state[kStaty].isRef) throw new Error('state is not valid')

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
 * @param {*} value
 * @param {(ref: *) => *} [mapSnapshot]
 * @param {boolean} [cache] enable cache
 * @returns {Proxy}
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

  return obj
}

export { snapshot } from './snapshot.js'
export { action } from './action.js'
