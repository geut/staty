class Action {
  constructor (name, release) {
    this._name = name
    this._handlers = new Set()
    this._release = release
  }

  valid (handler) {
    if (!handler.actionFilter) return true
    if (handler.actionFilter.include && handler.actionFilter.include.test(this._name)) return true
    if (handler.actionFilter.exclude && handler.actionFilter.exclude.test(this._name)) return false
    return handler.actionFilter.test(this._name)
  }

  add (handler) {
    this._handlers.add(handler)
  }

  done () {
    this._release()
    this._handlers.forEach(handler => this._run(handler))
    this._handlers.clear()
  }

  cancel () {
    this._release()
    this._handlers.clear()
  }

  _run (handler) {
    try {
      handler.run()
    } catch (err) {
      console.error(err)
    }
  }
}

export class ActionManager {
  constructor () {
    this._actions = []
  }

  get current () {
    return this._actions[this._actions.length - 1]
  }

  create (name = '_') {
    const action = new Action(name, () => {
      this._actions.pop()
    })
    this._actions.push(action)
    return action
  }
}
