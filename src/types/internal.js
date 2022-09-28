import { kEmpty, kInternalAction, kNoProp, kStaty } from '../constants.js'
import { actions } from '../action.js'
import { cloneStructures } from '../clone.js'

export const rawValue = (value) => {
  if (!value) return value

  const staty = value?.[kStaty]
  if (staty) {
    if (staty.isRef) return value
    return staty.snapshot
  }

  const tmp = cloneStructures(value, Object.prototype.toString.call(value))
  if (tmp) return tmp
  return value
}

export class InternalStaty {
  constructor (target, { onReadOnly, onErrorSubscription, onAction }) {
    this.target = target
    this.onReadOnly = onReadOnly
    this.onErrorSubscription = onErrorSubscription
    if (onAction) {
      this.onAction = {
        run: actionName => onAction(this.proxy, actionName),
        before: true
      }
    }
    this.subscriptions = {
      default: new Set(),
      props: new Map()
    }
    this.propsBinded = new Map()
    this.isRef = false
    this._snapshot = kEmpty
    this.onGetSnapshot = this.onGetSnapshot.bind(this)
  }

  get snapshot () {
    if (this._snapshot !== kEmpty) return this._snapshot
    const internal = this
    const snapshot = this._snapshot = new Proxy(this.clone(), {
      get (target, prop) {
        const value = Reflect.get(target, prop)
        if (prop === 'constructor') return value
        if (value?.[kStaty]) {
          return value[kStaty].getSnapshot()
        }
        return internal.onGetSnapshot(target, prop, value)
      },
      set (target, prop, value) {
        internal.onReadOnly(target, prop, value)
        return true
      }
    })
    return snapshot
  }

  getSnapshot () {
    return this.snapshot
  }

  onGetSnapshot (target, prop, value) {
    return value
  }

  clone () {
    let k
    const x = this.target
    const tmp = Object.create(Object.getPrototypeOf(x))
    for (k in x) {
      tmp[k] = rawValue(x[k])
    }
    return tmp
  }

  clearSnapshot () {
    this._snapshot = kEmpty
  }

  handler (value) {
    return value
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

  run (prop, rollback) {
    let action = actions.current
    if (action?.inRollback) return

    this.clearSnapshot()

    let actionInitiator = false
    if (rollback && (!action || action.name === kInternalAction)) {
      action = actions.create(kInternalAction)
      actionInitiator = true
    }

    try {
      if (rollback) action.pushHistory(rollback)

      if (this.onAction) {
        action.add(this.onAction)
      }

      const subscriptions = this.subscriptions

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

      actionInitiator && action.done()
    } catch (err) {
      actionInitiator && action.cancel()
      throw err
    }
  }
}
