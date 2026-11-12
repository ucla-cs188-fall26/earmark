import type { PlaybackPosition, PreambleItem, Sonification } from '../types.ts'
import { createPianoSession, createReferenceSession, type PianoSession } from './piano.ts'
import { NarrationTransport, narrationSections, type NarrationState } from './narration.ts'
import { speak } from './speech.ts'

export interface PlaybackOutcome {
  kind: 'completed' | 'cancelled' | 'failed'
  sessionId: number
  graphId: string
}
export interface PlaybackRequest {
  sessionId: number
  /** Scheduling is not evidence that the listener heard the graph. */
  scheduled: Promise<Omit<PlaybackOutcome, 'kind'> & { kind: 'scheduled' | 'cancelled' | 'failed' }>
  finished: Promise<PlaybackOutcome>
}

export type PlayerStatus = 'idle' | 'speaking' | 'loading' | 'playing' | 'error'
export interface PlayerSnapshot {
  status: PlayerStatus
  activeIndex: number
  error: string | null
  narration?: NarrationState
  stoppedPosition: PlaybackPosition | null
}
interface Session {
  id: number
  abort: AbortController
  piano?: PianoSession
  narration?: NarrationTransport
  settle?: (kind: PlaybackOutcome['kind']) => void
}

/** Framework-independent coordinator; React subscribes to its immutable snapshot. */
export class PlaybackController {
  private generation = 0
  private session: Session | null = null
  private listeners = new Set<() => void>()
  private snapshot: PlayerSnapshot = { status: 'idle', activeIndex: -1, error: null, stoppedPosition: null }
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
  private cancel(outcome: 'cancelled' | 'failed' = 'cancelled') {
    ++this.generation
    const previous = this.session
    this.session = null // invalidate callbacks before abort handlers run
    previous?.settle?.(outcome)
    previous?.abort.abort()
    previous?.piano?.dispose()
  }
  getPosition = () => this.session?.piano?.getPosition() ?? null
  stop = (): PlaybackPosition | null => {
    // Capture from the audio clock BEFORE abort disconnects/disposes the sources.
    const position = this.getPosition()
    this.cancel()
    this.update({ status: 'idle', activeIndex: -1, error: null, narration: undefined, stoppedPosition: position ?? this.snapshot.stoppedPosition })
    return position
  }
  reset = () => {
    this.stop()
    this.update({ stoppedPosition: null })
  }
  private begin(): Session {
    this.reset()
    const session = { id: this.generation, abort: new AbortController() }
    this.session = session
    return session
  }
  private fail(session: Session) {
    if (!this.current(session)) return
    this.cancel('failed')
    this.update({ status: 'error', activeIndex: -1, error: 'Unable to load or play piano audio. Check your connection and press Play to retry.' })
  }
  /** Each request settles exactly once, even if an underlying load never resolves. */
  play = (s: Sonification, preamble?: PreambleItem[]): PlaybackRequest => {
    const session = this.begin()
    const identity = { sessionId: session.id, graphId: s.graphId }
    let scheduled!: (value: Awaited<PlaybackRequest['scheduled']>) => void
    let finished!: (value: PlaybackOutcome) => void
    const request: PlaybackRequest = {
      sessionId: session.id,
      scheduled: new Promise((resolve) => { scheduled = resolve }),
      finished: new Promise((resolve) => { finished = resolve }),
    }
    session.settle = (kind) => {
      if (kind !== 'completed') scheduled({ ...identity, kind })
      finished({ ...identity, kind })
    }
    this.update({ status: 'loading' })
    void this.run(session, s, preamble, () => scheduled({ ...identity, kind: 'scheduled' }))
    return request
  }
  private async run(session: Session, s: Sonification, preamble: PreambleItem[] | undefined, scheduled: () => void) {
    const signal = session.abort.signal
    try {
      session.piano = await createPianoSession(signal)
      if (!this.current(session)) {
        session.piano.dispose()
        return
      }
      if (preamble) {
        this.update({ status: 'speaking' })
        session.narration = new NarrationTransport(narrationSections(preamble), signal, async (items, childSignal) => {
          const reference = await createReferenceSession(childSignal)
          try {
            for (const item of items) {
              childSignal.throwIfAborted()
              if ('say' in item) await speak(item.say, childSignal)
              else await reference.playNote(item.name, item.ms)
            }
          } finally { reference.dispose() }
        }, (narration) => { if (this.current(session)) this.update({ narration }) })
        await session.narration.run()
        if (!this.current(session)) return
        this.update({ narration: undefined })
      }
      const done = session.piano.playGraph(s, (activeIndex) => {
        if (this.current(session)) this.update({ activeIndex })
      })
      this.update({ status: 'playing' })
      scheduled()
      await done
      if (!this.current(session)) return
      session.piano.dispose()
      this.update({ status: 'idle', activeIndex: -1 })
      session.settle?.('completed')
    } catch {
      this.fail(session)
    }
  }
  previousSection = () => this.session?.narration?.previous()
  nextSection = () => this.session?.narration?.next()
  replaySection = () => this.session?.narration?.replay()
  pauseNarration = () => this.session?.narration?.pause()
  resumeNarration = () => this.session?.narration?.resume()
  skipIntroduction = () => this.session?.narration?.skip()
  /** Stop-position speech participates in the same replacement/unmount lifecycle. */
  announce = (text: string) => {
    const stoppedPosition = this.snapshot.stoppedPosition
    const session = this.begin()
    this.update({ stoppedPosition })
    void speak(text, session.abort.signal).then(() => {
      if (this.current(session)) this.session = null
    }, () => this.fail(session))
  }
}
