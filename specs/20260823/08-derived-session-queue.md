---
date: 2026-08-23
status: done
diff_base: 89978d3a85682e2169c33069948d0a981557c38e
tier: critical           # edits spec-status.js (frozen --next surface) and adds a hook surface (process boundary) — both named critical triggers in .claude/rules/spec-pipeline.md § Risk Tiers
area: session-queue
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 15
spiked: 2026-08-23
open_markers: 0
---

# Derived Session Queue — durable sequencing behind the --next pointer

## Goal

Store the one thing the pipeline cannot derive — JJ's intended work order across briefs,
plus free-text work items and their done-when predicates — in a single per-repository file
inside the git common directory, and make `spec-status.js --next` consult it as an input
overlay so every existing consumer (status dashboard, review close-out, plan report) sees
queue-aware ordering with zero call-site changes. A SessionStart hook surfaces the top
item (ready to paste) plus any auto-placement veto notices when a session opens in the
main checkout, and a finish-current-spec line inside linked worktrees. Done means: the
2026-08-18-style "reconstruct the ordering by hand" session never recurs — the queue file
plus derivation answers it.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Queue store is ONE file `spec-queue.json` in the git **common** directory, resolved via `git -C <root> rev-parse --git-common-dir` with a relative result resolved against `<root>` (AC-20260823-08-1) | Executed spike: common dir is shared by all linked worktrees, invisible to `git status`; rejected in-checkout storage (diverges per worktree, pollutes status) |
| D2 | The overlay lives INSIDE `spec-status.js` as a read-only input to `deriveNext()`; all writes live in new `spec-queue.js` (AC-20260823-08-2, AC-20260823-08-3) | `--next` stays the sole next-pointer surface (doctrine + brief both mandate it); the brief's "post-process" alternative rejected — every live consumer shells `spec-status --next` verbatim, and the sole `--json` consumer (autopilot lane) was deleted 2026-08-18 |
| D3 | Queue semantics are a strict ordered to-do list: the top item not yet done is THE pick; a done-when predicate auto-advances past its item — there is no separate hold/block state (AC-20260823-08-4, AC-20260823-08-5) | "08 after 5 host specs" is expressed as a counter-predicated item sitting above 08; one concept (done) instead of two (done + gated) |
| D4 | Two item kinds: `brief` items store ONLY the brief number (payload and doneness derived live from the existing derivation); `prompt` items store the payload verbatim plus a predicate (AC-20260823-08-4, AC-20260823-08-6) | A stored `/spec:plan` line goes stale the moment the brief is planned; deriving keeps the paste correct at every stage — statuses-derived-not-stored applied to payloads |
| D5 | Predicate vocabulary is exactly `{brief-state, spec-exists, ledger-count, manual}`; `ledger-count` stamps a `baseline` count at add time and completes at `current − baseline ≥ min` (AC-20260823-08-5, AC-20260823-08-6, AC-20260823-08-7) | Brief's own answer: start minimal, extend on the second real case; the baseline makes "5 MORE build runs" expressible, which a raw total cannot |
| D6 | Reconcile on every `spec-queue` invocation (writes) and virtually inside `spec-status.js` (never writes): a brief on disk but not in the queue inserts after the queue item of the last brief in its `Depends on:` list (else after its letter-suffix parent, else appended at end), carrying an `auto_placed` stamp until `bump`/`defer`/`done`/`ok` clears it (AC-20260823-08-8, AC-20260823-08-10) | Placement is deterministic from provenance already on disk, so the viewer needs no write; the stamp is what makes every automatic placement vetoable, never silent |
| D7 | Seeding (absent/empty file → all non-done briefs in roadmap order) happens ONLY on an explicit `spec-queue` write subcommand, prints ONE summary line, and stamps nothing `auto_placed`; the hook never creates the file (AC-20260823-08-9, AC-20260823-08-11) | The queue is opt-in per repo; a hook that writes into every repo the plugin is enabled in would be a silent global side effect; N adoption-moment veto notices would be noise, not signal |
| D8 | SessionStart hook: matcher `startup\|resume\|clear`, a thin bash guard (`spec/scripts/session-queue.sh`) that exits 0 silently unless a queue file exists, then delegates to `spec-queue.js hello` — which prints the top item's paste line plus one notice per un-cleared `auto_placed` item, and prints nothing when the queue is empty with no notices (AC-20260823-08-11, AC-20260823-08-12) | JJ's ratified pick 2026-08-23 (next paste + veto notices, silent when empty); the bash guard keeps non-queue repos at zero node-startup cost; `compact`/`fork` excluded — mid-task context, not a fresh session |
| D9 | Inside a linked worktree (git-dir ≠ common-dir, executed spike): the hook prints a finish-this-tree's-spec line derived from the tree's own `--next`, and `spec-status.js` suppresses the overlay entirely (AC-20260823-08-13, AC-20260823-08-14) | The global pointer misleads mid-spec — the brief names this exact hazard; suppression in the viewer means the hook needs no second derivation |
| D10 | Red-observation `/spec:escape` entries keep rank −3 supremacy over every queue position (AC-20260823-08-15) | An alarm outranks intent — same ruling as specs/20260805/03 D5; the queue orders work, never silences alarms |
| D11 | `--next --json` stays append-only: brief-item ordering changes entry ORDER only; prompt items appear as new entries `{action: <payload verbatim>, path: null, queue: true}`; existing fields and their meanings are untouched (AC-20260823-08-4) | The shape is a frozen API; no live external consumer found (grep 2026-08-23, autopilot deleted) but the discipline costs nothing |
| D12 | New-surface checklist in full: `spec-paths` key `spec-queue` + usage line, `shared-for queue` section list (`Host Grounding\|State Machine\|Question Style\|Console Output Style`), `spec/commands/queue.md` frontmatter, plugin.json bump to next free 7.28.x with changelog, `spec/entrypoints.json` rows for both new scripts, and a registered red-fixture handler for the SessionStart hook [no-ac: each is enforced fail-closed by an existing suite guard — tests/consistency/{plugin-version,entrypoints,red-fixture-coverage}.test.js and tests/spec-paths.test.js] | The four guards fail the whole suite if any checklist item is skipped; an AC would be a second assertion of the same oracle |
| D13 | Command surface is `/spec:queue` wrapping `spec-queue.js` with subcommands `next add bump defer done list ok hello`; `list`/`ok`/`hello` extend the brief's five: a queue you cannot view is unusable, `ok` is the accept-half of the veto contract, `hello` is the hook entry (AC-20260823-08-7, AC-20260823-08-10, AC-20260823-08-12) | Minimal closure of the brief's own mechanics — every extra subcommand exists because a locked Decision (D6, D8) needs it |
| D14 | Manual `done` ticks stamp `ticked: <ISO>` on the item, in the queue file itself; no sidecar journal (AC-20260823-08-7) | A tick is a decision, and the file stores decisions; a second file for one field fails the simplicity bar — reversible later by migrating stamps out |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-queue.js | CREATE | scripts | Queue CLI: subcommands next/add/bump/defer/done/list/ok/hello; owns all queue-file writes, reconcile+seed; doneness via lib/queue.js; header + exit codes per Worker Rules |
| spec/scripts/lib/queue.js | CREATE | scripts | The ONE item-doneness/predicate evaluator (shells `spec-status --json` for brief states; `lib/observation` readLedgerRows for counters) — required by both spec-queue.js and spec-status.js |
| spec/scripts/session-queue.sh | CREATE | scripts | SessionStart guard: silent exit 0 unless inside a git repo with a queue file; worktree → finish-current line; else exec `spec-queue.js hello` |
| spec/scripts/spec-status.js | MODIFY | scripts | Read-only queue overlay in deriveNext(): common-dir resolution (fail-soft on any git error), worktree suppression, queue-position sort key, prompt-item entries, `queue-auto-placed`/`queue-orphan` anomaly kinds; header comment updated |
| spec/bin/spec-paths | MODIFY | scripts | Add `spec-queue` key, usage-line entry, and `queue)` shared-for section list |
| spec/entrypoints.json | MODIFY | scripts | Activation rows: spec-queue.js ← {spec/commands/queue.md, spec/scripts/session-queue.sh}; session-queue.sh ← spec/hooks/hooks.json |
| spec/hooks/hooks.json | MODIFY | doctrine | SessionStart entry, matcher `startup\|resume\|clear`, command session-queue.sh with statusMessage |
| spec/commands/queue.md | CREATE | doctrine | /spec:queue command: frontmatter (description, argument-hint, allowed-tools), one-script-run contract mirroring status.md's never-hand-derive rule |
| spec/commands/status.md | MODIFY | doctrine | Narration rows for the two new anomaly kinds (queue-auto-placed → veto command, queue-orphan → fix pointer); one sentence naming queue-aware ordering |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.28.0, next-free rule) + changelog paragraph (last-3 form) |
| tests/queue/spec-queue.test.js | CREATE | tests | AC-20260823-08-1, AC-20260823-08-5, AC-20260823-08-6, AC-20260823-08-7, AC-20260823-08-8, AC-20260823-08-9, AC-20260823-08-10 |
| tests/queue/queue-overlay.test.js | CREATE | tests | AC-20260823-08-2, AC-20260823-08-3, AC-20260823-08-4, AC-20260823-08-14, AC-20260823-08-15 |
| tests/queue/session-hook.test.js | CREATE | tests | AC-20260823-08-11, AC-20260823-08-12, AC-20260823-08-13 |
| tests/spec-paths.test.js | MODIFY | tests | Extend the key-set/usage pins with `spec-queue` (the 20260814/01 collision class, closed in-plan this time) |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | Register the SessionStart hook handler: plant a queue file, run the hook, require the top item actually printed (engagement evidence, never a precondition pass) |

