import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoSession } from './piano.ts'
import { sonify } from './sonification.ts'
import { GRAPHS } from '../data/graphs.ts'

const deps = vi.hoisted(() => ({ create: vi.fn(), speak: vi.fn() }))
vi.mock('./piano.ts', () => ({ createPianoSession: deps.create }))
vi.mock('./speech.ts', () => ({ speak: deps.speak }))
import { PlaybackController } from './player.ts'
const s = sonify(GRAPHS[0])
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function piano() {
  const done = deferred<void>()
  return { playNote: vi.fn().mockResolvedValue(undefined), playGraph: vi.fn((_s: typeof s, _onNote: (index: number) => void) => done.promise), dispose: vi.fn(), done }
}
beforeEach(() => {
  deps.create.mockReset()
  deps.speak.mockReset().mockResolvedValue(undefined)
})

describe('playback generations', () => {
  it('disposes a late-loaded old piano without changing a newer playing session', async () => {
    const first = deferred<PianoSession>()
    const old = piano(), next = piano()
    deps.create.mockReturnValueOnce(first.promise).mockResolvedValueOnce(next)
    const player = new PlaybackController()
    const a = player.play(s)
    const oldSignal = deps.create.mock.calls[0][0] as AbortSignal
    player.stop()
    expect(oldSignal.aborted).toBe(true)
    expect((await player.play(s).scheduled).kind).toBe('scheduled')
    first.resolve(old)
    expect((await a.finished).kind).toBe('cancelled')
    expect(old.dispose).toHaveBeenCalledOnce()
    expect(old.playGraph).not.toHaveBeenCalled()
    expect(player.getSnapshot().status).toBe('playing')
    player.stop()
  })

  it('does not continue an interrupted spoken preamble even if speech resolves late', async () => {
    const speech = deferred<void>()
    deps.speak.mockReturnValueOnce(speech.promise)
    const old = piano(), next = piano()
    deps.create.mockResolvedValueOnce(old).mockResolvedValueOnce(next)
    const player = new PlaybackController()
    const first = player.play(s, [{ say: 'Axes' }, { note: 48, name: 'C3', ms: 450 }])
    await vi.waitFor(() => expect(deps.speak).toHaveBeenCalledOnce())
    const signal = deps.speak.mock.calls[0][1] as AbortSignal
    player.stop()
    await player.play(s).scheduled
    speech.resolve()
    expect((await first.finished).kind).toBe('cancelled')
    expect(signal.aborted).toBe(true)
    expect(old.playNote).not.toHaveBeenCalled()
    expect(old.playGraph).not.toHaveBeenCalled()
    expect(player.getSnapshot().status).toBe('playing')
    player.stop()
  })

  it('does not continue an interrupted reference note', async () => {
    const reference = deferred<void>()
    const old = piano()
    old.playNote.mockReturnValue(reference.promise)
    deps.create.mockResolvedValue(old)
    const player = new PlaybackController()
    const pending = player.play(s, [{ note: 48, name: 'C3', ms: 450 }, { say: '5' }])
    await vi.waitFor(() => expect(old.playNote).toHaveBeenCalledOnce())
    player.stop()
    reference.resolve()
    expect((await pending.finished).kind).toBe('cancelled')
    expect(deps.speak).not.toHaveBeenCalled()
    expect(old.playGraph).not.toHaveBeenCalled()
  })

  it('ignores stale note, end and error callbacks after rapid replacement', async () => {
    const old = piano(), next = piano()
    deps.create.mockResolvedValueOnce(old).mockResolvedValueOnce(next)
    const player = new PlaybackController()
    await player.play(s).scheduled
    const oldNote = old.playGraph.mock.calls[0][1] as (index: number) => void
    player.stop()
    await player.play(s).scheduled
    const nextNote = next.playGraph.mock.calls[0][1] as (index: number) => void
    nextNote(3)
    oldNote(40)
    old.done.reject(new Error('late error'))
    await Promise.resolve()
    expect(player.getSnapshot()).toEqual({ status: 'playing', activeIndex: 3, error: null })
    player.stop()
    next.done.resolve()
    await Promise.resolve()
    expect(player.getSnapshot().status).toBe('idle')
  })

  it('cleans up on owner unmount and tolerates Strict Mode remount', async () => {
    const first = piano(), next = piano()
    deps.create.mockResolvedValueOnce(first).mockResolvedValueOnce(next)
    const player = new PlaybackController()
    const listener = vi.fn()
    const unsubscribe = player.subscribe(listener)
    await player.play(s).scheduled
    const signal = deps.create.mock.calls[0][0] as AbortSignal
    unsubscribe()
    player.stop() // usePlayer's effect cleanup
    const count = listener.mock.calls.length
    first.done.resolve()
    await Promise.resolve()
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(signal.aborted).toBe(true)
    expect(listener).toHaveBeenCalledTimes(count)
    expect((await player.play(s).scheduled).kind).toBe('scheduled')
    player.stop()
  })

  it('shows a recoverable error after initialization failure and clears it on retry', async () => {
    const next = piano()
    deps.create.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(next)
    const player = new PlaybackController()
    expect((await player.play(s).finished).kind).toBe('failed')
    expect(player.getSnapshot()).toMatchObject({ status: 'error', activeIndex: -1, error: expect.stringContaining('retry') })
    expect((await player.play(s).scheduled).kind).toBe('scheduled')
    expect(player.getSnapshot()).toEqual({ status: 'playing', activeIndex: -1, error: null })
    player.stop()
  })

  it('handles graph scheduling errors without leaving the UI playing', async () => {
    const broken = piano()
    broken.playGraph.mockImplementation(() => { throw new Error('audio scheduling failed') })
    deps.create.mockResolvedValue(broken)
    const player = new PlaybackController()
    expect((await player.play(s).finished).kind).toBe('failed')
    expect(player.getSnapshot().status).toBe('error')
    expect(broken.dispose).toHaveBeenCalledOnce()
  })

  it('ignores an old natural-completion callback after a newer session starts', async () => {
    const old = piano(), next = piano()
    deps.create.mockResolvedValueOnce(old).mockResolvedValueOnce(next)
    const player = new PlaybackController()
    await player.play(s).scheduled
    await player.play(s).scheduled
    old.done.resolve()
    await Promise.resolve()
    expect(player.getSnapshot().status).toBe('playing')
    player.stop()
  })

  it('does not surface an old loading failure in a newer session', async () => {
    const first = deferred<PianoSession>()
    deps.create.mockReturnValueOnce(first.promise).mockResolvedValueOnce(piano())
    const player = new PlaybackController()
    const pending = player.play(s)
    await player.play(s).scheduled
    first.reject(new Error('old network error'))
    expect((await pending.finished).kind).toBe('cancelled')
    expect(player.getSnapshot().status).toBe('playing')
    player.stop()
  })

  it('cancels stop-position speech on replacement and owner cleanup', () => {
    const player = new PlaybackController()
    player.announce('Apr, 14')
    const signal = deps.speak.mock.calls[0][1] as AbortSignal
    player.stop()
    expect(signal.aborted).toBe(true)
  })
})

