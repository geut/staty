const batches = new Set()

export function batchHandler (handler) {
  if (batches.size > 0) {
    batches.add(handler)
    return
  }

  batches.add(handler)

  queueMicrotask(() => {
    batches.forEach(handler => handler())
    batches.clear()
  })
}
