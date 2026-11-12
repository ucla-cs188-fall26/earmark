import { describe, expect, it } from 'vitest'
import type { Graph } from '../types.ts'
import { sonify } from '../audio/sonification.ts'
import { axisPosition, evaluateGraph, positionAtTime, rawX, validateGraph } from './coordinates.ts'

const numeric: Graph = { id: 'irregular', title: 'Irregular measurements', xLabel: 'Time', xUnit: 'seconds', yLabel: 'Value', points: [{ x: 10, y: 0 }, { x: 11, y: 10 }, { x: 100, y: 20 }] }
const categories: Graph = { ...numeric, xKind: 'categorical', xLabels: ['First', 'Second', 'Third'] }

describe('shared coordinate policy', () => {
  it('interpolates numeric values at actual irregular x coordinates', () => {
    expect(evaluateGraph(numeric, 10.5)).toBe(5)
    expect(evaluateGraph(numeric, 55.5)).toBe(15)
    expect(evaluateGraph(numeric, -10)).toBe(0)
    expect(evaluateGraph(numeric, 200)).toBe(20)
  })
  it('gives irregular numeric distances proportional playback time', () => {
    const s = sonify(numeric)
    const middle = s.notes.find((n) => n.x === 11)!
    const end = s.notes.at(-1)!
    expect(middle.startMs / end.startMs).toBeCloseTo(1 / 90)
    expect(s.notes.filter((n) => [10, 11, 100].includes(n.x)).map((n) => n.value)).toEqual([0, 10, 20])
  })
  it('gives explicitly categorical samples equal time despite their numeric keys', () => {
    const s = sonify(categories)
    const middle = s.notes.find((n) => n.x === 11)!
    expect(middle.startMs / s.notes.at(-1)!.startMs).toBeCloseTo(0.5)
    expect(rawX(categories, 1.5)).toBe(55.5)
    expect(axisPosition(categories, 55.5)).toBe(1.5)
  })
  it('holds categorical steps by default rather than inventing intermediate values', () => {
    expect(evaluateGraph(categories, 10.5)).toBe(0)
    expect(evaluateGraph(categories, 11)).toBe(10)
    expect(new Set(sonify(categories).notes.map((n) => n.value))).toEqual(new Set([0, 10, 20]))
  })
  it('allows linear categorical estimates only when explicit', () => {
    expect(evaluateGraph({ ...categories, interpolation: 'linear' }, 10.5)).toBe(5)
    expect(sonify({ ...categories, interpolation: 'linear' }).notes.some((n) => n.value > 0 && n.value < 10)).toBe(true)
  })
  it('supports a single observation with a nonzero x coordinate', () => {
    const s = sonify({ ...numeric, points: [{ x: 42, y: 7 }] })
    expect(s.notes).toHaveLength(1)
    expect(positionAtTime(s, 0)).toMatchObject({ x: 42, value: 7 })
  })
  it.each([
    { ...numeric, points: [] },
    { ...numeric, points: [{ x: 0, y: NaN }] },
    { ...numeric, points: [{ x: 1, y: 0 }, { x: 1, y: 1 }] },
    { ...numeric, points: [{ x: 1, y: 0 }, { x: 0, y: 1 }] },
    { ...categories, xLabels: ['Only one'] },
    { ...categories, xLabels: undefined },
    { ...numeric, valueUnit: { name: 'items', description: 'items', scale: 0 } },
  ])('rejects invalid graph domains instead of fabricating coordinates', (g) => {
    expect(() => validateGraph(g)).toThrow()
  })
  it('reports the actual sampled interpolation, not the nearest observation', () => {
    const g = { ...numeric, points: [{ x: 0, y: 5 }, { x: 1, y: 15 }] }
    const s = sonify(g, { durationMs: 6000, noteMs: 3000 })
    expect(positionAtTime(s, 2000)).toMatchObject({ x: 0.5, value: 10, index: 1 })
    expect(g.points[s.notes[1].pointIndex].y).toBe(15) // former erroneous Stop value
  })
  it('uses sample-and-hold boundaries and never returns a future sample', () => {
    const s = sonify(numeric)
    const next = s.notes[1]
    expect(positionAtTime(s, -0.001)).toBeNull()
    expect(positionAtTime(s, NaN)).toBeNull()
    expect(positionAtTime({ ...s, notes: s.notes.map((n) => ({ ...n, startMs: n.startMs + 100 })) }, 50)).toBeNull()
    expect(positionAtTime(s, next.startMs - 0.001)?.index).toBe(0)
    expect(positionAtTime(s, next.startMs)?.index).toBe(1)
    expect(positionAtTime(s, s.durationMs + 500)?.index).toBe(s.notes.length - 1)
  })
})
