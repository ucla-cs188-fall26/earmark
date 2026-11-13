import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sonify } from './sonification.ts'
import { GRAPHS } from '../data/graphs.ts'
const deps=vi.hoisted(()=>({create:vi.fn(),speak:vi.fn().mockResolvedValue(undefined)}))
vi.mock('./piano.ts',()=>({createPianoSession:deps.create,createReferenceSession:deps.create}))
vi.mock('./speech.ts',()=>({speak:deps.speak}))
import { PlaybackController } from './player.ts'
function piano() {
 let resolve!:()=>void
 const done=new Promise<void>(r=>{resolve=r})
 return {playGraph:vi.fn(()=>done),playNote:vi.fn(),dispose:vi.fn(),getPosition:vi.fn().mockReturnValue(null),resolve}
}
const s=sonify(GRAPHS[0])
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
beforeEach(()=>{deps.create.mockReset();deps.speak.mockClear()})
describe('graph transport and full listening',()=>{
 it('pauses without completion and resumes at the retained coordinate',async()=>{
  const first=piano(),next=piano();deps.create.mockResolvedValueOnce(first).mockResolvedValueOnce(next)
  const p=new PlaybackController(),r=p.play(s);await r.scheduled
  first.getPosition.mockReturnValue({graphId:s.graphId,index:5,x:1,value:2,elapsedMs:1200})
  let completed=false;void r.finished.then(()=>{completed=true})
  p.pauseGraph();await tick();expect(completed).toBe(false);expect(p.getSnapshot().status).toBe('paused');expect(first.dispose).toHaveBeenCalled()
  p.resumeGraph();await tick();expect(next.playGraph).toHaveBeenCalledWith(s,expect.any(Function),{offsetMs:1200,speed:1})
  first.resolve();await tick();expect(completed).toBe(false)
  next.resolve();expect((await r.finished).kind).toBe('completed');expect(p.getSnapshot().status).toBe('idle')
 })
 it('seeking to the end or replaying a segment cannot earn completion',async()=>{
  const first=piano(),next=piano();deps.create.mockResolvedValueOnce(first).mockResolvedValueOnce(next)
  const p=new PlaybackController(),r=p.play(s);await r.scheduled
  p.seekTo(s.durationMs);await tick();next.resolve()
  expect((await r.finished).kind).toBe('cancelled');expect(p.getSnapshot().needsFullReplay).toBe(true)
  p.stop()
 })
 it('supports paused seeking without autoplay and clamps positions',async()=>{
  const first=piano();deps.create.mockResolvedValue(first)
  const p=new PlaybackController(),r=p.play(s);await r.scheduled;p.pauseGraph();p.seekTo(999999)
  expect(p.getSnapshot().status).toBe('paused');expect(p.getPosition()?.elapsedMs).toBe(s.durationMs)
  p.move(-999999);expect(p.getPosition()?.elapsedMs).toBe(0);expect(deps.create).toHaveBeenCalledTimes(1);p.stop()
 })
 it('changes speed without changing pitch data or granting early completion',async()=>{
  const first=piano(),next=piano();deps.create.mockResolvedValueOnce(first).mockResolvedValueOnce(next)
  const p=new PlaybackController(),r=p.play(s);await r.scheduled
  first.getPosition.mockReturnValue({graphId:s.graphId,index:5,x:1,value:2,elapsedMs:1000})
  p.setSpeed(1.5);await tick();expect(next.playGraph).toHaveBeenCalledWith(s,expect.any(Function),{offsetMs:1000,speed:1.5})
  p.setSpeed(99);expect(p.getSnapshot().speed).toBe(1.5)
  next.resolve();expect((await r.finished).kind).toBe('completed')
 })
 it('cancels a resumed load on Stop and rejects its stale completion',async()=>{
  const first=piano(),late=piano();let load!:(p:ReturnType<typeof piano>)=>void
  deps.create.mockResolvedValueOnce(first).mockReturnValueOnce(new Promise(r=>{load=r}))
  const p=new PlaybackController(),r=p.play(s);await r.scheduled;p.pauseGraph();p.resumeGraph();p.stop();load(late);await tick()
  expect(late.dispose).toHaveBeenCalled();expect(late.playGraph).not.toHaveBeenCalled();expect((await r.finished).kind).toBe('cancelled');expect(p.getSnapshot().status).toBe('idle')
 })
 it('does not invent a coordinate if paused before graph onset',async()=>{
  deps.create.mockResolvedValue(piano());const p=new PlaybackController(),r=p.play(s);await r.scheduled;p.pauseGraph();expect(p.getPosition()).toBeNull();expect(p.stop()).toBeNull()
 })
})

it('keeps continuous mode unavailable for scored Test graph data',async()=>{
 const p=new PlaybackController(),r=p.play(s,undefined,{mode:'continuous',graph:{...GRAPHS[0],stage:'test'}})
 expect((await r.finished).kind).toBe('failed');expect(deps.create).not.toHaveBeenCalled()
})
