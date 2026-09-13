---
date: 2026-09-12
status: hardened
tier: critical
area: cross-cutting
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
---

# The close stops deleting tests

## Goal

Review close stops deleting tests. It still classifies every test tagged with the closing
spec's AC-IDs, still records `tests:{born,kept,retired}` on the review row, and still tells
the session what is retirable — but it writes nothing to the tree, at CLOSE or at
`--mark closed`. The deliberate `--all-done --apply` sweep behind `/spec:doctor` check 20
becomes the ONE path that deletes a test. Two fail-safe holes in the classifier are repaired
in the same landing: a `superseded` owner spec now counts as closed alongside `done`, and a
spec file under `specs/` that cannot be read no longer lets a collided AC-ID fall open.
Done means: a close makes no commit and removes no file; the machinery that existed only to
make close-time deletion safe is gone from the driver and from the suite; and the grounding
contract tells hosts the truth about when tests die.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Close-time expiry is classification-only end to end. `doCloseWork()`'s `expire-tests.js --root <r> --spec <spec> --json` call, the review row's `tests:{born,kept,retired}`, `marks.testsExpiry`, and the refusal on a non-zero or unparseable exit all stay exactly as they are; nothing downstream of them writes to the tree. (AC-20260912-15-1) | The count is the useful half; the deletion is the half that ate reviewer-ordered tests in the field. |
| D2 | `runCloseTimeGate()` returns to gate + whole-suite only: delete the `--apply` invocation, `commitExpiry()`, `restoreExpiryPaths()`, `expiryPathsFrom()`, `expirySkipWarning()`, the restore-and-re-run red arm, and the `expiryPaths.length` branches in both the green and red paths. The resolved-gate re-run (specs/20260903/02 D4) and the `testCommand` whole-suite re-run stay, unconditional and in that order. (AC-20260912-15-2, AC-20260912-15-6) | Every one of those helpers exists only to make a close-time deletion safe; with no deletion they are dead code, and dead code that touches `git commit` is the worst kind to leave. |
| D3 | The 4th keep clause originally queued — protect tests authored between the reviewer's first return and the close, keyed on a new `marks.reviewerReturnSha` — is NOT built, now or later. `[no-ac: a decision not to build has no testable surface]` | With close-time deletion gone the silent path is closed by construction; permanent protection against a human approving the sweep's list unread does not fix that sweep's real hazard (it proposes hundreds of deletions at once). |
| D4 | The CLOSE step's 🧹 line is rewritten to state that nothing is deleted and to name the sweep command. It still prints only when `marks.testsExpiry.retired > 0`. (AC-20260912-15-1) | The old wording promised a deletion in "their own commit when you mark closed"; that commit no longer exists and a session must not go looking for it. |
| D5 | `allCitedDone()` counts an owner whose frontmatter `status` is `superseded` as closed, alongside `done`. No other status joins them. (AC-20260912-15-3) | `superseded` is the terminal retire state — a retired spec's criteria are not live, and today they pin their tests open forever. |
| D6 | A spec file under `specs/` whose read throws is recorded as an unreadable owner, not skipped. Its AC-ID prefix is derived from its path — `specs/YYYYMMDD/NN[a]-*.md` → `AC-YYYYMMDD-NN[a]-` — and every cited AC-ID starting with that prefix is treated as unresolved, so `allCitedDone()` returns false and the citing test is kept. The run warns once per unreadable file on stderr, naming the file and the derived prefix, and exits 0. (AC-20260912-15-4, AC-20260912-15-5) | Fail-safe rule D3 of specs/20260911/03: a test dies only when its whole reason to exist is proven expired, and an unreadable file proves nothing. |
| D7 | The unreadable-file rule is prefix-scoped, never global: an unreadable spec does not keep tests whose cited IDs fall outside its own derived prefix. (AC-20260912-15-5) | A global "one unreadable file freezes every retirement" would make a single stray `chmod` silently disable the sweep repo-wide, which is a different failure, not a safer one. |
| D8 | `spec/templates/grounding-contract.md` § Test expiry is rewritten: tests die at the deliberate sweep, not at close, and the host obligation's trigger is rebased from the close deadlock to a post-sweep red gate. The obligation itself — a per-AC coverage check scopes its carriers to specs that are NOT `done` — is unchanged. This repo's own `.claude/spec.config.json` `contractHash` is re-stamped in the same landing. (AC-20260912-15-7, AC-20260912-15-8) | The contract's factual claim about plugin behaviour becomes false; leaving it is worse than the stale-stamp lead every host will see once. |
| D9 | `/spec:doctor` check 20 keeps both derivations. (a)'s remedy text is restated as the only deletion path there is. (b)'s rationale drops "deadlocks every close" and names the real hazard: after a sweep, a host check demanding a carrier for every AC of a done spec goes red and stays red. `spec/scripts/coverage-scope.js`'s WHY header carries the same now-false sentence and is rebased with it; its derivation and output are untouched. (AC-20260912-15-7) | The check is still right; only the story it tells about why is now wrong. |
| D10 | `ac-drift.js` and `/spec:doctor` check 17 keep their current scoping — a `done` spec owes a carrier only for a `SHALL CONTINUE TO` criterion — unchanged, and `superseded` specs stay outside its walk. `[no-ac: a ruling to change nothing has no testable surface; AC-20260912-15-7 pins the contract prose that states the obligation]` | The sweep still deletes those tests, so the scoping is still the thing that keeps the repo green afterwards; only the moment of deletion moved. |
| D11 | AC-20260912-13-7's pin test is kept byte-identical, assertions included. Its third clause (no `⚠ expiry skipped` note when nothing retired) becomes vacuously true once that literal no longer exists; that is recorded in the amendment ADR, never fixed by editing the test. (AC-20260912-15-9) | A pin is never weakened to match a change; its first two clauses still discriminate, and the vacuous third costs nothing. |
| D12 | The predecessor reversal is recorded as one amendment ADR, `docs/adr/0021-the-close-stops-deleting-tests.md`, whose `Applies to` names specs/20260911/03 D5/D6 and specs/20260912/13 D3–D7; `docs/adr/0020-expired-tests-leave-in-their-own-commit.md` gains the matching `Amended by` backlink. `[no-ac: roadmap-amendment bookkeeping has no runtime surface]` | The repo's amendment convention: a reversal is a backlinked decision, never a silent rewrite of a two-day-old spec. |
| D13 | The ledger key `tests:{born,kept,retired}` and its shape are unchanged; only the meaning of `retired` shifts from "deleted by this close" to "retirable at this close". (AC-20260912-15-1) | Renaming the key would break every ledger consumer and rewrite history's meaning for a word change. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/expire-tests.js | MODIFY | scripts | D5 `superseded` as closed in `allCitedDone`; D6/D7 unreadable-spec owner records, path-derived prefix, stderr warning, exit stays 0; header/usage comment updated to say the script never deletes unless `--apply` is passed by a human |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D2 delete the `--apply` call, `commitExpiry`, `restoreExpiryPaths`, `expiryPathsFrom`, `expirySkipWarning` and the restore-on-red arm; `runCloseTimeGate()` becomes gate + whole-suite; D4 rewrite the 🧹 CLOSE line; D1 leave `doCloseWork()`'s classification call untouched |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D8 § Test expiry rewritten — the sweep deletes, not the close; host obligation unchanged, its trigger rebased |
| spec/commands/doctor.md | MODIFY | doctrine | D9 check 20 (a) remedy restated as the one deletion path; (b) rationale rebased off the close deadlock |
| spec/scripts/coverage-scope.js | MODIFY | scripts | D9 WHY header rebased off the close deadlock — comment only, no change to the derivation or its output |
| .claude/spec.config.json | MODIFY | other | D8 re-stamp `contractHash` to `spec-paths contract-hash` over the edited contract |
| docs/adr/0021-the-close-stops-deleting-tests.md | CREATE | other | D12 amendment ADR; `Applies to` specs/20260911/03 D5/D6 and specs/20260912/13 D3–D7; records D11's vacuous pin clause |
| docs/adr/0020-expired-tests-leave-in-their-own-commit.md | MODIFY | other | D12 `Amended by: docs/adr/0021-the-close-stops-deleting-tests.md` |
| tests/expiry/test-expiry.test.js | MODIFY | tests | AC-20260912-15-3, AC-20260912-15-4, AC-20260912-15-5 |
| tests/review/review-driver-close-expiry.test.js | MODIFY | tests | AC-20260912-15-1, AC-20260912-15-2, AC-20260912-15-6, AC-20260912-15-9 — and DELETE the three tests whose subject is gone (titles in Behavior) |
| tests/consistency/contract-stamp.test.js | CREATE | tests | AC-20260912-15-8 |
| spec/.claude-plugin/plugin.json | MODIFY | other | AC-20260912-15-10 version bump, written by `scripts/plugin-bump.js` |