## Contracts

Queue file — `<git-common-dir>/spec-queue.json` (never inside the checkout, never in `git status`):

```json
{
  "version": 1,
  "seq": 7,
  "items": [
    { "id": "q1", "kind": "brief", "brief": "15", "added": "2026-08-23T10:00:00Z" },
    { "id": "q2", "kind": "prompt",
      "payload": "work the host-repo spec backlog",
      "when": { "type": "ledger-count", "stage": "build", "min": 5, "baseline": 12 },
      "added": "2026-08-23T10:05:00Z" },
    { "id": "q3", "kind": "brief", "brief": "08",
      "auto_placed": "2026-08-23T10:06:00Z" },
    { "id": "q4", "kind": "prompt", "payload": "/spec:plan @docs/roadmap/16-pipeline-spine-as-code.md",
      "when": { "type": "brief-state", "brief": "15", "state": "done" },
      "ticked": "2026-08-24T09:00:00Z" }
  ]
}
```

- `id`: `q<seq>`, monotonically from `seq`, never reused. Subcommand `<ref>` arguments accept
  an id, a brief number, or a unique payload substring; ambiguous or unknown → exit 2 naming
  the candidates.
- `when` absent on a `prompt` item ⇒ manual-only completion (`ticked`). `when` is never
  stored on `brief` items (their doneness is the derived brief state).
