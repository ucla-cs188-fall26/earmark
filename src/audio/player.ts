import type { PlaybackPosition, PreambleItem, Sonification } from '../types.ts'
import { createPianoSession, createReferenceSession, type PianoSession } from './piano.ts'
import { NarrationTransport, narrationSections, type NarrationState } from './narration.ts'
import { positionAtTime } from '../graph/coordinates.ts'
import { describeStop } from '../graph/descriptions.ts'
import type { Graph } from '../types.ts'
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

export type PlayerStatus = 'idle' | 'speaking' | 'loading' | 'playing' | 'paused' | 'error'
export interface PlayerSnapshot {
  status: PlayerStatus
  activeIndex: number
  error: string | null
  speed?: number
  needsFullReplay?: boolean
  narration?: NarrationState
  stoppedPosition: PlaybackPosition | null
}
interface Session {
  id: number
  abort: AbortController
  piano?: PianoSession
  narration?: NarrationTransport
  s?: Sonification
  offsetMs?: number
  speed?: number
  graphRevision?: number
  graphAbort?: AbortController
  readAbort?: AbortController
  graphStarted?: boolean
  paused?: boolean
  fullRun?: boolean
  positionAvailable?: boolean
  scheduled?: () => void
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
    previous?.graphAbort?.abort()
    previous?.readAbort?.abort()
    previous?.abort.abort()
    previous?.piano?.dispose()
  }
  getPosition = () => {
    const session = this.session
    if (session?.paused && session.s) return session.positionAvailable ? positionAtTime(session.s, session.offsetMs ?? 0) : null
    const position = session?.piano?.getPosition() ?? null
    if (session && position) session.positionAvailable = true
    return position
  }
  stop = (): PlaybackPosition | null => {
    // Capture from the audio clock BEFORE abort disconnects/disposes the sources.
    const position = this.getPosition()
    this.cancel()
    this.update({ status: 'idle', activeIndex: -1, error: null, narration: undefined, stoppedPosition: position ?? this.snapshot.stoppedPosition })
    return position
  }
  reset = () => {
    this.stop()
    this.update({ stoppedPosition: null, needsFullReplay: undefined })
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
    session.s = s; session.speed = this.snapshot.speed ?? 1; session.offsetMs = 0; session.fullRun = true
    session.scheduled = () => scheduled({ ...identity, kind: 'scheduled' })
    this.update({ status: 'loading' })
    void this.run(session, preamble, () => scheduled({ ...identity, kind: 'scheduled' }))
    return request
  }
  private async run(session: Session, preamble: PreambleItem[] | undefined, scheduled: () => void) {
    const signal = session.abort.signal
    try {
      session.graphAbort = new AbortController()
      session.piano = await createPianoSession(AbortSignal.any([signal, session.graphAbort.signal]))
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
      session.scheduled = scheduled
      await this.renderGraph(session, session.piano)
    } catch {
      this.fail(session)
    }
  }
  private async renderGraph(session: Session, existing?: PianoSession) {
    const revision = (session.graphRevision ?? 0) + 1
    session.graphRevision = revision; session.graphStarted = true; session.paused = false
    session.readAbort?.abort()
    if (!existing) {
      this.update({ status: 'loading' })
      session.graphAbort?.abort(); session.piano?.dispose()
      session.graphAbort = new AbortController()
    }
    const active = () => this.current(session) && session.graphRevision === revision && !session.paused
    try {
      const piano = existing ?? await createPianoSession(AbortSignal.any([session.abort.signal, session.graphAbort!.signal]))
      if (!active()) { piano.dispose(); return }
      session.piano = piano
      const done = piano.playGraph(session.s!, (activeIndex) => {
        if (active()) this.update({ activeIndex })
      }, { offsetMs: session.offsetMs, speed: session.speed })
      this.update({ status: 'playing' })
      session.scheduled?.()
      await done
      if (!active()) return
      piano.dispose()
      this.update({ status: 'idle', activeIndex: -1 })
      session.settle?.(session.fullRun ? 'completed' : 'cancelled')
    } catch {
      if (active()) this.fail(session)
    }
  }
  pauseGraph = () => {
    const session = this.session
    if (!session?.graphStarted || this.snapshot.status !== 'playing') return
    const position = this.getPosition()
    session.offsetMs = Math.min(session.s!.durationMs, position?.elapsedMs ?? session.offsetMs ?? 0)
    session.paused = true; session.graphRevision = (session.graphRevision ?? 0) + 1
    session.graphAbort?.abort(); session.piano?.dispose(); session.readAbort?.abort()
    this.update({ status: 'paused', activeIndex: position?.index ?? this.snapshot.activeIndex, stoppedPosition: position })
  }
  resumeGraph = () => {
    if (this.session?.paused) void this.renderGraph(this.session)
  }
  seekTo = (offsetMs: number) => {
    const session = this.session
    if (!session?.graphStarted || !Number.isFinite(offsetMs)) return
    const paused = session.paused
    session.fullRun = false; session.positionAvailable = true; session.settle?.('cancelled')
    session.offsetMs = Math.max(0, Math.min(session.s!.durationMs, offsetMs))
    session.graphRevision = (session.graphRevision ?? 0) + 1
    session.graphAbort?.abort(); session.piano?.dispose(); session.readAbort?.abort()
    const position = positionAtTime(session.s!, session.offsetMs)
    this.update({ needsFullReplay: true, stoppedPosition: position, activeIndex: position?.index ?? -1 })
    if (!paused) void this.renderGraph(session)
  }
  move = (deltaMs: number) => this.seekTo((this.getPosition()?.elapsedMs ?? this.session?.offsetMs ?? 0) + deltaMs)
  replaySegment = () => this.seekTo(Math.floor((this.getPosition()?.elapsedMs ?? this.session?.offsetMs ?? 0) / 1000) * 1000)
  setSpeed = (speed: number) => {
    if (![0.5, 0.75, 1, 1.25, 1.5].includes(speed)) return
    const session = this.session
    if (session?.graphStarted && ['playing', 'paused'].includes(this.snapshot.status)) {
      const paused = session.paused
      this.pauseGraph(); session.speed = speed
      this.update({ speed })
      if (!paused) this.resumeGraph()
    } else { if (session) session.speed = speed; this.update({ speed }) }
  }
  announcePosition = (graph: Graph) => {
    const session = this.session, position = this.getPosition()
    if (!session?.graphStarted || !position || position.graphId !== graph.id) return
    this.pauseGraph()
    session.readAbort?.abort(); session.readAbort = new AbortController()
    void speak(describeStop(graph, position), AbortSignal.any([session.abort.signal, session.readAbort.signal])).catch(() => this.fail(session))
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
