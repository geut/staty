import { isDate, isRegexp, isDataView, isBuffer } from './constants.js'

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
    tmp = x.constructor.from(x)
  }

  return tmp
}
