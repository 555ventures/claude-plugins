'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { makeHost, run, stateOf, toReviewer, returnFileWith, CLEAN_RETURN } = require('./review-driver.fixtures')

// specs/20261103/13-a-change-is-sized-by-its-files.md D13, AC-20261103-13-5: the optional
// slowTestCommand runs bare at `--mark closed`, after the whole-suite re-run, over the committed close tree.

function closeHost(prefix, slowTestCommand) {
  const host = makeHost({ config: slowTestCommand === undefined ? {} : { slowTestCommand } })
  // The declared slow tier must not run in the review legs (D13), or a red one stops the review before CLOSE.
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith(prefix, CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'the clean reviewer return must reach CLOSE even with a red slowTestCommand declared — the slow tier belongs to --mark closed, not the review legs: ' + r.stdout + r.stderr)
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })
  return host
}

test('AC-20261103-13-5: WHEN --mark closed runs over a committed close tree on a host whose slowTestCommand is `exit 1` THE SYSTEM refuses with exit 2 and a line starting `slow red at close — exit 1 exited 1`, WHEN it is `exit 0` marks closed with exit 0, and WHEN none is declared prints no slow mention', () => {
  const red = closeHost('rvdrv-close-slow-red', 'exit 1')
  const a = run(red.root, red.spec, '--mark', 'closed')
  assert.strictEqual(a.status, 2,
    'a red slow tier at close must refuse the mark — otherwise a failing host integration test closes the spec: ' + a.stdout + a.stderr)
  assert.match(a.stderr, /^slow red at close — exit 1 exited 1/m,
    'the refusal must carry its own literal anchor so a session can tell it from the gate and suite refusals: ' + a.stderr)
  assert.strictEqual(stateOf(red.root, red.spec), 'CLOSE',
    'a refused closed mark must leave the driver state at CLOSE: ' + a.stdout + a.stderr)

  const green = closeHost('rvdrv-close-slow-green', 'exit 0')
  const b = run(green.root, green.spec, '--mark', 'closed')
  assert.strictEqual(b.status, 0, 'a green slow tier must let --mark closed succeed: ' + b.stdout + b.stderr)

  const none = closeHost('rvdrv-close-slow-none')
  const c = run(none.root, none.spec, '--mark', 'closed')
  assert.strictEqual(c.status, 0, 'a host with no slow tier must close as before: ' + c.stdout + c.stderr)
  assert.doesNotMatch(c.stdout + c.stderr, /slow/,
    'an absent slowTestCommand must leave no slow mention on the close — a stray line sends every host hunting a tier it never declared: ' + c.stdout + c.stderr)
})
