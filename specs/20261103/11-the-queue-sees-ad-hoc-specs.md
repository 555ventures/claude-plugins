---
date: 2026-11-03
status: implementing
tier: critical           # spec/scripts/verdict.js changes how --briefs reaches the release ledger row (§ Risk Tiers: verdict.js is a trigger)
area: pipeline
breaking: false
depends_on: [specs/20261103/06-the-fan-out-drains-the-queue.md]
brief: n/a
open_markers: 0
diff_base: 0f1e8700fb0e365ea07e144caec143e22864a59d
---

# The queue sees ad-hoc specs

## Goal

Two ad-hoc gaps close. The session queue stops reporting "queue empty — nothing left undone" and
"nothing pending" while hardened or implementing ad-hoc (`brief: n/a`) specs are open: the queue's
reconcile seeds every open ad-hoc spec as a `spec` item, in specs/ file order after the briefs, so
`spec-queue next` and `list` name the open work. And a release's `--briefs` stops dropping a
letter-suffixed brief id such as `04a` silently from the ledger row: `NN` and `NNa` are both
recorded, and any other token is a usage error naming it. Done means a host with two hardened
ad-hoc specs and no briefs gets a non-empty queue on the first `spec-queue next`, and
`--briefs 04,04a` ledgers both ids.

## Users

- The maintainer running the pipeline on a repo of ad-hoc specs: When I ask the queue what is next while hardened ad-hoc specs are open, I want it to name them, so I can start the work instead of being told nothing is left. First run / empty: with no queue file, the first `spec-queue next` seeds the open ad-hoc specs and prints one summary line naming how many briefs and specs it seeded.
- The maintainer recording a release: When I pass the shipped brief ids to the release record, I want a letter-suffixed id like 04a kept in the ledger row and a typo refused, so I can trust the row names every brief that shipped. First run / empty: with no `--briefs`, the row carries no `briefs` key, as today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/queue.js` gains `reconcileMissingSpecs(items, openSpecs)` beside `reconcileMissingBriefs`: for every path in `openSpecs` (given in order) not already present as a `kind:'spec'` item, APPEND `{ id: null, kind: 'spec', spec: <path> }` at the very end; returns `{ items, inserted }` as new arrays, never mutating `items`; exported. `reconcileMissingBriefs` is unchanged (AC-20261103-11-1, AC-20261103-11-2) [asked: user pre-decided 2026-11-03 — seeded ad-hoc specs use the existing spec item kind with the spec path] | The `spec` item kind, its doneness (`isItemDone`: done, superseded or absent) and its `--next` position override already exist; only the placement step is missing. A second function keeps spec-status.js's call to `reconcileMissingBriefs` byte-identical. |
| D2 | `spec/scripts/spec-queue.js` `reconciledItems` (append mode — every subcommand) runs `reconcileMissingSpecs` AFTER `reconcileMissingBriefs`, with the open ad-hoc specs = `spec-status --json`'s `specs` entries whose `brief` is `null` and whose `status` is not `done`, as paths sorted ascending (specs/ file order). A done spec is never seeded; a superseded spec never appears in `specs`; a spec carrying a brief is never seeded as a spec item (its brief item covers it). The header comment gains one sentence: an open ad-hoc spec is appended last, after the missing briefs, like a landed brief (AC-20261103-11-1, AC-20261103-11-2, AC-20261103-11-3) [asked: user pre-decided 2026-11-03 — after every seeded brief, in specs/ file order, a done spec never seeded] | The bug is that the reconcile only knows briefs, so a repo of ad-hoc specs has an empty queue while `spec-status --next` names work. Appending on every reconcile, not only at first seed, is the same rule a landed brief already follows. |
| D3 | The first-seed summary line `next` prints when no queue file existed becomes exactly `seeded queue with <N> briefs, <M> specs` — N the seeded `brief` items, M the seeded `spec` items; the `(roadmap order)` tail goes. Still printed once (AC-20261103-11-1, AC-20261103-11-4) [asked: user pre-decided 2026-11-03 — the line becomes "seeded queue with N briefs, M specs"] | A seed of specs reported as "0 briefs" reads as an empty seed. |
| D4 | `spec-queue add <spec path>` excludes its own payload path from that run's ad-hoc seeding, so an open ad-hoc spec that is not yet persisted in the queue file is placed where `--top`/`--at`/default put it instead of being refused as `already queued`; a spec already persisted in the queue file is still refused with the existing `spec-queue move` remedy (AC-20261103-11-5) | Without it, D2's virtual append makes every `add <ad-hoc spec> --top` refuse — the queue's one way to say "this fix goes first" would be gone. |
| D5 | `spec/scripts/verdict.js` validates `--briefs` at argument-parse time, before the manifest is read, whatever the profile: the value is split on `,`, each token trimmed, and a token is accepted iff it matches `/^\d+[A-Za-z]?$/` (the NN/NNa id spelling of spec-status.js's `normBrief`/`briefOrd`). The first token that does not match — including an empty token from `04,,05` — exits 2 with stderr `verdict.js: --briefs token "<token>" is not a brief id — pass NN or NNa ids, comma-separated (e.g. --briefs 04,04a)`, and nothing on stdout. On a valid list the release row's `briefs` keeps a plain-digit token as its number (`04` → `4`, `12` → `12`, unchanged) and records a lettered token as `normBrief` of it (`04a` → `"04a"`, `4A` → `"04a"`), reusing `normBrief` from `lib/queue.js`. The header's `Exit codes:` 2 entry names the `--briefs` refusal (AC-20261103-11-6, AC-20261103-11-7, AC-20261103-11-8) [asked: user pre-decided 2026-11-03 — NN or NNa accepted, anything else a usage error naming the token, never a silent drop] | `Number('04a')` is `NaN`, so the old filter dropped the id with no word. Keeping digits as numbers leaves every existing release row and both existing pins byte-identical; a lettered id has no number. `release-legs.js record` already forwards verdict.js's stderr and exit, and appends no row when stdout is empty, so a refused token writes no ledger row. |
| D6 | `spec/commands/release.md` Step 1's `--briefs {shipped brief numbers, comma-separated}` placeholder becomes `--briefs {shipped brief ids (NN or NNa), comma-separated}` [no-ac: wording — read by review] | The session fills this placeholder; it must know a lettered id is legal. |
| D7 | `spec/.claude-plugin/plugin.json` is bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph naming the ad-hoc queue seeding and the --briefs NNa fix>"` [no-ac: version bump — plugin-bump.js --check in the gate is the oracle] | Every behaviour change under `spec/` bumps the plugin (pipeline rules § Planning). |
| D8 | `spec/scripts/spec-status.js` and `spec/scripts/fanout-driver.js` are not touched: their `brief === null` comparisons belong to the parallel brief-discriminant spec. spec-queue.js reads `brief` from `spec-status --json` as it is shipped [no-ac: scope boundary — no code changes] | Two specs editing the same brief-null comparisons would collide at merge-back and in meaning. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/queue.js | MODIFY | scripts | `reconcileMissingSpecs` added and exported, its placement comment (D1); no dependency change |
| spec/scripts/spec-queue.js | MODIFY | scripts | `reconciledItems` seeds open ad-hoc specs after briefs, `add` excludes its own spec payload from the seed, the seed summary line, header sentence (D2, D3, D4); no dependency change |
| spec/scripts/verdict.js | MODIFY | scripts | `--briefs` token validation at parse time, NN → number / NNa → normBrief string, header `Exit codes:` 2 entry (D5); no dependency change |
| spec/commands/release.md | MODIFY | doctrine | Step 1 `--briefs` placeholder names NN or NNa ids (D6) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D7) |
| tests/queue/spec-queue.test.js | MODIFY | tests | AC-20261103-11-1, AC-20261103-11-2, AC-20261103-11-3, AC-20261103-11-4, AC-20261103-11-5 |
| tests/review/verdict.test.js | MODIFY | tests | AC-20261103-11-6, AC-20261103-11-7, AC-20261103-11-8 |

