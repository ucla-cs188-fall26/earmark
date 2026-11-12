/**
 * Shared types for the whole app.
 * Owner: Person 1. Change only through a PR that the other three review,
 * because every other file depends on these.
 */

// ---------------------------------------------------------------------------
// Graphs (Person 1)
// ---------------------------------------------------------------------------

export interface Point {
  x: number
  y: number
}

export type GraphStage = 'tutorial' | 'test'
export type GraphDifficulty = 'easy' | 'medium' | 'hard'

export interface Graph {
  id: string
  title: string
  xLabel: string
  yLabel: string
  /** Unit suffix for display, e.g. "°F" or "$". */
  unit?: string
  /** Optional labels for the x axis, index-aligned with `points` (e.g. month names). */
  xLabels?: string[]
  /** Which stage this graph belongs to. */
  stage?: GraphStage
  /** Relative challenge level for future scoring / selection. */
  difficulty?: GraphDifficulty
  points: Point[]
}

// ---------------------------------------------------------------------------
// Sonification protocol (Person 2)
// ---------------------------------------------------------------------------

export interface ProtocolOptions {
  /** Total length of the audio clip in milliseconds. */
  durationMs: number
  /** Lowest MIDI note allowed (the "comfortable range" floor). 48 = C3. */
  lowestMidi: number
  /** Highest MIDI note allowed (the "comfortable range" ceiling). 84 = C6. */
  highestMidi: number
  /** Fraction of each note slot left silent. Small = legato, near-continuous. */
  gapRatio: number
  /** Pitch grid in semitones: 1 = chromatic, 2 = whole steps. */
  stepSemitones: number
  /** Length of one note. The graph is resampled so notes are this short. */
  noteMs: number
  /**
   * Data units per pitch step. Leave undefined to let the protocol pick a
   * "nice" value (1, 2, 2.5, 5 × 10^k) that fits the graph in range.
   */
  unitsPerStep?: number
}

export const DEFAULT_OPTIONS: ProtocolOptions = {
  durationMs: 6000,
  lowestMidi: 48, // C3
  highestMidi: 84, // C6
  gapRatio: 0.05,
  stepSemitones: 1,
  noteMs: 120,
}

export interface Anchor {
  value: number
  midi: number
  /** Scientific pitch name, e.g. "F#4". */
  name: string
}

export interface Note {
  /** Position in the note sequence. */
  index: number
  /** Nearest data point (for highlighting and for "value at this moment"). */
  pointIndex: number
  /** Interpolated x along the graph. */
  x: number
  /** Interpolated y: what this note's pitch encodes. */
  value: number
  midi: number
  name: string
  startMs: number
  durationMs: number
}

/**
 * One element of the packed preamble: either a spoken token or a piano note.
 * The listener learns the fixed order and decodes it without any sentences.
 */
export type PreambleItem = { say: string } | { note: number; name: string; ms: number }

/** The preamble anchors (trough / peak / start / step) plus the note sequence. */
export interface Sonification {
  graphId: string
  durationMs: number
  trough: Anchor
  peak: Anchor
  start: Anchor
  unitsPerStep: number
  notes: Note[]
}

// ---------------------------------------------------------------------------
// Questions and quiz (Person 3)
// ---------------------------------------------------------------------------

export interface Question {
  id: string
  /** Which graph the listener hears before answering. */
  graphId: string
  prompt: string
  choices: string[]
  /** Index into `choices`. */
  correctIndex: number
  /** Shown on the reveal screen after answering. */
  explanation?: string
}

export interface AnswerRecord {
  questionId: string
  /** Index into the question's `choices`, or null if skipped. */
  chosenIndex: number | null
  correct: boolean
}

export interface QuizResult {
  answers: AnswerRecord[]
  correct: number
  total: number
}

// ---------------------------------------------------------------------------
// Lesson flow (Person 4)
// ---------------------------------------------------------------------------

export type LessonPhase =
  | { kind: 'intro' }
  | { kind: 'question'; index: number; stage: 'listen' | 'answer' | 'reveal' }
  | { kind: 'results' }
