/**
 * Sonification engine: graph -> protocol preamble + timed note sequence.
 * Owner: Person 2.
 *
 * Pure TypeScript, no DOM or audio. Playback lives in piano.ts.
 *
 * TODO (Person 2):
 *  - decide trough-anchored (current) vs start-anchored pitch mapping
 *  - tune noteMs / gapRatio for the most continuous feel
 *  - decide fixed clip length vs fixed time per point
 *  - optional glissando / continuous mode for the comparison condition
 */
import { DEFAULT_OPTIONS } from '../types.ts'
import type { Anchor, Graph, Note, PreambleItem, ProtocolOptions, Sonification } from '../types.ts'

// ---------------------------------------------------------------------------
// Pitch helpers. MIDI 60 = C4 (middle C).
// ---------------------------------------------------------------------------

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  return `${NAMES[((midi % 12) + 12) % 12]}${octave}`
}

export function nameToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(name.trim())
  if (!m) throw new Error(`Bad note name: ${name}`)
  const [, letter, accidental, octave] = m
  let idx = NAMES.indexOf(letter as (typeof NAMES)[number])
  if (accidental === '#') idx += 1
  if (accidental === 'b') idx -= 1
  return (Number(octave) + 1) * 12 + idx
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Pick the smallest "nice" number (1, 2, 2.5, 5 × 10^k) that is >= `min`.
 * Nice numbers make the preamble easy to say and remember
 * ("one whole step is 5 degrees").
 */
export function niceStep(min: number): number {
  if (!(min > 0)) return 1
  const exp = Math.floor(Math.log10(min))
  const base = 10 ** exp
  for (const m of [1, 2, 2.5, 5, 10]) {
    const candidate = m * base
    if (candidate >= min - 1e-12) return candidate
  }
  return 10 * base // unreachable, keeps TS happy
}

/** Linear interpolation of the graph at fractional x (in point-index units). */
function sampleAt(points: Graph['points'], t: number): number {
  const i = Math.min(points.length - 2, Math.max(0, Math.floor(t)))
  const frac = t - i
  if (points.length === 1) return points[0].y
  return points[i].y + (points[i + 1].y - points[i].y) * frac
}

/**
 * Map a graph to the Earmark protocol.
 *
 * Pitch mapping (v1):
 *   - The trough is anchored to `lowestMidi`.
 *   - Every value is quantised to a `stepSemitones` grid above the trough
 *     (default 1 = chromatic):
 *       midi = lowestMidi + stepSemitones * round((y - trough) / unitsPerStep)
 *   - `unitsPerStep` is chosen so the peak still fits under `highestMidi`.
 *
 * Timing (v1):
 *   - The graph is resampled to roughly one note every `noteMs` across
 *     `durationMs`, interpolating linearly between data points so it sounds
 *     continuous. Every original data point is still sounded exactly.
 *   - Each note sounds for (1 - gapRatio) of its slot.
 */
export function sonify(graph: Graph, overrides: Partial<ProtocolOptions> = {}): Sonification {
  const opts: ProtocolOptions = { ...DEFAULT_OPTIONS, ...overrides }
  const { points } = graph
  if (points.length === 0) throw new Error('Cannot sonify an empty graph')
  if (opts.highestMidi - opts.lowestMidi < opts.stepSemitones) {
    throw new Error('Pitch range must span at least one step')
  }

  const ys = points.map((p) => p.y)
  const troughValue = Math.min(...ys)
  const peakValue = Math.max(...ys)
  const range = peakValue - troughValue

  const stepsAvailable = Math.floor((opts.highestMidi - opts.lowestMidi) / opts.stepSemitones)
  const unitsPerStep = opts.unitsPerStep ?? niceStep(range / stepsAvailable)

  const toMidi = (y: number): number => {
    const steps = Math.round((y - troughValue) / unitsPerStep)
    return Math.min(opts.highestMidi, opts.lowestMidi + steps * opts.stepSemitones)
  }
  const anchor = (value: number): Anchor => {
    const midi = toMidi(value)
    return { value, midi, name: midiToName(midi) }
  }

  // `perSegment` notes between consecutive data points, so every data point
  // (including the peak and trough) is sounded exactly, never only interpolated.
  const segments = Math.max(1, points.length - 1)
  const perSegment = Math.max(1, Math.round(opts.durationMs / opts.noteMs / segments))
  const count = points.length === 1 ? 1 : perSegment * segments + 1
  const slotMs = opts.durationMs / count
  const notes: Note[] = Array.from({ length: count }, (_, index) => {
    const t = index / perSegment
    const value = sampleAt(points, t)
    const midi = toMidi(value)
    return {
      index,
      pointIndex: Math.round(t),
      x: t,
      value,
      midi,
      name: midiToName(midi),
      startMs: index * slotMs,
      durationMs: slotMs * (1 - opts.gapRatio),
    }
  })

  return {
    graphId: graph.id,
    durationMs: opts.durationMs,
    trough: anchor(troughValue),
    peak: anchor(peakValue),
    start: anchor(points[0].y),
    unitsPerStep,
    notes,
  }
}

const fmt = (v: number) => String(Number(v.toFixed(2)))

/** Length of each reference note in the preamble. */
const REF_NOTE_MS = 450

/**
 * The packed preamble. No sentences: the listener is taught the order once
 * and decodes it from then on.
 *
 *   axes (spoken once)
 *   length in seconds
 *   [lowest note]  lowest value
 *   [highest note] highest value
 *   [start note]   start value
 *   [a note][one step up] value of one step
 *
 * Keep this the single source of truth for the order so UI and audio agree.
 */
export function buildPreamble(s: Sonification, graph: Graph, stepSemitones = DEFAULT_OPTIONS.stepSemitones): PreambleItem[] {
  const note = (midi: number): PreambleItem => ({ note: midi, name: midiToName(midi), ms: REF_NOTE_MS })
  const unit = graph.unit ? `, ${graph.unit}` : ''
  return [
    { say: `${graph.xLabel}. ${graph.yLabel}${unit}.` },
    { say: fmt(s.durationMs / 1000) },
    note(s.trough.midi),
    { say: fmt(s.trough.value) },
    note(s.peak.midi),
    { say: fmt(s.peak.value) },
    note(s.start.midi),
    { say: fmt(s.start.value) },
    note(s.trough.midi),
    note(s.trough.midi + stepSemitones),
    { say: fmt(s.unitsPerStep) },
  ]
}

/** Text rendering of the preamble for the screen: notes in brackets, speech in quotes. */
export function preambleText(items: PreambleItem[]): string {
  return items.map((i) => ('say' in i ? i.say : `[${i.name}]`)).join(' ')
}
