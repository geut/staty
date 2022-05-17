// based on https://github.com/lukeed/klona
import { kStaty, kEmpty } from './symbols.js'

function snapshotProp (state, prop, disableCache) {
  const value = dlv(state, prop)

  if (!value || typeof value !== 'object') {
    return value
  }

  if (value[kStaty]) {
    return clone(value, disableCache)
  }

  return dlv(clone(state, disableCache), prop)
}

function dlv (obj, key) {
  let p
  key = key.split ? key.split('.') : key
  for (p = 0; p < key.length; p++) {
    if (obj) {
      const k = key[p]
      if (obj?.[kStaty]?.refValue) {
        obj = obj[kStaty].refValue(k)
      } else {
        obj = obj[k]
      }
    } else {
      return obj
    }
  }
  return obj
}

function clone (x, disableCache) {
  if (!x) return x

  const staty = x?.[kStaty]
  if (staty && staty.cacheSnapshot !== kEmpty) {
    if (disableCache === undefined) {
      if (!staty.disableCache) return staty.cacheSnapshot
    } else {
      if (!disableCache) return staty.cacheSnapshot
    }
  }

  if (staty?.isRef) {
    if (staty.mapSnapshot) {
      x = staty.mapSnapshot(staty.value)
      staty.cacheSnapshot = x
      return x
    }

    x = staty.value
  }

  let k
  let tmp
  const str = Object.prototype.toString.call(x)

  if (str === '[object Object]') {
    tmp = Object.create(Object.getPrototypeOf(x) || null) // null
    for (k in x) {
      tmp[k] = clone(staty?.refValue ? staty.refValue(k) : x[k], disableCache)
    }
  } else if (str === '[object Array]') {
    k = x.length
    for (tmp = Array(k); k--;) {
      tmp[k] = clone(staty?.refValue ? staty.refValue(k) : x[k], disableCache)
    }
  } else if (str === '[object Set]') {
    tmp = new Set()
    x.forEach(function (val) {
      tmp.add(clone(val, disableCache))
    })
  } else if (str === '[object Map]') {
    tmp = new Map()
    x.forEach(function (val, key) {
      tmp.set(clone(key, disableCache), clone(val, disableCache))
    })
  } else if (str === '[object Date]') {
    tmp = new Date(+x)
  } else if (str === '[object RegExp]') {
    tmp = new RegExp(x.source, x.flags)
    tmp.lastIndex = x.lastIndex
  } else if (str === '[object DataView]') {
    tmp = new x.constructor(clone(x.buffer, disableCache))
  } else if (str === '[object ArrayBuffer]') {
    tmp = x.slice(0)
  } else if (str.slice(-6) === 'Array]') {
    tmp = new x.constructor(x)
  }

  if (tmp) {
    if (staty) {
      staty.cacheSnapshot = tmp
    }
    return tmp
  }

  return x
}

/**
 * Creates a snapshot of the state
 *
 * @param {Proxy} state
 * @param {(String|Array<String>)} [prop]
 * @param {boolean} [disableCache] disable cache for snapshots
 * @returns {Object}
 */
export function snapshot (state, prop, disableCache) {
  if (Array.isArray(prop)) {
    return prop.map(p => snapshotProp(state, p, disableCache))
  }

  if (typeof prop === 'string') {
    return snapshotProp(state, prop, disableCache)
  }

  return clone(state, disableCache)
}
