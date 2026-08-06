'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260805/03-done-unobserved-observation.md (2026-08-05): `done` gains a derived
// sub-state read from `.claude/spec-runs.jsonl`'s `stage:"observe"` rows (D2/D5). Pins
// AC-20260805-03-5 (pending vs resolved, runAt-max not line-order — a union-merge reorder must
// never launder a stale red into the winning row) and AC-20260805-03-6 (a red observation is a
// dashboard-level alarm: headline glyph, --next top pick as a full oracle-shaped `/spec:escape`
// entry, and suppression of the plan-next-brief fallback while it exists). observe-ci.js's own
// append/ancestry behavior is pinned separately in tests/status/observe-ci.test.js — this file
// exercises spec-status.js's read side only, against a hand-written ledger fixture.

const SCRIPT = 'scripts/spec-status.js'

function host({ briefs = {}, specs = {}, ledgerRows = [] } = {}) {
  const dir = tmpdir('done-unobserved')
  if (Object.keys(briefs).length) {
    fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'),
      '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n')
    for (const [file, header] of Object.entries(briefs)) {
      fs.writeFileSync(path.join(dir, 'docs/roadmap', file), header)
    }
  }
  for (const [file, fm] of Object.entries(specs)) {
    const p = path.join(dir, 'specs', file)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '---\n' + fm + '\n---\n\n# spec\n')
  }
  if (ledgerRows.length) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), ledgerRows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  }
  return dir
}

test('AC-20260805-03-5: a done spec with zero qualifying observe rows renders done-unobserved and reports observation:"pending"', () => {
  const dir = host({ specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\n' } })
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--json']).stdout)
  const spec = j.specs.find((s) => s.path === 'specs/20260701/01-x.md')
  assert.ok(spec, 'test fixture bug: the done spec must appear in --json specs[]')
  assert.strictEqual(spec.observation, 'pending',
    'a done spec with zero observe rows has never been checked against real CI — it must report pending, never silently pass as plain done')
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /done ⏳ unobserved/,
    'D5: a pending done spec must render as "done ⏳ unobserved" (locked spelling) — a clean-looking dashboard must never coexist with an unchecked landed spec')
})

test('AC-20260805-03-5: state is the qualifying row with the greatest runAt, not the last row in file order — a newer green row wins over an older red row', () => {
  const specPath = 'specs/20260701/01-x.md'
  // The green row sits EARLIER in the ledger file (line 2) but carries the LATER runAt; the red
  // row sits LATER in the file (line 3) but carries the EARLIER runAt. A last-line-wins
  // implementation would pick red; the spec (D2, "union merges reorder") requires runAt-max.
  const ledgerRows = [
    { ts: '2026-07-05', stage: 'review', spec: specPath, verdict: 'CLEAN' },
    { ts: '2026-07-06', stage: 'observe', spec: specPath, branch: 'main', ci: 'green', sha: 'ccc1111', url: 'https://github.com/x/y/actions/runs/2', runAt: '2026-07-06T12:00:00Z' },
    { ts: '2026-07-06', stage: 'observe', spec: specPath, branch: 'main', ci: 'red', sha: 'bbb2222', url: 'https://github.com/x/y/actions/runs/1', runAt: '2026-07-06T09:00:00Z' },
  ]
  const dir = host({ specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\n' }, ledgerRows })
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--json']).stdout)
  const spec = j.specs.find((s) => s.path === specPath)
  assert.strictEqual(spec.observation, 'green',
    'the green row has the greater runAt despite sitting earlier in the file — state must be derived by runAt-max, or a union-merged worktree history silently launders a red into a false green (D2)')
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout, /done ⏳ unobserved/, 'a resolved-green observation must render as plain done, not unobserved')
  assert.doesNotMatch(r.stdout, /done-but-red/, 'the older red row must never win over the newer green one')
  assert.match(r.stdout.split('\n')[0], /^🟢/, 'a green-resolved observation must never turn the headline red')
})

const BRIEFS_AC6 = {
  '01-auth.md': '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
  '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
}

test('AC-20260805-03-6: a red latest observation turns the headline red, tops --next as a full oracle-shaped escape entry, and suppresses the plan-next-brief fallback', () => {
  const specPath = 'specs/20260701/01-auth-core.md'
  const ledgerRows = [
    { ts: '2026-07-05', stage: 'review', spec: specPath, verdict: 'CLEAN' },
    { ts: '2026-07-06', stage: 'observe', spec: specPath, branch: 'main', ci: 'red', sha: 'deadbee', url: 'https://github.com/x/y/actions/runs/9', runAt: '2026-07-06T09:00:00Z' },
  ]
  // Brief 02 is unplanned and its sole dependency (brief 01) is done — with no red observation
  // this would be the ordinary all-done → plan-next-brief pick (D5c must suppress it).
  const dir = host({
    briefs: BRIEFS_AC6,
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
    ledgerRows,
  })

  const dash = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(dash.status, 0, dash.stderr)
  assert.match(dash.stdout.split('\n')[0], /^🔴/,
    'D5(a): a red latest observation is a dashboard-level alarm — the headline glyph must turn 🔴, overriding the ordinary 🟢/🟠 choice')

  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.ok(j.next.length, 'test fixture bug: --next must return at least the escape entry')
  const top = j.next[0]
  assert.strictEqual(top.action, '/spec:escape', 'D5(b): a red observation must outrank every build/review/plan action as the --next top pick')
  assert.strictEqual(top.path, specPath, 'D5(b): the escape entry must point at the red spec itself')
  assert.strictEqual(top.status, 'done', 'D5(b): the escape entry carries the spec\'s real status, not a synthetic one')
  assert.strictEqual(top.brief, '01', 'D5(b): the escape entry carries the spec\'s brief for the checkpoint/lane logic')
  assert.deepStrictEqual(top.blockers, [], 'D5(b): blockers:[] is pinned — a populated blockers array would make the autopilot lane treat a ready escape as stuck')
  assert.strictEqual(top.parallel, false, 'D5(b): escape entries are excluded from the parallel fan-out — parallel must be false, not null (no claim)')
  assert.strictEqual(top.parallel_reason, null, 'D5(b): parallel_reason must be null alongside parallel:false')
  assert.match(top.note, /main/, 'D5(b): the note must carry the branch — the escape session derives its evidence from this field')
  assert.match(top.note, /deadbee/, 'D5(b): the note must carry the sha')
  assert.match(top.note, /runs\/9/, 'D5(b): the note must carry the run url')

  assert.ok(!j.next.some((e) => e.action === '/spec:plan'),
    'D5(c): while an escape entry exists the all-done → plan-next-brief branch must be suppressed entirely, not merely deprioritized — escapes outrank new planning')
})
