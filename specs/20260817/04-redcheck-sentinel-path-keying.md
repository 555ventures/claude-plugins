---
date: 2026-08-17
status: hardened
open_markers: 0
risk: T2
area: workflows
design: false
breaking: false
depends_on: ["specs/20260817/03-redcheck-stop-resume-waiver.md"]
depended_on_by: []
brief: n/a
---

# RedCheck sentinel keyed to the File Plan path; one probe invocation per file

## Goal

`wf-build`'s TDD red-check must be able to verify test files on hosts whose runner is
invoked below the repo root (pnpm/yarn/npm workspaces, turbo, nx, cargo, Go multi-module).
Today the 6.29.0 workspace-rewrite clause and the 20260815/06 verbatim sentinel cross-check
contradict each other: the probe keys its `AUDIT_RED:<path>` / `AUDIT_GREEN:<path>` echo to
the (possibly rewritten) invocation path while `crossCheckSentinels()` exact-matches the
File Plan path, so every rewritten file reads back `observed: "not-collected"` and the run
blocks at `tdd-red-check` over genuinely-correct red/green states (intake JJ-20260817-04,
corroborated by UPWELL-20260718-01 and TRADOYO-20260813-01). Done = the probe contract keys
sentinels to the File Plan path by definition, mandates one probe invocation per file, and
the two committed red pins in `tests/redcheck-sentinel-path-keying.test.js` go green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The RedCheck prompt binds BOTH the echoed sentinel path and the reported `sentinels[].path` field to the **File Plan path verbatim** — the exact string from the Expected RED/GREEN lists — regardless of the path form handed to the runner; when the runner needed a workspace-rewritten path, the rewritten form feeds ONLY the runner invocation, never the sentinel. | The File Plan path is the file's identity; the invocation path is the probe's private coordinate system. Rejected: loosening `crossCheckSentinels()` to tolerate suffix matches — a wrong-file sentinel could then satisfy an expectation, and the strict identity match is precisely what 20260815/06 hardened. |
| D2 | The runtime observation leg mandates **one probe invocation per file** — the sentinel command (`<testCommand> <one path> && echo AUDIT_GREEN:<File Plan path> \|\| echo AUDIT_RED:<File Plan path>`) is the per-file observation; the combined `Runtime: ${args.gate.testCommand} <paths>` (plural) phrasing is removed/reworded so no instruction invites a combined multi-file run as the source of per-file verdicts. | One observation per verdict: a single combined exit code cannot attribute pass/fail to any individual file (the reporting probe could only disclose the ambiguity honestly). Rejected: combined first pass + per-file fallback — the combined run adds no evidence the per-file runs don't already produce. |
| D3 | `crossCheckSentinels()` mismatch **detail text** is enriched: when no sentinel matches an expectation but some reported sentinel's `path` is a proper path-suffix of it (or vice versa), the detail names the likely cause (workspace-rewritten invocation path leaked into the sentinel key) and the remedy (key the sentinel to the File Plan path). `observed`/`leg`/`expected` fields and every verdict outcome stay byte-unchanged. | The next path-form drift should self-diagnose instead of surfacing as a bare "no sentinel reported" that costs a host a hand-verification round. Rejected: any verdict change — this is message-only. |
| D4 | The 6.29.0 zero-collection rewrite clause is retained verbatim in intent, gaining one sentence tying it to D1: rewriting is for the runner only; the sentinel and `sentinels[].path` stay keyed to the File Plan path. | The rewrite clause fixed a real class (UPWELL-20260718-01) and its pins must stay green; only its silent interaction with the sentinel key was the defect. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/workflows/src/wf-build.body.js | MODIFY | workflows | RedCheck prompt: D1 sentinel/File-Plan-path binding, D2 per-file invocation, D4 rewrite-clause sentence; D3 detail enrichment inside `crossCheckSentinels` (message text only) |
| tests/redcheck-sentinel-path-keying.test.js | MODIFY | tests | AC-20260817-04-1, AC-20260817-04-2 (existing red pins, already re-anchored at plan for spec 03's hoist — tag AC-IDs into test names, keep the `(args\.)?` alternation and hoist-aware slice), AC-20260817-04-3 (new red test for D3) |
| tests/redcheck-sentinel-dual-leg.test.js | MODIFY | tests | AC-20260817-04-4 (regression tag on the existing fail-closed/no-sentinel case) |
| tests/redcheck-workspace-paths.test.js | MODIFY | tests | AC-20260817-04-5 (regression tag on the existing rewrite-clause pins) |

Orchestrator duties (not table rows): run `npm run build:workflows` after the body edit and
commit source + generated `spec/workflows/wf-build.js` together; run
`node spec/scripts/build-workflows.js --check` before declaring the batch done; after the
gate is green, run `node spec/scripts/suite-baseline.js --update --root .` to retire the two
now-green sanctioned rows for `tests/redcheck-sentinel-path-keying.test.js`; flip intake row
JJ-20260817-04 to `fixed@<version>` in `spec/INTAKE.md` and bump
`spec/.claude-plugin/plugin.json` semver in the same commit.

## Contracts

The `RED` schema and `crossCheckSentinels(expectations, sentinels, hasTypecheckLeg)` are
byte-compatible before and after: `sentinels[]` entries stay
`{path, sentinel, typecheckRed, typecheckEvidence, assertionsRun}`; the only contract
*clarification* (prompt-side, D1) is that `path` and the `AUDIT_RED:`/`AUDIT_GREEN:` suffix
are the File Plan path. Mismatch objects stay
`{path, expected, observed, leg, detail}` with `observed: 'not-collected'`, `leg: 'none'`
on the fail-closed paths; only `detail` strings gain the D3 diagnosis.

## Behavior

Probe flow on a workspace host after this spec: the agent tries
`pnpm --filter app test app/src/llm/foo.test.ts`, sees zero files collected, rewrites the
invocation to `src/llm/foo.test.ts` (D4, unchanged), runs the per-file sentinel command with
the rewritten path as the runner argument but echoes
`AUDIT_RED:app/src/llm/foo.test.ts` (D1), and reports
`sentinels: [{path: 'app/src/llm/foo.test.ts', …}]`. `crossCheckSentinels` matches on
identity as it does today. If a future probe leaks a rewritten key anyway, the cross-check
still fails closed exactly as today, but the mismatch detail names the cause and remedy (D3).

## Acceptance Criteria

- **AC-20260817-04-1**: WHEN the RedCheck prompt instructs sentinel emission THE SYSTEM
  SHALL bind the echoed sentinel path and the `sentinels[].path` field to the File Plan path
  even when the runner invocation path was rewritten (runner invoked with
  `src/llm/foo.test.ts` → sentinel reads `AUDIT_RED:app/src/llm/foo.test.ts`) → existing red
  pin `the sentinel instruction keys AUDIT_RED/AUDIT_GREEN to the File Plan path…` in
  tests/redcheck-sentinel-path-keying.test.js (pin regex:
  `/sentinel[\s\S]{0,400}(File Plan|original)\s+path/i` over the RedCheck block)
- **AC-20260817-04-2**: WHEN the prompt states the runtime observation leg THE SYSTEM SHALL
  mandate a separate probe invocation per file and SHALL NOT contain the combined
  `Runtime: ${…gate.testCommand} <paths>` phrasing in any form (pin, whole-source:
  `assert.doesNotMatch(src, /Runtime:\s*\$\{(args\.)?gate\.testCommand\}\s*<paths>/)` — the
  `(args\.)?` alternation survives spec 03's hoist of the prompt into
  `redCheckPrompt(…, gate, …)`) → existing red pin in
  tests/redcheck-sentinel-path-keying.test.js
- **AC-20260817-04-3**: WHEN `crossCheckSentinels` finds no sentinel keyed to an expectation
  but a reported sentinel's `path` is a proper path-suffix of that expectation
  (`src/llm/foo.test.ts` reported vs `app/src/llm/foo.test.ts` expected) THE SYSTEM SHALL
  return the same fail-closed mismatch (`observed: "not-collected"`, `leg: "none"`) with a
  `detail` that names the workspace-rewrite cause and the File-Plan-keying remedy (detail
  contains both `File Plan` and a rewrite/workspace cue) → new red test in
  tests/redcheck-sentinel-path-keying.test.js
- **AC-20260817-04-4**: WHEN a reported sentinel's path matches no expectation THE SYSTEM
  SHALL CONTINUE TO fail closed as an UNVERIFIED mismatch, never resolving the file to green
  → tag the existing no-sentinel/fail-closed case in tests/redcheck-sentinel-dual-leg.test.js
- **AC-20260817-04-5**: WHEN the runner collects zero test files THE SYSTEM SHALL CONTINUE
  TO instruct rewriting invocation paths relative to the command's workspace before
  concluding, reporting `not-collected` only when no rewrite collects them → tag the two
  existing pins in tests/redcheck-workspace-paths.test.js

## Assumptions (escalation triggers)

- A1: The two committed pin regexes (quoted verbatim in AC-1/AC-2) are satisfiable by prompt
  prose that also reads naturally to the probe agent — **if false:** adjust the test in the
  same File Plan row pair, but never weaken what it pins (a weaker regex that would re-admit
  the defect is a doctrine change → escalate).
- A2: `wf-build` is the only workflow that produces or consumes `AUDIT_RED`/`AUDIT_GREEN`
  sentinels. Full grep inventory (refuter-corrected 2026-08-17): wf-build source/generated,
  `spec/INTAKE.md`, `spec/doctrine/scaffold-ledger.md`, `docs/canonical/workflows.md`,
  `specs/20260813/05-*.md`, `specs/20260815/06-*.md`, and two LIVE pin suites —
  `tests/redcheck-load-failure-attribution.test.js` and
  `tests/workflows/red-check-sentinel.test.js`. Neither live suite pins the sentences D1/D2
  rewrite (they pin `AUDIT_RED:`/`AUDIT_GREEN:` presence, `assertionsRun`, the stub
  protocol, and the "Do not edit any file, with exactly one exception" sentence), but the
  worker MUST run both suites after editing the shared prompt paragraph and before
  declaring the batch done — **if either goes red:** the edit collided with a pinned
  sentence; fix the edit, never the pin.
- A3: Per-file probe invocations cost runner startup once per file; on slow-boot runners this
  is spend, not correctness — **if false** (a host where per-file runs are infeasible):
  blocked return; do not silently restore combined runs.
- A4: The pin file's slice anchors (`function redCheckPrompt` when present, else
  `phase('RedCheck')`, ending at `FAIL CLOSED`) keep covering the prompt text after spec
  03's hoist — the slice logic already prefers the hoisted function (amended at plan,
  2026-08-17, on the refuter's finding) — **if false:** the prompt moved somewhere neither
  anchor covers; fix the edit or extend the slice in the same row pair, never weaken what
  it pins.

