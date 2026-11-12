import { describe, expect, it } from 'vitest'
import { INITIAL_LISTENING, listeningReducer } from './listening.ts'

describe('question listening eligibility', () => {
  it('keeps answers locked when playback starts', () => {
    const state = listeningReducer(INITIAL_LISTENING, { type: 'started', generation: 0 })
    expect(state).toEqual({ generation: 0, attempted: true, completed: false })
  })

  it('unlocks answers after a completed graph', () => {
    const started = listeningReducer(INITIAL_LISTENING, { type: 'started', generation: 0 })
    const state = listeningReducer(started, { type: 'settled', generation: 0, outcome: 'completed' })
    expect(state.completed).toBe(true)
  })

  it.each(['cancelled', 'failed'] as const)('%s playback keeps answers locked and Replay available', (outcome) => {
    const started = listeningReducer(INITIAL_LISTENING, { type: 'started', generation: 0 })
    const state = listeningReducer(started, { type: 'settled', generation: 0, outcome })
    expect(state.attempted).toBe(true)
    expect(state.completed).toBe(false)
  })

  it.each(['completed', 'cancelled', 'failed'] as const)('preserves earned eligibility during and after a %s replay', (outcome) => {
    const complete = listeningReducer(INITIAL_LISTENING, { type: 'settled', generation: 0, outcome: 'completed' })
    const replaying = listeningReducer(complete, { type: 'started', generation: 0 })
    expect(replaying.completed).toBe(true)
    expect(listeningReducer(replaying, { type: 'settled', generation: 0, outcome }).completed).toBe(true)
  })

  it('resets eligibility and attempts for a new question or lesson restart', () => {
    const complete = listeningReducer(INITIAL_LISTENING, { type: 'settled', generation: 0, outcome: 'completed' })
    expect(listeningReducer(complete, { type: 'reset' })).toEqual({ generation: 1, attempted: false, completed: false })
  })

  it('ignores old question outcomes, including after revisiting the same graph', () => {
    const next = listeningReducer(INITIAL_LISTENING, { type: 'reset' })
    const restarted = listeningReducer(next, { type: 'reset' })
    for (const generation of [0, 1]) {
      expect(listeningReducer(restarted, { type: 'settled', generation, outcome: 'completed' })).toBe(restarted)
      expect(listeningReducer(restarted, { type: 'started', generation })).toBe(restarted)
    }
  })
})
