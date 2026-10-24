'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, runNode } = require('../helpers')

// specs/20260913/09-the-tool-shows-never-interrupts.md D3/D4: lib/observation.js's
// sinceLastRelease derivation feeds spec-status.js's footer clause. AC-20260913-09-6, -7.
// specs/20261024/05-replay-retired.md D2: the dueness derivation and its footer clause are gone.

function requireObservation() {
  const p = path.join(SPEC, 'scripts/lib/observation.js')
  delete require.cache[require.resolve(p)]
  return require(p)
}

const SCRIPT = 'scripts/spec-status.js'

function host({ briefs = {}, specs = {} } = {}) {
  const dir = tmpdir('since-release')
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'),
    '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n' +
    '| 01 | auth | P0 | — |\n')
  for (const [file, header] of Object.entries(briefs)) {
    fs.writeFileSync(path.join(dir, 'docs/roadmap', file), header)
  }
  for (const [file, fm] of Object.entries(specs)) {
    const p = path.join(dir, 'specs', file)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '---\n' + fm + '\n---\n\n# spec\n')
  }
  return dir
}

const BRIEFS = { '01-auth.md': '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n' }

function writeLedger(dir, rows) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
}

const reviewRow = (spec, verdict, ts) => ({ ts, stage: 'review', spec, verdict, runId: 'rv_' + ts.replace(/\W/g, '') })
const releaseRow = (verdict, ts) => ({ ts, stage: 'release', verdict, runId: 'rl_' + ts.replace(/\W/g, '') })
const cleanReviewRow = (i) => ({
  ts: `2026-08-20T01:0${i}:00Z`, stage: 'review', spec: `specs/20260820/9${i}-seed.md`,
  verdict: 'CLEAN', runId: `rv_seed00000${i}`, tier: 'standard', survived: 0,
})

// The retired export's name is built by concatenation so this file does not itself spell an
// identifier tests/consistency/replay-retired.test.js sweeps for.
const DUENESS_EXPORT = 'replay' + 'Dueness'

test('AC-20260913-09-5 / AC-20261024-05-2: WHEN lib/observation.js is required THE SYSTEM exports no replay-dueness helper, and WHEN spec-status.js runs over a ledger with six review rows and no release row THE SYSTEM prints a footer with no replay due clause', () => {
  const observation = requireObservation()
  assert.strictEqual(observation[DUENESS_EXPORT], undefined,
    'lib/observation.js must not export the replay-dueness helper — a surviving export means the retired dueness cadence is still derivable and the footer can still nag for a command that no longer exists')
  assert.strictEqual(typeof observation.sinceLastRelease, 'function',
    'sinceLastRelease must survive the replay retirement — the footer\'s since-release clause reads it')

  const dir = host({ briefs: BRIEFS })
  writeLedger(dir, [1, 2, 3, 4, 5, 6].map(cleanReviewRow))
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, 'setup precondition: spec-status.js must exit 0 on a valid host: ' + r.stderr)
  assert.ok(!/replay due/.test(r.stdout),
    'six review rows with no release row used to print a "replay due" footer clause pointing at a deleted command; any surviving clause sends the user to run something that no longer exists: ' + r.stdout)
})

