// based on https://github.com/lukeed/klona

export const configureSnapshot = ({ kStaty, log }) => {
  function _snapshotProp (state, prop) {
    const value = dlv(state, prop)

    if (!value || typeof value !== 'object') {
      return value
    }

    if (value[kStaty]) {
      return _snapshot(value)
    }

    return dlv(_snapshot(state), prop)
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

  function _snapshot (x) {
    if (!x) return x

    const staty = x?.[kStaty]
    if (staty && staty.cacheSnapshot) {
      log('cacheSnapshot:use %s %O', staty?.prop, staty.cacheSnapshot)
      return staty.cacheSnapshot
    }

    if (staty?.isRef) {
      if (staty.mapSnapshot) {
        x = staty.mapSnapshot(staty.value)
        staty.cacheSnapshot = x
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, x)
        return x
      }
      x = staty.value
    }

    let k
    let tmp
    const str = Object.prototype.toString.call(x)

    if (str === '[object Object]') {
      tmp = {} // null
      for (k in x) {
        if (k === '__proto__') {
          Object.defineProperty(tmp, k, {
            value: _snapshot(staty?.refValue ? staty.refValue(k) : x[k]),
            configurable: true,
            enumerable: true,
            writable: true
          })
        } else {
          tmp[k] = _snapshot(staty?.refValue ? staty.refValue(k) : x[k])
        }
      }

      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }

      return tmp
    }

    if (str === '[object Array]') {
      k = x.length
      for (tmp = Array(k); k--;) {
        tmp[k] = _snapshot(staty?.refValue ? staty.refValue(k) : x[k])
      }
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object Set]') {
      tmp = new Set()
      x.forEach(function (val) {
        tmp.add(_snapshot(val))
      })
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object Map]') {
      tmp = new Map()
      x.forEach(function (val, key) {
        tmp.set(_snapshot(key), _snapshot(val))
      })
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object Date]') {
      tmp = new Date(+x)
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object RegExp]') {
      tmp = new RegExp(x.source, x.flags)
      tmp.lastIndex = x.lastIndex
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object DataView]') {
      tmp = new x.constructor(_snapshot(x.buffer))
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object ArrayBuffer]') {
      tmp = x.slice(0)
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str.slice(-6) === 'Array]') {
      tmp = new x.constructor(x)
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot:update %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    return x
  }

  return function snapshot (state, prop) {
    if (Array.isArray(prop)) {
      return prop.map(p => _snapshotProp(state, p))
    }

    if (typeof prop === 'string') {
      return _snapshotProp(state, prop)
    }

    return _snapshot(state)
  }
}
