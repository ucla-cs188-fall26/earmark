import { describe, expect, it } from 'vitest'
import { NarrationTransport, narrationSections } from './narration.ts'

const tick = async () => { for (let i=0;i<8;i++) await Promise.resolve() }
describe('narration section ownership', () => {
  it('keeps explanation and reference notes together', () => {
    const sections=narrationSections([{say:'Lowest value'}, {note:48,name:'C3',ms:450}, {say:'Highest value'}, {note:60,name:'C4',ms:450}])
    expect(sections.map(s=>s.items.length)).toEqual([2,2])
  })
  it('cancels previous sections on rapid navigation, pause and skip', async () => {
    const root=new AbortController(), signals:AbortSignal[]=[], spoken:string[]=[]
    const transport=new NarrationTransport(narrationSections([{say:'First'}, {say:'Second'}, {say:'Third'}]),root.signal, async(items,signal)=>{
      signals.push(signal); spoken.push((items[0] as {say:string}).say); await new Promise(()=>{})
    },()=>{})
    const done=transport.run();await tick();transport.next();await tick()
    expect(signals[0].aborted).toBe(true);expect(spoken).toEqual(['First','Second'])
    transport.pause();await tick();expect(signals[1].aborted).toBe(true)
    transport.resume();await tick();expect(spoken.at(-1)).toBe('Second')
    transport.previous();await tick();expect(spoken.at(-1)).toBe('First')
    transport.replay();await tick();expect(signals.at(-2)?.aborted).toBe(true)
    transport.skip();await done;expect(signals.at(-1)?.aborted).toBe(true)
  })
  it('cancels a paused introduction on owner cleanup', async () => {
    const root=new AbortController()
    const transport=new NarrationTransport(narrationSections([{say:'First'}]),root.signal,async()=>new Promise(()=>{}),()=>{})
    const done=transport.run();const rejected=expect(done).rejects.toMatchObject({name:'AbortError'})
    transport.pause();await tick();root.abort();await rejected
  })
})
