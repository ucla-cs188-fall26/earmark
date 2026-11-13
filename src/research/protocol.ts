import type { PlaybackPermissions } from '../audio/player.ts'

export const PROTOCOL_VERSIONS = Object.freeze({ schema: '1', narration: 'brief-guide-sections-1', piano: 'chromatic-sampled-transport-1', continuous: 'linear-midi-oscillator-1', stimuli: 'illustrative-bank-1' })
export interface StudyProtocol {
  id: string
  revision: string
  label: string
  approval: 'requires-prof-jun-review'
  mode: 'piano'
  introductionNavigation: 'section-controls'
  referenceDisclosure: 'minimum-maximum-start'
  feedback: 'after-answer' | 'after-session'
  fullListening: 'contiguous-from-start-no-seek'
  permissions: PlaybackPermissions
}
const assisted: StudyProtocol = {
  id:'demonstration-assisted', revision:'1', label:'Demonstration: assistance enabled (unapproved)',
  approval:'requires-prof-jun-review', mode:'piano', introductionNavigation:'section-controls', referenceDisclosure:'minimum-maximum-start',
  feedback:'after-answer', fullListening:'contiguous-from-start-no-seek',
  permissions:{pause:true,seek:true,position:true,skipIntroduction:true,speeds:[0.5,0.75,1,1.25,1.5]},
}
const fixed: StudyProtocol = { ...assisted, id:'demonstration-fixed', label:'Demonstration: fixed 1×, deferred feedback (unapproved)', feedback:'after-session', permissions:{pause:true,seek:false,position:false,skipIntroduction:false,speeds:[1]} }
export const STUDY_PROTOCOLS: readonly StudyProtocol[] = [assisted,fixed].map(p=>Object.freeze({...p,permissions:Object.freeze({...p.permissions,speeds:Object.freeze([...p.permissions.speeds])})}))
export const DEFAULT_STUDY_PROTOCOL = STUDY_PROTOCOLS[0]
export function validateProtocol(p: StudyProtocol): void {
  if (!p.id || !p.revision || p.mode !== 'piano' || p.approval !== 'requires-prof-jun-review') throw new Error('Unreviewed or unsupported study condition')
  if (p.fullListening !== 'contiguous-from-start-no-seek' || p.referenceDisclosure !== 'minimum-maximum-start') throw new Error('Unsupported study semantics')
  if(p.introductionNavigation!=='section-controls'||['pause','seek','position','skipIntroduction'].some(k=>typeof p.permissions[k as 'pause']!=='boolean'))throw new Error('Invalid assistance settings')
  if (!['after-answer','after-session'].includes(p.feedback) || !p.permissions.speeds.length || !p.permissions.speeds.includes(1) || p.permissions.speeds.some(s=>![0.5,0.75,1,1.25,1.5].includes(s))) throw new Error('Invalid study options')
}
/** Full settings are part of the condition key, so reusing a version cannot silently
 * combine different conditions. This is a reproducibility key, not a security hash. */
export function conditionKey(protocol: StudyProtocol | null) { return JSON.stringify({ versions:PROTOCOL_VERSIONS, protocol }) }
