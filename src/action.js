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
    this._handlers.forEach(handler => this._run(handler))
    this._handlers.clear()
    this._release()
  }

  cancel () {
    this._handlers.clear()
    this._release()
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
    this._current = null
  }

  get current () {
    return this._current
  }

  create (name = '_') {
    if (this._current) throw new Error('there is already an action running')

    this._current = new Action(name, () => {
      this._current = null
    })
    return this._current
  }
}
