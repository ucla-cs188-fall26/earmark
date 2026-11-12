import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Graph } from '../types.ts'
import { GRAPH_LIBRARY, getGraph } from '../data/graphs.ts'
import { buildPreamble, preambleText, sonify } from '../audio/sonification.ts'
import { describeMapping, describeObservationChange, describePitchReference } from './descriptions.ts'
import { generatedMapping } from './mapping.ts'
import { ProtocolSummary } from '../components/ProtocolSummary.tsx'

const flu = getGraph('test-flat-then-surge')

describe('generated sequence mapping', () => {
  it('calculates the flu graph mapping without including the final hold as another week', () => {
    const s = sonify(flu), mapping = generatedMapping(flu, s)!
    expect(s.notes).toHaveLength(56)
    expect(mapping.noteIntervalsPerUnit).toBe(5)
    expect(mapping.secondsPerUnit).toBeCloseTo(0.5357142857)
    expect(mapping.uniform).toBe(true)
    // Dividing the full 6-second duration by 11 instead would incorrectly round to 0.55.
    expect(describeMapping(flu, s)).toContain('5 note intervals and approximately 0.54 seconds')
    expect(describePitchReference(flu, s)).toBe('Each semitone represents 1 search interest index point.')
  })
  it('uses the actual note count and attack timestamps, not a graph-specific constant', () => {
    const s = sonify(flu)
    const sparse = { ...s, notes: s.notes.filter((_, i) => i % 5 === 0).map((n, index) => ({ ...n, index })) }
    expect(generatedMapping(flu, sparse)?.noteIntervalsPerUnit).toBe(1)
    expect(describeMapping(flu, sparse)).toContain('1 note interval')
    const slower = { ...s, notes: s.notes.map((n) => ({ ...n, startMs: n.startMs * 2 })) }
    expect(generatedMapping(flu, slower)?.secondsPerUnit).toBeCloseTo(1.0714285714)
    expect(describeMapping(flu, slower)).toContain('1.07 seconds')
  })
  it('adapts to duration and note-density overrides', () => {
    const s = sonify(flu, { durationMs: 9000, noteMs: 500 })
    const mapping = generatedMapping(flu, s)!
    expect(mapping.noteIntervalsPerUnit).toBe(2)
    expect(mapping.secondsPerUnit).toBeCloseTo((s.notes.at(-1)!.startMs - s.notes[0].startMs) / 11000)
    expect(describeMapping(flu, s)).not.toContain('5 note intervals')
  })
  it('uses numeric x distance for irregular series and labels varying density as an average', () => {
    const g: Graph = { id: 'irregular', title: 'Measurements', xLabel: 'Time', xUnit: 'seconds', yLabel: 'Height', points: [{ x: 10, y: 0 }, { x: 11, y: 20 }, { x: 100, y: 2 }] }
    const s = sonify(g), mapping = generatedMapping(g, s)!
    expect(mapping.noteIntervalsPerUnit).toBeCloseTo((s.notes.length - 1) / 90)
    expect(mapping.uniform).toBe(false)
    expect(describeMapping(g, s)).toContain('One second')
    expect(describeMapping(g, s)).toContain('an average of')
  })
  it('counts categorical observation intervals rather than numeric storage keys', () => {
    const g: Graph = { ...flu, points: [{ x: 10, y: 0 }, { x: 1000, y: 4 }], xLabels: ['Week 1', 'Week 2'] }
    const s = sonify(g)
    expect(generatedMapping(g, s)?.noteIntervalsPerUnit).toBe(s.notes.length - 1)
    expect(describeMapping(g, s)).toContain('One week')
  })
  it('does not invent an interval for a single observation', () => {
    const g = { ...flu, points: [{ x: 10, y: 4 }], xLabels: ['Week 1'] }
    const s = sonify(g)
    expect(generatedMapping(g, s)).toBeNull()
    expect(describeMapping(g, s)).toContain('only one observation')
    expect(describeMapping(g, s)).not.toMatch(/NaN|Infinity/)
  })
  it('converts pitch steps to Y units per semitone independently of time and actual Y changes', () => {
    const s = sonify(flu, { stepSemitones: 2, unitsPerStep: 4 })
    expect(describePitchReference(flu, s)).toBe('Each semitone represents 2 search interest index points.')
    const g = getGraph('test-ambiguous-rise')
    expect(describePitchReference(g, sonify(g))).toBe('Each semitone represents 500 users.')
  })
  it('shares the same short mapping between visual and spoken guides, without claiming constant slope', () => {
    for (const g of GRAPH_LIBRARY) {
      const s = sonify(g), mapping = describeMapping(g, s)
      const narration = preambleText(buildPreamble(s, g))
      const html = renderToStaticMarkup(createElement(ProtocolSummary, { graph: g, sonification: s }))
      expect(narration).toContain(mapping)
      expect(html).toContain(mapping)
      expect(mapping).toContain('can differ between successive observations')
      expect(mapping).toContain('does not imply a fixed change in value')
      expect(narration).not.toMatch(/interpolat|sampled notes|release tails|rounded|audio.clock|quantiz/i)
    }
  })
})

describe('explicit observation changes (data view only)', () => {
  it('reports different Y changes for successive weeks with meaningful units', () => {
    expect(describeObservationChange(flu, 6, 7)).toBe('From Week 7 to Week 8, search interest increases by 5 search interest index points.')
    expect(describeObservationChange(flu, 7, 8)).toContain('increases by 6 search interest index points')
    expect(describeObservationChange(flu, 1, 2)).toContain('decreases by 2 search interest index points')
  })
  it('supports nonadjacent, reversed and identical observations', () => {
    expect(describeObservationChange(flu, 0, 11)).toContain('increases by 26 search interest index points')
    expect(describeObservationChange(flu, 11, 0)).toContain('decreases by 26 search interest index points')
    expect(describeObservationChange(flu, 0, 0)).toContain('does not change (0 search interest index points)')
  })
  it('applies unit scales to the change and keeps point values unmodified', () => {
    const g = getGraph('test-multi-peak'), original = JSON.stringify(g)
    expect(describeObservationChange(g, 0, 9)).toContain('increases by 12,000,000 dollars')
    expect(JSON.stringify(g)).toBe(original)
  })
  it('does not include observation differences in the pre-answer guide', () => {
    const text = preambleText(buildPreamble(sonify(flu), flu))
    expect(text).not.toMatch(/Week 7|Week 8|increases by|decreases by/)
    const html = renderToStaticMarkup(createElement(ProtocolSummary, { graph: flu, sonification: sonify(flu) }))
    expect(html).not.toContain('Compare values')
    expect(html).not.toContain('Inspect the Y change')
  })
})
