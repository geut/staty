import { kEmpty, kInternalAction, kNoProp, kStaty } from '../constants.js'
import { actions } from '../action.js'
import { cloneStructures } from '../clone.js'

export const rawValue = (value) => {
  if (!value || typeof value !== 'object') return value

  const staty = value?.[kStaty]
  if (staty) {
    if (staty.isRef) return value
    return staty.getSnapshot()
  }

  return cloneStructures(value, Object.prototype.toString.call(value))
}

export class InternalStaty {
  constructor (target, { onReadOnly }) {
    this.target = target
    this.onReadOnly = onReadOnly
    this.subscriptions = {
      default: new Set(),
      props: new Map()
    }
    this.propsBinded = new Map()
    this.isRef = false
    this._snapshot = kEmpty
    this.onGetSnapshot = this.onGetSnapshot.bind(this)
  }

  setOnAction (onAction) {
    this.onAction = {
      run: actionName => onAction(this.proxy, actionName),
      before: true
    }
  }

  getValueByProp (prop) {
    const value = Reflect.get(this.target, prop)
    const staty = value?.[kStaty]
    if (staty && staty.isRef) return staty.getSnapshot()
    return value
  }

  getSnapshot () {
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

  checkCircularReference (prop, value) {
    prop = prop === kNoProp ? '<*>' : prop

    if (this === value) {
      const err = new Error('circular reference detected')
      err.location = `^${prop}`
      err.value = value.getSnapshot()
      throw err
    }

    this.propsBinded.forEach((parents, propBinded) => {
      propBinded = propBinded === kNoProp ? '<*>' : propBinded
      parents.forEach(parent => {
        parent.checkCircularReference(prop ? `${propBinded}.${prop}` : propBinded, value)
      })
    })
  }

  addParent (prop, parent, checkCircularReference) {
    let parents
    if (this.propsBinded.has(prop)) {
      parents = this.propsBinded.get(prop)
    } else {
      parents = new Set()
      this.propsBinded.set(prop, parents)
    }

    if (checkCircularReference) {
      parent.checkCircularReference(prop, this)
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
        propBinded = propBinded === kNoProp ? '<*>' : propBinded
        parents.forEach(parent => {
          parent.run(prop ? `${propBinded}.${prop}` : propBinded)
        })
      })

      actionInitiator && action.done()
    } catch (err) {
      actionInitiator && action.cancel()
      throw err
    }
  }
}