## Rationale

The defect is a contract contradiction, not a broken function: 6.29.0 taught the probe to
rewrite paths so workspace-filtered runners collect files, and 20260815/06 taught the
cross-check to trust nothing but verbatim sentinels — nobody stated which path form the
sentinel carries. The class fix is coordinate-free (D1): identity (File Plan path) is pinned
at the contract layer, and any invocation-path form stays legal. Loosening the cross-check
was rejected because its strictness is load-bearing (a suffix-tolerant match would let a
sentinel from a sibling file satisfy an expectation — exactly the plausible-but-wrong class
this pipeline's verification exists to kill). D2 follows the same evidence rule the rest of
the probe already obeys (`assertionsRun` attribution): one observation per verdict. D3 is
deliberately message-only; the reported run cost the host a hand-verification round plus a
`tdd: false` waiver purely because the failure didn't explain itself. Fragile spots for
execution: after depends-on spec 03 lands, the prompt lives in the hoisted
`redCheckPrompt()` function, not inline in the phase block — the pins' slice logic and the
AC-2 regex were re-anchored at plan time to survive that hoist (refuter finding, fixed in
the committed pin, not just in this spec); keep those anchors intact (A4), run the two live
sentinel pin suites after any prompt-paragraph edit (A2), and remember `wf-build.js` is
generated (never a File Plan row; regenerate + commit together).

Refuter findings disposition: (1) AC-2 pin regex would pass spuriously after 03's
`args.gate`→`gate` rename — ACCEPTED, fixed in the committed pin (alternation + whole-source
doesNotMatch + hoist-aware slice). (2) A2's grep inventory was incomplete — ACCEPTED,
corrected with a mandatory post-edit run of the two live sentinel suites. (3) Canonical
Delta "None" skipped `docs/canonical/workflows.md` — ACCEPTED, delta written below.

## Canonical Delta

`docs/canonical/workflows.md`, section "Evidence rides exit codes, not model reading":
append — "The sentinel's `<path>` (both the `AUDIT_RED:`/`AUDIT_GREEN:` suffix and the
reported `sentinels[].path`) is the File Plan path verbatim, never the path form handed to
the runner: on workspace-filtered hosts the invocation path may be rewritten so the runner
collects the file, but the sentinel key is the file's identity. Each file gets its own
probe invocation — one observation per verdict; a combined multi-file run cannot attribute
a per-file exit code."

INTAKE row JJ-20260817-04 flips to `fixed@<version>` and the two suite-baseline rows retire
(orchestrator duties above).
