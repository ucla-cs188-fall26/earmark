import { useCallback, useEffect, useRef, useState } from 'react'
import type { PreambleItem, Sonification } from '../types.ts'
import { playNote, playSonification, type Playback } from './piano.ts'
import { speak, stopSpeaking } from './speech.ts'

export type PlayerStatus = 'idle' | 'speaking' | 'loading' | 'playing'

export interface Player {
  status: PlayerStatus
  /** Index of the note currently sounding, or -1. */
  activeIndex: number
  /** Optionally run the packed `preamble` first, then play the notes. */
  play: (s: Sonification, preamble?: PreambleItem[]) => Promise<void>
  stop: () => void
}

export function usePlayer(): Player {
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [activeIndex, setActiveIndex] = useState(-1)
  const playbackRef = useRef<Playback | null>(null)
  const cancelledRef = useRef(false)

  const stop = useCallback(() => {
    cancelledRef.current = true
    stopSpeaking()
    playbackRef.current?.stop()
    playbackRef.current = null
    setStatus('idle')
    setActiveIndex(-1)
  }, [])

  const play = useCallback(
    async (s: Sonification, preamble?: PreambleItem[]) => {
      stop()
      cancelledRef.current = false

      if (preamble) {
        setStatus('speaking')
        for (const item of preamble) {
          if ('say' in item) await speak(item.say)
          else await playNote(item.name, item.ms)
          if (cancelledRef.current) return
        }
      }

      setStatus('loading')
      const playback = await playSonification(s, {
        onNote: setActiveIndex,
        onEnd: () => {
          playbackRef.current = null
          setStatus('idle')
          setActiveIndex(-1)
        },
      })
      if (cancelledRef.current) {
        playback.stop()
        return
      }
      playbackRef.current = playback
      setStatus('playing')
    },
    [stop],
  )

  useEffect(() => stop, [stop])

  return { status, activeIndex, play, stop }
}
