// based on https://github.com/lukeed/klona

export const configureSnapshot = ({ kTarget, kIsRef, kCacheSnapshot }) => {
  return function snapshot (x) {
    if (!x) return x

    const cacheSnapshot = x[kCacheSnapshot]
    if (cacheSnapshot && cacheSnapshot.value) return cacheSnapshot.value

    x = x[kTarget] || x

    if (!x || typeof x !== 'object') return x

    if (x[kIsRef]) {
      if (x.snapshot) {
        x = x.snapshot(x.__ref)
        if (cacheSnapshot) cacheSnapshot.value = x
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
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    if (str === '[object Array]') {
      k = x.length
      for (tmp = Array(k); k--;) {
        tmp[k] = snapshot(x[k])
      }
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    if (str === '[object Set]') {
      tmp = new Set()
      x.forEach(function (val) {
        tmp.add(snapshot(val))
      })
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    if (str === '[object Map]') {
      tmp = new Map()
      x.forEach(function (val, key) {
        tmp.set(snapshot(key), snapshot(val))
      })
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    if (str === '[object Date]') {
      tmp = new Date(+x)
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    if (str === '[object RegExp]') {
      tmp = new RegExp(x.source, x.flags)
      tmp.lastIndex = x.lastIndex
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    if (str === '[object DataView]') {
      tmp = new x.constructor(snapshot(x.buffer))
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    if (str === '[object ArrayBuffer]') {
      tmp = x.slice(0)
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    if (str.slice(-6) === 'Array]') {
      tmp = new x.constructor(x)
      if (cacheSnapshot) cacheSnapshot.value = tmp
      return tmp
    }

    return x
  }
}
