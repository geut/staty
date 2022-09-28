// inspired by: https://github.com/pmndrs/valtio

import { batchHandler } from './batch.js'
import { kStaty, isObject, isArray, isMap, isSet } from './constants.js'
import { clone } from './clone.js'
import { ObjectStaty } from './types/object.js'
import { ArrayStaty } from './types/array.js'
import { MapStaty } from './types/map.js'
import { SetStaty } from './types/set.js'
import { RefStaty } from './types/ref.js'

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

function _createProxy (target, internal) {
  const state = new Proxy(target, {
    get (target, prop) {
      if (prop === kStaty) return internal
      const value = Reflect.get(target, prop)
      if (value === null || value === undefined) return value

      const valueStaty = value?.[kStaty]

      if (valueStaty?.isRef) {
        return valueStaty.value
      }

      return internal.handler(value, prop)
    },
    set (target, prop, value) {
      const newProp = !Reflect.has(target, prop)
      const oldValue = Reflect.get(target, prop)
      const oldValueStaty = oldValue?.[kStaty]
      let valueStaty = value?.[kStaty]

      // start ref support
      if (oldValueStaty?.isRef && !valueStaty?.isRef) {
        if (oldValue === value || oldValueStaty.value === value) return true
        const oldRawValue = oldValueStaty.value
        oldValueStaty.setValue(value)
        internal.run(prop, () => {
          internal.clearSnapshot()
          oldValueStaty.setValue(oldRawValue)
        })
        return true
      } else if (valueStaty?.isRef) {
        if (Reflect.set(target, prop, value)) {
          internal.run(prop, () => {
            internal.clearSnapshot()
            if (newProp) return Reflect.deleteProperty(target, prop)
            Reflect.set(target, prop, oldValue)
          })
        }
        return true
      }
      // end ref support

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      if (!valueStaty && (type === isObject || type === isArray || type === isMap || type === isSet)) {
        value = staty(value, { targetType: type, onReadOnly: internal.onReadOnly, onErrorSubscription: internal.onErrorSubscription })
        valueStaty = value[kStaty]
      }

      if (Reflect.set(target, prop, value)) {
        if (oldValueStaty !== valueStaty) {
          oldValueStaty?.delParent(prop, internal)
          valueStaty?.addParent(prop, internal)
        }

        internal.run(prop, () => {
          internal.clearSnapshot()

          if (oldValueStaty !== valueStaty) {
            valueStaty?.delParent(prop, internal)
            oldValueStaty?.addParent(prop, internal)
          }

          if (newProp) {
            if (Array.isArray(target)) {
              const newArr = target.filter((_, i) => `${i}` !== prop)
              target.splice(0, target.length, ...newArr)
            } else {
              Reflect.deleteProperty(target, prop)
            }
            return
          }

          Reflect.set(target, prop, oldValue)
        })
      }

      return true
    },

    deleteProperty (target, prop) {
      if (!Reflect.has(target, prop)) return true

      const oldValue = Reflect.get(target, prop)
      oldValue?.[kStaty]?.delParent?.(prop, internal)

      if (Array.isArray(target)) return Reflect.deleteProperty(target, prop)
      if (Reflect.deleteProperty(target, prop)) {
        internal.run(prop, () => {
          internal.clearSnapshot()
          oldValue?.[kStaty]?.addParent?.(prop, internal)
          Reflect.set(target, prop, oldValue)
        })
      }
      return true
    }
  })

  internal.proxy = state

  return state
}

/**
 * Creates a new proxy-state
 *
 * @param {*} target
 * @param {object} [opts]
 * @param {(target: any, prop: any, value: any) => {}} [opts.onReadOnly]
 * @param {(err: Error) => {}} [opts.onErrorSubscription]
 * @param {(state: Proxy) => {}} [opts.onAction]
 * @returns {Proxy}
 */
export function staty (target, opts = {}) {
  const {
    targetType = Object.prototype.toString.call(target),
    onReadOnly = (target, prop, value) => {
      console.warn('snapshots are readonly', { target, prop, value })
    },
    onErrorSubscription = err => console.warn(err),
    onAction
  } = opts

  if (target?.[kStaty]) return target

  let InternalClass

  if (targetType === isObject) {
    InternalClass = ObjectStaty
  } else if (targetType === isArray) {
    InternalClass = ArrayStaty
  } else if (targetType === isMap) {
    InternalClass = MapStaty
  } else if (targetType === isSet) {
    InternalClass = SetStaty
  }

  if (!InternalClass) throw new Error('the `target` is not valid for staty')

  const state = clone(target, (val, type, parent) => {
    if (target === parent) return _createProxy(val, new InternalClass(val, { onReadOnly, onErrorSubscription, onAction }))
    return staty(val, { targetType: type, onReadOnly, onErrorSubscription })
  })

  if (onAction) onAction(state)

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
  if (!state[kStaty] || state[kStaty].isRef) throw new Error('state is not valid')

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
 * @param {(error: Error) => void} [opts.onError] error handler subscription. Works only with before=false
 * @returns {UnsubscribeFunction}
 */
export function subscribe (state, handler, opts = {}) {
  if (!state[kStaty] || state[kStaty].isRef) throw new Error('state is not valid')

  const {
    props,
    filter,
    batch = false,
    autorun = false,
    before = false,
    onError = state[kStaty].onErrorSubscription
  } = opts

  if (batch && before) throw new Error('batch=true with before=true is not possible')
  if (autorun && before) throw new Error('autorun=true with before=true is not possible')

  const subscribeProps = {
    filter,
    before
  }

  if (!before) {
    const prevHandler = handler
    handler = () => {
      try {
        prevHandler()
      } catch (err) {
        onError(err)
      }
    }
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
