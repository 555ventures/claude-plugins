'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260901/08-corpus-derivation-and-kill-match.md D6 (brief 19): fleet-reader.js
// gains two escapes keys derived from the joined effective-class count (sibling spec 07's
// byClass) crossed against the plugin's OWN replay corpus (spec/scripts/lib/replay-corpus.js's
// corpusPath()/parseCorpus(), D1) — `corpusGaps` names every non-unclassed class at or past
// CORPUS_BAR (2) recurrences with no corpus entry, and `registry` lists every non-unclassed class
// with its inCorpus flag, count-desc then class-asc. Today's fleet-reader.js has neither key — an
// AC-6/AC-7 assertion below reads out `undefined` or crashes on a shape mismatch, not a stub
// exit — and `silent-fallback` below is deliberately the real hand-authored corpus id (it already
// exists in the shipped spec/doctrine/replay-corpus.md), so this file exercises the real corpus
// file rather than a mock.

const SCRIPT = 'scripts/fleet-reader.js'

function mkRepo(root, name, rows) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  if (rows) fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return dir
}

function escRow(overrides = {}) {
  return {
    stage: 'escape', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null,
    unclassedReason: null, preventedBy: 'none', via: 'manual', ...overrides,
  }
}

function amendRow(overrides = {}) {
  return { stage: 'escape-class', unclassedReason: null, via: 'manual', ...overrides }
}

function runJson(root) {
  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

// AC-20260901-08-6
test('AC-20260901-08-6: escapes.corpusGaps lists exactly the non-unclassed classes at or past CORPUS_BAR with no corpus entry, and escapes.registry lists every non-unclassed class with count desc then class asc and the correct inCorpus flag', () => {
  const root = tmpdir('fleet-corpus-gaps-6')
  mkRepo(root, 'repo-a', [
    // a-b x2: one native, one via amendment — not a corpus id, count 2 (>= CORPUS_BAR) -> a gap.
    escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/p1.md', file: 'p1.js', class: 'a-b' }),
    escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/p2.md', file: 'p2.js', class: null }),
    amendRow({ ts: '2026-09-02T00:00:00Z', spec: 'specs/p2.md', file: 'p2.js', escapeTs: '2026-08-02T00:00:00Z', class: 'a-b' }),
    // c-d x1: not a corpus id, count 1 (< CORPUS_BAR) -> registry only, never a gap.
    escRow({ ts: '2026-08-03T00:00:00Z', spec: 'specs/p3.md', file: 'p3.js', class: 'c-d' }),
    // silent-fallback x3: a REAL hand-authored corpus id (spec/doctrine/replay-corpus.md) — must
    // never appear in corpusGaps regardless of count, and must carry inCorpus:true in registry.
    escRow({ ts: '2026-08-04T00:00:00Z', spec: 'specs/p4.md', file: 'p4.js', class: 'silent-fallback' }),
    escRow({ ts: '2026-08-05T00:00:00Z', spec: 'specs/p5.md', file: 'p5.js', class: 'silent-fallback' }),
    escRow({ ts: '2026-08-06T00:00:00Z', spec: 'specs/p6.md', file: 'p6.js', class: 'silent-fallback' }),
    // one unclassed row: must appear in neither corpusGaps nor registry.
    escRow({ ts: '2026-08-07T00:00:00Z', spec: 'specs/p7.md', file: 'p7.js', class: null }),
  ])
  const out = runJson(root)
  assert.deepStrictEqual(out.escapes.corpusGaps, [{ class: 'a-b', count: 2 }],
    `D6: corpusGaps must contain EXACTLY the classes at or past CORPUS_BAR (2) with no corpus entry ` +
    `— a-b (joined count 2, not in the corpus) qualifies; c-d (count 1, below the bar) and ` +
    `silent-fallback (a real corpus id, whatever its count) must both be absent; unclassed is never ` +
    `a class here: ${JSON.stringify(out.escapes.corpusGaps)}`)
  assert.deepStrictEqual(out.escapes.registry, [
    { class: 'silent-fallback', count: 3, inCorpus: true },
    { class: 'a-b', count: 2, inCorpus: false },
    { class: 'c-d', count: 1, inCorpus: false },
  ], `D6: registry must list every non-unclassed effective class, sorted count DESC then class ASC, ` +
    `each carrying the correct inCorpus flag against the plugin's own shipped corpus — a wrong order, ` +
    `a leaked "unclassed" row, or a flipped inCorpus flag here would corrupt escape.md step 4's ` +
    `killedMatch registry read (D9), which now reads escapes.registry instead of byClass keys: ` +
    `${JSON.stringify(out.escapes.registry)}`)
})

// AC-20260901-08-7
test('AC-20260901-08-7: the human render prints the corpusGaps line inside query 3, naming each gap\'s class and count with the exact authoring remedy, and prints "corpusGaps: none" when there is no gap', () => {
  const withGap = tmpdir('fleet-corpus-gaps-7a')
  mkRepo(withGap, 'repo-a', [
    escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/g1.md', file: 'g1.js', class: 'a-b' }),
    escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/g2.md', file: 'g2.js', class: 'a-b' }),
  ])
  const bareGap = runNode(SCRIPT, ['--repos-root', withGap])
  assert.strictEqual(bareGap.status, 0, bareGap.stderr)
  assert.match(bareGap.stdout,
    /^ {2}corpusGaps: a-b \(2 recurrences\) — author its section under ## Derived classes in spec\/doctrine\/replay-corpus\.md$/m,
    `D6/Behavior: the corpusGaps render line must name the gap's class and its exact fleet-wide ` +
    `count with this exact authoring remedy — a paraphrased or missing remedy leaves the escape ` +
    `session with no derived pointer to spec/doctrine/replay-corpus.md's own region: ${bareGap.stdout}`)

  const noGap = tmpdir('fleet-corpus-gaps-7b')
  mkRepo(noGap, 'repo-a', [
    escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/n1.md', file: 'n1.js', class: 'silent-fallback' }),
  ])
  const bareNoGap = runNode(SCRIPT, ['--repos-root', noGap])
  assert.strictEqual(bareNoGap.status, 0, bareNoGap.stderr)
  assert.match(bareNoGap.stdout, /^ {2}corpusGaps: none$/m,
    `D6/Behavior: a fleet with zero corpus gaps must print the literal "corpusGaps: none" line — ` +
    `an absent line here would be indistinguishable from a reader that simply forgot to check: ${bareNoGap.stdout}`)
})
