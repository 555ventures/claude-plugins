---
date: 2026-09-03
status: done
tier: critical           # edits spec-status.js (frozen --next/--json surface, .claude/rules/spec-pipeline.md § Risk Tiers) and changes the queue file's item vocabulary
area: session-queue
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260903/04-reports-write-the-queue.md, specs/20260903/05-status-diet.md]
brief: 24
open_markers: 0
diff_base: af5e0a08c786bb40ede5c2d23bca4c0dc0991ad0
---

# Pipeline queue mechanics — after-gates, spec items, placed-last, one reorder verb

## Goal

Turn the session queue from a list the user was supposed to maintain into the pipeline's own
memory for deferred work. An item can wait behind a spec or a brief (an **after-gate**) and
only becomes the pick once that target is done; an ad-hoc spec can be queued by path at any
position; a brief that lands on the roadmap is placed last with no mark, no notice and no
accept step; a brief or spec is queued at most once; and the verbs shrink to the five the
pipeline and a one-line veto need. Done means: `spec-queue add "/spec:plan @docs/roadmap/26-x.md"
--after-spec specs/20260903/04-y.md` is honored by `spec-status --next` on the day spec 04
closes and never before, `spec-queue add specs/20260903/06-hotfix.md --top` makes that
ad-hoc spec the Next line, and `queue-auto-placed` no longer exists.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A third item kind `spec`: `{kind:"spec", spec:"<repo-relative spec path>"}`. Doneness is derived live — the spec's frontmatter `status` is `done` or `superseded`, or the file no longer exists — never stored. Its overlay position applies to that spec's own `deriveNext()` entry and overrides the entry's brief position; an unqueued `brief: n/a` spec keeps today's after-every-queued-position sort (AC-20260903-03-1, AC-20260903-03-13) | Brief 24 § Scope 3: an ad-hoc fix spec sorted below every queued brief, so "this fix goes first" had no honest home; `add` validates the path exists so a later absence means the spec was retired or moved, which is silence by the retirement precedent |
| D2 | An optional `after` gate on any item: `{"after":{"spec":"<path>"}}` or `{"after":{"brief":"NN"}}`. Ready ⇔ the target is done (spec: `status: done` or `superseded`; brief: derived `done`). A missing target is **not ready** and its state renders as `missing`. `add --after-spec <path>` / `--after-brief NN` validate the target exists at add time (exit 2 naming it) (AC-20260903-03-2, AC-20260903-03-3, AC-20260903-03-11) | The promise "after X, do Y" needs readiness, not doneness — 20260823/08 D3's "no hold state" ruling is retired here (Rationale); a typo'd gate that silently released its item would be worse than one that visibly waits |
| D3 | The pick is the first item in queue order that is **undone and ready**; both predicates live in `lib/queue.js` (`isItemDone` unchanged, new `isItemReady`), shared by `spec-queue.js` and the `spec-status.js` overlay. In the overlay a not-ready item's entries gain one blocker string `after <target> (<state>)` and sink into the blocked tier like any other blocked entry; a not-ready prompt item's entry keeps the frozen 7-key shape with that blocker in `blockers` (AC-20260903-03-2, AC-20260903-03-3) | One readiness derivation in one module (the duplicate-derivation defect class is a hard finding here); reusing the blocked tier means `--next --json` consumers see a gated item exactly as they see a dependency-blocked spec — no new field |
| D4 | Reconcile placement is **append last**: an on-disk non-done, non-superseded brief absent from the queue is appended at the end, in roadmap order, with no `auto_placed` stamp. `reconcileMissingBriefs` drops its depends-on and letter-parent rules; every write subcommand strips any `auto_placed` key it finds; the `queue-auto-placed` anomaly kind and its `ANOM_ICON` entry are deleted from `spec-status.js`; no notice line is printed (AC-20260903-03-4, AC-20260903-03-5) | Brief 24: "the accept-auto-placement decision is a decision nobody wants — information content zero"; a session that wants a new brief first says `--top` when it writes the brief (spec 04) |
| D5 | A brief or spec is queued at most once. Write path: `reconcileForWrite` collapses duplicate `brief`/`spec` items to their **first** occurrence before any mutation; `add` of an already-queued brief/spec exits 2 with `already queued at position <n> — spec-queue move <ref> <n>`; `list` (read-only, D7 of 20260823/08 stands) renders the first occurrence only (AC-20260903-03-5, AC-20260903-03-6) | The live file on this repo held brief 18 three times and 21/23 twice — every one a hand `add`; a brief item stores nothing but its number (20260823/08 D4), so dropping a duplicate loses only a position |
| D6 | Verb set: `next` (reconcile+write, print the pick), `list` (pending only, numbered, gates shown, footer), `add <payload…> [--top \| --at <n>] [--after-spec <path> \| --after-brief NN] [--when <type>:<args>]`, `move <ref> <n>`, `done <ref>`. Payload classification: `NN`/`NNa` or a `docs/roadmap/NN-*.md` path → `brief`; a path matching `^specs/.*\.md$` → `spec`; anything else → `prompt` verbatim. `bump`, `defer`, `ok`, `add --after <ref>`, `add --brief` are removed: each exits 2 naming its replacement (`move <ref> 1`, `move <ref> <n>`, "there is no accept step — new briefs are placed last; `spec-queue move <ref> <n>` reorders", `--at <n>`, "pass the brief number as the payload") (AC-20260903-03-7, AC-20260903-03-9) | Fleet grep 2026-09-03: no host, global instruction, or memory cites the removed verbs; their only callers are the command docs spec 04 rewrites — an alias release would preserve vocabulary nobody reads |
| D7 | `move <ref> <n>` and `add --at <n>` count **pending** positions exactly as `list` numbers them (done and not-ready items are still listed as pending when undone; only done items are hidden and skipped in the count). `<n>` ≥ pending count places last; `<n>` < 1 or non-numeric exits 2. `<ref>` resolves against a brief number, a spec path (exact or unique basename substring), a unique prompt-payload substring, or an item id (undocumented compatibility); a `<ref>` matching only a done item exits 2 `already done` (AC-20260903-03-7) | The number a user reads on `list` is the number they type; anything else is a second numbering |
| D8 | `list` render, exactly: one line per pending item `{n}  {desc}` with `{desc}` = `brief NN (name)` / `spec <path>` / `<payload>`, plus `  ⏳ after <target> (<state>)` when the item is gated and not ready; then a footer `— {d} done · move: spec-queue move <ref> <n>`; an empty pending set prints `✨ nothing pending · {d} done`. `list` virtually reconciles (never writes) so its numbering matches the status overlay's positions (AC-20260903-03-8) | Brief 24: the old list showed 16 items of which 12 were done, keyed by ids, and never said how to reorder |
| D9 | Frozen surfaces stay: `--next --json` top-level keys `["next"]`, existing entry keys and meanings, the prompt entry's 7-key shape (an ungated prompt still emits `blockers: []`), the lean `--next` render, worktree suppression, escape-entry supremacy, the `--when` vocabulary and the `ledger-count` baseline rule, brief doneness never stored, `done` ticks stamped on the item, seeding on the first write in roadmap order with one summary line (AC-20260903-03-10, AC-20260903-03-12) | 20260823/08 D4/D5/D7/D9/D10/D11/D14 all stay per brief 24 § Grounding; the pins are retagged in place, never duplicated |
| D10 | Queue file stays `version: 1`; `spec` items and `after` are additive keys, old files load unchanged; `auto_placed` is read-tolerated and write-stripped [no-ac: covered by AC-20260903-03-5's strip assertion and AC-20260903-03-10's compatibility pins — a separate version-bump AC would assert the same oracle twice] | No consumer keys on `version`; a bump would force a migration for two additive fields |
| D11 | Doc + version: `spec/commands/queue.md` is rewritten as the plumbing-plus-veto surface (Contracts below); `spec/commands/status.md` drops its `queue-auto-placed` narration bullet and re-points the `queue-orphan` remedy at `move`/`done`; plugin.json bumps to the next free minor (target 7.73.0) with the changelog paragraph [no-ac: enforced by tests/consistency/plugin-version.test.js and the review's doctrine-without-bump hard check] | New-surface checklist (.claude/rules/spec-pipeline.md § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/queue.js | MODIFY | scripts | `spec` kind in `isItemDone` (ctx gains `specStatus(path)`), new `isItemReady(item, ctx)` for `after` gates, `reconcileMissingBriefs` append-last with no stamp, new `dedupeItems(items)` (first occurrence), `stripAutoPlaced(items)`; header comment updated (owner: this spec) |
| spec/scripts/spec-queue.js | MODIFY | scripts | Verbs next/list/add/move/done per D6–D8; removed verbs exit 2 naming replacements; `--at`/`--top`/`--after-spec`/`--after-brief` parsing and validation; duplicate refusal; `list` render with virtual reconcile; write path dedupes + strips stamps; header usage + exit codes updated |
| spec/scripts/spec-status.js | MODIFY | scripts | Overlay: `spec`-item positions (D1), after-gate blockers via `isItemReady` (D3), reconcile without stamps and the `queue-auto-placed` push + `ANOM_ICON` entry deleted (D4); the ctx passed to `lib/queue.js` gains `specStatus`; header comment updated |
| spec/commands/queue.md | MODIFY | doctrine | Rewrite: the pipeline's write surface + the one human veto (`move`); verb table and render contract from Contracts; no veto/accept narration; `Intended model: any` |
| spec/commands/status.md | MODIFY | doctrine | Delete the `queue-auto-placed` narration bullet; `queue-orphan` bullet names `spec-queue done <ref>` / `spec-queue move <ref> <n>` |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.73.0, next-free rule) + changelog paragraph (last-3 form) |
| tests/queue/spec-queue.test.js | MODIFY | tests | AC-20260903-03-1, AC-20260903-03-4, AC-20260903-03-5, AC-20260903-03-6, AC-20260903-03-7, AC-20260903-03-8, AC-20260903-03-9, AC-20260903-03-11; AC-20260903-03-10 retags the AC-20260823-08-5/6/7/9 pins in place; the AC-20260823-08-8 and -10 tests are rewritten in place to the placed-last and `move` behaviors (retagged AC-20260903-03-4 / -7), never left red |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20260903-03-2, AC-20260903-03-3, AC-20260903-03-12, AC-20260903-03-13; AC-20260903-03-10 retags the AC-20260823-08-3/4/14/15 pins in place |
| tests/spec-paths.test.js | MODIFY | tests | One assert message quotes the retired list legend (`✅▶○🅰`); message text updated to the new legend, the assertion itself unchanged |

