'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { specBody, makeHost, run, stateOf, toRedAttribution } = require('./build-driver.fixtures')

// The build driver's base derivation and the residue predicate that reads from it.
//
// THE FAILURE THESE PIN IS A SILENT FALSE CLEAN. With the moving ref winning over the pin,
// `git diff <base>` is computed against a branch that does not describe what this build started
// from: in the loud direction it refuses over files the build never touched (red-check naming the
// components the design stage legitimately committed), and in the quiet direction it produces an
// empty or wrong range that every diff-scoped consumer reports green on.
//
// Deliberately NOT covered here: the review driver's own non-degenerate-range invariant and
// replay.js's ancestor-of-parent check — different predicates, different files, their own tests.

// The recorded field scenario, reproduced exactly: a build branch cut from main, a design stage
// that commits a real component onto it, and /git:enter-worktree's `build_base: main` sitting in
// the frontmatter beside the pin the build itself stamped. main lags HEAD by the design commit,
// so the two candidates give genuinely different answers and the preference is observable.
function makeDesignHost() {
  const host = makeHost()
  host.g('checkout', '-q', '-b', 'build/99-bd-test')
  // The design stage's own commit: src/bar.js is a non-tests CREATE row in the File Plan, and
  // spec/commands/design.md promises components built there are real, kept, and only wired by
  // /spec:build — never rebuilt.
  fs.writeFileSync(path.join(host.root, 'src/bar.js'), 'module.exports = () => 7\n')
  host.g('add', '-A')
  host.g('commit', '-q', '-m', 'design: land the component')
  return host
}

function writeSpec(host, extraFm) {
  const body = specBody({}).replace(/^---\n/, '---\n' + extraFm)
  fs.writeFileSync(host.spec, body)
}

test('the pin beats the ref: a design-landed component is not called stub residue', () => {
  const host = makeDesignHost()
  // Both fields present, exactly as a worktree build carries them. `main` still points at the
  // pre-design commit; the pin the driver stamps at the flip points at the post-design HEAD.
  writeSpec(host, 'build_base: main\n')

  toRedAttribution(host)

  const stamped = /^diff_base:\s*([0-9a-f]{40})\s*$/m.exec(fs.readFileSync(host.spec, 'utf8'))
  assert.ok(stamped, 'the driver must stamp diff_base at the hardened -> implementing flip')
  const head = host.g('rev-parse', 'HEAD').trim()
  assert.strictEqual(stamped[1], head,
    'the stamped pin must name the post-design HEAD — that is the true pre-image of this build')
  assert.notStrictEqual(host.g('rev-parse', 'main').trim(), head,
    'setup precondition: main must lag HEAD, or the two candidates cannot be told apart')

  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.strictEqual(r.status, 0,
    'a design-landed component committed BEFORE the build base must not be called residue — with ' +
    'the ref winning, `git diff main` lists src/bar.js and this mark refuses: ' + r.stdout + r.stderr)
  assert.doesNotMatch(r.stdout + r.stderr, /stub residue/,
    'no residue refusal is legitimate here: the pre-image is clean against the pin')
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts')
})

test('a CREATE row already tracked at base warns and continues, never refuses', () => {
  const host = makeDesignHost()
  writeSpec(host, 'build_base: main\n')
  toRedAttribution(host)
  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.strictEqual(r.status, 0)
  assert.match(r.stdout, /WARN: File Plan CREATE row\(s\) already tracked at the build base/,
    'the stale-looking row is worth naming — the File Plan very likely wants MODIFY — but the ' +
    'pre-image is provably clean, so it is a planning observation, not grounds to stop the build')
  assert.match(r.stdout, /src\/bar\.js/)
})

test('genuine residue is still caught: an uncommitted stub for a CREATE row refuses', () => {
  const host = makeHost()
  toRedAttribution(host)
  // An abandoned earlier build's leftover: written, never committed, so it differs from base.
  fs.writeFileSync(path.join(host.root, 'src/bar.js'), 'module.exports = () => 0\n')
  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.notStrictEqual(r.status, 0, 'an uncommitted stub must still refuse the mark')
  assert.match(r.stderr, /stub residue/)
  assert.match(r.stderr, /src\/bar\.js/)
})

test('a fresh build whose base equals HEAD is not refused', () => {
  // The guard against porting the review driver's non-degenerate-range invariant to this side:
  // at build start nothing is built yet, so base === HEAD is the CORRECT state. A range check
  // here would refuse every legitimate fresh build.
  const host = makeHost()
  const head = host.g('rev-parse', 'HEAD').trim()
  writeSpec(host, `diff_base: ${head}\n`)
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0,
    'base === HEAD must pass: a commit is its own ancestor, and nothing is built yet: ' +
    r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'TESTS')
})

test('a base that is not an ancestor of HEAD refuses with the remedy named', () => {
  const host = makeHost()
  toRedAttribution(host)
  // A commit on a divergent branch — the shape a moving ref takes once a sibling session lands
  // work that this build's branch never saw. `git diff <that>` reports edits this build never
  // made, which is precisely how a wrong base produces findings nobody can act on.
  const original = host.g('rev-parse', '--abbrev-ref', 'HEAD').trim()
  const rootCommit = host.g('rev-list', '--max-parents=0', 'HEAD').trim()
  host.g('checkout', '-q', '-b', 'sibling', rootCommit)
  fs.writeFileSync(path.join(host.root, 'unrelated.txt'), 'a sibling session landed this\n')
  host.g('add', 'unrelated.txt')
  host.g('commit', '-q', '-m', 'sibling work')
  const divergent = host.g('rev-parse', 'HEAD').trim()
  host.g('checkout', '-q', original)
  assert.notStrictEqual(divergent, host.g('rev-parse', 'HEAD').trim())

  fs.writeFileSync(host.spec, fs.readFileSync(host.spec, 'utf8')
    .replace(/^diff_base:.*$/m, 'diff_base: ' + divergent))

  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.notStrictEqual(r.status, 0, 'a non-ancestor base must refuse rather than diff against it')
  assert.match(r.stderr, /is not an ancestor of HEAD/)
  assert.match(r.stderr, /set diff_base/, 'the refusal must name the remedy')
})

test('red-check recorded skipped-resume skips the residue check with it', () => {
  const host = makeHost()
  toRedAttribution(host)
  const sidecarState = path.join(host.sidecar, 'build-state.json')
  const marks = JSON.parse(fs.readFileSync(sidecarState, 'utf8'))
  marks.redCheck = 'skipped-resume'
  fs.writeFileSync(sidecarState, JSON.stringify(marks, null, 2) + '\n')
  // Landed, uncommitted work — on a resumed post-image tree every planned path differs from base,
  // so the residue check could only produce a false refusal here.
  fs.writeFileSync(path.join(host.root, 'src/bar.js'), 'module.exports = () => 7\n')

  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.strictEqual(r.status, 0,
    'refusing here would contradict the skip the driver itself recorded: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /skipped-resume/)
})