- Predicates (closed set, D5): `{"type":"brief-state","brief":"NN","state":"done"}` ·
  `{"type":"spec-exists","path":"specs/…"}` · `{"type":"ledger-count","stage":"<stage>","min":N,"baseline":N}`.
  Unknown `type` ⇒ item treated as manual-only plus one anomaly line (never a crash, never
  silently done).

`spec-queue.js` CLI (hand-rolled `--flag value` parsing only):

```
spec-queue next                        # reconcile+write, print top undone item + notices
spec-queue list                        # full queue: ✅ done · ▶ top · ○ pending · 🅰 auto-placed
spec-queue add <payload…> [--brief NN] [--when <type>:<args>] [--top | --after <ref>]
spec-queue bump <ref>                  # move to top, clear auto_placed
spec-queue defer <ref> [--after <ref2>]  # move to end (or after ref2), clear auto_placed
spec-queue done <ref>                  # manual tick: stamp ticked, clear auto_placed
spec-queue ok [<ref>]                  # accept auto placement(s): clear flag, keep position
spec-queue hello                       # hook mode: silent unless something to say (D8)
Exit codes: 0 ok/nothing-to-say · 2 usage or unresolvable <ref> (remedy: spec-queue list) ·
3 not a git repository (remedy: run inside the repo; hello exits 0 silently instead)
```

