import { InternalStaty, rawValue } from './internal.js'
import { kStaty, kNoProp, isValidForStaty, kEmpty } from '../constants.js'
import { staty } from '../index.js'
import { actions, action } from '../action.js'

export class SetStaty extends InternalStaty {
  constructor (...args) {
    super(...args)

    this._reverse = new Map()
    this._addHandler = this._addHandler.bind(this)
    this._deleteHandler = this._deleteHandler.bind(this)
    this._clearHandler = this._clearHandler.bind(this)
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
    if (typeof value === 'function') return value.bind(this.target)
    return value
  }

  _addHandler (val) {
    const internal = this
    const target = this.target

    if (this._reverse.has(val)) return
    if (target.has(val)) return

    const type = Object.prototype.toString.call(val)
    if (!val?.[kStaty] && isValidForStaty(type)) {
      const state = staty(val, { targetType: type, disableCache: internal.disableCache })
      this._reverse.set(val, state)
      val = state
    }

    target.add(val)
    val?.[kStaty]?.addParent?.(kNoProp, internal)
    internal.run(null, () => {
      internal.clearSnapshot()
      target.delete(val)
      val?.[kStaty]?.delParent?.(kNoProp, internal)
    })
  }

  _deleteHandler (val) {
    const internal = this
    const target = this.target

    let key = kEmpty
    if (this._reverse.has(val)) {
      key = val
      val = this._reverse.get(val)
    }

    if (!target.delete(val)) return
    if (key !== kEmpty) {
      this._reverse.delete(key)
    }
    val?.[kStaty]?.delParent?.(kNoProp, internal)
    const prevStaty = val?.[kStaty]
    internal.run(null, () => {
      internal.clearSnapshot()
      target.add(val)
      if (key !== kEmpty) {
        this._reverse.set(key, val)
      }
      prevStaty?.addParent?.(kNoProp, internal)
    })
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
