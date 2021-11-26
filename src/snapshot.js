// based on https://github.com/lukeed/klona

export const configureSnapshot = (kStaty, log) => {
  return function snapshot (x) {
    if (!x) return x

    const staty = x?.[kStaty]
    if (staty && staty.cacheSnapshot) return staty.cacheSnapshot

    x = staty?.target || x

    if (!x || typeof x !== 'object') return x

    if (staty?.isRef) {
      if (staty.mapSnapshot) {
        x = staty.mapSnapshot(x.__ref)
        staty.cacheSnapshot = x
        if (log.enabled) log('cacheSnapshot:ref %s %O', staty?.prop, x)
        return x
      }
      x = x.__ref
    }

    let k
    let tmp
    const str = Object.prototype.toString.call(x)

    if (str === '[object Object]') {
      tmp = {} // null
      for (k in x) {
        if (k === '__proto__') {
          Object.defineProperty(tmp, k, {
            value: snapshot(x[k]),
            configurable: true,
            enumerable: true,
            writable: true
          })
        } else {
          tmp[k] = snapshot(x[k])
        }
      }
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object Array]') {
      k = x.length
      for (tmp = Array(k); k--;) {
        tmp[k] = snapshot(x[k])
      }
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object Set]') {
      tmp = new Set()
      x.forEach(function (val) {
        tmp.add(snapshot(val))
      })
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object Map]') {
      tmp = new Map()
      x.forEach(function (val, key) {
        tmp.set(snapshot(key), snapshot(val))
      })
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object Date]') {
      tmp = new Date(+x)
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object RegExp]') {
      tmp = new RegExp(x.source, x.flags)
      tmp.lastIndex = x.lastIndex
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object DataView]') {
      tmp = new x.constructor(snapshot(x.buffer))
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str === '[object ArrayBuffer]') {
      tmp = x.slice(0)
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    if (str.slice(-6) === 'Array]') {
      tmp = new x.constructor(x)
      if (staty) {
        staty.cacheSnapshot = tmp
        if (log.enabled) log('cacheSnapshot %s %O', staty?.prop, tmp)
      }
      return tmp
    }

    return x
  }
}
