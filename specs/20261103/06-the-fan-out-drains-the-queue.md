---
date: 2026-11-03
status: hardened
tier: critical           # spec/scripts/spec-status.js changes what --next --json / --lanes --json derive; spec/templates/grounding-contract.md gains policy.fanout (§ Risk Tiers: both are triggers)
area: pipeline
breaking: false
depends_on: [specs/20261103/04-predictable-stops-become-host-policy.md]
brief: n/a
open_markers: 0
---

# The fan-out drains the queue

## Goal

`/spec:fanout` becomes automation in batches: at invocation the driver derives the batch — the
queue's startable specs in order up to a derived boundary — prints it as one vetoable `📌` line,
and from then on re-queries after every landing: serialized members are dispatched when the lane
they waited on has merged, fixes born of a member lane join the same batch, and REPORT prints only
when the batch is done; the next bare run starts the next batch. Two root causes go: `spec-status.js`
never marks a briefless spec parallel-ok (it compares briefs only), so a repo of ad-hoc specs never
has a second lane; and the driver tables one wave and reports when it empties. Done means a queue of
briefless, hardened specs is run batch after batch with no `/spec:run` paste and no question —
in parallel where their File Plans are disjoint outside the ceremony paths, in series where they
overlap — stopping only before a spec that rewrites the pipeline itself, a critical spec sharing a
Risk Tiers file with an unmerged lane, a dependency the batch cannot meet, or a planning item.

Prior art: bors, GitHub merge queue and Prow tide re-form the queue after each landing, batch size is
config and a human intervenes on red only; Buildkite dynamic pipeline upload lets runtime-born steps
join the same build; the bootstrap rule — never upgrade the runner inside the job — is what
`selfSurfaces` encodes.

## Users

