# Earmark

Hear a graph as a sequence of piano notes. Earmark is an HCI research prototype
for graph sonification, with descriptive narration, explicit pitch references,
training questions and an audio-only assessment flow. Comparative usability
claims require study evidence.

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
| **Tone.js + owned audio sources**         | Salamander piano samples with per-session source ownership and reliable cancellation.      |
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
  data/            graphs.ts and questions.ts (10 tutorial + 10 test examples each)
  graph/           shared coordinate policy and human-readable graph/unit descriptions
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

## Graph context and protocol

`sonify()` preserves raw graph coordinates and values. Pitch remains trough-anchored,
chromatic by default (C3–C6), with the same nice-number units-per-step policy.
The default sequence is six seconds. Each original observation is included.

The user-facing panel and `buildPreamble()` share a short guide: vertical meaning
and measurement units; minimum/maximum and starting values; Y units per semitone;
and note intervals/playback seconds per horizontal-axis unit. Graph titles remain
as identification. The introduction does not discuss interpolation, sampled-note
implementation, pitch rounding, audio clocks or release tails. Those details are
recorded below for developers. Extrema locations and observation-by-observation
changes are not included in the pre-answer guide.

`src/graph/mapping.ts` calculates mapping from the actual generated sequence:

- Let `span` be the difference between the final and initial note's axis positions
  (actual numeric x-distance, or ordered-category distance).
- Note intervals per X unit = `(notes.length - 1) / span`.
- Playback seconds per X unit = `(last.startMs - first.startMs) / 1000 / span`.
- Y units per semitone = `unitsPerStep / stepSemitones`, with the graph's display
  scale applied when formatting. This is a pitch scale, not a constant Y change
  between observations.

The final hold is not another X interval. For the current flu-symptoms sequence,
56 notes produce 55 note intervals across 11 weeks: 5 intervals per week.
The last observation starts at about 5892.857 ms, giving 0.535714 seconds per week
(displayed as approximately 0.54). Dividing the full 6-second duration by 11 would
incorrectly include the final hold. If generated spacing varies, the guide labels
its per-unit mapping as an average. A single observation has no horizontal interval.
These numbers are examples, not constants used by the implementation.

Coordinate policy lives in `src/graph/coordinates.ts`:

- Numeric axes allocate time proportionally to actual numeric x-distance,
  including irregularly spaced observations.
- Categorical axes allocate equal time between ordered observations. They require
  labels and default to held steps. Linear estimates require explicit
  `interpolation: 'linear'`; shipped temporal categories explicitly retain their
  existing linear interpolation. Unordered categories must not be interpreted as
  continuous quantities without a research decision.
- The final observation occupies the last note slot, preserving existing shipped
  sequence timing. This hold and the existing piano release tails remain developer
  details; the introductory guide reports observation-to-observation timing.
- Discrete piano notes use sample-and-hold. Stop captures the latest sampled
  coordinate reached on the audio clock, including interpolated source values;
  it does not round to an original observation or derive values from quantized
  MIDI. It reports no coordinate before graph audio starts. Overlapping release
  tails can coexist, so announcements explicitly say “latest sampled position.”
- Chart geometry, sampled playheads, tables and speech use the same coordinate and
  formatting helpers. Categorical estimates are described as a fraction between
  named observations, not invented calendar dates. Presentation rounds values
  to six decimal places (retaining significant digits for very small values),
  and durations/category percentages to two; raw numbers remain unchanged.

Tutorial and Test require a natural full playback before answering. Test hides
both the SVG and full observation data until after an answer; pre-answer context
contains only the brief units/reference-values/mapping guide. Onboarding uses a tutorial example, not a scored Test stimulus.
Graph reveals and Playground include keyboard-accessible observation tables.
Stopped-position text persists and is not a live region competing with app speech.
Inside the recorded-data view, a labeled two-observation comparison reports the
specific Y increase/decrease with expanded units. It supports adjacent or arbitrary
pairs, clears its result when selections/graph change, and announces only requested
results. That view is not mounted before a scored answer, preventing early disclosure
of exact observation changes. The guide explains that Y can change by different
amounts between observations without stating which changes occur in a scored graph.

### Research decisions still open

- Whether and when to replace individual existing linear stimuli with held steps.
  The existing tutorial “Step change” is still linearly connected; its stimulus
  wording requires research review rather than a silent protocol change.
- Optimal narration length, unit wording, categorical estimation terminology,
  and precision for spoken stopped positions.
- Fixed duration versus fixed time per observation, pitch anchoring/range,
  continuous sound, and independent reference controls.
- Whether assistance policies permit exact coordinate lookup during scored trials.

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

## Roadmap controls and local study records

Narration now has headed sections, previous/next/replay, pause/resume (restart the
current section), and skip. Graph transport supports pause/resume, one-second
navigation, segment replay, speed and position speech. Guide times remain 1×.
Seeking invalidates that run's full-listening credit; a fresh full replay is
required, while prior eligibility survives. Piano remains default. Playground's
continuous comparison uses the same calibration/timeline; scored playback is piano.

Test presets are explicitly **unapproved demonstrations requiring Prof. Jun review**.
They are selected before starting and fully captured with protocol versions in
local records. Full graph data and feedback respect the selected reveal policy.
No interaction records leave the tab unless the user downloads JSON. Export before
restarting, changing activity or closing the tab; records are not persisted.
See [research protocol and export schema](docs/RESEARCH_PROTOCOL.md) before analysis
or participant work. These features do not establish research approval or full
WCAG conformance. Continuous loudness and manual AT validation remain open.
