import * as Tone from 'tone'
import type { Graph, PlaybackPosition, Sonification } from '../types.ts'
import type { PianoSession, GraphPlaybackOptions } from './piano.ts'
import { positionAtTime, evaluateGraph, interpolation } from '../graph/coordinates.ts'
import { nameToMidi, midiToFrequency, buildPreamble } from './sonification.ts'
import { abortable } from './cancellation.ts'

/** Interpolate the common time/x path, not the rounded piano pitches. */
export function continuousPosition(g: Graph, s: Sonification, elapsedMs: number): PlaybackPosition | null {
  const previous = positionAtTime(s, elapsedMs)
  if (!previous) return null
  const a = s.notes[previous.index], b = s.notes[previous.index + 1]
  const fraction = b ? Math.max(0, Math.min(1, (elapsedMs - a.startMs) / (b.startMs - a.startMs))) : 0
  const x = b ? a.x + (b.x - a.x) * fraction : a.x
  return { ...previous, mode: 'continuous', x, value: evaluateGraph(g, x) }
}
export function continuousFrequency(s: Sonification, value: number): number {
  const midi = s.trough.midi + (value - s.trough.value) / s.unitsPerStep * s.stepSemitones
  return midiToFrequency(Math.max(s.pitchRange?.low ?? 48, Math.min(s.pitchRange?.high ?? 84, midi)))
}

/** References use the same unrounded calibration as the oscillator curve. */
export function continuousPreamble(s: Sonification, g: Graph) {
  let reference = 0
  const values = [s.trough.value, s.peak.value, s.start.value]
  return buildPreamble(s, g).map((item) => {
    if ('say' in item) return item
    const value = values[reference++]
    return value === undefined ? item : { ...item, frequencyHz: continuousFrequency(s, value) }
  })
}

/** One oscillator session owns every oscillator/envelope/timer. No shared voices. */
export async function createContinuousSession(signal: AbortSignal, graph: Graph): Promise<PianoSession> {
  signal.throwIfAborted()
  const initializing = new AbortController()
  const timeout = setTimeout(() => initializing.abort(new Error('Audio initialization timed out')), 30_000)
  try { await abortable(Tone.start(), AbortSignal.any([signal, initializing.signal])) }
  finally { clearTimeout(timeout) }
  signal.throwIfAborted()
  const output = new Tone.Gain(0.12).toDestination()
  const voices = new Set<{ oscillator: OscillatorNode; envelope: Tone.Gain }>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let disposed = false
  let timeline: { s: Sonification; onset: number; offset: number; speed: number } | null = null
  const getPosition = () => disposed || !timeline || Tone.immediate() < timeline.onset ? null
    : continuousPosition(graph, timeline.s, timeline.offset + (Tone.immediate() - timeline.onset) * 1000 * timeline.speed)
  const dispose = () => {
    if (disposed) return
    disposed = true; signal.removeEventListener('abort', dispose)
    timers.forEach(clearTimeout); timers.clear()
    output.disconnect()
    for (const { oscillator, envelope } of voices) { oscillator.onended = null; oscillator.stop(); oscillator.disconnect(); envelope.dispose() }
    voices.clear(); output.dispose()
  }
  signal.addEventListener('abort', dispose, { once: true })
  const wait = (ms: number) => abortable(new Promise<void>((resolve) => {
    const timer = setTimeout(() => { timers.delete(timer); resolve() }, ms); timers.add(timer)
  }), signal)
  const voice = (frequency: number, onset: number, releaseAt: number) => {
    const oscillator = Tone.getContext().createOscillator()
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, onset)
    const envelope = new Tone.Gain(0).connect(output)
    Tone.connect(oscillator, envelope)
    const owned = { oscillator, envelope }; voices.add(owned)
    const ended = new Promise<void>((resolve) => { oscillator.onended = () => {
      voices.delete(owned); oscillator.disconnect(); envelope.dispose(); resolve()
    } })
    envelope.gain.setValueAtTime(0, onset)
    envelope.gain.linearRampToValueAtTime(1, onset + 0.005)
    envelope.gain.targetRampTo(0, 1, releaseAt)
    oscillator.start(onset); oscillator.stop(releaseAt + 1)
    return { oscillator, ended }
  }
  return {
    dispose, getPosition,
    async playNote(name, ms, frequencyHz) {
      const onset = Tone.now() + 0.02
      voice(frequencyHz ?? midiToFrequency(nameToMidi(name)), onset, onset + ms / 1000)
      await wait(ms + 60)
    },
    playGraph(s, onNote, options: GraphPlaybackOptions = {}) {
      const offset = Math.max(0, Math.min(s.durationMs, options.offsetMs ?? 0)), speed = options.speed ?? 1
      if (!(speed > 0) || !Number.isFinite(speed)) throw new Error('Invalid speed')
      const onset = Tone.now() + 0.05
      timeline = { s, onset, offset, speed }
      const initial = continuousPosition(graph, s, offset)!
      const last = s.notes.at(-1)!
      const releaseAt = onset + Math.max(0, last.startMs + last.durationMs - offset) / speed / 1000
      const { oscillator, ended } = voice(continuousFrequency(s, initial.value), onset, releaseAt)
      for (const n of s.notes) {
        if (n.startMs <= offset) continue
        const at = onset + (n.startMs - offset) / speed / 1000
        const frequency = continuousFrequency(s, n.value)
        if (interpolation(graph) === 'step') oscillator.frequency.setValueAtTime(frequency, at)
        else oscillator.frequency.exponentialRampToValueAtTime(frequency, at)
      }
      const timelineEnd = new Promise<void>((resolve) => {
        const tick = () => {
          if (disposed || signal.aborted) return
          const position = getPosition()
          if (position) onNote(position.index, position)
          if (Tone.immediate() >= onset + (s.durationMs - offset) / speed / 1000) { resolve(); return }
          const timer = setTimeout(() => { timers.delete(timer); tick() }, 50); timers.add(timer)
        }; tick()
      })
      return abortable(Promise.all([ended, timelineEnd]), signal).then(dispose)
    },
  }
}
