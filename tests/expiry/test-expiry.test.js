'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, ROOT } = require('../helpers')
const { extractSection, parseAcBullets } = require('../../spec/scripts/lib/spec-sections')

// specs/20260911/03-tests-expire-at-close.md D3/D4, AC-20260911-03-3/-4/-5/-6/-9: expire-tests.js
// classifies every AC-tagged test in a done spec's scope as class/invariant/pin/open/retired,
// deletes only the retired ones under --apply without disturbing a byte of any neighbour, and at
// HEAD over this repository itself reports nothing retirable (the 2026-09-11 hand sweep already
// covers it). specs/20260912/13-expired-tests-leave-in-their-own-commit.md D1, AC-20260912-13-1:
// a dry run must classify `emptied` the same way an --apply run would, writing nothing.

const CLASSIFY_SPEC_REL = 'specs/20260911/50-closing.md'

function writeSpec(root, rel, body) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

function writeTest(root, rel, body) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

// One fixture host per outcome, shared by AC-3 (dry run) and AC-4 (--apply): a closing spec
// (specs/20260911/50-closing.md, status: done) whose five AC-IDs are each cited by exactly one
// test — class-kept (escape row), invariant-kept (file names a pipeline script), pin-kept (a
// sibling SHALL CONTINUE TO donor spec dated on/after the floor), open-kept (a sibling spec still
// implementing), and one plain test with nothing keeping it alive. A sixth, untagged test must
// never be read for anything.
function makeClassifyHost(prefix) {
  const root = tmpdir(prefix)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ gateCommand: 'bash scripts/gate.sh' }))
  fs.writeFileSync(path.join(root, 'scripts/gate.sh'), '#!/usr/bin/env bash\necho gate\n')
  fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'),
    JSON.stringify({ stage: 'escape', class: 'silent-fallback', spec: 'specs/20260901/01-x.md' }) + '\n')

  writeSpec(root, CLASSIFY_SPEC_REL, `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Closing Fixture Spec

## Acceptance Criteria

- **AC-20260911-50-1**: THE SYSTEM keeps a class-kept test alive via an escape row.
- **AC-20260911-50-2**: THE SYSTEM keeps an invariant-kept test alive via a pipeline-run script.
- **AC-20260911-50-3**: THE SYSTEM does nothing on its own; a sibling pin AC keeps this test.
- **AC-20260911-50-4**: THE SYSTEM does nothing on its own; a sibling open AC keeps this test.
- **AC-20260911-50-5**: THE SYSTEM has nothing keeping this test alive.
`)
  writeSpec(root, 'specs/20260912/02-pin-donor.md', `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Pin Donor Spec

## Acceptance Criteria

- **AC-20260912-02-9**: WHEN a caller invokes the donor path THE SYSTEM SHALL CONTINUE TO return the same value.
`)
  writeSpec(root, 'specs/20260912/01-other-open.md', `---
status: implementing
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Open Sibling Spec

## Acceptance Criteria

- **AC-20260912-01-9**: THE SYSTEM has not shipped this behavior yet.
`)

  writeTest(root, 'tests/kept-class.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-50-1: silent-fallback escape stays covered', () => { assert.ok(true) })
`)
  writeTest(root, 'tests/kept-invariant.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
// exercises gate.sh, the pipeline's own gate script
test('AC-20260911-50-2: the pipeline gate script keeps working', () => { assert.ok(true) })
`)
  writeTest(root, 'tests/kept-pin.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-50-3 / AC-20260912-02-9: a plain closing AC plus a post-floor SHALL CONTINUE TO pin', () => { assert.ok(true) })
`)
  writeTest(root, 'tests/kept-open.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-50-4 / AC-20260912-01-9: a closing AC plus an AC of a still-implementing sibling spec', () => { assert.ok(true) })
`)
  writeTest(root, 'tests/old/gone.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-50-5: a plain tagged test with nothing keeping it alive', () => { assert.ok(true) })
`)
  writeTest(root, 'tests/untagged.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('an untagged test that must never be touched by any expiry pass', () => { assert.ok(true) })
`)
  return root
}

const CLASSIFY_KEPT_FILES = [
  'tests/kept-class.test.js', 'tests/kept-invariant.test.js', 'tests/kept-pin.test.js',
  'tests/kept-open.test.js', 'tests/untagged.test.js',
]

