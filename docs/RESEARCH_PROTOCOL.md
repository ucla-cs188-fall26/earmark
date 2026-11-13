# Draft research controls and local export

This is a configurable demonstration instrument, not an approved study protocol.
All presets explicitly require Prof. Jun review. Existing graph arrays and question
banks are unchanged; their values are illustrative, not sourced measurements.

## Activities and disclosures

- Tutorial uses the tutorial bank and is unscored training.
- Test onboarding uses a separate tutorial example, marked unscored practice.
- Test trials use the disjoint Test bank and are marked scored. Piano is mandatory;
  the controller rejects continuous Test-bank playback. Practice mode selection
  cannot change a scored condition.
- Playground is unscored practice and supports piano/continuous comparison.
- Pre-answer context permits minimum, maximum and starting reference values and
  the pitch/time guide, as in the existing protocol. Full observation arrays,
  comparisons and chart reveals are withheld before scored answers.

## Versioned configuration

`src/research/protocol.ts` defines reviewed-in-code presets. Select one before Start;
there is no configuration switch during a trial. Both current presets are drafts:

| Preset | Speeds | Pause | Seek/segment replay | Exact position lookup | Direct intro skip | Feedback/chart reveal |
| --- | --- | --- | --- | --- | --- | --- |
| demonstration-assisted @1 (default) | 0.5, 0.75, 1, 1.25, 1.5× | Yes | Yes | Yes | Yes | After each answer |
| demonstration-fixed @1 | 1× | Yes | No | No | No | After session |

The default retains the existing assisted demonstration behavior; the alternative
illustrates configurable restrictions, not a recommended experimental design.
Section navigation remains available and is logged in both. Disabling the direct
Skip button does NOT establish that every introductory section was heard. Pause
restarts the current narration section. Full-listening eligibility applies to the
graph, not the introduction: pause/speed changes preserve a contiguous run; any
seek or segment replay requires a new complete replay. Prior earned eligibility
survives later replays. These conservative eligibility semantics require review.

Restrictions are enforced in controller methods as well as controls. If exact
position lookup is disabled, paused/stopped Y text and speech are suppressed;
the renderer can still track coordinates internally. Full graph values cannot leak
through the paused UI. Deferred feedback removes correct/incorrect styling and
text as well as charts until the session ends. Only submitted choices are logged
mid-session, not correctness/answer keys.

Before changing a condition: bump its revision and relevant narration/sonification/
stimulus versions, document the reason, review with Prof. Jun and rerun tests. Every
export includes the entire resolved preset and a condition key containing settings
and versions; accidental reuse of a version with changed settings creates a
different key. This key is not a cryptographic attestation. Source changes still
require human version review; the journal does not prove participant comprehension,
hearing, device latency or exact physical sound delivery.

## Export schema (schemaVersion 1)

The journal is in memory only. No analytics, database, storage API, microphone,
participant identifier field or new network transmission is used. Existing piano
sample downloads and platform speech services remain as before. A random run ID
is local and not linked to a person. Relative event times avoid collecting an
unnecessary absolute wall-clock timestamp.

| Field | Meaning |
| --- | --- |
| schemaVersion | Export schema version |
| runId | Anonymous per-record identifier |
| activity | tutorial, practice or scored |
| versions | Separate schema/narration/piano/continuous/stimulus versions |
| conditionKey | Full settings/version identity; do not combine different keys |
| protocol | Resolved preset snapshot, or null for unscored practice |
| questionOrder | Actual shuffled question IDs; no reliance on an unrecorded RNG seed |
| modesUsed | Modes actually scheduled, not only selected |
| sessionEnded | Whether the end-of-session event was recorded |
| truncated, droppedEvents | Explicit data-loss flags for the 10,000-event bound |
| events | Ordered journal described below |

Each event has a monotonic sequence number, elapsedMsInRun, type, phase and trialId
(null for onboarding). Relevant fields include graphId, playback sessionId, mode,
speed, graph elapsedMs, sectionIndex, paused, reason and submitted chosenIndex.
No graph observation arrays, correctIndex, names, emails, recordings or spoken
utterance text are exported. End-of-session aggregate score is permitted only
after completion. The question order and versioned bank support later answer
scoring by an authorized researcher.

Events cover play/replay, graph scheduling, pause/resume, seeks and segment replay,
speed and position requests, section changes/navigation, narration pause/resume,
direct skip, completed/cancelled/failed playback, trial entry, answer submission
and session end. Speech-result events distinguish natural end, cancellation,
failure, unavailability, timeout and watchdog inference. A watchdog result is not
claimed as verified narration delivery. A repeated play on the same trial/graph
adds a replay marker; a resumed rendering is graph-scheduled within the same root
session, not a new user play. Pause reason distinguishes user actions from internal
speed-change or position-speech pauses. Segment replay also produces a seek event:
these are intent plus resulting navigation, not two independent replays.

Export is an explicit local Blob download. Download before leaving the activity,
restarting or closing the tab. Restart or preset selection creates a new record;
there is no automatic persistence or upload. An incomplete session or truncated
export must not be treated as a complete scored run. Group analysis by activity,
phase/trial, conditionKey and actual mode, not only a version label. Verify event
ordering and distinguish assistance from full uninterrupted exposures.

## Decisions requiring Prof. Jun

- Consent, recruitment, approved conditions, task wording and data retention.
- Whether exact lookup, speeds, pauses, section navigation, skipping and unlimited
  replay are allowed; which feedback/reveal timing is appropriate.
- Whether introductory exposure must be complete, and how failures/watchdogs count.
- Whether the current questions/stimuli measure the intended construct (including
  the existing numeric step stimulus), ordering/counterbalancing and response metrics.
- Narration length and precision; comfortable pitch range, continuous loudness,
  timbre and matched comparison design. No superiority claim is supported yet.
- Required assistive-technology/browser/device coverage and physical audio latency.

No current preset has been marked approved. The software does not replace ethics
or study review and does not claim to be tamper-proof assessment software.
