/**
 * Seeded graph + question generator.
 *
 * Shape first, context second, noise last:
 *   1. a shape family (rise, fall, peak, valley, spike, plateau) fixes the answer,
 *   2. a context template dresses it as plausible data with real axes and units,
 *   3. a Fourier noise layer (random-phase sinusoids, 1/f^β amplitudes) is the
 *      difficulty dial, together with point count and the audibility margin.
 * A sample is rejected unless the answer beats its rivals by `margin`
 * semitones after the real pitch mapping, so "hard" never means "unanswerable".
 * Same (seed, difficulty) always gives the same set.
 */
import { sonify } from '../audio/sonification.ts'
import { validateGraph } from '../graph/coordinates.ts'
import type { Graph, GraphDifficulty, Question } from '../types.ts'

export interface Generated { graph: Graph; question: Question }
export interface Bank { questions: Question[]; graphs: Record<string, Graph> }

/** mulberry32: tiny seeded PRNG, uniform in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LEVELS: Record<GraphDifficulty, { n: number; noise: number; k: number; margin: number }> = {
  easy: { n: 8, noise: 0, k: 0, margin: 3 },
  medium: { n: 12, noise: 0.12, k: 3, margin: 2 },
  hard: { n: 16, noise: 0.22, k: 5, margin: 2 },
}

type Family = 'rising' | 'falling' | 'peak' | 'valley' | 'spike' | 'plateau'
const FAMILIES: Family[] = ['rising', 'falling', 'peak', 'valley', 'spike', 'plateau']
const DESCRIPTION: Record<Family, string> = {
  rising: 'Steadily rising',
  falling: 'Steadily falling',
  peak: 'Rises to a peak, then falls',
  valley: 'Dips, then recovers',
  spike: 'Flat with one sudden spike',
  plateau: 'Rises, then levels off',
}

/** Normalised shape in [0, 1]. `p` is where the turning point sits. */
function shape(family: Family, n: number, rand: () => number): number[] {
  const p = 0.3 + rand() * 0.4
  const s = Math.round(p * (n - 1))
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    switch (family) {
      case 'rising': return t
      case 'falling': return 1 - t
      case 'peak': return t < p ? t / p : 1 - (t - p) / (1 - p)
      case 'valley': return t < p ? 1 - t / p : (t - p) / (1 - p)
      case 'spike': return i === s ? 1 : 0.1 + 0.05 * rand()
      case 'plateau': return Math.min(1, t / p)
    }
  })
}

/** Sum of k random-phase sinusoids with 1/f^β amplitudes, scaled to about [-1, 1]. */
export function fourierNoise(n: number, k: number, rand: () => number, beta = 1): number[] {
  if (k === 0) return Array.from({ length: n }, () => 0)
  const comps = Array.from({ length: k }, (_, i) => ({ f: i + 1 + rand(), phase: rand() * 2 * Math.PI, amp: 1 / (i + 1) ** beta }))
  const total = comps.reduce((sum, c) => sum + c.amp, 0)
  return Array.from({ length: n }, (_, i) => comps.reduce((sum, c) => sum + c.amp * Math.sin((2 * Math.PI * c.f * i) / (n - 1) + c.phase), 0) / total)
}

