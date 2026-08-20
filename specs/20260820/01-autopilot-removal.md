---
date: 2026-08-20
status: done
tier: standard
diff_base: ba9faae412b82148c8dab05d0ccfe9b545692e60
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: []
open_markers: 0
---

# Autopilot removal

## Goal

Delete the parked autopilot daemon — source, tests, marketplace entry, and every live rule
carve-out that existed only for it — so the repo's dependency-free invariant becomes absolute
and no session is ever steered toward autopilot work again. JJ ruled the product a failure
(2026-08-18, confirmed 2026-08-20); the runtime block was already flipped to inert and the
smoke pin rewritten (commit ba9faae). Done means: no `autopilot/` directory, no
`@anthropic-ai/claude-agent-sdk` reference in any tracked runtime/rule surface, the two
regression pins that outlive autopilot relocated and still green, and the full suite green
with zero skips.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Delete, never archive: `autopilot/**` and `tests/autopilot/**` removed outright (AC-20260820-01-3, AC-20260820-01-4) | git history is the archive; an in-repo "parked" copy invites resurrection and keeps the SDK carve-outs alive. Rejected: moving to `attic/`. |
| D2 | The inert smoke pin (JJ-20260820, supersedes AC-20260801-04-6) relocates verbatim to `tests/host-config/smoke-inert.test.js` (AC-20260820-01-1) | The pin now guards the host config's inert declaration, not autopilot; it must survive the directory deletion. Path-only move, content preserved including the supersession header. |
| D3 | `spec-status.js --next --json` stays a frozen API; its consumer framing is reworded from "the autopilot daemon" to "external `--json` consumers" in the Risk Tiers row and the script's header comment (AC-20260820-01-2) | The freeze is cheap and the shape has consumers beyond the dead daemon (status render, review close-out); un-freezing is a separate decision nobody asked for. |
| D4 | The dependency-free invariant becomes absolute: the `autopilot/**` SDK-import exception and the `autopilot/contract/**` vendored-typebox exemption are deleted from § Review Checks, § Worker Rules, and `gate-scripts.md`; a suite pin enforces zero tracked SDK references outside `specs/**` (AC-20260820-01-3) | The carve-outs existed only for the daemon; with it gone, "any non-builtin import anywhere is hard" needs no footnotes — and a pin makes silent re-import impossible. |
| D5 | Historical records stay untouched: `specs/**`, `docs/audit/**`, `docs/roadmap/**`, ledger rows, and Gotchas whose provenance cites autopilot spec filenames (pipeline-rules lines citing specs/20260808/01 etc.) keep their citations; `docs/canonical/autopilot.md` is deleted [no-ac: doc/prose deletion has no testable surface; completeness is adjudicated by the File Plan + the lock's collision-closure sweep] | Canonical docs describe the current system — a canon page for deleted code is a lie; specs and gotcha provenance are history and history is never rewritten. |
| D6 | The `tests/autopilot/preflight.test.js` load-sensitivity Gotcha (pipeline-rules ~line 280) is deleted; the bare-dir-vs-glob Gotcha (JJ-20260815-04, ~line 153) survives with its example path rewritten off `tests/autopilot` [no-ac: prose edit, verified by review diff] | One gotcha is about a deleted file (dies with it); the other is about Node 26 `--test` behavior (outlives any directory). |
| D7 | No spec-plugin version bump: the only `spec/` touch is a comment-line rewrite in `spec-status.js` — no behavior change [no-ac: absence-of-change; § Review Checks bump rule applies only to behavior changes] | Bumping for a comment would falsify the changelog. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/** | DELETE | scripts | entire daemon: bin, daemon/, contract/, fixtures/, hooks/, BRIEF.md, package files, .claude-plugin/plugin.json |
| tests/autopilot/** | DELETE | tests | all 16 suites incl. the two env-gated live suites; smoke-leg.test.js relocates first (orchestrator-duty line below) |
| tests/host-config/smoke-inert.test.js | CREATE | tests | AC-20260820-01-1 — verbatim relocation of tests/autopilot/smoke-leg.test.js (JJ-20260820 pin, supersession header preserved) |
| tests/consistency/dependency-free.test.js | CREATE | tests | AC-20260820-01-3, AC-20260820-01-4 — pins zero tracked `@anthropic-ai/claude-agent-sdk` refs outside specs/**, and no autopilot/ dir |
| tests/status/red-alarm.test.js | MODIFY | tests | AC-20260820-01-2 — assert message reworded: "autopilot lane" → "--next --json consumers"; assertions unchanged |
| .claude/spec.config.json | MODIFY | other | routing.scripts drops the trailing autopilot-daemon clause |
| .claude/rules/spec-pipeline.md | MODIFY | other | per D4/D5/D6: line ~9 drops autopilot from repo framing; ~27 rewords frozen-API consumer; ~73–76 + ~117–123 delete SDK/typebox carve-outs; ~94 drops autopilot DI clause; ~101–107 deletes live-suite paragraph; ~153 example reworded; ~280 gotcha deleted; ~169/219 citations kept |
| .claude/agents/gate-scripts.md | MODIFY | other | drops the SDK-import-exception sentence (line ~31) |
| .claude/rules/conventions/scripts.md | MODIFY | other | frontmatter path scope drops `autopilot/**` |
| .claude/rules/conventions/tests.md | MODIFY | other | drops "(or in-process DI for autopilot lib modules)" |
| README.md | MODIFY | other | deletes the "Autopilot (optional daemon)" section (~lines 95–135) |
| scripts/spec-patterns.sh | MODIFY | scripts | default dir list drops `autopilot`; the "autopilot grows over time" comment reworded to a generic missing-dir note |
| spec/scripts/spec-status.js | MODIFY | scripts | header-comment consumer list drops autopilot/daemon/lane.js (comment-only; D7) |
| .claude-plugin/marketplace.json | MODIFY | other | removes the autopilot plugin entry |
| docs/canonical/autopilot.md | DELETE | other | canon page for deleted code (D5) |

Orchestrator duty (outside the table): the relocation CREATE must be sequenced **before**
`tests/autopilot/**` is deleted — the new file's content is read from the old path. Both rows
sit in the tests layer; if they land on different workers, the orchestrator performs the copy
itself before dispatching the deletion.

## Behavior

- Deletion is plain `git rm -r` of the two directories; `autopilot/node_modules` is untracked
  and removed with the directory. No other code path imports autopilot modules (executed
  census in Assumptions).
- The scoped review gate will resolve `{testDirs}` globs that include the deleted
  `tests/autopilot` directory; Node 26 treats a non-matching glob as zero matches and still
  runs the remaining globs green (executed evidence in Assumptions) — no gate accommodation
  needed.
- After this spec, the repo-wide suite has **zero sanctioned skips**: the only sanctioned
  env-gated skip (`AUTOPILOT_LIVE` in tests/autopilot/runbook.test.js) dies with its suite.
- Fleet machines that ever enrolled the daemon may still list `autopilot@555-tools` in their
  local `~/.claude/settings.json` — out of this repo's reach; JJ removes those entries by hand
  (surfaced in the plan report).

## Acceptance Criteria

- **AC-20260820-01-1**: WHEN `spec/scripts/smoke.sh` runs against this repo's real
  `.claude/spec.config.json` THE SYSTEM SHALL CONTINUE TO exit 4 and print `__SMOKE_INERT__`
  with the parked reason (e.g. config `runtime.inert: "…the autopilot daemon is parked…"` →
  stdout matches `__SMOKE_INERT__` and `/parked/`, status 4) → relocated pin in
  tests/host-config/smoke-inert.test.js
- **AC-20260820-01-2**: WHEN `spec-status.js --next --json` emits an escape entry THE SYSTEM
  SHALL CONTINUE TO report `blockers: []` and `parallel: false` (frozen `--json` shape, D3) →
  existing assertions in tests/status/red-alarm.test.js, message reworded
- **AC-20260820-01-3**: WHEN tracked files are searched for `@anthropic-ai/claude-agent-sdk`
  THE SYSTEM SHALL match nothing outside `specs/**` (e.g. `git grep -l` → only `specs/…` paths)
  → tests/consistency/dependency-free.test.js
- **AC-20260820-01-4**: WHEN the repo root is listed THE SYSTEM SHALL contain no `autopilot`
  directory → tests/consistency/dependency-free.test.js
- **AC-20260820-01-5**: WHEN the scoped gate runs THE SYSTEM SHALL report 0 fail and 0 skipped
  [oracle: gate]

## Assumptions

- **Census (executed 2026-08-20)**: `grep -rln "claude-agent-sdk" --exclude-dir=node_modules .`
  → only `autopilot/**`, `tests/autopilot/preflight.test.js`, `.claude/rules/spec-pipeline.md`,
  and historical `specs/**` — no live consumer outside the deletion set. If false → the missed
  consumer joins the File Plan before build.
- **Non-matching glob is green (executed)**: `node --test 'tests/nonexistent/*.test.js'
  'tests/host-config/*.test.js'` on Node v26.0.0 → 4 pass, exit 0. If false → gate resolution
  would need a DELETE-row filter in review-legs.js (separate spec).
- **Marketplace entry removal is inert for this machine**: nothing in this repo references the
  entry at runtime. If a fleet machine still has the plugin enabled, its local settings entry
  goes stale harmlessly; if that proves disruptive → re-add a tombstone entry pointing at the
  parked ruling.
- The only autopilot-referencing test outside `tests/autopilot` is
  tests/status/red-alarm.test.js, and only in an assert **message** (executed grep). If false
  → same treatment: reword, keep assertions.

## Rationale

JJ parked autopilot 2026-08-18 ("product failure"; memory: no autopilot work or suggestions —
product specs come from host repos now) and confirmed 2026-08-20 ("We don't need autopilot"),
after the first /spec:replay run surfaced that fresh worktrees needed an autopilot-only
`npm install` to pass the boot leg. The runtime flip (ba9faae) removed the boot dependency;
this spec removes the code. Tier is standard despite `spec-status.js` appearing in the
critical-trigger list: the touch is a comment line with zero behavior delta, and the frozen
`--json` shape is regression-pinned by AC-20260820-01-2's executed test. Roadmap briefs 03/15
keep their autopilot mentions as history (brief 03 derives `done` from its three landed specs;
brief 15's consumer list will be re-derived if it is ever planned).

### Collision closure (lock sweep, 2026-08-20)

`collision-closure.js --literal autopilot --literal claude-agent-sdk`: likely-tier hits —
`tests/autopilot/discover.test.js` (covered by the `tests/autopilot/**` DELETE row) and
`tests/dc-extract.test.js` (false positive: its "README" is a synthetic fixture file, not this
repo's README — waived). Literals hits outside the File Plan, all waived as history per D5:
`docs/audit/v7-replay-eval.md`, `docs/roadmap/03-fleet-provisioning.md`,
`docs/roadmap/15-derived-session-queue.md`, and `tests/ac-matrix-coverage-holes.test.js`
(uses `AUTOPILOT_ENROLL_LIVE` purely as a self-contained fixture string in a synthetic spec —
no autopilot code reached). Every file under `autopilot/**`/`tests/autopilot/**` in the census
is covered by those two DELETE glob rows.

### Review waives (2026-08-20, run rv_4aab3989b913)

Four deterministic leg findings, all waived by JJ after executed adjudication; zero reviewer
survivors.

- **Out-of-plan (2)**: `.claude/agent-memory/plugin-tests/MEMORY.md` and
  `.claude/agent-memory/plugin-tests/self-matching-literal-pin-fragment-idiom.md`, written by
  the tests worker during the mid-review pin repair. Waived on the precedent this repo already
  set (specs/20260819/03 § review waives: "agent memory is never a File Plan deliverable") —
  the note records the fragment-not-exempt idiom for the next self-matching pin, and deleting
  it would discard the lesson.
- **Uncovered ACs (2)**: AC-20260820-01-1 and AC-20260820-01-2 report zero hits because their
  tests deliberately retain older pin identifiers — `JJ-20260820 (supersedes AC-20260801-04-6)`
  in tests/host-config/smoke-inert.test.js (D2 mandates verbatim relocation including the
  supersession header) and `AC-20260807-01-7` in tests/status/red-alarm.test.js (D3 keeps the
  frozen-shape pin, rewording only its message). The reviewer executed both suites and observed
  the promised assertions pass. Renaming either test would override a locked Decision and erase
  a supersession record to silence a cosmetic matcher warning.

### Incident: the pin that matched itself (2026-08-20, fixed same session)

AC-20260820-01-3 as first authored spelled `@anthropic-ai/claude-agent-sdk` literally in its own
test title and assert message while grepping every tracked file for that string — so the pin
returned itself as the violation and could never go green. The gate caught it before any
reviewer ran (run rv_67c33e2306f8, GATE_RED).

Fixed by assembling the specifier from fragments at runtime, matching this repo's one existing
precedent for the same hazard (tests/tracked-text-purity.test.js spells the banned raw NUL byte
as `'\x00'` rather than emitting it, and refuses a self-path allowlist for the same reason: an
exemption fails silent if the fragments are ever rejoined, whereas an un-literal name keeps the
pin honest about itself).

A consultation brief (Fable, 2026-08-20) established the deeper defect: the AC encoded a
blocklist of one dead package standing in for the repo's actual dependency-free invariant, so a
worker importing any *other* package sailed past it. JJ ruled in the generalization; a third,
AC-less structural test now pins that no tracked manifest declares dependencies, no tracked path
carries a `node_modules/` segment, and no tracked JS imports a non-builtin. All three assertions
were mutation-proven red-capable in an isolated scratch repo by the reviewer. Deliberate blind
spots (vendored source behind relative requires, install instructions in prose, runtime package-
manager invocations) are listed in the file's header rather than guarded — none is instantiated
today.

## Canonical Delta

- Delete `docs/canonical/autopilot.md` (no other canonical doc mentions autopilot —
  executed grep, 2026-08-20; nothing else to amend).
