import type { AudioEvent, AudioEventType } from '../audio/events.ts'
import { conditionKey, PROTOCOL_VERSIONS, validateProtocol, type StudyProtocol } from './protocol.ts'

export type Activity = 'tutorial' | 'practice' | 'scored'
type EventType = AudioEventType | 'replay' | 'trial-entered' | 'session-ended' | 'mode-selected' | 'answer-submitted'
type Details = Omit<AudioEvent,'type'> & { questionId?: string; chosenIndex?: number; correct?: number; total?: number }
export interface ResearchEvent extends Details { sequence:number; elapsedMsInRun:number; type:EventType; phase:Activity; trialId:string|null }

/** Anonymous, bounded, in-memory journal. No storage API, analytics or network. */
export class ResearchRecord {
  readonly runId = globalThis.crypto?.randomUUID?.() ?? `local-${Math.random().toString(36).slice(2)}`
  private started = performance.now()
  private events: ResearchEvent[] = []
  private dropped = 0
  private order: string[] = []
  private selectedMode: 'piano'|'continuous' = 'piano'
  getDropped = () => this.dropped
  private phase: Activity
  private trial: string|null = null
  private plays = new Map<string,number>()
  private listeners = new Set<()=>void>()
  private protocol: StudyProtocol|null
  readonly activity: Activity
  constructor(activity: Activity, protocol: StudyProtocol|null = null, privateLimit = 10000) {
    this.activity=activity
    if (protocol) validateProtocol(protocol)
    this.protocol = protocol ? JSON.parse(JSON.stringify(protocol)) : null
    this.phase = activity === 'scored' ? 'practice' : activity
    this.limit = privateLimit
  }
  private limit: number
  subscribe = (fn:()=>void) => { this.listeners.add(fn); return()=>{this.listeners.delete(fn)} }
  getSnapshot = () => this.events.length + this.dropped
  setOrder(ids:readonly string[]) { this.order=[...ids] }
  enterTrial(questionId:string, graphId:string) {
    this.phase=this.activity;this.trial=questionId
    this.record('trial-entered',{questionId,graphId})
  }
  record = (type:EventType, details:Details = {}) => {
    if(type==='mode-selected'&&details.mode)this.selectedMode=details.mode
    if (this.events.length >= this.limit) ++this.dropped
    else this.events.push({ ...details,type,sequence:this.events.length+1,elapsedMsInRun:performance.now()-this.started,phase:this.phase,trialId:this.trial })
    this.listeners.forEach(fn=>fn())
  }
  recordAudio = ({type,...incoming}:AudioEvent) => {
    const details={...incoming,mode:incoming.mode??this.selectedMode}
    if(type==='play')this.selectedMode=details.mode
    if(type==='play') {
      const key=`${this.trial}:${details.graphId}`,count=this.plays.get(key)??0
      if(count) this.record('replay',details)
      this.plays.set(key,count+1)
    }
    this.record(type,details)
  }
  exportJSON = () => JSON.stringify({ schemaVersion:'1',runId:this.runId,activity:this.activity,versions:PROTOCOL_VERSIONS,conditionKey:conditionKey(this.protocol),sessionEnded:this.events.some(e=>e.type==='session-ended'),modesUsed:[...new Set(this.events.filter(e=>e.type==='graph-scheduled').map(e=>e.mode))],protocol:this.protocol,questionOrder:this.order,truncated:this.dropped>0,droppedEvents:this.dropped,events:this.events },null,2)
}
