import type { Graph, PlaybackPosition, Point, Sonification } from '../types.ts'

export const axisKind = (g: Graph) => g.xKind ?? (g.xLabels ? 'categorical' : 'numeric')
export const interpolation = (g: Graph) => g.interpolation ?? (axisKind(g) === 'categorical' ? 'step' : 'linear')

export function validateGraph(g: Graph): void {
  if (!g.points.length) throw new Error('Cannot sonify an empty graph')
  if (g.xLabels && g.xLabels.length !== g.points.length) throw new Error('Each observation needs an x label')
  if (axisKind(g) === 'categorical' && !g.xLabels) throw new Error('Categorical axes require labels')
  if (g.valueUnit && (!(g.valueUnit.scale > 0) || !Number.isFinite(g.valueUnit.scale))) throw new Error('Value unit scale must be positive and finite')
  g.points.forEach((p, i) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('Graph coordinates must be finite')
    if (i && p.x <= g.points[i - 1].x) throw new Error('Graph x coordinates must increase strictly')
  })
}

/** Fractional observation index at a raw x; also used for categorical labels. */
export function observationAt(g: Graph, x: number): number {
  const p = g.points
  if (x <= p[0].x) return 0
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i].x) return i - 1 + (x - p[i - 1].x) / (p[i].x - p[i - 1].x)
  }
  return p.length - 1
}
export function axisPosition(g: Graph, x: number): number {
  return axisKind(g) === 'categorical' ? observationAt(g, x) : x
}
export function rawX(g: Graph, axis: number): number {
  if (axisKind(g) === 'numeric') return axis
  const i = Math.min(g.points.length - 1, Math.max(0, Math.floor(axis)))
  const next = g.points[Math.min(i + 1, g.points.length - 1)]
  return g.points[i].x + (next.x - g.points[i].x) * (axis - i)
}
/** Shared curve policy for resampling and chart geometry, on the raw x domain. */
export function evaluateGraph(g: Graph, x: number): number {
  const t = observationAt(g, x)
  const i = Math.floor(t)
  const next = g.points[Math.min(i + 1, g.points.length - 1)]
  return interpolation(g) === 'step' ? g.points[i].y : g.points[i].y + (next.y - g.points[i].y) * (t - i)
}

/** Discrete piano uses sample-and-hold: report the interpolated source value
 * of the last attack reached, including its gap/tail, never a future sample.
 * Values are not reverse-engineered from quantized MIDI pitches. */
export function positionAtTime(s: Sonification, elapsedMs: number): PlaybackPosition | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !s.notes.length || elapsedMs < s.notes[0].startMs) return null
  let lo = 0, hi = s.notes.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (s.notes[mid].startMs <= elapsedMs) lo = mid + 1
    else hi = mid
  }
  const note = s.notes[Math.max(0, lo - 1)]
  return { graphId: s.graphId, elapsedMs, index: note.index, x: note.x, value: note.value }
}

/** Convert the shared sampled coordinate to chart geometry without rounding. */
export function chartPosition(s: Sonification, activeIndex: number, stopped: PlaybackPosition | null, live?: PlaybackPosition | null): Point | null {
  if (live?.graphId === s.graphId && activeIndex >= 0) return { x: live.x, y: live.value }
  const active = s.notes[activeIndex]
  if (active) return { x: active.x, y: active.value }
  return stopped?.graphId === s.graphId ? { x: stopped.x, y: stopped.value } : null
}
