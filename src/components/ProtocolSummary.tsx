import type { Sonification } from '../types.ts'

interface Props {
  sonification: Sonification
  unit?: string
}

/** The preamble, laid out as a table: what the listener is told before the notes. */
export function ProtocolSummary({ sonification: s, unit = '' }: Props) {
  const rows: [string, string][] = [
    ['Length', `${s.durationMs / 1000} s`],
    ['Trough', `${s.trough.value}${unit} → ${s.trough.name}`],
    ['Peak', `${s.peak.value}${unit} → ${s.peak.name}`],
    ['Start', `${s.start.value}${unit} → ${s.start.name}`],
    ['Per step', `${s.unitsPerStep}${unit}`],
  ]
  return (
    <table className="summary" aria-label="Protocol preamble">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
