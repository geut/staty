// based on https://github.com/lukeed/klona

export const configureSnapshot = ({ kTarget, kIsRef }) => {
  return function snapshot (x) {
    if (!x) return x

    x = x[kTarget] || x

    if (!x || typeof x !== 'object') return x

    if (x[kIsRef]) {
      if (x.snapshot) return x.snapshot(x.__ref)
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
      return tmp
    }

    if (str === '[object Array]') {
      k = x.length
      for (tmp = Array(k); k--;) {
        tmp[k] = snapshot(x[k])
      }
      return tmp
    }

    if (str === '[object Set]') {
      tmp = new Set()
      x.forEach(function (val) {
        tmp.add(snapshot(val))
      })
      return tmp
    }

    if (str === '[object Map]') {
      tmp = new Map()
      x.forEach(function (val, key) {
        tmp.set(snapshot(key), snapshot(val))
      })
      return tmp
    }

    if (str === '[object Date]') {
      return new Date(+x)
    }

    if (str === '[object RegExp]') {
      tmp = new RegExp(x.source, x.flags)
      tmp.lastIndex = x.lastIndex
      return tmp
    }

    if (str === '[object DataView]') {
      return new x.constructor(snapshot(x.buffer))
    }

    if (str === '[object ArrayBuffer]') {
      return x.slice(0)
    }

    if (str.slice(-6) === 'Array]') {
      return new x.constructor(x)
    }

    return x
  }
}