- The maintainer running the pipeline over a queue of hardened specs: When several specs are ready
  and I start one fan-out, I want the batch chosen for me, every member built and merged without me
  pasting the next command, and the run to stop by itself before anything that needs my attention,
  so I can come back to a report that says what landed and why the batch ended there. First run /
  empty: a repo with no startable spec prints `no startable lanes — nothing to fan out` and writes no
  state.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/spec-status.js` gains `pairSerialReason(a, b)` over two `deriveNext` entries: both carry a brief → `briefSerialReason(a.brief, b.brief)` (unchanged); otherwise both must resolve (via `specs` by path) to a spec whose parsed File Plan has ≥ 1 row, and the shared paths `a.filePlan ∩ b.filePlan` in `a`'s row order **minus the exempt set** decide: none → `null` (parallel), some → `File Plan overlap: <p1>, <p2> (+n more)` — the first two, then the count beyond two, the 🔶 heads-up's own shape, extracted into one `shownFiles(paths)` helper. The exempt set = every path matching a `policy(root).fanout.overlapExempt` glob (`globMatch` from `lib/glob-match.js`) plus the host's `pipelineRules` path. Either side without a brief and without a ≥ 1-row File Plan → no claim. The `--next` annotation loop runs whenever `top` exists and is unblocked (the `top.brief` requirement goes): each runner-up with no blockers that is not `/spec:fix` gets `parallel: true` on `null`, `parallel: false` + `parallelReason` on a string, and stays `null` on no claim. The 🔶 heads-up still reports raw overlap, exempt paths included. `--next --json`'s key set, the five action strings and every other shape are byte-identical (AC-20261103-06-1, AC-20261103-06-2, AC-20261103-06-3) | A File Plan is the one surface a briefless spec declares; disjoint plans cannot collide at merge-back. Ceremony paths every spec touches (manifests, shared doctrine, the rules file, README) would serialize everything, so they are exempt from the decision but still named by the heads-up, where the conflict is real. |
| D2 | `laneAdmission`'s clash check becomes `lanes.slice(1).find(l => pairSerialReason(e, l))` with `laneClash` recording that reason, replacing `briefSerialReason(e.brief, l.brief)` (which returns `shared brief null` for two briefless entries). `--lanes --json`: a briefless spec reaches `lanes` when disjoint from the top pick and from every admitted lane, else `serialized` with the overlap reason; each `fixes` entry gains one key `after` — the queue item's `after.spec` path, else `null` (a CI escape is `null`); `lanes[]` keys and the top-level keys are unchanged; `--all`'s `🤷 no brief — parallelism unknown` branch survives only for no-claim entries (AC-20261103-06-4, AC-20261103-06-5, AC-20261103-06-6) | One admission derivation (spec 20261102/03 D1); the driver reads `after` instead of opening the queue file. |
| D3 | `spec/scripts/lib/host-config.js` `POLICY_DEFAULTS` gains `fanout: { selfSurfaces: [...], overlapExempt: [...] }`, merged key by key like `models` (a partial block keeps the other list), validated as `fanout: expected an object`, `unknown key fanout.<k>`, `fanout.<k>: expected an array of non-empty strings`. Default `selfSurfaces`: `spec/scripts/fanout-driver.js`, `spec/scripts/spec-build-driver.js`, `spec/scripts/spec-review-driver.js`, `spec/scripts/pending-question.js`, `spec/scripts/merge-back.sh`, `spec/scripts/lib/**`, `spec/scripts/*-gate.*`, `spec/hooks/**`, `spec/bin/**`. Default `overlapExempt`: `README.md`, `**/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `spec/doctrine/core.md`, `spec/doctrine/design.md`. `spec/templates/grounding-contract.md` § Policy: the JSON block gains the `fanout` object with both default lists, the Enums paragraph gains `fanout.selfSurfaces` and `fanout.overlapExempt` `arrays of non-empty glob strings`, the Semantics paragraph gains one sentence each (a self-surface ends a fan-out batch and runs alone; an exempt path never serializes two briefless specs) — the one contract edit; this repo's `.claude/spec.config.json` `contractHash` is restamped to `spec-paths contract-hash` in the same change (AC-20261103-06-7, AC-20261103-06-8) | A host names its own runner and its own ceremony paths; the plugin's defaults are its own files, which never match in a host that is not this repo. |
| D4 | `spec/scripts/fanout-driver.js` PLAN with no `--spec`: `LANE_CAP = 4` is a constant (`--lanes` is gone; `--lanes` or any unknown flag exits 2 with the usage line naming `--batch`). The driver walks `spec-status --next --json`'s entries in order, skipping `/spec:fix` escapes and `/spec:fix` queue prompts, and admits members until the first boundary: (a) a `/spec:run` spec whose File Plan has a path matching a `policy(root).fanout.selfSurfaces` glob — reason `touches pipeline self-surface <path>`; a self-surface spec at the head is the whole batch, reason `self-surface runs alone`, boundary before the next entry; (b) a `/spec:run` spec with `tier: critical` whose File Plan shares a path with an earlier member's File Plan where that path appears in backticks inside the rules file's `## Risk Tiers` section (`extractSection` from `lib/spec-sections.js`; missing config, rules file or section → an empty set) — reason `critical: shares Risk Tiers path <path> with <member stem>`; (c) an entry with blockers — reason `blocked: <first blocker>`; (d) an entry whose action is not `/spec:run` — reason `<action> item heads the queue`. A member whose branch lives in a linked worktree adds today's `⏸ … parked` note and is neither tabled nor a boundary. Members are tabled exactly as today's `--spec` mode tables them — `planned` when the entry is in `lanes`, `waiting` with the reason when in `serialized` (`--override-serial` keeps admitting `shared brief` members as `planned`). The state file gains `batch: { members: [<path>…], stopBefore: { path, reason } \| null, by: 'derived' \| 'batch-flag' \| 'spec-flags' }`, and PLAN prints `📌 Auto-picked batch: <stem>, <stem> — stops before <stem> (<reason>) (veto: --batch <ids\|all>)` (`— the whole queue` in place of `stops before …` when no boundary was met) ahead of the table. `--batch all` → every unblocked `/spec:run` entry is a member, no boundary; `--batch <id>[,<id>…]` (each a spec stem or path; an id matching no unblocked `/spec:run` entry, or two specs, exits 2 naming them) → exactly those, in the order given, like `--spec`; `--spec` is unchanged (AC-20261103-06-9, AC-20261103-06-10, AC-20261103-06-11, AC-20261103-06-12, AC-20261103-06-13, AC-20261103-06-14) | The batch picker is derived, never asked (Question Style): the four boundaries are the four reasons a human would want to look before the next spec starts, and one flag is the veto. Concurrency is a resource constant, not a question. |
| D5 | `rolling(st)` runs one `spec-status --lanes --json` query and (i) promotes `waiting` members exactly as today (a member now in `lanes` with no worktree, or in `serialized` with a `shared brief` reason under `--override-serial`, flips to `planned`), then (ii) appends every `fixes` entry with a `queue_id` whose `after` names the `spec` of a run (`kind: 'run'`) lane in the table in state `merged` or `done`, and whose `queue_id` matches no lane in the table, as `newLane('F' + (n + 1), 'fix', …)` with `n` the highest F-number (0 when none) — `branch` `fix/<queue_id>`, `queueId`, `note`; a `fixes` entry with `after: null`, or whose `after` names a spec that is not a run lane here (a fix lane's spec, a spec outside the table), is never appended by `rolling`. `--include-fixes` keeps today's meaning: the fixes present at PLAN are tabled then; born fixes join regardless of the flag. `dispatchable` is unchanged: fix lanes run one at a time after every run lane is terminal. `rolling` runs after a green `--mark merged`, a green `--mark gate-repaired`, a `--mark returned` landing `stopped` or `done`, and on a bare run whose derived state is REPORT — admission first, state re-derived, the file saved when anything changed (AC-20261103-06-15, AC-20261103-06-16, AC-20261103-06-17) | Buildkite's dynamic upload: work born of the batch joins the batch. Depth is one by construction — a fix born of a fix names a fix lane, not a run lane; the queue-side origin field that names the bearing lane directly is q27's spec (D10). |
| D6 | REPORT is derived only when no lane is `planned`, `dispatched`, `pending` or `merge-ready` and D5 appended and promoted nothing; a `waiting` member whose dependency stopped still reports `not started — waited on <dep>, which stopped`. REPORT's slots gain: when `batch.stopBefore` is set, the warn `batch stopped before <stem> — <reason>; the next bare run starts the next batch`, and when its reason came from (d) the first bullet `<action> @<path> heads the queue — <reason>; run it attended`. `--mark reported` is unchanged (it deletes the state), so the next bare run is a fresh PLAN over the queue as it then stands (AC-20261103-06-18, AC-20261103-06-19) | The report is the end of a batch, not of the first wave; a planning item is the one head the orchestrator must hand to a person. |
| D7 | `deriveState` order becomes: no table → PLAN; red `lastGate` → RELAY when a lane is `pending`, else MERGE_RED; a `pending` lane → RELAY; a `merge-ready` lane → MERGE; `dispatchable` non-empty → DISPATCH; a `planned` or `dispatched` lane → WAIT; else REPORT (after D5 on a bare run). RELAY and MERGE now outrank DISPATCH; MERGE_RED still outranks DISPATCH, a pending question still outranks a red gate, and the host gate still runs after every merge (AC-20261103-06-20, AC-20261103-06-21, AC-20261103-06-22, AC-20261103-06-23) | Land what is ready before dispatching new work: a lane dispatched after the landing branches from the newest main and the promotion that follows the landing sees it (bors/tide). |
| D8 | The PREFLIGHT standing sheet, `--mark standing`, the three label flags and `st.standing` are deleted by specs/20261103/04-predictable-stops-become-host-policy.md D9 (hardened), whose `--ask <key\|all>` flag is the opt-in question and whose `policy.stops` block carries each stop's answer; this spec builds on that post-image (`depends_on`) and adds no second mechanism. `[no-ac: ownership statement — spec 04's ACs cover the deletion]` | Two specs retiring one sheet two ways would contradict at build; spec 04 locked first and its Decisions bind. |
| D9 | `spec/commands/fanout.md`: `argument-hint` becomes `"[<spec path>…] [--batch <ids\|all>] [--include-fixes] [--override-serial] [--ask <key\|all>]"`; § Input drops the `--lanes N` bullet, gains `--batch <ids\|all>` (the veto of the derived batch; ids are spec stems or paths), and its bare-invocation sentence becomes `With none, the driver derives the batch — the queue's startable specs in order, stopping before a spec that touches a pipeline self-surface (policy.fanout.selfSurfaces), a critical spec sharing a § Risk Tiers file with an unmerged lane, a dependency the batch cannot meet, or a planning item — prints it as one 📌 Auto-picked batch line, and runs it to the end; the next bare run after --mark reported starts the next batch`; § Rules gains `Four lanes run at once — a resource constant, not a flag`, `A fix the batch's own lanes queued (after-spec a member) joins the batch once that member merges; --include-fixes adds the fixes that existed before the run`, `A spec whose lane stopped in this run is never re-admitted — resume it by hand or start the next batch`, and `A merge-ready lane lands before any new lane is dispatched`; the `--include-fixes` bullet reads `pre-existing red-CI and queued /spec:fix items become one serial fix group after the run lanes (fixes born of the batch join without the flag)`. The Rules also name `policy.fanout.overlapExempt` in one sentence (`two briefless specs that share only overlapExempt paths run in parallel`). `tests/consistency/prose-pins.test.js`'s fanout.md pin lists `--batch`, `--include-fixes`, `--override-serial` and no `--lanes`; `tests/consistency/policy-readers.test.js` gains one pin: fanout.md names `policy.fanout.selfSurfaces` and `policy.fanout.overlapExempt` (AC-20261103-06-24, AC-20261103-06-25) | The command text is what the session follows; every policy key has a prose reader naming it (spec 20261029/09's rule). |
| D10 | Queue-side origin, trigger and batch fields for born work are deferred to spec 20261103/08 (`depends_on` this spec), queued as q27; until it lands, D5's `after.spec` rule is the admission test and nothing here reads an origin field. `[no-ac: deferral — q27 carries the work]` | The parent asked for the queue-side fields as their own spec; the conservative rule is correct without them and strictly widens when they arrive. |
| D11 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming the derived batch, the File Plan parallel rule with its exempt paths, `policy.fanout`, born fixes and the retired `--lanes` flag. `[no-ac: plugin-bump.js --check in the gate is the oracle]` | Pipeline rules § Planning version-bump discipline. |
| D12 | Existing fan-out pins are re-hosted, never weakened: AC-20261102-03-5 (PLAN now tables the derived batch — `06-y` waiting beside `03-x`/`04-z` — and prints the 📌 line), AC-20261102-03-7's `--lanes` case (now the refusal), `--override-serial` case (no `--lanes 4`) and `--include-fixes` case (run lanes `L1`–`L3`), AC-20261102-03-18 (planned with `--spec`) are rewritten in place in `tests/fanout/fanout-driver.test.js`; `tests/fanout/fixture.js` gains the opts and exports the fixture row names. `[no-ac: test-maintenance rows; each pin is named in the File Plan]` | The default changed; the invariant each pin guards did not. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-status.js | MODIFY | scripts | `pairSerialReason`, `shownFiles`, the exempt set via `policy(root).fanout.overlapExempt` + `pipelineRules`, the annotation loop without the `top.brief` gate, `laneAdmission`'s clash via the pair rule, `fixes[].after` (D1, D2); no dependency change |
| spec/scripts/lib/host-config.js | MODIFY | scripts | `POLICY_DEFAULTS.fanout`, merge and validate (D3) |
| spec/scripts/fanout-driver.js | MODIFY | scripts | batch derivation and the 📌 line, `--batch`, `LANE_CAP`, `--lanes` removed, `rolling` promotes and appends born fixes, REPORT after admission with the batch lines, the state order (D4–D7); header usage line and `Does NOT` paragraph updated |
| spec/templates/grounding-contract.md | MODIFY | doctrine | § Policy `fanout` block, enums, semantics — the one contract edit (D3) |
| spec/commands/fanout.md | MODIFY | doctrine | argument-hint, § Input batch sentence and `--batch` bullet, § Rules four lines and the policy sentence (D9) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D11) |
| .claude/spec.config.json | MODIFY | other | `contractHash` restamped over the edited contract (D3) |
| tests/spec-status.test.js | MODIFY | tests | AC-20261103-06-1, AC-20261103-06-2, AC-20261103-06-3, AC-20261103-06-4, AC-20261103-06-5 (reuse, retagged), AC-20261103-06-6; `lanesHost`'s `extraSpecs` accepts `{ fm, body }` like `host()` and takes an optional `config` object written to `.claude/spec.config.json` |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20261103-06-5 (reuse, retagged in the title) |
| tests/host-config/policy-block.test.js | MODIFY | tests | AC-20261103-06-7 |
| tests/host-config/contract-keys.test.js | MODIFY | tests | AC-20261103-06-8 |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20261103-06-8 (reuses the contractHash restamp pin, retagged in its title) |
| tests/fanout/fanout-driver.test.js | MODIFY | tests | AC-20261103-06-9 … AC-20261103-06-23; AC-20261102-03-5, AC-20261102-03-7 (three cases), AC-20261102-03-18 rewritten in place (D12) |
| tests/fanout/fixture.js | MODIFY | tests | `writeSpec(root, stem, brief, status, { fm, body })` exported; opts `blocked` (`08-k` hardened, brief 35, `depends_on: [specs/20261102/03-x.md]`), `draft` (`08-p` draft, brief 35), `selfSurface` (`08-s` hardened, brief 35, File Plan row `spec/scripts/fanout-driver.js`), `critical` (`.claude/rules/spec-pipeline.md` with `## Risk Tiers` naming `` `src/db.js` ``, config `pipelineRules`, `03-x` File Plan `src/db.js`, `08-c` hardened critical brief 35 File Plan `src/db.js`), `bornFix` (queue item `q108` lane fix `after: { spec: 'specs/20261102/03-x.md' }` and `q109` lane fix `after: { spec: 'specs/20261102/01-base.md' }` with `01-base` done) |
| tests/consistency/prose-pins.test.js | MODIFY | tests | AC-20261103-06-24 |
| tests/consistency/policy-readers.test.js | MODIFY | tests | AC-20261103-06-25 |