test('AC-20260911-03-3 / AC-20260912-13-1: WHEN expire-tests.js --spec <done spec> --json runs (dry run) over a fixture host holding one test per outcome THE SYSTEM classifies 5 tagged tests as kept.class:1, kept.invariant:1, kept.pin:1, kept.open:1 and exactly one retired, reports the retired test\'s now-would-be-empty file under emptied exactly as an --apply run would, leaves every file byte-identical, and reports applied:false', () => {
  const root = makeClassifyHost('expiry-dry')
  const before = {}
  for (const f of CLASSIFY_KEPT_FILES.concat(['tests/old/gone.test.js'])) {
    before[f] = fs.readFileSync(path.join(root, f), 'utf8')
  }

  const r = runNode('scripts/expire-tests.js', ['--root', root, '--spec', CLASSIFY_SPEC_REL, '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'a dry run over a well-formed fixture host must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.tagged, 5,
    'D3: exactly 5 tests cite one of the closing spec\'s AC-IDs — the 6th, untagged test must never be counted: ' + JSON.stringify(out))
  assert.deepStrictEqual(out.kept, { class: 1, invariant: 1, pin: 1, open: 1 },
    'D3: each keep clause (escape class, invariant script, SHALL CONTINUE TO pin, open sibling spec) must ' +
    'keep exactly the one test built for it — a wrong count means a keep clause is over- or under-firing: ' +
    JSON.stringify(out.kept))
  assert.strictEqual(out.retired.length, 1,
    'D3: exactly the plain test with no keep clause must be reported retired: ' + JSON.stringify(out.retired))
  assert.ok(out.emptied.includes('tests/old/gone.test.js'),
    'D1: a dry run must run the same in-memory span-removal and blank-run-collapse pass an --apply would and ' +
    'push the file left with zero scanCalls hits onto emptied — a close reading emptied before it applies must ' +
    'see the true count, not an always-empty array: ' + JSON.stringify(out.emptied))
  assert.strictEqual(out.applied, false, 'a dry run (no --apply) must never report applied:true: ' + JSON.stringify(out))

  for (const f of CLASSIFY_KEPT_FILES.concat(['tests/old/gone.test.js'])) {
    assert.strictEqual(fs.readFileSync(path.join(root, f), 'utf8'), before[f],
      'D1: emptied must be classified WITHOUT writing to disk — a dry run reporting the file under emptied ' +
      'must still leave it byte-identical — ' + f + ' changed: ' + JSON.stringify({ before: before[f] }))
  }
})

test('AC-20260911-03-4: WHEN the same run adds --apply THE SYSTEM removes the retired test, leaves the four kept tests and the untagged test byte-identical, deletes the file whose only test was retired together with its now-empty directory, and lists that file under emptied', () => {
  const root = makeClassifyHost('expiry-apply')
  const before = {}
  for (const f of CLASSIFY_KEPT_FILES) before[f] = fs.readFileSync(path.join(root, f), 'utf8')

  const r = runNode('scripts/expire-tests.js', ['--root', root, '--spec', CLASSIFY_SPEC_REL, '--apply', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'applying a well-formed fixture host must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.applied, true, 'an --apply run must report applied:true: ' + JSON.stringify(out))
  assert.ok(out.emptied.includes('tests/old/gone.test.js'),
    'D4: the file left with zero calls after the retired test\'s span is removed must be listed under emptied: ' +
    JSON.stringify(out.emptied))

  assert.ok(!fs.existsSync(path.join(root, 'tests/old/gone.test.js')),
    'D4: the emptied test file must actually be deleted from disk, not merely reported')
  assert.ok(!fs.existsSync(path.join(root, 'tests/old')),
    'D4: the directory left empty by deleting its only file must be deleted too, or every close leaves a ' +
    'trail of dead empty directories')

  for (const f of CLASSIFY_KEPT_FILES) {
    assert.strictEqual(fs.readFileSync(path.join(root, f), 'utf8'), before[f],
      'D4: --apply must leave every kept and untagged file byte-identical — ' + f + ' changed')
  }
})

test('AC-20260911-03-5: WHEN a cited AC bullet wraps its pin onto a continuation line (SHALL\\n  CONTINUE TO) THE SYSTEM classifies the citing test as pin; WHEN the identical bullet sits in a spec dated 20260901 (pre-floor) THE SYSTEM classifies the citing test retired', () => {
  const root = tmpdir('expiry-wrap')
  const specRel = 'specs/20260911/60-closing2.md'
  writeSpec(root, specRel, `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Closing Fixture Spec 2

## Acceptance Criteria

- **AC-20260911-60-1**: THE SYSTEM has nothing of its own keeping this test alive; a post-floor sibling pin does.
- **AC-20260911-60-2**: THE SYSTEM has nothing of its own keeping this test alive; a pre-floor sibling pin does not.
`)
  writeSpec(root, 'specs/20260912/03-wrap-post.md', `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Wrap Post-Floor Donor

## Acceptance Criteria

- **AC-20260912-03-7**: WHEN a caller invokes wrap-post THE SYSTEM SHALL
  CONTINUE TO return the same value.
`)
  writeSpec(root, 'specs/20260901/04-wrap-pre.md', `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Wrap Pre-Floor Donor

## Acceptance Criteria

- **AC-20260901-04-7**: WHEN a caller invokes wrap-pre THE SYSTEM SHALL
  CONTINUE TO return the same value.
`)
  writeTest(root, 'tests/wrap-pin-post.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-60-1 / AC-20260912-03-7: a post-floor wrapped pin keeps this test alive', () => { assert.ok(true) })
`)
  writeTest(root, 'tests/wrap-pin-pre.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-60-2 / AC-20260901-04-7: an identical pre-floor wrapped pin must not keep this test alive', () => { assert.ok(true) })
`)

  const r = runNode('scripts/expire-tests.js', ['--root', root, '--spec', specRel, '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'a dry run over the wrap fixture must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.kept.pin, 1,
    'D3(c)/AC-5: the post-floor donor\'s wrapped SHALL\\n  CONTINUE TO bullet must classify its citing test as ' +
    'a kept pin: ' + JSON.stringify(out))
  assert.strictEqual(out.retired.length, 1,
    'AC-5: the byte-identical wrapped bullet in the pre-floor (20260901) donor spec must NOT count as a pin — ' +
    'its citing test must be reported retired: ' + JSON.stringify(out.retired))
  assert.ok(out.retired[0].acIds.includes('AC-20260901-04-7') || out.retired[0].file === 'tests/wrap-pin-pre.test.js',
    'AC-5: the retired entry must be the pre-floor test, not the post-floor one: ' + JSON.stringify(out.retired))
})

test('AC-20260911-03-6: WHEN --apply retires a test whose neighbour holds a regex literal with a quote and a paren THE SYSTEM leaves the neighbour byte-identical and the file still passes node --check', () => {
  const root = tmpdir('expiry-regex')
  const specRel = 'specs/20260911/70-closing3.md'
  writeSpec(root, specRel, `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Closing Fixture Spec 3

## Acceptance Criteria

- **AC-20260911-70-1**: THE SYSTEM has nothing keeping this test alive.
`)
  const neighbourTitle = 'a neighbour whose body holds a tricky regex literal'
  const fileRel = 'tests/regex-neighbour.test.js'
  writeTest(root, fileRel, `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-70-1: retire me', () => { assert.ok(true) })
test('${neighbourTitle}', () => {
  assert.strictEqual(/atlas\\)" stop open/.test('x'), false)
})
`)

  const r = runNode('scripts/expire-tests.js', ['--root', root, '--spec', specRel, '--apply', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'applying the regex-neighbour fixture must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.retired.length, 1, 'exactly the tagged test must be retired: ' + JSON.stringify(out.retired))

  const after = fs.readFileSync(path.join(root, fileRel), 'utf8')
  assert.ok(after.includes(neighbourTitle),
    'AC-6: the neighbour test must survive the apply untouched: ' + JSON.stringify(after))
  assert.ok(after.includes('/atlas\\)" stop open/'),
    'AC-6: the neighbour\'s regex literal (an escaped paren immediately before a quote) must survive byte-' +
    'identical — a paren-depth or quote-skip bug here would corrupt or truncate it: ' + JSON.stringify(after))
  assert.ok(!after.includes('retire me'),
    'AC-6: the retired test\'s own title must be gone from the file: ' + JSON.stringify(after))

  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path.join(root, fileRel)]),
    'AC-6: the file left behind after removing the retired test\'s span must still be syntactically valid JS')
})

test('WHEN --apply retires every case inside a describe THE SYSTEM removes that describe (nested ones included) and lists it under emptiedSuites, while a describe that keeps a live case survives and the file still passes node --check', () => {
  const root = tmpdir('expiry-describe')
  const specRel = 'specs/20260911/80-closing4.md'
  writeSpec(root, specRel, `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Closing Fixture Spec 4

## Acceptance Criteria

- **AC-20260911-80-1**: THE SYSTEM has nothing keeping these tests alive.
`)
  // tests/expiry/*.test.js hold zero describe( calls of their own, so the fixture builds them.
  const fileRel = 'tests/suites.test.js'
  writeTest(root, fileRel, `'use strict'
const { describe, test } = require('node:test')
const assert = require('node:assert')

// the suite this pass must empty out
describe('only retired', () => {
  test('AC-20260911-80-1: retired alone', () => { assert.ok(true) })
})

describe('mixed', () => {
  test('AC-20260911-80-1: retired beside a live one', () => { assert.ok(true) })
  test('a live case that keeps this suite', () => { assert.ok(true) })
})

describe('outer', () => {
  describe('inner', () => {
    it('AC-20260911-80-1: retired deep', () => { assert.ok(true) })
  })
})

test('a top-level live case', () => { assert.ok(true) })
`)

  const r = runNode('scripts/expire-tests.js', ['--root', root, '--spec', specRel, '--apply', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'applying the describe fixture must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.retired.length, 3, 'all three tagged cases must be retired: ' + JSON.stringify(out.retired))
  assert.deepStrictEqual(out.emptiedSuites.map((e) => e.title).sort(), ['inner', 'only retired', 'outer'],
    'every describe left with zero cases — the inner one and the outer it empties — must be reported: ' +
    JSON.stringify(out.emptiedSuites))
  assert.deepStrictEqual(out.emptied, [], 'the file still holds live cases, so it must not be emptied')

  const after = fs.readFileSync(path.join(root, fileRel), 'utf8')
  for (const gone of ["'only retired'", "'outer'", "'inner'", 'the suite this pass must empty out', 'AC-20260911-80-1']) {
    assert.ok(!after.includes(gone), 'the emptied suite text ' + gone + ' must be gone: ' + JSON.stringify(after))
  }
  for (const kept of ["describe('mixed'", 'a live case that keeps this suite', 'a top-level live case']) {
    assert.ok(after.includes(kept), 'live text ' + kept + ' must survive: ' + JSON.stringify(after))
  }
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path.join(root, fileRel)]),
    'the file left behind must still be syntactically valid JS')
})

// Collision fixture: two specs define the identical AC-ID (spec-number-check.js's job to refuse
// at the gate, not this script's — D3's fail-safe rule must still hold in its presence). One
// citing test keyed to the collided ID must be kept `open` whenever ANY of its collided ID's
// defining specs is not done, in both --all-done and --spec mode, and each spec must still see
// the test as tagged even though a sibling defines the same ID (the `tagged:0` failure mode).
function makeCollisionHost(prefix, { bothDone } = {}) {
  const root = tmpdir(prefix)
  const doneSpecRel = 'specs/20260901/01-a.md'
  const otherStatus = bothDone ? 'done' : 'implementing'
  writeSpec(root, doneSpecRel, `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Collision Spec A

## Acceptance Criteria

- **AC-20260901-01-1**: THE SYSTEM defines this AC-ID from spec A.
`)
  const otherSpecRel = 'specs/20260901/01-b.md'
  writeSpec(root, otherSpecRel, `---
status: ${otherStatus}
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Collision Spec B

## Acceptance Criteria

- **AC-20260901-01-1**: THE SYSTEM defines the identical AC-ID from spec B.
`)
  writeTest(root, 'tests/collision.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260901-01-1: cited by a test while two specs both define this AC-ID', () => { assert.ok(true) })
`)
  return { root, doneSpecRel, otherSpecRel }
}

test('AC-20260911-03-3/AC-20260911-03-5: WHEN two specs define the identical AC-ID and one is not done THE SYSTEM keeps the citing test as kept.open (never retired) under --all-done', () => {
  const { root } = makeCollisionHost('expiry-collision-open')
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'a dry run over the collision fixture must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.retired.length, 0,
    'D3: a collided AC-ID with one non-done defining spec must never retire the citing test — closing one ' +
    'spec must not be able to delete a different, still-unfinished spec\'s tests: ' + JSON.stringify(out))
  assert.strictEqual(out.kept.open, 1,
    'D3: the citing test must be classified kept.open, not silently dropped or misclassified: ' + JSON.stringify(out.kept))
})

test('AC-20260911-03-3/AC-20260911-03-5: WHEN --spec names the done spec of a collided AC-ID whose sibling is not done THE SYSTEM keeps the citing test as kept.open, never retired', () => {
  const { root, doneSpecRel } = makeCollisionHost('expiry-collision-spec-done')
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--spec', doneSpecRel, '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'a dry run scoped to the done half of the collision must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.tagged, 1,
    'the done spec must still see the citing test as tagged even though a sibling spec defines the same ' +
    'AC-ID: ' + JSON.stringify(out))
  assert.strictEqual(out.retired.length, 0,
    'D3: closing spec A must not retire a test whose collided AC-ID sibling (spec B) is still implementing: ' +
    JSON.stringify(out))
  assert.strictEqual(out.kept.open, 1, 'the citing test must be classified kept.open: ' + JSON.stringify(out.kept))
})

test('AC-20260911-03-3/AC-20260911-03-5: WHEN --spec names the NOT-done spec of a collided AC-ID THE SYSTEM still reports the citing test as tagged (never tagged:0)', () => {
  const { root, otherSpecRel } = makeCollisionHost('expiry-collision-spec-implementing')
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--spec', otherSpecRel, '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'a dry run scoped to the implementing half of the collision must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.tagged, 1,
    'a first-writer-wins ownership map would report tagged:0 here — the implementing spec must still be able ' +
    'to see a test citing its own AC-ID just because a sibling spec defines the same ID: ' + JSON.stringify(out))
  // --spec mode counts the NAMED spec itself as done regardless of its literal on-disk status
  // (D3/D5: this runs before the status flip on close) — here that spec (B) is the one being
  // closed, and its collided sibling (spec A) is independently already done, so both owners of
  // the collided AC-ID are done and the citing test correctly retires. This is not the D3
  // violation under fix: THAT is closing one spec deleting a DIFFERENT, still-open spec's tests,
  // which the two tests above cover (--all-done and --spec <the done one> both keep the test
  // open while spec B is still implementing).
  assert.strictEqual(out.retired.length, 1,
    'closing spec B (the --spec target) counts as done, and spec A already is done, so every owner of the ' +
    'collided AC-ID is done and the citing test must retire: ' + JSON.stringify(out))
})

test('AC-20260911-03-3/AC-20260911-03-5: control — WHEN two specs define the identical AC-ID and BOTH are done THE SYSTEM retires the citing test, so the collision fix does not over-keep', () => {
  const { root } = makeCollisionHost('expiry-collision-both-done', { bothDone: true })
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'a dry run over the both-done collision fixture must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.retired.length, 1,
    'a collided AC-ID whose every defining spec is done must still retire the citing test — the fail-safe ' +
    'fix must not keep tests alive forever once every owner is actually done: ' + JSON.stringify(out.retired))
  assert.strictEqual(out.kept.open, 0, 'no clause should keep this test once both collided owners are done: ' + JSON.stringify(out.kept))
})

// specs/20260912/15-the-close-stops-deleting-tests.md D5/D6/D7, AC-20260912-15-3/-4/-5: a
// `superseded` owner now counts as closed alongside `done`, and an unreadable spec file under
// `specs/` is recorded as an unreadable owner (its path-derived AC-ID prefix held open, warned
// on stderr, exit 0) rather than silently skipped as though it never existed.
function isRootProcess() {
  return !!(process.getuid && process.getuid() === 0)
}

test('AC-20260912-15-3: WHEN a tagged test cites one AC-ID owned by a done spec and by a superseded spec and by nothing else THE SYSTEM classifies it retired under --all-done --json', () => {
  const root = tmpdir('expiry-superseded')
  writeSpec(root, 'specs/20260911/01-alpha.md', `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Alpha

## Acceptance Criteria

- **AC-20260911-01-1**: THE SYSTEM defines this AC-ID from the done spec.
`)
  writeSpec(root, 'specs/20260911/01-alpha-twin.md', `---
status: superseded
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Alpha Twin

## Acceptance Criteria

- **AC-20260911-01-1**: THE SYSTEM defines the identical AC-ID from the superseded twin.
`)
  writeTest(root, 'tests/alpha.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-01-1: cited by a test while a done spec and a superseded twin both define it', () => { assert.ok(true) })
`)

  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'a dry run over the done+superseded fixture must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.tagged, 1, 'the one citing test must be scanned as tagged: ' + JSON.stringify(out))
  assert.deepStrictEqual(out.kept, { class: 0, invariant: 0, pin: 0, open: 0 },
    'D5: a superseded owner must count as closed alongside done — no keep clause should fire and hold this test open: ' + JSON.stringify(out.kept))
  assert.deepStrictEqual(out.retired, [{ file: 'tests/alpha.test.js', acIds: ['AC-20260911-01-1'], title: 'AC-20260911-01-1: cited by a test while a done spec and a superseded twin both define it' }],
    'D5: with both owners of the collided AC-ID closed (done and superseded) the citing test must retire, not stay pinned open forever by the superseded twin: ' + JSON.stringify(out.retired))
})

