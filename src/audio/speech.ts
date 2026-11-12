/**
 * Spoken preamble via the Web Speech API.
 * Owner: Person 2.
 *
 * Falls back silently when speech synthesis is unavailable (e.g. in tests).
 * Chrome sometimes drops the `end` event (utterance garbage-collected, tab
 * hidden, voice list not ready), so we hold a reference to the utterance and
 * poll `speechSynthesis.speaking` as a watchdog. The promise always settles.
 */

let current: SpeechSynthesisUtterance | null = null

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve()
    speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    current = utterance // keep it alive until it finishes

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearInterval(watchdog)
      clearTimeout(cap)
      if (current === utterance) current = null
      resolve()
    }
    utterance.onend = finish
    utterance.onerror = finish

    // Watchdog: once speech has had a chance to start, resolve when the
    // engine reports it is neither speaking nor queued.
    const startedAt = Date.now()
    const watchdog = setInterval(() => {
      const warmedUp = Date.now() - startedAt > 1500
      if (warmedUp && !speechSynthesis.speaking && !speechSynthesis.pending) finish()
    }, 250)
    // Hard cap: ~15 chars/sec plus a margin, never more than 30 s.
    const cap = setTimeout(finish, Math.min(30_000, 2000 + text.length * 70))

    speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  current = null
}