## Contracts

`spec-status.js` (module-private, one derivation):

```js
pairSerialReason(a, b)   // a, b: deriveNext entries
//  both briefed               -> briefSerialReason(a.brief, b.brief)        (string | null)
//  else both ≥1 File Plan row -> null | 'File Plan overlap: <p1>, <p2> (+n more)'   (exempt paths removed first)
//  else                       -> undefined  (no claim; parallel stays null)
shownFiles(paths)        // 'a' | 'a, b' | 'a, b (+3 more)' — shared by the 🔶 line and the reason
exempt set = policy(root).fanout.overlapExempt globs ∪ { readConfig(root).pipelineRules }
```

`--next --json` entry (keys unchanged): `parallel: true | false | null`, `parallel_reason: string | null`.
`--lanes --json`: `lanes[]` keys unchanged; `fixes[]` = `{ action, path, note, queue_id, after }` with
`after` the queue item's `after.spec` path or `null`.

`policy.fanout` (host config, `spec/templates/grounding-contract.md` § Policy):

```json
"fanout": {
  "selfSurfaces": ["spec/scripts/fanout-driver.js", "spec/scripts/spec-build-driver.js",
                   "spec/scripts/spec-review-driver.js", "spec/scripts/pending-question.js",
                   "spec/scripts/merge-back.sh", "spec/scripts/lib/**", "spec/scripts/*-gate.*",
                   "spec/hooks/**", "spec/bin/**"],
  "overlapExempt": ["README.md", "**/.claude-plugin/plugin.json", ".claude-plugin/marketplace.json",
                    "spec/doctrine/core.md", "spec/doctrine/design.md"]
}
```

