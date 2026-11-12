/**
 * Quiz logic: ordering, answer validation, scoring.
 * Owner: Person 3.
 *
 * Pure functions, no React, so they are unit-tested in quiz.test.ts.
 */
import type { AnswerRecord, Question, QuizResult } from '../types.ts'

/** Fisher–Yates shuffle. Pass `random` to make it deterministic in tests. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Order the questions for one lesson run. */
export function orderQuestions(questions: readonly Question[], randomize = true): Question[] {
  return randomize ? shuffle(questions) : [...questions]
}

/** Validate a question definition. Throws on a malformed one so bad data fails fast. */
export function validateQuestion(q: Question): void {
  if (q.choices.length < 2) throw new Error(`Question ${q.id} needs at least two choices`)
  if (q.correctIndex < 0 || q.correctIndex >= q.choices.length) {
    throw new Error(`Question ${q.id} has correctIndex out of range`)
  }
}

export function checkAnswer(q: Question, chosenIndex: number | null): AnswerRecord {
  return { questionId: q.id, chosenIndex, correct: chosenIndex === q.correctIndex }
}

export function scoreAnswers(answers: readonly AnswerRecord[]): QuizResult {
  const correct = answers.filter((a) => a.correct).length
  return { answers: [...answers], correct, total: answers.length }
}
