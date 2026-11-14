import { ObservationChange } from './ObservationChange.tsx'
import type { Graph } from '../types.ts'
import { formatValue, formatX } from '../graph/descriptions.ts'

/** Full observation data are offered only where the visual graph is permitted. */
export function DataTable({ graph }: { graph: Graph }) {
  return <details className="graph-data">
    <summary>Recorded graph data (accessible table)</summary>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={`${graph.title} data table`}>
      <table>
        <caption>{graph.title}: recorded observations</caption>
        <thead><tr><th scope="col">{graph.xLabel}</th><th scope="col">{graph.yLabel}</th></tr></thead>
        <tbody>{graph.points.map((p) => <tr key={p.x}><th scope="row">{formatX(graph, p.x)}</th><td>{formatValue(graph, p.y)}</td></tr>)}</tbody>
      </table>
    </div>
    <ObservationChange key={graph.id} graph={graph} />
  </details>
}