`fanout-driver.js`:

```
fanout-driver.js [--root <dir>] [--spec <path>]… [--batch <id>[,<id>…]|all] [--include-fixes] [--override-serial] [--ask <key|all>] [--state]
LANE_CAP = 4                       // concurrent lanes; dispatchable's cap
state file:  batch: { members: [<spec path>…], stopBefore: { path, reason } | null, by: 'derived' | 'batch-flag' | 'spec-flags' }
PLAN line:   📌 Auto-picked batch: <stem>, <stem> — stops before <stem> (<reason>) (veto: --batch <ids|all>)
             📌 Auto-picked batch: <stem>, <stem> — the whole queue (veto: --batch <ids|all>)
reasons:     touches pipeline self-surface <path> · self-surface runs alone · critical: shares Risk Tiers path <path> with <stem>
             · blocked: <first blocker> · <action> item heads the queue
REPORT:      warns  'batch stopped before <stem> — <reason>; the next bare run starts the next batch'
             bullet '<action> @<path> heads the queue — <reason>; run it attended'   (first, (d) only)
lane ids:    L1, L2, … at PLAN; F1, F2, … continue from the highest F-number on every append
exit 2:      --lanes (unknown argument; usage names --batch) · --batch <id> matching no unblocked /spec:run entry or more than one spec
deriveState: PLAN · (red: pending ? RELAY : MERGE_RED) · RELAY · MERGE · DISPATCH · WAIT · REPORT
```

## Behavior

A bare run derives the batch by walking `--next --json` in queue order. On the fixture (`03-x`, `06-y`
on brief 32; `04-z` on brief 33; `08-s` on brief 35 with a File Plan row `spec/scripts/fanout-driver.js`)
the walk admits `03-x` (lane), `06-y` (serialized: shared brief 32 → `waiting`), `04-z` (lane) and
stops before `08-s`: `📌 Auto-picked batch: 03-x, 06-y, 04-z — stops before 08-s (touches pipeline
self-surface spec/scripts/fanout-driver.js) (veto: --batch <ids|all>)`. The table is L1 `03-x`
planned, L2 `06-y` waiting, L3 `04-z` planned; `--mark planned` admits it and DISPATCH prints L1 and L3.
When L1 merges green with `03-x` done on main, the mark's own query promotes L2 to `planned`; with the
`bornFix` opt it also appends F1 `fix/q108` (q108 is `after` `03-x`), while q109 (`after` the done
`01-base`, never a lane here) is left for `--include-fixes` or a later batch. F1 is dispatched only once
every run lane is terminal. When every lane is terminal and nothing is promotable or born, REPORT
prints with the warn `batch stopped before 08-s — touches pipeline self-surface
spec/scripts/fanout-driver.js; the next bare run starts the next batch`; `--mark reported` deletes
the state, and the next bare run derives the next batch: `08-s` at the head is the whole batch
(`self-surface runs alone`).

