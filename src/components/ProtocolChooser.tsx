import { STUDY_PROTOCOLS, type StudyProtocol } from '../research/protocol.ts'

export function ProtocolChooser({ protocol, onChange }: { protocol: StudyProtocol; onChange:(p:StudyProtocol)=>void }) {
  return <section aria-label="Draft test protocol">
    <h3>Draft protocol — Prof. Jun review required</h3>
    <p>These are configurable demonstration conditions, not approved study instructions. The selected settings are locked when the test starts and included in the local export.</p>
    <label>Test protocol preset{' '}
      <select value={protocol.id} onChange={e=>onChange(STUDY_PROTOCOLS.find(p=>p.id===e.target.value)!)}>
        {STUDY_PROTOCOLS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </label>
    <p>Condition: {protocol.id}, revision {protocol.revision}. Piano only. Feedback: {protocol.feedback}. Seeking: {protocol.permissions.seek?'allowed':'disabled'}. Exact position lookup: {protocol.permissions.position?'allowed':'disabled'}. Direct Skip Introduction control: {protocol.permissions.skipIntroduction?'allowed':'disabled'}. Section navigation remains available and is logged. Speeds: {protocol.permissions.speeds.map(s=>`${s}×`).join(', ')}.</p>
  </section>
}
