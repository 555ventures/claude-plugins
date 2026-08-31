---
date: 2026-08-30
status: implementing
diff_base: 0a7f8efb359ef71b09543369f67ebd0046602b47
tier: standard
area: review-close
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260830/03-ci-leg-honest-absence.md"]
# brief: n/a — ad-hoc hardening from a salon-os host escape report (2026-08-30)
open_markers: 0
---

# Close-time gate re-run — post-gate-written files stop escaping enforcement

## Goal

`/spec:review`'s CLOSE phase writes the canonical doc and folds Gotchas into the host's
rules file **after** the gate leg already ran over the diff, then commits — so the exact
files the pipeline itself writes bypass the host's deterministic rule enforcement (two
escapes recorded in salon-os, 2026-08-30). Done means: `--mark closed` re-runs the host's
resolved `gateCommand` over the committed close tree and refuses the mark while it is red,
so no review can close with the gate broken by its own close writes.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `handleClosed()` runs the host's resolved `gateCommand` (cwd = `repoRoot`) as its LAST refusal check — after the deviations, gotchas-ratchet, and dirty-tree refusals — and refuses the mark (exit 2, `marks.closed` never set) while the gate exits non-zero (AC-20260830-02-1, AC-20260830-02-2) | Runs last so cheap refusals fire first and the gate observes the exact committed close tree the dirty-tree check just certified; enforcement is deterministic in the driver per core § Rule Enforcement — a prose instruction in the CLOSE step was rejected as unenforceable |
| D2 | The refusal message names the failed gate command, includes the tail of its output (last 40 lines, stderr+stdout), and names the remedy: fix the flagged files, commit the fix, re-run `--mark closed` (AC-20260830-02-1) | Script convention: every error path names its remedy command |
| D3 | Gate resolution is extracted from `review-legs.js` into `spec/scripts/lib/gate-resolve.js` exporting `resolveGate(specText, config)`; `review-legs.js` imports it and its resolution behavior is byte-identical (AC-20260830-02-3) | One derivation of `{testDirs}`/`{scopeDirs}` substitution — a second copy in the driver would drift; the driver already imports `lib/host-config` so the lib pattern is established |
| D4 | When resolution yields no runnable gate (`gate: null` — `gateCommand` contains `{testDirs}` but the spec has no File Plan test rows) or the host config is unreadable, `--mark closed` refuses with a message naming the reason and the remedy (fix config / File Plan, or re-run) — never silently skips the check (AC-20260830-02-4) | A skipped check is the vacuous-green class this spec exists to close; in practice unreachable at close (a `gate: null` review leg is a red row, so the verdict never reached CLEAN) but defense-in-depth is one branch |
| D5 | The driver's printed CLOSE step 4 gains one sentence: the mark will re-run the host gate over the committed tree, so format the files you wrote in steps 1–2 to the host's rules before committing (AC-20260830-02-1 covers the enforcement; the sentence itself `[no-ac: printed guidance prose, enforced by D1's deterministic refusal]`) | The session should expect the check, not discover it by refusal |
| D6 | `spec/.claude-plugin/plugin.json` bumps to the next free minor (target 7.39.0) with the description's changelog line naming the close-gate re-run (AC-20260830-02-5) | Behavior change → semver bump (host rules § Planning); literal number is a target, not a pin (Gotchas: concurrent-session semver race) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/gate-resolve.js | CREATE | scripts | `resolveGate(specText, config)` moved verbatim from review-legs.js (glob-form `{testDirs}`/`{scopeDirs}` substitution, `{gate}`/`{gate:null,reason}` return shape unchanged) |
| spec/scripts/review-legs.js | MODIFY | scripts | delete local `resolveGate`, import from `./lib/gate-resolve`; no behavior change |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D1 gate run + refusal in `handleClosed()`; D2 message; D4 unresolvable refusal; D5 CLOSE step sentence; header + `Exit codes:` note the new refusal reason |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version bump + changelog description (D6) |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260830-02-1, AC-20260830-02-2, AC-20260830-02-4 |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260830-02-3 (tag the existing gate-row test as the extraction pin — update in place, never duplicate) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260830-02-5 (only if the version/description pin lives here; otherwise the plugin.json row's bump is asserted by the existing changelog-shape test — worker verifies which file pins it and edits that one, recording the actual location in the deviations sidecar if it differs) |
| tests/review/deviations-backstop.test.js | MODIFY | tests | fixture repair only (collision-closure executes hit): synthetic hosts reaching `--mark closed` get a green `gateCommand` (e.g. `true`); zero assertion changes |
| tests/review/merge-reentry.test.js | MODIFY | tests | fixture repair only, same as above |
| tests/review/stopped-row-durability.test.js | MODIFY | tests | fixture repair only, same as above |

## Contracts

```
// spec/scripts/lib/gate-resolve.js
module.exports = { resolveGate }
// resolveGate(specText, config) -> { gate: string } | { gate: null, reason: string }
// Byte-identical semantics to the function removed from review-legs.js:
// - config.gateCommand without {testDirs}/{scopeDirs} returns { gate: config.gateCommand }
// - {testDirs} -> space-joined quoted globs derived from File Plan test rows (glob form,
//   Node 26: `node --test <dir>` does not run files — JJ-20260815-04)
// - no File Plan test rows -> { gate: null, reason: 'no File Plan test rows to resolve {testDirs}' }
```

Driver refusal (new, in `handleClosed()`, after the dirty-tree check):

```
gate red at close — <resolved command> exited <code> over the committed close tree.
The files written at CLOSE (canonical doc, rules fold) are inside the host's rule
surface; fix them, commit the fix, then re-run `--mark closed`.
--- last 40 lines of gate output ---
<tail>
```

## Behavior

Close sequence after this spec: session applies Canonical Delta + Gotchas fold (steps 1–2),
hygiene (step 3), close commit (step 4) → `--mark closed` → deviations refusals →
gotchas ratchet → dirty-tree refusal → **gate run over the committed tree** → red: exit 2
with D2's message, `marks.closed` unset, state unchanged (a refused mark is always
side-effect-free — existing driver invariant) → session fixes, commits, re-marks; green:
`marks.closed = true`, MERGE proceeds as today.