`spec-status.js --next --json` delta (append-only, D11): entry order becomes queue-aware;
prompt items appear as `{ "action": "<payload verbatim>", "path": null, "queue": true, "status": "queued", "brief": null, "blockers": [], "note": "queue item <id>" }`.
Human `--next` render prints a prompt item's payload alone (no `@path` suffix). New anomaly
kinds: `queue-auto-placed` (detail carries `spec-queue bump <ref>` as the veto),
`queue-orphan` (queue item whose brief file no longer exists).

`spec/hooks/hooks.json` addition:

```json
"SessionStart": [
  { "matcher": "startup|resume|clear",
    "hooks": [ { "type": "command",
                 "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/session-queue.sh",
                 "statusMessage": "Checking the session queue" } ] }
]
```

## Behavior

- **Ordering derivation (overlay ON):** entries from `deriveNext()` sort by
  `(has-blockers, rank −3 escapes first, queue position of the entry's brief, existing rank,
  briefOrd, path)`. Every briefed entry maps to a queue position (real item, or the virtual
  reconcile placement); briefless specs (`brief: n/a`) sort after all queued positions with
  their existing tiebreaks. Within one brief, the existing closest-to-done rank still orders
  its spec entries. Queue position deliberately OVERRIDES cross-brief closest-to-done — that
  override is the product (jumping a follow-up ahead, holding a brief behind a counter).
- **Overlay OFF** (no git, git error, no queue file, unparseable file, or linked worktree):
  behavior is today's, byte-for-byte; an unparseable file additionally prints one anomaly
  (`queue-orphan` kind is not reused — the detail names the parse error and the file path).
- **Reconcile (write path, every spec-queue subcommand):** set-diff `docs/roadmap/NN-*.md`
  (minus superseded briefs, which are derived — never queued) against `brief` items. Missing
  brief → insert per D6, stamp `auto_placed`. Queue item pointing at no brief file → keep,
  report `queue-orphan`. Concurrent arrivals from parallel worktrees: whoever writes first
  wins the earlier position; the reconcile pass is last-writer-safe because placement is
  recomputed from disk, not from the other writer's file (a lost insert reappears on the
  next invocation).
- **hello output (main checkout):** line 1 `🧭 <payload of top undone item>` (verbatim paste),
  then one `⚠️ auto-queued: brief NN after MM — veto: spec-queue bump NN · accept: spec-queue ok NN`
  per flagged item. Empty queue, no flags → no output at all (JJ's ratified noise budget).
- **hello output (linked worktree):** `🧭 worktree session — finish this tree's spec first:`
  plus the tree's own `--next` top line (overlay suppressed by D9, so it is the tree's spec).
- **`add` payload classification:** `--brief NN` or a payload matching `^\d{2}[a-z]?$` or a
  roadmap path ⇒ `brief` item; anything else ⇒ `prompt` item stored verbatim.
