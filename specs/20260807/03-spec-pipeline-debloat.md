---
date: 2026-08-07
status: done
open_markers: 0
risk: T2
area: spec-pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Spec-pipeline de-bloat: dead flag, stale comments, prose dedupe, release retire condition

## Goal

Close out the spec-plugin half of the 2026-08-07 over-engineering audit: delete the
zero-consumer `--json` flag from `observe-ci.js`, correct the stale `pending`-era comments in
`lib/observation.js`, dedupe the triply-stated autopilot SDK-import exception to one home, and
register the user-ruled retire condition for `verdict.js`'s never-run release profile instead
of deleting it. Done = the flag is gone, every touched comment states the live contract, the
exception sentence has exactly one full statement, and the ledger row schedules the release
profile's expiry. Net lines down, no new mechanisms.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Delete `observe-ci.js --json`: header mention (line 3), `let json` + parse branch (:35, :39), the single usage string (:41 — the file's only one, verified), and the `if (json)` output block (:220-222, keeping the `outLines` human render as the only output). Unknown flags already hit usage + exit 2, which now covers `--json` | Zero consumers repo-wide (verified grep 2026-08-07); the flag was symmetry with `spec-status --json`, and symmetry with no consumer is the audited disease. Rejected: keep for future machine callers — the ledger row observe-ci appends IS the machine contract |
| D2 | `verdict.js`'s release profile (`--profile release`, `--milestone`, `--briefs`), its 7 exec pins in tests/review/verdict.test.js, and release.md's wiring all STAY; `spec/doctrine/scaffold-ledger.md`'s "Release stage executed checks" row gains an explicit retire condition: delete the profile + pins + release.md wiring together if two consecutive quarters across hosts record zero `stage:"release"` ledger rows (registered 2026-08-07: zero rows to date) | User ruling 2026-08-07. Deleting now silently breaks the shipped `/spec:release` in every host, and the ledger's own Verdict-derivation row forbids a stage verdict with no script origin. Rejected: delete outright — reversal means rebuilding the milestone gate |
| D3 | `spec/scripts/lib/observation.js` comments state the live contract: lines 13-14's "observe-ci.js wants `{pending, latest}`" becomes "observe-ci.js reads the winning row directly (as `latest`)", and line 40's "no qualifying row (pending)" becomes "no qualifying row (unobserved)" | The pending state was retired by specs/20260807/01; a comment asserting a retired contract is the claims-registry disease in miniature |
| D4 | The autopilot SDK-import exception ("`autopilot/**` may import ONLY `@anthropic-ai/claude-agent-sdk`, and only from `autopilot/daemon/sdk.js`…") keeps its full statement ONLY in `.claude/rules/spec-pipeline.md` § Review Checks; the § Worker Rules copy (:77-79) and `.claude/agents/gate-scripts.md:31`'s copy are replaced by a one-line citation of `.claude/rules/spec-pipeline.md § Review Checks` | Verbatim triplication drifts; touch-time dedupe is sanctioned (shared.md § Doctrine Authoring — these files are touched by this spec, not swept). Review Checks wins as home because reviewers enforce the rule; the other two audiences only need the pointer |
| D5 | `spec/.claude-plugin/plugin.json` bumps 6.43.0 → 6.44.0 with the de-bloat noted in `description` | Behavior change (flag removed) bumps the owning plugin; description is the changelog surface |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/observe-ci.js | MODIFY | scripts | D1: remove `--json` end to end; usage line becomes `usage: observe-ci.js [--root <dir>]` |
| spec/scripts/lib/observation.js | MODIFY | scripts | D3: two comment corrections, no code change |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D2: retire condition appended to the "Release stage executed checks" row's promote/retire column |
| .claude/rules/spec-pipeline.md | MODIFY | other | D4: § Worker Rules zero-dep bullet cites § Review Checks instead of restating the autopilot exception |
| .claude/agents/gate-scripts.md | MODIFY | other | D4: same citation replacement in the zero-dependencies bullet |
| tests/status/observe-ci.test.js | MODIFY | tests | AC-20260807-03-1, AC-20260807-03-2 |
| tests/review/verdict-doctrine.test.js | MODIFY | tests | AC-20260807-03-3 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D5: 6.44.0 + description changelog line |

## Behavior

