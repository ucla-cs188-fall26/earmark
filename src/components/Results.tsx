/**
 * Completion screen.
 * Owner: Person 4.
 *
 * TODO (Person 4): per-question review with replay, export results as JSON
 * for the study, "try again" with a fresh shuffle.
 */
import type { Question, QuizResult } from '../types.ts'

interface Props {
  result: QuizResult
  questions: Question[]
  onRestart: () => void
}

export function Results({ result, questions, onRestart }: Props) {
  return (
    <section className="results">
      <h2>Lesson complete</h2>
      <p className="score">
        {result.correct} / {result.total} correct
      </p>
      <ol>
        {result.answers.map((a) => {
          const q = questions.find((x) => x.id === a.questionId)
          return (
            <li key={a.questionId} className={a.correct ? 'ok' : 'miss'}>
              {q?.prompt ?? a.questionId}: {a.correct ? 'correct' : 'incorrect'}
            </li>
          )
        })}
      </ol>
      <button type="button" onClick={onRestart}>
        Start over
      </button>
    </section>
  )
}
