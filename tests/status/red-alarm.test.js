'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260807/01-observation-red-alarm.md: D2 slims the derived observation
// sub-state to `n/a`/`ok`/`red` — `pending` is retired, and so is every other resolved-but-
// non-red string ("green" collapses into "ok" too). Nothing renders for "ok": no ⏳, no
// "unobserved", no 📡 section unless a spec is red (AC-2). AC-7 and the tie-break half of
// AC-10 pin behavior the D2/D3 Decisions explicitly leave unchanged (lib/observation.js's
// runAt-max + red-wins-tie algorithm, and the red-alarm render) — sanctioned pin exceptions,
// green pre-change, relocated here from tests/status/done-unobserved.test.js (deleted, D2) per
// this repo's AC-20260805-01-7/AC-20260805-03-7 precedent for retagged invariants. The
// runAt-max-not-line-order half of AC-10 DOES newly fail: the winning green row now reports
// observation:"ok" instead of "green" (D2's contract collapse).

const SCRIPT = 'scripts/spec-status.js'

function host({ briefs = {}, specs = {}, ledgerRows = [] } = {}) {
  const dir = tmpdir('red-alarm')
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

test('AC-20260807-01-2: a done spec with zero qualifying observe rows reports observation:"ok" and renders no 📡/⏳/unobserved anywhere', () => {
  const dir = host({ specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\n' } })
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--json']).stdout)
  const spec = j.specs.find((s) => s.path === 'specs/20260701/01-x.md')
  assert.ok(spec, 'test fixture bug: the done spec must appear in --json specs[]')
  assert.strictEqual(spec.observation, 'ok',
    'a done spec with no qualifying observe rows must report "ok" — the retired "pending" certification state must never be emitted again (D2)')
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout, /📡/, 'an "ok" observation must never render the 📡 section — the retired certification state must stay fully silent')
  assert.doesNotMatch(r.stdout, /⏳/, 'the ⏳ unobserved glyph must never appear — D2 deletes the pending state entirely')
  assert.doesNotMatch(r.stdout, /unobserved/, 'the word "unobserved" must never appear anywhere in the render')
})

// (sanctioned pin exception, green pre-change): D3's rationale states the red path — headline
// glyph, red line, full oracle-shaped /spec:escape entry — is explicitly unchanged by this
// spec ("same ledger stage, same escape entry shape, same D8 derive path"). Relocated verbatim
// from the retired done-unobserved.test.js (carried as AC-20260805-03-6 there).
const BRIEFS_AC7 = {
  '01-auth.md': '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
  '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
}

// AC-20260903-05-6 (rewritten in place, D8, specs/20260903/05-status-diet.md): the 📡
// Observation block is deleted; a red observation now renders as the /spec:escape Next line
// plus a 🔴 footer sentence carrying branch, sha and url — the old 📡 line assertion below is
// rewritten to the new footer literal, never weakened.
test('AC-20260807-01-7 / AC-20260903-05-6: a red latest observation turns the headline red, renders the 🔴 footer with branch/sha/url (no 📡 line), and tops --next as a full oracle-shaped escape entry', () => {
  const specPath = 'specs/20260701/01-auth-core.md'
  const ledgerRows = [
    { ts: '2026-07-05', stage: 'review', spec: specPath, verdict: 'CLEAN' },
    { ts: '2026-07-06', stage: 'observe', spec: specPath, branch: 'main', ci: 'red', sha: 'deadbee', url: 'https://github.com/x/y/actions/runs/9', runAt: '2026-07-06T09:00:00Z' },
  ]
  // Brief 02 is unplanned and its sole dependency (brief 01) is done — with no red observation
  // this would be the ordinary all-done → plan-next-brief pick (D5c must suppress it).
  const dir = host({
    briefs: BRIEFS_AC7,
    specs: { '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
    ledgerRows,
  })

  const dash = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(dash.status, 0, dash.stderr)
  const dashNonEmpty = dash.stdout.split('\n').filter((l) => l.trim() !== '')
  assert.match(dashNonEmpty[dashNonEmpty.length - 1], /^🔴/,
    'D1: a red latest observation is a dashboard-level alarm — the bottom-anchored headline glyph must turn 🔴')
  assert.strictEqual(dashNonEmpty[dashNonEmpty.length - 1],
    '🔴 CI is red on specs/20260701/01-auth-core.md — main@deadbee (https://github.com/x/y/actions/runs/9)',
    'AC-20260903-05-6/D8: the 📡 block is deleted — the red alarm now lives entirely in the footer, carrying the spec path, branch, sha, and url as its last line')
  assert.doesNotMatch(dash.stdout, /📡/, 'AC-20260903-05-6/D8: the 📡 Observation block must never render — the alarm is the footer line alone')

  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.ok(j.next.length, 'test fixture bug: --next must return at least the escape entry')
  const top = j.next[0]
  assert.strictEqual(top.action, '/spec:escape', 'a red observation must outrank every build/review/plan action as the --next top pick')
  assert.strictEqual(top.path, specPath, 'the escape entry must point at the red spec itself')
  assert.deepStrictEqual(top.blockers, [], 'blockers:[] is pinned — a populated blockers array would make an external --next --json consumer treat a ready escape as stuck')
  assert.strictEqual(top.parallel, false, 'escape entries are excluded from the parallel fan-out — parallel must be false, not null')
  assert.strictEqual(top.parallel_reason, null, 'parallel_reason must be null alongside parallel:false')
  assert.match(top.note, /main/, 'the note must carry the branch — the escape session derives its evidence from this field')
  assert.match(top.note, /deadbee/, 'the note must carry the sha')
  assert.match(top.note, /runs\/9/, 'the note must carry the run url')
  assert.ok(!j.next.some((e) => e.action === '/spec:plan'),
    'while an escape entry exists the all-done → plan-next-brief branch must be suppressed entirely')
})

test('AC-20260807-01-10: the qualifying row is the greatest runAt regardless of file line order — a newer green row clears an older red row and reports observation:"ok"', () => {
  const specPath = 'specs/20260701/01-x.md'
  // The green row sits EARLIER in the ledger file (line 2) but carries the LATER runAt; the red
  // row sits LATER in the file (line 3) but carries the EARLIER runAt. A last-line-wins
  // implementation would pick red; D2 requires runAt-max.
  const ledgerRows = [
    { ts: '2026-07-05', stage: 'review', spec: specPath, verdict: 'CLEAN' },
    { ts: '2026-07-06', stage: 'observe', spec: specPath, branch: 'main', ci: 'green', sha: 'ccc1111', url: 'https://github.com/x/y/actions/runs/2', runAt: '2026-07-06T12:00:00Z' },
    { ts: '2026-07-06', stage: 'observe', spec: specPath, branch: 'main', ci: 'red', sha: 'bbb2222', url: 'https://github.com/x/y/actions/runs/1', runAt: '2026-07-06T09:00:00Z' },
  ]
  const dir = host({ specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\n' }, ledgerRows })
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--json']).stdout)
  const spec = j.specs.find((s) => s.path === specPath)
  assert.strictEqual(spec.observation, 'ok',
    'the winning row is green (greater runAt) — under D2\'s collapsed contract a resolved-green observation must report "ok", not the retired "green" string')
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout, /done-but-red/, 'the older red row must never win over the newer green one')
  const nonEmpty = r.stdout.split('\n').filter((l) => l.trim() !== '')
  assert.match(nonEmpty[nonEmpty.length - 1], /^🟢/,
    'D1: a green-resolved observation must never turn the bottom-anchored headline red')
})

// (sanctioned pin exception, green pre-change): lib/observation.js's runAt-tie red-wins rule is
// explicitly unchanged by D2 ("lib/observation.js ... is unchanged — only the mapping and
// render die"), so the tie-break itself already resolves to the red row on current code; only
// the AC-1 render-order surface (pinned in tests/spec-status.test.js) actually moves.
test('AC-20260807-01-10: equal runAt values break the tie toward red — a same-runAt red row must win over a same-runAt green row', () => {
  const specPath = 'specs/20260701/01-tie.md'
  const ledgerRows = [
    { ts: '2026-07-06', stage: 'observe', spec: specPath, branch: 'main', ci: 'green', sha: 'ccc1111', url: 'https://github.com/x/y/actions/runs/2', runAt: '2026-07-06T09:00:00Z' },
    { ts: '2026-07-06', stage: 'observe', spec: specPath, branch: 'main', ci: 'red', sha: 'bbb2222', url: 'https://github.com/x/y/actions/runs/1', runAt: '2026-07-06T09:00:00Z' },
  ]
  const dir = host({ specs: { '20260701/01-tie.md': 'date: 2026-07-01\nstatus: done\n' }, ledgerRows })
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--json']).stdout)
  const spec = j.specs.find((s) => s.path === specPath)
  assert.strictEqual(spec.observation, 'red', 'an exact runAt tie between a red and a green row must resolve to red, never silently favor green')
  const r = runNode(SCRIPT, ['--root', dir])
  const nonEmpty = r.stdout.split('\n').filter((l) => l.trim() !== '')
  assert.match(nonEmpty[nonEmpty.length - 1], /^🔴/,
    'D1: a tie-broken-to-red observation must still turn the bottom-anchored headline glyph 🔴')
})
