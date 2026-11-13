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
import { axisPosition, evaluateGraph, observationAt, rawX, validateGraph } from '../graph/coordinates.ts'
import { describeAxes, describePitchReference, describePlaybackParts, formatValue } from '../graph/descriptions.ts'
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
 *     `durationMs`, using the explicit graph interpolation policy. Numeric x
 *     distances determine timing; categorical observations receive equal spacing.
 *     Every original data point is still sounded exactly.
 *   - Each note sounds for (1 - gapRatio) of its slot.
 */
export function sonify(graph: Graph, overrides: Partial<ProtocolOptions> = {}): Sonification {
  const opts: ProtocolOptions = { ...DEFAULT_OPTIONS, ...overrides }
  const { points } = graph
  validateGraph(graph)
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

  const first = axisPosition(graph, points[0].x)
  const last = axisPosition(graph, points.at(-1)!.x)
  const positions: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = axisPosition(graph, points[i].x), b = axisPosition(graph, points[i + 1].x)
    const subdivisions = Math.max(1, Math.round(opts.durationMs / opts.noteMs * (b - a) / (last - first)))
    for (let j = 0; j < subdivisions; j++) positions.push(a + (b - a) * j / subdivisions)
  }
  positions.push(last)
  const slotMs = opts.durationMs / positions.length
  const starts = positions.map((position) => last === first ? 0 : (position - first) / (last - first) * (opts.durationMs - slotMs))
  const notes: Note[] = positions.map((position, index) => {
    const x = rawX(graph, position)
    const value = evaluateGraph(graph, x)
    const midi = toMidi(value)
    return {
      index, pointIndex: Math.round(observationAt(graph, x)), x, value, midi,
      name: midiToName(midi), startMs: starts[index],
      durationMs: ((starts[index + 1] ?? opts.durationMs) - starts[index]) * (1 - opts.gapRatio),
    }
  })

  return {
    graphId: graph.id,
    pitchRange: { low: opts.lowestMidi, high: opts.highestMidi },
    durationMs: opts.durationMs,
    trough: anchor(troughValue),
    peak: anchor(peakValue),
    start: anchor(points[0].y),
    unitsPerStep,
    stepSemitones: opts.stepSemitones,
    notes,
  }
}

/** Descriptive narration labels every reference; it never gives extrema positions. */
export function buildPreamble(s: Sonification, graph: Graph): PreambleItem[] {
  const note = (midi: number): PreambleItem => ({ note: midi, name: midiToName(midi), ms: 450 })
  const [, y] = describeAxes(graph)
  return [
    { say: `${graph.title}.` }, { say: y },
    { say: `The lowest recorded value is ${formatValue(graph, s.trough.value)}. Here is the lowest reference note.` },
    note(s.trough.midi),
    { say: `The highest recorded value is ${formatValue(graph, s.peak.value)}. Here is the highest reference note.` },
    note(s.peak.midi),
    { say: `The graph starts at ${formatValue(graph, s.start.value)}. Here is the starting reference note.` },
    note(s.start.midi),
    { say: `${describePitchReference(graph, s)} Here are two notes ${s.stepSemitones === 1 ? 'one semitone' : `${s.stepSemitones} semitones`} apart.` },
    note(s.trough.midi), note(s.trough.midi + s.stepSemitones),
    ...describePlaybackParts(graph, s).map((say) => ({ say })),
  ]
}

export function preambleText(items: PreambleItem[]): string {
  return items.map((i) => ('say' in i ? i.say : i.frequencyHz ? '[Reference tone]' : `[${i.name}]`)).join(' ')
}
