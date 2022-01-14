// inspired by: https://github.com/pmndrs/valtio

import debug from 'debug'

import { configureSnapshot } from './snapshot.js'

const log = debug('staty')

const kStaty = Symbol('staty')
const kController = Symbol('controler')

const noop = () => {}

const _snapshot = configureSnapshot({ kStaty, log })

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

function _dlv (obj, key) {
  let p
  key = key.split ? key.split('.') : key
  for (p = 0; p < key.length; p++) {
    if (obj) {
      const k = key[p]
      if (obj?.[kStaty]?.refValue) {
        obj = obj[kStaty].refValue(k)
      } else {
        obj = obj[k]
      }
    } else {
      return obj
    }
  }
  return obj
}

function _snapshotProp (state, prop) {
  const value = _dlv(state, prop)

  if (!value || typeof value !== 'object') {
    return value
  }

  if (value[kStaty]) {
    return _snapshot(value)
  }

  return _dlv(_snapshot(state), prop)
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
    this.batches = new Map()
    this.parent = null
    this.cacheSnapshot = null
    this.prop = null
    this.refValue = this.refValue.bind(this)
    this.transactions = []
  }

  get controller () {
    let controller = this.parent ? this.parent[kStaty] : this
    while (controller.parent) {
      controller = controller.parent[kStaty]
    }
    return controller
  }

  refValue (prop) {
    if (this.target?.[prop]?.[kStaty]?.isRef) {
      return this.target?.[prop]
    }

    return this.proxy[prop]
  }

  run (prop, controller = this.controller) {
    const subscriptions = this.subscriptions
    this.cacheSnapshot = null

    const transaction = controller.transactions[controller.transactions.length - 1]
    const transactionName = transaction ? transaction.name : '*'

    for (const [key, handlers] of subscriptions.props.entries()) {
      if (prop.startsWith(`${key}.`) || prop === key) {
        Array.from(handlers.values()).forEach(handler => {
          if (handler.transactionFilter && handler.transactionFilter.test(transactionName)) return
          this._run(handler, transaction)
        })
      }
    }

    Array.from(subscriptions.default.values()).forEach(handler => {
      if (handler.transactionFilter && handler.transactionFilter.test(transactionName)) return
      this._run(handler, transaction)
    })

    if (this.parent) {
      this.parent[kStaty].run(`${this.prop}.${prop}`, controller)
    }
  }

  batch (handler, snapshot) {
    const controller = this.controller

    if (controller.batches.size > 0) {
      controller.batches.set(handler, snapshot)
      return
    }

    controller.batches.set(handler, snapshot)

    queueMicrotask(() => {
      controller.batches.forEach((snapshot, handler) => {
        try {
          handler(snapshot)
        } catch (err) {
          console.error(err)
        }
      })
      controller.batches.clear()
    })
  }

  createTransaction (name = '*') {
    const transaction = { handlers: new Set(), name }
    this.transactions.push(transaction)
    return () => {
      this.transactions.pop()
      transaction.handlers.forEach(handler => this._run(handler))
    }
  }

  _run (handler, transaction) {
    if (transaction) {
      transaction.handlers.add(handler)
      return
    }

    try {
      handler.run(handler.snapshot())
    } catch (err) {
      console.error(err)
    }
  }
}

/**
 * Creates a new proxy-state
 *
 * @param {*} target
 * @returns {Proxy}
 */
export function staty (target = {}) {
  const internal = new InternalStaty(target)

  const state = new Proxy(target, {
    get (target, prop) {
      if (prop === kStaty) return internal
      if (prop === kController) return internal.controller

      if (!(Reflect.has(target, prop))) return

      let value = Reflect.get(target, prop)

      if (value === null || value === undefined) return value

      const internalStaty = value?.[kStaty]

      // ref
      if (internalStaty?.isRef) {
        return internalStaty.value
      }

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        const parent = internalStaty?.parent

        if (parent && parent !== state) {
          internalStaty.prop = prop
          internalStaty.parent = state
        } else if (!parent) {
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
      if (oldValue && oldValue?.[kStaty]?.isRef) {
        const ref = oldValue?.[kStaty]
        if (oldValue === value || ref.value === value) return true
        if ((!value || !value?.[kStaty]?.isRef)) {
          ref.value = value
          ref.cacheSnapshot = null
          state[kStaty].run(prop)
        }
        return true
      }

      if (value && value?.[kStaty]?.isRef) {
        if (Reflect.set(target, prop, value)) {
          value[kStaty].cacheSnapshot = null
          state[kStaty].run(prop)
        }
        return true
      }
      // end ref support

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        const parent = value?.[kStaty]?.parent

        if (parent && parent !== state) {
          value[kStaty].prop = prop
          value[kStaty].parent = state
        } else if (!parent) {
          value = staty(value)
          value[kStaty].prop = prop
          value[kStaty].parent = state
        }
      }

      if (Reflect.set(target, prop, value)) {
        if (oldValue?.[kStaty]) {
          oldValue[kStaty].parent = null
        }

        state[kStaty].run(prop)
        return true
      }

      return false
    },

    deleteProperty (target, prop) {
      if (Array.isArray(target)) return Reflect.deleteProperty(target, prop)
      if (!(prop in target)) return false
      if (Reflect.deleteProperty(target, prop)) {
        state[kStaty].run(prop)
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
    handler = (snapshot) => state[kController].batch(userHandler, snapshot)
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
 * @param {Proxy} state
 * @param {function} handler
 * @param {string} transactionName
 */
export function transaction (state, handler, transactionName) {
  const controller = state?.[kController]
  if (!controller) throw new Error('invalid state')

  const release = controller.createTransaction(transactionName)
  try {
    handler()
  } catch (err) {
    console.error(err)
  } finally {
    release()
  }
}
