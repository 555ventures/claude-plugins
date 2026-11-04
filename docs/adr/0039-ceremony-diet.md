# 0039. Ceremony diet: size, lanes, test lifecycle, release-time bump

- Status: accepted
- Date: 2026-11-03
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261103/13-a-change-is-sized-by-its-files.md)

## Context

The pipeline's per-spec ceremony was sized for large changes and is now paid by small ones. The
2026-11-03 audit over the last 36 merged specs: median 188 production lines and a 14-minute build;
10 of 36 under 100 production lines, each carrying 300–630 lines of ceremony (spec, ledger rows,
lock/close/ledger commits, bump). 69% of commits since 2026-10-25 are process commits. 106 spec
pairs share 3+ files within 7 days — the ~12-row Decomposition cap and the "second primary area"
split rule slice one capability into siblings that then collide. The fix lane triggers on ">2
`layerGroups`" and this host declares one group, so `/spec:fix` never fires here and every repair
is a spec. `expire-tests.js`'s keep clause (b) — "names an invariant script and spawns a process" —
pins 1,193 of 1,289 tagged tests forever, and the deliberate `--all-done --apply` sweep has never
run; test lines grew +20,963/−19,617 since 2026-10-01 against +11,474/−9,439 production lines.
`plugin.json` bumps once per spec, so every spec branch races the same semver and the bump is
the most-repaired File Plan row (pipeline rules § Gotchas, fourth bump surface).

Prior art the decisions rest on: Google's small-CL guidance and trunk-based development (the
landing unit is small and reviewable, the *decision record* is not per landing unit); RFC/ADR
practice (one record per decision, never per change); changesets and semantic-release (the
version is computed at release from what shipped, never written per change); the test pyramid
and TDD's scaffolding tests (a test that drove a change out is deleted once the change is
stable; only invariants are kept); Betterer and Sonar's "clean as you code" (a ratchet guards new
code only, and only after a measured baseline exists).

## Options considered

- **Keep the shape, tune thresholds** — raise the row cap, leave the lane trigger and bump as
  they are. Removes none of the per-spec commits and leaves the fix lane dead on this host.
- **One-file spec** — collapse spec, ledger and ADR into one record per change. Loses the
  machine-readable File Plan and AC matrix every driver parses.
- **Diet by six cuts** (chosen) — lane floor by size, one capability per spec with
  merge-forward, tier by file, bump at release, scaffolding tests by default, metric before
  guard. Each cut is a separate decision below so a later ADR can revert one without the rest.

## Decision

D1 **Lane floor.** A change under ~100 production lines touching ≤3 non-test files goes to
`/spec:fix` regardless of `layerGroups`; the Direct lane keeps its no-behaviour-change
definition. core § Pipeline Entry is amended accordingly.

D2 **A spec is one capability.** The Decomposition cap rises from ~12 to ~30 source-layer File
Plan rows; "a second primary area" is no longer an automatic split trigger. Landing stays in
small green waves and checkpoint commits inside the spec. Merge-forward at lock: a draft sharing
≥3 non-test files with a spec locked in the last 7 days folds into it or declares `depends_on` —
a new `/spec:plan` lock-step check over the existing collision-closure machinery.

D3 **Tier is a property of files touched** (continues specs/20261103/07), never of the spec as a
whole; a doctrine-only change is never critical.

D4 **Version bump at release.** `plugin.json` bumps once per `/spec:release` — or per
`/git:merge` to main where no release stage exists — from the ledger's shipped specs, not per
spec. `.claude/rules/conventions/doctrine.md`'s per-change bump line and
`tests/consistency/plugin-bump-gate.test.js` change to match. Lock, close and ledger commits per
spec collapse to one machine commit per transition where the drivers allow.

D5 **Test lifecycle.** An AC test is scaffolding by default and expires at review close
automatically — `expire-tests.js --apply` runs inside the close step, not as a manual doctor
check. Keep clause (b) keeps only tests explicitly tagged `invariant`/`pin`, never because they
spawn a process. The expiry scanner reads the host's declared runner grammar
(specs/20261102/01, `testCaseScanner`) so pytest/vitest hosts expire too. The optional config key
`slowTestCommand` runs once at close and once at release, never in the build or review-legs loop.

D6 **Metric before guard.** `/spec:status` gains two lines derived from the ledger — suite runs
per spec and the test:production line ratio. No blocking ratchet until core § Incident Policy's
third-recurrence admission bar is met.

Not decided here: the run cache (run-cache spec, same day).

## Consequences

- A sub-100-line repair costs a fix row and one commit, not a spec, three machine commits and a
  bump; the fix lane fires on this host for the first time.
- Specs get larger and fewer; sibling collisions fall because a draft that overlaps a fresh lock
  folds into it instead of racing it.
- One semver per release means two branches never race one number; a branch no longer owes a
  bump at its gate, so `plugin-bump.js --check` moves from the per-branch gate to the landing
  step.
- Tests that drove a change are deleted at close by default; what survives is what a spec
  explicitly pinned (`SHALL CONTINUE TO`) or a test tagged `invariant`. The suite shrinks with
  every close instead of growing; a kept test is a deliberate choice, visible in the spec.
- The first close after this lands deletes every retirable test the never-run sweep accumulated;
  the host gate decides whether the deletion stays, as today.
- The two status lines are the baseline a future ratchet needs; until one is earned under
  § Incident Policy, nothing blocks on them.
- Accepted: `slowTestCommand` runs less often (close and release only), so a slow-tier regression
  surfaces at close rather than at the first review iteration.

## Applies to

None: no roadmap brief carries these decisions — this repo's briefs are all done or retired.
Carried by specs/20261103/13-a-change-is-sized-by-its-files.md. Amends core § Pipeline Entry,
§ Decomposition and § Tiers; `spec/templates/grounding-contract.md` § Test expiry and § Test
tiers; specs/20261101/07's "once per review legs iteration and never at close" for
`slowTestCommand` is superseded by D5, as is specs/20260912/15's "close-time expiry is
classification-only" (its D1–D4); neither spec file is edited beyond the retired-AC tags the
carrying spec records.

## Dissents

- "Keep the bump per spec — the changelog paragraph is the only place a spec says what it did
  in one sentence." Rejected: the ledger row and the spec's Goal already say it; the release
  changelog is assembled from them.
- "A blocking test:production ratchet now, Betterer-style." Rejected under core § Incident
  Policy: no measured baseline exists yet, so Materiality and Removability cannot be filled.
- "Keep clause (b) protects the pipeline's own invariants without anyone tagging them."
  Rejected: it kept 93% of tagged tests, which is no classification at all; an invariant worth
  keeping is worth one tag.
