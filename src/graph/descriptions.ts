import type { Graph, PlaybackPosition, Sonification } from '../types.ts'
import { generatedMapping } from './mapping.ts'
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
export function formatValue(g: Graph, raw: number): string {
  const unit = valueUnit(g), amount = raw * unit.scale
  const name = Math.abs(amount) === 1
    ? unit.name.replace(/\b(users|dollars|requests|visitors|degrees|units|points)\b/g, (word) => word.slice(0, -1))
    : unit.name
  return `${formatNumber(amount)} ${name}`
}
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
/** A category unit is one observation step; numeric units retain their meaning. */
function horizontalUnit(g: Graph): string {
  const unit = axisKind(g) === 'categorical' ? g.xLabel : g.xUnit ?? g.xLabel
  const singular: Record<string, string> = {
    s: 'second', seconds: 'second', ms: 'millisecond', milliseconds: 'millisecond',
    minutes: 'minute', hours: 'hour', days: 'day', weeks: 'week', months: 'month',
    quarters: 'quarter', steps: 'step', 'sample-index units': 'sample-index unit',
  }
  return singular[unit.toLowerCase()] ?? unit.toLowerCase()
}
export const describePitchReference = (g: Graph, s: Sonification) =>
  `Each semitone represents ${formatValue(g, s.unitsPerStep / s.stepSemitones)}.`

/** Shared, brief user-facing guide. Sequence spacing describes X and time, not slope. */
export function describePlaybackParts(g: Graph, s: Sonification): string[] {
  const mapping = generatedMapping(g, s)
  if (!mapping) return ['There is only one observation, so there is no horizontal interval to describe.']
  const display = (value: number) => value !== 0 && Math.abs(value) < 0.005 ? formatNumber(value) : brief.format(value)
  const intervals = display(mapping.noteIntervalsPerUnit), seconds = display(mapping.secondsPerUnit)
  const approximation = !mapping.uniform ? 'an average of ' : Number.isInteger(mapping.noteIntervalsPerUnit) ? '' : 'approximately '
  return [
    `One ${horizontalUnit(g)} on the horizontal axis corresponds to ${approximation}${intervals} note ${intervals === '1' ? 'interval' : 'intervals'} and approximately ${seconds} ${seconds === '1' ? 'second' : 'seconds'} of playback.`,
    `The change in ${g.yLabel.toLowerCase()} can differ between successive observations; this timing does not imply a fixed change in value.`,
  ]
}
export const describeMapping = (g: Graph, s: Sonification) => describePlaybackParts(g, s).join(' ')

/** Called only in the recorded-data view, where full values are already permitted. */
export function describeObservationChange(g: Graph, from: number, to: number): string {
  const delta = g.points[to].y - g.points[from].y
  const change = delta === 0 ? `does not change (${formatValue(g, 0)})`
    : `${delta > 0 ? 'increases' : 'decreases'} by ${formatValue(g, Math.abs(delta))}`
  return `From ${formatX(g, g.points[from].x)} to ${formatX(g, g.points[to].x)}, ${g.yLabel.toLowerCase()} ${change}.`
}
export function describeStop(g: Graph, p: PlaybackPosition): string {
  const t = observationAt(g, p.x)
  const estimate = interpolation(g) === 'linear' && Math.abs(t - Math.round(t)) > 1e-8
  return `Stopped at the latest sampled position. ${g.xLabel}: ${formatX(g, p.x)}. ${g.yLabel}: ${formatValue(g, p.value)}.${estimate ? ' This is an estimate between recorded observations.' : ''}`
}
