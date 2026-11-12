import { describe, expect, it } from 'vitest'
import { buildPreamble, midiToName, nameToMidi, niceStep, preambleText, sonify } from './sonification.ts'
import { DEFAULT_OPTIONS } from '../types.ts'
import type { Graph } from '../types.ts'

const series = (ys: number[], id = 's'): Graph => ({
  id,
  title: id,
  xLabel: 'Month',
  yLabel: 'Rate',
  unit: '%',
  points: ys.map((y, x) => ({ x, y })),
})

describe('note helpers', () => {
  it('round-trips names and midi', () => {
    expect(midiToName(60)).toBe('C4')
    expect(midiToName(69)).toBe('A4')
    expect(nameToMidi('C3')).toBe(48)
    expect(nameToMidi('F#4')).toBe(66)
    expect(nameToMidi(midiToName(84))).toBe(84)
  })
})

describe('niceStep', () => {
  it('rounds up to 1 / 2 / 2.5 / 5 × 10^k', () => {
    expect(niceStep(0.3)).toBe(0.5)
    expect(niceStep(1)).toBe(1)
    expect(niceStep(1.1)).toBe(2)
    expect(niceStep(2.2)).toBe(2.5)
    expect(niceStep(3)).toBe(5)
    expect(niceStep(7)).toBe(10)
    expect(niceStep(0)).toBe(1)
  })
})

describe('sonify', () => {
  const s = sonify(series([10, 20, 15, 40, 5]))

  it('resamples to short notes spanning the whole duration', () => {
    const target = DEFAULT_OPTIONS.durationMs / DEFAULT_OPTIONS.noteMs
    expect(s.notes.length).toBeGreaterThanOrEqual(target * 0.9)
    expect(s.notes.length).toBeLessThanOrEqual(target * 1.2)
    expect(s.notes[0].startMs).toBe(0)
    const last = s.notes[s.notes.length - 1]
    expect(last.startMs + last.durationMs).toBeLessThanOrEqual(s.durationMs)
    expect(s.notes[0].pointIndex).toBe(0)
    expect(last.pointIndex).toBe(4)
  })

  it('never has fewer notes than data points', () => {
    const dense = sonify(series(Array.from({ length: 200 }, (_, i) => i)))
    expect(dense.notes.length).toBeGreaterThanOrEqual(200)
  })

  it('interpolates between points and still sounds every data point exactly', () => {
    const two = sonify(series([0, 10]), { noteMs: 3000, durationMs: 6000 })
    expect(two.notes.map((n) => n.value)).toEqual([0, 5, 10])
    const exact = s.notes.filter((n) => Number.isInteger(n.x)).map((n) => n.value)
    expect(exact).toEqual([10, 20, 15, 40, 5])
  })

  it('anchors the trough to the lowest allowed note', () => {
    expect(s.trough.value).toBe(5)
    expect(s.trough.midi).toBe(DEFAULT_OPTIONS.lowestMidi)
  })

  it('keeps every note inside the comfortable range on a chromatic grid', () => {
    for (const n of s.notes) {
      expect(n.midi).toBeGreaterThanOrEqual(DEFAULT_OPTIONS.lowestMidi)
      expect(n.midi).toBeLessThanOrEqual(DEFAULT_OPTIONS.highestMidi)
      expect(Number.isInteger(n.midi)).toBe(true)
    }
  })

  it('supports a whole-step grid when asked', () => {
    const ws = sonify(series([10, 20, 15, 40, 5]), { stepSemitones: 2 })
    for (const n of ws.notes) expect((n.midi - DEFAULT_OPTIONS.lowestMidi) % 2).toBe(0)
  })

  it('reports start/peak anchors consistently with the notes', () => {
    expect(s.start.midi).toBe(s.notes[0].midi)
    expect(s.peak.midi).toBe(Math.max(...s.notes.map((n) => n.midi)))
  })

  it('maps higher values to higher (or equal) pitches', () => {
    const mono = sonify(series([1, 2, 3, 4, 5, 6, 7, 8]))
    for (let i = 1; i < mono.notes.length; i++) {
      expect(mono.notes[i].midi).toBeGreaterThanOrEqual(mono.notes[i - 1].midi)
    }
  })

  it('handles a flat series', () => {
    const flat = sonify(series([3, 3, 3]))
    expect(new Set(flat.notes.map((n) => n.midi)).size).toBe(1)
    expect(flat.unitsPerStep).toBe(1)
  })

  it('respects an explicit unitsPerStep', () => {
    const fixed = sonify(series([0, 10, 20]), { unitsPerStep: 10, noteMs: 6000 })
    expect(fixed.notes.map((n) => n.midi)).toEqual([48, 49, 50])
  })

  it('rejects an empty series', () => {
    expect(() => sonify(series([]))).toThrow()
  })

  it('packs the preamble as notes and numbers in the fixed order', () => {
    const g = series([10, 20, 15, 40, 5])
    const items = buildPreamble(s, g)
    expect(preambleText(items)).toBe('Month. Rate, %. 6 [C3] 5 [B5] 40 [F3] 10 [C3] [C#3] 1')
    // spoken tokens are numbers only, apart from the axes
    const spoken = items.flatMap((i) => ('say' in i ? [i.say] : []))
    expect(spoken.slice(1).every((t) => /^-?\d+(\.\d+)?$/.test(t))).toBe(true)
    // the reference notes are exactly the anchors
    const notes = items.flatMap((i) => ('note' in i ? [i.note] : []))
    expect(notes).toEqual([s.trough.midi, s.peak.midi, s.start.midi, s.trough.midi, s.trough.midi + 1])
  })
})
