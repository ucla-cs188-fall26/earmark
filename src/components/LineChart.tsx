import { useState } from 'react'
import type { Graph } from '../types.ts'

interface Props {
  series: Graph
  /** Index of the point currently being sonified, or -1. */
  activeIndex: number
  xTickLabel?: (x: number) => string
  width?: number
  height?: number
}

const PAD = { top: 16, right: 16, bottom: 36, left: 48 }

/**
 * Minimal single-series line chart in plain SVG.
 * Highlights the point whose note is currently playing so sighted
 * collaborators can follow the mapping while they listen.
 */
export function LineChart({
  series,
  activeIndex,
  xTickLabel = String,
  width = 640,
  height = 320,
}: Props) {
  const [hover, setHover] = useState(-1)
  const { points } = series
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom

  const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * innerW
  const sy = (y: number) => PAD.top + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ')
  const yTicks = [yMin, (yMin + yMax) / 2, yMax]
  const focus = activeIndex >= 0 ? activeIndex : hover
  const focusPoint = focus >= 0 ? points[focus] : null

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${series.title}. ${series.yLabel} over ${series.xLabel}.`}
      onMouseLeave={() => setHover(-1)}
    >
      {yTicks.map((t) => (
        <g key={t}>
          <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} />
          <text className="tick" x={PAD.left - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle">
            {Number(t.toFixed(1))}
            {series.unit ?? ''}
          </text>
        </g>
      ))}
      {points.map((p) => (
        <text
          key={p.x}
          className="tick"
          x={sx(p.x)}
          y={height - PAD.bottom + 16}
          textAnchor="middle"
        >
          {xTickLabel(p.x)}
        </text>
      ))}
      <line className="axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + innerH} />
      <line className="axis" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} />

      {focusPoint && (
        <line className="playhead" x1={sx(focusPoint.x)} x2={sx(focusPoint.x)} y1={PAD.top} y2={PAD.top + innerH} />
      )}
      <path className="line" d={path} />
      {points.map((p, i) => (
        <circle
          key={p.x}
          className={`marker${i === focus ? ' marker--active' : ''}`}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={i === focus ? 7 : 4}
          onMouseEnter={() => setHover(i)}
        />
      ))}
      {focusPoint && (
        <text className="tooltip" x={sx(focusPoint.x)} y={sy(focusPoint.y) - 14} textAnchor="middle">
          {xTickLabel(focusPoint.x)}: {focusPoint.y}
          {series.unit ?? ''}
        </text>
      )}
    </svg>
  )
}
