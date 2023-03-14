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
 * Create an snapshot from the state
 *
 * @template {unknown} T
 * @type {import('../types/overloading').snapshot}
 * @param {T} state
 * @param {Array<string> | string} [props]
 */
export const snapshot = (state, props) => {
  if (!state[kStaty]) throw new Error('the snapshot requires a valid staty object')

  if (Array.isArray(props)) {
    return props.map(p => snapshotProp(state, p.split('.')))
  }

  if (typeof props === 'string') {
    return snapshotProp(state, props.split('.'))
  }

  return state[kStaty].getSnapshot()
}
