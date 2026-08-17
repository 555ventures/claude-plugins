# Deviations — specs/20260816/03-file-plan-table-scoped-parsing.md

Forced-but-unblocking departures recorded during build (2026-08-17). Folded into findings by
`/spec:review` at close.

## D10 suite pre-image check reported `preNewFailing=2` — attributed OUT of this build's diff

`suite-baseline.js --check --pre .claude/spec-preimage/20260816-03.json` reported:

```
newFailing=0 fixedNotRemoved=0
PRE-NEW-FAILING tests/ac-matrix-duplicate-id.test.js :: JJ-20260817-01: a second criterion reusing an AC-ID is a hard duplicate-ac finding and counts toward uncovered …
PRE-NEW-FAILING tests/ac-matrix-duplicate-id.test.js :: JJ-20260817-01: a skipped test mapping to a duplicated AC-ID is never sanctioned by either copy's [env:] declaration
preNewFailing=2 preFixed=0
```

Per Phase 4 this is nominally BLOCKING into the repair path. It was **not** repaired, and the
build did not weaken, retag, or delete either pin. Attribution was established by execution
instead:

1. **Both tests fail identically against the pre-change parser.** `spec/scripts/lib/file-plan.js`
   was restored to its `c467bc3` content and the file re-run: `pass 0 / fail 2`, byte-identical
   assertion output. This build's diff is not the cause.
2. **Both tests were created after this build's pre-image snapshot.** Snapshot written
   `11:28:08`; `tests/ac-matrix-duplicate-id.test.js` created `11:30:15`,
   `.claude/suite-baseline.json` amended `11:30:38`, `spec/INTAKE.md` amended `11:31:33` — all
   during this build, by a **concurrent session** landing INTAKE item JJ-20260817-01
   (`ac-matrix.js` never adjudicates AC-ID uniqueness; `acById` is a last-wins Map). They are
   that item's TDD red pins, sanctioned-red in `.claude/suite-baseline.json`, and red because
   their feature is unimplemented.

The failures are therefore genuinely pre-existing relative to this spec, but invisible to the
pre-image because the pre-image binds to a single instant and a concurrent session moved the
suite underneath it. The repair loop is structurally incapable of fixing this class — the only
"repair" would be implementing an unrelated INTAKE item.

Because attribution was executed-proven negative, the Fable retainer was not consulted: the
consult's question ("is this our red?") was already answered by execution, and the spec's intent
was never ambiguous. Recorded here rather than absorbed silently.

**Class worth intake:** `suite-baseline.js --snapshot` / `--check --pre` assumes exclusive
repo access for the duration of a build. Concurrent sessions in this repo are normal (there is
already a `[host]` gotcha for them racing the same semver), so `preNewFailing` can report a
false BLOCK whose only honest resolution is out-of-band attribution work. A cheap closure would
be for `--check --pre` to subtract rows whose test file did not exist at snapshot time, or to
subtract rows the declared `.claude/suite-baseline.json` sanctions and the pre-image predates.

## Out-of-plan files present in the working tree, not written by this build

`scope-reconcile --json` reported `outOfPlan: [".claude/suite-baseline.json",
"spec/INTAKE.md", "tests/ac-matrix-duplicate-id.test.js"]`. All three belong to the concurrent
JJ-20260817-01 session above. The checkpoint commit was scoped to this spec's own paths so the
other session's uncommitted work was neither committed nor disturbed.

That session then committed its work as `f85d07a` **between** this build's Phase 0 base capture
(`c467bc3`) and this build's own commit (`1fe0ad1`). `diff_base` in the spec frontmatter was
therefore corrected from `c467bc3` to `f85d07a` at build close, so `/spec:review` diffs exactly
this build's work and not the unrelated intake commit. This is a departure from the rule that
build writes `diff_base` once at the Phase 0 status flip and never again; it is recorded rather
than taken silently.
