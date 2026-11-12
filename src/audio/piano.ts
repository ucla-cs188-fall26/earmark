import * as Tone from 'tone'
import type { Sonification } from '../types.ts'

/**
 * Sampled piano playback for a Sonification.
 *
 * Uses the Salamander Grand Piano samples hosted by Tone.js. One sample every
 * minor third is enough; Tone.Sampler pitch-shifts the gaps.
 */

const SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

function sampleUrls(): Record<string, string> {
  const urls: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' }
  for (let octave = 1; octave <= 7; octave++) {
    urls[`C${octave}`] = `C${octave}.mp3`
    urls[`D#${octave}`] = `Ds${octave}.mp3`
    urls[`F#${octave}`] = `Fs${octave}.mp3`
    urls[`A${octave}`] = `A${octave}.mp3`
  }
  return urls
}

let samplerPromise: Promise<Tone.Sampler> | null = null

/** Load (once) and return the piano sampler. Must be called after a user gesture. */
export function loadPiano(): Promise<Tone.Sampler> {
  if (!samplerPromise) {
    samplerPromise = new Promise<Tone.Sampler>((resolve, reject) => {
      const sampler = new Tone.Sampler({
        urls: sampleUrls(),
        baseUrl: SAMPLE_BASE_URL,
        release: 1,
        onload: () => resolve(sampler),
        onerror: (err) => {
          samplerPromise = null
          reject(err)
        },
      }).toDestination()
    })
  }
  return samplerPromise
}

/** Play one reference note now and resolve when it has sounded for `ms`. */
export async function playNote(name: string, ms: number): Promise<void> {
  await Tone.start()
  const piano = await loadPiano()
  piano.triggerAttackRelease(name, ms / 1000, Tone.now() + 0.02)
  await new Promise((r) => setTimeout(r, ms + 60))
}

export interface Playback {
  /** Stop all scheduled notes and callbacks immediately. */
  stop: () => void
  /** Resolves when the last note has finished. */
  done: Promise<void>
}

export interface PlayCallbacks {
  /** Fired (on the animation frame) when note `index` begins. */
  onNote?: (index: number) => void
  /** Fired when playback ends, whether naturally or via stop(). */
  onEnd?: () => void
}

/**
 * Schedule every note in `s` starting now.
 *
 * UI callbacks use setTimeout rather than Tone.Draw because Draw runs on
 * requestAnimationFrame, which browsers pause in hidden tabs; the audio keeps
 * playing but the playhead (and the end-of-clip callback) would never fire.
 */
export async function playSonification(s: Sonification, cb: PlayCallbacks = {}): Promise<Playback> {
  await Tone.start()
  const piano = await loadPiano()
  const t0 = Tone.now() + 0.05
  const timers: ReturnType<typeof setTimeout>[] = []
  const at = (offsetMs: number, fn: () => void) => {
    const delayMs = Math.max(0, (t0 - Tone.now()) * 1000 + offsetMs)
    timers.push(setTimeout(fn, delayMs))
  }

  for (const n of s.notes) {
    piano.triggerAttackRelease(n.name, n.durationMs / 1000, t0 + n.startMs / 1000)
    at(n.startMs, () => cb.onNote?.(n.index))
  }

  let finished = false
  let resolveDone!: () => void
  const done = new Promise<void>((r) => (resolveDone = r))
  const finish = () => {
    if (finished) return
    finished = true
    timers.forEach(clearTimeout)
    cb.onEnd?.()
    resolveDone()
  }
  at(s.durationMs, finish)

  return {
    done,
    stop: () => {
      piano.releaseAll()
      finish()
    },
  }
}
