import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getGraph } from '../data/graphs.ts'
import { sonify } from '../audio/sonification.ts'
import { ProtocolSummary } from './ProtocolSummary.tsx'
import { GraphReveal } from './GraphReveal.tsx'
import { LineChart } from './LineChart.tsx'
import { NoteTable } from './NoteTable.tsx'
import { ProtocolIntro } from './ProtocolIntro.tsx'
import { StoppedPosition } from './StoppedPosition.tsx'
import type { Player } from '../audio/usePlayer.ts'

const graph = getGraph('temperature'), s = sonify(graph)
describe('accessible graph context rendering', () => {
  it('provides pre-answer context without the visual graph or full observation table', () => {
    const html = renderToStaticMarkup(createElement(ProtocolSummary, { graph, sonification: s }))
    expect(html).toContain('X-to-audio mapping')
    expect((html.match(/<dt>/g) ?? [])).toHaveLength(5)
    expect(html).not.toContain('Inspect the Y change')
    expect(html).not.toMatch(/interpolat|sampled notes|release tails|pitch rounding|audio.clock/i)
    expect(html).toContain('Vertical axis')
    expect(html).toContain('degrees Fahrenheit')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<table')
  })
  it('offers the recorded data table wherever the reveal graph is shown', () => {
    const html = renderToStaticMarkup(createElement(GraphReveal, { graph, sonification: s }))
    expect(html).toContain('<svg')
    expect(html).toContain('<summary>Recorded graph data (accessible table)</summary>')
    expect(html).toContain('January')
    expect(html).toContain('34 degrees Fahrenheit')
    expect(html).toContain('scope="col"')
    expect(html).toContain('Inspect the Y change between two observations')
    expect(html).toContain('From observation')
    expect(html).toContain('To observation')
  })
  it('keeps test onboarding free of the scored stimulus and chart', () => {
    const player: Player = { status: 'idle', activeIndex: -1, error: null, stoppedPosition: null, play: vi.fn(), stop: vi.fn(), reset: vi.fn(), stopAndAnnounce: vi.fn() }
    const html = renderToStaticMarkup(createElement(ProtocolIntro, { player, mode: 'test', onStart: vi.fn() }))
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('Monthly active users')
    expect(html).not.toContain('Inspect the Y change')
  })
  it('renders the exact interpolated sample position rather than the nearest source point', () => {
    const g = { ...graph, xLabels: undefined, xKind: 'numeric' as const, points: [{ x: 10, y: 5 }, { x: 11, y: 15 }] }
    const generated = sonify(g, { noteMs: 3000 })
    const html = renderToStaticMarkup(createElement(NoteTable, { graph: g, sonification: generated, activeIndex: 1 }))
    expect(html).toContain('10.5')
    expect(html).toContain('10 degrees Fahrenheit')
  })
  it('draws held-step paths and does not create pointer-only data inspection', () => {
    const html = renderToStaticMarkup(createElement(LineChart, { series: { ...graph, interpolation: 'step' }, activePosition: { x: 0.5, y: 34 } }))
    expect(html).toMatch(/d="M[^"\s]* H/)
    expect(html).toContain('marker--active')
    expect(html).not.toContain('tooltip')
  })
  it('retains stopped coordinates without broadcasting each position as a live region', () => {
    const html = renderToStaticMarkup(createElement(StoppedPosition, { graph, position: { graphId: graph.id, x: 3.5, value: 64.5, index: 2, elapsedMs: 2000 } }))
    expect(html).toContain('Stopped playback position')
    expect(html).toContain('64.5 degrees Fahrenheit')
    expect(html).not.toContain('aria-live')
    expect(renderToStaticMarkup(createElement(StoppedPosition, { graph, position: null }))).toBe('')
  })
})
