import type { Player } from '../audio/usePlayer.ts'
import type { Graph } from '../types.ts'

export function GraphControls({ player, graph, onReplay, eligible = false, requiresFullListening = false }: { player: Player; graph: Graph; onReplay: () => void; eligible?: boolean; requiresFullListening?: boolean }) {
  const active = player.status === 'playing' || player.status === 'paused'
  return <section aria-label="Graph playback navigation">
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
