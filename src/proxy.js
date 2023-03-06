import { kStaty, isObject, isArray, isSet, isMap, isValidForStaty } from './constants.js'
import { ObjectStaty } from './types/object.js'
import { ArrayStaty } from './types/array.js'
import { MapStaty } from './types/map.js'
import { SetStaty } from './types/set.js'
import { cloneStructures } from './clone.js'

function _createProxy (internal) {
  const state = new Proxy(internal.target, {
    get (target, prop) {
      if (prop === kStaty) return internal
      const value = Reflect.get(target, prop)
      if (value === null || value === undefined) return value

      const valueStaty = value?.[kStaty]

      if (valueStaty?.isRef) {
        return valueStaty.value
      }

      return internal.handler(value, prop)
    },
    set (target, prop, value) {
      const newProp = !Reflect.has(target, prop)
      const oldValue = Reflect.get(target, prop)
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
        if (Reflect.set(target, prop, value)) {
          internal.run(prop, () => {
            internal.clearSnapshot()
            if (newProp) return Reflect.deleteProperty(target, prop)
            Reflect.set(target, prop, oldValue)
          })
        }
        return true
      }
      // end ref support

      if (oldValue === value) return true

      const type = Object.prototype.toString.call(value)
      let checkCircularReference = true
      if (!valueStaty && isValidForStaty(type)) {
        value = createProxy({ onReadOnly: internal.onReadOnly }, value)
        valueStaty = value[kStaty]
        checkCircularReference = false
      }

      if (oldValueStaty !== valueStaty) {
        valueStaty?.addParent(prop, internal, checkCircularReference)
        oldValueStaty?.delParent(prop, internal)
      }

      Reflect.set(target, prop, value)

      internal.run(prop, () => {
        internal.clearSnapshot()

        if (oldValueStaty !== valueStaty) {
          oldValueStaty?.addParent(prop, internal)
          valueStaty?.delParent(prop, internal)
        }

        if (newProp) {
          if (Array.isArray(target)) {
            const newArr = target.filter((_, i) => `${i}` !== prop)
            target.splice(0, target.length, ...newArr)
          } else {
            Reflect.deleteProperty(target, prop)
          }
          return
        }

        Reflect.set(target, prop, oldValue)
      })

      return true
    },

    deleteProperty (target, prop) {
      if (!Reflect.has(target, prop)) return true

      const oldValue = Reflect.get(target, prop)
      oldValue?.[kStaty]?.delParent?.(prop, internal)

      if (Array.isArray(target)) return Reflect.deleteProperty(target, prop)
      if (Reflect.deleteProperty(target, prop)) {
        internal.run(prop, () => {
          internal.clearSnapshot()
          oldValue?.[kStaty]?.addParent?.(prop, internal)
          Reflect.set(target, prop, oldValue)
        })
      }
      return true
    }
  })

  internal.proxy = state

  return state
}

export function createProxy (proxyOptions, x, p, pk) {
  if (!x || typeof x !== 'object') return x

  const staty = x?.[kStaty]
  if (staty) {
    if (p && !staty.isRef) staty.addParent(pk, p[kStaty], true)
    return x
  }

  const str = Object.prototype.toString.call(x)

  let k
  let tmp
  let proxy

  if (str === isObject) {
    tmp = Object.create(Object.getPrototypeOf(x)) // null
    proxy = _createProxy(new ObjectStaty(tmp, proxyOptions))
    for (k in x) {
      tmp[k] = createProxy(proxyOptions, x[k], proxy, k)
    }
  } else if (str === isArray) {
    k = x.length
    tmp = Array(k)
    proxy = _createProxy(new ArrayStaty(tmp, proxyOptions))
    for (; k--;) {
      tmp[k] = createProxy(proxyOptions, x[k], proxy, k)
    }
  } else if (str === isSet) {
    tmp = new Set()
    proxy = _createProxy(new SetStaty(tmp, proxyOptions))
    x.forEach(function (val) {
      tmp.add(createProxy(proxyOptions, val, proxy, val))
    })
  } else if (str === isMap) {
    tmp = new Map()
    proxy = _createProxy(new MapStaty(tmp, proxyOptions))
    x.forEach(function (val, key) {
      tmp.set(createProxy(proxyOptions, key, proxy, key), createProxy(proxyOptions, val, proxy, key))
    })
  } else {
    tmp = cloneStructures(x, str)
  }

  if (proxy) {
    if (p) proxy[kStaty].addParent(pk, p[kStaty], true)
    return proxy
  }

  return tmp
}