Orchestrator duties, outside the table: the `.claude/spec.config.json` re-stamp runs AFTER
the `grounding-contract.md` edit lands (`node "$(spec-paths contract-hash)"` is the source of
the value); the `plugin.json` bump runs last, via
`node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`, never by hand.

## Contracts

`expire-tests.js` — exit codes unchanged: `0` = derived, `2` = usage error / `--root` not a
readable directory / (in `--spec` mode) the named spec cannot be read. An unreadable spec
that is NOT the one named by `--spec` never changes the exit code.

New stderr line, one per unreadable spec file, emitted before the stdout report:

```
⚠ spec unreadable: specs/20260911/01-alpha-twin.md — every AC-ID under AC-20260911-01- is treated as unresolved, so tests citing them are kept
```

`--json` stdout shape is unchanged: `{ scanned, tagged, kept: { class, invariant, pin, open },
retired: [{ file, acIds, title }], emptied: [...], applied: <bool> }`. An AC-ID held open by
an unreadable owner classifies as `open`, exactly like any other unresolved citation — no new
`kept` bucket.

CLOSE step line (driver stdout), printed only when `marks.testsExpiry.retired > 0`:

```
🧹 1 tests are retirable with this spec (0 files would empty) — nothing is deleted at close; sweep deliberately with: node "$(spec-paths test-expiry)" --root . --all-done --apply
```

