import type { Graph, Sonification } from '../types.ts'
import { axisPosition } from './coordinates.ts'

/** Describe the sequence that was generated, excluding the final hold and decay.
 * A note interval is the span between two successive attacks, not a pitch step. */
export function generatedMapping(g: Graph, s: Sonification) {
  const first = s.notes[0], last = s.notes.at(-1)
  if (!first || !last || s.notes.length < 2) return null
  const span = axisPosition(g, last.x) - axisPosition(g, first.x)
  if (!(span > 0)) return null
  const noteIntervalsPerUnit = (s.notes.length - 1) / span
  const secondsPerUnit = (last.startMs - first.startMs) / 1000 / span
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b))
  const uniform = s.notes.slice(1).every((n, i) => {
    const previous = s.notes[i]
    const distance = axisPosition(g, n.x) - axisPosition(g, previous.x)
    return distance > 0 && close(1 / distance, noteIntervalsPerUnit)
      && close((n.startMs - previous.startMs) / 1000 / distance, secondsPerUnit)
  })
  return { noteIntervalsPerUnit, secondsPerUnit, uniform }
}
