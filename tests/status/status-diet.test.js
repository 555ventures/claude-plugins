'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260903/05-status-diet.md: the default /spec:status render is exactly four blocks —
// 🗺️ Roadmap, 🎯 Next, up to three ⚠️ decide lines, one footer — with the anomaly fold, the
// ⚠️ Anomalies section, the lane render, the 📡 block and the headline verdict moved behind
// `--all` or deleted outright. AC-20260903-05-1..5, -7, -8.

const SCRIPT = 'scripts/spec-status.js'

function host({ briefs = {}, specs = {}, overviewRow = null } = {}) {
  const dir = tmpdir('status-diet')
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'),
    '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n' +
    (overviewRow ? overviewRow + '\n' : '| 01 | auth | P0 | — |\n'))
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

const BRIEFS = {
  '01-auth.md': '# 01 — Auth\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
  '02-billing.md': '# 02 — Billing\n\nPhase: P0 · Depends on: 01 · Primary workspaces: api\n',
  '03-reports.md': '# 03 — Reports\n\nPhase: P1 · Depends on: 01, 02 ·\nPrimary workspaces: web\n',
}

test('AC-20260903-05-1: default render is exactly Roadmap, Next, and a footer — no lane/anomaly/observation surface, no tag on the Next line', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 01' },
    overviewRow: '| 01 | auth | P0 | — | ✅ done |', // hand-tracked-status: 1 hygiene finding
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.split('\n')
  const idxRoadmap = lines.findIndex(l => l.includes('🗺️ Roadmap'))
  const idxNext = lines.findIndex(l => l.includes('🎯 Next'))
  assert.ok(idxRoadmap !== -1 && idxNext !== -1, 'test fixture bug: Roadmap and Next must both render: ' + r.stdout)
  assert.ok(idxRoadmap < idxNext, 'D1: Roadmap must render before Next')
  for (const forbidden of ['Anomalies', 'anomal', '⚠️ hand-tracked-status', '⛔', '🕓', '⚡', '📡']) {
    assert.ok(!r.stdout.includes(forbidden), `D1: the default render must never contain "${forbidden}" — that surface moved behind --all or was deleted: ${r.stdout}`)
  }
  const nextBlockLines = lines.slice(idxNext + 1, lines.indexOf('', idxNext + 1))
  assert.deepStrictEqual(nextBlockLines, ['/spec:run @specs/20260701/01-x.md'],
    'D1: the Next block is exactly the top-pick command, no trailing ⚠️ tag even though the host carries a hygiene finding')
  const nonEmpty = lines.filter(l => l.trim() !== '')
  assert.strictEqual(nonEmpty[nonEmpty.length - 1],
    '🟢 next is ready · nothing waits behind it · 1 hygiene finding (/spec:doctor)',
    'D4: the one-line footer is the LAST line, carrying the verdict glyph and the hygiene count clause')
})