- **Predicate evaluation:** both spec-queue.js (read path) and spec-status.js (overlay
  skip-done) evaluate item doneness via the single evaluator `spec/scripts/lib/queue.js`
  (brief states from `spec-status --json` where the caller is spec-queue.js, from the
  in-process derivation where the caller is spec-status.js itself; ledger counters via
  `lib/observation`'s readLedgerRows) — one derivation of doneness, never two.

## Acceptance Criteria

- **AC-20260823-08-1**: WHEN `spec-queue add 15` runs in a main checkout with a linked
  worktree THE SYSTEM SHALL write `spec-queue.json` inside the git common directory such
  that the same items are readable from the worktree and `git status --porcelain` stays
  empty in both trees (literal: file at `<repo>/.git/spec-queue.json`; worktree
  `git rev-parse --git-common-dir` → `<repo>/.git`) → tests/queue/spec-queue.test.js
- **AC-20260823-08-2**: WHEN the queue orders brief 08 ahead of brief 05 and both briefs
  have unblocked spec entries THE SYSTEM SHALL emit 08's entry before 05's in both `--next`
  renders (literal: items `[{brief:"08"},{brief:"05"}]` → first `--next` line names the 08
  spec, `--json` `next[0].brief === "08"`) → tests/queue/queue-overlay.test.js
- **AC-20260823-08-3**: WHEN no queue file exists THE SYSTEM SHALL CONTINUE TO produce
  today's `--next` output unchanged (literal: a non-git tmpdir host with two specs yields
  byte-identical stdout before and after this spec) → tests/queue/queue-overlay.test.js
- **AC-20260823-08-4**: WHEN the top undone queue item is a prompt item THE SYSTEM SHALL
  print its payload verbatim as the `--next` top line with no `@path` suffix, and emit it in
  `--json` as `{action: <payload>, path: null, queue: true}` (literal: payload
  `"ship the landing page"` → line 2 of `--next` output is exactly `ship the landing page`)
  → tests/queue/queue-overlay.test.js
- **AC-20260823-08-5**: WHEN a ledger-count item has `{stage:"build", min:2, baseline:3}`
  and the ledger holds 5 `stage:"build"` rows THE SYSTEM SHALL treat the item done
  (literal: 5 − 3 ≥ 2 → done; with 4 rows → not done) → tests/queue/spec-queue.test.js
- **AC-20260823-08-6**: WHEN every spec stamped `brief: NN` is `done` (≥1 spec) THE SYSTEM
  SHALL skip brief NN's queue item with no stored done flag anywhere in the queue file
  (literal: brief 05 all-done, item `{kind:"brief",brief:"05"}` unmodified on disk →
  `spec-queue next` prints the item below it) → tests/queue/spec-queue.test.js
- **AC-20260823-08-7**: WHEN `spec-queue done q2` runs THE SYSTEM SHALL stamp
  `ticked: <ISO-8601>` on item q2 in the queue file and subsequent `next` runs skip it
  (literal: manual prompt item, no `when` → after tick, `next` prints the following item)
  → tests/queue/spec-queue.test.js
- **AC-20260823-08-8**: WHEN a brief file `15a-*.md` with `Depends on: 15` exists on disk
  but not in the queue THE SYSTEM SHALL insert its item immediately after brief 15's item
  stamped `auto_placed`, and print one notice carrying the veto command (literal: queue
  `[15, 16]` + new `15a` → `[15, 15a🅰, 16]`, notice contains `spec-queue bump 15a`)
  → tests/queue/spec-queue.test.js
- **AC-20260823-08-9**: WHEN no queue file exists and `spec-queue next` runs in a repo with
  3 non-done briefs THE SYSTEM SHALL seed all 3 in roadmap order with zero `auto_placed`
  stamps and print exactly one summary line (literal: briefs 05, 08, 15 →
  `seeded queue with 3 briefs (roadmap order)`) → tests/queue/spec-queue.test.js
- **AC-20260823-08-10**: WHEN `spec-queue bump 08` runs on an `auto_placed` item THE SYSTEM
  SHALL move it to position 1 and remove the `auto_placed` stamp (literal: `[15, 16, 08🅰]`
  → `[08, 15, 16]`, no stamp) → tests/queue/spec-queue.test.js
- **AC-20260823-08-11**: WHEN `session-queue.sh` runs in a repo with no queue file, or
  outside any git repository THE SYSTEM SHALL print nothing and exit 0 (literal: both
  fixtures → stdout `""`, exit 0) → tests/queue/session-hook.test.js
- **AC-20260823-08-12**: WHEN `session-queue.sh` runs in a main checkout whose queue holds
  a top item and one `auto_placed` item THE SYSTEM SHALL print the top item's paste line
  and one veto notice (literal: top = brief 15 at `hardened` → first line ends
  `/spec:build @specs/…15….md`; second line contains `veto: spec-queue bump`)
  → tests/queue/session-hook.test.js
