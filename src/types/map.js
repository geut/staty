import { InternalStaty, rawValue } from './internal.js'
import { kStaty, kNoProp, isValidForStaty, kEmpty } from '../constants.js'
import { staty } from '../index.js'
import { actions, action } from '../action.js'

export class MapStaty extends InternalStaty {
  constructor (...args) {
    super(...args)

    this._setHandler = this._setHandler.bind(this)
    this._deleteHandler = this._deleteHandler.bind(this)
    this._clearHandler = this._clearHandler.bind(this)
    this._reverse = new Map()
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

  handler (value, prop) {
    if (prop === 'set') return this._setHandler
    if (prop === 'delete') return this._deleteHandler
    if (prop === 'clear') return this._clearHandler
    if (typeof value === 'function') return value.bind(this.target)
    return value
  }

  _setHandler (key, val) {
    const internal = this
    const target = this.target
    if (this._reverse.has(key) && this._reverse.get(key) === val) return
    const oldVal = target.get(key)
    if (oldVal && (oldVal === val || oldVal?.[kStaty]?.target === val)) return
    const type = Object.prototype.toString.call(val)
    const oldReverse = this._reverse.has(key) ? this._reverse.get(key) : kEmpty
    if (!val?.[kStaty] && isValidForStaty(type)) {
      this._reverse.set(key, val)
      val = staty(val, { targetType: type, disableCache: internal.disableCache })
    }
    target.set(key, val)
    const parentProp = typeof key === 'string' ? key : kNoProp
    oldVal?.[kStaty]?.delParent?.(parentProp, internal)
    val?.[kStaty]?.addParent?.(parentProp, internal)

    const prevStaty = {
      oldVal: oldVal?.[kStaty],
      val: val?.[kStaty]
    }
    internal.run(key, () => {
      internal.clearSnapshot()
      if (oldVal) {
        if (oldReverse !== kEmpty) {
          this._reverse.set(key, oldReverse)
        }
        target.set(key, oldVal)
      } else {
        this._reverse.delete(key)
        target.delete(key)
      }
      prevStaty.oldVal?.addParent?.(parentProp, internal)
      prevStaty.val?.delParent?.(parentProp, internal)
    })
  }

  _deleteHandler (key) {
    const internal = this
    const target = this.target

    const val = target.get(key)
    if (!target.delete(key)) return
    const parentProp = typeof key === 'string' ? key : kNoProp
    val?.[kStaty]?.delParent?.(parentProp, internal)

    const oldReverse = this._reverse.has(key) ? this._reverse.get(key) : kEmpty
    this._reverse.delete(key)
    const prevStaty = val?.[kStaty]
    internal.run(key, () => {
      internal.clearSnapshot()
      if (oldReverse !== kEmpty) {
        this._reverse.set(key, oldReverse)
      }
      target.set(key, val)
      prevStaty?.addParent?.(parentProp, internal)
    })
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
