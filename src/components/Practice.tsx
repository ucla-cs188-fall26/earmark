/**
 * Practice: training-style lesson (graph visible) on generated graphs.
 * Pick a difficulty, press "New set" for a fresh seed. Same seed, same set.
 */
import { useMemo, useState } from 'react'
import { generate, toBank } from '../generator/generate.ts'
import type { GraphDifficulty } from '../types.ts'
import { Lesson } from './Lesson.tsx'

export function Practice() {
  const [level, setLevel] = useState<GraphDifficulty>('medium')
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const bank = useMemo(() => toBank(generate(seed, level)), [seed, level])
  return (
    <>
      <div className="controls practice-controls">
        <label>
          Difficulty{' '}
          <select value={level} onChange={(e) => setLevel(e.target.value as GraphDifficulty)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>New set</button>
        <span className="hint">Set #{seed}</span>
      </div>
      <Lesson key={`${seed}-${level}`} mode="tutorial" showGraph bank={bank} />
    </>
  )
}
