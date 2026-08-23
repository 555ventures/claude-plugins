---
date: 2026-08-23
status: implementing
diff_base: ce6488c9b8c8d63a551c4f7469ef982cf548d101
tier: standard
area: review-pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 13
open_markers: 0
---

# Deviations Sidecar Backstop — mechanized shape + fold enforcement

## Goal

The deviations sidecar (`<spec minus .md>.deviations.md`) is today pure convention: build
sessions append departure entries by hand, review folds and deletes the file by hand, and
nothing catches a fold that never ran or an entry written in a shape the ledger count cannot
see. This spec gives the existing convention deterministic teeth inside the review driver's
existing machinery: the driver observes and validates the sidecar whenever it derives state,
enumerates every entry into the printed CLOSE step, and refuses `--mark closed` while the
sidecar still exists on disk or while its last observation recorded shape-invalid lines.
Done means: a skipped fold or a count-invisible entry is a driver refusal with a printed
remedy, not a silent loss — with zero new legs, agents, scripts, or ledger fields.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The backstop lives entirely inside `spec-review-driver.js`'s existing machinery — observation during state derivation, enumeration in the CLOSE step print, refusals in the `--mark closed` handler (AC-20260823-07-1, AC-20260823-07-3). No new review leg, no new script, no new `spec-paths` key; `verdict.js` and `review-legs.js` are untouched. | Brief 13's Out of scope fences off new legs/agents; the driver's mark-verification pattern (refuse with remedy, exit 2) is exactly this shape already. |
| D2 | Entry grammar is the loose bullets-only shape the ledger count already depends on (JJ 2026-08-23): a sidecar line is valid iff it is blank, `#`-prefixed, a `- ` bullet start, or a whitespace-indented continuation whose entry is still open (see Contracts); anything else is a malformed line (AC-20260823-07-2, AC-20260823-07-5). | The brief's `- [<batch id>] … → …` shape is stale: the instruction died in the v7 redesign and 0 of 15 historical sidecars use it; enforcing it would redesign the convention the brief says to mechanize. |
| D3 | Teeth are mark refusals, not finding rows: `--mark closed` exits 2 while the sidecar exists on disk (fold not done), and exits 2 when the last persisted observation records ≥1 malformed line even after deletion (AC-20260823-07-1, AC-20260823-07-3). Each refusal names its remedy; state is left unchanged. | Stronger than a disposition finding and rides the driver's existing refusal contract; the manifest/verdict surface stays byte-identical for `--json` consumers. |
| D4 | Fold evidence is prevention + enumeration, not same-commit forensics: the brief's "deletion commit must also touch Gotchas/Rationale" check is dropped (AC-20260823-07-4 carries the enumeration; AC-20260823-07-1 the prevention). | Measured 2026-08-23: all 4 sampled historical close commits touch the spec file anyway (the status flip rides the close commit), so the same-commit condition is vacuously satisfiable and proves nothing. |
| D5 | The driver persists its sidecar observation (`entries`, `malformed`) into the review sidecar state on every derivation while the file exists; the `closed` check reads the last persisted observation, so the refusal survives session hand-offs and the file's own deletion (AC-20260823-07-2, AC-20260823-07-3). | At `--mark closed` time a folded sidecar is already gone from disk; without a persisted observation the malformed check would be blind exactly when it must fire. |
| D6 | Uncommitted deletion stays refused by the existing dirty-tree check: an unlinked-but-uncommitted sidecar is an unexpected dirty path and refuses `closed` as today (AC-20260823-07-7 pins it). | Already-correct behavior; the pin stops a future refactor of the dirty filter from silently allowlisting deviations paths. |
| D7 | No new ledger field (JJ 2026-08-23): fold outcome (promoted/absorbed/rejected) is a session judgment — recording it would be attestation, not derivation — and the build row's `deviations` count already carries cross-spec discoverability. Revisit only on a second incident. `[no-ac: a decision NOT to build a surface has no testable carrier; absence is asserted by no test existing]` | The repo's stated bar: don't spend a new mechanism until an incident shows the gap costs something. |
| D8 | Doctrine restates the mechanization where the humans read it: `build.md`'s worker-contract sidecar line gains the entry-shape sentence (one `- ` bullet per departure, continuations indented — flush-left prose is invisible to the ledger count and refused at review close); `review.md`'s CLOSE rules bullet documents the driver's enumeration + refusals. `[no-ac: prose restatement of behavior AC-1..5 already pin; doctrine carries no separately testable surface]` | Workers and review sessions read doctrine, not driver source; the behavior itself is pinned by AC-1..5. |
| D9 | `spec/.claude-plugin/plugin.json` bumps to 7.26.0 (a target, not a pin — semver-race gotcha applies) with the last-3-versions changelog paragraph in `description`. `[no-ac: version metadata; pinned by the host's review check "doctrine/behavior change without a bump is hard"]` | Every behavior change bumps the owning plugin's semver. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-review-driver.js | MODIFY | scripts | Sidecar observation on state derivation (D2, D5), CLOSE-step entry enumeration (D4), two `--mark closed` refusals (D3) |
| spec/commands/review.md | MODIFY | doctrine | CLOSE rules bullet: driver enumerates entries and refuses `closed` while the sidecar exists or a malformed line is recorded (D8) |
| spec/commands/build.md | MODIFY | doctrine | Worker-contract sidecar line gains the entry-shape sentence (D8) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump target 7.26.0 + changelog paragraph (D9) |
| tests/review/deviations-backstop.test.js | CREATE | tests | AC-20260823-07-1, AC-20260823-07-2, AC-20260823-07-3, AC-20260823-07-4, AC-20260823-07-5, AC-20260823-07-7 |
| tests/review/review-driver.test.js | MODIFY | tests | Tag the existing closed-success test with AC-20260823-07-6 (SHALL CONTINUE TO pin; no assertion weakened, no behavior change) |