- `observe-ci.js` output after D1: human render lines when there is something to say, silence
  otherwise (D3 of specs/20260807/01, unchanged); the appended `stage:"observe"` ledger row
  remains the sole machine contract. `--json` now falls into the existing unknown-flag path.
- No behavior change anywhere else: D2–D4 are prose/comment edits plus a ledger-row
  amendment.

## Acceptance Criteria

- **AC-20260807-03-1**: WHEN `observe-ci.js` is invoked with `--json` THE SYSTEM SHALL exit 2
  and print the usage line naming only `[--root <dir>]` on stderr (`node observe-ci.js
  --json` → exit 2, stderr contains `usage: observe-ci.js [--root <dir>]`) → new assertion in
  tests/status/observe-ci.test.js
- **AC-20260807-03-2**: WHEN a done spec's observed CI run is red THE SYSTEM SHALL CONTINUE
  TO append the `stage:"observe"` ledger row and print the human alarm render → tag the
  existing red-observation test in tests/status/observe-ci.test.js
- **AC-20260807-03-3**: WHEN `spec/doctrine/scaffold-ledger.md`'s "Release stage executed
  checks" row is read THE SYSTEM SHALL contain a retire condition naming zero
  `stage:"release"` ledger rows across two consecutive quarters as the trigger for deleting
  the `verdict.js` release profile → new doctrine pin in tests/review/verdict-doctrine.test.js

## Assumptions (escalation triggers)

- A1: Nothing invokes `observe-ci.js` with `--json` — verified 2026-08-07 by repo-wide grep
  (spec/commands, spec/workflows, spec/doctrine, .claude/, docs/: the only `--json` mentions
  near observe-ci are its own header/usage; command docs pass `--json` only to `spec-status`
  and `scope-reconcile`) — **if false:** STOP; the flag has a consumer and D1 is void.
- A2: This repo's `.claude/spec.config.json` carries no `enforcementManifest` /
  `rulesEnforcementHash` stamp (verified 2026-08-07 read), so editing
  `.claude/rules/spec-pipeline.md` and `.claude/agents/gate-scripts.md` trips no enforcement
  drift check — **if false:** re-stamp via the sanctioned `/spec:doctor --fix` route in the
  same change.
- A3: No test pins the triplicated exception sentence (verified 2026-08-07: the only
  `claude-agent-sdk` hit under tests/ is a code comment in tests/autopilot/preflight.test.js,
  not a prose pin) — **if false:** update that pin to the § Review Checks home in the same
  tests row.
- A4: tests/review/verdict-doctrine.test.js is the sanctioned home for release/verdict
  doctrine pins (it already pins release.md ↔ verdict.js prose) — **if false:** put the AC-3
  pin wherever the existing scaffold-ledger prose pins live and note the deviation.

## Rationale

The audit's headline correction lives in D2: the payload called the release profile
zero-consumer, but its consumer is `spec/commands/release.md` — a shipped command in every
host repo — and the scaffold-ledger's Verdict-derivation row rules out any stage verdict that
doesn't originate in a script. "Zero release rows in this repo's ledger" is evidence of
*never-run*, not *unconsumed*. The user ruled: keep it, schedule its expiry. The retire
condition converts an open dead-code argument into a dated, checkable trigger — the
scaffold-ledger's whole design — at the cost of a few added ledger lines against ~27 script
lines that would otherwise be deleted blind.

D1 is the clean kill: observe-ci's machine contract is the ledger row it appends, so a JSON
render duplicated a contract that already existed (the incident class the derived-not-asserted
series exists to end). D3 and D4 are truth repairs: comments and doctrine claiming things
that stopped being true when the pending state retired. D4 deliberately leaves the full
sentence where enforcement happens (§ Review Checks) — the Worker Rules and agent-file
audiences follow pointers, reviewers need the letter. Fragile spot: the two citation edits
must match the `## Review Checks` heading byte-for-byte (`§` citation rule) or `shared-for`
filtering silently drops nothing here, but the review check for mismatched citations fires.

Review waiver (2026-08-07): out-of-plan `docs/roadmap/00-overview.md` +
`docs/roadmap/01-claims-registry.md` waived — pre-existing untracked planning notes,
unrelated to this diff; same waiver as the 01/02 reviews of 2026-08-07.

## Canonical Delta

No `docs/canonical/` file owns the pipeline area — the doctrine files are their own canon.
The durable record of D2 is the scaffold-ledger row itself; no delta.
