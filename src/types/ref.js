const kValue = Symbol('valueRef')

const kMapSnapshot = Symbol('kMapSnapshot')
const kSnapshot = Symbol('kSnapshot')
export class RefStaty {
  constructor (value, mapSnapshot, cache = false) {
    this.isRef = true
    this.cache = cache
    this[kMapSnapshot] = mapSnapshot
    this[kSnapshot] = null
    this.setValue(value)
  }

  setValue (value) {
    this.value = value
    this.updateSnapshot()
  }

  getSnapshot () {
    const snapshot = this[kSnapshot]
    if (this.cache) return snapshot === kValue ? this.value : snapshot
    this.updateSnapshot()
    return snapshot === kValue ? this.value : snapshot
  }

  updateSnapshot () {
    this[kSnapshot] = kValue
    const mapSnapshot = this[kMapSnapshot]
    if (mapSnapshot) {
      this[kSnapshot] = mapSnapshot(this.value)
    }
  }
}
