import { kStaty, isObject, isArray, isSet, isMap } from './constants.js'
import { InternalStaty } from './types/internal.js'
import { ArrayStaty } from './types/array.js'
import { MapStaty } from './types/map.js'
import { SetStaty } from './types/set.js'
import { cloneStructures } from './clone.js'

function _createProxy (internal) {
  const state = new Proxy(internal.target, internal)
  internal.setProxy(state)
  return state
}

export function createProxy (proxyOptions, x, p, pk, type) {
  if (!x || typeof x !== 'object') return x

  const staty = x?.[kStaty]
  if (staty) {
    if (p && !staty.isRef) staty.addParent(pk, p[kStaty], true)
    return x
  }

  const str = type || Object.prototype.toString.call(x)

  let k
  let tmp
  let proxy

  if (str === isObject) {
    tmp = Object.create(Object.getPrototypeOf(x)) // null
    proxy = _createProxy(new InternalStaty(x, tmp, proxyOptions))
    for (k in x) {
      tmp[k] = createProxy(proxyOptions, x[k], proxy, k)
    }
  } else if (str === isArray) {
    k = x.length
    tmp = Array(k)
    proxy = _createProxy(new ArrayStaty(x, tmp, proxyOptions))
    for (; k--;) {
      tmp[k] = createProxy(proxyOptions, x[k], proxy, k)
    }
  } else if (str === isSet) {
    tmp = new Set()
    proxy = _createProxy(new SetStaty(x, tmp, proxyOptions))
    x.forEach(function (val) {
      tmp.add(createProxy(proxyOptions, val, proxy, val))
    })
  } else if (str === isMap) {
    tmp = new Map()
    proxy = _createProxy(new MapStaty(x, tmp, proxyOptions))
    x.forEach(function (val, key) {
      tmp.set(createProxy(proxyOptions, key, proxy, key), createProxy(proxyOptions, val, proxy, key))
    })
  } else {
    tmp = cloneStructures(x, str)
  }

  if (proxy) {
    if (p) proxy[kStaty].addParent(pk, p[kStaty], false)
    return proxy
  }

  return tmp
}
