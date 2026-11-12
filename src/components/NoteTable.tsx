import type { Sonification } from '../types.ts'

interface Props {
  sonification: Sonification
  activeIndex: number
  xTickLabel?: (x: number) => string
}

/** Every note the player will hear. Doubles as the accessible table view of the chart. */
export function NoteTable({ sonification, activeIndex, xTickLabel = String }: Props) {
  return (
    <table className="notes" aria-label="Note sequence">
      <thead>
        <tr>
          <th>#</th>
          <th>x</th>
          <th>Value</th>
          <th>Note</th>
          <th>Starts (s)</th>
        </tr>
      </thead>
      <tbody>
        {sonification.notes.map((n) => (
          <tr key={n.index} className={n.index === activeIndex ? 'notes__row--active' : ''}>
            <td>{n.index + 1}</td>
            <td>{xTickLabel(n.pointIndex)}</td>
            <td>{Number(n.value.toFixed(2))}</td>
            <td>{n.name}</td>
            <td>{(n.startMs / 1000).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
