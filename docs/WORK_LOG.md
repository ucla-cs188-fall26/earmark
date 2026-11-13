# Earmark work log

## PR #2 — Reliable audio cancellation and playback session isolation

Date: 2026-11-12
Base: `main` at `0c55d50e07a30600ea3b9c167836b198e7182d20`
Branch: `fix/audio-stop-session-isolation`
Pull request: [PR #2](https://github.com/ucla-cs188-fall26/earmark/pull/2)

### Confirmed findings

`docs/PHASE_0_CODEX_AUDIT.md` was not present. The source confirmed that all notes
were scheduled through a shared Tone Sampler, Stop relied on `releaseAll()`, and
one cancellation boolean was reused by successive requests. Tone 15.1.22's
Sampler clears its source tracking when scheduling a release, so subsequent
`releaseAll()` cannot cancel those voices. Speech cancellation previously relied
on an end event or watchdog to settle its promise.

### Changes and ownership

- `audio/piano.ts`: each session owns an output gain, every native Web Audio
  buffer source, its Tone gain envelope, and all UI/wait/cleanup timers. Stop
  disconnects and mutes the output, calls native `stop()` on active and future
  sources, disconnects the sources, disposes envelopes/output, and clears timers.
  It does not rely on `Sampler.releaseAll()` or Tone private properties.
- Tone still supplies audio-context initialization, routing and exponential
  envelopes. The same 30 Salamander samples and nearest-sample pitch shifting
  are used. Direct source ownership replaces Sampler because its public API
  cannot retain cancellation handles after release scheduling. Zero attack and
  one-second release settings remain; natural completion retains release tails
  before bounded cleanup. Stop/unmount can cancel during that tail.
- Only successfully decoded AudioBuffers are cached. Fetch requests receive a
  session-derived abort signal. Audio resume/decode are raced against cancellation;
  late results cannot schedule audio. Initialization/loading has a 30-second cap;
  the first error aborts sibling requests. Retry can reuse successful samples.
- `audio/player.ts`: a small framework-independent controller owns a generation
  identifier and AbortController per request. Every continuation and note/end/error
  callback is checked against the current session. Cancelled/failed starts return
  false. No state-management dependency was added.
- `audio/usePlayer.ts`: React subscribes using `useSyncExternalStore`; effect
  cleanup stops the owned controller. Cleanup is reusable under Strict Mode.
- `audio/speech.ts`: abort immediately cancels owned speech, settles its promise,
  detaches handlers and clears timers even without an end event. An older abort
  cannot cancel a newer utterance. The hard cap cancels speech before resolving.
- Lesson stop-position speech now belongs to the controller, so replacement and
  unmount cancel it too. Cancelled/failed starts do not run the lesson's listening
  eligibility update. Successful graph scheduling retains the existing eligibility
  semantics; requiring full listening is deferred.
- Intro, Lesson and Playground show a recoverable alert and allow Play to retry.
  Controls distinguish an error from a busy player. No visual redesign was made.

### Automated regressions

Four new test files cover the audio layer, controller, speech and hook cleanup:

- Pending audio resume, pending fetch, and late decode cancellation.
- Active/future source cancellation and absence of later note callbacks.
- Reference-note interruption and natural-tail resource disposal.
- Loading timeout, HTTP failure, sibling-request cancellation and retry.
- Nearest-sample pitch shifting and successful decoded-buffer reuse.
- Late loading success/failure after replacement; interrupted spoken/reference
  preambles; stale note/end/error callbacks; rapid Play → Stop → Play.
- Owner cleanup, subscriber removal and controller reuse after cleanup.
- Immediate speech settlement without an end event, old/new utterance ownership,
  timeout cancellation and already-aborted requests.
- A lightweight hook lifecycle harness invokes the registered React effect cleanup;
  it mocks React and is not presented as a real React rendering test. Real React
  route unmount was separately exercised in the browser with Strict Mode enabled.

Executed on Node 26.7.0 / npm 11.19.0 with installed dependencies:

| Command | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 6 files, 46 tests passed (24 new regressions; 22 existing tests) |
| `npm run build` | Passed; Vite 8.3.6 |
| `git diff --check` | Passed |

An initial timeout assertion failed because the cancellation helper discarded the
abort reason. The helper now preserves `signal.reason`; the final suite passed
without unhandled rejections. No dependency or lockfile changes were needed.

### Browser verification

Applied the verification skill to the flow: Play/Stop → controller → external
sample fetch/decode → session-owned audio output → React status/error UI.
A local Vite server was used with the real piano samples and browser audio context.
The real React application runs in Strict Mode. This is a browser-engine check,
not a cross-browser, screen-reader, or physical speaker/microphone measurement.

Methodology:

1. Open `#playground`, disable the preamble for the graph measurement, and Play
   using the real button/user gesture. Wait for the Playing state.
2. Import the same Tone module instance used by the application (the versioned
   Vite module URL from performance resource entries). Connect a native
   AnalyserNode to `Tone.getDestination()`, without changing the audible routing.
3. Use `fftSize = 2048`; read `getFloatTimeDomainData()` and compute
   `sqrt(sum(sample * sample) / sampleCount)`. Record a nonzero pre-Stop baseline.
4. Click Stop; sample at multiple subsequent wall-clock offsets, including a
   later point where previously scheduled graph notes would still have sounded.

| Case | Measured evidence |
| --- | --- |
| Graph Stop | Before: RMS 0.0756794672. After: RMS **0** at 101, 252, 1002 and 1802 ms. Control returned to Play. |
| Reference-note Stop | Real controller with one 450 ms C3 preamble note: baseline RMS 0.1044992941; RMS **0** 150 ms after Stop; request returned false and status idle. |
| Rapid Stop → Play | Replacement produced nonzero output (RMS 0.1530393903). Unit tests separately verify old callbacks and voices cannot interfere. |
| Real React unmount | Navigate from playing Playground to Tutorial: RMS **0** at 150 ms and after another 1200 ms. Returning to Playground gave a fresh Play control. |
| Loading Stop | Delay all sample requests by 1000 ms; click Stop while Loading. After 1250 ms: Play, zero alerts, zero active-note highlights. Remove delay; retry reaches Playing. |
| Error recovery | Intercept sample requests with HTTP 503. Alert appears and Play remains enabled. Remove interception; retry reaches Playing and clears the alert. |

The measurements establish silence by the first tested post-Stop sample (101 ms
for graph playback); they do not establish a sub-50-ms end-to-end acoustic bound.
The baseline audit had measured nonzero output 1.8 seconds after Stop.

The browser initially logged standard AudioContext-before-user-gesture warnings
and a missing favicon. HTTP failures were deliberately injected for recovery
verification. The final delayed-loading check reported no console errors.
Browser-generated artifacts were kept outside the committed source tree.

### Scope and limitations

- Graph data, question banks, pitch mapping, default duration, quantization,
  preamble tokens and question feedback policy are unchanged.
- Pause/resume, speed, continuous mode, visual redesign, coordinate-on-stop
  accuracy, audio/UI clock alignment and full-listening eligibility remain deferred.
- The same external sample host is still required on a cold load. Fetch is
  abortable; browser resume/decode cannot be physically interrupted, but their late
  results are ignored and cannot create audio or change a newer session.
- Browser testing used one engine and device-output latency was not calibrated.
  Hard disconnect favors reliable silence; subjective click/timbre evaluation
  remains appropriate during review.
- The Phase 0 Node 20 / installed Vitest engine mismatch remains outside this PR;
  local checks above were executed on Node 26. The subsequently verified Node 20
  GitHub Actions run passed, as recorded below; declared dependency engine ranges
  remain unchanged.


### GitHub Actions and review status

Verified on 2026-11-12: [PR #2](https://github.com/ucla-cs188-fall26/earmark/pull/2)
is open as a draft against `main` and has not been merged.

The implementation commit is `4516b30413f0e19bf604e5ed204a0d2efdfac4ad`.
Its [GitHub Actions CI run #43212524895](https://github.com/ucla-cs188-fall26/earmark/actions/runs/43212524895)
completed successfully. The `check` job and its `npm ci`, lint, typecheck, unit-test,
and production-build steps all reported success. The workflow uses Node 20;
this remote result is separate from the earlier local Node 26 checks.

This follow-up updates only documentation and the PR description. PR #2 remains
open for review. After it is merged, the next branch will be
`fix/playback-completion-eligibility`, created from the updated `main`. That branch
has not been created.


## PR #3 — Fix playback completion and answer eligibility

Date: 2026-11-12
Base: latest fetched `main` at `6e38534df6bd260937ae093b16bcc5f5871010c6`
(the merge of PR #2).
Branch: `fix/playback-completion-eligibility`

### Problem and changes

Previously, `player.play()` returned true after scheduling the graph. The lesson
used that boolean as proof of listening, so a participant could answer before
completion. Successful scheduling and natural completion were not separate
outcomes.

- `audio/player.ts` now returns a request with a session ID, a `scheduled` promise
  (`scheduled`, `cancelled`, or `failed`), and a `finished` promise (`completed`,
  `cancelled`, or `failed`). All outcomes include the session ID and graph ID.
  Stop/replacement settles cancellation immediately, including when an underlying
  asynchronous operation never settles. Existing generation guards prevent old
  note/end/error callbacks from affecting the current session.
- `audio/piano.ts` resolves graph completion only after the nominal graph endpoint
  on the audio clock AND every scheduled graph voice has ended naturally. This
  includes the existing one-second release envelopes. A wall-clock timeout or
  preamble completion cannot unlock answers. A suspended audio context does not
  gain completion merely because wall time passes. Natural cleanup and PR #2's
  abort/disconnect/source-stop ownership remain in place.
- `quiz/listening.ts` owns question-visit eligibility in a small pure reducer.
  Starting only records an attempt. Only a completed terminal outcome grants
  eligibility. Cancelled/failed attempts do not grant it. Once earned, eligibility
  survives unlimited subsequent replays, Stops and failures for that question.
  Reset creates a new generation; old outcomes cannot unlock a new visit, even
  when the same graph is revisited.
- `components/Lesson.tsx` applies this rule to both Tutorial and Test, resets on
  question changes/restart, and ignores completion dispatch after unmount.
  Existing App keys reset the component on mode changes. The existing usePlayer
  cleanup cancels the owned request under unmount/Strict Mode.
- Answer submission itself is guarded by eligibility and existing-answer state.
  An interrupted first attempt offers Replay while choices remain disabled.
- A persistent `role="status"` message explains the listening requirement and
  announces completion. `QuestionCard` associates the instructions with its
  fieldset using `aria-describedby`.
- Playground keeps unrestricted graph selection and Play/Stop exploration. Pitch
  mapping, samples, graph/question data, preamble content, duration settings and
  audio envelopes are unchanged. No dependencies were added.

Completion here means that the browser audio engine has traversed the full graph
and its scheduled voices have ended. It does not prove that a person heard the
sound, calibrate speaker/device latency, or change graph-time coordinate mapping.
The nominal six-second graph can have an existing release tail beyond six seconds;
answers now wait for that tail rather than unlocking on scheduling.

### Automated verification

Executed on Node 26.7.0 / npm 11.19.0:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 7 files, 63 tests passed (17 additional tests over PR #2) |
| `npm run build` | Passed; Vite 8.3.6 |
| `git diff --check` | Passed |

Regression coverage includes:

- Scheduling without completion; natural completion with matching session/graph
  identity; immediate cancellation during unresolved loading or speech.
- Early Stop and late end callbacks; separate loading/playback failures; replacement
  outcomes; existing session isolation, cleanup, reference-note and retry tests.
- Audio-clock endpoint and every native voice-ended event are both required;
  neither elapsed wall time with a frozen clock nor early-ending samples complete
  the graph. Existing source/timer cleanup tests continue to pass.
- Starting does not grant eligibility; completed does; cancelled/failed do not.
  Earned eligibility survives subsequent completed/cancelled/failed replays.
- Reset clears attempts/eligibility, and old generation actions cannot unlock a
  new question or restarted visit.

Applied the React best-practices checklist to the component changes and the
verification skill to the full UI → controller → sample/audio → completion →
answer-state flow. Automated tests cover the pure reducer and controller/audio
boundaries; the rendered React integration was exercised in the browser below.

### Browser interaction and audio evidence

Local Vite, real React Strict Mode and real Salamander samples were used. Speech
completion was mocked to finish immediately for repeatable full-graph checks;
one interrupted-preamble check deliberately held the speech completion event.
Piano scheduling, source-ended events, controller state, React updates and native
choice disabling remained real. No test hooks were added to application code.

| Scenario | Observed result |
| --- | --- |
| Tutorial initial and scheduled playback | Choice buttons disabled before Play and while graph audio was playing. |
| Early graph Stop | Choices remained disabled; Replay appeared with the incomplete-playback instruction. |
| Natural Tutorial completion | Choices enabled only after the full graph and its release tails ended. Final voice-ended event at performance time 29555.3 ms; fieldset unlock at 29559.7 ms (about 4.4 ms later). |
| Replay after completion | Choices remained enabled during replay and after stopping that replay. |
| Next question during reveal replay | Old audio cancelled; the new question's choices stayed disabled and its initial instructions returned. |
| Test mode | Initial, preamble and graph playback choices disabled; cancelling preamble did not unlock; natural completion enabled choices. |
| Mode switch | Switching to Tutorial and back to Test yielded fresh disabled choices in each mode. |
| Loading failure | Injected HTTP 503 produced a recoverable alert and enabled Replay, while answer choices remained disabled. Retry also kept answers disabled before completion. |
| Playground | Graph picker remained available; real Play/Stop worked without any answer-eligibility requirement. |

For the Stop regression, a native analyser at Tone's destination used 2048 waveform
samples and RMS `sqrt(sum(x*x)/N)`. Graph output was nonzero before Stop
(RMS 0.2038420131) and exactly zero 150 ms afterward. Completion ordering was
measured by native buffer-source `ended` listeners and a MutationObserver on the
fieldset's `disabled` attribute. Assertions checked actual choice buttons and
`fieldset.disabled`; Playwright's `isDisabled()` on the fieldset itself did not
reflect inherited disabling and was not used as proof. The fieldset's
`aria-describedby` matched the status instruction ID.

### Remaining limitations and scope

- Browser verification used one engine and mocked speech completion as described;
  it is not a screen-reader, cross-browser, or physical acoustic measurement.
- Stop-coordinate accuracy and note-highlight/audio-clock alignment remain deferred.
  The completion endpoint now uses the audio clock independently of those highlights.
- Suspended audio contexts do not complete until their audio clock/voices progress;
  Stop remains available. Hidden-tab callback delays may delay eligibility, but
  cannot grant it before natural completion.
- No pause/resume, speed controls, oscillator mode, data/protocol changes, backend,
  UI redesign, or merge is included.

## PR #4 — Graph context, axis interpretation and coordinate accuracy

Date: 2026-11-12
Branch: `feat/graph-context-and-coordinate-accuracy`
Stacked base: latest fetched `fix/playback-completion-eligibility` at
`25eb2c1b4f6bb805d335cc7c44948d13c1010a1a` (PR #3, unmerged when work began).
PR #3 and `main` were not modified. The new draft targets the PR #3 branch.

### Context and narration

- Replaced the packed, unlabeled number sequence with data-driven sentences:
  title, horizontal/vertical meanings, units, endpoint labels and observation count;
  labeled lowest/highest/starting values with reference notes; units per pitch
  interval; duration and audio-to-axis mapping. Extrema locations are never stated
  in default narration, including Test mode.
- Raw graph x/y values remain unchanged. Optional metadata distinguishes numeric
  and categorical axes, interpolation, axis descriptions, units and display scales.
  Counts, index points, Fahrenheit, percent, dollars, thousands and millions are
  expanded without changing the numbers used for pitch mapping. Months and quarter
  labels are expanded; zero-based numeric sample/day/step indices are described
  honestly instead of being presented as calendar dates.
- Narration is split into short labeled utterances so a long mapping explanation
  does not hit the speech engine's existing 30-second cap as one paragraph.
- Context appears as a simple semantic definition list. Test still hides the SVG
  and full observation table until after answering. Onboarding uses a tutorial
  sample instead of previewing a scored Test graph.

### One coordinate policy

`src/graph/coordinates.ts` owns validation, curve evaluation, axis placement and
sample lookup. `descriptions.ts` owns corresponding unit/category formatting.

- Numeric playback now uses actual x-distance, including irregular x spacing.
  Original observations remain represented; additional piano samples interpolate
  according to the declared policy.
- Ordered categorical observations receive equal axis/playback spacing, regardless
  of numeric storage keys. Categories require labels and default to held steps.
  Linear interpolation must be explicit. All existing temporal categorical graphs
  now explicitly declare their existing linear policy; narration calls intermediate
  values estimates between observations, not additional measurements.
- Held categorical steps do not invent intermediate y-values. Both chart paths and
  audio use that policy. The existing numeric tutorial `step` stimulus remains
  linearly connected to preserve the current study protocol; changing that stimulus
  and its question wording requires research review rather than a silent change.
- Piano playback remains discrete and quantized. The authoritative coordinate is
  the interpolated source sample of the latest attack reached on the audio clock,
  held until the next attack. It is not the nearest original observation and is
  not a continuous value invented between piano attacks. Multiple release tails
  can overlap, so text explicitly says “latest sampled position.”
- The sampler session records its graph start on the audio clock. Stop queries
  that timeline before cancellation; it does not read React's active highlight.
  It returns no coordinate during loading/preamble or before scheduled graph onset.
  UI note timers now use the audio clock's immediate time and re-evaluate their
  position when delayed, so an old callback cannot rewind the playhead.
- Chart playheads (including stopped playheads), piano-sample tables and spoken
  announcements share the same x/value. Numeric units and categorical fractional
  positions are formatted consistently. A categorical estimate is described as a
  percentage between named observations, never as an invented month/date.
- Stopped coordinates persist in accessible text in Intro, Lesson and Playground.
  App speech announces once; that persistent text is deliberately not another live
  region. Navigation/replay resets stale coordinates. Display formatting uses
  up to six decimal places for values, retaining significant digits for tiny values;
  durations/category percentages use two. Raw interpolated values are unchanged.

### Accessible interface

- Added native details/summary observation tables in Tutorial sample views,
  Playground and post-answer reveals; table headers/captions and named scrollable
  regions support screen-reader reading and keyboard access without SVG inspection.
- Removed pointer-only SVG value inspection; the data table is available to pointer
  and keyboard users alike. The SVG is a noninteractive visual companion.
- Named the question progress indicator, added general focus-visible styling,
  improved primary-button contrast in both themes, and lightened progress fills
  so progress text remains readable. Context uses the existing restrained palette.
- No rapidly updated live regions were added for playheads, rows or coordinates.
  The active sample row uses `aria-current` without automatic announcements.

### Verification

Executed locally on Node 26.7.0 / npm 11.19.0:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 10 files, 98 tests passed (35 more than PR #3) |
| `npm run build` | Passed; Vite 8.3.6 |
| `git diff --check` | Passed |

Tests cover irregular numeric axes; categorical equal spacing and held/explicit
linear policies; one-point series; finite/ordered coordinate and label validation;
sample-and-hold boundaries; expanded units and labels; all 20 library preambles;
absence of extrema positions in Test reference sentences; reference pitch intervals;
no coordinate before graph onset; stale-highlight-independent clock reads; persistent
Stop ownership/reset; and server-rendered accessible context/table/mode boundaries.
Existing cancellation, full-completion and eligibility regressions continue to pass.

A direct comparison against PR #3's original `sonify()` on all 20 shipped graphs
found zero MIDI differences and zero note-count differences. Maximum timing delta
was approximately 1.17e-12 ms and maximum source-value delta 8.89e-16 (floating-point
roundoff). Graph point arrays and question banks were not changed. The new irregular
numeric and held-category behaviors are covered by additional fixtures.

### Browser evidence

Used local Vite with real React Strict Mode, Tone scheduling and piano samples.
Speech completion was mocked to make interaction checks repeatable; spoken strings
were captured. One Test check held speech completion to exercise preamble Stop.
No test hooks were added to production code.

- **Stale highlight correctness:** deliberately blocked the main thread for 400 ms
  in a capture-phase Stop handler. The React/table highlight was still sample 9;
  the audio clock had reached sample 13 at elapsed 1487.0068 ms. The captured sample
  was raw x 2.6 and y 54.2. Both persistent text and the captured speech exactly
  matched: “Month: 60 percent of the way from March to April. Temperature:
  54.2 degrees Fahrenheit,” labeled as an estimate. The nearest original point
  would have incorrectly returned April / 59 degrees Fahrenheit.
- **Stop regression:** a 2048-sample native analyser at Tone's destination measured
  piano output RMS 0 at 150 ms after that Stop. This does not measure speech output
  or establish a sub-50-ms acoustic latency bound.
- **Test boundary:** deterministic ordering selected Monthly active users, 2023.
  Before answering: context showed January–December, thousands of users, 42,000–
  58,000 users and 500 users per semitone, with zero SVGs/tables and disabled
  choices. Stopping the preamble produced no stopped-coordinate section and did
  not unlock answers. Full natural playback unlocked answers. Answering exposed
  one chart and the recorded-data summary. Captured lowest/highest reference
  sentences contained values but no extrema positions.
- **Keyboard/data:** focusing the recorded-data summary and pressing Enter opened
  the observation table. Screenshot review confirmed readable desktop context and
  a persistent stopped-value block with the graph/data view.
- **Responsive/theme checks:** at a 320 CSS-pixel viewport the tested reveal page
  had document scrollWidth 305 (no horizontal document overflow). Primary buttons
  computed to white on #1f5fa7 in both themes: contrast approximately 6.46:1.

Applied the React best-practices and full-flow verification skills. Screenshots
and browser artifacts are kept outside the committed repository.

### Limits and research decisions

This targets WCAG 2.2 AA but is not a whole-app conformance claim: NVDA, JAWS,
VoiceOver, other browser engines, real speech pronunciation and device latency were
not verified. The existing playback-completion rule and reliable cancellation
architecture are preserved. No speed, pause/resume or oscillator mode was added.

Research review is still needed for narration length/precision, categorical
estimation language, the numeric tutorial step stimulus, and whether exact Stop
lookup is permitted in scored tasks. Numeric/categorical timing and interpolation
are now explicit rather than silently inferred from index rounding. The new context
and narration should be versioned as a changed study condition before participant
comparisons, even though all existing piano pitch sequences are preserved.

## Simplify graph information and spoken narration

Date: 2026-11-12
Base: latest fetched `main`, `cebe03efdfec9279438483a0cc655c4815d84863`.
Branch: `simplify/graph-information-and-narration`.

### User-facing changes

The visual panel now has five rows: vertical meaning/units, lowest/highest values,
starting value, Y units per semitone, and X-to-audio mapping. Spoken narration uses
the same brief mapping and pitch reference. Graph titles still identify the graph;
operational Stop/listen/replay instructions remain available. Removed introductory
explanations of interpolation, sampled-note internals, release tails, pitch rounding,
and audio clocks. The underlying technical policies remain documented in README.

The guide explicitly separates X/time spacing from Y changes: Y can change by
different amounts between successive observations. It does not announce the actual
observation changes in scored trials or imply a constant slope.

The recorded-data view now includes labeled From/To selectors and a keyboard-
operable Compare values button. Its requested result describes the Y increase,
decrease or unchanged value with expanded units. Changing the selections clears
old results; changing graphs resets the comparison. This view remains restricted
to permitted tutorial views, Playground and post-answer reveals. It is not mounted
before a Test answer, even when the participant has finished listening.

### Generated mapping policy (developer details)

`src/graph/mapping.ts` calculates from the actual generated notes, rather than a
graph ID, duration default or assumed note density:

- X span is the difference between final/initial note axis positions, using actual
  numeric distance or ordered-category positions as appropriate.
- Note intervals per X unit = `(notes.length - 1) / span`.
- Playback seconds per X unit = `(last.startMs - first.startMs) / 1000 / span`.
- Y units per semitone = `unitsPerStep / stepSemitones`, formatted with the graph's
  unit scale. This is calibration, not the observed Y change between two notes.

Uniform spacing is checked against every generated interval. Nonuniform mapping
is labeled as an average; a single observation has no horizontal interval. Tiny
positive mappings are not formatted as zero. Reference and comparison quantities
use singular units when the expanded quantity is one.

For the current flu-symptoms graph, 56 notes span 11 weeks: 55 note intervals,
5 intervals/week, 0.5357142857 seconds/week (approximately 0.54), and one semitone
per search interest index point. The last note's start time is used: full-duration
6/11 would incorrectly round to 0.55 by including the final hold. No flu-specific
values or identifiers occur in the mapping implementation.

### Verification

Local Node 26.7.0 / npm 11.19.0:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 11 files, 110 tests passed; 12 additional mapping/change tests |
| `npm run build` | Passed; Vite 8.3.6 |
| `git diff --check` | Passed |

Regression tests cover the exact generated flu mapping; changed note counts,
attack times, duration and density; irregular numeric distances; categorical keys;
single observations; nondefault pitch grids and unit scales; agreement between
panel and speech; absence of implementation explanations; varying positive/negative,
nonadjacent, reversed and zero observation changes; and absence of comparisons
from pre-answer context/Test onboarding. Existing narration assertions were updated
to the new wording. Playback/cancellation/eligibility regressions still pass.

A direct baseline comparison of all 20 library graphs found byte-for-byte identical
serialized Sonification outputs and identical reference-note items (including note
lengths). No playback controller, piano, speech engine, coordinate evaluator,
graph-data or question-bank file was changed. No dependencies were added.

### Browser evidence

Verified the full guide → speech → playback → answer → comparison flow in a fresh
isolated browser context, with real React Strict Mode and piano audio. Speech
completion was mocked and its utterances captured; shuffle was controlled to put
the flu-symptoms graph first. An earlier attempt inherited old page-level test
stubs and timed out; it was discarded and rerun in the isolated context.

- Before answering, the flu panel had exactly five rows and displayed 5 note
  intervals / approximately 0.54 seconds per week and 1 index point per semitone.
  There were zero comparison selectors, zero SVGs, and disabled answer choices.
- Captured speech contained the same mapping and variable-Y explanation, without
  interpolation, release-tail, rounding or clock explanations.
- Natural full playback enabled answers. After answering and opening recorded
  data, keyboard submission reported Week 7→8 as +5 index points. Week 8→9
  reported +6, demonstrating that time spacing is not a fixed Y change. Selection
  changes cleared the previous result.
- Playground comparison remained available; selecting a different graph cleared
  its result. At a 320 CSS-pixel viewport, tested document scrollWidth was 305
  (no horizontal document overflow). Screenshot inspection confirmed the compact
  panel retained semantic headings, five labeled rows and readable units.
- A Stop smoke check using an analyser connected through the app's actual Tone
  import measured piano RMS 0.0829246437 before Stop and 0 at 150 ms after Stop;
  the stopped coordinate remained visible. An initial early measurement had no
  nonzero baseline and was not counted as evidence.

Applied the React best-practices and full-flow verification skills. Browser
artifacts are outside the repository. These checks are single-engine interaction
checks with mocked speech completion, not screen-reader/pronunciation testing or
acoustic latency certification. Actual comparative study effects of shorter
narration remain a research question.

## Roadmap — Navigable graph narration

Branch `feat/narration-navigation`, stacked on PR #6 (`120e6f8`). Narration is
sectioned with its reference notes; previous/next/replay, pause/resume and skip
cancel the old child session, including speech, reference voices and pending loads.
Pause is section-level: resume restarts the current section, stated in the UI.
The headed transcript remains available before/after narration. Skipping starts
real graph audio and never settles its completion outcome early. Parent Stop and
unmount abort paused waits and all child resources. Graph mapping/questions and
full-listening eligibility are unchanged. Tests cover grouping, rapid replacement,
pause/restart/skip and paused cleanup. All 113 tests, lint, typecheck, build and diff
checks passed. In a fresh browser context with speech held by a mock, keyboard-native
controls navigated/paused/resumed/replayed, skip left answers disabled, and only
natural graph completion enabled answers. Real piano audio was used. This is not
manual screen-reader verification; browser speech pronunciation remains untested.

## Roadmap — Graph playback navigation and speed

Branch `feat/graph-playback-navigation`, stacked on narration navigation. Added
pause/resume, backward/forward one normal-speed second, replay-current-second,
full replay, 0.5/0.75/1/1.25/1.5× speeds and on-request position speech. Position
speech pauses piano to avoid competing sound; Resume continues. Guide times are
explicitly 1×. Timings/durations scale, never sample pitch rates. Each resumed or
sought rendering owns a new child abort signal and voices; stale loads, callbacks
and ends are ignored. Paused coordinates are stable. Piano resume rearticulates
the current note rather than claiming waveform-exact continuity.

Eligibility policy: pause and speed changes retain a contiguous full run. ANY seek
or segment replay cancels that run's completion outcome, even if it later reaches
the end. A fresh full replay is necessary to earn eligibility; the lesson reducer
retains eligibility already earned. This conservative policy needs Prof. Jun's
review before controlled studies. Parent Stop/unmount cancels every child. No
coordinates are fabricated by pausing before the first graph onset.

All 120 tests, lint, typecheck, build and diff checks passed. New regressions cover
paused continuation, speed/pitch separation, clamped paused seeks, seeking-to-end,
stale resumed loads, audio-clock offsets and Stop. In a fresh browser with mocked
speech and real piano, pause and 1.5× playback worked; six forward seeks to the end
left Test choices locked, while a fresh full replay unlocked them. This is browser
interaction testing, not manual AT or physical audio-latency certification.

## Roadmap — Accessible interactions

Branch `fix/accessibility-interactions`, stacked on graph navigation. Screen
transitions focus the new heading after browser hash navigation settles; a new
question starts at its context heading and Tab reaches Play. Transient narration/
graph controls return lost focus to stable Play/Stop without stealing focus from
surviving controls. Activity titles/nav names, explicit chosen/correct feedback,
question-position value text, a graph-position meter and restrained paused/playing
status text improve nonvisual interpretation. Progress is position, not a claim
that listening has completed. High-frequency note/coordinate updates are not live.

Verified dark-mode success text previously fell below 4.5:1; a theme-specific color
now passes normal-text AA contrast. Focus indicators, reduced-motion and forced-
color support remain visible. Browser enlarged-text testing found grid/fieldset
min-content overflow; wrappers and labels now shrink/wrap. At 320 CSS pixels and
200% body text, document width stayed 320. This is text-resize testing, not a claim
of testing every browser zoom/device combination. Browser heading focus, next-Tab
Play, route titles and native control labels were checked. No unnamed buttons or
unlabeled selects were found in the tested Playground state.

All 124 tests, lint, types, build and diff checks passed. Automated regressions
cover semantic progress, feedback withholding/text and real stylesheet contrast
in both themes. Browser tests are automated interactions; VoiceOver/NVDA/JAWS were
NOT manually tested. This targets WCAG 2.2 AA but does not certify whole-app
conformance. Existing cancellation and eligibility tests remain passing.

## Roadmap — Continuous sonification comparison

Branch `feat/continuous-sonification`, stacked on accessible transport. Playground
now offers piano (unchanged default) and continuous sine tone. Scored activity has
no mode selector; the controller rejects continuous playback of Test-bank graphs.
Both modes share the generated timeline, calibrated Y-per-semitone scale, pitch
bounds, six-second default and source-coordinate policy. Continuous pitch removes
piano quantization: linear Y follows exponential frequency ramps (linear MIDI),
while declared step curves keep their genuine discontinuities. References use
exact unrounded values on the same oscillator calibration, not rounded piano
anchors. Added pitch-bound metadata does not change piano notes or graph data.

The oscillator owns every voice/envelope/timer. Pause/resume, seek, current position
speech, speed changes and Stop reuse the tested transport. Live coordinates and
playheads follow the continuous evaluator; there are no high-frequency live-region
announcements. Output has a short onset envelope and the same one-second release
condition. Tone amplitude 0.12 is a conservative engineering starting point, NOT
perceptually loudness-matched to every piano sample. Prof. Jun must review timbre,
loudness, range and reference-preview timing before comparative participant work.
No superiority claim or scored-mode change is made.

All 130 tests, lint, typecheck, build and diff checks passed. Regressions cover
unrounded mapping/references, step policy, speed-aware coordinates, cancellation,
clock+natural-end completion and scored-mode rejection. In a fresh browser, piano
was initially selected; continuous output RMS was 0.08536 before pause, 0 after
pause, 0.08435 after seek/resume, and 0 at 150 ms after Stop. Persistent coordinates
matched the continuous curve. After Test route rendering settled, there were zero
mode selectors. Waveforms used a 2048-sample analyser at the app's Tone destination;
this is single-engine signal evidence, not physical latency or manual AT testing.
