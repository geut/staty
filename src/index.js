// inspired by: https://github.com/pmndrs/valtio

import { batchHandler } from './batch.js'
import { ActionManager } from './action.js'
import { kStaty, kController, kNoProp, kEmpty } from './symbols.js'
import { snapshot as getSnapshot } from './snapshot.js'

const actions = new ActionManager()

const kInternalAction = Symbol('internalAction')

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

/**
 * @callback UnsubscribeFunction
 */

class InternalStaty {
  constructor (target, disableCache = false) {
    this.target = target
    this.subscriptions = {
      default: new Set(),
      props: new Map()
    }
    this.cacheSnapshot = kEmpty
    this.propsBinded = new Map()
    this.disableCache = disableCache
    this.refValue = this.refValue.bind(this)
  }

  addParent (prop, parent) {
    let parents
    if (this.propsBinded.has(prop)) {
      parents = this.propsBinded.get(prop)
    } else {
      parents = new Set()
      this.propsBinded.set(prop, parents)
    }

    parents.add(parent)
  }

  delParent (prop, parent) {
    if (!this.propsBinded.has(prop)) return
    const parents = this.propsBinded.get(prop)
    parents.delete(parent)
    if (parents.size === 0) this.propsBinded.delete(prop)
  }

  refValue (prop) {
    if (this.target?.[prop]?.[kStaty]?.isRef) {
      return this.target?.[prop]
    }

    return this.proxy[prop]
  }

  run (prop, rollback) {
    let action = actions.current
    let actionInitiator = false
    if (rollback && (!action || action.name === kInternalAction)) {
      action = actions.create(kInternalAction)
      actionInitiator = true
    }

    try {
      if (action.inRollback) return

      if (rollback) action.pushHistory(rollback)

      const subscriptions = this.subscriptions
      this.cacheSnapshot = kEmpty

      if (prop) {
        for (const [key, handlers] of subscriptions.props.entries()) {
          if (prop.startsWith(`${key}.`) || prop === key) {
            Array.from(handlers.values()).forEach(handler => {
              if (action.valid(handler)) {
                action.add(handler)
              }
            })
          }
        }
      }

      Array.from(subscriptions.default.values()).forEach(handler => {
        if (action.valid(handler)) {
          action.add(handler)
        }
      })

      this.propsBinded.forEach((parents, propBinded) => {
        const parentProp = prop && propBinded !== kNoProp
          ? `${propBinded}.${prop}`
          : propBinded !== kNoProp
            ? propBinded
            : null
        parents.forEach(parent => parent.run(parentProp))
      })
    } catch (err) {
      actionInitiator && action.cancel()
      throw err
    } finally {
      actionInitiator && action.done()
    }
  }
}

const isArray = type => type === '[object Array]'
const isSetCollection = type => type === '[object Set]'
const isMapCollection = type => type === '[object Map]'
const isValidForStaty = type => type === '[object Object]' || isArray(type) || isSetCollection(type) || isMapCollection(type)

/**
 * Creates a new proxy-state
 *
 * @param {*} target
 * @param {Object} [opts]
 * @param {boolean} [opts.disableCache=false] disable cache for snapshots
 * @returns {Proxy}
 */
