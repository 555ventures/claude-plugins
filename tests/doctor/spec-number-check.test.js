'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// Pins spec/scripts/spec-number-check.js — /spec:doctor's spec-number-collision check. The class it
// guards was measured five times in this repo (2026-09-11), most recently two hardened specs both
// numbered `specs/20260911/04-` minting eighteen identical AC-ids; renumbering one to `06-` is the
// fix that made this repo clean. Every test runs against a synthetic tree in tmpdir().

function writeSpec(root, relPath, status) {
  const abs = path.join(root, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, '---\nstatus: ' + status + '\n---\n# Spec\n')
  return abs
}

function run(root, extraArgs = []) {
  return runNode('scripts/spec-number-check.js', ['--root', root, ...extraArgs])
}

test('two live specs sharing one NN in one date directory exit 1, name both paths and the number', () => {
  const root = tmpdir()
  writeSpec(root, 'specs/20260911/04-every-criterion.md', 'hardened')
  writeSpec(root, 'specs/20260911/04-the-client-loop.md', 'hardened')
  writeSpec(root, 'specs/20260911/05-approval.md', 'hardened')
  const res = run(root)
  assert.strictEqual(res.status, 1, `a live duplicate must exit 1 — got ${res.status}: ${res.stdout}${res.stderr}`)
  assert.match(res.stdout, /specs\/20260911 number 04/, 'the finding line must name the directory and the number')
  assert.match(res.stdout, /04-every-criterion\.md \+ specs\/20260911\/04-the-client-loop\.md/,
    'the finding line must name both colliding spec paths')
  assert.match(res.stdout, /1 colliding number\(s\) — 3 specs across 1 date directories/,
    'the summary must count colliding numbers, specs scanned and directories scanned')
})

test('a directory with no duplicate exits 0 and reports the scan counts', () => {
  const root = tmpdir()
  writeSpec(root, 'specs/20260911/04-every-criterion.md', 'hardened')
  writeSpec(root, 'specs/20260911/06-the-client-loop.md', 'hardened')
  writeSpec(root, 'specs/20260910/04-theme.md', 'done')
  const res = run(root)
  assert.strictEqual(res.status, 0, `no duplicate must exit 0 — got ${res.status}: ${res.stdout}${res.stderr}`)
  assert.match(res.stdout, /clean — 3 specs across 2 date directories/, 'the clean summary must carry both counts')
})

test('a superseded spec never collides — one live beside one superseded is clean, on either side', () => {
  const root = tmpdir()
  writeSpec(root, 'specs/20260908/01-plugin-bump.md', 'superseded')
  writeSpec(root, 'specs/20260908/01-size-ratchet.md', 'done')
  writeSpec(root, 'specs/20260908/05-candidate-flows.md', 'done')
  writeSpec(root, 'specs/20260908/05-release-e2e.md', 'superseded')
  const res = run(root)
  assert.strictEqual(res.status, 0,
    `a superseded spec is terminal and its ACs are never re-derived — got ${res.status}: ${res.stdout}`)
})

test('the same number under two different date directories is not a collision, and `04a` is its own namespace', () => {
  const root = tmpdir()
  writeSpec(root, 'specs/20260910/04-theme.md', 'done')
  writeSpec(root, 'specs/20260911/04-every-criterion.md', 'hardened')
  writeSpec(root, 'specs/20260911/04a-successor.md', 'draft')
  const res = run(root)
  assert.strictEqual(res.status, 0,
    `the AC-id namespace is date + number, and 04a mints AC-…-04a-<n> — got ${res.status}: ${res.stdout}`)
})

test('a deviations sidecar and a non-spec file are skipped, never counted as a second spec', () => {
  const root = tmpdir()
  writeSpec(root, 'specs/20260911/04-every-criterion.md', 'hardened')
  writeSpec(root, 'specs/20260911/04-every-criterion-deviations.md', 'hardened')
  fs.writeFileSync(path.join(root, 'specs/20260911/README.md'), '# not a spec\n')
  fs.writeFileSync(path.join(root, 'specs/20260911/04-every-criterion.review'), 'not markdown\n')
  const res = run(root)
  assert.strictEqual(res.status, 0, `sidecars carry no ACs — got ${res.status}: ${res.stdout}`)
  assert.match(res.stdout, /clean — 1 specs across 1 date directories/, 'only the spec itself is counted')
})

test('--json prints one object carrying the scan counts and one finding per colliding number', () => {
  const root = tmpdir()
  writeSpec(root, 'specs/20260911/04-a.md', 'hardened')
  writeSpec(root, 'specs/20260911/04-b.md', 'draft')
  const res = run(root, ['--json'])
  assert.strictEqual(res.status, 1, 'findings still exit 1 under --json')
  const out = JSON.parse(res.stdout)
  assert.strictEqual(out.scannedDirs, 1)
  assert.strictEqual(out.scannedSpecs, 2)
  assert.strictEqual(out.findings.length, 1)
  assert.strictEqual(out.findings[0].number, '04')
  assert.deepStrictEqual(out.findings[0].specs,
    ['specs/20260911/04-a.md', 'specs/20260911/04-b.md'])
})

test('a root with no specs/ is the inapplicable sentinel at exit 0; a missing or bad --root is exit 2', () => {
  const empty = tmpdir()
  const res = run(empty)
  assert.strictEqual(res.status, 0, 'a host with no specs/ is not a failure')
  assert.match(res.stdout, /inapplicable — no specs\//)

  const noRoot = runNode('scripts/spec-number-check.js', [])
  assert.strictEqual(noRoot.status, 2, '--root is required')

  const badRoot = runNode('scripts/spec-number-check.js', ['--root', path.join(empty, 'nope')])
  assert.strictEqual(badRoot.status, 2, '--root must name an existing directory')

  const badFlag = runNode('scripts/spec-number-check.js', ['--root', empty, '--nope'])
  assert.strictEqual(badFlag.status, 2, 'an unknown flag is a usage error')
})

test('this repository at HEAD is clean — the guard is live, not merely authored', () => {
  const res = run(path.resolve(__dirname, '..', '..'))
  assert.strictEqual(res.status, 0,
    `specs/ must hold no live number collision — got:\n${res.stdout}${res.stderr}`)
})
