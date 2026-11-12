import { useState } from 'react'
import type { Graph } from '../types.ts'
import { describeObservationChange, formatX } from '../graph/descriptions.ts'

/** Kept inside DataTable: never mount before a scored answer is submitted. */
export function ObservationChange({ graph }: { graph: Graph }) {
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(Math.min(1, graph.points.length - 1))
  const [result, setResult] = useState<string | null>(null)
  return <form onSubmit={(event) => {
    event.preventDefault()
    setResult(describeObservationChange(graph, from, to))
  }}>
    <fieldset>
      <legend>Inspect the Y change between two observations</legend>
      <div className="controls">
        <label>From observation{' '}
          <select value={from} onChange={(event) => { setFrom(Number(event.target.value)); setResult(null) }}>
            {graph.points.map((p, i) => <option key={p.x} value={i}>{formatX(graph, p.x)}</option>)}
          </select>
        </label>
        <label>To observation{' '}
          <select value={to} onChange={(event) => { setTo(Number(event.target.value)); setResult(null) }}>
            {graph.points.map((p, i) => <option key={p.x} value={i}>{formatX(graph, p.x)}</option>)}
          </select>
        </label>
        <button type="submit">Compare values</button>
      </div>
      <p role="status">{result}</p>
    </fieldset>
  </form>
}
