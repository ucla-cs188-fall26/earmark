import type { PreambleItem, Sonification } from '../types.ts'
import { createPianoSession, type PianoSession } from './piano.ts'
import { speak } from './speech.ts'

export type PlayerStatus = 'idle' | 'speaking' | 'loading' | 'playing' | 'error'
export interface PlayerSnapshot {
  status: PlayerStatus
  activeIndex: number
  error: string | null
}
interface Session {
  id: number
  abort: AbortController
  piano?: PianoSession
}

/** Framework-independent coordinator; React subscribes to its immutable snapshot. */
export class PlaybackController {
  private generation = 0
  private session: Session | null = null
  private listeners = new Set<() => void>()
  private snapshot: PlayerSnapshot = { status: 'idle', activeIndex: -1, error: null }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(patch: Partial<PlayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  private current(session: Session) {
    return this.session === session && session.id === this.generation && !session.abort.signal.aborted
  }
  private cancel() {
    ++this.generation
    const previous = this.session
    this.session = null // invalidate callbacks before abort handlers run
    previous?.abort.abort()
    previous?.piano?.dispose()
  }
  stop = () => {
    this.cancel()
    this.update({ status: 'idle', activeIndex: -1, error: null })
  }
  private begin(): Session {
    this.stop()
    const session = { id: this.generation, abort: new AbortController() }
    this.session = session
    return session
  }
  private fail(session: Session) {
    if (!this.current(session)) return
    this.cancel()
    this.update({ status: 'error', activeIndex: -1, error: 'Unable to load or play piano audio. Check your connection and press Play to retry.' })
  }
  /** True means graph scheduling succeeded; completion eligibility is unchanged. */
  play = async (s: Sonification, preamble?: PreambleItem[]): Promise<boolean> => {
    const session = this.begin()
    const signal = session.abort.signal
    this.update({ status: 'loading' })
    try {
      session.piano = await createPianoSession(signal)
      if (!this.current(session)) {
        session.piano.dispose()
        return false
      }
      if (preamble) {
        this.update({ status: 'speaking' })
        for (const item of preamble) {
          signal.throwIfAborted()
          if ('say' in item) await speak(item.say, signal)
          else await session.piano.playNote(item.name, item.ms)
          if (!this.current(session)) return false
        }
      }
      const done = session.piano.playGraph(s, (activeIndex) => {
        if (this.current(session)) this.update({ activeIndex })
      })
      this.update({ status: 'playing' })
      void done.then(() => {
        if (!this.current(session)) return
        // Keep ownership through the release tail; the piano disposes itself.
        // A subsequent Stop, replacement or unmount can still cut that tail.
        this.update({ status: 'idle', activeIndex: -1 })
      }, () => this.fail(session))
      return true
    } catch {
      this.fail(session)
      return false
    }
  }
  /** Stop-position speech participates in the same replacement/unmount lifecycle. */
  announce = (text: string) => {
    const session = this.begin()
    void speak(text, session.abort.signal).then(() => {
      if (this.current(session)) this.session = null
    }, () => this.fail(session))
  }
}
