import { useLayoutEffect } from 'react'

/** Focus once per screen transition, never once per audio frame. */
export function useScreenFocus(key: string, selector: string) {
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>(selector)
      if (heading) { heading.tabIndex = -1; heading.focus() }
    })
    return () => cancelAnimationFrame(frame)
  }, [key, selector])
}
