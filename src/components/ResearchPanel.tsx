import { useSyncExternalStore } from 'react'
import type { ResearchRecord } from '../research/record.ts'

export function ResearchPanel({ record }: { record: ResearchRecord }) {
  const count=useSyncExternalStore(record.subscribe,record.getSnapshot,record.getSnapshot)
  const download=()=>{
    const url=URL.createObjectURL(new Blob([record.exportJSON()],{type:'application/json'}))
    const a=document.createElement('a');a.href=url;a.download=`earmark-${record.activity}-${record.runId}.json`
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <section aria-label="Local activity record">
    <h3>Local activity record</h3>
    <p>{count} interaction events observed. Anonymous interaction records stay in this tab and are not sent to a server. Export before leaving or restarting.</p>
    {record.getDropped()>0&&<p role="alert">The event buffer is full. Export is marked incomplete and must not be treated as a complete study record.</p>}
    <button type="button" onClick={download}>Download local JSON record</button>
  </section>
}
