// based on https://github.com/lukeed/klona
import { kStaty } from './constants.js'

function snapshotProp (state, prop) {
  const value = dlv(state, prop)

  if (value?.[kStaty]) {
    return value[kStaty].snapshot
  }

  return value
}

function dlv (obj, key) {
  let p
  for (p = 0; p < key.length; p++) {
    if (obj) {
      const k = key[p]
      obj = obj[k]
    } else {
      return obj
    }
  }
  return obj
}

/**
 * Creates a snapshot of the state
 *
 * @param {Proxy} state
 * @param {(String|Array<String>)} [prop]
 * @returns {Object}
 */
export function snapshot (state, prop) {
  if (!state[kStaty]) throw new Error('the snapshot requires a valid staty object')
  if (Array.isArray(prop)) {
    return prop.map(p => snapshotProp(state, p.split('.')))
  }

  if (typeof prop === 'string') {
    return snapshotProp(state, prop.split('.'))
  }

  return state[kStaty].snapshot
}
