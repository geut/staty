class Action {
  constructor (name, onRelease) {
    this._name = name
    this._onRelease = onRelease
    this._beforeHandlers = new Set()
    this._handlers = new Set()
    this._done = false
    this._inRollback = false
    this._history = []
  }

  get name () {
    return this._name
  }

  get inRollback () {
    return this._inRollback
  }

  valid (handler) {
    if (!handler.filter) return true
    return handler.filter(this._name)
  }

  add (handler) {
    if (handler.before) {
      this._beforeHandlers.add(handler)
    } else {
      this._handlers.add(handler)
    }
  }

  done () {
    if (this._done) return

    try {
      this._beforeHandlers.forEach(handler => handler.run())
    } catch (err) {
      this.cancel()
      throw err
    }

    this._done = true
    this._onRelease()
    this._handlers.forEach(handler => handler.run())
  }

  cancel () {
    if (this._done) return
    this._inRollback = true
    for (let i = this._history.length - 1; i >= 0; i--) {
      this._history[i]()
    }
    this._history = []
    this._inRollback = false
    this._done = true
    this._onRelease()
  }

  pushHistory (rollback) {
    this._history.push(rollback)
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
