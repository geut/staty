import { kEmpty, kInternalAction, kStaty, isValidForStaty } from '../constants.js'
import { actions } from '../action.js'
import { cloneStructures } from '../clone.js'
import { createProxy } from '../proxy.js'

function toString (value) {
  const type = typeof value
  if (type === 'string') return value
  if (type === 'object') return '?'
  if (type === 'symbol') return value.toString()
  return String(value)
}

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
  constructor (source, target, { onReadOnly }) {
    this.source = source
    this.target = target
    this.onReadOnly = onReadOnly
    this.subscriptions = {
      default: new Set(),
      props: new Map()
    }
    this.propsBinded = new Map()
    this.isRef = false
    this.onGetSnapshot = this.onGetSnapshot.bind(this)
    this._snapshot = kEmpty
    /** @type {Proxy<typeof target>} */
    this.proxy = null
  }

  forEach (callback) {
    for (const prop in this.target) {
      callback(this.target[prop], prop)
    }
  }

  setProxy (proxy) {
    this.proxy = proxy
  }

  setOnAction (onAction) {
    this.onAction = {
      run: actionName => onAction(this.proxy, actionName),
      before: true
    }
  }

  getValueByProp (prop) {
    const value = this.reflectGet(this.target, prop)
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

  handler (value, prop) {
    return value
  }

  checkCircularReference (prop, value) {
    prop = toString(prop)

    if (this === value) {
      const err = new Error('circular reference detected')
      // @ts-ignore
      err.location = `^${prop}`
      // @ts-ignore
      err.value = value.getSnapshot()
      throw err
    }

    this.propsBinded.forEach((parents, propBinded) => {
      propBinded = toString(propBinded)
      parents.forEach(parent => {
        parent.checkCircularReference(`${propBinded}.${prop}`, value)
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
    const parents = this.propsBinded.get(prop)
    parents.delete(parent)
    if (parents.size === 0) this.propsBinded.delete(prop)
  }

  run (prop, rollback) {
    let action = actions.current

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
        propBinded = toString(propBinded)
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

  get (target, prop) {
    return this._get(target, prop, true)
  }

  set (target, prop, value) {
    return this._set(target, prop, value, true)
  }

  deleteProperty (target, prop) {
    return this._deleteProperty(target, prop, true)
  }

  reflectSet (target, prop, value, useBaseReflect) {
    return Reflect.set(target, prop, value)
  }

  reflectHas (target, prop, useBaseReflect) {
    return Reflect.has(target, prop)
  }

  reflectGet (target, prop, useBaseReflect) {
    return Reflect.get(target, prop)
  }

  reflectDeleteProperty (target, prop, useBaseReflect) {
    return Reflect.deleteProperty(target, prop)
  }

  _get (target, prop, useBaseReflect) {
    if (prop === kStaty) return this

    const value = this.reflectGet(target, prop, useBaseReflect)
    if (value === null || value === undefined) return value

    const valueStaty = value?.[kStaty]

    if (valueStaty?.isRef) {
      return valueStaty.value
    }

    return this.handler(value, prop)
  }

  _set (target, prop, value, useBaseReflect) {
    const internal = this
    const newProp = !internal.reflectHas(target, prop, useBaseReflect)
    const oldValue = internal.reflectGet(target, prop, useBaseReflect)
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
      if (internal.reflectSet(target, prop, value, useBaseReflect)) {
        internal.run(prop, () => {
          internal.clearSnapshot()
          if (newProp) return internal.reflectDeleteProperty(target, prop, useBaseReflect)
          internal.reflectSet(target, prop, oldValue, useBaseReflect)
        })
      }
      return true
    }
    // end ref support

    if (oldValue === value || (oldValueStaty && oldValueStaty.source === value)) return true

    let checkCircularReference = true
    let type
    if (!valueStaty) {
      type = Object.prototype.toString.call(value)
      if (isValidForStaty(type)) {
        value = createProxy({ onReadOnly: internal.onReadOnly }, value, null, null, type)
        valueStaty = value[kStaty]
        checkCircularReference = false
      } else {
        internal.reflectSet(target, prop, value, useBaseReflect)

        internal.run(prop, () => {
          internal.clearSnapshot()

          if (newProp) {
            internal.reflectDeleteProperty(target, prop, useBaseReflect)
            return
          }

          internal.reflectSet(target, prop, oldValue, useBaseReflect)
        })

        return true
      }
    }

    if (oldValueStaty !== valueStaty) {
      valueStaty?.addParent(prop, internal, checkCircularReference)
      oldValueStaty?.delParent(prop, internal)
    }

    internal.reflectSet(target, prop, value, useBaseReflect)

    internal.run(prop, () => {
      internal.clearSnapshot()

      if (oldValueStaty !== valueStaty) {
        oldValueStaty?.addParent(prop, internal)
        valueStaty?.delParent(prop, internal)
      }

      if (newProp) {
        internal.reflectDeleteProperty(target, prop, useBaseReflect)
        return
      }

      internal.reflectSet(target, prop, oldValue, useBaseReflect)
    })

    return true
  }

  _deleteProperty (target, prop, useBaseReflect) {
    const internal = this
    if (!internal.reflectHas(target, prop, useBaseReflect)) return true

    const oldValue = internal.reflectGet(target, prop, useBaseReflect)
    oldValue?.[kStaty]?.delParent?.(prop, internal)

    if (internal.reflectDeleteProperty(target, prop, useBaseReflect)) {
      internal.run(prop, () => {
        internal.clearSnapshot()
        oldValue?.[kStaty]?.addParent?.(prop, internal)
        internal.reflectSet(target, prop, oldValue, useBaseReflect)
      })
    }
    return true
  }
}
