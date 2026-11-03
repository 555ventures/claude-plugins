---
date: 2026-11-03
status: hardened
tier: critical           # spec/scripts/spec-status.js — `--lanes --json` grows a key and `fixes[]` grows three (§ Risk Tiers: the sole "what's next" derivation and a machine surface the fan-out consumes)
area: pipeline
breaking: false
depends_on: [specs/20261103/06-the-fan-out-drains-the-queue.md]
brief: n/a
open_markers: 0
---

# Queue items remember their origin

## Goal

A queue item born by the pipeline carries who made it, why, and in which fan-out run: `origin`
(the spec and the stage that queued it), `trigger` (the constant the queuing step passes) and
`batch` (the fan-out's `startedAt` when a run is live). Every field is written by `spec-queue add`
from flags the driver prints or from the lane's own disk — a model never types a value. The
fan-out's rolling admission then admits a born fix by its origin: one generation per run (the
item's `batch` is this run, its `origin.spec` is a landed run lane), so a fix born of a fix waits
for the next batch; a `/spec:plan` birth never joins and heads the REPORT. `spec-status` and
`spec-queue show` render `↳ from <spec> (<trigger>)` under each item so the orchestrator and the
user see why it exists. Old items carry none of the fields and read as origin unknown — no
migration.

Prior art: Buildkite dynamic pipeline upload (runtime-born steps join the same build), Zuul
`Depends-On` (order declared on the item itself), GitHub merge queue / bors (a failed candidate is
requeued once, never recursively). Rejected: Jira sub-task parent-blocks-on-children — a batch that
waits for every descendant lives forever.

## Users

- The maintainer reading the queue or a fan-out report: When a fix item appears that I did not
  type, I want to see which spec, which stage and which stop produced it, so I can decide whether
  it is still needed without reconstructing the run. First run / empty: a queue with no born
  items renders exactly as today — no `↳` line anywhere.
- The orchestrator session running `/spec:fanout`: When a lane's close queues a fix against its
  own spec, I want that fix dispatched in the same run once the spec has landed, so I can leave a
  drained queue instead of a fix waiting for the next session. First run / empty: a run whose
  lanes bear nothing admits nothing and reports as today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/spec-queue.js` `add` takes three new flags, stamped on the new item whatever its kind: `--origin <spec path>` (must exist under the repo root, exit 2 `spec-queue: --origin <p>: no such spec file` otherwise) with `--stage build\|review\|fanout\|plan` — the pair travels together (one without the other exits 2 `spec-queue: --origin and --stage travel together — pass both or neither`; an unknown stage exits 2 naming the four words) → `origin: { spec, stage }`; `--trigger red-leg\|repair-separate\|close-followup\|stopped\|gate-red\|gap` (unknown exits 2 naming the six words) → `trigger`. `batch` is stamped by `add` itself: when `<git-common-dir>/spec-fanout.json` exists, parses, and carries a string `startedAt`, `batch = startedAt`; otherwise no `batch` key. Every refusal happens before any write. The header's `add` usage line and the unknown-flag message name the three flags (AC-20261103-08-1, AC-20261103-08-2, AC-20261103-08-3) | The writer script is the one place every value is validated; a model copies a printed line and can type nothing the enum does not admit. |
| D2 | `add` derives `origin` when neither `--origin` nor `--stage` was passed: `require('./pending-question').isDelegated(root)` (the module is already the one reader of the delegation signals) and the current branch (`git -C <root> rev-parse --abbrev-ref HEAD`) equals a lane's `branch` in `<git-common-dir>/spec-fanout.json` whose `spec` is a string → `origin = { spec: lane.spec, stage }` with `stage` `review` when `<root>/<spec without .md>.review/review-state.json` exists, else `build`. No marker, no table, no matching lane, or a lane with `spec: null` → no `origin` key. `trigger` is never derived (AC-20261103-08-4) | A lane worker that runs a bare add still names the lane that bore the item; the sidecar on its own disk says which stage it was in. |
| D3 | `spec/scripts/lib/queue.js` exports `STAGES` (`['build', 'review', 'fanout', 'plan']`), `TRIGGERS` (`['red-leg', 'repair-separate', 'close-followup', 'stopped', 'gate-red', 'gap']`) and `originLine(item)` → `↳ from <origin.spec> (<trigger>)` when the item carries either field (`unknown` fills a missing half), `null` when it carries neither. `spec-queue show <ref>` prints that line (plus ` · batch <startedAt>` when `batch` is set) on the line after the gate line, for live and archived items alike; `list` rows stay one line and unchanged (AC-20261103-08-5) | One render for both surfaces; an item with neither field prints nothing new, which is the no-migration rule made visible. |
| D4 | `spec/scripts/spec-status.js`: the queue overlay carries each prompt item's `origin`, `trigger` and `batch` on its entry as `__origin`/`__trigger`/`__batch`, stripped from `--next --json` alongside `__queuePos`/`__queueId` (the prompt entry's 7-key shape and every other entry's key set are unchanged). The human render prints `   ↳ from <spec> (<trigger>)` (`originLine`) directly under a prompt row in 🎯 Next, 🕓 after that and ⛔ blocked, before any `⏳` branch; an item with neither field prints no such line. `--lanes --json`: `fixes[]` entries gain `origin` (`{ spec, stage }` or `null`), `trigger` (`string` or `null`) and `batch` (`string` or `null`) — a CI escape carries `null` for all three — and the top-level object gains `born`: every undone queue item with a `batch`, in queue order, as `{ id, action, origin, trigger, batch }` (`action` = the item's paste line, `promptAction`/`itemDesc`); `lanes[]` keys are unchanged (AC-20261103-08-6, AC-20261103-08-7, AC-20261103-08-8) | spec-status stays the fan-out's only queue reader (spec 06 D2); the driver asks it for births instead of opening the queue file. |
| D5 | `spec/scripts/fanout-driver.js` `rolling(st)` step (ii) (spec 06 D5) admits by origin, replacing the `after.spec` predicate: a `fixes` entry with a `queue_id` not in the table is appended as `newLane('F' + (n + 1), 'fix', { spec: path, branch: 'fix/' + queue_id, queueId, note })` iff `batch === st.startedAt` and `origin` is non-null and `origin.spec` equals the `spec` of a `kind: 'run'` lane in the table whose state is `merged` or `done`. An entry failing any clause — `batch` null or another run's, `origin` null (an old item, a hand-typed add from main), `origin.spec` naming a fix lane's spec or a spec outside the table, the origin lane `stopped`/`waiting`/active — is left in the queue with no note (depth-2 births and foreign births wait for the next batch). The `after` key stays on `fixes[]` and is read by nothing in the driver. The admission runs at every `rolling` call site spec 06 D5 names, in bare and `--spec` runs alike, with or without `--include-fixes`; `dispatchable` is unchanged (AC-20261103-08-9, AC-20261103-08-10) | Buildkite's dynamic upload keyed on the item's own provenance: the batch stamp bounds recursion to one generation, the landed-lane clause keeps a fix from running on main before the work it repairs is there. |
| D6 | A green `--mark gate-repaired` ticks this run's gate-red birth before `rolling` runs: for every `fixes` entry of the fresh `--lanes --json` query with `trigger === 'gate-red'` and `batch === st.startedAt`, the driver runs `spec-queue done <queue_id>` (cwd the main root); a non-zero exit prints `⚠️ spec-queue done <id> failed: <stderr> — tick it by hand: node "$(spec-paths spec-queue)" done <id>` (the shape `doMerged` already prints) and continues. A gate-red item of another run is left as it is (AC-20261103-08-11) | The repair is on main the moment the gate is green — the driver already drops the matching `st.queued` line there; the queue item is the same fact one level down. |
| D7 | Every driver-printed add line carries the flags, appended after `--top`/`--lane` so spec 04 D10's `laneExit.queued` subject and every `--lane fix --top` pin stay as they are: `spec/scripts/spec-review-driver.js` — the STOPPED exits (`review stopped, blocking leg red`, in-session text and the delegated option's `then`; `review stopped, repair round spent`) gain `--origin <specRel> --stage review --trigger red-leg`; ESCALATE's queue line (`review escalated at the fix cap — <n> open findings`) gains `--origin <specRel> --stage review --trigger repair-separate` and both re-plan lines (`re-plan <specRel>: <reason>`, `--lane plan`) gain `--origin <specRel> --stage review --trigger gap`. `spec/scripts/spec-build-driver.js` — the ESCALATE park line (`build parked at the repair cap — <log>`) gains `--origin <specRel> --stage build --trigger stopped`. `spec/scripts/fanout-driver.js` `printMergeRed` — the line gains `--trigger gate-red`, and `--origin <lane.spec> --stage fanout` when the red lane's `spec` is a string (a run lane, a CI-escape fix lane); a queued fix lane (`spec: null`) gets the trigger only (AC-20261103-08-12, AC-20261103-08-13, AC-20261103-08-14, AC-20261103-08-15, AC-20261103-08-16) | The constant is chosen where the stop is known, once per call site; the pair rule in D1 is why a spec-less lane passes no stage. |
| D8 | Doctrine lines name the flags: `spec/doctrine/stages/stage-review.md` § Rules's close line becomes `node "$(spec-paths spec-queue)" add "<subject>" --lane plan\|prototype\|fix\|decide --origin <spec path> --stage review --trigger close-followup`; `spec/commands/plan.md` § Lock step 2's two lines become `node "$(spec-paths spec-queue)" add NN --top --origin {spec path} --stage plan --trigger gap` and `node "$(spec-paths spec-queue)" add "<subject>" --lane plan\|prototype\|fix\|decide --after-spec {spec path} --origin {spec path} --stage plan --trigger close-followup`; `spec/commands/queue.md`'s `argument-hint` and § Input `add` bullet name `--origin <spec> --stage build\|review\|fanout\|plan`, `--trigger <one of six>` and the lane fallback (one sentence: `inside a lane, a bare add derives --origin from the fan-out table`), and § Rules gains `Never type an --origin, --stage or --trigger value a driver did not print — the flags come from the step that queues`; `spec/commands/fanout.md` § Rules's born-fix sentence (spec 06 D9) becomes `A fix born of a member lane (its origin names the member, its batch is this run) joins the batch once that member merges; --include-fixes adds the fixes that existed before the run; a fix born of a fix, and anything a /spec:plan queues, waits for the next batch and heads the REPORT`. `tests/consistency/prose-pins.test.js` pins the protocol tokens: stage-review.md § Rules holds `--trigger close-followup`; plan.md § Lock holds `--trigger gap` and `--trigger close-followup`; queue.md holds `--origin`, `--stage` and `--trigger` (AC-20261103-08-17) | The command text is what a session copies; a flag the prose does not print is a value a model would invent. |
| D9 | `printReport`'s `queued` slot leads with this run's births: the `born` entries of one `--lanes --json` query whose `batch === st.startedAt`, those with `origin.stage === 'plan'` first, then the rest in queue order, each rendered `<id>  <action>  ↳ from <spec> (<trigger>)` (`originLine`; `unknown` halves as D3); then today's `st.queued` strings, minus any whose text equals a listed item's payload. With no births the slot is byte-identical to today (AC-20261103-08-18) | A `/spec:plan` birth is a batch boundary — the one item the orchestrator must hand to a person — so it heads the list; the `st.queued` strings stay for the lines nobody ran. |
| D10 | Existing pins are extended in place and retagged, never weakened: spec 06's exact-keys assertion on `fixes[]` (AC-20261103-06-6: `action, path, note, queue_id, after`) grows to the eight keys and spec 20261102/03's `['fixes', 'lanes', 'serialized']` top-level pin grows to four (`born`), both in `tests/spec-status.test.js`; spec 06 D5's two born-fix cases in `tests/fanout/fanout-driver.test.js` (AC-20261103-06-15 and AC-20261103-06-16: q108 joining by `after.spec`, the dispatch of `fix q108`) are rewritten under D5's predicate — q108 keeps its `after` and gains nothing, so it is the item that does NOT join, and the joining item is born through `spec-queue add` after PLAN via a new fixture helper `h.born(subject, flags)` (runs the writer with `cwd` the main root or a lane worktree; never writes the queue file by hand). `[no-ac: test-maintenance rows; each file is named in the File Plan with the pins it re-hosts]` | Adding a member to an exhaustive pin is the sanctioned collision class — one retag each, no lock-time guard. |
| D11 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming the origin/trigger/batch fields, the origin-keyed born-fix admission and the `↳ from` render. `[no-ac: plugin-bump.js --check in the gate is the oracle]` | Pipeline rules § Planning version-bump discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-queue.js | MODIFY | scripts | `--origin`/`--stage`/`--trigger` parsing and refusals, `batch` stamp, the lane fallback via `require('./pending-question').isDelegated`, `show`'s origin line; header usage and exit-2 list updated (D1, D2, D3); no dependency change |
| spec/scripts/lib/queue.js | MODIFY | scripts | `STAGES`, `TRIGGERS`, `originLine(item)` exported (D3) |
| spec/scripts/spec-status.js | MODIFY | scripts | overlay entries carry `__origin`/`__trigger`/`__batch` (stripped in `--next --json`), the `↳` line under prompt rows, `fixes[].origin/trigger/batch`, top-level `born` (D4) |
| spec/scripts/fanout-driver.js | MODIFY | scripts | `rolling` step (ii) keyed on `batch` + `origin` (D5), gate-repaired ticks gate-red births (D6), `printMergeRed` flags (D7), REPORT `queued` leads with births (D9); header `Does NOT` paragraph keeps "never opens the queue file" |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | STOPPED, ESCALATE queue and re-plan add lines carry the flags (D7) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | ESCALATE park add line carries the flags (D7) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | § Rules close line: `--origin <spec path> --stage review --trigger close-followup` (D8) |
| spec/commands/plan.md | MODIFY | doctrine | § Lock step 2's two add lines carry `--stage plan` with `gap` / `close-followup` (D8) |
| spec/commands/queue.md | MODIFY | doctrine | argument-hint, § Input add bullet (flags, enums, fallback sentence), § Rules never-type line (D8) |
| spec/commands/fanout.md | MODIFY | doctrine | § Rules born-fix sentence keyed on origin and batch (D8) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D11) |
| tests/queue/spec-queue.test.js | MODIFY | tests | AC-20261103-08-1, AC-20261103-08-2, AC-20261103-08-3, AC-20261103-08-4, AC-20261103-08-5 |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20261103-08-6, AC-20261103-08-7 (reuse, retagged in the title) |
| tests/spec-status.test.js | MODIFY | tests | AC-20261103-08-8; AC-20261103-06-6's exact `fixes[]` key list and AC-20261102-03-1's exact top-level key list extended in place and retagged (D10) |
| tests/fanout/fanout-driver.test.js | MODIFY | tests | AC-20261103-08-9, AC-20261103-08-10, AC-20261103-08-11, AC-20261103-08-14, AC-20261103-08-15, AC-20261103-08-18; AC-20261103-06-15 and AC-20261103-06-16 rewritten in place under D5 (D10) |
| tests/fanout/fixture.js | MODIFY | tests | `h.born(subject, { origin, stage, trigger, lane = 'fix', cwd })` runs `spec-queue add` through the writer and returns the new id; `h.startFixLane(queueId)` stands a linked worktree up on `fix/<queueId>`; opt `bornFix` gains `q110` (lane fix, origin `03-x`/review, trigger `close-followup`, batch `2000-01-01T00:00:00.000Z`) and `q111` (lane fix, trigger `gate-red`, batch `2000-01-01T00:00:00.000Z`) (D10) |
| tests/review/stopped-repair-round.test.js | MODIFY | tests | AC-20261103-08-12, AC-20261103-08-13 |
| tests/build/escalate-choice.test.js | MODIFY | tests | AC-20261103-08-16 |
| tests/consistency/prose-pins.test.js | MODIFY | tests | AC-20261103-08-17 |

## Contracts

Queue item (`<git-common-dir>/spec-queue.json`, additive — every key optional, written only by `add`):

```js
{ id, kind, lane?, payload?, added, after?, when?, ticked?,
  origin?:  { spec: 'specs/YYYYMMDD/NN-name.md', stage: 'build' | 'review' | 'fanout' | 'plan' },
  trigger?: 'red-leg' | 'repair-separate' | 'close-followup' | 'stopped' | 'gate-red' | 'gap',
  batch?:   '<spec-fanout.json startedAt, ISO-8601>' }
```

`spec-queue.js add` (new flags; `--origin`/`--stage` travel together, `--trigger` is free-standing):

```
add <payload…> [--lane …] [--top | --at <n>] [--after-spec <p> | --after-brief NN] [--when …] [--distinct]
               [--origin <spec path> --stage build|review|fanout|plan] [--trigger red-leg|repair-separate|close-followup|stopped|gate-red|gap]
exit 2 (new causes): --origin <p>: no such spec file · --origin and --stage travel together — pass both or neither
                     · --stage "<x>" — one of build|review|fanout|plan · --trigger "<x>" — one of red-leg|repair-separate|close-followup|stopped|gate-red|gap
fallback (no --origin, no --stage): isDelegated(root) && table lane.branch === current branch && typeof lane.spec === 'string'
                                    → origin { spec: lane.spec, stage: <root>/<stem>.review/review-state.json exists ? 'review' : 'build' }
batch: <git-common-dir>/spec-fanout.json parses with string startedAt → batch = startedAt; else no key
```

`lib/queue.js`:

```js
STAGES   = ['build', 'review', 'fanout', 'plan']
TRIGGERS = ['red-leg', 'repair-separate', 'close-followup', 'stopped', 'gate-red', 'gap']
originLine(item)  // '↳ from <origin.spec | unknown> (<trigger | unknown>)' when either is set; null when neither
```

`spec-status.js --lanes --json`:

```js
{ lanes: [...unchanged],
  serialized: [...unchanged],
  fixes: [{ action, path, note, queue_id, after, origin: {spec, stage} | null, trigger: string | null, batch: string | null }],
  born:  [{ id, action, origin, trigger, batch }] }   // every undone queue item with a batch, queue order
```

`--next --json`: unchanged (the prompt entry keeps its 7 keys; `__origin`/`__trigger`/`__batch` are stripped like `__queuePos`).

Human render (spec-status 🎯 Next / 🕓 after that / ⛔ blocked; `spec-queue show`):

```
q131  /spec:fix specs/20261103/02-x.md: review escalated at the fix cap — 2 open findings
   ↳ from specs/20261103/02-x.md (repair-separate)
```

Driver-printed add lines (the subject before the flags is unchanged):

```
review  STOPPED:   add "<spec>: review stopped, blocking leg red" --lane fix --top --origin <spec> --stage review --trigger red-leg
                   add "<spec>: review stopped, repair round spent" --lane fix --top --origin <spec> --stage review --trigger red-leg
review  ESCALATE:  add "<spec>: review escalated at the fix cap — <n> open findings" --lane fix --top --origin <spec> --stage review --trigger repair-separate
                   add "re-plan <spec>: <reason>" --lane plan --origin <spec> --stage review --trigger gap
build   ESCALATE:  add "<spec>: build parked at the repair cap — <log>" --lane fix --top --origin <spec> --stage build --trigger stopped
fanout  MERGE_RED: add "main gate red after merging <id>: <log>" --lane fix --top --origin <lane spec> --stage fanout --trigger gate-red   (run lane / CI-escape lane)
                   add "main gate red after merging <id>: <log>" --lane fix --top --trigger gate-red                                      (queued fix lane, spec null)
review  CLOSE:     add "<subject>" --lane <lane> --origin <spec> --stage review --trigger close-followup
plan    LOCK:      add NN --top --origin <spec> --stage plan --trigger gap
                   add "<subject>" --lane <lane> --after-spec <spec> --origin <spec> --stage plan --trigger close-followup
```

`fanout-driver.js` join predicate (`rolling` step (ii)) and REPORT:

```
join(entry, st) = entry.queue_id && !tabled(entry.queue_id)
               && entry.batch === st.startedAt
               && entry.origin && st.lanes.some(l => l.kind === 'run' && l.spec === entry.origin.spec && ['merged', 'done'].includes(l.state))
gate-repaired green: for each fixes entry with trigger 'gate-red' and batch === st.startedAt → spec-queue done <queue_id>; then rolling
REPORT queued: [born with batch === startedAt: stage 'plan' first, then queue order] ++ [st.queued strings not equal to a listed payload]
               each birth: '<id>  <action>  ↳ from <spec> (<trigger>)'
```

## Data Model

changes: additive-only — three optional keys (`origin`, `trigger`, `batch`) on a queue item and on its
archived copy; no key is renamed, re-typed or removed; no reader requires them.
existing rows: unaffected — an item without the keys is read, listed, shown, ranked and archived exactly
as today; `originLine` returns `null` for it, `fixes[]` carries `null`s, and `born` omits it.

## Behavior

A lane's review closes spec `02-x` and the session queues a follow-up fix exactly as stage-review.md
prints it (`--after-spec specs/…/02-x.md --origin specs/…/02-x.md --stage review --trigger
close-followup`); `add` sees `<git-common-dir>/spec-fanout.json` and stamps `batch` with the run's
`startedAt`. The fan-out merges L1 `02-x` green; `rolling` queries `--lanes --json`, finds the item
under `fixes` with `origin.spec === 'specs/…/02-x.md'`, `batch === st.startedAt`, and L1 `merged` →
appends F1 `fix/q131`; once every run lane is terminal, F1 is dispatched as `/spec:fix q131`. F1's
review stops red and its worker runs the printed STOPPED line: the fallback on main would add
nothing, but F1's worktree is a lane, so `origin = { spec: null… }` — a queued fix lane has
`spec: null`, so no origin is derived and the item never joins: depth 2 waits for the next batch and
is listed under the REPORT's `queued` slot with `↳ from unknown (red-leg)`.

MERGE_RED after L2: the printed line carries `--origin specs/…/04-z.md --stage fanout --trigger
gate-red`; the user runs it, repairs main, marks `gate-repaired`; the green gate ticks that item
(`spec-queue done q132`) and `rolling` sees it no more.

A planner locks a spec during the run and queues a follow-up with `--stage plan --trigger gap`; it
is lane `plan`, so `fixes` never lists it and nothing joins; at REPORT it heads `queued` as
`q133  /spec:plan <subject>  ↳ from specs/…/09-y.md (gap)` above every fix birth.

`spec-status` on this checkout today would print, under q27's row, nothing (no fields); after a run,
`   ↳ from specs/20261103/06-the-fan-out-drains-the-queue.md (close-followup)` under the item that
cites it — the only new line in the dashboard.

## Acceptance Criteria

- **AC-20261103-08-1**: WHEN `spec-queue add "repair x" --lane fix --origin specs/20260701/01-a.md
  --stage review --trigger red-leg` runs on a host whose `specs/20260701/01-a.md` exists and no
  `spec-fanout.json` THE SYSTEM SHALL exit 0, print `added`, and write the item with
  `origin` deep-equal `{ spec: 'specs/20260701/01-a.md', stage: 'review' }`, `trigger === 'red-leg'`
  and no `batch` key (e.g. `Object.keys(item)` → `['id','kind','lane','payload','added','origin','trigger']`),
  and WHEN the same flags ride `add specs/20260701/02-b.md --origin … --stage plan --trigger gap`
  THE SYSTEM SHALL stamp the spec item the same way → writes tests/queue/spec-queue.test.js
- **AC-20261103-08-2**: WHEN `add` runs with `--origin specs/20260701/01-a.md` and no `--stage`, with
  `--stage build` and no `--origin`, with `--stage ship`, with `--trigger oops`, or with `--origin
  specs/20260701/99-none.md` THE SYSTEM SHALL exit 2 with stderr containing, respectively,
  `--origin and --stage travel together`, `--origin and --stage travel together`, `one of
  build|review|fanout|plan`, `one of red-leg|repair-separate|close-followup|stopped|gate-red|gap`
  and `--origin specs/20260701/99-none.md: no such spec file`, and write no queue file (e.g.
  `fs.existsSync('.git/spec-queue.json')` → `false` after all five) → writes
  tests/queue/spec-queue.test.js
- **AC-20261103-08-3**: WHEN `.git/spec-fanout.json` holds `{ "version": 1, "startedAt":
  "2026-11-03T10:00:00.000Z", "lanes": [] }` and `add "repair y" --lane fix` runs with no origin
  flags from the main root THE SYSTEM SHALL write `batch === '2026-11-03T10:00:00.000Z'` and no
  `origin` key, and WHEN the file is absent or holds `{}` THE SYSTEM SHALL write no `batch` key
  (e.g. `'batch' in item` → `false`) → writes tests/queue/spec-queue.test.js
- **AC-20261103-08-4**: WHEN `.git/spec-fanout.json` lists lane `{ "id": "L1", "kind": "run",
  "spec": "specs/20260701/01-a.md", "branch": "spec/01-a" }` and `add "born" --lane fix` runs with
  `cwd` a linked worktree on branch `spec/01-a` that holds `specs/20260701/01-a.review/review-state.json`
  THE SYSTEM SHALL write `origin` deep-equal `{ spec: 'specs/20260701/01-a.md', stage: 'review' }` and no
  `trigger` key; WHEN the same worktree holds no review sidecar THE SYSTEM SHALL write `stage ===
  'build'`; and WHEN the same add runs with `cwd` the main root THE SYSTEM SHALL write no `origin` key
  (e.g. `'origin' in item` → `false`) while `batch` is still stamped → writes tests/queue/spec-queue.test.js
- **AC-20261103-08-5**: WHEN `spec-queue show q1` runs on an item with `origin { spec:
  'specs/20260701/01-a.md', stage: 'build' }`, `trigger 'stopped'` and `batch
  '2026-11-03T10:00:00.000Z'` THE SYSTEM SHALL print the line `↳ from specs/20260701/01-a.md (stopped)
  · batch 2026-11-03T10:00:00.000Z` after the gate line and before the blank line, WHEN the item has
  `trigger 'gap'` and no `origin` THE SYSTEM SHALL print `↳ from unknown (gap)`, and WHEN the item has
  neither field THE SYSTEM SHALL print no line containing `↳` (e.g. a pre-existing `{ id: 'q1', kind:
  'prompt', lane: 'fix', payload: 'old', added: … }` → the same four lines `show` prints today) → writes
  tests/queue/spec-queue.test.js
- **AC-20261103-08-6**: WHEN `spec-status --root <dir>` renders a queue with `q1` (lane fix, `origin {
  spec: 'specs/20260701/01-a.md', stage: 'review' }`, `trigger 'repair-separate'`), `q2` (lane fix, no
  fields) and `q3` (lane fix, `after { spec: 'specs/20260701/02-b.md' }` unmet, `trigger 'close-followup'`,
  no origin) THE SYSTEM SHALL print `   ↳ from specs/20260701/01-a.md (repair-separate)` on the line
  directly after q1's row in 🎯 Next, no `↳` line after q2's row, and under `--all`'s ⛔ blocked the
  lines `   ↳ from unknown (close-followup)` then `   └─ ⏳ after 02-b` after q3's row (e.g. the two
  lines following q3's row, in order: `   ↳ from unknown (close-followup)`, `   └─ ⏳ after 02-b`) →
  writes tests/queue/queue-overlay.test.js
- **AC-20261103-08-7**: WHEN `--next --json` runs with a prompt item carrying `origin`, `trigger` and
  `batch` THE SYSTEM SHALL CONTINUE TO print the prompt entry with exactly the keys
  `action, blockers, brief, note, path, queue, status` and every other entry with its 8 keys (e.g. no
  `__origin`, `origin`, `trigger` or `batch` key anywhere in `next[]`) → reuses
  tests/queue/queue-overlay.test.js :: AC-20260903-03-12
- **AC-20261103-08-8**: WHEN `--lanes --json` runs with queue items `q107` (lane fix, no fields),
  `q120` (lane fix, `origin { spec: 'specs/20261102/03-x.md', stage: 'review' }`, `trigger
  'close-followup'`, `batch '2026-11-02T12:00:00.000Z'`), `q121` (lane plan, `origin { spec:
  'specs/20261102/03-x.md', stage: 'plan' }`, `trigger 'gap'`, `batch '2026-11-02T12:00:00.000Z'`) and a
  red-CI escape THE SYSTEM SHALL print `fixes` entries whose keys are exactly `action, path, note,
  queue_id, after, origin, trigger, batch`, with `null` for all three on q107 and the escape and
  `{ spec: 'specs/20261102/03-x.md', stage: 'review' }`, `'close-followup'`,
  `'2026-11-02T12:00:00.000Z'` on q120; the top-level keys exactly `lanes, serialized, fixes, born`;
  and `born` exactly `[{ id: 'q120', action: '/spec:fix …', origin: {…}, trigger: 'close-followup',
  batch: '2026-11-02T12:00:00.000Z' }, { id: 'q121', action: '/spec:plan …', origin: { spec:
  'specs/20261102/03-x.md', stage: 'plan' }, trigger: 'gap', batch: '2026-11-02T12:00:00.000Z' }]`
  (q107 absent) with `lanes[0]`'s keys unchanged → writes tests/spec-status.test.js
- **AC-20261103-08-9**: WHEN a bare plan on the fixture with opt `bornFix` is admitted, `h.born('fix
  export after x', { origin: 'specs/20261102/03-x.md', stage: 'review', trigger: 'close-followup' })`
  adds an item from the main root (so `batch` is the run's `startedAt`), and L1 `03-x` merges green
  with `03-x` done on main THE SYSTEM SHALL append exactly one fix lane for that id with
  `['fix', 'fix/<id>', '<id>', 'planned']` as `[kind, branch, queueId, state]` and append nothing for
  `q108` (after met, no origin) or `q109`; WHEN every run lane is terminal THE SYSTEM SHALL print
  `## Step: dispatch 1 lanes` naming `fix <id>`; and WHEN the run was planned with `--spec
  specs/20261102/03-x.md` THE SYSTEM SHALL admit the same birth the same way → writes
  tests/fanout/fanout-driver.test.js
- **AC-20261103-08-10**: WHEN, with AC-20261103-08-9's birth tabled as F1 after L1's green merge and
  F1's worktree stood up on `fix/<id>` (`h.startFixLane(id)`), three more items are pending — A, born
  by `h.born('after z', { origin: 'specs/20261102/04-z.md', stage: 'review', trigger: 'close-followup' })`
  while L2 `04-z` is still `dispatched`; the fixture's `q110` (lane fix, `origin { spec:
  'specs/20261102/03-x.md', stage: 'review' }`, `trigger 'close-followup'`, `batch
  '2000-01-01T00:00:00.000Z'` — another run's birth against a merged member); and C, born by
  `h.born('from the fix lane', {})` with `cwd` F1's worktree (a queued fix lane, `spec: null`) — and L2
  then merges green THE SYSTEM SHALL append exactly one new fix lane, F2 for A (`['fix', 'fix/<A>',
  '<A>', 'planned']`), table nothing for `q110` or C, print no note naming either, and C's item SHALL
  carry `batch` and no `origin` key (e.g. `h.state().lanes.filter(l => l.kind === 'fix').map(l =>
  l.queueId)` → `['<id>', '<A>']`) → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-08-11**: WHEN L1 `03-x`'s merge leaves the gate red, an item is born exactly as the
  printed MERGE_RED line says (`h.born('main gate red after merging L1: <log>', { origin:
  'specs/20261102/03-x.md', stage: 'fanout', trigger: 'gate-red' })`, so it carries the run's `batch`),
  the fixture's `q111` (lane fix, `trigger 'gate-red'`, `batch '2000-01-01T00:00:00.000Z'`) is pending,
  and `--mark gate-repaired` runs green THE SYSTEM SHALL archive the born item (`spec-queue show <id>`
  prints `done (archived)`), leave `q111` pending (e.g. the live queue's fix ids → `['q107', 'q108',
  'q109', 'q110', 'q111']`), and print no `⚠️ spec-queue done` line → writes
  tests/fanout/fanout-driver.test.js
- **AC-20261103-08-12**: WHEN the review driver prints STOPPED with the repair round spent THE SYSTEM
  SHALL print the line `node "$(spec-paths spec-queue)" add "<specRel>: review stopped, repair round
  spent" --lane fix --top --origin <specRel> --stage review --trigger red-leg` (e.g. for
  `specs/20260801/01-foo.md` → `… --top --origin specs/20260801/01-foo.md --stage review --trigger
  red-leg`), and WHEN the host's `policy.stops.repairRound` is `ask` and the round is unspent THE SYSTEM
  SHALL print the `review stopped, blocking leg red` line with the same three flags → writes
  tests/review/stopped-repair-round.test.js
- **AC-20261103-08-13**: WHEN the review driver prints ESCALATE at the fix cap THE SYSTEM SHALL print the
  queue line ending `--lane fix --top --origin <specRel> --stage review --trigger repair-separate` and
  the re-plan line ending `--lane plan --origin <specRel> --stage review --trigger gap` (e.g.
  `add "re-plan specs/20260801/01-foo.md: <reason>" --lane plan --origin specs/20260801/01-foo.md --stage
  review --trigger gap`) → writes tests/review/stopped-repair-round.test.js
- **AC-20261103-08-14**: WHEN a run lane's merge leaves the gate red THE SYSTEM SHALL print the MERGE_RED
  add line `node "$(spec-paths spec-queue)" add "main gate red after merging L1: <log>" --lane fix --top
  --origin specs/20261102/03-x.md --stage fanout --trigger gate-red` (e.g. the substring
  `--top --origin specs/20261102/03-x.md --stage fanout --trigger gate-red` present) → rewrites
  tests/fanout/fanout-driver.test.js :: AC-20261102-03-17: a
- **AC-20261103-08-15**: WHEN a queued fix lane's merge (`F1`, `queueId q107`, `spec null`) leaves the
  gate red THE SYSTEM SHALL print the MERGE_RED add line ending `--lane fix --top --trigger gate-red`
  with no `--origin` and no `--stage` (e.g. `/--top --trigger gate-red$/m` matches and `--stage` is
  absent from the line) → rewrites tests/fanout/fanout-driver.test.js :: fanout: a red
- **AC-20261103-08-16**: WHEN the build driver prints the ESCALATE park body THE SYSTEM SHALL print the
  line `node "$(spec-paths spec-queue)" add "<specRel>: build parked at the repair cap — <log>" --lane fix
  --top --origin <specRel> --stage build --trigger stopped` (e.g. ending `--top --origin
  specs/20260801/01-foo.md --stage build --trigger stopped`) → writes tests/build/escalate-choice.test.js
- **AC-20261103-08-17**: WHEN `tests/consistency/prose-pins.test.js` reads the doctrine THE SYSTEM SHALL
  find `--trigger close-followup` in `spec/doctrine/stages/stage-review.md` § Rules, both `--trigger gap`
  and `--trigger close-followup` in `spec/commands/plan.md` § Lock, and `--origin`, `--stage` and
  `--trigger` in `spec/commands/queue.md` (e.g. `section(stageReview, 'Rules').includes('--trigger
  close-followup')` → `true`) → writes tests/consistency/prose-pins.test.js
- **AC-20261103-08-18**: WHEN L1 `03-x` returns with a review sidecar carrying `laneExit: { reason:
  'review stopped, repair round spent', queued: 'specs/20261102/03-x.md: review stopped, repair round
  spent' }` (the lane lands `stopped`, `st.queued` holds that subject), the lane's own add is replayed
  (`h.born('specs/20261102/03-x.md: review stopped, repair round spent', { origin:
  'specs/20261102/03-x.md', stage: 'review', trigger: 'red-leg' })` → id F), a planner's birth
  `h.born('split the queue render', { lane: 'plan', origin: 'specs/20261102/03-x.md', stage: 'plan',
  trigger: 'gap' })` → id P lands after it, L2 `04-z` returns `--stopped "worker gone"`, and the bare run
  prints `## Step: report` THE SYSTEM SHALL write `report.json`'s `queued` as exactly `['<P>  /spec:plan
  split the queue render  ↳ from specs/20261102/03-x.md (gap)', '<F>  /spec:fix specs/20261102/03-x.md:
  review stopped, repair round spent  ↳ from specs/20261102/03-x.md (red-leg)']` (the `st.queued`
  string is dropped as F's duplicate), and WHEN no pending item carries this run's batch THE SYSTEM
  SHALL write `queued` equal to `st.queued` (e.g. `['specs/20261102/03-x.md: review stopped, repair
  round spent']` when only the sidecar's subject exists) → writes tests/fanout/fanout-driver.test.js

## Assumptions (escalation triggers)

- A1: Executed check — `node -e "require('./spec/scripts/pending-question.js')"` runs no CLI code
  (`if (require.main === module) main()` guards it) and exports `isDelegated`; spec 04 D3 keeps the
  module shape — **if false:** spec-queue.js spawns `pending-question.js is-delegated --root <root>`
  and reads the exit code instead; D2's observable is unchanged.
- A2: Executed check (scratch repo, deleted) — `spec-queue add` run with `cwd` a linked worktree on
  `spec/01-x` writes `<main>/.git/spec-queue.json` (the worktree has no queue file of its own),
  `isDelegated(wt)` is `true` with the branch listed in `.git/spec-fanout.json` and `false` on main,
  and `git -C <wt> rev-parse --abbrev-ref HEAD` prints `spec/01-x` — **if false:** D2's fallback
  cannot resolve the lane; drop the fallback, keep the explicit flags (every driver line carries
  them), and record the gap in Rationale.
- A3: Executed check — on this checkout `--lanes --json` prints `fixes[0]` with exactly
  `action, path, note, queue_id` and the top-level keys `lanes, serialized, fixes`; spec 06 D2 adds
  `after` to `fixes[]` and its AC-6 pins the five keys exactly (06 locked at 29f64004 with that text);
  spec 20261102/03's pin (`tests/spec-status.test.js` ~1278) pins the three top-level keys exactly —
  **if false** (06's build lands a different key set): D10's retag targets whatever 06 shipped; the eight-key list in AC-8 is amended
  at build Phase 0 and recorded as a deviation, never a second shape.
- A4: Executed check — every test pin on a driver-printed add line is a substring or prefix check
  (`includes('--lane fix --top')`, `startsWith('node "$(spec-paths spec-queue)" add')`:
  `tests/consistency/dead-stops.test.js`, `tests/build/escalate-choice.test.js`,
  `tests/review/delegated-stops.test.js`, `tests/fanout/fanout-driver.test.js:394`), so flags appended
  after `--top` keep them green; spec 04 D10's `laneExit.queued` carries the subject, not the line —
  **if false** (a pin asserts the whole line): enter that file as a fix row, retag in place.
- A5: Spec 06's post-image is the base: `rolling(st)` has a step (ii) over `fixes[]` keyed on
  `after.spec` (06 D5), `fixes[]` carries `after` (06 D2), `st.queued` receives `laneExit.queued`
  (04 D9) and the fixture exports `writeSpec` and the `bornFix` opt (06 D12) — **if false** (06 not
  merged when this builds): the build is blocked by `depends_on`; never build on the pre-image.
- A6: Executed check — `report-render.js` renders `queued` as `[string]` (`📋 {text}` lines), so D9's
  rendered birth lines are plain strings — **if false:** D9 passes `{ text }` objects in whatever shape
  the renderer takes; the line text is unchanged.
- A7: `spec-status.js` strips private keys from `--next --json` by an explicit destructure
  (`{ rank, parallelReason, __queuePos, __queueId, ...e }`), so D4's three new private keys must be
  added to that list — AC-7's reused pin reddens if they are not — **if false** (a generic `__` strip
  exists): nothing to add; AC-7 still holds.
- A8: `spec-queue.js`'s `add` is the only subcommand that takes flags; `show` takes a `<ref>` only, so
  D3's line on `show` is additive output, not a flag — **if false:** nothing changes; the line is
  printed unconditionally when `originLine` is non-null.

## Rationale

The fields are written by the script, never typed, for the same reason `--lane` exists: the one
fact the pipeline cannot derive afterwards is why an item was queued, and a model asked to remember
it invents one. So every driver prints the full line (D7), the doctrine lines carry the constants
(D8), and a bare add inside a lane still names its lane from the fan-out table (D2) — the only
input a worker's disk reliably holds. `trigger` is never derived: a stop knows its own kind; a
reader of the queue does not.

D5 replaces spec 06 D5's interim predicate as that spec's own D10 asked. The two rules agree on the
case that matters — a close follow-up against a member that has landed — and differ on provenance:
`after.spec` is a gate, not a parentage, so a hand-queued fix gated on a member would have joined a
batch it was never born of. The `batch` stamp bounds recursion exactly as the user drew it: a fix
born of a fix lane has `spec: null` in the table, so D2 derives no origin and the item waits
(depth 2); an item born in an earlier run has an older `batch` and waits too — it is the next
PLAN's business under `--include-fixes`. The landed-lane clause (merged/done) is kept from 06: a fix
lane branches from main, so a birth against a `stopped` lane (a red leg, a parked build) describes
work that is not on main yet and is the human's to resume, as 06 D3 already rules for the lane
itself. Rejected: joining on `kind=fix` + `batch` alone (the user's literal three clauses without
the landed clause) — it would dispatch `/spec:fix` against a branch main has never seen.

D6 is the derived answer to the one birth the batch cannot run: MERGE_RED freezes dispatch until
the gate is green, and green means the repair is on main — the driver already drops the matching
`st.queued` line at that mark, so ticking the item is the same fact. Rejected: leaving the item for
a fix lane after `gate-repaired` (a `/spec:fix` against a green main has nothing to do).

D4's `born` key, rather than the driver reading `spec-queue.json`, keeps spec 06 D2's rule — the
driver asks spec-status, never the file — at the cost of one more exhaustive-pin retag (D10), the
sanctioned class. `--next --json` stays frozen: the private keys ride the entry and are stripped
with the two that already are. The human `↳` line goes under prompt rows only; escapes have no
queue item and specs have no origin.

Trigger constants per site: `red-leg` for both STOPPED exits (the same red leg, one round apart),
`repair-separate` for the fix-cap queue pick (the findings are repaired outside the review), `gap`
for every re-plan and for a plan-lock `add NN --top` (a gap in the plan), `stopped` for the parked
build, `gate-red` for MERGE_RED, `close-followup` for review-close and plan-lock `--after-spec`
items. `release.md`'s two add lines and `prototype-driver.js`'s contract add are untouched: neither
has a spec origin in the enum's sense, and both stay origin-unknown by the no-migration rule.
`spec-queue list` keeps its one-line rows (an existing invariant); `show` is the full view.

Collision closure at lock (advisory): the `--lanes --json` key set and the `fixes[]` key set are
pinned exhaustively (A3) — both retags are D10 rows; the `--lane fix --top` substring pins stay
green by construction (A4). The literals leg for `fixes` and `serialized` hits dozens of files that
use the common words (`tests/review/*`, `tests/consistency/*`, `docs/roadmap/32-*`,
`spec/scripts/ac-matrix.js`) — waived as unrelated contexts; `queue_id` hits
`spec/scripts/decision-lint.js`, which reads only `spec-queue show`'s exit code — waived. The
executes-tier hits on the build and review drivers (`tests/build/*`, `tests/review/*`,
`tests/consistency/entrypoints.test.js`) observe lines this spec only extends after `--top` (A4);
the build's whole-suite check adjudicates. Spec 06 locked (commit 29f64004) before this lock; its
AC numbers are final and D10 cites them.

## Canonical Delta

`docs/canonical/status.md`, the queue paragraph: append — "An item may carry `origin: {spec, stage}`,
`trigger` and `batch`, written only by `spec-queue add` (`--origin`/`--stage`/`--trigger`, or the lane
fallback from the fan-out table; `batch` is the live fan-out's `startedAt`); the dashboard prints
`↳ from <spec> (<trigger>)` under such a row and `show` prints it with the batch. Items without the
fields read as origin unknown. `--lanes --json`'s `fixes[]` carries `origin`, `trigger` and `batch`
(null when absent) and a fourth top-level key `born` lists every undone item stamped with a batch.
(specs/20261103/08-queue-items-remember-their-origin.md)"

`docs/canonical/pipeline.md`, the `/spec:fanout` paragraph: append — "A fix born of the batch joins it by
provenance: its `batch` is this run's `startedAt` and its `origin.spec` is a member lane that has merged;
a fix born of a fix lane, a birth of another run, and anything `/spec:plan` queues wait for the next
batch. A green `--mark gate-repaired` ticks the run's own gate-red item. The REPORT's `queued` slot leads
with this run's births, `/spec:plan` births first, each with its `↳ from` line.
(specs/20261103/08-queue-items-remember-their-origin.md)"