// Incident fix (specs/20260914/01-the-mock-contract-and-the-driver.md build): a hardened spec whose
// AC points `rewrites <file> :: <title>` at a done spec's test mentions that test's AC-ID without
// defining it. The mention must never hold the test open — the live-repo pin below reads owners the
// same way, so the two can never disagree about who owns an ID.
test('AC-20260911-03-9: WHEN a hardened spec only mentions a done spec\'s AC-ID in a rewrites pointer THE SYSTEM still classifies the citing test retired under --all-done --json', () => {
  const root = tmpdir('expiry-pointer-mention')
  writeSpec(root, 'specs/20260911/01-alpha.md', `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Alpha

## Acceptance Criteria

- **AC-20260911-01-1**: THE SYSTEM defines this AC-ID from the done spec.
`)
  writeSpec(root, 'specs/20260914/02-beta.md', `---
status: hardened
tier: standard
---
# Beta

## Acceptance Criteria

- **AC-20260914-02-1**: THE SYSTEM replaces the old check → rewrites tests/alpha.test.js :: AC-20260911-01-1: cited by a test
`)
  writeTest(root, 'tests/alpha.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-01-1: cited by a test whose AC a hardened sibling only points at', () => { assert.ok(true) })
`)

  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, 'a dry run over the pointer-mention fixture must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.kept.open, 0,
    'a spec that only points at an AC-ID must not count as its open owner — otherwise every hardened spec that rewrites a done spec\'s test keeps that test alive: ' + JSON.stringify(out.kept))
  assert.deepStrictEqual(out.retired.map(e => e.acIds), [['AC-20260911-01-1']],
    'the test whose only defining owner is done must be reported retirable despite the sibling\'s pointer mention: ' + JSON.stringify(out.retired))
})

test('AC-20260912-15-4: WHEN a spec file under specs/ cannot be read and a done twin at the same date and number defines the same AC-ID THE SYSTEM keeps the citing test, exits 0, and warns on stderr naming the file and its derived prefix', () => {
  if (isRootProcess()) return // chmod 000 cannot deny a root-owned process; this pin cannot distinguish the fix from the bug under root

  const root = tmpdir('expiry-unreadable-same-prefix')
  writeSpec(root, 'specs/20260911/01-alpha.md', `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Alpha

## Acceptance Criteria

- **AC-20260911-01-1**: THE SYSTEM defines this AC-ID from the done spec.
`)
  const twinAbs = path.join(root, 'specs/20260911/01-alpha-twin.md')
  writeSpec(root, 'specs/20260911/01-alpha-twin.md', `---
status: implementing
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Alpha Twin

## Acceptance Criteria

- **AC-20260911-01-1**: THE SYSTEM defines the identical AC-ID from the twin.
`)
  fs.chmodSync(twinAbs, 0o000)
  writeTest(root, 'tests/alpha.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-01-1: cited by a test while its twin owner is unreadable', () => { assert.ok(true) })
`)

  try {
    const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' })
    assert.strictEqual(r.status, 0,
      'D6: an unreadable spec that is NOT the one named by --spec (there is no --spec here at all) must never change the exit code: ' + r.stdout + r.stderr)
    const out = JSON.parse(r.stdout)
    assert.strictEqual(out.tagged, 1, 'the citing test must still be scanned as tagged: ' + JSON.stringify(out))
    assert.deepStrictEqual(out.kept, { class: 0, invariant: 0, pin: 0, open: 1 },
      'D6: today the unreadable twin is silently skipped as though absent, so its readable done sibling alone ' +
      'makes allCitedDone true and wrongly retires the test — the unreadable owner must instead hold the AC-ID ' +
      'open: ' + JSON.stringify(out.kept))
    assert.deepStrictEqual(out.retired, [],
      'D6: the citing test must not be retired while one of its AC-ID\'s owners cannot be read: ' + JSON.stringify(out.retired))
    assert.match(r.stderr, /specs\/20260911\/01-alpha-twin\.md/,
      'D6: the stderr warning must name the unreadable spec file by path: ' + r.stderr)
    assert.match(r.stderr, /AC-20260911-01-/,
      'D6: the stderr warning must name the path-derived AC-ID prefix (AC-YYYYMMDD-NN[a]-) so an operator can find every id it holds open: ' + r.stderr)
  } finally {
    fs.chmodSync(twinAbs, 0o644)
  }
})