interface Context {
  title: (n: number) => string
  xLabel: string
  labels: (n: number) => string[]
  yLabel: string
  unit?: string
  valueUnit?: Graph['valueUnit']
  base: [number, number]
  span: [number, number]
  decimals: number
}
const hour = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`
const CONTEXTS: Context[] = [
  { title: (n) => `Daily high temperature, ${n} days`, xLabel: 'Day', labels: (n) => Array.from({ length: n }, (_, i) => `Day ${i + 1}`), yLabel: 'Temperature', unit: '°F', base: [45, 70], span: [15, 30], decimals: 0 },
  { title: (n) => `Share price, ${n} trading days`, xLabel: 'Day', labels: (n) => Array.from({ length: n }, (_, i) => `Day ${i + 1}`), yLabel: 'Share price', unit: '$', base: [80, 120], span: [10, 40], decimals: 0 },
  { title: () => 'Website visitors through the day', xLabel: 'Hour', labels: (n) => Array.from({ length: n }, (_, i) => hour(6 + i)), yLabel: 'Visitors per minute', valueUnit: { name: 'visitors per minute', scale: 1, description: 'visitors per minute' }, base: [20, 60], span: [20, 60], decimals: 0 },
  { title: () => 'Relative humidity through the day', xLabel: 'Hour', labels: (n) => Array.from({ length: n }, (_, i) => hour(6 + i)), yLabel: 'Humidity', unit: '%', base: [40, 65], span: [15, 30], decimals: 0 },
  { title: (n) => `Weekly active users, ${n} weeks`, xLabel: 'Week', labels: (n) => Array.from({ length: n }, (_, i) => `Week ${i + 1}`), yLabel: 'Active users', unit: 'k', base: [20, 60], span: [10, 30], decimals: 1 },
]

const between = ([lo, hi]: [number, number], rand: () => number) => lo + rand() * (hi - lo)

/** Try once; returns null when the answer is not audibly unambiguous. */
function attempt(id: string, family: Family, ctx: Context, level: GraphDifficulty, rand: () => number): Generated | null {
  const { n, noise, k, margin } = LEVELS[level]
  const base = between(ctx.base, rand), span = between(ctx.span, rand)
  const noiseLayer = fourierNoise(n, k, rand)
  const ys = shape(family, n, rand).map((v, i) => Number((base + span * (v + noise * noiseLayer[i])).toFixed(ctx.decimals)))
  const labels = ctx.labels(n)
  const graph: Graph = {
    id, title: ctx.title(n), xLabel: ctx.xLabel, xLabels: labels, xKind: 'categorical', interpolation: 'linear',
    yLabel: ctx.yLabel, unit: ctx.unit, valueUnit: ctx.valueUnit, stage: 'test', difficulty: level,
    points: ys.map((y, x) => ({ x, y })),
  }
  const midi = sonify(graph).notes.filter((note) => Number.isInteger(note.x)).map((note) => note.midi)

  if (family === 'peak' || family === 'valley' || family === 'spike') {
    // "Where is it?" questions: the extreme must beat every non-neighbour by `margin` semitones.
    const sign = family === 'valley' ? -1 : 1
    const target = ys.reduce((best, y, i) => (sign * y > sign * ys[best] ? i : best), 0)
    const rivals = midi.filter((_, i) => Math.abs(i - target) > 1)
    const best = Math.max(...rivals.map((m) => sign * m))
    if (sign * midi[target] - best < margin) return null
    const others = labels.filter((_, i) => Math.abs(i - target) > 1)
    const choices = shuffle([labels[target], ...shuffle(others, rand).slice(0, 3)], rand)
    const what = family === 'valley' ? 'lowest' : family === 'spike' ? 'sudden spike' : 'highest'
    return { graph, question: { id: `${id}-q`, graphId: id, prompt: `Which ${ctx.xLabel.toLowerCase()} had the ${what}${family === 'spike' ? '' : ' value'}?`, choices, correctIndex: choices.indexOf(labels[target]), explanation: `${DESCRIPTION[family]}. The ${what} is at ${labels[target]}.` } }
  }

  // "What shape?" questions: the overall move must be at least `margin` semitones.
  const end = family === 'plateau' ? Math.max(...midi) : midi[n - 1]
  if (Math.abs(end - midi[0]) < margin) return null
  const distractors = shuffle(FAMILIES.filter((f) => f !== family), rand).slice(0, 3).map((f) => DESCRIPTION[f])
  const choices = shuffle([DESCRIPTION[family], ...distractors], rand)
  return { graph, question: { id: `${id}-q`, graphId: id, prompt: 'Which description matches what you heard?', choices, correctIndex: choices.indexOf(DESCRIPTION[family]), explanation: `${DESCRIPTION[family]}: from ${ys[0]} to ${ys[n - 1]}.` } }
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Generate `count` graph/question pairs. Deterministic for a given seed and level. */
export function generate(seed: number, level: GraphDifficulty = 'medium', count = 10): Generated[] {
  const rand = rng(seed)
  const out: Generated[] = []
  for (let i = 0; out.length < count && i < count * 30; i++) {
    const item = attempt(`gen-${seed}-${level}-${out.length}`, FAMILIES[out.length % FAMILIES.length], CONTEXTS[i % CONTEXTS.length], level, rand)
    if (item) {
      validateGraph(item.graph)
      out.push(item)
    }
  }
  if (out.length < count) throw new Error(`Could only generate ${out.length} of ${count} items`)
  return out
}

export function toBank(items: Generated[]): Bank {
  return { questions: items.map((i) => i.question), graphs: Object.fromEntries(items.map((i) => [i.graph.id, i.graph])) }
}
