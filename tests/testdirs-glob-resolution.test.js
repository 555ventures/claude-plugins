'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// JJ-20260815-04 — the `{testDirs}` placeholder resolves to something that does not run.
//
// Reproduced in this repo on 2026-08-15 during the /spec:review of
// specs/20260814/04-lock-signal-window.md, and previously during the build of
// specs/20260801/02-session-runner.md (it is already a `[host]` Gotcha here). On Node 26,
// `node --test tests/autopilot` — a directory, with or without a trailing slash — does not
// run the directory's test files. It reports `test at tests/autopilot:1:1 ✖` with
// MODULE_NOT_FOUND and exits non-zero. Only the glob form `node --test 'tests/autopilot/*.test.js'`
// actually executes them.
//
// The plugin-side defect is a documentation contradiction across two commands, which is why
// this keeps being re-derived per session rather than being fixed once:
//
//   * build.md Phase 0 step 3 says to substitute `{testDirs}`/`{scopeDirs}` "from the spec's
//     File Plan DIRS" — the form that does not work.
//   * review.md Phase 0 step 3 says to resolve it "exactly as `build.md` Phase 0 step 3
//     already does (cited, not duplicated): `{testDirs}` resolved to the GLOB FORM before the
//     leg runs."
//
// review.md cites build.md as the authority for a rule build.md does not state. A citation
// that does not say what the citer claims is a hard finding under this repo's own § Review
// Checks; here it also has teeth, because a session following build.md literally produces a
// gate leg that fails for a reason unrelated to the code under test. On a bad day that reads
// as a red gate and hard-stops a review before the panel; on a worse day someone "fixes" it
// by loosening the gate.
//
// The fix is one clause in build.md (state the glob form at the point of resolution), after
// which review.md's citation becomes true. No new mechanism — the cheapest carrier is the
// one that removes the contradiction.

const build = read('spec/commands/build.md')
const review = read('spec/commands/review.md')

test('JJ-20260815-04: build.md states the glob form where it resolves {testDirs}, so review.md\'s citation of it is true', () => {
  // The resolution paragraph, not the whole file: the rule has to sit where the reader resolves.
  const at = build.indexOf('{testDirs}')
  assert.notStrictEqual(at, -1, 'build.md must still resolve the {testDirs} placeholder')
  const slice = build.slice(Math.max(0, at - 400), at + 1200)

  assert.ok(/glob/i.test(slice),
    'build.md resolves {testDirs} from "the spec\'s File Plan dirs" and never mentions the glob ' +
    'form, but a bare directory does not run tests on Node 26 (`node --test tests/autopilot` -> ' +
    'MODULE_NOT_FOUND, exit non-zero). A session following build.md literally gets a gate leg ' +
    'that fails for a reason that has nothing to do with the code under test — which review.md ' +
    'treats as a red blocking leg and hard-stops on, before the panel ever runs. Reproduced ' +
    'twice in this repo (specs/20260801/02 build, specs/20260814/04 review). State the glob ' +
    'form at the point of resolution.')

  assert.ok(/glob form/i.test(review),
    'review.md must keep naming the glob form it delegates to build.md for — this assertion ' +
    'exists so the fix is applied to build.md rather than by deleting the correct half')
})
