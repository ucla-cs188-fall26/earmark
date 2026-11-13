import type { ReactNode } from 'react'
import { GraphControls } from './GraphControls.tsx'
import { NarrationControls } from './NarrationControls.tsx'
import { chartPosition } from '../graph/coordinates.ts'
import { GRAPHS } from '../data/graphs.ts'
import { buildPreamble, sonify } from '../audio/sonification.ts'
import type { Player } from '../audio/usePlayer.ts'
import { LineChart } from './LineChart.tsx'
import { ProtocolSummary } from './ProtocolSummary.tsx'
import { StoppedPosition } from './StoppedPosition.tsx'
import { DataTable } from './DataTable.tsx'

export function ProtocolIntro({ player, onStart, mode = 'tutorial', protocolControls }: { player: Player; onStart: () => void; mode?: 'tutorial' | 'test'; protocolControls?: ReactNode }) {
  // A tutorial example avoids previewing a scored Test stimulus.
  const sample = GRAPHS[0]
  const sonification = sonify(sample)
  const preamble = buildPreamble(sonification, sample)
  const busy = player.status !== 'idle' && player.status !== 'error'
  return <section className="intro">
    <h2>{mode === 'test' ? 'Practice before the scored test' : 'Tutorial — how to listen'}</h2>
    <p>Higher notes mean higher values. The guide explains the values, pitch reference, and time represented by each horizontal-axis unit.</p>
    <p>Press Stop to hear your position and value. A position is available only after graph audio begins. Listen to a complete graph before answering; stopping early keeps answers unavailable. You may replay as often as you like.</p>
    <p>This introduction is unscored practice. Scored graphs are separate.</p>
    {protocolControls}
    <ProtocolSummary graph={sample} sonification={sonification} headingLevel={3} />
    {mode === 'tutorial' && <><LineChart series={sample} activePosition={chartPosition(sonification, player.activeIndex, player.stoppedPosition, player.livePosition)} /><DataTable graph={sample} /></>}
    <GraphControls player={player} sonification={sonification} graph={sample} onReplay={() => { void player.play(sonification, preamble) }} />
      <NarrationControls player={player} preamble={preamble} />
    <StoppedPosition graph={sample} position={player.stoppedPosition} />
    {player.error && <p role="alert">{player.error}</p>}
    <div className="controls">
      <button data-main-playback type="button" onClick={() => busy ? player.stopAndAnnounce(sample) : void player.play(sonification, preamble)}>{busy ? 'Stop' : 'Play sample'}</button>
      <button type="button" className="secondary" onClick={onStart}>{mode === 'test' ? 'Start test' : 'Start lesson'}</button>
    </div>
  </section>
}
