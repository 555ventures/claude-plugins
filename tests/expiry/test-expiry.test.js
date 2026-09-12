'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, ROOT } = require('../helpers')

// specs/20260911/03-tests-expire-at-close.md D3/D4, AC-20260911-03-3/-4/-5/-6/-9: expire-tests.js
// classifies every AC-tagged test in a done spec's scope as class/invariant/pin/open/retired,
// deletes only the retired ones under --apply without disturbing a byte of any neighbour, and at
// HEAD over this repository itself reports nothing retirable (the 2026-09-11 hand sweep already
// covers it).

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

test('AC-20260911-03-3: WHEN expire-tests.js --spec <done spec> --json runs (dry run) over a fixture host holding one test per outcome THE SYSTEM classifies 5 tagged tests as kept.class:1, kept.invariant:1, kept.pin:1, kept.open:1 and exactly one retired, leaves every file byte-identical, and reports applied:false', () => {
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
  assert.strictEqual(out.applied, false, 'a dry run (no --apply) must never report applied:true: ' + JSON.stringify(out))

  for (const f of CLASSIFY_KEPT_FILES.concat(['tests/old/gone.test.js'])) {
    assert.strictEqual(fs.readFileSync(path.join(root, f), 'utf8'), before[f],
      'a dry run must never write to disk — ' + f + ' changed: ' + JSON.stringify({ before: before[f] }))
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

test('AC-20260911-03-9: WHEN expire-tests.js --root . --all-done --json runs over this repository at HEAD THE SYSTEM reports retired:[] and applied:false', () => {
  const r = runNode('scripts/expire-tests.js', ['--root', '.', '--all-done', '--json'], { cwd: ROOT, encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'the live all-done dry run must succeed at HEAD, or /spec:doctor check 19 can never report a clean ' +
    'baseline: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.retired, [],
    'D9/A2: the 2026-09-11 hand sweep already retired everything this rule would catch at HEAD — a non-empty ' +
    'result here is a rule drift against the live repository, not a fixture concern: ' + JSON.stringify(out.retired))
  assert.strictEqual(out.applied, false,
    'a dry run (no --apply) must never report applied:true: ' + JSON.stringify(out))
})
