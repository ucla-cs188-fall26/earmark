import { describe, expect, it } from 'vitest'
import { GRAPH_LIBRARY, getGraph } from '../data/graphs.ts'
import { buildPreamble, preambleText, sonify } from '../audio/sonification.ts'
import { describeAxes, describeMapping, describeStop, formatValue, formatX } from './descriptions.ts'

describe('descriptive graph context', () => {
  it('expands months and thousands and labels all reference notes without changing raw data', () => {
    const g = getGraph('test-ambiguous-rise'), original = JSON.stringify(g)
    const text = preambleText(buildPreamble(sonify(g), g))
    expect(text).toContain('from January to December')
    expect(text).toContain('12 ordered observations')
    expect(text).toContain('thousands of users')
    expect(text).toContain('lowest recorded value is 42,000 users')
    expect(text).toContain('highest recorded value is 58,000 users')
    expect(text).toContain('starting reference note')
    expect(text).toContain('Each semitone represents 500 users')
    expect(JSON.stringify(g)).toBe(original)
    expect(formatValue({ ...g, valueUnit: { name: 'volts', description: 'volts', scale: 1 } }, 0.000000005)).toBe('0.000000005 volts')
  })
  it('never discloses extrema locations in a reference sentence for Test graphs', () => {
    for (const g of GRAPH_LIBRARY.filter((g) => g.stage === 'test')) {
      const items = buildPreamble(sonify(g), g)
      const references = items.flatMap((i) => 'say' in i && /(?:lowest|highest) recorded value/.test(i.say) ? [i.say] : [])
      expect(references).toHaveLength(2)
      for (const sentence of references) {
        for (const p of g.points) expect(sentence).not.toContain(formatX(g, p.x))
      }
    }
  })
  it.each([['test-multi-peak', 70, '70,000,000 dollars'], ['test-reverse-wave', 60, '60,000 dollars'], ['temperature', 34, '34 degrees Fahrenheit'], ['test-final-dip', 65, '65 percent']] as const)('expands units for %s', (id, raw, expected) => {
    expect(formatValue(getGraph(id), raw)).toBe(expected)
  })
  it('provides axes, ranges, units and a labeled duration for every library graph', () => {
    for (const g of GRAPH_LIBRARY) {
      const s = sonify(g), text = preambleText(buildPreamble(s, g))
      expect(describeAxes(g)).toHaveLength(2)
      for (const label of [g.title, 'horizontal axis', 'vertical axis', 'lowest recorded value', 'highest recorded value', '6 seconds']) expect(text).toContain(label)
      expect(text).not.toContain('undefined')
      for (const item of buildPreamble(s, g)) if ('say' in item) expect(item.say.length).toBeLessThan(250)
    }
  })
  it('formats a categorical interpolation honestly as between categories', () => {
    const g = getGraph('temperature')
    expect(formatX(g, 3.5)).toBe('50 percent of the way from April to May')
    const text = describeStop(g, { graphId: g.id, index: 1, elapsedMs: 2000, x: 3.5, value: 64.5 })
    expect(text).toContain('Month: 50 percent of the way from April to May')
    expect(text).toContain('Temperature: 64.5 degrees Fahrenheit')
    expect(text).toContain('estimate between recorded observations')
  })
  it('explains numerical duration-to-domain mapping and categorical step sampling', () => {
    const numeric = { ...getGraph('rising'), xUnit: 'seconds' }
    expect(describeMapping(numeric, sonify(numeric))).toContain('Equal numeric distances')
    const categories = { ...getGraph('temperature'), interpolation: 'step' as const }
    expect(describeMapping(categories, sonify(categories))).toContain('Values are held until the next observation')
    expect(formatX(categories, 3.5)).toBe('April, held until May')
  })
  it('describes the configured pitch interval, not an assumed semitone', () => {
    const g = getGraph('rising'), s = sonify(g, { stepSemitones: 2 })
    expect(preambleText(buildPreamble(s, g))).toContain('Each 2-semitone step')
  })
})
