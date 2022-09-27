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
      if (!this.patched) {
        this.patched = true
        return (...args) => {
          if (actions.current) {
            this.proxy[prop](...args)
          } else {
            action(() => {
              this.proxy[prop](...args)
            })
          }
        }
      }
      this.patched = false
      return value
    }
    if (typeof value === 'function') return value.bind(this.target)
    return value
  }
}
