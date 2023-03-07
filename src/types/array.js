import { InternalStaty, rawValue } from './internal.js'
import { actions, action } from '../action.js'

export class ArrayStaty extends InternalStaty {
  onGetSnapshot (target, prop, value) {
    if (prop === 'splice' || prop === 'unshift' || prop === 'push' || prop === 'pop' || prop === 'shift' || prop === 'reverse' || prop === 'sort') {
      this.onReadOnly(target, prop, value)
      return () => {}
    }
    if (typeof value === 'function') return value.bind(target)
    return value
  }

  clone () {
    let k
    const x = this.target
    k = x.length
    const tmp = Array(k)
    for (; k--;) {
      tmp[k] = rawValue(x[k])
    }
    return tmp
  }

  handler (value, prop) {
    if (prop === 'splice' || prop === 'unshift' || prop === 'push' || prop === 'pop' || prop === 'shift' || prop === 'reverse' || prop === 'sort') {
      return (...args) => {
        if (actions.current) {
          return value.call(this.proxy, ...args)
        } else {
          let res
          action(() => {
            res = value.call(this.proxy, ...args)
          })
          return res
        }
      }
    }
    if (typeof value === 'function') return value.bind(this.target)
    return value
  }

  reflectDeleteProperty (target, prop) {
    const newArr = target.filter((_, i) => `${i}` !== prop)
    target.splice(0, target.length, ...newArr)
    return true
  }
}
