/**
 * One multiple-choice question.
 * Owner: Person 3.
 *
 * TODO (Person 3): keyboard navigation between choices, feedback styling,
 * "I'm not sure" / skip option, replay-count tracking.
 */
import type { Question } from '../types.ts'

interface Props {
  question: Question
  /** The index the listener chose, once they have answered. */
  chosenIndex: number | null
  /** Disabled until one graph playback has completed naturally. */
  disabled?: boolean
  instructionsId?: string
  onAnswer: (index: number) => void
}

export function QuestionCard({ question, chosenIndex, disabled = false, instructionsId, onAnswer }: Props) {
  const answered = chosenIndex !== null
  return (
    <fieldset className="question" disabled={disabled || answered} aria-describedby={instructionsId}>
      <legend>{question.prompt}</legend>
      <ol className="choices">
        {question.choices.map((choice, i) => {
          let state = ''
          if (answered) {
            if (i === question.correctIndex) state = ' choice--correct'
            else if (i === chosenIndex) state = ' choice--wrong'
          }
          return (
            <li key={choice}>
              <button type="button" className={`choice${state}`} onClick={() => onAnswer(i)}>
                {choice}
              </button>
            </li>
          )
        })}
      </ol>
      {answered && (
        <p className="feedback" role="status">
          {chosenIndex === question.correctIndex ? 'Correct.' : 'Not quite.'}{' '}
          Your answer: {question.choices[chosenIndex!]}. Correct answer: {question.choices[question.correctIndex]}. {question.explanation ?? ''}
        </p>
      )}
    </fieldset>
  )
}