export function staty (target, opts = {}) {
  const { targetType = Object.prototype.toString.call(target), disableCache = false } = opts

  if (!isValidForStaty(targetType)) throw new Error('the `target` is not valid for staty')

  const internal = new InternalStaty(target, disableCache)

  if (isMapCollection(targetType)) {
    target.forEach((val, key) => {
      const type = Object.prototype.toString.call(val)

      if (!val?.[kStaty] && isValidForStaty(type)) {
        val = staty(val, { targetType: type, disableCache })
      }

      if (val?.[kStaty]) {
        const parentProp = typeof key === 'string' ? key : kNoProp
        val?.[kStaty]?.addParent?.(parentProp, internal)
        target.set(key, val)
      }
    })
  }

  const state = new Proxy(target, {
    get (target, prop) {
      if (prop === kStaty) return internal
      if (prop === kController) return internal.controller

      if (!(Reflect.has(target, prop))) return

      let value = Reflect.get(target, prop)

      if (value === null || value === undefined) return value

      let valueStaty = value?.[kStaty]

      // ref
      if (valueStaty?.isRef) {
        return valueStaty.value
      }

      const type = Object.prototype.toString.call(value)
      if (isValidForStaty(type)) {
        if (!valueStaty) {
          value = staty(value, { targetType: type, disableCache })
          valueStaty = value[kStaty]
        }
        valueStaty.addParent(prop, internal)
        Reflect.set(target, prop, value)
        return value
      }

      if (type === '[object Function]') {
        if (isArray(targetType) && ['splice', 'unshift', 'push', 'pop', 'shift', 'reverse', 'sort'].includes(prop)) {
          if (!internal.patched) {
            internal.patched = true
            return (...args) => {
              if (actions.current) {
                state[prop](...args)
              } else {
                action(() => {
                  state[prop](...args)
                })
              }
            }
          }
          internal.patched = false
          return value
        }

        if (isSetCollection(targetType)) {
          if (prop === 'add') {
            return (val) => {
              if (target.has(val)) return
              target.add(val)
              val?.[kStaty]?.addParent?.(kNoProp, internal)
              const oldCache = internal.cacheSnapshot
              const prevStaty = val?.[kStaty]
              internal.run(null, () => {
                internal.cacheSnapshot = oldCache
                target.delete(val)
                prevStaty?.delParent?.(kNoProp, internal)
              })
            }
          }

          if (prop === 'delete') {
            return (val) => {
              if (!target.delete(val)) return
              val?.[kStaty]?.delParent?.(kNoProp, internal)
              const oldCache = internal.cacheSnapshot
              const prevStaty = val?.[kStaty]
              internal.run(null, () => {
                internal.cacheSnapshot = oldCache
                target.add(val)
                prevStaty?.addParent?.(kNoProp, internal)
              })
            }
          }

          return value.bind(target)
        }

        if (isMapCollection(targetType)) {
          if (prop === 'set') {
            return (key, val) => {
              const oldVal = target.get(key)
              if (oldVal && (oldVal === val || oldVal?.[kStaty]?.target === val)) return
              const type = Object.prototype.toString.call(val)
              if (!val?.[kStaty] && isValidForStaty(type)) {
                val = staty(val, { targetType: type, disableCache })
              }
              target.set(key, val)
              const parentProp = typeof key === 'string' ? key : kNoProp
              oldVal?.[kStaty]?.delParent?.(parentProp, internal)
              val?.[kStaty]?.addParent?.(parentProp, internal)

              const oldCache = internal.cacheSnapshot
              const prevStaty = {
                oldVal: oldVal?.[kStaty],
                val: val?.[kStaty]
              }
              internal.run(key, () => {
                internal.cacheSnapshot = oldCache
                target.delete(key)
                prevStaty.oldVal?.addParent?.(parentProp, internal)
                prevStaty.val?.delParent?.(parentProp, internal)
              })
            }
          }

          if (prop === 'delete') {
            return (key) => {
              const val = target.get(key)
              if (!target.delete(key)) return
              const parentProp = typeof key === 'string' ? key : kNoProp
              val?.[kStaty]?.delParent?.(parentProp, internal)

              const oldCache = internal.cacheSnapshot
              const prevStaty = val?.[kStaty]
              internal.run(key, () => {
                internal.cacheSnapshot = oldCache
                target.set(key, val)
                prevStaty?.addParent?.(parentProp, internal)
              })
            }
          }

          return value.bind(target)
        }
      }

      return value
    },
    set (target, prop, value) {
      const cacheSnapshot = internal.cacheSnapshot
      const newProp = !Reflect.has(target, prop)
      const oldValue = Reflect.get(target, prop)
      const oldValueStaty = oldValue?.[kStaty]
      let valueStaty = value?.[kStaty]

      // start ref support
      if (oldValueStaty?.isRef) {
        if (oldValue === value || oldValueStaty.value === value) return true
        if ((!value || !valueStaty?.isRef)) {
          const oldRealValue = oldValueStaty.value
          oldValueStaty.value = value
          internal.run(prop, () => {
            internal.cacheSnapshot = cacheSnapshot
            oldValueStaty.value = oldRealValue
          })
        }
        return true
      }

      if (valueStaty?.isRef) {
        if (Reflect.set(target, prop, value)) {
          internal.run(prop, () => {
            internal.cacheSnapshot = cacheSnapshot
            if (newProp) return Reflect.deleteProperty(target, prop)
            Reflect.set(target, prop, oldValue)
          })
        }
        return true
      }
      // end ref support

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      if (!valueStaty && isValidForStaty(type)) {
        value = staty(value, { targetType: type, disableCache })
        valueStaty = value[kStaty]
      }

      if (Reflect.set(target, prop, value)) {
        if (oldValueStaty !== valueStaty) {
          oldValueStaty?.delParent(prop, internal)
          valueStaty?.addParent(prop, internal)
        }

        internal.run(prop, () => {
          internal.cacheSnapshot = cacheSnapshot

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
      if (!Reflect.has(target, prop)) return

      const cacheSnapshot = internal.cacheSnapshot
      const oldValue = Reflect.get(target, prop)
      oldValue?.[kStaty]?.delParent?.(prop, internal)

      if (Array.isArray(target)) return Reflect.deleteProperty(target, prop)
      if (!(prop in target)) return false
      if (Reflect.deleteProperty(target, prop)) {
        internal.run(prop, () => {
          internal.cacheSnapshot = cacheSnapshot
          oldValue?.[kStaty]?.addParent?.(prop, internal)
          Reflect.set(target, prop, oldValue)
        })
        return true
      }
    }
  })

  internal.proxy = state

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
 * @param {() => void} handler
 * @param {Object} [opts]
 * @param {string|string[]} [opts.props] props to subscribe
 * @param {boolean} [opts.batch=false] execute in batch turning the subscription into async
 * @param {(actionName: string) => boolean} [opts.filter] subscribe only for specific action names
 * @param {boolean} [opts.autorun=false] run immediately
 * @param {boolean} [opts.before=false] run before finish the action. A good place to validate changes.
 * @returns {UnsubscribeFunction}
 */
export function subscribe (state, handler, opts = {}) {
  const { props, batch = false, filter, autorun = false, before = false } = opts

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
 * @param {boolean} [disableCache=false] disable cache for snapshots
 * @returns {Proxy}
 */
export function ref (value, mapSnapshot, disableCache = false) {
  const internal = {
    isRef: true,
    cacheSnapshot: kEmpty,
    mapSnapshot,
    disableCache,
    value
  }

  const obj = new Proxy({}, {
    get (_, prop) {
      if (prop === kStaty) return internal
      return internal.value[prop]
    }
  })

  return obj
}

/**
 * Create a action
 * @param {function} handler
 * @param {string} actionName
 */
export function action (handler, actionName) {
  const action = actions.create(actionName)
  try {
    handler(() => action.cancel())
  } catch (err) {
    action.cancel()
    throw err
  } finally {
    action.done()
  }
}

/**
 * Creates a snapshot of the state
 *
 * @param {Proxy} state
 * @param {(String|Array<String>)} [prop]
 * @param {boolean} [disableCache] disable cache for snapshots
 * @returns {Object}
 */
export function snapshot (state, prop, disableCache) {
  disableCache = !!actions.current || disableCache
  return getSnapshot(state, prop, disableCache)
}
