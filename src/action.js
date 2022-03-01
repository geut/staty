const isRegex = value => value.test !== undefined
const isSymbol = value => Object.prototype.toString.call(value) === '[object Symbol]'

function match (patterns, value, valueIsSymbol) {
  patterns = Array.isArray(patterns) ? patterns : [patterns]

  for (const pattern of patterns) {
    if (valueIsSymbol) {
      if (!isRegex(pattern) && pattern === value) return true
    } else {
      if (isRegex(pattern)) {
        if (pattern.test(value)) return true
      } else if (pattern === value) {
        return true
      }
    }
  }

  return false
}

class Action {
  constructor (name, onRelease) {
    this._name = name
    this._isSymbol = isSymbol(name)
    this._onRelease = onRelease
    this._handlers = new Set()
    this._done = false
  }

  valid (handler) {
    if (!handler.actionFilter) return true
    if (handler.actionFilter.include && match(handler.actionFilter.include, this._name, this._isSymbol)) return true
    if (handler.actionFilter.exclude && match(handler.actionFilter.exclude, this._name, this._isSymbol)) return false
    return match(handler.actionFilter, this._name, this._isSymbol)
  }

  add (handler) {
    this._handlers.add(handler)
  }

  done () {
    if (this._done) return
    this._done = true
    this._handlers.forEach(handler => handler.run())
    this._onRelease()
  }

  cancel () {
    if (this._done) return
    this._done = true
    this._onRelease()
  }
}

export class ActionManager {
  constructor () {
    this._current = null
    this._onRelease = () => {
      this._current = null
    }
  }

  get current () {
    return this._current
  }

  create (name = '_') {
    if (this._current) throw new Error('there is already an action running: ', this._current.name)
    this._current = new Action(name, this._onRelease)
    return this._current
  }
}