- **AC-20260823-08-13**: WHEN `session-queue.sh` runs inside a linked worktree THE SYSTEM
  SHALL print the finish-this-tree line derived from the tree's own specs and never the
  global queue top (literal: worktree spec at `implementing`, global queue top = different
  brief → output names the worktree's spec path, not the queued brief) →
  tests/queue/session-hook.test.js
- **AC-20260823-08-14**: WHEN `spec-status.js` runs with `--root` a linked worktree that
  shares a queue file ordering brief 08 first THE SYSTEM SHALL ignore the overlay (literal:
  worktree derivation output identical to the same tree with no queue file) →
  tests/queue/queue-overlay.test.js
- **AC-20260823-08-15**: WHEN a done spec's observation is red and a queue file is present
  THE SYSTEM SHALL CONTINUE TO emit the `/spec:escape` entry first, above every queue
  position (literal: red row + queue top brief 08 → `next[0].action === "/spec:escape"`)
  → tests/queue/queue-overlay.test.js

## Assumptions (escalation triggers)

- A1: Files placed in the git common directory are shared across linked worktrees and never
  appear in `git status`. **Executed 2026-08-23** (temp repo + worktree): file written from
  the worktree's `--git-common-dir` read back from main; `git status --porcelain` empty in
  both; main `--git-dir` = `--git-common-dir` = `.git`, worktree values differ (absolute
  `…/main/.git/worktrees/wt` vs `…/main/.git`) — worktree detection = inequality after
  resolving both. — **if false:** STOP, storage design is void.
- A2: `git rev-parse --git-common-dir` outside a repository exits 128 with
  `fatal: not a git repository`. **Executed 2026-08-23** (empty scratch dir): exit=128
  observed. Relative results (`.git`, `../.git` from a subdir) are cwd-relative —
  **Executed 2026-08-23**; scripts therefore always run `git -C <root>` and resolve a
  relative answer against `<root>`, never rely on `--path-format=absolute` (git ≥2.31-only).
  — **if false:** fail-soft branch never triggers; overlay might crash in non-git dirs —
  the AC-3 fixture would catch it.
- A3: Plugin `hooks.json` supports the `SessionStart` event with matchers
  `startup|resume|clear|compact|fork` and plain stdout injected as session context
  (docs-verified 2026-08-23 via claude-code-guide against current Claude Code docs;
  cross-evidence: JJ's user-level SessionStart:clear hook observably injected context into
  this very planning session). Hook cwd = the project directory. — **if false:** the hook
  simply never fires (queue still fully usable via `/spec:queue` + `/spec:status`); record
  in deviations and re-check the docs before inventing an alternative event.
- A4: No live consumer of `--next --json` remains (autopilot deleted 2026-08-18; repo-wide
  grep 2026-08-23 found only verbatim-stdout consumers). — **if false:** D11's append-only
  discipline already protects them; nothing changes.
- A5: Existing spec-status tests exercise non-git tmpdir hosts, so the overlay's git
  resolution MUST fail soft (spawnSync error / status ≠ 0 → overlay off, zero stderr).
  — **if false:** nothing; AC-3 pins it anyway.
- A6: `node:child_process.spawnSync('git', …)` is an acceptable new call inside
  spec-status.js (Node built-ins only — no new dependency; git itself is already assumed
  by the surrounding pipeline). — **if false:** STOP, ask the user.

## Rationale

The brief's central constraint — `--next` stays the single derivation surface — forces D2:
every consumer today captures `spec-status --next` stdout verbatim (review close-out,
report slots, command doctrine), so a post-processing sibling script would either be
bypassed by all of them or require editing every call site. The deleted autopilot was the
only consumer that ever read `--json` programmatically; its death (2026-08-18) removed the
one argument for keeping spec-status.js queue-blind.

Strict-sequence semantics (D3) came from re-reading the brief's own examples: "hold 08
until a counter fills" is not a blocking feature, it is an ordinary item ("do host work",
predicated) sitting above 08. This collapsed the design to one rule — top undone item wins
— and made the overlay a sort-key change rather than a state machine.

