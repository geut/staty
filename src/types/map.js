import { InternalStaty, rawValue } from './internal.js'
import { actions, action } from '../action.js'

export class MapStaty extends InternalStaty {
  constructor (...args) {
    super(...args)

    this._setHandler = this._setHandler.bind(this)
    this._deleteHandler = this._deleteHandler.bind(this)
    this._clearHandler = this._clearHandler.bind(this)
  }

  onGetSnapshot (target, prop, value) {
    if (prop === 'set' || prop === 'delete' || prop === 'clear') {
      this.onReadOnly(target, prop, value)
      return () => {}
    }
    if (typeof value === 'function') return value.bind(target)
    return value
  }

  clone () {
    const x = this.target
    const tmp = new Map()
    x.forEach(function (val, key) {
      tmp.set(key, rawValue(val))
    })
    return tmp
  }

  reflectSet (target, prop, value, useBaseReflect) {
    if (useBaseReflect) return Reflect.set(target, prop, value)
    return !!target.set(prop, value)
  }

  reflectHas (target, prop, useBaseReflect) {
    if (useBaseReflect) return Reflect.has(target, prop)
    return target.has(prop)
  }

  reflectGet (target, prop, useBaseReflect) {
    if (useBaseReflect) return Reflect.get(target, prop)
    return target.get(prop)
  }

  reflectDeleteProperty (target, prop, useBaseReflect) {
    if (useBaseReflect) return Reflect.deleteProperty(target, prop)
    return target.delete(prop)
  }

  handler (value, prop) {
    if (prop === 'set') return this._setHandler
    if (prop === 'delete') return this._deleteHandler
    if (prop === 'clear') return this._clearHandler
    if (typeof value === 'function') return value.bind(this.target)
    return value
  }

  _setHandler (key, val) {
    return this._set(this.target, key, val)
  }

  _deleteHandler (key) {
    return this._deleteProperty(this.target, key)
  }

  _clearHandler () {
    if (actions.current) {
      this.target.forEach((_, key) => {
        this._deleteHandler(key)
      })
    } else {
      action(() => {
        this.target.forEach((_, key) => {
          this._deleteHandler(key)
        })
      })
    }
  }
}
