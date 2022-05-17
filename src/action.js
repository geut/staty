class Action {
  constructor (name, onRelease) {
    this._name = name
    this._onRelease = onRelease
    this._handlers = new Set()
    this._done = false
  }

  valid (handler) {
    if (!handler.filter) return true
    return handler.filter(this._name)
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
    this._stack = []
    this._onRelease = () => {
      this._stack.pop()
    }
  }

  get current () {
    return this._stack[this._stack.length - 1]
  }

  create (name = '_') {
    const action = new Action(name, this._onRelease)
    this._stack.push(action)
    return action
  }
}
