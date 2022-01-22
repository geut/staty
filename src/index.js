// inspired by: https://github.com/pmndrs/valtio

import debug from 'debug'

import { configureSnapshot } from './snapshot.js'
import { batchHandler } from './batch.js'
import { TransactionManager } from './transaction.js'

const log = debug('staty')

const kStaty = Symbol('staty')
const kController = Symbol('controler')
const kNoProp = Symbol('noprop')

const noop = () => {}

const transactions = new TransactionManager()

function _subscribe (state, handler, prop, opts = {}) {
  const { snapshot, transactionFilter = null } = opts

  handler = { run: handler, snapshot, transactionFilter }

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
  constructor (target) {
    this.target = target
    this.subscriptions = {
      default: new Set(),
      props: new Map()
    }
    this.cacheSnapshot = null
    this.propsBinded = new Map()
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

  run (prop) {
    const subscriptions = this.subscriptions
    this.cacheSnapshot = null

    const transaction = transactions.current

    if (prop) {
      for (const [key, handlers] of subscriptions.props.entries()) {
        if (prop.startsWith(`${key}.`) || prop === key) {
          Array.from(handlers.values()).forEach(handler => {
            if (!transaction) {
              this._run(handler)
              return
            }

            if (transaction.valid(handler)) {
              transaction.add(handler)
            }
          })
        }
      }
    }

    Array.from(subscriptions.default.values()).forEach(handler => {
      if (!transaction) {
        this._run(handler)
        return
      }

      if (transaction.valid(handler)) {
        transaction.add(handler)
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
  }

  _run (handler) {
    try {
      handler.run(handler.snapshot())
    } catch (err) {
      console.error(err)
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
 * @returns {Proxy}
 */
export function staty (target, opts = {}) {
  const { targetType = Object.prototype.toString.call(target), convertMapItems = true } = opts

  if (!isValidForStaty(targetType)) throw new Error('the `target` is not valid for staty')

  const internal = new InternalStaty(target)

  if (convertMapItems && isMapCollection(targetType)) {
    const newTarget = new Map()
    target.forEach((val, key) => {
      const type = Object.prototype.toString.call(val)
      if (!val?.[kStaty] && isValidForStaty(type)) {
        val = staty(val, { targetType: type, convertMapItems })
      }
      const parentProp = typeof key === 'string' ? key : kNoProp
      val?.[kStaty]?.addParent?.(parentProp, internal)
      newTarget.set(key, val)
    })
    target = newTarget
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
          value = staty(value, { targetType: type, convertMapItems })
          valueStaty = value[kStaty]
        }
        valueStaty.addParent(prop, internal)
        Reflect.set(target, prop, value)
        return value
      }

      if (type === '[object Function]') {
        if (isArray(targetType) && ['splice', 'unshift', 'pop', 'shift', 'reverse', 'sort'].includes(prop)) {
          if (!internal.patched) {
            internal.patched = true
            return (...args) => {
              transaction(() => {
                state[prop](...args)
              })
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
              internal.run()
            }
          }

          if (prop === 'delete') {
            return (val) => {
              if (!target.delete(val)) return
              val?.[kStaty]?.delParent?.(kNoProp, internal)
              internal.run()
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
              if (convertMapItems && !val?.[kStaty] && isValidForStaty(type)) {
                val = staty(val, { targetType: type, convertMapItems })
              }
              target.set(key, val)
              const parentProp = typeof key === 'string' ? key : kNoProp
              oldVal?.[kStaty]?.delParent?.(parentProp, internal)
              val?.[kStaty]?.addParent?.(parentProp, internal)
              internal.run(key)
            }
          }

          if (prop === 'delete') {
            return (key) => {
              const val = target.get(key)
              if (!target.delete(key)) return
              const parentProp = typeof key === 'string' ? key : kNoProp
              val?.[kStaty]?.delParent?.(parentProp, internal)
              internal.run(key)
            }
          }

          return value.bind(target)
        }
      }

      return value
    },
    set (target, prop, value) {
      const oldValue = Reflect.get(target, prop)
      const oldValueStaty = oldValue?.[kStaty]
      let valueStaty = value?.[kStaty]

      // start ref support
      if (oldValueStaty?.isRef) {
        if (oldValue === value || oldValueStaty.value === value) return true
        if ((!value || !valueStaty?.isRef)) {
          oldValueStaty.value = value
          internal.run(prop)
        }
        return true
      }

      if (valueStaty?.isRef) {
        if (Reflect.set(target, prop, value)) {
          internal.run(prop)
        }
        return true
      }
      // end ref support

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      if (!valueStaty && isValidForStaty(type)) {
        value = staty(value, { targetType: type, convertMapItems })
        valueStaty = value[kStaty]
      }

      if (Reflect.set(target, prop, value)) {
        oldValueStaty?.delParent(prop, internal)
        valueStaty?.addParent(prop, internal)
        internal.run(prop)
        return true
      }

      return false
    },

    deleteProperty (target, prop) {
      const oldValue = Reflect.get(target, prop)
      oldValue?.[kStaty]?.delParent?.(prop, internal)

      if (Array.isArray(target)) return Reflect.deleteProperty(target, prop)
      if (!(prop in target)) return false
      if (Reflect.deleteProperty(target, prop)) {
        internal.run(prop)
        return true
      }
    }
  })

  internal.proxy = state

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
  let { filter: prop, snapshot: userSnapshot, batch = false, transactionFilter } = opts

  userSnapshot = userSnapshot === false ? noop : (userSnapshot || (() => snapshot(state, prop)))

  const subscribeProps = {
    snapshot: userSnapshot,
    transactionFilter
  }

  if (batch) {
    const userHandler = handler
    handler = (snapshot) => batchHandler(userHandler, snapshot)
  }

  if (!prop) {
    return _subscribe(state, handler, null, subscribeProps)
  }

  if (!Array.isArray(prop)) {
    return _subscribe(state, snapshot => {
      return handler(snapshot)
    }, prop, subscribeProps)
  }

  let scheduled = false
  const unsubscribes = prop.map(prop => {
    return _subscribe(state, (snapshot) => {
      if (!batch) return handler(snapshot)

      if (!scheduled) {
        scheduled = true
        queueMicrotask(() => {
          scheduled = false
        })
        return handler(snapshot)
      }
    }, prop, subscribeProps)
  })

  return () => unsubscribes.forEach(unsubscribe => unsubscribe())
}

/**
 * Add a ref to another object
 *
 * @param {*} value
 * @param {(ref: *) => *} [mapSnapshot]
 * @returns {{ __ref: * }}
 */
export function ref (value, mapSnapshot) {
  const internal = {
    isRef: true,
    cacheSnapshot: null,
    mapSnapshot,
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
 * Create a transaction
 * @param {function} handler
 * @param {string} transactionName
 */
export function transaction (handler, transactionName) {
  const transaction = transactions.create(transactionName)
  try {
    handler()
  } finally {
    transaction.done()
  }
}

const _snapshot = configureSnapshot({ kStaty, log })

/**
 * Creates a snapshot of the state
 *
 * @param {Proxy} state
 * @param {(String|Array<String>)} [prop]
 * @returns {Object}
 */
export function snapshot (state, prop) {
  return _snapshot(state, prop)
}