## Contracts

Queue file — `<git-common-dir>/spec-queue.json`, `version: 1` (unchanged), items:

```json
{ "id": "q7", "kind": "brief",  "brief": "26", "added": "…" }
{ "id": "q8", "kind": "spec",   "spec": "specs/20260903/06-hotfix.md", "added": "…" }
{ "id": "q9", "kind": "prompt", "payload": "/spec:plan @docs/roadmap/26-x.md",
  "after": { "spec": "specs/20260903/04-reports-write-the-queue.md" }, "added": "…" }
{ "id": "q10", "kind": "brief", "brief": "27", "after": { "brief": "26" }, "added": "…" }
```

- `after` is optional on every kind; exactly one of `spec` / `brief` inside it.
- `auto_placed` is never written; if present on load it is dropped at the next write.
- `when` (prompt-only doneness predicates) and `ticked` are unchanged from 20260823/08.

`lib/queue.js` exports (additions in bold):

```
normBrief, isSupersededBriefText, evaluateWhen, isItemDone, makeCtx, reconcileMissingBriefs,
**isItemReady(item, ctx) -> { ready, target, state }**   // target: "specs/…" | "brief NN"; state: done|hardened|…|in-flight|unplanned|missing
**dedupeItems(items) -> items'**                           // first occurrence of each brief/spec wins; prompts untouched
**stripAutoPlaced(items) -> items'**
makeCtx({ ledgerRows, briefStatus, specStatus, specRoot })  // specStatus(relPath) -> 'done'|'hardened'|…|'superseded'|null (absent)
```