The queue deliberately overrides cross-brief closest-to-done ranking; seeding in roadmap
order preserves today's behavior at adoption, so the override only ever reflects an
explicit `bump`/`defer`/`add --top`. Escape supremacy (D10) is the one exception, inherited
unchanged.

Rejected: a `.worktreeinclude`-replicated in-checkout file (per-worktree divergence — the
exact defect the common dir avoids); storing brief payloads verbatim (stale after every
stage flip); a sidecar journal for manual ticks (second file, one field); `compact` in the
hook matcher (mid-task refresh, not a session opening — printing the global pointer there
recreates the worktree hazard in time instead of space). The `lib/queue.js` doneness
evaluator is deliberately shared by both scripts so item-doneness never has two
derivations — the repo's hard-finding rule for duplicate algorithms.

**Waived at review 2026-08-23 (JJ):** the reconcile leg's single out-of-plan file,
`tests/consistency/entrypoints.test.js`. D12 named it as an enforcing guard, not a File Plan
row, but the guard is an exhaustive live-file pin — it asserts the complete set of
`hooks.json` script paths, so registering `session-queue.sh` forces an in-place edit there by
construction. Updated in place (count four→five, both the test name and the
consequence-of-failure message), never weakened, and its original `AC-20260820-04-5` tag kept
because the pin belongs to that spec's oracle, not this one. This is the fourth recurrence of
the exhaustive-pin-outside-the-File-Plan class already recorded in the host rules' Gotchas.

### Build deviations folded at close (2026-08-23)

- **Version target moved 7.28.0 → 7.29.0.** D12's literal was already taken at HEAD by a
  same-day incident fix. Bumped to the next free version, same changelog paragraph, oldest
  (7.26.0) entry dropped per the last-3 rolling window. An instance of the version-target
  staleness class already in the host rules' Gotchas — no new entry earned.
- **D6's "reconcile on every invocation (writes)" resolved to a write/read split.**
  `next/add/bump/defer/done/ok` reconcile-and-persist before acting; `list`/`hello` never write
  or reconcile-insert. No AC forced either reading, and a SessionStart hook mutating the shared
  common-dir file as a side effect of a passive read was the wrong default — D8's "the hook
  never creates the file" extended in spirit to "never writes at all".
- **D6's reconcile inherits D7's non-done filter.** The spec states it only for seeding. Without
  it, every completed brief would be auto-placed as a perpetual `auto_placed` item and earn an
  unvetoable `queue-auto-placed` anomaly forever.
- **Superseded briefs are detected by blockquote marker, not a machine-readable stamp.** D6
  excludes them, but no such stamp exists — the roadmap overview's "*(superseded by v7)*" is
  prose in a Name column. `lib/queue.js`'s `isSupersededBriefText` reads the
  `> **Superseded by …**` marker every currently-superseded roadmap file (01, 05, 07) already
  opens its "Why" section with, verified by direct read. Without it those three dead briefs
  would seed into every fresh queue in this repo.
- **Two pipe-truncation regression pins landed out-of-File-Plan** in
  `tests/queue/queue-overlay.test.js`, carrying no AC-ID (a defect regression, not an acceptance
  criterion — this repo's convention forbids inventing placeholder IDs). Each builds a synthetic
  host whose JSON measurably exceeds the 64 KiB pipe buffer and was verified red against the
  pre-fix script. The underlying trap is now a Gotchas entry.

## Canonical Delta

`docs/canonical/status.md` gains one paragraph after the observation paragraph:

> The `--next` derivation consults an optional per-repo session queue
> (`spec-queue.json` in the git common directory, written only by `spec-queue.js`) as an
> input overlay: queue position orders unblocked entries across briefs, prompt items
> surface verbatim, red-observation escape entries still rank first, and linked worktrees
> suppress the overlay entirely. No queue file means the derivation is unchanged. Statuses
> and payloads stay derived — the queue stores only ordering, free-text payloads, and
> done-when predicates.