Cost: one full `gateCommand` run per review close, per attempt. Accepted — the gate is the
host's own definition of "enforced", and close is once per spec.

## Acceptance Criteria

- **AC-20260830-02-1**: WHEN `--mark closed` is invoked with all existing refusals passing
  and the resolved host `gateCommand` exits non-zero THE SYSTEM SHALL refuse the mark with
  exit 2, leave the sidecar's `closed` mark unset, and print a message containing the
  literal phrase `gate red at close`, the resolved command, and the remedy re-run line
  (e.g. synthetic host with `gateCommand: "bash always-red.sh"` → exit 2, stderr contains
  `gate red at close — bash always-red.sh exited 1`) → new test in
  tests/review/review-driver.test.js
- **AC-20260830-02-2**: WHEN `--mark closed` is invoked and the resolved gate exits 0 THE
  SYSTEM SHALL CONTINUE TO set the `closed` mark and print the MERGE step (synthetic host
  with `gateCommand: "true"` → mark lands exactly as before this spec) → existing
  closed-mark test in tests/review/review-driver.test.js, updated in place so its fixture
  host carries a green gate command, tagged with this AC-ID
- **AC-20260830-02-3**: WHEN `review-legs.js` resolves a gate for a spec whose File Plan
  has test rows THE SYSTEM SHALL CONTINUE TO produce the identical glob-form command after
  the extraction to `lib/gate-resolve.js` (e.g. test row `tests/review/x.test.js` +
  `gateCommand: "node --test {testDirs}"` → `node --test 'tests/review/*.test.js'`) →
  existing gate-resolution test in tests/review/review-legs.test.js, tagged