## Behavior

**At CLOSE.** Unchanged from today: the authoritative `verdict.js` pass, then
`expire-tests.js --root <repoRoot> --spec <specRel> --json` (no `--apply`), then the ledger
append carrying `tests:{born,kept,retired}`, then the `status: done` flip. A non-zero exit or
unparseable stdout still refuses the close with status unchanged. The only difference is the
printed 🧹 line's wording.

**At `--mark closed`.** `runCloseTimeGate()` resolves the host gate and runs it over the
committed close tree; on non-zero it refuses with `gate red at close` and leaves the driver
state at `CLOSE`. It then runs the host `testCommand` over the same tree; on non-zero it
refuses with `suite red at close`. On green it returns. No expiry call, no deletion, no
commit, no restore, no warning. A close that retires 40 tests and a close that retires none
now behave identically with respect to the tree and to `git rev-parse HEAD`.

**Tests whose subject is gone** — delete these three from
`tests/review/review-driver-close-expiry.test.js` outright; never weaken them into passing:

- `AC-20260912-13-3: WHEN --mark closed runs over a host with a green gate and a green suite …`
- `a close-time gate that goes red right after expiry deletes the retired test, and turns green again once it is restored, skips the expiry with a warning instead of refusing the mark`
- `AC-20260912-13-5: WHEN the host testCommand stays red both with the retired test deleted and with it restored …`

