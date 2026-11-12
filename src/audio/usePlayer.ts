import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Graph } from '../types.ts'
import { describeStop } from '../graph/descriptions.ts'
import { PlaybackController } from './player.ts'
export type { PlayerStatus } from './player.ts'

export function usePlayer() {
  const [controller] = useState(() => new PlaybackController())
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  // Also safe under Strict Mode's setup → cleanup → setup cycle: stop is reusable.
  useEffect(() => () => { controller.stop() }, [controller])
  const stopAndAnnounce = (graph: Graph) => {
    const position = controller.stop()
    if (position?.graphId === graph.id) controller.announce(describeStop(graph, position))
  }
  return { ...snapshot, play: controller.play, stop: controller.stop, reset: controller.reset, stopAndAnnounce, pauseGraph: controller.pauseGraph, resumeGraph: controller.resumeGraph, move: controller.move, replaySegment: controller.replaySegment, setSpeed: controller.setSpeed, announcePosition: controller.announcePosition, previousSection: controller.previousSection, nextSection: controller.nextSection, replaySection: controller.replaySection, pauseNarration: controller.pauseNarration, resumeNarration: controller.resumeNarration, skipIntroduction: controller.skipIntroduction }
}
export type Player = ReturnType<typeof usePlayer>
