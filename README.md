# Earmark

Hear a graph as a sequence of piano notes. Earmark is a training and demo site for
our sonification protocol, built to show that a short spoken preamble plus a
whole-step pitch mapping is easier to follow than Apple's built-in audio graphs.

**Live site:** https://laziestcactus.github.io/earmark/ (deploys from `main`)

## Quick start

```sh
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm test`          | Run the protocol unit tests (Vitest)           |
| `npm run test:watch`| Same, in watch mode                            |
| `npm run typecheck` | `tsc -b` over app and config                   |
| `npm run lint`      | oxlint                                         |
| `npm run build`     | Production build into `dist/`                  |
| `npm run preview`   | Serve `dist/` locally                          |

Requires Node 20+ (`.nvmrc` is set to 20).

## Tech stack and why

| Choice                        | Reason                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| **Vite + React + TypeScript** | Static site, no backend needed. Fast to run locally, trivial to deploy, everyone knows it. |
| **Tone.js `Sampler`**         | Real sampled piano (Salamander grand) in the browser with sample-accurate scheduling.      |
| **Plain SVG chart**           | ~100 lines, no chart library, full control over the playhead that follows the audio.       |
| **Web Speech API**            | Speaks the preamble so the demo works end to end without sight.                            |
| **Vitest**                    | Protocol logic is pure TS, so it is unit-tested with no browser.                           |
| **GitHub Pages via Actions**  | Push to `main` and the demo is live for user-study participants.                           |

Deliberately *not* included yet: a backend, auth, a database, a state library.
Add them only when a feature needs them.

## Who owns what

Each person owns their files. Touch someone else's file only via a PR they
review. `src/types.ts` is shared: change it through a PR all four look at.

| Owner    | Area                                   | Files                                                                                     |
| -------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Person 1 | Graph data, shared types, graph reveal | `types.ts`, `data/graphs.ts`, `components/GraphReveal.tsx`, `components/ProtocolIntro.tsx` |
| Person 2 | Sonification engine                    | `audio/sonification.ts`, `audio/piano.ts` (+ `speech.ts`, `usePlayer.ts`)                   |
| Person 3 | Question bank and quiz                 | `data/questions.ts`, `quiz/quiz.ts`, `components/QuestionCard.tsx`                          |
| Person 4 | App integration and lesson flow        | `App.tsx`, `components/Lesson.tsx`, `components/ProgressBar.tsx`, `components/Results.tsx`  |

Every owned file starts with a header comment listing its TODOs. Entries marked
`PLACEHOLDER` in `graphs.ts` and `questions.ts` are stand-ins so the app runs
end to end today; replace them.

## Lesson flow

```
intro  ->  [ listen  ->  answer  ->  reveal ]  x 10  ->  results
```

The graph is hidden while the clip plays and shown only on the reveal screen.
`#playground` is an engine test page: pick any graph, play it, see the notes.

## Project layout

```
src/
  types.ts         Shared types: Graph, Sonification, Question, QuizResult, LessonPhase
  data/            graphs.ts (10 graphs), questions.ts (10 questions)
  audio/           sonification.ts (graph -> notes, pure TS, tested), piano.ts (Tone.js),
                   speech.ts (spoken preamble), usePlayer.ts (React hook)
  quiz/            quiz.ts (shuffle / validate / score, pure TS, tested)
  components/      Lesson, ProtocolIntro, QuestionCard, GraphReveal, ProgressBar, Results,
                   Playground, LineChart, ProtocolSummary, NoteTable, PlayerControls
  App.tsx          Shell with hash routing (# lesson, #playground)
.github/workflows/
  ci.yml           lint + typecheck + test + build on every push / PR
  deploy.yml       Build and publish to GitHub Pages on push to main
```

Dependency direction: `types.ts` <- `data`, `audio`, `quiz` <- `components` <- `App`.
Pure modules (`audio/sonification.ts`, `quiz/quiz.ts`) never import React or the DOM.

## The protocol (v0)

Given a series of `(x, y)` points, `sonify()` produces:

1. **Preamble** (spoken and shown):
   - the clip length in seconds,
   - the trough (lowest value) and its note,
   - the peak (highest value) and its note,
   - the starting value and its note,
   - how many data units one whole step (2 semitones) represents.
2. **Notes**: one piano note per point, evenly spaced across the clip.

Pitch mapping:

```
trough  -> lowestMidi  (default C3)
midi(y) =  lowestMidi + 2 * round((y - trough) / unitsPerWholeStep)
```

`unitsPerWholeStep` is picked automatically as the smallest "nice" number
(1, 2, 2.5, 5 × 10^k) that keeps the peak at or below `highestMidi` (default C6),
so the preamble can say things like "each whole step is 5 degrees". It can be
overridden per call.

Defaults live in `src/types.ts` (`DEFAULT_OPTIONS`). Change the protocol in
`src/audio/sonification.ts`, update the tests, and the UI follows.

### Open questions for the group

- Should the trough always anchor to C3, or should the *start* value anchor to a
  fixed note so every clip begins on the same pitch?
- Fixed clip length vs. fixed time per point (long series get long clips)?
- Quantising to whole steps loses resolution on dense series. Do we want an
  optional continuous (glissando) mode for comparison in the study?
- Should repeated equal values be one held note or repeated taps?
- Preamble wording: `describePreamble()` is the single source of truth. Edit it there.

## Contributing (team conventions)

- Branch from `main`, open a PR, CI must be green before merge.
- Keep protocol changes and UI changes in separate PRs when you can.
- Every protocol behaviour gets a test in `sonification.test.ts`; quiz logic in `quiz.test.ts`.
- Add graphs to `src/data/graphs.ts` and questions to `src/data/questions.ts`.

## Roadmap

- [ ] Seeded graph/question generator for unlimited practice (after MVP)
- [ ] Upload / paste your own CSV
- [ ] Side-by-side comparison with Apple Audio Graph style (continuous pitch, no preamble)
- [ ] Record the clip to a WAV for sharing outside the browser
- [ ] Log study responses (needs a tiny backend or a form service)
