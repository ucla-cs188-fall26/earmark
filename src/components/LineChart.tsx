import type { Graph, Point } from '../types.ts'
import { axisPosition, interpolation } from '../graph/coordinates.ts'
import { formatValue, formatX } from '../graph/descriptions.ts'

interface Props { series: Graph; activePosition?: Point | null; width?: number; height?: number }
const PAD = { top: 24, right: 48, bottom: 48, left: 144 }

/** Non-interactive visual companion; the recorded-data table is the keyboard and
 * screen-reader equivalent. The sampled playhead shares audio/table coordinates. */
export function LineChart({ series, activePosition = null, width = 640, height = 320 }: Props) {
  const { points } = series
  const ys = points.map((p) => p.y)
  const xMin = axisPosition(series, points[0].x), xMax = axisPosition(series, points.at(-1)!.x)
  const yMin = Math.min(...ys), yMax = Math.max(...ys)
  const innerW = width - PAD.left - PAD.right, innerH = height - PAD.top - PAD.bottom
  const sx = (x: number) => PAD.left + (axisPosition(series, x) - xMin) / (xMax - xMin || 1) * innerW
  const sy = (y: number) => PAD.top + innerH - (y - yMin) / (yMax - yMin || 1) * innerH
  const path = points.map((p, i) => !i ? `M${sx(p.x)},${sy(p.y)}`
    : interpolation(series) === 'step' ? `H${sx(p.x)}V${sy(p.y)}` : `L${sx(p.x)},${sy(p.y)}`).join(' ')
  const yTicks = [...new Set([yMin, (yMin + yMax) / 2, yMax])]
  // Three legible category landmarks; every observation remains in the data table.
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img"
    aria-label={`${series.title}. ${series.yLabel} over ${series.xLabel}. Full values are available in the recorded graph data table.`}>
    {yTicks.map((t) => <g key={t}><line className="grid" x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} />
      <text className="tick" x={PAD.left - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle">{formatValue(series, t)}</text></g>)}
    {ticks.map((i) => <text key={i} className="tick" x={sx(points[i].x)} y={height - 20} textAnchor="middle">{formatX(series, points[i].x)}</text>)}
    <line className="axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + innerH} />
    <line className="axis" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} />
    <path className="line" d={path} />
    {points.map((p) => <circle key={p.x} className="marker" cx={sx(p.x)} cy={sy(p.y)} r={4} />)}
    {activePosition && <g><line className="playhead" x1={sx(activePosition.x)} x2={sx(activePosition.x)} y1={PAD.top} y2={PAD.top + innerH} />
      <circle className="marker marker--active" cx={sx(activePosition.x)} cy={sy(activePosition.y)} r={7} /></g>}
  </svg>
}
