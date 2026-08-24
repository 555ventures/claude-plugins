---
name: spec-20260824-06-range-identity-pin-pattern
description: Multi-file red-pin pattern for a Decision that threads new identity fields (base/head/dirty sha) through three existing exec-a-script pin sites at once.
metadata:
  type: project
  reviewed: 2026-08-24
---

Spec 20260824/06 (review-range-identity) required updating 3 SEPARATE existing byte-equal
re-run tests (`review-driver.test.js`, `stopped-row-durability.test.js` — both pin the
GATE_RED hard-stop row — plus `escalate-row.test.js`'s new AC-7) with the same shape:
extend `reArgs`/assert blocks to derive `--base-sha`/`--head-sha`/`--dirty` from the row's own
`appended.diff.{base,head,dirty}`, guarded by `typeof appended.diff.base === 'string'` so the
reArgs extension itself never throws pre-image (it just doesn't add the flags, and the new
standalone `assert.match(...40hex.../)` lines are what actually go red).

**Why this matters for future dispatches naming "the byte-equal re-run test(s)":** grep the AC's
own File Plan row text for every file it names before assuming there's only one — this spec's
row literally listed two files (review-driver + stopped-row-durability) plus a third undeclared
site (escalate-row's own new AC-7) that mirrors the same driver function
(`writeEscalateRow()` vs `runHardStopVerdict()`/`doCloseWork()`) and needed the identical
sha-derivation logic even though it wasn't one of the "update in place" rows — it was a
brand-new AC in a third file that happens to duplicate the mechanism.

**Fixture trick for the dirty-flag AC:** `git status --porcelain --untracked-files=no` ignores
untracked files entirely, so an uncommitted TRACKED file edit (e.g. rewrite `src/foo.js` after
its commit, before the closing `--mark dispositions` call) drives dirty:true, while writing a
brand-new untracked scratch file drives dirty:false — no need to touch `.gitignore` since the
review sidecar (`<spec>.review/`) is already untracked scratch by construction.

**Order fixture for the 40-file cap AC:** name stray files zero-padded (`stray00.js`..`stray40.js`)
so lexical sort (scope-reconcile.js always `.sort()`s `outOfPlan`) equals creation/insertion
order — makes "first 40 in order" trivial to assert via `[...strays].sort().slice(0,40)`.

See also [[scope-reconcile-degenerate-stems]] for other scope-reconcile fixture gotchas, and
[[new-spec-ac-green-pre-change]] — this spec's AC-4 and AC-10 were correctly-green-pre-change
SHALL-CONTINUE-TO pins (AC-10 in particular: a NEW `files` array input shape fed to
`countLegFinding`, which already only reads `observed.outOfPlan` and ignores `files.length`, so
no red was expected or required there).
