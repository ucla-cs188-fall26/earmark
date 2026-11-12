import type { PreambleItem } from '../types.ts'
import { abortable } from './cancellation.ts'

export interface NarrationSection { title: string; items: PreambleItem[] }
export interface NarrationState { index: number; paused: boolean; sections: NarrationSection[] }
export function narrationSections(items: PreambleItem[]): NarrationSection[] {
  const titles = ['Graph', 'Vertical axis', 'Lowest value', 'Highest value', 'Starting value', 'Pitch reference', 'X-to-audio mapping', 'Value changes']
  const sections: NarrationSection[] = []
  for (const item of items) {
    if ('say' in item || !sections.length) sections.push({ title: titles[sections.length] ?? 'Graph information', items: [item] })
    else sections.at(-1)!.items.push(item)
  }
  return sections
}

/** Section-level restart is intentional: cancellation works for speech AND notes,
 * without relying on inconsistent native speech pause/resume implementations. */
export class NarrationTransport {
  private index = 0
  private paused = false
  private revision = 0
  private child: AbortController | null = null
  private wake: (() => void) | null = null
  private sections: NarrationSection[]
  private signal: AbortSignal
  private perform: (items: PreambleItem[], signal: AbortSignal) => Promise<void>
  private change: (state: NarrationState) => void
  constructor(sections: NarrationSection[], signal: AbortSignal,
    perform: (items: PreambleItem[], signal: AbortSignal) => Promise<void>, change: (state: NarrationState) => void) {
    this.sections = sections; this.signal = signal; this.perform = perform; this.change = change
  }
  private publish() { this.change({ index: this.index, paused: this.paused, sections: this.sections }) }
  private interrupt() { ++this.revision; this.child?.abort(); this.wake?.(); this.publish() }
  select = (index: number) => { this.index = Math.max(0, Math.min(this.sections.length - 1, index)); this.paused = false; this.interrupt() }
  previous = () => this.select(this.index - 1)
  next = () => this.select(this.index + 1)
  replay = () => this.select(this.index)
  pause = () => { this.paused = true; this.interrupt() }
  resume = () => { this.paused = false; this.interrupt() }
  skip = () => { this.index = this.sections.length; this.paused = false; this.interrupt() }
  async run() {
    while (this.index < this.sections.length) {
      this.signal.throwIfAborted()
      if (this.paused) {
        await abortable(new Promise<void>((resolve) => { this.wake = resolve }), this.signal)
        this.wake = null
        continue
      }
      this.publish()
      const revision = this.revision
      this.child = new AbortController()
      const signal = AbortSignal.any([this.signal, this.child.signal])
      try { await abortable(this.perform(this.sections[this.index].items, signal), signal) }
      catch (error) { if (revision === this.revision || this.signal.aborted) throw error }
      if (revision === this.revision) ++this.index
    }
    this.child = null
  }
}