describe('explicit playback outcomes', () => {
  it('distinguishes successful scheduling from natural completion', async () => {
    const audio = piano()
    deps.create.mockResolvedValue(audio)
    const player = new PlaybackController()
    const request = player.play(s)
    let terminal: string | null = null
    void request.finished.then((outcome) => { terminal = outcome.kind })
    expect((await request.scheduled).kind).toBe('scheduled')
    expect(player.getSnapshot().status).toBe('playing')
    expect(terminal).toBeNull()
    audio.done.resolve()
    expect(await request.finished).toEqual({ kind: 'completed', sessionId: request.sessionId, graphId: s.graphId })
    expect(player.getSnapshot().status).toBe('idle')
    expect(audio.dispose).toHaveBeenCalledOnce()
    player.stop()
    expect((await request.finished).kind).toBe('completed')
  })

  it('settles cancellation immediately even when loading never resolves', async () => {
    deps.create.mockReturnValue(new Promise(() => {}))
    const player = new PlaybackController()
    const request = player.play(s)
    player.stop()
    expect((await request.scheduled).kind).toBe('cancelled')
    expect((await request.finished).kind).toBe('cancelled')
  })

  it('settles preamble cancellation without waiting for a missing speech end event', async () => {
    deps.create.mockResolvedValue(piano())
    deps.speak.mockReturnValue(new Promise(() => {}))
    const player = new PlaybackController()
    const request = player.play(s, [{ say: 'Axes' }])
    await vi.waitFor(() => expect(deps.speak).toHaveBeenCalledOnce())
    player.stop()
    expect((await request.scheduled).kind).toBe('cancelled')
    expect((await request.finished).kind).toBe('cancelled')
  })

  it('reports early Stop as cancelled after scheduling, even if an old end arrives', async () => {
    const audio = piano()
    deps.create.mockResolvedValue(audio)
    const player = new PlaybackController()
    const request = player.play(s)
    await request.scheduled
    player.stop()
    audio.done.resolve()
    expect((await request.finished).kind).toBe('cancelled')
    expect(player.getSnapshot().status).toBe('idle')
  })

  it('reports loading failure without a scheduled or completed outcome', async () => {
    deps.create.mockRejectedValue(new Error('network'))
    const player = new PlaybackController()
    const request = player.play(s)
    expect((await request.scheduled).kind).toBe('failed')
    expect((await request.finished).kind).toBe('failed')
    expect(player.getSnapshot().status).toBe('error')
  })

  it('reports graph failure separately from its earlier scheduling success', async () => {
    const audio = piano()
    deps.create.mockResolvedValue(audio)
    const player = new PlaybackController()
    const request = player.play(s)
    expect((await request.scheduled).kind).toBe('scheduled')
    audio.done.reject(new Error('playback failed'))
    expect((await request.finished).kind).toBe('failed')
    expect(player.getSnapshot().status).toBe('error')
  })

  it('keeps replacement and unmount cancellations distinct from the new completion', async () => {
    const old = piano(), next = piano()
    deps.create.mockResolvedValueOnce(old).mockResolvedValueOnce(next)
    const player = new PlaybackController()
    const a = player.play(s)
    await a.scheduled
    const b = player.play(s)
    await b.scheduled
    old.done.resolve()
    expect((await a.finished).kind).toBe('cancelled')
    next.done.resolve()
    expect((await b.finished).kind).toBe('completed')
    expect(a.sessionId).not.toBe(b.sessionId)
  })
})