## Contracts

**Sidecar path** (existing, unchanged): `<spec path minus .md>.deviations.md`, resolved
relative to the driver's `repoRoot` (worktree-aware for worktree reviews).

**Entry grammar (D2)** — a line is classified in order:

```
blank         /^\s*$/                        → allowed; closes the open entry
header        /^#/                           → allowed (the conventional "# Deviations — …" line)
bullet        /^- /                          → allowed; opens an entry
continuation  /^\s+\S/ while an entry is open → allowed (an entry stays open across bullet
                                               and continuation lines; a blank or header
                                               line closes it)
anything else                                → MALFORMED
```

Literal examples: `- D13's version target was stale` → bullet (entry 1);
`  session landed 7.20.0 mid-build` immediately after it → continuation of entry 1;
`Forced-but-unblocking departures recorded during build.` (flush-left, no `- `) → malformed;
`  stray indented line` directly after a blank line or header → malformed (no open entry).
`entries` = count of bullet lines (identical to build's ledger `^- ` count).

**Persisted observation (D5)** — written into the driver's existing review-sidecar state
(the same JSON `saveSidecar()` already owns), overwritten on every derivation while the
file exists on disk:

```json
"deviations": {
  "entries": 3,
  "malformed": [ { "line": 7, "text": "<the line, bounded to 120 chars at write>" } ]
}
```

**`--mark closed` refusals (D3)** — checked before the existing dirty-tree check, both
exit 2 via the driver's existing `die()`, state unchanged:

1. Sidecar exists on disk → re-observe + persist first, then refuse: if malformed lines
   exist, list them (line number + text, first 10 then `… and N more`) with the repair
   instruction; else name the CLOSE step's fold-then-delete-then-commit remedy.
2. Sidecar absent but last persisted observation has `malformed.length > 0` → refuse,
   listing the recorded lines and the restore remedy
   (`git checkout <ref> -- <sidecar path>`, repair, re-run the driver so it re-observes
   clean, fold, re-commit, re-mark).

No observation ever recorded and no file on disk → both checks pass vacuously (the
no-sidecar review is unchanged).

**CLOSE step print (D4)** — when an observation exists, step 2's fold instruction is
followed by an enumeration block: one line per entry, `  <n>. <first line of the bullet,
bounded to 120 chars>`, plus a `⚠️ malformed:` block when applicable (same 10-line cap).
No sidecar ever observed → the CLOSE print is byte-identical to today.

## Behavior

Normal flow: build commits the sidecar; review's first driver invocation observes and
persists `{entries, malformed}`; the CLOSE step prints the fold instruction with every
entry enumerated, so the folding session has the full content in the instruction channel;
the session folds, deletes the file, makes the close commit; `--mark closed` re-checks —
file gone, observation clean — and passes.

Forgot-the-fold flow: the sidecar rides the close commit unchanged; `--mark closed`
refuses (refusal 1) naming the fold; the session folds, amends or commits, re-marks.

Malformed flow: a flush-left paragraph was appended during build; the observation records
it; the CLOSE print flags it; if the session deletes the file without repairing,
`--mark closed` refuses (refusal 2) with the restore remedy — the recorded 120-char
excerpts are the surviving evidence even if the file was never committed.

Accepted residual (recorded, not closed): a session that folds and deletes the sidecar
before ever running the driver leaves no observation, and `closed` passes vacuously —
this requires violating the review protocol's step 1 (driver first), which the state-gate
already makes the entry point. Not worth a git-history sweep at close.

## Acceptance Criteria

- **AC-20260823-07-1**: WHEN `--mark closed` is passed while `<spec minus .md>.deviations.md`
  exists on disk THE SYSTEM SHALL exit 2, naming the sidecar path and the
  fold-then-delete-then-commit remedy, and leave the driver state at CLOSE (a re-run with no
  mark reprints the CLOSE step) → tests/review/deviations-backstop.test.js
- **AC-20260823-07-2**: WHEN the driver runs while a sidecar exists on disk THE SYSTEM SHALL
  persist a `deviations` observation into the review-sidecar state with `entries` = the count
  of `^- ` lines and one `malformed` row per invalid line (e.g. a file with 2 bullets, one
  wrapped continuation, and the flush-left line `Recorded during build.` on line 5 →
  `{"entries":2,"malformed":[{"line":5,"text":"Recorded during build."}]}`), overwriting any
  prior observation → tests/review/deviations-backstop.test.js
- **AC-20260823-07-3**: WHEN `--mark closed` is passed after the sidecar was deleted but the
  last persisted observation records ≥1 malformed line THE SYSTEM SHALL exit 2, print each
  recorded line as `<line>: <text>` (first 10, then `… and N more` when more), and name the
  restore remedy including the literal fragment `git checkout` and the sidecar path →
  tests/review/deviations-backstop.test.js
- **AC-20260823-07-4**: WHEN the driver prints the CLOSE step and the persisted observation
  has `entries ≥ 1` THE SYSTEM SHALL enumerate each entry's first line in the step text,
  numbered, each bounded to 120 characters (e.g. an entry whose bullet line is 200 chars
  long appears as its first 120 chars) → tests/review/deviations-backstop.test.js
- **AC-20260823-07-5**: WHEN a sidecar contains only blank lines, `#`-prefixed lines, `- `
  bullets, and indented continuations inside open entries THE SYSTEM SHALL record
  `malformed: []`, and after the session folds, deletes, and commits the deletion,
  `--mark closed` SHALL exit 0 → tests/review/deviations-backstop.test.js
- **AC-20260823-07-6**: WHEN no deviations sidecar ever existed for the spec THE SYSTEM
  SHALL CONTINUE TO accept `--mark closed` on a tree clean beyond the review sidecar and
  retained evidence → existing closed-success test in tests/review/review-driver.test.js,
  tagged with this AC-ID
- **AC-20260823-07-7**: WHEN a committed sidecar is unlinked from disk but its deletion is
  not committed THE SYSTEM SHALL CONTINUE TO refuse `--mark closed` as a dirty-tree
  refusal naming the sidecar path among the unexpected paths →
  tests/review/deviations-backstop.test.js

## Assumptions (escalation triggers)

- A1: Build sessions commit the sidecar before review starts (15/15 historical sidecars
  are tracked; build Phase 4's checkpoint commit lands them) — **if false:** refusal 1
  still fires on the untracked file; only the restore remedy weakens (nothing to
  `git checkout`), and the persisted 120-char excerpts become the surviving evidence.
  Executed check (2026-08-23): `git log --all --diff-filter=A --name-only -- '*.deviations.md'`
  lists 15 sidecars, every one committed by its build.
- A2: The review protocol's step 1 (run the driver before doing anything) holds, so the
  driver observes the sidecar before any fold — **if false:** the vacuous-pass residual in
  Behavior applies; accepted, recorded, no fallback needed.
- A3: A committed, unchanged sidecar is invisible to the existing dirty-tree check.
  Executed check (2026-08-23, scratch repo): commit `specs/x/01-a.deviations.md`, then
  `git status --porcelain` and `--untracked-files=all` both print empty — so today's
  `closed` mark cannot see a lingering sidecar; this is the gap refusal 1 closes.
  **if false:** the refusal is redundant but harmless — STOP only if tests show a conflict.
- A4: The loose grammar matches the real corpus. Executed check (2026-08-23): the D2
  classifier run over all 15 historical sidecars → 95 bullets, 21 headers, 327
  continuations, 52 malformed lines confined to 6 files — every malformed line is
  flush-left prose (preamble sentences, one fully free-form narrative file with fenced
  code blocks, one unbulleted entry), i.e. exactly the content invisible to the ledger
  count. **if false:** re-run the classifier and adjust the grammar in D2 before build.
- A5: Same-commit fold forensics would be vacuous. Executed check (2026-08-23):
  `git log --diff-filter=D` + `git diff-tree --name-only` over 4 historical sidecar
  deletions — all 4 deleted in the review close commit, and every close commit also
  touches the spec file (the status flip), so "deletion commit touches spec-or-rules"
  can never fail. **if false:** irrelevant — D4 already drops the check.
- A6: The driver's review-sidecar state JSON tolerates an additive `deviations` key
  (hand-rolled reader, no schema validation rejects unknown keys) — **if false:** blocked;
  ask before touching the sidecar state format.

## Rationale

The brief was written 2026-08-10, pre-v7: it cites a worker line-shape instruction
(`- [<batch id>] … → …`) that no longer exists anywhere in doctrine and that no historical
sidecar ever used, and it predates the review driver that now owns close sequencing. JJ
ruled 2026-08-23 to mechanize the convention as it actually is (D2) rather than restore
the labeled format — restoring it would be the redesign the brief's own Out of scope
forbids. The fold-completeness design also moved under measurement: the brief's proposed
forensic check (sidecar deletion in the same commit that touches Gotchas or Rationale) is
vacuously satisfiable because every close commit touches the spec file for the status flip
(A5), so the spec replaces forensics-after-loss with prevention-before-loss: refusal while
the file exists, plus forcing every entry through the printed CLOSE instruction (D4). The
enumeration is the honest limit of mechanization — no deterministic check can verify the
*judgment* of a fold, only that the content passed through the session's field of view.
Fold-outcome ledger visibility was considered and declined (D7): it would be self-attested
at exactly the moment the backstop exists to distrust, and the build row's `deviations`
count already answers "where did forced departures cluster". Fragile spots to watch during
execution: the CLOSE print is partially pinned by existing driver tests (hygiene listing),
so the enumeration must be additive; and refusal 1 must run its re-observe *before*
refusing, or a repair made after the last derivation would be invisible to the malformed
check. Retroactive validation of already-folded sidecars stays out of scope per the brief.

## Canonical Delta

`docs/canonical/review.md` — under the close-sequence description, add:

> **Deviations backstop (specs/20260823/07).** The review driver validates the deviations
> sidecar against the bullets-only entry grammar whenever it derives state, persists the
> observation (`entries`, `malformed`) in the review sidecar, and enumerates every entry
> into the printed CLOSE step. `--mark closed` refuses (exit 2, remedy named) while the
> sidecar still exists on disk, or while the last observation records a malformed —
> flush-left, count-invisible — line, even after deletion. Fold outcome is deliberately
> not ledgered; the build row's `deviations` count remains the cross-spec signal.
