/** Race an operation that cannot itself be aborted (audio resume/decode) with Stop. */
export function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Playback cancelled', 'AbortError'))
    if (signal.aborted) {
      // Still observe a later rejection from the underlying operation.
      void operation.catch(() => {})
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
