const batches = new Map()

export function batchHandler (handler, snapshot) {
  if (batches.size > 0) {
    batches.set(handler, snapshot)
    return
  }

  batches.set(handler, snapshot)

  queueMicrotask(() => {
    batches.forEach((snapshot, handler) => {
      try {
        handler(snapshot)
      } catch (err) {
        console.error(err)
      }
    })
    batches.clear()
  })
}