test('AC-20260912-15-5: WHEN an unreadable spec\'s derived prefix does not match a cited AC-ID THE SYSTEM classifies that citation exactly as it would with the file absent, while still warning once on stderr about the unreadable file itself', () => {
  if (isRootProcess()) return // chmod 000 cannot deny a root-owned process; this pin cannot distinguish the fix from the bug under root

  const root = tmpdir('expiry-unreadable-other-prefix')
  writeSpec(root, 'specs/20260911/01-alpha.md', `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Alpha

## Acceptance Criteria

- **AC-20260911-01-1**: THE SYSTEM defines this AC-ID, owned solely by this done spec.
`)
  const betaAbs = path.join(root, 'specs/20260911/02-beta.md')
  writeSpec(root, 'specs/20260911/02-beta.md', `---
status: implementing
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Beta

## Acceptance Criteria

- **AC-20260911-02-1**: THE SYSTEM defines a wholly unrelated AC-ID, unread and irrelevant here.
`)
  fs.chmodSync(betaAbs, 0o000)
  writeTest(root, 'tests/alpha.test.js', `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-01-1: cited by a test whose only owner is readable and done', () => { assert.ok(true) })
`)

  try {
    const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' })
    assert.strictEqual(r.status, 0,
      'D7: an unreadable spec unrelated to the cited AC-ID must never change the exit code: ' + r.stdout + r.stderr)
    const out = JSON.parse(r.stdout)
    assert.deepStrictEqual(out.retired, [{ file: 'tests/alpha.test.js', acIds: ['AC-20260911-01-1'], title: 'AC-20260911-01-1: cited by a test whose only owner is readable and done' }],
      'D7: the unreadable-owner rule is prefix-scoped, never global — an unrelated unreadable spec must not keep ' +
      'this citation open, or a single stray unreadable file anywhere under specs/ would freeze the whole sweep: ' +
      JSON.stringify(out.retired))
    assert.match(r.stderr, /specs\/20260911\/02-beta\.md/,
      'D6: the Contracts line promises one stderr warning per unreadable spec file regardless of whether that ' +
      'file\'s prefix matters to this run\'s outcome — today no such warning is ever printed: ' + r.stderr)
    assert.match(r.stderr, /AC-20260911-02-/,
      'D6: the warning must name the derived prefix of the unrelated unreadable file, not the one that actually retired: ' + r.stderr)
  } finally {
    fs.chmodSync(betaAbs, 0o644)
  }
})

