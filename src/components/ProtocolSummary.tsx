import type { Graph, Sonification } from '../types.ts'
import { describeAxes, describeMapping, formatValue } from '../graph/descriptions.ts'

/** Context allowed before listening in every mode. No extrema locations or full data. */
export function ProtocolSummary({ graph, sonification: s, headingLevel = 2 }: { graph: Graph; sonification: Sonification; headingLevel?: 2 | 3 }) {
  const [x, y] = describeAxes(graph)
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return <section className="graph-information" aria-label="Graph information">
    <Heading>{graph.title}</Heading>
    <dl>
      <dt>Horizontal axis</dt><dd>{x}</dd>
      <dt>Vertical axis</dt><dd>{y}</dd>
      <dt>Recorded value range</dt><dd>Lowest: {formatValue(graph, s.trough.value)}. Highest: {formatValue(graph, s.peak.value)}.</dd>
      <dt>Starting value</dt><dd>{formatValue(graph, s.start.value)}</dd>
      <dt>Pitch reference</dt><dd>Each {s.stepSemitones === 1 ? 'semitone' : `${s.stepSemitones}-semitone step`} represents {formatValue(graph, s.unitsPerStep)}.</dd>
      <dt>Playback and axis progression</dt><dd>{describeMapping(graph, s)}</dd>
    </dl>
  </section>
}
