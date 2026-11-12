import type { Graph, PlaybackPosition } from '../types.ts'
import { describeStop } from '../graph/descriptions.ts'

/** App speech announces once. Keep this persistent text out of live regions to
 * avoid competing screen-reader and synthesis announcements. */
export function StoppedPosition({ graph, position }: { graph: Graph; position: PlaybackPosition | null }) {
  if (!position || position.graphId !== graph.id) return null
  return <section className="stopped-position" aria-label="Stopped playback position">
    <h3>Stopped position</h3>
    <p>{describeStop(graph, position)}</p>
  </section>
}
