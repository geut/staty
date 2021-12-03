// inspired by: https://github.com/pmndrs/valtio

import debug from 'debug'
import { promise as fastq } from 'fastq'

import { configureSnapshot } from './snapshot.js'

const log = debug('staty')

const kStaty = Symbol('staty')
const kSchedule = Symbol('schedule')
const kProcessBatch = Symbol('processBatch')
const kController = Symbol('controler')

const _snapshot = configureSnapshot({ kStaty, log })

function _subscribe (state, handler, prop, opts = {}) {
  const { ignore = null, isAsync = false } = opts

  handler = { run: handler, ignore, isAsync, snapshot: opts.snapshot }

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
    this.queue = fastq(this._processBatch.bind(this), 1)
    this.jobs = new Set()
  }

  refValue (prop) {
    if (this.target?.[prop]?.[kStaty]?.isRef) {
      return this.target?.[prop]
    }

    return this.proxy[prop]
  }

  async processBatch (opts = {}) {
    try {
      const asyncBatch = []
      const syncBatch = []
      Array.from(this.batch.values()).forEach(handlers => {
        Array.from(handlers.values()).forEach(handler => {
          if (opts.patch && handler.ignore && handler.ignore.test(opts.patch)) return
          if (handler.isAsync) {
            asyncBatch.push({ run: handler.run, snapshot: handler.snapshot() })
          } else {
            syncBatch.push({ run: handler.run, snapshot: handler.snapshot() })
          }
        })
      })
      this.batch.clear()
      if (asyncBatch.length === 0 && syncBatch.length === 0) return
      const job = this.queue.push({ asyncBatch, syncBatch }).finally(() => {
        this.jobs.delete(job)
      })
      this.jobs.add(job)
      return job
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
        this.processBatch()
      })
    }
  }

  async drained () {
    await new Promise(resolve => setTimeout(resolve, 0))
    return Promise.all(Array.from(this.jobs.values()))
  }

  async _processBatch ({ asyncBatch, syncBatch }) {
    await Promise.all(asyncBatch.map(handler => handler.run(handler.snapshot).catch(err => console.error(err))))
    syncBatch.forEach(handler => {
      try {
        handler.run(handler.snapshot)
      } catch (err) {
        console.error(err)
      }
    })
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
  return _subscribe(state, handler, null, {
    isAsync: handler[Symbol.toStringTag] === 'AsyncFunction',
    snapshot: () => snapshot(state),
    ...opts
  })
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
  opts = { isAsync: handler[Symbol.toStringTag] === 'AsyncFunction', ...opts }

  opts.snapshot = () => snapshot(state, prop)

  if (!Array.isArray(prop)) {
    return _subscribe(state, snapshot => {
      return handler(snapshot)
    }, prop, opts)
  }

  let scheduled = false
  const unsubscribes = prop.map(prop => {
    return _subscribe(state, (snapshot) => {
      if (!scheduled) {
        scheduled = true
        queueMicrotask(() => {
          scheduled = false
        })
        return handler(snapshot)
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
 * @returns {Promise<*>}
 */
export async function patch (state, handler, name = '*') {
  // force to run subscribers
  await state[kProcessBatch]()
  const result = handler(state)
  await state[kProcessBatch]({ patch: name })
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
 * @returns {Promise}
 */
export async function inactive (state) {
  const controller = state?.[kController]
  if (!controller) throw new Error('invalid state')
  if (controller.actives === 0) return
  controller.actives--
  if (controller.actives === 0) {
    await controller.processBatch()
  }
}

/**
 * Force update
 * @param {*} state
 * @returns {Promise}
 */
export async function forceUpdate (state) {
  const controller = state?.[kController]
  if (!controller) throw new Error('invalid state')
  await controller.processBatch()
}

/**
 * Wait for the state be drained
 * @param {*} state
 * @returns {Promise}
 */
export async function drained (state) {
  const controller = state?.[kController]
  if (!controller) throw new Error('invalid state')
  return controller.drained()
}
