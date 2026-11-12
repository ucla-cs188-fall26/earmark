import type { Graph, PlaybackPosition, Sonification } from '../types.ts'
import { axisKind, interpolation, observationAt } from './coordinates.ts'

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const tiny = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 })
const brief = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
export const formatNumber = (value: number) => (value !== 0 && Math.abs(value) < 0.000001 ? tiny : number).format(value)
const MONTHS: Record<string, string> = { Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' }
const expandedLabel = (label: string) => label.replace(/(\d{4}) Q([1-4])/g, 'quarter $2 of $1').replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTHS[m]).replace(/(\d+)(am|pm)\b/g, '$1 $2')
export function valueUnit(g: Graph) {
  if (g.valueUnit) return g.valueUnit
  const units: Record<string, { name: string; scale: number; description: string }> = {
    '°F': { name: 'degrees Fahrenheit', scale: 1, description: 'degrees Fahrenheit' },
    '%': { name: 'percent', scale: 1, description: 'percent' },
    '$': { name: 'dollars', scale: 1, description: 'dollars' },
    '$M': { name: 'dollars', scale: 1_000_000, description: 'millions of dollars' },
    'k$': { name: 'dollars', scale: 1000, description: 'thousands of dollars' },
  }
  if (g.unit === 'k') return { name: g.yLabel.toLowerCase(), scale: 1000, description: `thousands of ${g.yLabel.toLowerCase()}` }
  return units[g.unit ?? ''] ?? { name: g.unit ?? 'data units', scale: 1, description: g.unit ?? 'data units' }
}
export const formatValue = (g: Graph, raw: number) => `${formatNumber(raw * valueUnit(g).scale)} ${valueUnit(g).name}`
export function formatX(g: Graph, x: number): string {
  if (!g.xLabels) return `${formatNumber(x)}${g.xUnit ? ` ${g.xUnit}` : ''}`
  const t = observationAt(g, x), i = Math.floor(t), fraction = t - i
  const label = expandedLabel(g.xLabels[i])
  if (fraction < 1e-8) return label
  const next = expandedLabel(g.xLabels[i + 1])
  return interpolation(g) === 'step' ? `${label}, held until ${next}` : `${brief.format(fraction * 100)} percent of the way from ${label} to ${next}`
}
export function describeAxes(g: Graph): [string, string] {
  const first = formatX(g, g.points[0].x), last = formatX(g, g.points.at(-1)!.x)
  return [
    `The horizontal axis represents ${g.xDescription ?? g.xLabel}, from ${first} to ${last}, with ${g.points.length} ${axisKind(g) === 'categorical' ? 'ordered' : 'numeric'} observations.`,
    `The vertical axis represents ${g.yDescription ?? g.yLabel}, measured in ${valueUnit(g).description}.`,
  ]
}
/** Individual sentences also bound speech utterances below the watchdog cap. */
export function describePlaybackParts(g: Graph, s: Sonification): string[] {
  const kind = axisKind(g) === 'categorical' ? 'Ordered categories receive equal time between observations.' : 'Equal numeric distances on the horizontal axis receive equal playback time.'
  const curve = interpolation(g) === 'step' ? 'Values are held until the next observation; no intermediate values are invented.' : 'Values between observations are linear estimates, not additional measurements.'
  const last = s.notes.at(-1)!
  return [
    `The graph plays over ${brief.format(s.durationMs / 1000)} seconds, progressing from ${formatX(g, g.points[0].x)} to ${formatX(g, g.points.at(-1)!.x)}.`,
    kind, curve,
    `The final position is reached at ${brief.format(last.startMs / 1000)} seconds and held until the sequence ends.`,
    'The piano plays short sampled notes; Stop reports the latest sample reached.',
    'Pitches are rounded to the nearest step; spoken values describe the underlying sample.',
    'Release tails may continue briefly after the sequence.',
  ]
}
export const describeMapping = (g: Graph, s: Sonification) => describePlaybackParts(g, s).join(' ')
export function describeStop(g: Graph, p: PlaybackPosition): string {
  const t = observationAt(g, p.x)
  const estimate = interpolation(g) === 'linear' && Math.abs(t - Math.round(t)) > 1e-8
  return `Stopped at the latest sampled position. ${g.xLabel}: ${formatX(g, p.x)}. ${g.yLabel}: ${formatValue(g, p.value)}.${estimate ? ' This is an estimate between recorded observations.' : ''}`
}