// specs/20260912/15-the-close-stops-deleting-tests.md D1/D2: close no longer applies this
// script's retirement — it only classifies and reports. That means every close from now on
// deliberately LEAVES retirable tests behind until someone runs the `--all-done --apply` sweep,
// so asserting `retired: []` at HEAD pins a state only a just-run sweep can produce and goes red
// after every close that reports something retirable (as this spec's own close does, for the
// three AC-20260912-15-7/-8 tests in tests/consistency/contract-stamp.test.js — correct behavior,
// not drift). The rule itself is still worth pinning: every entry this script proposes to retire
// must be legitimately retirable, i.e. every AC-ID it cites resolves to a spec whose frontmatter
// status is `done` or `superseded` (allCitedDone's own contract). A test owned by a spec that is
// still open must never appear in `retired` — that is the one drift this script must never commit.
function specStatus(specRel) {
  const text = fs.readFileSync(path.join(ROOT, specRel), 'utf8')
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!fm) return null
  const m = /^status:\s*(\S+)/m.exec(fm[1])
  return m ? m[1] : null
}

// An owner is a spec whose `## Acceptance Criteria` DEFINES the AC-ID — the same reading
// expire-tests.js's own ownership map applies. A spec that merely mentions the ID (a later spec's
// `rewrites <file> :: <title>` pointer at a done spec's test) is not an owner; counting it by
// occurrence reddened this pin on every hardened spec that rewrites a done spec's test.
function ownerSpecsFor(acId) {
  const specsDir = path.join(ROOT, 'specs')
  const owners = []
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (fs.statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.md')) {
        const rel = path.relative(ROOT, full).split(path.sep).join('/')
        const section = extractSection(fs.readFileSync(full, 'utf8'), 'Acceptance Criteria')
        if (section !== null && parseAcBullets(section).some(b => !b.malformed && b.id === acId)) owners.push(rel)
      }
    }
  }
  walk(specsDir)
  return owners
}

