import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sonify } from './sonification.ts'
import { GRAPHS } from '../data/graphs.ts'

const audio = vi.hoisted(() => ({
  clock: 1, start: vi.fn(), decode: vi.fn(), sources: [] as { onended: null | (() => void); playbackRate: { value: number }; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[],
  outputs: [] as { disconnect: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; gain: { setValueAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn> } }[],
}))
vi.mock('tone', () => ({
  start: audio.start,
  now: () => 1.1,
  immediate: () => audio.clock,
  getContext: () => ({
    decodeAudioData: audio.decode,
    createBufferSource: () => {
      const source = { buffer: null, playbackRate: { value: 1 }, onended: null, start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }
      audio.sources.push(source)
      return source
    },
  }),
  connect: vi.fn(),
  Gain: class {
    gain = { setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), targetRampTo: vi.fn() }
    disconnect = vi.fn()
    dispose = vi.fn()
    constructor() { audio.outputs.push(this) }
    toDestination() { return this }
    connect() { return this }
  },

}))
const s = sonify(GRAPHS[0])
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  audio.clock = 1
  audio.start.mockReset().mockResolvedValue(undefined)
  audio.decode.mockReset().mockResolvedValue({ duration: 10 })
  audio.sources.length = 0
  audio.outputs.length = 0
  fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('session-owned piano', () => {
  it('cancels pending initialization promptly and never creates voices later', async () => {
    let resume!: () => void
    audio.start.mockReturnValue(new Promise<void>((r) => { resume = r }))
    const { createPianoSession } = await import('./piano.ts')
    const abort = new AbortController()
    const pending = createPianoSession(abort.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await rejected
    resume()
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(audio.outputs).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts downloads themselves while fetch is pending', async () => {
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    }))
    const { createPianoSession } = await import('./piano.ts')
    const abort = new AbortController()
    const pending = createPianoSession(abort.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    abort.abort()
    await rejected
    expect(fetchMock.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true)
    expect(audio.decode).not.toHaveBeenCalled()
    expect(audio.outputs).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts pending sample downloads and cannot schedule after late decoding', async () => {
    let decode!: (value: unknown) => void
    audio.decode.mockImplementation(() => new Promise((r) => { decode = r }))
    const { createPianoSession } = await import('./piano.ts')
    const abort = new AbortController()
    const pending = createPianoSession(abort.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(audio.decode).toHaveBeenCalled())
    abort.abort()
    await rejected
    expect(fetchMock.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true)
    decode({ duration: 10 })
    await Promise.resolve()
    expect(audio.sources).toHaveLength(0)
    expect(audio.outputs).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('disconnects output, disposes every scheduled voice and cancels callbacks on Stop', async () => {
    const { createPianoSession } = await import('./piano.ts')
    const abort = new AbortController()
    const piano = await createPianoSession(abort.signal)
    const onNote = vi.fn()
    const done = piano.playGraph(s, onNote)
    const rejected = expect(done).rejects.toMatchObject({ name: 'AbortError' })
    expect(audio.sources).toHaveLength(s.notes.length)
    await vi.advanceTimersByTimeAsync(60)
    const count = onNote.mock.calls.length
    abort.abort()
    await rejected
    piano.dispose() // idempotent
    await vi.runAllTimersAsync()
    expect(audio.outputs[0].disconnect).toHaveBeenCalledTimes(1)
    expect(audio.outputs[0].gain.setValueAtTime).toHaveBeenCalledWith(0, 1)
    expect(audio.sources.every((voice) => voice.disconnect.mock.calls.length === 1 && voice.stop.mock.calls.length === 2)).toBe(true)
    expect(onNote).toHaveBeenCalledTimes(count)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an in-flight reference note immediately', async () => {
    const { createPianoSession } = await import('./piano.ts')
    const abort = new AbortController()
    const piano = await createPianoSession(abort.signal)
    const note = piano.playNote('C3', 450)
    const rejected = expect(note).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await rejected
    expect(audio.sources[0].disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('completes only after the audio timeline and every graph voice end naturally', async () => {
    const { createPianoSession } = await import('./piano.ts')
    const piano = await createPianoSession(new AbortController().signal)
    let completed = false
    const done = piano.playGraph(s, vi.fn()).then(() => { completed = true })
    // Wall time alone must not complete a suspended/lagging audio context.
    await vi.advanceTimersByTimeAsync(s.durationMs + 200)
    expect(completed).toBe(false)
    audio.clock = 1.15 + s.durationMs / 1000
    await vi.advanceTimersByTimeAsync(100)
    expect(completed).toBe(false) // the final release tail is still sounding
    for (const source of audio.sources.slice(0, -1)) source.onended?.()
    await Promise.resolve()
    expect(completed).toBe(false)
    audio.sources.at(-1)?.onended?.()
    await done
    expect(completed).toBe(true)
    expect(audio.outputs[0].dispose).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not complete before the nominal graph endpoint even if samples end early', async () => {
    const { createPianoSession } = await import('./piano.ts')
    const piano = await createPianoSession(new AbortController().signal)
    let completed = false
    const done = piano.playGraph(s, vi.fn()).then(() => { completed = true })
    for (const source of audio.sources) source.onended?.()
    await vi.advanceTimersByTimeAsync(100)
    expect(completed).toBe(false)
    audio.clock = 1.15 + s.durationMs / 1000
    await vi.advanceTimersByTimeAsync(100)
    await done
    expect(completed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports HTTP errors, aborts sibling requests and permits a fresh retry', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    const { createPianoSession } = await import('./piano.ts')
    await expect(createPianoSession(new AbortController().signal)).rejects.toThrow('503')
    expect(fetchMock.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true)
    const piano = await createPianoSession(new AbortController().signal)
    const note = piano.playNote('C3', 450)
    await vi.advanceTimersByTimeAsync(510)
    await note
    piano.dispose()
    expect(audio.sources).toHaveLength(1)
  })

  it('preserves nearest-sample pitch shifting and reuses decoded data across sessions', async () => {
    const { createPianoSession } = await import('./piano.ts')
    const first = await createPianoSession(new AbortController().signal)
    const loaded = fetchMock.mock.calls.length
    const ref = first.playNote('D3', 450) // closest is D#3, shifted down one semitone
    expect(audio.sources[0].playbackRate.value).toBeCloseTo(2 ** (-1 / 12))
    await vi.advanceTimersByTimeAsync(510)
    await ref
    first.dispose()
    const second = await createPianoSession(new AbortController().signal)
    expect(fetchMock).toHaveBeenCalledTimes(loaded)
    second.dispose()
  })

  it('times out initialization instead of leaving Loading stuck', async () => {
    audio.start.mockReturnValue(new Promise(() => {}))
    const { createPianoSession } = await import('./piano.ts')
    const pending = createPianoSession(new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(30_000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('audio-clock coordinate capture', () => {
  it('has no coordinate during reference notes or before scheduled graph onset', async () => {
    const { createPianoSession } = await import('./piano.ts')
    const abort = new AbortController()
    const piano = await createPianoSession(abort.signal)
    const reference = piano.playNote('C3', 450)
    expect(piano.getPosition()).toBeNull()
    await vi.advanceTimersByTimeAsync(510)
    await reference
    const done = piano.playGraph(s, vi.fn())
    const rejected = expect(done).rejects.toMatchObject({ name: 'AbortError' })
    expect(piano.getPosition()).toBeNull()
    abort.abort()
    await rejected
    expect(piano.getPosition()).toBeNull()
  })
  it('captures the current sample without running React highlight timers', async () => {
    const { createPianoSession } = await import('./piano.ts')
    const abort = new AbortController()
    const piano = await createPianoSession(abort.signal)
    const onNote = vi.fn()
    const done = piano.playGraph(s, onNote)
    const rejected = expect(done).rejects.toMatchObject({ name: 'AbortError' })
    const t0 = audio.sources[0].start.mock.calls[0][0] as number
    audio.clock = t0 + (s.notes[1].startMs + 0.01) / 1000
    expect(onNote).not.toHaveBeenCalled()
    expect(piano.getPosition()).toMatchObject({ index: 1, x: s.notes[1].x, value: s.notes[1].value })
    await vi.advanceTimersByTimeAsync(150)
    expect(onNote.mock.calls.every(([index]) => index === 1)).toBe(true)
    abort.abort()
    await rejected
  })
})
