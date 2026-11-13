import { useControlFocus } from '../accessibility/useControlFocus.ts'
import type { PreambleItem } from '../types.ts'
import { narrationSections } from '../audio/narration.ts'
import type { PlaybackPermissions } from '../audio/player.ts'
import type { Player } from '../audio/usePlayer.ts'

export function NarrationControls({ player, preamble, permissions }: { player: Player; preamble: PreambleItem[]; permissions?: PlaybackPermissions }) {
  const state = player.narration
  const sections = narrationSections(preamble)
  const active = player.status === 'speaking' && state && state.index < sections.length
  const focus = useControlFocus(Boolean(active))
  const section = active ? sections[state.index] : null
  return <section aria-label="Introduction navigation" {...focus}>
    {active && section && <>
    <p role="status">{state.paused ? 'Introduction paused. Resume restarts this section.' : 'Introduction section'} {state.index + 1} of {state.sections.length}: {section.title}</p>
    <div className="controls">
      <button type="button" disabled={state.index === 0} onClick={player.previousSection}>Previous Section</button>
      <button type="button" disabled={state.index === state.sections.length - 1} onClick={player.nextSection}>Next Section</button>
      <button type="button" onClick={player.replaySection}>Replay Current Section</button>
      <button type="button" disabled={permissions?.pause === false} onClick={state.paused ? player.resumeNarration : player.pauseNarration}>{state.paused ? 'Resume narration' : 'Pause narration'}</button>
      <button type="button" disabled={permissions?.skipIntroduction === false} onClick={player.skipIntroduction}>Skip Introduction</button>
    </div>
    </>}
    <details><summary>Introduction transcript</summary>
      {sections.map((s, index) => <section key={index} aria-current={active && index === state.index ? 'step' : undefined}>
        <h3>{s.title}{active && index === state.index ? ' (current section)' : ''}</h3>
        <p>{s.items.map((item) => 'say' in item ? item.say : item.frequencyHz ? '[Reference tone]' : `[Reference note: ${item.name}]`).join(' ')}</p>
      </section>)}
    </details>
  </section>
}
