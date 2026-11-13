import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { speak, stopSpeaking } from './speech.ts'

class Utterance {
  rate = 1
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  text: string
  constructor(text: string) { this.text = text }
}
const synthesis = { cancel: vi.fn(), speak: vi.fn(), speaking: true, pending: false }
beforeEach(() => {
  vi.useFakeTimers()
  synthesis.cancel.mockReset()
  synthesis.speak.mockReset()
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
})
afterEach(() => { stopSpeaking(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('owned speech cancellation', () => {
  it('settles immediately and clears timers even when cancel emits no end event', async () => {
    const abort = new AbortController()
    const done = speak('Axes', abort.signal)
    abort.abort()
    await done
    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    const utterance = synthesis.speak.mock.calls[0][0] as Utterance
    expect(utterance.onend).toBeNull()
    expect(utterance.onerror).toBeNull()
  })

  it('an older abort cannot cancel a newer utterance', async () => {
    const old = new AbortController()
    const first = speak('First', old.signal)
    const next = speak('Next')
    const count = synthesis.cancel.mock.calls.length
    old.abort()
    expect(synthesis.cancel).toHaveBeenCalledTimes(count)
    stopSpeaking()
    await Promise.all([first, next])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels stalled speech at its cap before continuing', async () => {
    const done = speak('Test')
    await vi.advanceTimersByTimeAsync(2280)
    expect(await done).toBe('timeout')
    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not speak a request already cancelled', async () => {
    const abort = new AbortController()
    abort.abort()
    await speak('Old', abort.signal)
    expect(synthesis.speak).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
