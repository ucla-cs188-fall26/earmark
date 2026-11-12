# Earmark work log

## PR #1 — Reliable audio cancellation and playback session isolation

Date: 2026-11-12
Base: `main` at `0c55d50e07a30600ea3b9c167836b198e7182d20`
Branch: `fix/audio-stop-session-isolation`

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
  passing checks here were executed on Node 26, not Node 20 CI.