Ordering: a pending question is relayed before anything else; a merge-ready lane lands next; then
planned lanes are dispatched up to four; WAIT while lanes run. A red main after a merge still freezes
dispatch and merges until `--mark gate-repaired` is green, and the query after that repair sees the
repaired main.

Briefless example: `08-a`, `09-b`, `10-c` hardened with no brief; `08-a` rows `src/a.js`,
`README.md`; `09-b` rows `src/b.js`, `src/shared.js`, `README.md`; `10-c` rows `src/c.js`,
`src/shared.js`. `README.md` is exempt, so `--next --json` marks `09-b` and `10-c` parallel `true`
against the top pick `08-a`; `--lanes --json` admits `lanes` = [`08-a`, `09-b`] and serializes
`10-c` with `File Plan overlap: src/shared.js` because pairwise admission checks it against `09-b`
too; the dashboard's 🔶 line for the two lanes still names `README.md`.

## Acceptance Criteria

- **AC-20261103-06-1**: WHEN `--next --json` runs on a host with no briefs and two hardened specs
  `specs/20260701/01-a.md` (File Plan rows `src/a.js`, `tests/a.test.js`, `README.md`) and
  `specs/20260701/02-b.md` (rows `src/b.js`, `tests/b.test.js`, `README.md`) THE SYSTEM SHALL print
  `next[1].parallel === true` and `next[1].parallel_reason === null` (the shared `README.md` is exempt
  by the plugin default), with `next[0].parallel` still `null` and the entry keys unchanged → writes
  tests/spec-status.test.js
