import { kStaty, isObject, isArray, isSet, isMap, isDate, isRegexp, isDataView, isBuffer } from './constants.js'

export function cloneStructures (x, str) {
  let tmp
  if (str === isDate) {
    tmp = new Date(+x)
  } else if (str === isRegexp) {
    tmp = new RegExp(x.source, x.flags)
    tmp.lastIndex = x.lastIndex
  } else if (str === isDataView) {
    tmp = new x.constructor(cloneStructures(x.buffer, isBuffer))
  } else if (str === isBuffer) {
    tmp = x.slice(0)
  } else if (str.slice(-6) === 'Array]') {
    tmp = new x.constructor(x)
  }

  return tmp
}

export function clone (x, onMap) {
  if (!x) return x

  const staty = x?.[kStaty]
  if (staty) return x

  const str = Object.prototype.toString.call(x)

  let k
  let tmp

  if (str === isObject) {
    tmp = Object.create(Object.getPrototypeOf(x)) // null
    tmp = onMap(tmp, str, x)
    for (k in x) {
      tmp[k] = clone(x[k], onMap)
    }
  } else if (str === isArray) {
    k = x.length
    tmp = Array(k)
    tmp = onMap(tmp, str, x)
    for (; k--;) {
      tmp[k] = clone(x[k], onMap)
    }
  } else if (str === isSet) {
    tmp = new Set()
    tmp = onMap(tmp, str, x)
    x.forEach(function (val) {
      tmp.add(clone(val, onMap))
    })
  } else if (str === isMap) {
    tmp = new Map()
    tmp = onMap(tmp, str, x)
    x.forEach(function (val, key) {
      tmp.set(clone(key, onMap), clone(val, onMap))
    })
  } else {
    tmp = cloneStructures(x, str)
  }

  if (tmp) return tmp
  return x
}