## Contracts

```js
// spec/scripts/lib/queue.js — new export
// reconcileMissingSpecs(items, openSpecs: string[]) -> { items, inserted }
//   appended item shape: { id: null, kind: 'spec', spec: 'specs/YYYYMMDD/NN-name.md' }

// spec-queue next, no queue file, two hardened ad-hoc specs, no briefs — stdout:
//   seeded queue with 0 briefs, 2 specs
//   /spec:run @specs/20261101/01-a.md

// verdict.js --profile release --ledger --briefs 04,04a  -> row.briefs: [4, "04a"]
// verdict.js ... --briefs 04,x  -> exit 2, stdout empty, stderr:
//   verdict.js: --briefs token "x" is not a brief id — pass NN or NNa ids, comma-separated (e.g. --briefs 04,04a)
```

## Behavior

Reconcile order per subcommand: dedupe → append missing on-disk non-done briefs (roadmap order) →
append missing open ad-hoc specs (path order). `list`/`groom`/`show` reconcile virtually and never
write; `next`/`add`/`move`/`done` persist. A seeded spec item has no `added` stamp (age `?`), like a
seeded brief. A ticked ad-hoc spec that is still open is re-appended on the next write, exactly as a
ticked open brief is today; to drop an ad-hoc spec for good, mark it `superseded`.

