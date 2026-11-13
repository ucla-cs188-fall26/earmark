export type AudioEventType = 'play' | 'stop' | 'graph-scheduled' | 'graph-pause' | 'graph-resume' | 'seek' | 'segment-replay' | 'speed-change' | 'position-request' | 'narration-section' | 'narration-pause' | 'narration-resume' | 'narration-previous' | 'narration-next' | 'narration-replay' | 'skip-introduction' | 'playback-completed' | 'playback-cancelled' | 'playback-failed' | 'speech-result'
export interface AudioEvent {
  type: AudioEventType
  sessionId?: number
  graphId?: string
  mode?: 'piano' | 'continuous'
  speed?: number
  elapsedMs?: number
  sectionIndex?: number
  paused?: boolean
  reason?: string
}
