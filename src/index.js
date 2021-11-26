// inspired by: https://github.com/pmndrs/valtio

import debug from 'debug'

import { configureSnapshot } from './snapshot.js'

const log = debug('staty')

const kStaty = Symbol('staty')
const kSchedule = Symbol('schedule')
const kProcessBatch = Symbol('processBatch')
const kController = Symbol('controler')

const _snapshot = configureSnapshot({ kStaty, log })

function _subscribe (state, handler, prop, opts = {}) {
  const { ignore = null } = opts

  handler = { run: handler, ignore }

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
    this.batch = new Set()
    this.parent = null
    this.cacheSnapshot = null
    this.prop = null
    this.refValue = this.refValue.bind(this)
    this.processBatch = this.processBatch.bind(this)
    this.schedule = this.schedule.bind(this)
    this.actives = 0
  }

  refValue (prop) {
    if (this.target?.[prop]?.[kStaty]?.isRef) {
      return this.target?.[prop]
    }

    return this.proxy[prop]
  }

  processBatch (opts = {}) {
    try {
      const jobs = Array.from(this.batch.values())
      this.batch.clear()
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

  schedule (state, prop, init) {
    const batch = this.batch
    const subscriptions = state[kStaty].subscriptions

    for (const [key, handlers] of subscriptions.props.entries()) {
      if (prop.startsWith(`${key}.`) || prop === key) {
        batch.add(handlers)
      }
    }

    batch.add(subscriptions.default)

    state[kStaty].cacheSnapshot = null

    const parent = state[kStaty].parent
    if (parent && !batch.has(parent)) {
      this.schedule(parent, `${state[kStaty].prop}.${prop}`)
    }

    if (init && this.actives === 0) {
      queueMicrotask(() => {
        if (log.enabled) log('run %s %O', prop, snapshot(state))
        this.processBatch(batch)
      })
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
      if (prop === kProcessBatch) {
        if (internal.parent) return internal.parent[kProcessBatch]
        return internal.processBatch
      }
      if (prop === kSchedule) {
        if (internal.parent) return internal.parent[kSchedule]
        return internal.schedule
      }
      if (prop === kController) {
        if (internal.parent) return internal.parent[kController]
        return internal
      }

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

        if (parent && parent !== state) throw new Error('A staty object cannot have multiple parents')

        if (!parent) {
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
          state[kSchedule](state, prop, true)
        }
        return true
      }

      if (value && value?.[kStaty]?.isRef) {
        if (Reflect.set(target, prop, value)) {
          value[kStaty].cacheSnapshot = null
          state[kSchedule](state, prop, true)
        }
        return true
      }
      // end ref support

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      if (type === '[object Object]' || type === '[object Array]') {
        const parent = value?.[kStaty]?.parent
        if (parent && parent !== state) throw new Error('A staty object cannot have multiple parents')

        if (!parent) {
          value = staty(value)
          value[kStaty].prop = prop
          value[kStaty].parent = state
        }
      }

      if (Reflect.set(target, prop, value)) {
        if (oldValue?.[kStaty]) {
          oldValue[kStaty].parent = null
        }

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

/**
 * Mark as an active mutation to block the scheduler subscribe until is inactive
 * @param {*} state
 */
export function active (state) {
  const controller = state?.[kController]
  if (!controller) throw new Error('invalid state')
  controller.actives++
}

/**
 * Inactive mutation
 * @param {*} state
 */
export function inactive (state) {
  const controller = state?.[kController]
  if (!controller) throw new Error('invalid state')
  controller.actives--
  if (controller.actives === 0) {
    controller.processBatch()
  }
}