AC-20260903-02-10 in `tests/review/review-driver-close-refusals.test.js` already pins the
`suite red at close` refusal on its own, so deleting the third leaves that behaviour covered.

**Classifier.** `allCitedDone(ids)` now answers false when any cited id starts with an
unreadable owner's derived prefix, and true for an owner whose status is `done` OR
`superseded` (and, in `--spec` mode, for the closing spec itself, unchanged). The keep-clause
order — escape class, invariant basename, `SHALL CONTINUE TO` pin dated ≥ `20260911` — is
untouched, as is the `EXPIRY_APPLIES_FROM` floor and the rule that untagged tests are never
examined.

**Repo-wide effect, measured today.** 1109 test cases scanned, 893 tagged; kept =
invariant 782, escape-class 58, pin 26, open 27; retired 0. D5 unblocks 25 tests across four
files that cite an AC-ID owned by both a `done` spec and a `superseded` twin
(`AC-20260908-01-1..8`, `AC-20260908-05-12`); all 25 stay kept by the invariant clause, so
this repo's retired count stays 0.

## Acceptance Criteria

- **AC-20260912-15-1**: WHEN the review driver reaches CLOSE for a spec whose two tagged tests
  are one `SHALL CONTINUE TO` pin and one plain test THE SYSTEM SHALL leave both test files
  byte-identical on disk, record `tests:{born:2,kept:1,retired:1}` on the review row, flip the
  spec to `status: done`, and print exactly
  `🧹 1 tests are retirable with this spec (0 files would empty) — nothing is deleted at close; sweep deliberately with: node "$(spec-paths test-expiry)" --root . --all-done --apply`
  → rewrites tests/review/review-driver-close-expiry.test.js :: AC-20260912-13-2
- **AC-20260912-15-2**: WHEN `--mark closed` runs with a green gate and a green suite over a
  host whose close recorded `retired: 1` THE SYSTEM SHALL exit `0`, leave
  `git rev-parse HEAD` byte-identical before and after the mark, and leave the retirable test
  file byte-identical on disk (the fixture's `tests/old/gone.test.js` still holds its one
  tagged test after the mark)
  → rewrites tests/review/review-driver-close-expiry.test.js :: AC-20260912-13-6
- **AC-20260912-15-3**: WHEN a tagged test cites one AC-ID owned by a `done` spec and by a
  `superseded` spec and by nothing else THE SYSTEM SHALL classify it `retired` — fixture
  `specs/20260911/01-alpha.md` (`status: done`) plus `specs/20260911/01-alpha-twin.md`
  (`status: superseded`) both defining `AC-20260911-01-1`, with
  `tests/alpha.test.js` citing it, yields
  `{"tagged":1,"kept":{"class":0,"invariant":0,"pin":0,"open":0},"retired":["tests/alpha.test.js"]}`
  under `--all-done --json` → writes tests/expiry/test-expiry.test.js
- **AC-20260912-15-4**: WHEN a spec file under `specs/` cannot be read and a `done` twin at the
  same date and number defines the same AC-ID THE SYSTEM SHALL keep the citing test, exit `0`,
  and print one stderr line naming the file and the derived prefix — with
  `specs/20260911/01-alpha-twin.md` at mode `000` alongside the `done`
  `specs/20260911/01-alpha.md`, `--all-done --json` yields
  `{"tagged":1,"kept":{"class":0,"invariant":0,"pin":0,"open":1},"retired":[]}` on stdout and
  stderr containing `specs/20260911/01-alpha-twin.md` and `AC-20260911-01-`
  → writes tests/expiry/test-expiry.test.js
- **AC-20260912-15-5**: WHEN an unreadable spec's derived prefix does not match a cited AC-ID
  THE SYSTEM SHALL classify that citation exactly as it would with the file absent — with
  `specs/20260911/02-beta.md` at mode `000` and the only tagged test citing
  `AC-20260911-01-1`, owned solely by the `done` `specs/20260911/01-alpha.md`, `--all-done
  --json` yields `retired: ["tests/alpha.test.js"]` and exit `0`
  → writes tests/expiry/test-expiry.test.js