test('AC-20260911-03-9: WHEN expire-tests.js --root . --all-done --json runs over this repository at HEAD THE SYSTEM reports applied:false and every retirable entry cites only AC-IDs owned by a done or superseded spec', () => {
  const r = runNode('scripts/expire-tests.js', ['--root', '.', '--all-done', '--json'], { cwd: ROOT, encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'the live all-done dry run must succeed at HEAD, or /spec:doctor check 19 can never report a clean ' +
    'baseline: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.applied, false,
    'a dry run (no --apply) must never report applied:true: ' + JSON.stringify(out))
  // specs/20260912/15 D1/D2: close-time classification no longer deletes, so a non-empty
  // `retired` here is the expected steady state between closes, not a rule drift — the drift
  // this test guards against is this script proposing to retire a test that still belongs to a
  // live (not done/superseded) spec.
  for (const entry of out.retired) {
    for (const acId of entry.acIds) {
      const owners = ownerSpecsFor(acId)
      assert.ok(owners.length > 0,
        'expire-tests.js reported ' + entry.file + ' (' + entry.title + ') as retirable citing ' +
        acId + ', but no spec under specs/ defines that AC-ID — a test can only be retirable if ' +
        'its citation resolves to a real, closed owner: ' + JSON.stringify(entry))
      for (const specRel of owners) {
        const status = specStatus(specRel)
        assert.ok(status === 'done' || status === 'superseded',
          'expire-tests.js reported ' + entry.file + ' (' + entry.title + ') as retirable citing ' +
          acId + ', owned by ' + specRel + ' whose frontmatter status is ' + JSON.stringify(status) +
          ' — retiring a test whose owner is still open is the exact drift this pin exists to catch: ' +
          JSON.stringify(entry))
      }
    }
  }
})

function writeExpiryHost(prefix) {
  const root = tmpdir(prefix)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ gateCommand: 'true' }))
  writeSpec(root, 'specs/20260920/01-old.md', `---
status: done
---
# Old

## Acceptance Criteria

- **AC-20260920-01-1**: WHEN a THE SYSTEM SHALL b
- **AC-20260920-01-2**: WHEN c THE SYSTEM SHALL d
`)
  return root
}

