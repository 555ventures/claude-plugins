'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// UPWELL-20260810-02: a review left unattended waiting on CI loses its diff base —
// upwell spec 20260807/01 (review interrupted 2026-08-07 blocked solely on a red CI
// leg, resumed 2026-08-09): four later specs had landed on main, so the naive
// `git diff <pre-build>..HEAD` carried 27 files, 26 from other specs, two of them not
// yet reviewed — an unreviewable blob that either stalls the spec forever or launders
// unreviewed code through its panel. The host recovered by hand: panel against a
// worktree detached at the spec's last commit, executed legs against main, drift
// attribution per hunk. Fix contract (the gotcha's own upstream ask): wf-review
// detects HEAD != the spec's last commit at start and derives the frozen review base
// itself instead of leaving the recovery to session folklore.

const src = fs.readFileSync(
  path.join(SPEC, 'workflows/src/wf-review.body.js'), 'utf8')

test('wf-review detects a moved HEAD and derives the frozen review base itself', () => {
  assert.match(src, /frozen|detach|HEAD.{0,80}(spec'?s? )?last commit|last commit.{0,80}HEAD/i,
    'a review resumed after other specs land diffs <pre-build>..HEAD across every ' +
    'intervening spec: the panel either reviews an unattributable blob or a human ' +
    're-derives the frozen base by hand each time, and a review that cannot say which ' +
    'spec owns each hunk on its own files can still close CLEAN')
})
