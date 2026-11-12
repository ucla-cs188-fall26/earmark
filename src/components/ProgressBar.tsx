/**
 * Owner: Person 4.
 */
interface Props {
  current: number
  total: number
}

export function ProgressBar({ current, total }: Props) {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100)
  return (
    <div className="progress" role="progressbar" aria-valuenow={current} aria-valuemin={0} aria-valuemax={total}>
      <div className="progress__fill" style={{ width: `${pct}%` }} />
      <span className="progress__label">
        {current} / {total}
      </span>
    </div>
  )
}
