import { NarrationControls } from './NarrationControls.tsx'
/**
 * Engine test page (#playground): pick any graph, play it, inspect the notes.
 * Not part of the lesson. Mostly useful for Person 2 while tuning the mapping.
 */
import { useMemo, useState } from 'react'
import { chartPosition } from '../graph/coordinates.ts'
import { usePlayer } from '../audio/usePlayer.ts'
import { LineChart } from './LineChart.tsx'
import { NoteTable } from './NoteTable.tsx'
import { PlayerControls } from './PlayerControls.tsx'
import { DataTable } from './DataTable.tsx'
import { StoppedPosition } from './StoppedPosition.tsx'
import { ProtocolSummary } from './ProtocolSummary.tsx'
import { GRAPHS as EXAMPLES } from '../data/graphs.ts'
import { buildPreamble, preambleText, sonify } from '../audio/sonification.ts'

export function Playground() {
  const [exampleId, setExampleId] = useState(EXAMPLES[0].id)
  const [speakPreamble, setSpeakPreamble] = useState(true)
  const player = usePlayer()

  const series = EXAMPLES.find((e) => e.id === exampleId) ?? EXAMPLES[0]
  const sonification = useMemo(() => sonify(series), [series])
  const preamble = buildPreamble(sonification, series)

  return (
    <>
      <p className="lede">
        Tutorial graphs only: hear each example as piano notes, pick a graph, press play, and follow the preamble.
      </p>

      <section className="picker">
        <label>
          Example graph{' '}
          <select
            value={exampleId}
            onChange={(e) => {
              player.reset()
              setExampleId(e.target.value)
            }}
          >
            {EXAMPLES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="stage">
        <ProtocolSummary graph={series} sonification={sonification} />
        <LineChart series={series} activePosition={chartPosition(sonification, player.activeIndex, player.stoppedPosition)} />
        <NarrationControls player={player} preamble={preamble} />
        <StoppedPosition graph={series} position={player.stoppedPosition} />
        <DataTable graph={series} />
        {player.error && <p role="alert">{player.error}</p>}
        <PlayerControls
          status={player.status}
          speakPreamble={speakPreamble}
          onToggleSpeak={setSpeakPreamble}
          onPlay={() => void player.play(sonification, speakPreamble ? preamble : undefined)}
          onStop={() => player.stopAndAnnounce(series)}
        />
      </section>

      <section className="details">
        <div>
          <h3>Preamble</h3>

          <p className="preamble">{preambleText(preamble)}</p>
        </div>
        <div>
          <h3>Notes</h3>
          <NoteTable graph={series} sonification={sonification} activeIndex={player.activeIndex} />
        </div>
      </section>
    </>
  )
}
