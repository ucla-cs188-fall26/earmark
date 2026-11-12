/** Speech is globally exclusive, but cancellation belongs to its current owner. */
let cancelCurrent: (() => void) | null = null

export function stopSpeaking(): void {
  cancelCurrent?.()
}

export function speak(text: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted || typeof speechSynthesis === 'undefined') return Promise.resolve()
  stopSpeaking()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    let settled = false
    let watchdog: ReturnType<typeof setInterval> | undefined
    let cap: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (settled) return
      settled = true
      clearInterval(watchdog)
      clearTimeout(cap)
      signal?.removeEventListener('abort', cancel)
      utterance.onend = null
      utterance.onerror = null
      if (cancelCurrent === cancel) cancelCurrent = null
      resolve()
    }
    const cancel = () => {
      // An old abort must never cancel a newer utterance.
      if (cancelCurrent === cancel) speechSynthesis.cancel()
      finish()
    }
    cancelCurrent = cancel
    signal?.addEventListener('abort', cancel, { once: true })
    utterance.onend = finish
    utterance.onerror = finish
    const startedAt = Date.now()
    watchdog = setInterval(() => {
      if (Date.now() - startedAt > 1500 && !speechSynthesis.speaking && !speechSynthesis.pending) finish()
    }, 250)
    // Cancel, rather than merely resolving, if the speech engine gets stuck.
    cap = setTimeout(cancel, Math.min(30_000, 2000 + text.length * 70))
    try {
      speechSynthesis.speak(utterance)
    } catch {
      cancel()
    }
  })
}
