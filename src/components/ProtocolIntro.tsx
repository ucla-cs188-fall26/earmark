/**
 * Onboarding: teaches the packed preamble before the first question.
 * Owner: Person 1.
 *
 * The audio never explains itself. This screen is the one place the order
 * is spelled out; after that the listener decodes it from memory.
 */
import { GRAPHS, TEST_GRAPHS } from '../data/graphs.ts'
import { buildPreamble, preambleText, sonify } from '../audio/sonification.ts'
import type { Player } from '../audio/usePlayer.ts'
import { LineChart } from './LineChart.tsx'

interface Props {
  player: Player
  onStart: () => void
  mode?: 'tutorial' | 'test'
}

const ORDER: [string, string][] = [
  ['axes', 'x axis, then y axis and its unit (spoken once)'],
  ['length', 'how many seconds the graph plays'],
  ['note, value', 'the lowest note, then its value'],
  ['note, value', 'the highest note, then its value'],
  ['note, value', 'the starting note, then its value'],
  ['note, note, value', 'a note, the note one step up, then how much one step is worth'],
]

export function ProtocolIntro({ player, onStart, mode = 'tutorial' }: Props) {
  const sample = mode === 'test' ? TEST_GRAPHS[0] : GRAPHS[0]
  const sonification = sonify(sample)
  const preamble = buildPreamble(sonification, sample)
  const busy = player.status !== 'idle'
  const activePoint = sonification.notes[player.activeIndex]?.pointIndex ?? -1

  return (
    <section className="intro">
      <h2>{mode === 'test' ? 'Test' : 'How to listen'}</h2>
      <p>
        A graph is a run of short piano notes: higher value, higher note, one semitone per step. Before the
        notes you hear a short header in this fixed order:
      </p>
      <ol className="order">
        {ORDER.map(([what, meaning], i) => (
          <li key={i}>
            <strong>{what}</strong> &mdash; {meaning}
          </li>
        ))}
      </ol>
      <p>
        Then the graph plays. Press <strong>Stop</strong> at any moment to hear the value at that point.
      </p>

      <h3>{sample.title}</h3>
      <p className="preamble">{preambleText(preamble)}</p>
      {mode === 'tutorial' && <LineChart series={sample} activeIndex={activePoint} />}

      <div className="controls">
        <button type="button" onClick={() => (busy ? player.stop() : void player.play(sonification, preamble))}>
          {busy ? 'Stop' : 'Play sample'}
        </button>
        <button type="button" className="secondary" onClick={onStart}>
          {mode === 'test' ? 'Start test' : 'Start lesson'}
        </button>
      </div>
    </section>
  )
}