- **AC-20260912-15-6**: WHEN `--mark closed` completes over a retiring close THE SYSTEM SHALL
  print neither `⚠ expiry skipped` nor `chore(tests): expire` on stdout or stderr, and
  `git log -1 --format=%s` SHALL NOT match `^chore\(tests\): expire`
  → writes tests/review/review-driver-close-expiry.test.js
- **AC-20260912-15-7**: WHEN `spec/templates/grounding-contract.md` § Test expiry is read THE
  SYSTEM SHALL contain neither the literal `At review close the plugin deletes` nor the
  literal `deadlocks every close`, SHALL contain the sentence naming
  `--all-done --apply` as the deletion path, and SHALL still contain the host obligation
  literal `scopes its carriers to specs that are NOT `done``; `spec/commands/doctor.md` check
  20 and `spec/scripts/coverage-scope.js` SHALL likewise no longer contain `deadlocks every
  close`
  → writes tests/consistency/contract-stamp.test.js
- **AC-20260912-15-8**: WHEN this repo's `.claude/spec.config.json` is read THE SYSTEM SHALL
  carry a `contractHash` equal to the first 12 characters of the SHA-256 of
  `spec/templates/grounding-contract.md` as `node "$(spec-paths contract-hash)"` prints it
  (today's stale value `2dfb46dfcd7a` must not survive the contract edit)
  → writes tests/consistency/contract-stamp.test.js
- **AC-20260912-15-9**: WHEN the resolved host gate exits non-zero over the committed close
  tree THE SYSTEM SHALL CONTINUE TO refuse `--mark closed` with exit `2` and `gate red at
  close`, and SHALL CONTINUE TO leave the driver state at `CLOSE`
  → reuses tests/review/review-driver-close-expiry.test.js :: AC-20260912-13-7
- **AC-20260912-15-10** `[oracle: gate]`: WHEN this spec's changes land THE SYSTEM SHALL carry
  a `spec` plugin version bump written by `node scripts/plugin-bump.js --bump --plugin spec
  --changelog "<paragraph>"`, with `node scripts/plugin-bump.js --check` green against the
  merge base → writes spec/.claude-plugin/plugin.json

## Assumptions (escalation triggers)

- **A1**: An AC-ID's path-derived prefix matches the ids the spec at that path actually
  defines. Measured at lock (2026-09-12) over all 41 spec files: 2097 of 2099 bullet-defined
  ids match their file's derived prefix; the 2 exceptions are illustrative example bullets in
  `specs/20260906/01-ac-drift-doctor-check.md`'s Contracts section, which `parseAcBullets`
  never reaches because it reads only the `## Acceptance Criteria` section — so the real
  figure is 2097/2097. Every spec path matched `specs/YYYYMMDD/NN[a]-` (0 exceptions). —
  **if false:** widen the unreadable-owner rule from a prefix to "every id cited anywhere in
  the run" for that file only, and record the deviation; never drop the rule.
- **A2**: Removing the close-time apply cannot strand a test the way a removed side effect did
  before. Grepped at lock: `expiryPathsFrom`, `commitExpiry`, `restoreExpiryPaths` and
  `expirySkipWarning` appear in `spec/scripts/spec-review-driver.js` only; `⚠ expiry skipped`,
  `chore(tests): expire` and `deleted in their own commit` appear only in the driver and in
  `tests/review/review-driver-close-expiry.test.js` (plus
  `docs/adr/0020-*.md` and `docs/canonical/review-close.md`, both handled by D12 and the
  Canonical Delta). `suite red at close` also lives in
  `tests/review/review-driver-close-refusals.test.js`, which this spec does not touch because
  that refusal survives. — **if false:** enter the missed file as a File Plan fix row before
  the build's Final gate, never after the gate reds.
- **A3**: `tests/consistency/contract-stamp.test.js` survives future expiry because its own
  text names `spec-paths` and `contract-hash`, both in the derived invariants set (keep clause
  b). — **if false:** the AC-20260912-15-7/8 carriers vanish at the next sweep; fold both
  assertions into an existing consistency file that already names an invariant script instead
  of adding one.
- **A4**: `node --test`'s default discovery never picks up `spec/scripts/expire-tests.js`; the
  file keeps that name. — **if false:** STOP — renaming it into `**/*-test.js` /
  `**/test-*.js` shape makes the plugin's own suite execute the script.
- **A5**: The three deleted driver tests are the only ones asserting on a close-time deletion.
  Verified at lock by reading all 7 tests in
  `tests/review/review-driver-close-expiry.test.js`. — **if false:** delete the missed one in
  the same batch and name it in the review deviations sidecar.

Executed micro-spikes (2026-09-12, throwaway hosts under the session scratchpad, deleted):

1. **Path-derived prefix, whole repo** — walked every `specs/**/*.md`, derived
   `AC-YYYYMMDD-NN[a]-` from each path and compared against the ids each file defines as
   `- **AC-…**` bullets. Output: `defined-ids matching path-derived prefix: 2097
   mismatching: 2` / `spec files whose path does not match specs/YYYYMMDD/NN[a]-: 0 []`. The
   2 mismatches read back as example bullets outside the AC section (A1).
2. **Unreadable-twin fail-open, reproduced** — synthetic host, `specs/20260911/01-alpha.md`
   (`done`) and `specs/20260911/01-alpha-twin.md` (`implementing`), both defining
   `AC-20260911-01-1`, one citing test. Twin readable →
   `exit=0 {"tagged":1,"kept":{…,"open":1},"retired":[]}`, stderr empty. Twin at mode `000` →
   `exit=0 {"tagged":1,"kept":{…,"open":0},"retired":["tests/alpha.test.js"]}`, stderr empty.
   That is the bug D6 closes.
3. **`superseded` pins tests open today** — same host, twin rewritten to `status:
   superseded` and readable: `exit=0 {"tagged":1,"kept":{…,"open":1},"retired":[]}`. D5 makes
   this case retire.
4. **Repo-wide classifier baseline** — `node spec/scripts/expire-tests.js --root . --all-done
   --json` → `{"scanned":1109,"tagged":893,"kept":{"class":58,"invariant":782,"pin":26,"open":27},"retired":0,"emptied":0}`.

## Rationale

The field incident is the whole argument. In salon-os `specs/20260912/09` (run
`rv_eebf17f207bd`), a guard test the reviewer found missing, the disposer ordered and the
builder added — all inside one `/spec:run` — carried that same spec's AC-IDs and was deleted
by that same review's close, silently restoring the hole review had just closed. Three tests
were restored by hand. The direct cause is that `allCitedDone` treats the closing spec as done
before the status flip, and no keep clause knows WHEN a test was authored.

The queued fix was a fourth keep clause keyed on a reviewer-return baseline. It was dropped in
favour of removing the deletion from the close entirely, on Fable 5.1's Q2 argument: "a spec's
tests die when the spec does" conflates the spec *document*, which is a planning artifact that
ends, with the *requirement*, which persists as product behaviour. Once a spec is done its
acceptance criteria are precisely the regressions worth pinning; the AC tag is provenance, not
worth. With the close no longer writing, the incident cannot recur by construction, and a
permanent keep clause buys complexity without fixing the sweep's actual hazard — that it
proposes hundreds of deletions under one approval.

The cost is named and accepted: this repo's `tests` leg in `review-legs.js` is advisory only
(always exit 0, never in BLOCKING), so it is not a brake. Removing close-time deletion leaves
**no automatic brake on test-count growth in any repo**. The 1,551 → 1,019 reduction this repo
achieved came from a manual direct batch, not from close-time automation, so the manual sweep
is the mechanism that has actually worked. The future target — coverage-subsumption
nomination with the injection-corpus catch rate as a veto — is not built here; its trigger is
the test-count ceiling actually tripping.

Why the two classifier repairs ride along: both change what the sweep proposes, and the sweep
is now the only thing that deletes, so its correctness matters more than it did yesterday, not
less. `superseded` is the terminal retire state; treating it as "not closed" pins 20 AC-IDs'
tests open forever. An unreadable file proves nothing, and today a single unreadable twin of a
collided AC-ID hands the sweep a deletion it has no grounds for.

Tier is `critical` because `spec/templates/grounding-contract.md` genuinely changes: its
statement of when the plugin deletes tests becomes false, and its deadlock paragraph describes
a sequence that can no longer occur. Every host's `contractHash` goes stale, which
`/spec:doctor` check 2 surfaces as a lead rather than a block. Leaving the contract lying to
hosts was rejected as strictly worse than one stale-stamp lead per host.

Rejected in planning: renaming the ledger's `tests.retired` key to match its new meaning
(breaks every consumer and rewrites the meaning of historical rows for a word); editing
AC-20260912-13-7's pin test to drop the clause this spec makes vacuous (a pin is never
weakened — the ADR records it instead); widening `ac-drift.js` to walk `superseded` specs
(out of scope, and a superseded spec's criteria are retired by definition).

Collision closure (2026-09-12) over the nine literals this spec retires returned one hit with
no File Plan row: `docs/canonical/review-close.md`, which carries `chore(tests): expire`.
Recorded waive — that file is the Canonical Delta's target, rewritten verbatim by the review
stage on CLEAN, and a File Plan row for it would have the build write what review must own.
Every other literals hit is a File Plan row.

No `SHALL CONTINUE TO` pin beyond AC-20260912-15-9: this spec's promises are removals, and a
removal's only durable assertion is the zero-hit literal check AC-20260912-15-6 already makes.

## Canonical Delta

In `docs/canonical/review-close.md`, replace the **Tests expire at close** bullet in full with:

- **Tests are classified at close, deleted only by a deliberate sweep.** The driver's close
  work runs `expire-tests.js --spec <spec>` after the authoritative verdict and before the
  ledger append: every test tagged with the closing spec's AC-IDs is classified *retirable*
  unless its call text cites a ledger escape class, its file names a script in the derived
  invariants set (`lib/invariants.js`: the transitive closure of scripts reachable from the
  host's config commands, hook commands and the pipeline's four entrypoints), a cited AC is a
  `SHALL CONTINUE TO` pin in a spec dated on or after 20260911, or a cited AC is unresolved.
  An AC-ID is unresolved when it belongs to a spec that is neither `done` nor `superseded`,
  when no spec defines it, or when a spec file under `specs/` cannot be read and the id falls
  under that file's path-derived prefix (`specs/YYYYMMDD/NN[a]-*.md` →
  `AC-YYYYMMDD-NN[a]-`) — the unreadable file is warned about on stderr and never changes the
  exit code. An AC-ID defined by more than one spec counts as closed only when every spec
  defining it is closed; the fail-safe holds through a number collision. Untagged tests are
  never touched. That close-time run is a **dry run in every mode the driver uses** — it
  reports what is retirable and which files that would empty, and writes nothing. The review
  row records `tests:{born,kept,retired}` from it (`retired` meaning *retirable*, not
  *deleted*) and the CLOSE step prints one 🧹 line when anything is retirable, stating that
  nothing is deleted at close and naming the sweep. A failing or unparseable classification
  refuses the close. `--mark closed` re-runs the resolved host gate and then the host's whole
  suite over the committed close tree and refuses on either red; it applies no expiry, makes
  no commit of its own, and leaves `git rev-parse HEAD` untouched. The one path that deletes a
  test is `/spec:doctor` check 20's remedy — `node "$(spec-paths test-expiry)" --root .
  --all-done --apply` — run only after one question naming the count and the files.
