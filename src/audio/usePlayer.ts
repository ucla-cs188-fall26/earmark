import { useEffect, useState, useSyncExternalStore } from 'react'
import { PlaybackController } from './player.ts'
export type { PlayerStatus } from './player.ts'

export function usePlayer() {
  const [controller] = useState(() => new PlaybackController())
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  // Also safe under Strict Mode's setup → cleanup → setup cycle: stop is reusable.
  useEffect(() => () => controller.stop(), [controller])
  return { ...snapshot, play: controller.play, stop: controller.stop, announce: controller.announce }
}
export type Player = ReturnType<typeof usePlayer>
