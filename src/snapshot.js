// based on https://github.com/lukeed/klona
import { kStaty } from './constants.js'

function snapshotProp (state, prop) {
  const value = dlv(state, prop)

  const staty = value?.[kStaty]
  if (staty) {
    return staty.getSnapshot()
  }

  return value
}

function dlv (obj, key) {
  let p
  for (p = 0; p < key.length; p++) {
    if (obj) {
      const staty = obj?.[kStaty]
      const k = key[p]
      if (staty) {
        obj = staty.getValueByProp(k)
      } else {
        obj = obj[k]
      }
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