test('AC-20260903-05-2: an unblocked top pick with two other open specs prints exactly one Next command and the plural wait clause', () => {
  const dir = host({
    specs: {
      '20260701/01-billing.md': 'date: 2026-07-01\nstatus: implementing',
      '20260701/02-other.md': 'date: 2026-07-01\nstatus: hardened',
      '20260701/03-another.md': 'date: 2026-07-01\nstatus: hardened',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.split('\n')
  const idxNext = lines.findIndex(l => l.includes('🎯 Next'))
  const nextBlockLines = lines.slice(idxNext + 1, lines.indexOf('', idxNext + 1))
  assert.deepStrictEqual(nextBlockLines, ['/spec:run @specs/20260701/01-billing.md'],
    'D1: exactly one command line in the Next block — the closest-to-done (implementing) entry')
  const nonEmpty = lines.filter(l => l.trim() !== '')
  assert.strictEqual(nonEmpty[nonEmpty.length - 1], '🟢 next is ready · 2 wait behind it',
    'D4: two unblocked runner-ups behind the top pick — plural wait clause, no other clause (m/k/h are all zero here)')
})

test('AC-20260903-05-3: a skipped-brief decide pair prints as one sentence, one question, one paste — no bracketed kind line', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-reports-ui.md': 'date: 2026-07-10\nstatus: implementing\nbrief: 03',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout,
    /⚠️ Brief 03 \(reports\) moved on, but its dependency 02 \(billing\) was never planned\.\n   Plan it now\?  \/spec:plan @docs\/roadmap\/02-billing\.md/,
    'D3: the decide pair (line, then 3-space-indented ask + double-space + paste) must print for the unplanned dependency under the moved brief')
  assert.doesNotMatch(r.stdout, /\[skipped-brief\]/, 'D2: skipped-brief is a decide kind, never rendered as a bracketed hygiene-style line')
})

test('AC-20260903-05-4: --json carries audience on both anomaly kinds — decide gets line/ask/paste, hygiene gets neither, detail is unchanged on both', () => {
  const dir = host({
    briefs: BRIEFS,
    specs: {
      '20260701/01-auth-core.md': 'date: 2026-07-01\nstatus: done\nbrief: 01',
      '20260710/01-reports-ui.md': 'date: 2026-07-10\nstatus: implementing\nbrief: 03',
      '20260701/04-typo.md': 'date: 2026-07-01\nstatus: done\nbrief: 07',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const j = JSON.parse(r.stdout)
  const skip = j.anomalies.find(a => a.kind === 'skipped-brief')
  assert.ok(skip, 'test fixture bug: skipped-brief must be present: ' + r.stdout)
  assert.strictEqual(skip.audience, 'decide', 'D2: skipped-brief is classified decide')
  assert.strictEqual(skip.line, 'Brief 03 (reports) moved on, but its dependency 02 (billing) was never planned.',
    'D3: the decide line is computed at push time, matching the Contracts shape')
  assert.strictEqual(skip.ask, 'Plan it now?', 'D3: the ask matches the Contracts shape')
  assert.strictEqual(skip.paste, '/spec:plan @docs/roadmap/02-billing.md', 'D3/literal: the paste is the exact remedy command')
  assert.ok(skip.detail, 'D2: detail must stay present for --json consumers and doctor')

  const orphan = j.anomalies.find(a => a.kind === 'orphan-stamp')
  assert.ok(orphan, 'test fixture bug: orphan-stamp must be present: ' + r.stdout)
  assert.strictEqual(orphan.audience, 'hygiene', 'D2: orphan-stamp is classified hygiene')
  assert.ok(!Object.prototype.hasOwnProperty.call(orphan, 'line'), 'D2: a hygiene anomaly must carry no line key')
  assert.ok(!Object.prototype.hasOwnProperty.call(orphan, 'ask'), 'D2: a hygiene anomaly must carry no ask key')
  assert.ok(!Object.prototype.hasOwnProperty.call(orphan, 'paste'), 'D2: a hygiene anomaly must carry no paste key')
  assert.ok(orphan.detail, 'D2: detail must stay present on the hygiene anomaly too')
})

test('AC-20260903-05-5: five decide anomalies cap at three by default with a "2 more to decide" footer clause, all five under --all', () => {
  const dir = host({
    briefs: {
      '02-a.md': '# 02 — A\n\nPhase: P1 · Depends on: — · Primary workspaces: x\n',
      '03-b.md': '# 03 — B\n\nPhase: P1 · Depends on: — · Primary workspaces: x\n',
      '04-c.md': '# 04 — C\n\nPhase: P1 · Depends on: — · Primary workspaces: x\n',
      '05-d.md': '# 05 — D\n\nPhase: P1 · Depends on: — · Primary workspaces: x\n',
      '06-e.md': '# 06 — E\n\nPhase: P1 · Depends on: — · Primary workspaces: x\n',
      '07-f.md': '# 07 — F\n\nPhase: P1 · Depends on: — · Primary workspaces: x\n',
    },
    specs: { '20260701/01-f.md': 'date: 2026-07-01\nstatus: done\nbrief: 07' },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const decideLines = r.stdout.split('\n').filter(l => /^⚠️ /.test(l))
  assert.strictEqual(decideLines.length, 3, 'D3: exactly three decide lines by default, capped in derivation order: ' + r.stdout)
  const nonEmpty = r.stdout.split('\n').filter(l => l.trim() !== '')
  assert.match(nonEmpty[nonEmpty.length - 1], /· 2 more to decide \(--all\)/,
    'D3/D4: the overflow count (5 - 3 = 2) must appear as a footer clause')

  const all = runNode(SCRIPT, ['--root', dir, '--all'])
  assert.strictEqual(all.status, 0, all.stderr)
  const decideLinesAll = all.stdout.split('\n').filter(l => /^⚠️ /.test(l))
  assert.strictEqual(decideLinesAll.length, 5, 'D3: --all lifts the cap and prints all five decide lines: ' + all.stdout)
})

test('AC-20260903-05-7: --all prints a 🧹 Hygiene catalogue with one bracketed line per hygiene anomaly, and --all with --next is usage', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 07' }, // orphan-stamp
  })
  const r = runNode(SCRIPT, ['--root', dir, '--all'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /📋 All open work/, 'D5: --all prints the lane block under this header')
  assert.match(r.stdout, /🧹 Hygiene \(1\) — \/spec:doctor\n\s*\[orphan-stamp\]/,
    'D5: the hygiene catalogue prints the count and one [kind] line per hygiene anomaly')

  const usage = runNode(SCRIPT, ['--root', dir, '--all', '--next'])
  assert.strictEqual(usage.status, 2, 'D5/Contracts: --all combined with --next is a usage error')
})

test('AC-20260903-05-8: nothing-actionable prints the blocked-brief message and the ⬜ nothing-waits footer', () => {
  const dir = host({
    briefs: {
      '01-x.md': '# 01 — X\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
      '02-y.md': '# 02 — Y\n\nPhase: P0 · Depends on: 99 · Primary workspaces: api\n', // 99 never exists
    },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 01' },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^   ✨ nothing actionable — all specs done; 1 unplanned brief\(s\) blocked on unmet dependencies$/m,
    'Behavior: nothing-next message under 🎯 Next when every spec is done and the sole unplanned brief is blocked on a nonexistent dependency')
  const nonEmpty = r.stdout.split('\n').filter(l => l.trim() !== '')
  assert.strictEqual(nonEmpty[nonEmpty.length - 1], '⬜ nothing waits',
    'D4: the ⬜ nothing-waits footer, no other clause (n/m/k/h all zero on this host)')
})

test('AC-20260903-05-8: an all-blocked top entry prints its command with an ⏳ branch and the blocked footer naming the blocker', () => {
  // Rank (implementing < hardened) decides which of the two mutually-blocked entries sorts
  // first: 02-blocked (implementing, rank 0) sorts ahead of 01-inflight.md (hardened, rank 1),
  // so the top entry's own blocker names the file "01-inflight" — the literal the AC pins.
  const dir = host({
    specs: {
      '20260701/01-inflight.md': 'date: 2026-07-01\nstatus: hardened\ndepends_on: [specs/20260701/02-blocked.md]',
      '20260701/02-blocked.md': 'date: 2026-07-01\nstatus: implementing\ndepends_on: [specs/20260701/01-inflight.md]',
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^\/spec:run @specs\/20260701\/02-blocked\.md\n\s+└─ ⏳ 01-inflight$/m,
    'Behavior: the blocked-top entry prints its command and its ⏳ branch line exactly as --next does')
  const nonEmpty = r.stdout.split('\n').filter(l => l.trim() !== '')
  // The other (mutually-blocked) entry also counts toward the wait clause, so this pins the
  // required head-and-blocker-name prefix rather than the full line (D4's clause list is a
  // general contract, not scoped to a zero-wait fixture the way AC-20260903-05-1/-8's other
  // case is).
  assert.match(nonEmpty[nonEmpty.length - 1], /^🟠 next is blocked · waiting on 01-inflight\b/,
    'D4: the blocked head names the short blocker — waiting on 01-inflight')
})
