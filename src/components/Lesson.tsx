/**
 * The lesson state machine. Connects graphs (P1), audio (P2) and quiz (P3).
 * Owner: Person 4.
 *
 * Flow:  intro -> [listen -> answer -> reveal] x N -> results
 *
 * TODO (Person 4): persist progress in localStorage, limit replays per
 * question (and record the count), keyboard shortcuts (space = play).
 */
import { useMemo, useState } from 'react'
import { buildPreamble, sonify } from '../audio/sonification.ts'
import { speak } from '../audio/speech.ts'
import { usePlayer } from '../audio/usePlayer.ts'
import { getGraph, xTickLabel } from '../data/graphs.ts'
import { QUESTIONS, TEST_QUESTIONS } from '../data/questions.ts'
import { checkAnswer, orderQuestions, scoreAnswers } from '../quiz/quiz.ts'
import type { AnswerRecord, LessonPhase } from '../types.ts'
import { GraphReveal } from './GraphReveal.tsx'
import { ProgressBar } from './ProgressBar.tsx'
import { ProtocolIntro } from './ProtocolIntro.tsx'
import { QuestionCard } from './QuestionCard.tsx'
import { Results } from './Results.tsx'

export function Lesson({ mode = 'tutorial' }: { mode?: 'tutorial' | 'test' }) {
  const questionBank = mode === 'test' ? TEST_QUESTIONS : QUESTIONS

  const [questions, setQuestions] = useState(() => orderQuestions(questionBank))
  const [phase, setPhase] = useState<LessonPhase>({ kind: 'intro' })
  const [answers, setAnswers] = useState<AnswerRecord[]>([])
  const [hasListened, setHasListened] = useState(false)
  const player = usePlayer()

  const question = phase.kind === 'question' ? questions[phase.index] : null
  const graph = question ? getGraph(question.graphId) : null
  const sonification = useMemo(() => (graph ? sonify(graph) : null), [graph])
  const current = answers.find((a) => a.questionId === question?.id) ?? null

  const restart = () => {
    player.stop()
    setQuestions(orderQuestions(questionBank))
    setAnswers([])
    setHasListened(false)
    setPhase({ kind: 'intro' })
  }

  const goToQuestion = (index: number) => {
    player.stop()
    setHasListened(false)
    if (index >= questions.length) setPhase({ kind: 'results' })
    else setPhase({ kind: 'question', index, stage: 'listen' })
  }

  const play = async () => {
    if (!sonification || !graph) return
    await player.play(sonification, buildPreamble(sonification, graph))
    setHasListened(true)
  }

  /** Stop, then say where we were: "Apr, 14.8". */
  const stopAndAnnounce = () => {
    const note = sonification?.notes[player.activeIndex]
    player.stop()
    if (note && graph) {
      const point = graph.points[note.pointIndex]
      void speak(`${xTickLabel(graph, note.pointIndex)}, ${Number(point.y.toFixed(2))}`)
    }
  }

  const answer = (chosenIndex: number) => {
    if (!question || phase.kind !== 'question') return
    player.stop()
    setAnswers((prev) => [...prev, checkAnswer(question, chosenIndex)])
    setPhase({ ...phase, stage: 'reveal' })
  }

  if (phase.kind === 'intro') {
    return <ProtocolIntro player={player} mode={mode} onStart={() => goToQuestion(0)} />
  }

  if (phase.kind === 'results') {
    return <Results result={scoreAnswers(answers)} questions={questions} onRestart={restart} />
  }

  if (!question || !graph || !sonification) return null
  const busy = player.status !== 'idle'
  const activePoint = sonification.notes[player.activeIndex]?.pointIndex ?? -1

  return (
    <section className="lesson">
      <ProgressBar current={phase.index + 1} total={questions.length} />

      <div className="controls">
        <button type="button" onClick={busy ? stopAndAnnounce : () => void play()}>
          {busy ? 'Stop' : hasListened ? 'Replay' : 'Play'}
        </button>
        {!hasListened && phase.stage !== 'reveal' && <span className="hint">Listen first, then answer.</span>}
      </div>

      <QuestionCard
        question={question}
        chosenIndex={current?.chosenIndex ?? null}
        disabled={!hasListened}
        onAnswer={answer}
      />

      {phase.stage === 'reveal' && (
        <>
          <GraphReveal graph={graph} sonification={sonification} activeIndex={activePoint} />
          <button type="button" onClick={() => goToQuestion(phase.index + 1)}>
            {phase.index + 1 < questions.length ? 'Next question' : 'See results'}
          </button>
        </>
      )}
    </section>
  )
}
