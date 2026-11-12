import { useControlFocus } from '../accessibility/useControlFocus.ts'
import { axisPosition } from '../graph/coordinates.ts'
import { formatX } from '../graph/descriptions.ts'
import type { Player } from '../audio/usePlayer.ts'
import type { Graph, Sonification } from '../types.ts'

export function GraphControls({ player, graph, sonification, onReplay, eligible = false, requiresFullListening = false }: { player: Player; graph: Graph; sonification: Sonification; onReplay: () => void; eligible?: boolean; requiresFullListening?: boolean }) {
  const active = player.status === 'playing' || player.status === 'paused'
  const focus = useControlFocus(active)
  const note = sonification.notes[player.activeIndex]
  const start = axisPosition(graph, graph.points[0].x), end = axisPosition(graph, graph.points.at(-1)!.x)
  const progress = note ? (axisPosition(graph, note.x) - start) / (end - start || 1) * 100 : 0
  return <section aria-label="Graph playback navigation" {...focus}>
    {active && <>
      <p role="status">{player.status === 'paused' ? 'Graph paused.' : `Graph playing at ${player.speed ?? 1}× speed.`}</p>
      <label>Position along graph <progress max={100} value={progress} aria-label="Position along graph" aria-valuetext={note ? `${graph.xLabel}: ${formatX(graph, note.x)}. Listening completion is announced separately.` : 'Graph is starting.'} /></label>
    </>}
    <label>Playback speed{' '}
      <select value={player.speed ?? 1} onChange={(e) => player.setSpeed(Number(e.target.value))}>
        {[0.5,0.75,1,1.25,1.5].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
      </select>
    </label>
    <p>Guide times assume 1× speed. Segments are one second at normal speed. {requiresFullListening && 'Seeking or replaying a segment requires a new full replay before answering, unless you already completed this graph.'}</p>
    {active && <div className="controls">
      <button type="button" onClick={player.status === 'paused' ? player.resumeGraph : player.pauseGraph}>{player.status === 'paused' ? 'Resume graph' : 'Pause graph'}</button>
      <button type="button" onClick={() => player.move(-1000)}>Backward 1 second</button>
      <button type="button" onClick={() => player.move(1000)}>Forward 1 second</button>
      <button type="button" onClick={player.replaySegment}>Replay current segment</button>
      <button type="button" onClick={() => player.announcePosition(graph)}>Hear position and value (pauses graph)</button>
      <button type="button" onClick={onReplay}>Replay full graph</button>
    </div>}
    {player.needsFullReplay && requiresFullListening && !eligible && <p role="status">Partial playback: replay the full graph to earn answer eligibility.</p>}
  </section>
}
