import { InternalStaty, rawValue } from './internal.js'
import { actions, action } from '../action.js'

export class SetStaty extends InternalStaty {
  constructor (...args) {
    super(...args)

    this._reverse = new Map(this.source.entries())
    this._addHandler = this._addHandler.bind(this)
    this._deleteHandler = this._deleteHandler.bind(this)
    this._clearHandler = this._clearHandler.bind(this)
    this._hasHandler = this._hasHandler.bind(this)
  }

  forEach (callback) {
    this.target.forEach(callback)
  }

  onGetSnapshot (target, prop, value) {
    if (prop === 'add' || prop === 'delete' || prop === 'clear') {
      this.onReadOnly(target, prop, value)
      return () => {}
    }
    if (typeof value === 'function') return value.bind(target)
    return value
  }

  clone () {
    const x = this.target
    const tmp = new Set()
    x.forEach(function (val) {
      tmp.add(rawValue(val))
    })
    return tmp
  }

  handler (value, prop) {
    if (prop === 'add') return this._addHandler
    if (prop === 'delete') return this._deleteHandler
    if (prop === 'clear') return this._clearHandler
    if (prop === 'has') return this._hasHandler
    if (typeof value === 'function') return value.bind(this.target)
    return value
  }

  reflectSet (target, prop, value, useBaseReflect) {
    if (useBaseReflect) return Reflect.set(target, prop, value)
    this._reverse.set(prop, value)
    return !!target.add(value)
  }

  reflectHas (target, prop, useBaseReflect) {
    if (useBaseReflect) return Reflect.has(target, prop)
    return this._reverse.has(prop)
  }

  reflectGet (target, prop, useBaseReflect) {
    if (useBaseReflect) return Reflect.get(target, prop)
    if (this._reverse.has(prop)) return prop
    return undefined
  }

  reflectDeleteProperty (target, prop, useBaseReflect) {
    if (useBaseReflect) return Reflect.deleteProperty(target, prop)
    const val = this._reverse.get(prop)
    this._reverse.delete(prop)
    return target.delete(val)
  }

  _addHandler (val) {
    return this._set(this.target, val, val)
  }

  _deleteHandler (val) {
    return this._deleteProperty(this.target, val)
  }

  _hasHandler (val) {
    return this._reverse.has(val)
  }

  _clearHandler () {
    if (actions.current) {
      this.target.forEach(value => {
        this._deleteHandler(value)
      })
    } else {
      action(() => {
        this.target.forEach(value => {
          this._deleteHandler(value)
        })
      })
    }
  }
}
