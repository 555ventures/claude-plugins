'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

// Standing guard, deliberately UNTAGGED — no AC-ID in this file, by design.
//
// Design record: specs/20261103/10-two-missing-briefs-are-not-the-same-brief.md D7.
// A tagged test expires at close; this guard is the enforcement. The grammar itself is tested on
// fixtures in tests/variant-lint/grammar.test.js. Do not add an AC-ID here and do not weaken
// these assertions to make a sweep pass.

test('variant-lint finds no brief read in a boolean, coalescing or equality position anywhere under spec/scripts of this checkout', () => {
  const r = runNode('scripts/variant-lint.js', ['--root', ROOT])
  assert.strictEqual(r.status, 0, 'a brief site outside lib/brief.js must be routed through relateBriefs before review: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /VARIANT_LINT fields=\d+ files=\d+ findings=0/, 'the sentinel must report zero findings, or a lint that printed nothing passes as green: ' + r.stdout)
})

test('variant-lint exits 1 on a synthetic tree holding one boolean brief read, so a silently no-op lint cannot pass as green', () => {
  const dir = tmpdir('variant-lint-gate')
  fs.mkdirSync(path.join(dir, 'spec/scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec/scripts/x.js'), 'if (e.brief) {}\n')
  const r = runNode('scripts/variant-lint.js', ['--root', dir])
  assert.strictEqual(r.status, 1, 'the lint must go red on `if (e.brief)`, or the gate over this checkout proves nothing: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /findings=1/, 'the sentinel must count the finding: ' + r.stdout)
})
