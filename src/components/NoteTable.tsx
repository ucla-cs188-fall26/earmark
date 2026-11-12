import type { Graph, Sonification } from '../types.ts'
import { formatValue, formatX } from '../graph/descriptions.ts'

export function NoteTable({ graph, sonification, activeIndex }: { graph: Graph; sonification: Sonification; activeIndex: number }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Piano sample table">
    <table className="notes"><caption>Piano samples (including estimates between observations)</caption>
      <thead><tr>{['Sample', graph.xLabel, graph.yLabel, 'Piano note', 'Starts (seconds)'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{sonification.notes.map((n) => <tr key={n.index} aria-current={n.index === activeIndex ? 'step' : undefined} className={n.index === activeIndex ? 'notes__row--active' : ''}>
        <th scope="row">{n.index + 1}</th><td>{formatX(graph, n.x)}</td><td>{formatValue(graph, n.value)}</td><td>{n.name}</td><td>{(n.startMs / 1000).toFixed(2)}</td>
      </tr>)}</tbody>
    </table>
  </div>
}