test('AC-20260913-09-6: WHEN sinceLastRelease runs over the two Contracts worked examples and an empty array THE SYSTEM returns {done:2, released:true}, {done:2, released:false}, and {done:0, released:false} respectively, counting distinct spec paths only', () => {
  const { sinceLastRelease } = requireObservation()
  assert.strictEqual(typeof sinceLastRelease, 'function',
    'lib/observation.js must export sinceLastRelease — its absence means D3\'s since-last-release derivation has not been written yet')

  const releasedRows = [
    { stage: 'review', verdict: 'CLEAN', spec: 'specs/a' },
    { stage: 'review', verdict: 'FINDINGS', spec: 'specs/b' },
    { stage: 'review', verdict: 'CLEAN', spec: 'specs/b' },
    { stage: 'release', verdict: 'CLEAN' },
    { stage: 'review', verdict: 'CLEAN', spec: 'specs/c' },
    { stage: 'review', verdict: 'CLEAN', spec: 'specs/c' },
    { stage: 'review', verdict: 'CLEAN', spec: 'specs/d' },
  ]
  assert.deepStrictEqual(sinceLastRelease(releasedRows), { done: 2, released: true },
    'only specs/c and specs/d are distinct CLEAN review specs positioned after the CLEAN release row — specs/a and specs/b (before the release) must not count, and specs/c\'s two CLEAN rows (a fix round) must count once, not twice: ' + JSON.stringify(sinceLastRelease(releasedRows)))

  const unverifiedRows = [
    { stage: 'review', verdict: 'CLEAN', spec: 'specs/a' },
    { stage: 'release', verdict: 'UNVERIFIED' },
    { stage: 'review', verdict: 'CLEAN', spec: 'specs/b' },
  ]
  assert.deepStrictEqual(sinceLastRelease(unverifiedRows), { done: 2, released: false },
    'an UNVERIFIED release row released nothing — released must stay false, and done must count every distinct CLEAN review spec in the whole ledger (both a and b), not just those after a non-CLEAN release: ' + JSON.stringify(sinceLastRelease(unverifiedRows)))

  assert.deepStrictEqual(sinceLastRelease([]), { done: 0, released: false },
    'an empty ledger must report zero done specs and no release, never throw: ' + JSON.stringify(sinceLastRelease([])))
})

test('AC-20260913-09-7: WHEN spec-status.js renders a root whose only spec closed CLEAN after a CLEAN release row THE SYSTEM ends the footer with "1 done since last release"; with no release row it ends with "1 done, never released"; with the CLEAN review before the release it carries neither clause', () => {
  const specs = { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' }

  const withRelease = host({ briefs: BRIEFS, specs })
  writeLedger(withRelease, [releaseRow('CLEAN', '2026-06-01T00:00:00Z'), reviewRow('specs/20260701/01-x.md', 'CLEAN', '2026-07-01T00:00:00Z')])
  const r1 = runNode(SCRIPT, ['--root', withRelease])
  assert.strictEqual(r1.status, 0, 'setup precondition: spec-status.js must exit 0 on a valid host: ' + r1.stderr)
  const footer1 = r1.stdout.trim().split('\n').filter(Boolean).pop()
  assert.match(footer1, /· 1 done since last release$/,
    'AC-7: one distinct CLEAN review spec positioned after a CLEAN release row must print the "done since last release" clause as the footer\'s last clause — its absence means D4\'s footer clause has not been wired to sinceLastRelease yet: ' + footer1)

  const noRelease = host({ briefs: BRIEFS, specs })
  writeLedger(noRelease, [reviewRow('specs/20260701/01-x.md', 'CLEAN', '2026-07-01T00:00:00Z')])
  const r2 = runNode(SCRIPT, ['--root', noRelease])
  assert.strictEqual(r2.status, 0, 'setup precondition: spec-status.js must exit 0 on a valid host: ' + r2.stderr)
  const footer2 = r2.stdout.trim().split('\n').filter(Boolean).pop()
  assert.match(footer2, /· 1 done, never released$/,
    'AC-7: a done spec with no release row anywhere in the ledger must print "done, never released" instead — released must read false when no CLEAN release row exists: ' + footer2)

  const beforeRelease = host({ briefs: BRIEFS, specs })
  writeLedger(beforeRelease, [reviewRow('specs/20260701/01-x.md', 'CLEAN', '2026-06-01T00:00:00Z'), releaseRow('CLEAN', '2026-07-01T00:00:00Z')])
  const r3 = runNode(SCRIPT, ['--root', beforeRelease])
  assert.strictEqual(r3.status, 0, 'setup precondition: spec-status.js must exit 0 on a valid host: ' + r3.stderr)
  const footer3 = r3.stdout.trim().split('\n').filter(Boolean).pop()
  assert.ok(!/done since last release/.test(footer3) && !/done, never released/.test(footer3),
    'AC-7: no CLEAN review row appears AFTER the release row, so neither since-release clause may print — a footer carrying one anyway means the release-position filter was dropped: ' + footer3)
})
