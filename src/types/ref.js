const kValue = Symbol('valueRef')

export class RefStaty {
  #mapSnapshot

  constructor (value, mapSnapshot, cache = false) {
    this.isRef = true
    this.cache = cache
    this.#mapSnapshot = mapSnapshot
    this.setValue(value)
  }

  setValue (value) {
    this.value = value
    this.updateSnapshot()
  }

  getSnapshot () {
    if (this.cache) return this.snapshot === kValue ? this.value : this.snapshot
    this.updateSnapshot()
    return this.snapshot === kValue ? this.value : this.snapshot
  }

  updateSnapshot () {
    this.snapshot = kValue
    if (this.#mapSnapshot) {
      this.snapshot = this.#mapSnapshot(this.value)
    }
  }
}