test('a file whose remaining cases are table cases is rewritten, never deleted, and a tagged table case is retired and reported like any other', () => {
  const root = writeExpiryHost('expiry-each')
  writeTest(root, 'tests/words.test.js', `import { it } from 'vitest'
it('a plain retired case (AC-20260920-01-1)', () => {})
it.each([1, 2])('an untagged table case %i', (n) => {})
// AC-20260920-01-2
it.each([3])('a tagged table case %i', (n) => {})
`)
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--apply', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.scanned, 3, 'both table cases are counted beside the plain one: ' + r.stdout)
  assert.deepStrictEqual(out.retired.map((x) => x.title).sort(),
    ['a plain retired case (AC-20260920-01-1)', 'a tagged table case %i'],
    'the tagged table case is retired and named in the report, never dropped unseen')
  assert.deepStrictEqual(out.emptied, [], 'the untagged table case keeps its file')
  const left = fs.readFileSync(path.join(root, 'tests/words.test.js'), 'utf8')
  assert.ok(left.includes("it.each([1, 2])('an untagged table case %i'"), 'the untagged table case survives the apply byte-for-byte: ' + left)
  assert.ok(!left.includes('a tagged table case') && !left.includes('a plain retired case'), 'both retired cases are gone: ' + left)
})

test('a test a live pin names with → reuses is kept under the old, done id it carries; a superseded spec\'s pointer keeps nothing', () => {
  const root = writeExpiryHost('expiry-reuses')
  writeSpec(root, 'specs/20261002/01-new.md', `---
status: hardened
---
# New

## Acceptance Criteria

- **AC-20261002-01-1**: WHEN a THE SYSTEM SHALL CONTINUE TO b → reuses tests/old.test.js :: opens on step 1
`)
  writeSpec(root, 'specs/20261002/02-dead.md', `---
status: superseded
---
# Dead

## Acceptance Criteria

- **AC-20261002-02-1**: WHEN c THE SYSTEM SHALL CONTINUE TO d → reuses tests/old.test.js :: the other case
`)
  writeTest(root, 'tests/old.test.js', `import { test } from 'vitest'
test('opens on step 1 with the address replaced (AC-20260920-01-1)', () => {})
test('the other case (AC-20260920-01-2)', () => {})
`)
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.kept.pin, 1, 'the pointed-at test is kept as a pin: ' + r.stdout)
  assert.deepStrictEqual(out.retired.map((x) => x.title), ['the other case (AC-20260920-01-2)'],
    'only the test no live pin names is retired')
})

function setGate(root, gateCommand) {
  const cfg = gateCommand === null ? {} : { gateCommand }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
}

// A host whose sweep trims one file and deletes another (taking its directory with it).
function writeSweepHost(prefix) {
  const root = writeExpiryHost(prefix)
  writeTest(root, 'tests/trimmed.test.js', `import { test } from 'vitest'
test('retired (AC-20260920-01-1)', () => {})
test('a live untagged case', () => {})
`)
  writeTest(root, 'tests/gone/only.test.js', `import { test } from 'vitest'
test('retired too (AC-20260920-01-2)', () => {})
`)
  return root
}

