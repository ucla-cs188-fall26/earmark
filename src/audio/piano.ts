import * as Tone from 'tone'
import type { Sonification } from '../types.ts'
import { nameToMidi } from './sonification.ts'
import { abortable } from './cancellation.ts'

const SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/'
const SAMPLE_NAMES = ['A0', 'C8', ...Array.from({ length: 7 }, (_, i) =>
  ['C', 'D#', 'F#', 'A'].map((note) => `${note}${i + 1}`)).flat()]
// Only decoded, immutable sample data is shared. Voices and output nodes never are.
const sampleCache = new Map<string, AudioBuffer>()

async function loadSamples(signal: AbortSignal): Promise<Map<number, AudioBuffer>> {
  return new Map(await Promise.all(SAMPLE_NAMES.map(async (name) => {
    let buffer = sampleCache.get(name)
    if (!buffer) {
      const response = await fetch(`${SAMPLE_BASE_URL}${name.replace('#', 's')}.mp3`, { signal })
      if (!response.ok) throw new Error(`Piano sample request failed (${response.status})`)
      buffer = await abortable(Tone.getContext().decodeAudioData(await response.arrayBuffer()), signal)
      signal.throwIfAborted()
      sampleCache.set(name, buffer)
    }
    return [nameToMidi(name), buffer] as const
  })))
}

export interface PianoSession {
  playNote: (name: string, ms: number) => Promise<void>
  playGraph: (s: Sonification, onNote: (index: number) => void) => Promise<void>
  dispose: () => void
}

/** One request owns every voice, timer and output node, including its preamble. */
export async function createPianoSession(signal: AbortSignal): Promise<PianoSession> {
  signal.throwIfAborted()
  // Invoke start synchronously in the initiating user gesture, before narration.
  const loading = new AbortController()
  const loadingSignal = AbortSignal.any([signal, loading.signal])
  const timeout = setTimeout(() => loading.abort(new Error('Piano loading timed out')), 30_000)
  let samples: Map<number, AudioBuffer>
  try {
    await abortable(Tone.start(), loadingSignal)
    samples = await loadSamples(loadingSignal)
  } catch (error) {
    loading.abort() // cancel sibling sample requests on the first failure
    throw error
  } finally {
    clearTimeout(timeout)
  }
  signal.throwIfAborted()
  const output = new Tone.Gain(1).toDestination()
  const voices = new Set<{ source: AudioBufferSourceNode; envelope: Tone.Gain }>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', dispose)
    timers.forEach(clearTimeout)
    timers.clear()
    // A hard output disconnect silences active AND future sources immediately.
    // Do not depend on Sampler.releaseAll(): scheduled releases lose its handles.
    output.gain.cancelScheduledValues(0)
    output.gain.setValueAtTime(0, Tone.immediate())
    output.disconnect()
    for (const { source, envelope } of voices) {
      source.onended = null
      source.stop() // native stop also cancels a source whose start is in the future
      source.disconnect()
      envelope.dispose()
    }
    voices.clear()
    output.dispose()
  }
  signal.addEventListener('abort', dispose, { once: true })

  const at = (ms: number, callback: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (!disposed && !signal.aborted) callback()
    }, ms)
    timers.add(timer)
  }
  const wait = (ms: number) => abortable(new Promise<void>((resolve) => at(ms, resolve)), signal)
  const note = (name: string, ms: number, time: number): Promise<void> => {
    signal.throwIfAborted()
    if (disposed) throw new Error('Piano session has ended')
    const midi = nameToMidi(name)
    // Match Tone.Sampler's nearest-sample choice (prefer the higher sample on ties).
    const closest = [...samples.keys()].sort((a, b) => Math.abs(a - midi) - Math.abs(b - midi) || b - a)[0]
    const buffer = samples.get(closest)!
    const rate = 2 ** ((midi - closest) / 12)
    // Keep native source handles: unlike Sampler, scheduled releases cannot
    // remove them from our ownership. Tone still supplies routing and envelopes.
    const source = Tone.getContext().createBufferSource()
    const envelope = new Tone.Gain(0).connect(output)
    source.buffer = buffer
    source.playbackRate.value = rate
    Tone.connect(source, envelope)
    const voice = { source, envelope }
    voices.add(voice)
    const ended = new Promise<void>((resolve) => {
      source.onended = () => {
        voices.delete(voice)
        source.disconnect()
        envelope.dispose()
        resolve()
      }
    })
    envelope.gain.setValueAtTime(1, time)
    // Match Sampler's zero attack, exponential one-second release envelope.
    envelope.gain.targetRampTo(0, 1, time + ms / 1000)
    source.start(time, 0)
    source.stop(time + ms / 1000 + 1)
    return ended
  }

  return {
    dispose,
    async playNote(name, ms) {
      void note(name, ms, Tone.now() + 0.02)
      await wait(ms + 60)
    },
    playGraph(s, onNote) {
      const t0 = Tone.now() + 0.05
      const ended: Promise<void>[] = []
      for (const n of s.notes) {
        ended.push(note(n.name, n.durationMs, t0 + n.startMs / 1000))
        // Keep existing callback timing; coordinate/timing accuracy is a later PR.
        at(Math.max(0, (t0 - Tone.now()) * 1000 + n.startMs), () => onNote(n.index))
      }
      // Completion requires the audio-clock endpoint AND naturally ended graph
      // voices (including their existing release tails), not just UI timers.
      // Recheck the clock because a suspended context does not advance with time.
      const timelineEnd = new Promise<void>((resolve) => {
        const check = () => {
          const remaining = (t0 + s.durationMs / 1000 - Tone.immediate()) * 1000
          if (remaining <= 0) resolve()
          else at(Math.max(1, Math.min(remaining, 100)), check)
        }
        check()
      })
      return abortable(Promise.all([timelineEnd, ...ended]), signal).then(() => dispose())
    },
  }
}
