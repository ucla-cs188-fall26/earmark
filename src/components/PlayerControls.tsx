import type { PlayerStatus } from '../audio/usePlayer.ts'

interface Props {
  status: PlayerStatus
  speakPreamble: boolean
  onToggleSpeak: (v: boolean) => void
  onPlay: () => void
  onStop: () => void
}

const LABEL: Record<PlayerStatus, string> = {
  idle: 'Play',
  speaking: 'Speaking preamble…',
  loading: 'Loading piano…',
  playing: 'Playing…',
}

export function PlayerControls({ status, speakPreamble, onToggleSpeak, onPlay, onStop }: Props) {
  const busy = status !== 'idle'
  return (
    <div className="controls">
      <button type="button" onClick={busy ? onStop : onPlay} aria-live="polite">
        {busy ? `Stop (${LABEL[status]})` : LABEL.idle}
      </button>
      <label>
        <input type="checkbox" checked={speakPreamble} onChange={(e) => onToggleSpeak(e.target.checked)} />
        Speak preamble first
      </label>
    </div>
  )
}