`spec-queue.js` CLI (hand-rolled `--flag value` parsing only):

```
spec-queue next                                  # reconcile+write, print the pick (spec-status --next line 2, or a prompt payload)
spec-queue list                                  # pending items, numbered; footer "— {d} done · move: spec-queue move <ref> <n>"
spec-queue add <payload…> [--top | --at <n>] [--after-spec <path> | --after-brief NN] [--when <type>:<args>]
spec-queue move <ref> <n>                        # n counts pending positions as list prints them; n ≥ count → last
spec-queue done <ref>                            # manual tick (unchanged)
Exit codes: 0 ok · 2 usage, unresolvable/ambiguous/already-done <ref>, duplicate brief/spec
  on add (message names `spec-queue move <ref> <n>`), missing --after target, a removed verb
  (message names the replacement), or a corrupt queue file (remedy: remove
  <git-common-dir>/spec-queue.json and re-run `spec-queue next`) · 3 not a git repository
```

`list` render (literal):

```
1  brief 24 (status-and-queue-diet)
2  /spec:plan @docs/roadmap/26-x.md  ⏳ after specs/20260903/04-reports-write-the-queue.md (hardened)
3  spec specs/20260903/06-hotfix.md
— 12 done · move: spec-queue move <ref> <n>
```

`spec-status.js --next --json` delta (append-only, D9): a gated, not-ready item's entries carry
`blockers: ["after specs/20260903/04-reports-write-the-queue.md (hardened)"]` (or
`"after brief 26 (in-flight)"`, or `(missing)`); a `spec` item's own entry takes the item's
queue position. No key is added or removed; `anomalies[]` in the full `--json` loses the
`queue-auto-placed` kind.

