class Transaction {
  constructor (name, release) {
    this._name = name
    this._handlers = new Set()
    this._release = release
  }

  valid (handler) {
    if (!handler.transactionFilter) return true
    if (handler.transactionFilter.include && handler.transactionFilter.include.test(this._name)) return true
    if (handler.transactionFilter.exclude && handler.transactionFilter.exclude.test(this._name)) return false
    return handler.transactionFilter.test(this._name)
  }

  add (handler) {
    this._handlers.add(handler)
  }

  done () {
    this._release()
    this._handlers.forEach(handler => this._run(handler))
  }

  _run (handler) {
    try {
      handler.run()
    } catch (err) {
      console.error(err)
    }
  }
}

export class TransactionManager {
  constructor () {
    this._transactions = []
  }

  get current () {
    return this._transactions[this._transactions.length - 1]
  }

  create (name = '_') {
    const transaction = new Transaction(name, () => {
      this._transactions.pop()
    })
    this._transactions.push(transaction)
    return transaction
  }
}
