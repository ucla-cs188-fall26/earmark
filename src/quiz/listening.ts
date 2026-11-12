import type { PlaybackOutcome } from '../audio/player.ts'

export interface ListeningState {
  generation: number
  attempted: boolean
  completed: boolean
}
export const INITIAL_LISTENING: ListeningState = { generation: 0, attempted: false, completed: false }
export type ListeningAction =
  | { type: 'reset' }
  | { type: 'started'; generation: number }
  | { type: 'settled'; generation: number; outcome: PlaybackOutcome['kind'] }

/** Eligibility belongs to a question visit, not a player status or note callback. */
export function listeningReducer(state: ListeningState, action: ListeningAction): ListeningState {
  if (action.type === 'reset') return { ...INITIAL_LISTENING, generation: state.generation + 1 }
  if (action.generation !== state.generation) return state
  if (action.type === 'started') return { ...state, attempted: true }
  if (action.outcome === 'completed') return { ...state, completed: true }
  // Stops, failures and later replays never revoke an earned completion.
  return state
}
