import { describe, expect, it, vi } from 'vitest'

// Exercise the hook's owner cleanup without adding a DOM/test-renderer dependency.
// Real React unmount and Strict Mode are additionally checked in the browser.
const lifecycle = vi.hoisted(() => ({ cleanup: undefined as undefined | (() => void), stop: vi.fn() }))
vi.mock('react', () => ({
  useState: (init: () => unknown) => [init()],
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useEffect: (effect: () => () => void) => { lifecycle.cleanup = effect() },
}))
vi.mock('./player.ts', () => ({ PlaybackController: class {
  stop = lifecycle.stop
  play = vi.fn()
  announce = vi.fn()
  reset = vi.fn()
  subscribe = vi.fn()
  getSnapshot = () => ({ status: 'idle', activeIndex: -1, error: null })
} }))
import { usePlayer } from './usePlayer.ts'

describe('usePlayer owner lifecycle', () => {
  it('cancels the owned controller when React runs the unmount cleanup', () => {
    lifecycle.stop.mockClear()
    usePlayer()
    expect(lifecycle.stop).not.toHaveBeenCalled()
    lifecycle.cleanup?.()
    expect(lifecycle.stop).toHaveBeenCalledOnce()
  })
})