- **AC-20261103-06-2**: WHEN the same host's `02-b.md` rows are `src/a.js`, `src/shared.js`,
  `lib/x.js`, `lib/y.js`, `.claude/rules/pipe.md` while `01-a.md` rows are `src/a.js`, `src/shared.js`,
  `lib/x.js`, `lib/y.js`, `.claude/rules/pipe.md`, `tests/a.test.js` and `.claude/spec.config.json`
  declares `pipelineRules: ".claude/rules/pipe.md"` THE SYSTEM SHALL print `next[1].parallel === false`
  and `next[1].parallel_reason === 'File Plan overlap: src/a.js, src/shared.js (+2 more)'` (the rules
  file is exempt; first two shared paths in `01-a.md`'s order, then the count), and WHEN the config
  instead declares `policy: { fanout: { overlapExempt: ['lib/**', 'src/shared.js'] } }` THE SYSTEM
  SHALL print `parallel_reason === 'File Plan overlap: src/a.js'` → writes tests/spec-status.test.js
- **AC-20261103-06-3**: WHEN the top pick carries `brief: 02` and a runner-up carries `brief: n/a`
  with a File Plan disjoint from the top pick's THE SYSTEM SHALL mark that runner-up `parallel: true`
  (e.g. `specs/20260710/05-adhoc.md` with rows `docs/x.md` beside a top pick with rows
  `src/billing.js` → `parallel: true`), and WHEN a runner-up has no File Plan section at all THE SYSTEM
  SHALL leave it `parallel: null` → writes tests/spec-status.test.js
- **AC-20261103-06-4**: WHEN `--lanes --json` runs on a host with three briefless hardened specs
  `specs/20261102/08-a.md` (rows `src/a.js`, `README.md`), `specs/20261102/09-b.md` (rows `src/b.js`,
  `src/shared.js`, `README.md`), `specs/20261102/10-c.md` (rows `src/c.js`, `src/shared.js`) THE
  SYSTEM SHALL print `lanes` paths `['specs/20261102/08-a.md', 'specs/20261102/09-b.md']` and
  `serialized` exactly `[{ path: 'specs/20261102/10-c.md', brief: null, reason: 'File Plan overlap:
  src/shared.js' }]`, with the keys of `lanes[0]` and of the top-level object unchanged, and the bare
  dashboard SHALL print a `🔶` line naming `README.md` for the two lanes → writes
  tests/spec-status.test.js
- **AC-20261103-06-5**: WHEN a briefless runner-up has no File Plan rows THE SYSTEM SHALL CONTINUE TO
  print `parallel: null` under `--next --json` (e.g. `specs/20260701/02-b.md` with frontmatter only →
  `null`) and SHALL CONTINUE TO render one shared `🤷 no brief — parallelism unknown` branch under
  `--all` for a run of such entries
  → reuses tests/spec-status.test.js :: --next makes no parallel claim
- **AC-20261103-06-6**: WHEN `--lanes --json` runs with queue items `q107` (lane fix, no `after`) and
  `q108` (lane fix, `after: { spec: 'specs/20261102/03-x.md' }`) plus a red-CI escape THE SYSTEM SHALL
  print `fixes` entries whose keys are exactly `action, path, note, queue_id, after` with `after` ===
  `null` for q107 and the escape and `after === 'specs/20261102/03-x.md'` for q108 → writes
  tests/spec-status.test.js
- **AC-20261103-06-7**: WHEN `policy(root)` reads a config with no `fanout` key THE SYSTEM SHALL return
  `fanout.selfSurfaces` containing `spec/scripts/fanout-driver.js` and `fanout.overlapExempt`
  containing `**/.claude-plugin/plugin.json`; WHEN the block is `{ fanout: { overlapExempt: ['docs/**'] }
  }` THE SYSTEM SHALL return `overlapExempt === ['docs/**']` and the default `selfSurfaces`; and
  `validatePolicy({ fanout: { selfSurfaces: 'x', other: 1 } })` SHALL return exactly
  `['fanout.selfSurfaces: expected an array of non-empty strings', 'unknown key fanout.other']` →
  writes tests/host-config/policy-block.test.js
- **AC-20261103-06-8**: WHEN `spec/templates/grounding-contract.md` § Policy is read THE SYSTEM SHALL
  carry `"fanout"` with `selfSurfaces` and `overlapExempt` inside its JSON block, both names in the
  Enums paragraph, and `.claude/spec.config.json`'s `contractHash` SHALL equal `spec-paths
  contract-hash`'s output (e.g. the stamp changes with the edit and the pin compares the two) →
  rewrites tests/host-config/contract-keys.test.js :: AC-20261101-07-1
- **AC-20261103-06-9**: WHEN a bare run (no `--spec`, no `--batch`) plans the fixture with opt
  `selfSurface` THE SYSTEM SHALL print `📌 Auto-picked batch: 03-x, 06-y, 04-z — stops before 08-s
  (touches pipeline self-surface spec/scripts/fanout-driver.js) (veto: --batch <ids|all>)` before the
  table, table `[['L1','specs/20261102/03-x.md','planned'], ['L2','specs/20261102/06-y.md','waiting'],
  ['L3','specs/20261102/04-z.md','planned']]` with L2's `waitingOn === 'shared brief 32'`, and write
  `batch === { members: [S03, S06, S04], stopBefore: { path: 'specs/20261102/08-s.md', reason: 'touches
  pipeline self-surface spec/scripts/fanout-driver.js' }, by: 'derived' }` → writes
  tests/fanout/fanout-driver.test.js
- **AC-20261103-06-10**: WHEN the fixture has opts `selfSurface` and `blocked` and `03-x`, `06-y`,
  `04-z` are done on main so `08-s` heads the queue THE SYSTEM SHALL table `08-s` alone as L1 and print
  `📌 Auto-picked batch: 08-s — stops before 08-k (self-surface runs alone) (veto: --batch <ids|all>)`,
  and WHEN only opt `selfSurface` is set under the same done specs THE SYSTEM SHALL print `📌 Auto-picked
  batch: 08-s — the whole queue (veto: --batch <ids|all>)` → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-06-11**: WHEN the fixture has opt `critical` (rules file § Risk Tiers naming
  `` `src/db.js` ``, `03-x` and the critical `08-c` both planning `src/db.js`) THE SYSTEM SHALL stop
  the batch before `08-c` with reason `critical: shares Risk Tiers path src/db.js with 03-x`, and WHEN
  the rules file has no `## Risk Tiers` section THE SYSTEM SHALL admit `08-c` as a member → writes
  tests/fanout/fanout-driver.test.js
- **AC-20261103-06-12**: WHEN the fixture has opt `blocked` THE SYSTEM SHALL stop before `08-k` with
  reason `blocked: specs/20261102/03-x.md (hardened)`, and WHEN it has opt `draft` THE SYSTEM SHALL
  stop before `08-p` with reason `/spec:plan item heads the queue` → writes
  tests/fanout/fanout-driver.test.js
- **AC-20261103-06-13**: WHEN the driver runs with `--batch all` on the fixture with opts
  `selfSurface` and `blocked` THE SYSTEM SHALL table `03-x`, `06-y`, `04-z`, `08-s` (and not `08-k`)
  with `batch.stopBefore === null` and `by === 'batch-flag'`; WHEN it runs with `--batch 04-z,03-x`
  THE SYSTEM SHALL table exactly L1 `04-z`, L2 `03-x`; and WHEN it runs with `--batch nope` THE SYSTEM
  SHALL exit 2 with stderr containing `--batch nope matches no startable spec` → writes
  tests/fanout/fanout-driver.test.js
- **AC-20261103-06-14**: WHEN the driver runs with `--lanes 1` THE SYSTEM SHALL exit 2 with stderr
  containing `unknown argument --lanes` and `--batch`, and write no state file → rewrites
  tests/fanout/fanout-driver.test.js :: AC-20261102-03-7: --lanes
- **AC-20261103-06-15**: WHEN a bare plan on the fixture with opt `bornFix` has L1 `03-x` merged green
  with `03-x` done on main THE SYSTEM SHALL append `F1` with `['fix', 'fix/q108', 'q108', 'planned']`
  as `[kind, branch, queueId, state]`, append nothing for `q109`, and SHALL promote L2 `06-y` to
  `planned` in the same mark → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-06-16**: WHEN F1 is already in the table and a later green merge of L3 `04-z` runs
  `rolling` THE SYSTEM SHALL leave exactly one lane with `queueId === 'q108'`, and WHEN every run lane
  is terminal THE SYSTEM SHALL print `## Step: dispatch 1 lanes` naming `fix q108` → writes
  tests/fanout/fanout-driver.test.js
- **AC-20261103-06-17**: WHEN a run was planned with `--spec specs/20261102/03-x.md --spec
  specs/20261102/06-y.md` and L1 `03-x` stopped THE SYSTEM SHALL CONTINUE TO reach REPORT with the
  bullet `specs/20261102/06-y.md: not started — waited on specs/20261102/03-x.md, which stopped` and
  SHALL CONTINUE TO table no lane for `04-z` → reuses tests/fanout/fanout-driver.test.js ::
  AC-20261102-03-22: a waiting
- **AC-20261103-06-18**: WHEN a bare plan on the fixture with opt `selfSurface` reaches REPORT with
  L1 `03-x` merged, L2 `06-y` returned `--stopped "worker gone"` and L3 `04-z` merged THE SYSTEM SHALL
  write `warns` containing `batch stopped before 08-s — touches pipeline self-surface
  spec/scripts/fanout-driver.js; the next bare run starts the next batch`, and after `--mark reported`
  the next bare run SHALL print `state: PLAN` and `📌 Auto-picked batch: 06-y — stops before 08-s
  (touches pipeline self-surface spec/scripts/fanout-driver.js) (veto: --batch <ids|all>)` (the stopped
  spec is startable again in a new batch) → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-06-19**: WHEN a run planned with `--spec specs/20261102/03-x.md --spec
  specs/20261102/04-z.md` has L1 merged (gate green) and L2 stopped on a dismissed question THE SYSTEM
  SHALL print `## Step: report` with `outcome.text === 'fan-out finished with stops — 1 merged, 1
  stopped'`, bullets `['specs/20261102/03-x.md: merged (gate green)', 'specs/20261102/04-z.md:
  stopped — question dismissed']` and no `batch stopped` warn → rewrites
  tests/fanout/fanout-driver.test.js :: AC-20261102-03-18
- **AC-20261103-06-20**: WHEN a bare plan with `--override-serial` tables L1 `03-x`, L2 `06-y`, L3
  `04-z` all planned, only L1 and L3 are dispatched, and L1 returns merge-ready THE SYSTEM SHALL print
  `## Step: merge L1` on the next bare run and no `## Step: dispatch` line, and `--state` SHALL print
  `MERGE` → writes tests/fanout/fanout-driver.test.js
- **AC-20261103-06-21**: WHEN a merged fix lane's gate is red and another fix lane is planned THE SYSTEM
  SHALL CONTINUE TO print `## MERGE_RED — main gate red after F1` on that mark and never
  `## Step: dispatch` → reuses tests/fanout/fanout-driver.test.js :: fanout: a red
- **AC-20261103-06-22**: WHEN `--mark merged --lane L1` runs on a merged branch THE SYSTEM SHALL
  CONTINUE TO run the host gate with the main root as cwd (`.gate-cwd` holds the root path), log it
  under `spec-fanout/L1.gate.log` and record `gate: 'green'`, state `merged` → reuses
  tests/fanout/fanout-driver.test.js :: AC-20261102-03-16: --mark
- **AC-20261103-06-23**: WHEN the gate is red after a merge and another lane is pending on a question
  THE SYSTEM SHALL CONTINUE TO print `state: RELAY` and no `## MERGE_RED` on the next bare run, and
  SHALL CONTINUE TO refuse `--mark merged` for a merge-ready lane with stderr naming `gate-repaired` →
  reuses tests/fanout/fanout-driver.test.js :: AC-20261102-03-17: with
- **AC-20261103-06-24**: WHEN `tests/consistency/prose-pins.test.js` reads `spec/commands/fanout.md`
  THE SYSTEM SHALL find `--batch`, `--include-fixes` and `--override-serial` named in it and no
  `--lanes` (e.g. the flag list `['--batch', '--include-fixes', '--override-serial']` all present,
  `/--lanes\b/` absent) → rewrites tests/consistency/prose-pins.test.js :: fanout.md
- **AC-20261103-06-25**: WHEN `tests/consistency/policy-readers.test.js` reads `spec/commands/fanout.md`
  THE SYSTEM SHALL find `policy.fanout.selfSurfaces` and `policy.fanout.overlapExempt` named in its
  § Input or § Rules text (e.g. both literals present) → writes tests/consistency/policy-readers.test.js

## Assumptions (escalation triggers)

- A1: Executed check — `node spec/scripts/spec-status.js --root . --lanes --json` on this checkout
  prints one lane (`specs/20261103/03-workers-never-run-git.md`) and lists `04-…` and `05-…` under
  `serialized` with `queued behind the top pick`; `--next --json` prints `parallel: null` for all
  three briefless entries — the root cause is as stated. **If false:** the parallel annotation already
  covers briefless entries; drop D1's loop change and keep D2.
- A2: Executed check — `briefSerialReason(null, null)` evaluates to `shared brief null` (the `a === b`
  arm), so `laneAdmission`'s clash check must route through D1's pair rule. **If false:** D2's wording
  still holds; only its rationale sentence is dropped.
- A3: Executed check — `parseFilePlan` over this checkout's hardened specs gives `03 ∩ 04 =
  [spec-build-driver.js, core.md, plugin.json, pending-question.test.js]`, `03 ∩ 05 = [core.md,
  spec-pipeline.md, plugin.json]`, `04 ∩ 05 = [core.md, plugin.json]`: with D3's default exempt set
  plus the rules file, `04 ∩ 05` is empty (parallel) while `03 ∩ 04` keeps two real paths (serial).
  **If false** (a host's ceremony paths differ): the host edits `policy.fanout.overlapExempt`; the
  default list is a starting point, never a rule.
- A4: `tests/fanout/fixture.js` on spec 04's post-image carries no `h.standing`, `h.dispatchedPair`
  plans and dispatches only, and `--mark planned` moves `--state` to DISPATCH. **If false** (spec 04
  not merged when this builds): the build is blocked by `depends_on`; never build on the pre-image.
- A5: `spec-status --lanes --json`'s `fixes` includes queue prompt entries whose `after` gate is still
  unmet (the `fixes` map reads `all`, blockers ignored), so a born fix is visible to `rolling` as soon
  as it is queued and the driver alone decides when its bearing lane has merged. **If false:** add
  `ready` beside `after` and admit on `ready === true`; one more key, same D2 row.
- A6: The queue file lives in `<git-common-dir>/spec-queue.json`, shared by every linked worktree, so
  an item a lane queues is read by the parent's next query without a merge. **If false:** born fixes
  are visible only after the lane merges — D5's rule still admits them then, one landing later.
- A7: No `/spec:run` lane in this fixture is both the head and a `/spec:plan` entry; `deriveNext`
  sorts blocked entries last and `/spec:plan` drafts after hardened specs, so (c) and (d) boundaries
  are met only after every startable `/spec:run` entry ahead of them (`grep -n "rank" spec-status.js`:
  draft rank 2, hardened 1, implementing 0; blockers sort first). **If false:** the walk still stops
  at the first boundary in the order the script prints; the batch is shorter, never wrong.
- A8: No test outside the File Plan asserts DISPATCH while a lane is `merge-ready` or `pending`
  (`grep -n "dispatch" tests/fanout/fanout-driver.test.js` shows every DISPATCH assertion on a table
  with no merge-ready or pending lane). **If false:** the hit is a D7 collision; enter it as a fix
  row, update the assertion in place and retag, never weaken it.

## Rationale

The fan-out was built as one wave: `plan()` tables what is startable once, `rolling()` only promotes
lanes already tabled as `waiting`, and REPORT fires when the table empties — so a queue of five specs
needed five human pastes. The user's feedback (memory `fanout-runs-until-queue-empty`) is explicit:
fan-out is automation; it stops only for a relayed question, a red main or an empty queue. The merge
queue is the model: bors, tide and the GitHub merge queue re-form the queue after each landing with
batch size as config and a human on red only — which is D4's derived batch plus D5's promotion.

The batch is derived, never asked. An up-front "short / medium / long" picker was considered and
rejected under the Question Style doctrine and memory `never-re-ask-answered-questions`: the right
answer is the same every time — run everything up to the first thing a person must look at. The four
boundaries are those things: a spec rewriting the pipeline's own driver (bootstrap rule — never
upgrade the runner inside the job; a self-surface spec at the head therefore runs alone so the next
batch starts on the new runner), a critical spec sharing a Risk Tiers file with a lane still in flight
(the conflict would land on an irreversible surface), a dependency this batch cannot meet, and a
planning item (the planner is attended). `--batch` is the one veto; `--spec` stays because spec 03's
contract and tests pin it, and `--batch <ids>` is its stem-spelled twin.

D1's exempt set exists because of A3: every spec in this repo bumps `plugin.json` and most touch
`core.md`, so strict disjointness would serialize everything, which is slower than the user asked for
without being safer. The exempt paths are still reported by the 🔶 heads-up — the merge-back conflict
on `plugin.json` is real and the parent repairs it at MERGE; what the exemption removes is the
*decision* that those paths alone make two specs serial. A spec with no File Plan rows makes no claim
(null), so the three existing `parallelism unknown` pins stay green and the dashboard never guesses
from an empty table.

Born fixes (D5) follow Buildkite's dynamic upload: a step the job itself queues joins the job. Without
spec 08's origin field the only honest signal is `after.spec` naming a member lane, which is why depth
is one and a fix with no `after` (the MERGE_RED repair, a hand-queued item) waits for `--include-fixes`
or the next batch.

D7 reorders two states. With promotion after each landing, a lane dispatched before a pending merge
would branch from a main about to move; landing first is the bors rule and what the user wrote (the
gate after every merge, red outranking dispatch). A pending question stays first — an answer can end
a lane and change what the next query sees.

D8 records that PREFLIGHT's deletion was already locked in spec 04 with a different mechanism
(`policy.stops`, lane-side picks, `--ask`); this spec depends on it and adds nothing beside it.

Collision closure (lock-time, advisory): every literals-leg hit lands in the File Plan except six
waived as unrelated contexts — `docs/roadmap/32-one-session-runs-the-lanes.md` and
`docs/roadmap/33-every-question-is-a-driver-stop.md` (roadmap prose; `--lanes` and `shared brief`
as words), `docs/canonical/status.md` (its `--lanes --json` is spec-status's mode, which this spec
keeps), `tests/genesis/tournament.fixtures.js` (`shared brief` in prose about briefs),
`spec/scripts/spec-review-driver.js` (`Step: dispatch` is its own worker step) and
`spec/scripts/decision-lint.js` (`queue_id` in its own queue read). The executes-tier hits on
`lib/host-config.js` and `spec-status.js` outside the plan (`tests/status/*`, `tests/queue/*`,
`tests/review/*`, `tests/build/*`, `tests/frontmatter/*`, `tests/ceiling/*`, `tests/init/*`) read a
policy block that only gains a defaulted key and host no briefless spec with a File Plan beside
another, so D1 and D3 change nothing they observe; the build's whole-suite check adjudicates.

## Canonical Delta

`docs/canonical/status.md`, the `--lanes --json` paragraph: append — "Parallelism between two
entries is one derivation, `pairSerialReason`: briefed pairs by brief (shared brief, dependency
path); any pair with a briefless side by File Plan — disjoint plans are parallel, overlapping ones
serialize with `File Plan overlap: <paths>`, where the host's `policy.fanout.overlapExempt` globs and
its pipeline rules file never count; a side with no File Plan rows makes no claim. The 🔶 heads-up
keeps reporting raw overlap. `fixes[]` carries `after`, the queued item's after-spec path or null.
(specs/20261103/06-the-fan-out-drains-the-queue.md)"

`docs/canonical/pipeline.md`, the `/spec:fanout` paragraph: replace the sentence after the driver's
state file with — "a bare run derives the batch (the queue's startable specs in order up to the first
self-surface spec per `policy.fanout.selfSurfaces`, critical spec sharing a § Risk Tiers file with an
unmerged lane, blocked entry or planning item), prints it as one `📌 Auto-picked batch` line
(`--batch <ids|all>` is the veto, four lanes run at once), re-queries `spec-status --lanes --json`
after every green merge, green repair and lane end to dispatch waiting members and the fixes the
batch's own lanes queued after a member, and reports when the batch is done; the next bare run starts
the next batch. A pending question, then a merge-ready lane, outrank a new dispatch; a red main
outranks both. (specs/20261103/06-the-fan-out-drains-the-queue.md)"
