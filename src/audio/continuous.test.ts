import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Graph } from '../types.ts'
import { sonify, midiToFrequency } from './sonification.ts'
const audio=vi.hoisted(()=>({clock:1,sources:[] as {onended:null|(()=>void);frequency:{setValueAtTime:ReturnType<typeof vi.fn>;exponentialRampToValueAtTime:ReturnType<typeof vi.fn>};start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[],outputs:[] as {disconnect:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>}[]}))
vi.mock('tone',()=>({start:async()=>{},now:()=>1.1,immediate:()=>audio.clock,connect:vi.fn(),getContext:()=>({createOscillator:()=>{
 const oscillator={onended:null,type:'sine',frequency:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},start:vi.fn(),stop:vi.fn(),disconnect:vi.fn()};audio.sources.push(oscillator);return oscillator
}}),Gain:class{gain={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),targetRampTo:vi.fn()};disconnect=vi.fn();dispose=vi.fn();constructor(){audio.outputs.push(this)}toDestination(){return this}connect(){return this}}}))
import { continuousFrequency,continuousPosition,continuousPreamble,createContinuousSession } from './continuous.ts'
const g:Graph={id:'curve',title:'Curve',xLabel:'Seconds',yLabel:'Value',points:[{x:10,y:0},{x:20,y:10}]}
const s=sonify(g,{noteMs:3000})
beforeEach(()=>{vi.useFakeTimers();audio.clock=1;audio.sources.length=0;audio.outputs.length=0})
afterEach(()=>vi.useRealTimers())
describe('continuous sonification',()=>{
 it('uses unrounded source values on the same pitch calibration',()=>{
  expect(continuousFrequency(s,0)).toBeCloseTo(midiToFrequency(s.trough.midi))
  expect(continuousFrequency(s,0.25)).toBeCloseTo(midiToFrequency(s.trough.midi+0.25/s.unitsPerStep))
  const p=continuousPosition(g,s,s.notes[1].startMs/2)!
  expect(p.x).toBeCloseTo(12.5);expect(p.value).toBeCloseTo(2.5);expect(p.mode).toBe('continuous')
 })
 it('respects held steps instead of drawing imaginary slopes',()=>{
  const step={...g,interpolation:'step' as const},sequence=sonify(step,{noteMs:3000})
  expect(continuousPosition(step,sequence,1000)?.value).toBe(0)
 })
 it('gives extrema/start references their exact unrounded frequencies',()=>{
  const graph={...g,points:[{x:10,y:1.1},{x:20,y:2.3}]},seq=sonify(graph)
  const refs=continuousPreamble(seq,graph).filter(i=>'note'in i)
  expect(refs[0].frequencyHz).toBeCloseTo(continuousFrequency(seq,seq.trough.value))
  expect(refs[1].frequencyHz).toBeCloseTo(continuousFrequency(seq,seq.peak.value))
 })
 it('schedules smooth frequency changes and cancels oscillator/timers on Stop',async()=>{
  const abort=new AbortController(),renderer=await createContinuousSession(abort.signal,g)
  const done=renderer.playGraph(s,vi.fn(),{offsetMs:500,speed:1.5})
  const rejected=expect(done).rejects.toMatchObject({name:'AbortError'})
  expect(audio.sources).toHaveLength(1);expect(audio.sources[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalled()
  expect(renderer.getPosition()).toBeNull()
  const onset=audio.sources[0].start.mock.calls[0][0] as number;audio.clock=onset+0.5
  expect(renderer.getPosition()?.elapsedMs).toBeCloseTo(1250)
  abort.abort();await rejected
  expect(audio.sources[0].stop).toHaveBeenCalledTimes(2);expect(audio.outputs[0].disconnect).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0)
 })
 it('requires both natural end and complete audio time before completion',async()=>{
  const abort=new AbortController(),renderer=await createContinuousSession(abort.signal,g)
  let completed=false
  const done=renderer.playGraph(s,vi.fn()).then(()=>{completed=true})
  audio.sources[0].onended?.();await vi.advanceTimersByTimeAsync(100);expect(completed).toBe(false)
  audio.clock=10;await vi.advanceTimersByTimeAsync(100);await done;expect(completed).toBe(true)
 })
})
