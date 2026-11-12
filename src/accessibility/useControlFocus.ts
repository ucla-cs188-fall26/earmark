import { useEffect, useRef, type FocusEvent } from 'react'

/** When transient audio controls disappear, return their keyboard focus to the
 * stable Play/Stop button. Never steal focus from another surviving control. */
export function useControlFocus(active: boolean) {
  const owned = useRef(false)
  useEffect(() => {
    if (active || !owned.current) return
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === document.body) document.querySelector<HTMLElement>('[data-main-playback]')?.focus()
      owned.current = false
    })
    return () => cancelAnimationFrame(frame)
  }, [active])
  return {
    onFocusCapture: () => { owned.current = true },
    onBlurCapture: (event: FocusEvent<HTMLElement>) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) owned.current = false
    },
  }
}