- **AC-20260830-02-4**: WHEN `--mark closed` is invoked and gate resolution returns
  `gate: null` (host `gateCommand` contains `{testDirs}`, spec has no File Plan test rows)
  THE SYSTEM SHALL refuse the mark with exit 2 and a message naming the unresolvable-gate
  reason and the remedy (never silently skip the gate check) (synthetic host with
  `gateCommand: "node --test {testDirs}"` and a spec whose File Plan has no test rows →
  exit 2, message contains `no File Plan test rows`) → new test in
  tests/review/review-driver.test.js
- **AC-20260830-02-5**: WHEN this spec lands THE SYSTEM SHALL carry a
  `spec/.claude-plugin/plugin.json` version ≥ 7.39.0 whose description's changelog line
  names the close-gate re-run `[oracle: gate]` — the repo's existing
  version/changelog-shape consistency tests are the honest oracle; a new duplicate pin
  would be a second derivation

## Assumptions (escalation triggers)

- A1: `handleClosed()` can reach the host config — verified: the driver already imports
  `readConfig` from `./lib/host-config` (executed grep 2026-08-30, line 124). — **if
  false:** import it; the lib exists.
- A2: `resolveGate` is not pinned by name anywhere in `tests/` — verified: repo-wide grep
  for `resolveGate` over `tests/` returned zero hits (executed 2026-08-30). — **if
  false:** update the pin in place per the retired-literal Gotcha, retag, never weaken.
- A3: The consistency suite's exhaustive file pins (entrypoints, dependency-free) admit a
  new file under `spec/scripts/lib/` without a pin edit (existing `lib/*.js` files predate
  this spec). — **if false:** the exhaustive-pin Gotcha applies — update the pin in place
  at build, one review waive line, never a lock-time guard.
- A4: A refused `--mark closed` is side-effect-free today (state mutated only after all
  refusals) — read from the code: `marks.closed = true; saveSidecar()` are the last
  statements of `handleClosed()`. — **if false:** restructure so the gate run precedes any
  mutation; the AC-1 test catches it either way.

## Rationale

The salon-os escapes are structural, not host-specific: every review close writes at least
the canonical doc, and any host whose `gateCommand` covers doc/markdown surfaces has its
enforcement bypassed for exactly those files. The salon report proposed re-running "the
host's format leg" — no such concept exists in the grounding contract (`format` is only an
enforcement-category name); the only deterministic enforcement surface a host declares is
the whole `gateCommand`, so that is what runs (D1). Placing the run in the driver rather
than the CLOSE prose follows core § Rule Enforcement and the standing "deterministic
enforcement > prose" ruling; placing it after the dirty-tree check means the gate certifies
the committed tree, not an intermediate state. The extraction (D3) exists because the
driver must resolve `{testDirs}` exactly as review-legs does — a paraphrased copy is a
drift seam (the stated reason ci-query.js was unified in 2026-08-05). Rejected: scoping the
re-run to only the files CLOSE wrote — `gateCommand` is monolithic by contract and
file-scoping it would invent a second resolution grammar. Fragile: hosts with very slow
gates pay one extra full run per close attempt; if that becomes material the fix is a host
config knob, not a silent skip. Collision sweep (`collision-closure --literal resolveGate`, run at lock 2026-08-30):
literals leg hit only `spec/scripts/review-legs.js` (in-plan). `executes` hits adjudicated:
the four test files invoking `--mark closed` (grep-verified) entered the File Plan as
fixture-repair rows; `tests/frontmatter/frontmatter.test.js` and
`tests/review/escalate-row.test.js` execute the driver but never reach the closed mark —
waived; review-legs `executes` hits are unaffected by a byte-identical extraction (AC-3 is
the pin). `likely`/`mentions` hits owe nothing (measured 2026-08-24, host § Gotchas).

## Canonical Delta

`docs/canonical/review-close.md` (create if absent): the CLOSE mark is gate-enforced —
`--mark closed` re-runs the host's resolved `gateCommand` over the committed close tree and
refuses while red, so files written during CLOSE (canonical doc, rules fold) cannot land
unformatted or rule-breaking; gate resolution is shared with review-legs via
`spec/scripts/lib/gate-resolve.js`, the single `{testDirs}` derivation.
