import { DEFAULT_STUDY_PROTOCOL, type StudyProtocol } from '../research/protocol.ts'
import { ResearchRecord } from '../research/record.ts'
import { ResearchPanel } from './ResearchPanel.tsx'
import { ProtocolChooser } from './ProtocolChooser.tsx'
import { useScreenFocus } from '../accessibility/useScreenFocus.ts'
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
  const [protocol, setProtocol] = useState(DEFAULT_STUDY_PROTOCOL)
  const [record, setRecord] = useState(() => { const r=new ResearchRecord(mode==='test'?'scored':'tutorial',mode==='test'?DEFAULT_STUDY_PROTOCOL:null);r.setOrder(questions.map(q=>q.id));return r })
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
  const player = usePlayer(record.recordAudio)
  const feedbackDeferred = mode === 'test' && protocol.feedback === 'after-session'
  const screenKey = phase.kind === 'question' ? `${phase.index}:${phase.stage}` : phase.kind
  useScreenFocus(screenKey, phase.kind === 'intro' ? '.intro > h2' : phase.kind === 'results' ? '.results > h2' : phase.stage === 'reveal' ? (feedbackDeferred ? '.answer-recorded-focus' : '.reveal h3') : '.lesson .graph-information h2')

  const question = phase.kind === 'question' ? questions[phase.index] : null
  const graph = question ? getGraph(question.graphId) : null
  const sonification = useMemo(() => (graph ? sonify(graph) : null), [graph])
  const current = answers.find((a) => a.questionId === question?.id) ?? null

  const restart = () => {
    player.reset()
    const next=orderQuestions(questionBank)
    setQuestions(next)
    const fresh=new ResearchRecord(mode==='test'?'scored':'tutorial',mode==='test'?protocol:null)
    fresh.setOrder(next.map(q=>q.id));setRecord(fresh)
    setAnswers([])
    dispatchListening({ type: 'reset' })
    setPhase({ kind: 'intro' })
  }

  const goToQuestion = (index: number) => {
    player.reset()
    dispatchListening({ type: 'reset' })
    if (index >= questions.length) {
      const result=scoreAnswers(answers)
      record.record('session-ended',{correct:result.correct,total:result.total})
      setPhase({ kind: 'results' })
    } else {
      if(mode==='test'&&!protocol.permissions.speeds.includes(player.speed??1))player.setSpeed(1)
      record.enterTrial(questions[index].id,questions[index].graphId)
      setPhase({ kind: 'question', index, stage: 'listen' })
    }
  }

  const play = () => {
    if (!sonification || !graph) return
    const generation = listening.generation
    dispatchListening({ type: 'started', generation })
    const request = player.play(sonification, buildPreamble(sonification, graph), {mode:'piano',graph,permissions:mode==='test'?protocol.permissions:undefined})
    void request.finished.then((outcome) => {
      if (mounted.current) dispatchListening({ type: 'settled', generation, outcome: outcome.kind })
    })
  }

  const answer = (chosenIndex: number) => {
    if (!question || phase.kind !== 'question' || !hasListened || current) return
    player.stop()
    record.record('answer-submitted',{questionId:question.id,chosenIndex})
    setAnswers((prev) => [...prev, checkAnswer(question, chosenIndex)])
    setPhase({ ...phase, stage: 'reveal' })
  }

  if (phase.kind === 'intro') {
    const choose=(selected:StudyProtocol)=>{
      player.reset();setProtocol(selected)
      const fresh=new ResearchRecord('scored',selected);fresh.setOrder(questions.map(q=>q.id));setRecord(fresh)
    }
    return <><ProtocolIntro player={player} mode={mode} onStart={() => goToQuestion(0)} protocolControls={mode==='test'?<ProtocolChooser protocol={protocol} onChange={choose}/>:undefined} /><ResearchPanel record={record}/></>
  }

  if (phase.kind === 'results') {
    return <><Results result={scoreAnswers(answers)} questions={questions} onRestart={restart} />
      <p>Restart begins a new local record. Export the current record first.</p>
      {feedbackDeferred&&<details><summary>Review answers after the session</summary>{answers.map(a=>{const q=questions.find(q=>q.id===a.questionId)!;const g=getGraph(q.graphId);return <section key={q.id}><h3>{q.prompt}</h3><p>Your answer: {q.choices[a.chosenIndex!]}. Correct answer: {q.choices[q.correctIndex]}.</p><GraphReveal graph={g} sonification={sonify(g)}/></section>})}</details>}
      <ResearchPanel record={record}/></>
  }

  if (!question || !graph || !sonification) return null
  const busy = player.status !== 'idle' && player.status !== 'error'
  const activePosition = chartPosition(sonification, player.activeIndex, player.stoppedPosition, player.livePosition)

  return (
    <section className="lesson">
      <p>{mode==='test'?`Scored test — ${protocol.id}, revision ${protocol.revision} (review required)`:'Tutorial — unscored'}</p>
      <ProtocolSummary graph={graph} sonification={sonification} />
      <ProgressBar current={phase.index + 1} total={questions.length} />

      <div className="controls">
        <button data-main-playback type="button" onClick={busy ? () => player.stopAndAnnounce(graph) : () => void play()}>
          {busy ? 'Stop' : listening.attempted ? 'Replay' : 'Play'}
        </button>
      </div>

      <p id={instructionsId} className="hint" role="status">
        {current ? 'Answer recorded. Continue to the next question when ready.'
          : hasListened ? 'Graph playback complete. You can answer now or replay the graph.'
          : listening.attempted && !busy ? 'Playback did not complete. Replay the entire graph to answer.'
          : 'Listen to the entire graph before answering. Answers become available when playback finishes.'}
      </p>
      <GraphControls player={player} sonification={sonification} graph={graph} eligible={hasListened} requiresFullListening permissions={mode==='test'?protocol.permissions:undefined} onReplay={() => void play()} />
      <NarrationControls player={player} preamble={buildPreamble(sonification, graph)} permissions={mode==='test'?protocol.permissions:undefined} />
      <StoppedPosition graph={graph} position={player.stoppedPosition} />
      {player.error && <p role="alert">{player.error}</p>}

      <QuestionCard
        question={question}
        chosenIndex={current?.chosenIndex ?? null}
        disabled={!hasListened}
        showFeedback={!feedbackDeferred}
        instructionsId={instructionsId}
        onAnswer={answer}
      />

      {phase.stage === 'reveal' && (
        <>
          {!feedbackDeferred?<GraphReveal graph={graph} sonification={sonification} activePosition={activePosition} />:<p className="answer-recorded-focus" tabIndex={-1}>Feedback and graph data are deferred until the session ends.</p>}
          <button type="button" onClick={() => goToQuestion(phase.index + 1)}>
            {phase.index + 1 < questions.length ? 'Next question' : 'See results'}
          </button>
        </>
      )}
      <ResearchPanel record={record}/>
    </section>
  )
}