`spec-queue next`'s paste line for a spec item is still delegated to `spec-status --next`, which
now reads the persisted spec items: queue position orders them, so on a host whose ad-hoc specs
were unqueued, the top pick follows file order from the first write on (the queue is the
user's intended order; `spec-queue move` reorders it).

## Acceptance Criteria

- **AC-20261103-11-1**: WHEN `spec-queue next` runs with no queue file on a host with no roadmap
  briefs and three `brief: n/a` specs — `specs/20261101/01-a.md` hardened,
  `specs/20261101/02-b.md` implementing, `specs/20261101/03-c.md` done — THE SYSTEM SHALL exit 0,
  print `seeded queue with 0 briefs, 2 specs` followed by `/spec:run @specs/20261101/01-a.md`
  (never `✨ queue empty — nothing left undone`), and write queue items
  `[{kind:'spec',spec:'specs/20261101/01-a.md'},{kind:'spec',spec:'specs/20261101/02-b.md'}]`
  with ids `q1`, `q2` and no item for `03-c.md`; a following `spec-queue list` SHALL print two
  numbered rows `spec specs/20261101/01-a.md` and `spec specs/20261101/02-b.md` (never
  `✨ nothing pending`) → writes tests/queue/spec-queue.test.js
- **AC-20261103-11-2**: WHEN `spec-queue next` runs with no queue file on a host with roadmap brief
  `05` (unplanned), a hardened `brief: 05` spec `specs/20261101/01-x.md`, and a hardened
  `brief: n/a` spec `specs/20261101/02-y.md` THE SYSTEM SHALL write queue items in the order
  `brief 05`, `spec specs/20261101/02-y.md` — no spec item for `01-x.md` — and print
  `seeded queue with 1 briefs, 1 specs` → writes tests/queue/spec-queue.test.js
- **AC-20261103-11-3**: WHEN `spec-queue list` runs on the pending list host, whose queue file
  holds `q1` brief 24, `q2` a gated prompt and `q3` spec `06-hotfix.md` and whose unqueued
  `specs/20260903/04-reports-write-the-queue.md` is hardened with no brief THE SYSTEM SHALL print
  four numbered rows, the fourth numbered `4` with ref `—`, age `?` and description
  `spec specs/20260903/04-reports-write-the-queue.md`,
  and leave the queue file byte-identical; the empty-pending host (no open ad-hoc spec) SHALL still
  print `✨ nothing pending · 2 done` → rewrites tests/queue/spec-queue.test.js :: AC-20260903-03-8 / AC-20261013-02-9:
- **AC-20261103-11-4**: WHEN `spec-queue next` seeds a host with briefs `05`, `08`, `15` and no
  specs THE SYSTEM SHALL print the one summary line `seeded queue with 3 briefs, 0 specs` exactly
  once and write the briefs in roadmap order `['05','08','15']` → rewrites tests/queue/spec-queue.test.js :: AC-20260823-08-9
- **AC-20261103-11-5**: WHEN `spec-queue add specs/20260701/02-fix.md --top` runs on a host whose
  queue file holds only brief `05` and whose `02-fix.md` is a hardened `brief: n/a` spec not yet in
  the queue file THE SYSTEM SHALL CONTINUE TO exit 0, write `{kind:'spec',spec:'specs/20260701/02-fix.md'}`
  at index 0, and make `spec-status --next` print `🎯 Next\n/spec:run @specs/20260701/02-fix.md`
  → reuses tests/queue/spec-queue.test.js :: AC-20260903-03-1:
- **AC-20261103-11-6**: WHEN `verdict.js --profile release --ledger --milestone v1.2.3 --briefs 04,04a`
  runs over the seven green release legs THE SYSTEM SHALL print `CLEAN` and a row whose `briefs`
  is `[4,"04a"]` (and `--briefs 4A` gives `["04a"]`) → writes tests/review/verdict.test.js
- **AC-20261103-11-7**: WHEN `verdict.js` runs with `--briefs 04,x` (or `--briefs 04,,05`) THE SYSTEM
  SHALL exit 2 with empty stdout and stderr containing `--briefs token "x" is not a brief id`
  (respectively `--briefs token "" is not a brief id`) → writes tests/review/verdict.test.js
- **AC-20261103-11-8**: WHEN `verdict.js --profile release --ledger --briefs 12,13` runs over the
  seven green release legs THE SYSTEM SHALL CONTINUE TO print a row whose `briefs` is the numeric
  array `[12,13]` → reuses tests/review/verdict.test.js :: AC-20260813-02-5

## Assumptions (escalation triggers)

- A1: Executed spike (pre-image, a git host under the worktree, three `brief: n/a` specs — 01-a
  hardened, 02-b implementing, 03-c done — no briefs): `spec-queue next` printed
  `seeded queue with 0 briefs (roadmap order)` / `✨ queue empty — nothing left undone`, `list`
  printed `✨ nothing pending · 0 done`, while `spec-status --next` printed
  `/spec:run @specs/20261101/02-b.md`; `spec-status --json` gave `brief: null` for all three. With a
  scratch implementation of D1–D3, the same host printed `seeded queue with 0 briefs, 2 specs` /
  `/spec:run @specs/20261101/01-a.md` and `list` printed the two rows. — **if false:** STOP, the
  reconcile is not where the queue loses ad-hoc specs.
- A2: Executed spike (pre-image `verdict.js --profile release --ledger --briefs …`): `04,04a` →
  `briefs: [4]`; `04a` → no `briefs` key; `4,x` → `[4]`; `12,13` → `[12,13]`. — **if false:** STOP,
  re-read where verdict.js builds the row.
- A3: Collision inventory: the scratch D1–D4 implementation was run against every test file naming
  `spec-queue` plus the spec-status, status, fanout, release-legs and verdict tests (332 tests):
  exactly two went red — the list test (AC-20261103-11-3) and the seed test (AC-20261103-11-4), both
  rewrite rows here. Before D4, `AC-20260903-03-1` and queue-hygiene's `AC-20261013-02-2` also went
  red (`already queued at position 2`), which is why D4 exists. — **if false:** a further red test is
  a stale setup this spec owes: add it as a File Plan fix row, never weaken it.
- A4: spec-status.js's `--json` `specs[].brief` stays `null` for a `brief: n/a` spec after
  specs/20261103/06 and the parallel brief-discriminant spec land. — **if false:** D2's filter keys
  off whatever that spec ships as the ad-hoc discriminant in `--json` (a new key, or the string
  `n/a`); record the correction in Decisions, never edit spec-status.js here.
- A5: `release-legs.js record` forwards verdict.js's stderr and exit code and appends no ledger row
  when verdict.js's stdout is empty (read: `cmdRecord`, `ledgerLine` from stdout line 2). — **if
  false:** STOP, a refused token could ledger a row.

## Rationale

The queue already has a `spec` kind (added for `add <spec> --top`), its doneness and its position
override in `spec-status --next`; what it lacked was a placement rule for specs nobody queued by
hand. Seeding them after the briefs in path order matches what `spec-status --next` already does
for unqueued briefless specs (they sort at `Infinity`, then by path), so the persisted order is the
derived order made explicit. One consequence is deliberate: once persisted, queue position outranks
closest-to-done, so a hardened `01` sorts ahead of an implementing `02`, exactly as roadmap order
already outranks it for briefs; `spec-queue move` is the reorder.

A new `reconcileMissingSpecs` rather than a widened `reconcileMissingBriefs` keeps spec-status.js
untouched: it is a § Risk Tiers file and its brief-null comparisons are the parallel
brief-discriminant spec's scope (D8). spec-status's virtual overlay does not need the spec step,
since unqueued specs already sort after every queued position in path order.

For `--briefs`, uniform strings (`["04","04a"]`) were rejected: they would change every future
release row's type for a numeric id and rewrite two pinned tests for no reader's benefit — no script
in this repo reads `briefs` back. Mixed `[4,"04a"]` keeps every existing row byte-identical. A typo
is now a refusal rather than a drop because a release row that silently omits a shipped brief is
the failure this spec exists to remove.

Tier is critical because verdict.js is a § Risk Tiers trigger, not because of the queue change.

Collision closure (literals `seeded queue with`, `briefs (roadmap order)`, `nothing left undone`,
`nothing pending`, `--briefs`; 15 hits) — six hits outside the File Plan are waived:
`spec/scripts/pending-question.js` and `tests/delegated/pending-question.test.js` spell an unrelated
"nothing pending" (pending questions, not the queue); `tests/queue/queue-hygiene.test.js`'s
`nothing pending · 3 done` host has no open ad-hoc spec and stayed green under the scratch
implementation (A3); `spec/scripts/release-legs.js` forwards `--briefs` verbatim and is unchanged;
`tests/verdict-require-leg.test.js` passes `--briefs 16`, a valid id whose row shape is unchanged;
`docs/canonical/release-pipeline.md` is updated by the Canonical Delta at close.

## Canonical Delta

`docs/canonical/status.md`, the session-queue paragraph: after "A brief that lands on the roadmap
is appended last with no mark or notice." add "Every open ad-hoc spec (`brief: n/a`, not done) is
appended after the briefs as a spec item, in specs/ file order, so the queue is never empty while
one is open; `add` of a not-yet-queued ad-hoc spec places it where asked. The first seed prints
`seeded queue with N briefs, M specs`. (specs/20261103/11-the-queue-sees-ad-hoc-specs.md)"

`docs/canonical/release-pipeline.md`, the `record` bullet: `[--briefs N,N]` becomes
`[--briefs NN,NNa]`, and the bullet gains "verdict.js records a plain id as its number and a
lettered id as its `NNa` string, and refuses any other token with exit 2 naming it."
