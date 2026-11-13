import { describe, expect, it } from 'vitest'
import { ResearchRecord } from './record.ts'
import { conditionKey, DEFAULT_STUDY_PROTOCOL, STUDY_PROTOCOLS, validateProtocol } from './protocol.ts'
import { GRAPHS, TEST_GRAPHS } from '../data/graphs.ts'

describe('local research records',()=>{
 it('captures order, context, mode, replay and answers without an answer key or identity fields',()=>{
  const r=new ResearchRecord('scored',DEFAULT_STUDY_PROTOCOL)
  r.setOrder(['q2','q1']);r.recordAudio({type:'play',graphId:'rising',mode:'piano',sessionId:1})
  r.enterTrial('q2','test-ambiguous-rise');r.recordAudio({type:'play',graphId:'test-ambiguous-rise',mode:'piano',sessionId:2})
  r.recordAudio({type:'play',graphId:'test-ambiguous-rise',mode:'piano',sessionId:3})
  r.record('answer-submitted',{questionId:'q2',chosenIndex:1})
  const data=JSON.parse(r.exportJSON())
  expect(data.questionOrder).toEqual(['q2','q1']);expect(data.events[0].phase).toBe('practice')
  expect(data.events.filter((e:{type:string})=>e.type==='replay')).toHaveLength(1)
  expect(data.events.at(-1)).toMatchObject({type:'answer-submitted',chosenIndex:1,trialId:'q2',phase:'scored'})
  expect(data.sessionEnded).toBe(false)
  expect(data.events.map((e:{sequence:number})=>e.sequence)).toEqual([1,2,3,4,5,6])
  for(const field of ['name','email','recording','correctIndex'])expect(r.exportJSON()).not.toContain(`"${field}"`)
 })
 it('keeps separate presets and changed conditions from silently sharing a condition key',()=>{
  expect(conditionKey(STUDY_PROTOCOLS[0])).not.toBe(conditionKey(STUDY_PROTOCOLS[1]))
  expect(conditionKey({...DEFAULT_STUDY_PROTOCOL,feedback:'after-session'})).not.toBe(conditionKey(DEFAULT_STUDY_PROTOCOL))
  expect(JSON.parse(new ResearchRecord('scored',DEFAULT_STUDY_PROTOCOL).exportJSON()).versions).toMatchObject({schema:'1',narration:expect.any(String),piano:expect.any(String),continuous:expect.any(String)})
 })
 it('clones settings and flags any truncation explicitly',()=>{
  const protocol=JSON.parse(JSON.stringify(DEFAULT_STUDY_PROTOCOL))
  const r=new ResearchRecord('scored',protocol,1);protocol.revision='changed'
  r.record('stop');r.record('stop')
  const data=JSON.parse(r.exportJSON());expect(data.protocol.revision).toBe('1');expect(data.truncated).toBe(true);expect(data.droppedEvents).toBe(1);expect(data.events).toHaveLength(1)
 })
 it('validates supported unapproved presets and cannot enable scored continuous mode',()=>{
  for(const p of STUDY_PROTOCOLS)expect(()=>validateProtocol(p)).not.toThrow()
  expect(()=>validateProtocol({...DEFAULT_STUDY_PROTOCOL,mode:'continuous'} as never)).toThrow()
  expect(()=>validateProtocol({...DEFAULT_STUDY_PROTOCOL,revision:''})).toThrow()
 })
 it('has disjoint practice and scored stimulus identifiers',()=>{
  const practice=new Set(GRAPHS.map(g=>g.id));expect(TEST_GRAPHS.every(g=>!practice.has(g.id))).toBe(true)
 })
})