## Behavior

- **Pick derivation (both scripts):** walk items in order; skip `isItemDone`; skip
  `!isItemReady`; the first survivor is the pick. In `spec-status.js` this is expressed as sort
  keys, not a walk: a not-ready item's entries receive the gate blocker (so they sort into the
  blocked tier), then the existing `(blocked, escape, queuePos, rank, briefOrd, path)` order
  applies unchanged. A gated brief item gates every spec entry of that brief; a gated spec item
  gates that one spec's entry; a gated prompt item gates its own entry.
- **Reconcile (write path):** `stripAutoPlaced` → `dedupeItems` → append missing on-disk
  non-done, non-superseded briefs last in roadmap order → the subcommand's own mutation →
  atomic write. `list` runs the same three read-only steps on a copy for display.
- **`move <ref> <n>`:** remove the item, then insert it before the n-th pending item (n
  counted after removal); n beyond the end appends. Done items keep their relative slots.
- **Overlay OFF cases** (no git, git error, no file, unparseable file, linked worktree) are
  byte-for-byte today's derivation (20260823/08 A5/D9) — unchanged.
- **Removed verbs:** recognized only to print the replacement and exit 2; never act.

## Acceptance Criteria

- **AC-20260903-03-1**: WHEN `spec-queue add specs/20260701/01-fix.md --top` runs in a repo
  where that spec is `hardened` with `brief: n/a` and the queue holds brief 05 (one hardened
  spec) THE SYSTEM SHALL write item `{kind:"spec", spec:"specs/20260701/01-fix.md"}` at index 0
  and `spec-status --next` prints `/spec:run @specs/20260701/01-fix.md` as line 2, with
  `--next --json` `next[0].path === "specs/20260701/01-fix.md"` (literal: before the add the
  top pick is brief 05's spec; after, the fix spec) → tests/queue/spec-queue.test.js
- **AC-20260903-03-2**: WHEN the top queue item is a prompt `{payload:"/spec:plan
  @docs/roadmap/26-x.md", after:{spec:"specs/20260701/01-a.md"}}` and that spec is
  `implementing` THE SYSTEM SHALL emit that entry in `--next --json` with `blockers ===
  ["after specs/20260701/01-a.md (implementing)"]`, the unblocked spec below it as `next[0]`,
  and, once `01-a.md` is flipped to `done`, the payload as line 2 of `--next` (literal: line 2
  `/spec:plan @docs/roadmap/26-x.md`) → tests/queue/queue-overlay.test.js
- **AC-20260903-03-3**: WHEN queue item brief 08 carries `after:{brief:"05"}` and brief 05 is
  `in-flight` THE SYSTEM SHALL give 08's spec entry the blocker `after brief 05 (in-flight)`
  and pick 05's spec; with every brief-05 spec `done`, 08's spec is `next[0]` (literal:
  blockers `["after brief 05 (in-flight)"]` → then `[]`) → tests/queue/queue-overlay.test.js
- **AC-20260903-03-4**: WHEN queue `[15, 16]` exists and brief file `15a-*.md` with `Depends
  on: 15` lands on disk THE SYSTEM SHALL, on `spec-queue next`, append it **last** with no
  `auto_placed` key and print no notice (literal: briefs `["15","16","15a"]`; stdout has no
  line containing `auto-queued`; `spec-status --json` `anomalies` has no
  `queue-auto-placed` entry) → tests/queue/spec-queue.test.js
- **AC-20260903-03-5**: WHEN the queue file holds brief 21 twice (the second stamped
  `auto_placed`) plus a spec item twice THE SYSTEM SHALL, on any write subcommand, leave one
  brief-21 item at the first occurrence's position, one spec item likewise, and no
  `auto_placed` key on any item (literal: items `[21, 08, 21🅰, S, S]` → `[21, 08, S]`);
  and `list` before that write already prints brief 21 once → tests/queue/spec-queue.test.js
- **AC-20260903-03-6**: WHEN `spec-queue add 21` runs and brief 21 is already queued at
  pending position 2 THE SYSTEM SHALL exit 2 with stderr containing `already queued at
  position 2` and `spec-queue move 21` and leave the file byte-identical →
  tests/queue/spec-queue.test.js
- **AC-20260903-03-7**: WHEN pending items are `[A, B, C]` with a done item between A and B
  THE SYSTEM SHALL order them `[C, A, B]` after `move C 1`, `[A, B, C]` after `move C 9`,
  exit 2 on `move C 0`, and exit 2 `already done` on `move <the done item> 1` (literal
  `list` numbering after `move C 1`: `1  C`, `2  A`, `3  B`) → tests/queue/spec-queue.test.js
- **AC-20260903-03-8**: WHEN the queue holds brief 24 (name `status-and-queue-diet`,
  pending), a gated prompt (target hardened), a spec item, and two done brief items THE
  SYSTEM SHALL print exactly the four-line render in Contracts: `1  brief 24
  (status-and-queue-diet)`, `2  /spec:plan @docs/roadmap/26-x.md  ⏳ after
  specs/20260903/04-reports-write-the-queue.md (hardened)`, `3  spec
  specs/20260903/06-hotfix.md`, `— 2 done · move: spec-queue move <ref> <n>`; with nothing
  pending it prints `✨ nothing pending · 2 done` → tests/queue/spec-queue.test.js
- **AC-20260903-03-9**: WHEN `spec-queue bump 05`, `spec-queue defer 05`, `spec-queue ok`,
  `spec-queue add x --after q1`, or `spec-queue add --brief 05` runs THE SYSTEM SHALL exit 2
  without writing and name the replacement (literal stderr substrings: `spec-queue move 05
  1`; `spec-queue move 05`; `no accept step`; `--at <n>`; `pass the brief number as the
  payload`) → tests/queue/spec-queue.test.js
- **AC-20260903-03-10**: WHEN no queue file exists, or the root is a linked worktree, or a red
  observation is on the ledger, or an ungated prompt item is on top, or a `ledger-count` /
  `done`-ticked / fully-done-brief item is evaluated, or the first write seeds an absent file
  THE SYSTEM SHALL CONTINUE TO behave as pinned by AC-20260823-08-3, -4, -5, -6, -7, -9,
  -14 and -15 (literal: those eight existing tests, retagged with this ID, stay green) →
  tests/queue/queue-overlay.test.js, tests/queue/spec-queue.test.js
- **AC-20260903-03-11**: WHEN `spec-queue add "x" --after-spec specs/nope.md` or
  `--after-brief 99` runs and neither target exists THE SYSTEM SHALL exit 2 naming the missing
  target and write nothing; WHEN a gate's target is deleted after the add THE SYSTEM SHALL
  keep the item not-ready with blocker `after specs/nope.md (missing)` in `--next --json` →
  tests/queue/spec-queue.test.js
- **AC-20260903-03-12**: WHEN `--next --json` runs on a queue carrying a gated prompt, a spec
  item, and a brief item THE SYSTEM SHALL CONTINUE TO emit top-level keys exactly `["next"]`,
  the prompt entry's key set exactly `action,path,queue,status,brief,blockers,note`, and
  every other entry's key set exactly `action,path,status,brief,blockers,note,parallel,
  parallel_reason` (literal key lists) → tests/queue/queue-overlay.test.js
- **AC-20260903-03-13**: WHEN the queue holds only brief 08 and on-disk brief 05 (unqueued,
  no dependencies) has a hardened spec THE SYSTEM SHALL place 05 virtually **last** so 08's
  spec is `next[0]` (literal: `next.map(e => e.brief)` starts `["08","05"]`) →
  tests/queue/queue-overlay.test.js

## Assumptions (escalation triggers)

- A1: `--next --json` carries no `anomalies` key today, so brief 24's open question about
  external consumers of hygiene kinds there is moot. **Executed 2026-09-03**: `node
  spec/scripts/spec-status.js --root . --next --json | jq -c keys` → `["next"]`. — **if
  false:** the full-`--json` audience field (spec 05) covers it; nothing here changes.
- A2: The live queue file on this repo carries duplicate brief items that D5's dedupe must
  collapse. **Executed 2026-09-03**: `jq` group-by over `<common-dir>/spec-queue.json` →
  `18×3, 21×2, 23×2`. — **if false:** D5 still holds as a guard; the AC fixture builds its own
  duplicates.
- A3: The pre-image rejects the new surfaces, so their tests start red. **Executed
  2026-09-03**: `spec-status.js --all` → exit 2 usage; `spec-queue.js move 24 1` → exit 2
  usage; `reconcileMissingBriefs([15,16],[15a(dep 15),17])` → `["15","15a","16","17"]` (dep
  placement live, to be retired by D4). — **if false:** red-check flags `unsanctioned-green`;
  re-derive the pre-image before tagging any AC pre-green.
- A4: The affected suites are green at HEAD. **Executed 2026-09-03**: `node --test
  tests/spec-status.test.js 'tests/queue/*.test.js' 'tests/status/*.test.js'` → `tests 63
  pass 63 fail 0`. — **if false:** STOP; a red baseline is a regression, never a starting
  point.
- A5: No host repo, global instruction file, or agent memory cites `spec-queue bump|defer|ok`.
  **Executed 2026-09-03**: recursive grep over `/Users/jj/Projects/*` (md/js/sh/json, minus
  node_modules), `~/.claude/CLAUDE.md`, and the memory directory → zero hits outside this
  repo's `spec/commands/{queue,status}.md`. — **if false:** add the alias release the brief
  originally offered (one minor, each alias printing the `move` form) as a build deviation.
- A6: `spawnSync('git', …)` fail-soft resolution of the common dir (20260823/08 A2/A5) is
  unchanged by this spec. — **if false:** nothing; AC-20260903-03-10 pins the no-git path.

## Rationale

The queue's original model (20260823/08 D3) was a strict ordered list where the only
per-item state is *done*; "after X, do Y" was to be expressed by positioning Y below X's
brief item. That works only when X is a whole brief; a promise gated on one spec inside an
in-flight brief, or on a briefless spec, had no honest encoding — so those promises were
narrated in reports and lost (JJ, 2026-09-03: "how da heck should I keep track of these
messages"). D2/D3 add readiness as a second predicate and reuse the existing blocked tier
so no consumer learns a new shape.

D1 exists because `deriveNext()` sorts every unqueued briefless spec after every queued
position (`Infinity`) — correct for the roadmap case, wrong for an urgent hotfix. Queueing a
spec by path is the smallest change that lets "this fix goes first" be true on the Next line.

D4 retires the dependency-aware placement and the veto/accept pair together: JJ ruled the
accept step carries zero information, and placement-last is predictable enough that no
notice is owed. The one remaining way to say "first" is `--top` at write time, which spec 04
puts in the hands of the commands that create work.

D6 removes verbs rather than aliasing them because the fleet grep found no reader of the old
vocabulary; an alias release would preserve words nobody types. `move` is the whole reorder
API; `--at` is `move` at insert time.

Waived at review close (2026-09-03, JJ): the `queue-orphan` anomaly remedy names
`spec-queue done <ref>`, which cannot clear a `brief` item — brief doneness is derived-only
(D9), so `done` stamps a tick `isItemDone` ignores and the anomaly persists. D11 dictates the
remedy text verbatim, so honest wording would amend a locked Decision; the message offers two
other verbs that do work, and a later spec can add the missing case knowingly.

Waived at review close (2026-09-03, JJ): `add`'s duplicate refusal names
`spec-queue move <ref> <n>` on the done branch too, but `move` on a done item exits 2
`already done`, so that one branch points at a command that refuses. D5 locks the single
message form with no done-item variant and AC-20260903-03-6 pins only the pending case; the
refusal still blocks the duplicate and names the existing entry's position as `(done)`.

Rejected: a stored `priority` field (brief 24 § Out of scope — order is the priority); a
`ready` predicate that also marks done (conflates the two states D2 separates); keeping
`auto_placed` as a silent flag (dead data); a time-based "new for 24h" mark (a clock in a
derivation, for a nudge JJ ruled worthless).

**Regression pins:** AC-20260903-03-10 and -12 retag the 20260823/08 pins in place; the
AC-20260823-08-8 (placement after the dependency parent) and -10 (`bump`) tests are the two
whose pinned behavior this spec deliberately changes — they are rewritten in place to the new
behavior and retagged, never weakened and never left red (host Gotchas: colliding pins are
updated in place).

**Collision closure (lock, 2026-09-03; specs/20260814/05 D6/D12):** literals leg over
`auto_placed`, `queue-auto-placed`, `auto-queued`, `🅰`, `spec-queue bump|defer|ok`, `'bump'`,
`'defer'`, `'ok'` — every hit inside `spec/` and `tests/queue/`, plus `tests/spec-paths.test.js`,
is a File Plan row. Waived: `docs/roadmap/24-status-and-queue-diet.md` (three hits — the brief
narrates the retired forms as history, a waived prefix for the repo-wide sweep);
`tests/provenance/provenance.test.js`, `tests/render/render-rules.test.js`,
`tests/status/red-alarm.test.js` (the `'ok'` stem matches the observation state `'ok'`, an
unrelated meaning). Paths-leg `executes` hits outside the File Plan —
`tests/frontmatter/frontmatter.test.js`, `tests/replay/replay.test.js`,
`tests/review/review-driver.test.js`, `tests/status/red-alarm.test.js` — all run
`spec-status.js` with `--json` or `--next` on hosts with no queue file, surfaces this spec leaves
byte-identical (AC-20260903-03-10/-12); no fixture repair owed.

## Canonical Delta

`docs/canonical/status.md`, second paragraph (the queue overlay) is replaced by:

> The `--next` derivation consults an optional per-repo session queue (`spec-queue.json` in the
> git common directory, written only by `spec-queue.js`) as an input overlay. Items are briefs
> by number, specs by path, or free-text prompts; any item may carry an `after` gate on a spec
> or a brief and is not ready until that target is done. Queue position orders unblocked
> entries across briefs (a queued spec's own position overrides its brief's); a not-ready item's
> entries carry an `after <target> (<state>)` blocker and sink with the other blocked entries;
> prompt items surface verbatim; red-observation escape entries still rank first; linked
> worktrees suppress the overlay entirely. A brief that lands on the roadmap is appended last
> with no mark or notice. No queue file means the derivation is unchanged. Statuses and payloads
> stay derived — the queue stores only ordering, gates, free-text payloads, and done-when
> predicates.
