'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { makeHost, readState, readStateRaw, run, stateOf, returnFileWith, CLEAN_RETURN } = require('./disposer-gate.fixtures')

// specs/20261104/01-the-legs-seal-the-manifest.md D4 — AC-20261104-01-6, -7, -8.

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const digestOf = sidecar => (readState(sidecar).manifestDigest || {})['1']
const DUP_ROW = { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0, preGreen: 0 } }

function sealedHost(prefix) {
  const host = makeHost(prefix)
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a green synthetic host must reach REVIEWER with manifest-1.jsonl written: ' + r.stdout + r.stderr)
  host.manifest = path.join(host.sidecar, 'manifest-1.jsonl')
  return host
}

test('AC-20261104-01-6: WHEN the first invocation on a green host runs legs and prints REVIEWER THE SYSTEM records manifestDigest["1"] as the sha256 hex of manifest-1.jsonl\'s bytes', () => {
  const host = sealedHost('seal-ac6')
  assert.match(String(digestOf(host.sidecar)), /^[0-9a-f]{64}$/,
    'without a recorded digest the manifest is unsealed and a later hand re-run of a leg script appends rows nothing notices: ' + JSON.stringify(readState(host.sidecar)))
  assert.strictEqual(digestOf(host.sidecar), sha256(host.manifest),
    'a digest that is not the sha256 of the manifest bytes would refuse an untouched manifest or bless a drifted one')
})

test('AC-20261104-01-7: WHEN a duplicate ac-matrix row is appended after the seal THE SYSTEM exits 2 on a bare invocation, --state and --mark reviewer-returned alike, naming the cause and the copy-first remedy, writing no reviewer return and leaving the sidecar byte-identical', () => {
  const host = sealedHost('seal-ac7')
  fs.appendFileSync(host.manifest, JSON.stringify(DUP_ROW) + '\n')
  const stateBefore = readStateRaw(host.sidecar)
  const returnFile = returnFileWith('seal-ac7-return', CLEAN_RETURN)
  const invocations = [[], ['--state'], ['--mark', 'reviewer-returned', '--file', returnFile]]
  for (const args of invocations) {
    const r = run(host.root, host.spec, ...args)
    const label = args.join(' ') || '(bare)'
    assert.strictEqual(r.status, 2,
      `a drifted manifest must refuse invocation "${label}" at exit 2 or the two readers deadlock later: ` + r.stdout + r.stderr)
    assert.match(r.stderr, /manifest-1\.jsonl changed after the legs run that sealed it/,
      `"${label}" refusal must name the file and the seal or the operator cannot tell what drifted: ` + r.stderr)
    assert.match(r.stderr, /leg:ac-matrix appears 2 times/,
      `"${label}" refusal must name the duplicated leg: ` + r.stderr)
    assert.match(r.stderr, /--manifest pointing at the live file/,
      `"${label}" refusal must name the cause so the hand re-run is not repeated: ` + r.stderr)
    assert.match(r.stderr, /cp /, `"${label}" refusal must state the copy-first rule: ` + r.stderr)
    assert.match(r.stderr, /rm [^\n]*manifest-1\.jsonl/, `"${label}" refusal must name the remedy command: ` + r.stderr)
  }
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'reviewer-return-1.json')),
    'a refused reviewer-returned mark must not record a return built on drifted evidence')
  assert.strictEqual(readStateRaw(host.sidecar), stateBefore,
    'a refusal must leave review-state.json byte-identical or the remedy re-run starts from a mutated sidecar')
})

test('AC-20261104-01-7: WHEN the appended row is not a duplicate THE SYSTEM refuses at exit 2 and names the cause "edited by hand"', () => {
  const host = sealedHost('seal-ac7-nodup')
  fs.appendFileSync(host.manifest, JSON.stringify({ leg: 'zzz', exit: 0, observed: {} }) + '\n')
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 2, 'a non-duplicate append is still drift and must be refused: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /edited by hand/, 'a non-duplicate drift must say it was edited by hand, not blame a leg re-run: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /appears \d+ times/, 'blaming a duplicate leg that does not exist misdirects the operator: ' + r.stderr)
})

test('AC-20261104-01-8: WHEN the manifest is removed after the refusal THE SYSTEM regenerates it at iteration 1, records the new digest and prints REVIEWER', () => {
  const host = sealedHost('seal-ac8')
  fs.appendFileSync(host.manifest, JSON.stringify(DUP_ROW) + '\n')
  const refused = run(host.root, host.spec)
  assert.strictEqual(refused.status, 2, 'setup precondition: the drift must be refused before the remedy applies: ' + refused.stdout + refused.stderr)
  fs.rmSync(host.manifest)
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'the documented remedy (rm the manifest, re-run) must succeed or the review is stuck: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'the regenerated iteration must land REVIEWER again: ' + r.stdout + r.stderr)
  assert.ok(fs.existsSync(host.manifest), 'the legs must regenerate manifest-1.jsonl at the same iteration')
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'manifest-2.jsonl')), 'regeneration must not advance the iteration')
  assert.strictEqual(digestOf(host.sidecar), sha256(host.manifest),
    'the regenerated manifest must be resealed or the next hand edit goes unnoticed')
})
