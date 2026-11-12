/**
 * Shows the graph after the listener has answered, with the protocol
 * anchors so they can connect what they heard to what they see.
 * Owner: Person 1.
 *
 * TODO (Person 1): design the reveal (highlight the answer region, animate
 * the line, show the preamble next to the chart, etc.).
 */
import type { Graph, Sonification } from '../types.ts'
import { xTickLabel } from '../data/graphs.ts'
import { LineChart } from './LineChart.tsx'
import { ProtocolSummary } from './ProtocolSummary.tsx'

interface Props {
  graph: Graph
  sonification: Sonification
  /** Index of the note currently playing (for replay on the reveal screen), or -1. */
  activeIndex?: number
}

export function GraphReveal({ graph, sonification, activeIndex = -1 }: Props) {
  return (
    <div className="reveal">
      <h3>{graph.title}</h3>
      <LineChart series={graph} activeIndex={activeIndex} xTickLabel={(x) => xTickLabel(graph, x)} />
      <ProtocolSummary sonification={sonification} unit={graph.unit} />
    </div>
  )
}