const readTree = (root, rels) => rels.map((rel) => {
  const abs = path.join(root, rel)
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
})

test('WHEN --apply leaves the host gate red THE SYSTEM restores every trimmed and deleted file byte-for-byte, exits 1, names the gate and its output on stderr, and reports applied:false with gate.reverted', () => {
  const root = writeSweepHost('expiry-gate-red')
  setGate(root, 'node -e "console.log(\'domain gate: gone/only has no tests\'); process.exit(require(\'fs\').existsSync(\'tests/gone/only.test.js\') ? 0 : 3)"')
  const rels = ['tests/trimmed.test.js', 'tests/gone/only.test.js']
  const before = readTree(root, rels)
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--apply', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 1, 'a red gate after the sweep is a finding, never exit 0: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.applied, false, 'a reverted sweep was not applied: ' + r.stdout)
  assert.strictEqual(out.gate.ok, false)
  assert.strictEqual(out.gate.reverted, true)
  assert.deepStrictEqual(readTree(root, rels), before, 'every touched file is back byte-for-byte, its directory included')
  assert.match(r.stderr, /went red after the sweep \(exit 3\)/)
  assert.match(r.stderr, /domain gate: gone\/only has no tests/, 'the gate\'s own output tail reaches the user')
})

test('WHEN --apply --keep-on-red leaves the host gate red THE SYSTEM keeps the writes, exits 1, and reports gate.reverted false', () => {
  const root = writeSweepHost('expiry-gate-keep')
  setGate(root, 'exit 3')
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--apply', '--keep-on-red', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 1, r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.applied, true)
  assert.deepStrictEqual(out.gate, { command: 'exit 3', ok: false, reverted: false })
  assert.ok(!fs.existsSync(path.join(root, 'tests/gone')), 'the emptied file and its directory stay deleted')
  assert.ok(!fs.readFileSync(path.join(root, 'tests/trimmed.test.js'), 'utf8').includes('retired ('))
})

test('WHEN --apply runs on a host with no gateCommand THE SYSTEM applies, exits 0, and warns on stderr that nothing checked the sweep; a dry run never runs the gate', () => {
  const root = writeSweepHost('expiry-gate-none')
  setGate(root, null)
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--apply', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stdout + r.stderr)
  assert.strictEqual(JSON.parse(r.stdout).gate, null)
  assert.match(r.stderr, /no gateCommand/)

  const dry = writeSweepHost('expiry-gate-dry')
  setGate(dry, 'touch ran-the-gate')
  const d = runNode('scripts/expire-tests.js', ['--root', dry, '--all-done', '--json'], { encoding: 'utf8' })
  assert.strictEqual(d.status, 0, d.stdout + d.stderr)
  assert.ok(!fs.existsSync(path.join(dry, 'ran-the-gate')), 'a dry run never runs the host gate')
})

test('an invariant script keeps a test file only when the file names it as a whole name — catalog.json never names log.js, health.json() never names health.js', () => {
  const root = writeExpiryHost('expiry-whole-name')
  setGate(root, 'node scripts/log.js && node scripts/health.js')
  writeTest(root, 'scripts/log.js', '\n')
  writeTest(root, 'scripts/health.js', '\n')
  writeTest(root, 'tests/false-hit.test.js', `import { test } from 'vitest'
const words = 'catalog.json'
const probe = (r) => r.health.json()
test('retired despite the look-alike names (AC-20260920-01-1)', () => {})
`)
  writeTest(root, 'tests/real-hit.test.js', `import { test } from 'vitest'
const script = 'scripts/log.js'
test('kept: this file names a script the gate runs (AC-20260920-01-2)', () => {})
`)
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.kept.invariant, 1, r.stdout)
  assert.deepStrictEqual(out.retired.map((x) => x.file), ['tests/false-hit.test.js'])
})

test('a git-ignored build directory is not the host — its copies of scripts and tests never change what the sweep keeps or retires', () => {
  const root = writeExpiryHost('expiry-ignored')
  setGate(root, 'node scripts/gate.js')
  writeTest(root, 'scripts/gate.js', '\n')
  writeTest(root, 'tests/a.test.js', `import { test } from 'vitest'
test('retired (AC-20260920-01-1)', () => {})
`)
  fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n')
  execFileSync('git', ['init', '-q', root])
  const clean = JSON.parse(runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' }).stdout)
  // A build copies the tests and a script whose name the test file happens to mention.
  writeTest(root, 'dist/tests/a.test.js', `import { test } from 'vitest'
test('a built copy (AC-20260920-01-2)', () => {})
`)
  writeTest(root, 'dist/scripts/gate.js', "require('./a.test.js')\n")
  const built = JSON.parse(runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'], { encoding: 'utf8' }).stdout)
  assert.deepStrictEqual(built, clean, 'the ignored dist/ tree changes nothing in the report')
  const inv = runNode('scripts/expire-tests.js', ['--root', root, '--invariants'], { encoding: 'utf8' })
  assert.strictEqual(inv.stdout.trim(), 'scripts/gate.js', 'the invariant set holds no ignored script: ' + inv.stdout)
})
