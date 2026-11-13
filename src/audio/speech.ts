/** Speech is globally exclusive, but cancellation belongs to its current owner. */
export type SpeechResult = 'completed' | 'cancelled' | 'failed' | 'unavailable' | 'timeout' | 'watchdog-ended'
let cancelCurrent: (() => void) | null = null
export function stopSpeaking(): void { cancelCurrent?.() }
export function speak(text: string, signal?: AbortSignal): Promise<SpeechResult> {
  if (signal?.aborted) return Promise.resolve('cancelled')
  if (typeof speechSynthesis === 'undefined') return Promise.resolve('unavailable')
  stopSpeaking()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    let settled = false
    let cancellation: SpeechResult | null = null
    let watchdog: ReturnType<typeof setInterval> | undefined
    let cap: ReturnType<typeof setTimeout> | undefined
    const finish = (result: SpeechResult) => {
      if (settled) return
      settled = true;clearInterval(watchdog);clearTimeout(cap)
      signal?.removeEventListener('abort', abort)
      utterance.onend=null;utterance.onerror=null
      if(cancelCurrent===abort)cancelCurrent=null
      resolve(cancellation??result)
    }
    const cancel = (reason: SpeechResult) => {
      cancellation=reason
      if(cancelCurrent===abort)speechSynthesis.cancel()
      finish(reason)
    }
    const abort = () => cancel('cancelled')
    cancelCurrent=abort
    signal?.addEventListener('abort',abort,{once:true})
    utterance.onend=()=>finish('completed')
    utterance.onerror=()=>finish('failed')
    const startedAt=Date.now()
    watchdog=setInterval(()=>{
      if(Date.now()-startedAt>1500&&!speechSynthesis.speaking&&!speechSynthesis.pending)finish('watchdog-ended')
    },250)
    cap=setTimeout(()=>cancel('timeout'),Math.min(30_000,2000+text.length*70))
    try {speechSynthesis.speak(utterance)} catch {cancel('failed')}
  })
}
