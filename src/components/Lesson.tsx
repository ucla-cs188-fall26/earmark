import { GraphControls } from './GraphControls.tsx'
import { NarrationControls } from './NarrationControls.tsx'
/**
 * The lesson state machine. Connects graphs (P1), audio (P2) and quiz (P3).
 * Owner: Person 4.
 *
 * Flow:  intro -> [listen -> answer -> reveal] x N -> results
 *
 * TODO (Person 4): persist progress in localStorage, limit replays per
 * question (and record the count), keyboard shortcuts (space = play).
 */
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { chartPosition } from '../graph/coordinates.ts'
import { buildPreamble, sonify } from '../audio/sonification.ts'
import { usePlayer } from '../audio/usePlayer.ts'
import { getGraph } from '../data/graphs.ts'
import { QUESTIONS, TEST_QUESTIONS } from '../data/questions.ts'
import { checkAnswer, orderQuestions, scoreAnswers } from '../quiz/quiz.ts'
import { INITIAL_LISTENING, listeningReducer } from '../quiz/listening.ts'
import type { AnswerRecord, LessonPhase } from '../types.ts'
import { ProtocolSummary } from './ProtocolSummary.tsx'
import { StoppedPosition } from './StoppedPosition.tsx'
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
  const [listening, dispatchListening] = useReducer(listeningReducer, INITIAL_LISTENING)
  const hasListened = listening.completed
  const instructionsId = useId()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const player = usePlayer()

  const question = phase.kind === 'question' ? questions[phase.index] : null
  const graph = question ? getGraph(question.graphId) : null
  const sonification = useMemo(() => (graph ? sonify(graph) : null), [graph])
  const current = answers.find((a) => a.questionId === question?.id) ?? null

  const restart = () => {
    player.reset()
    setQuestions(orderQuestions(questionBank))
    setAnswers([])
    dispatchListening({ type: 'reset' })
    setPhase({ kind: 'intro' })
  }

  const goToQuestion = (index: number) => {
    player.reset()
    dispatchListening({ type: 'reset' })
    if (index >= questions.length) setPhase({ kind: 'results' })
    else setPhase({ kind: 'question', index, stage: 'listen' })
  }

  const play = () => {
    if (!sonification || !graph) return
    const generation = listening.generation
    dispatchListening({ type: 'started', generation })
    const request = player.play(sonification, buildPreamble(sonification, graph))
    void request.finished.then((outcome) => {
      if (mounted.current) dispatchListening({ type: 'settled', generation, outcome: outcome.kind })
    })
  }

  const answer = (chosenIndex: number) => {
    if (!question || phase.kind !== 'question' || !hasListened || current) return
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
  const busy = player.status !== 'idle' && player.status !== 'error'
  const activePosition = chartPosition(sonification, player.activeIndex, player.stoppedPosition)

  return (
    <section className="lesson">
      <ProtocolSummary graph={graph} sonification={sonification} />
      <ProgressBar current={phase.index + 1} total={questions.length} />

      <div className="controls">
        <button type="button" onClick={busy ? () => player.stopAndAnnounce(graph) : () => void play()}>
          {busy ? 'Stop' : listening.attempted ? 'Replay' : 'Play'}
        </button>
      </div>

      <p id={instructionsId} className="hint" role="status">
        {current ? 'Answer recorded. Continue to the next question when ready.'
          : hasListened ? 'Graph playback complete. You can answer now or replay the graph.'
          : listening.attempted && !busy ? 'Playback did not complete. Replay the entire graph to answer.'
          : 'Listen to the entire graph before answering. Answers become available when playback finishes.'}
      </p>
      <GraphControls player={player} graph={graph} eligible={hasListened} requiresFullListening onReplay={() => void play()} />
      <NarrationControls player={player} preamble={buildPreamble(sonification, graph)} />
      <StoppedPosition graph={graph} position={player.stoppedPosition} />
      {player.error && <p role="alert">{player.error}</p>}

      <QuestionCard
        question={question}
        chosenIndex={current?.chosenIndex ?? null}
        disabled={!hasListened}
        instructionsId={instructionsId}
        onAnswer={answer}
      />

      {phase.stage === 'reveal' && (
        <>
          <GraphReveal graph={graph} sonification={sonification} activePosition={activePosition} />
          <button type="button" onClick={() => goToQuestion(phase.index + 1)}>
            {phase.index + 1 < questions.length ? 'Next question' : 'See results'}
          </button>
        </>
      )}
    </section>
  )
}
