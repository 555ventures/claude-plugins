'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260903/05-status-diet.md: the default render is exactly four blocks — Roadmap, Next,
// up to three decide lines, one footer (AC-20260903-05-1..5,-7,-8). specs/20260909/08-next-
// carries-the-lanes.md (D1/D3/D4, ADR-0014) moves the lane render INTO the Next block in both
// the default render and --all, deletes 📋 All open work, moves --all's 🕓/⛔ sections to
// directly after the Next block's lane lines, and reworks the wait clause to "more open" /
// "nothing else open" (AC-20260909-08-2,-5,-6,-7,-10).

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
const sp = (status, extra) => 'date: 2026-07-01\nstatus: ' + status + (extra ? '\n' + extra : '')

test('AC-20260909-08-7 (⚡ clause retired, was AC-20260903-05-1): default render footer\'s zero-wait clause reads "nothing else open"', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-x.md': sp('hardened', 'brief: 01') },
    overviewRow: '| 01 | auth | P0 | — | ✅ done |', // hand-tracked-status: 1 hygiene finding
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.split('\n')
  const idxNext = lines.findIndex(l => l.includes('🎯 Next'))
  assert.ok(lines.findIndex(l => l.includes('🗺️ Roadmap')) < idxNext, 'D1: Roadmap must render before Next: ' + r.stdout)
  // ⚡ deliberately dropped: D1 now legitimately lets a lane header print by default (unreachable here).
  for (const forbidden of ['Anomalies', 'anomal', '⚠️ hand-tracked-status', '⛔', '🕓', '📡']) {
    assert.ok(!r.stdout.includes(forbidden), `D1: forbidden "${forbidden}" moved behind --all or was deleted: ${r.stdout}`)
  }
  const nextBlockLines = lines.slice(idxNext + 1, lines.indexOf('', idxNext + 1))
  assert.deepStrictEqual(nextBlockLines, ['/spec:run @specs/20260701/01-x.md'],
    'D1: the Next block is exactly the top-pick command, no trailing ⚠️ tag even though the host carries a hygiene finding')
  const nonEmpty = lines.filter(l => l.trim() !== '')
  assert.strictEqual(nonEmpty[nonEmpty.length - 1],
    '🟢 next is ready · nothing else open · 1 hygiene finding (/spec:doctor)',
    'AC-20260909-08-7/D4: the zero-wait clause is reworded to "nothing else open" — "nothing waits behind it" is retired wording')
})

test('AC-20260909-08-2 ("one command line" clause retired, was AC-20260903-05-2): default render prints the top pick plus a 🚦 solo branch and the reworded "N more open" wait clause', () => {
  const dir = host({
    specs: {
      '20260701/01-billing.md': sp('implementing'),
      '20260701/02-other.md': sp('hardened'),
      '20260701/03-another.md': sp('hardened'),
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.split('\n')
  const idxNext = lines.findIndex(l => l.includes('🎯 Next'))
  const nextBlockLines = lines.slice(idxNext + 1, lines.indexOf('', idxNext + 1))
  assert.deepStrictEqual(nextBlockLines, ['/spec:run @specs/20260701/01-billing.md', '   └─ 🚦 solo'],
    'D1(b): the default render now prints the solo branch under a single-lane pick, like --all does today')
  const nonEmpty = lines.filter(l => l.trim() !== '')
  assert.strictEqual(nonEmpty[nonEmpty.length - 1], '🟢 next is ready · 2 more open',
    'D4: two unblocked runner-ups — the reworded "N more open" clause, no other clause')
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

test('AC-20260909-08-6 (📋 deleted, was AC-20260903-05-7): --all prints 🧹 Hygiene with no 📋 header, and --all with --next stays a usage error', () => {
  const dir = host({
    briefs: { '01-auth.md': BRIEFS['01-auth.md'] },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 07' }, // orphan-stamp
  })
  const r = runNode(SCRIPT, ['--root', dir, '--all'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(!r.stdout.includes('📋'), 'D3: the 📋 All open work header is deleted outright, under no flag')
  assert.match(r.stdout, /🧹 Hygiene \(1\) — \/spec:doctor\n\s*\[orphan-stamp\]/,
    'D3: the hygiene catalogue keeps its place after the decide lines, ahead of the footer, printing the count and one [kind] line per hygiene anomaly')

  const usage = runNode(SCRIPT, ['--root', dir, '--all', '--next'])
  assert.strictEqual(usage.status, 2, 'D5/Contracts: --all combined with --next is a usage error')
})

test('AC-20260909-08-6: --all prints 🕓 after that then ⛔ blocked right after the Next block\'s lane lines and before the first ⚠️ decide line', () => {
  const dir = host({
    briefs: {
      '02-b.md': '# 02 — B\n\nPhase: P0 · Depends on: 04\n',
      '03-c.md': '# 03 — C\n\nPhase: P0 · Depends on: —\n',
      '04-d.md': '# 04 — D\n\nPhase: P0 · Depends on: —\n',
    },
    specs: {
      '20260701/01-a-lane.md': sp('hardened', 'brief: 02'),
      '20260701/02-a-sink.md': sp('hardened', 'brief: 02'),
      '20260701/03-c-lane.md': sp('hardened', 'brief: 03'),
      '20260701/04-x-blocked.md': sp('hardened', 'depends_on: [specs/20260701/01-a-lane.md]'),
    },
  })
  const r = runNode(SCRIPT, ['--root', dir, '--all'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(!r.stdout.includes('📋'), 'D3: 📋 All open work is deleted outright')
  const lines = r.stdout.split('\n')
  const idxLastLane = lines.lastIndexOf('/spec:run @specs/20260701/03-c-lane.md')
  const idxAfterThat = lines.findIndex(l => l.includes('🕓 after that:'))
  const idxBlocked = lines.findIndex(l => l.includes('⛔ blocked:'))
  const idxDecide = lines.findIndex(l => l.includes('⚠️'))
  assert.ok(idxLastLane !== -1 && idxAfterThat > idxLastLane && idxBlocked > idxAfterThat && idxBlocked < idxDecide,
    `AC-20260909-08-6/D3: order must be lane(${idxLastLane}) < 🕓(${idxAfterThat}) < ⛔(${idxBlocked}) < ⚠️(${idxDecide}) — under --all the lane/wait/blocked sections no longer sit behind the anomaly fold: ${r.stdout}`)
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

// Rank sorts 02-blocked (implementing) ahead of 01-inflight (hardened) — the top blocker names
// "01-inflight", the literal both ACs pin.
test('AC-20260909-08-5 / AC-20260909-08-10: an all-blocked top entry prints an ⏳ branch, no ⚡/🚦, the exact footer, and under --all its command once with ⛔ holding only the other entry', () => {
  const dir = host({
    specs: {
      '20260701/01-inflight.md': sp('hardened', 'depends_on: [specs/20260701/02-blocked.md]'),
      '20260701/02-blocked.md': sp('implementing', 'depends_on: [specs/20260701/01-inflight.md]'),
    },
  })
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, r.stderr)
  const topCmd = '/spec:run @specs/20260701/02-blocked.md'
  assert.match(r.stdout, new RegExp(`^${topCmd.replace(/[/.]/g, '\\$&')}\\n\\s+└─ ⏳ 01-inflight$`, 'm'),
    'the blocked-top entry prints its command and ⏳ branch exactly as --next does')
  assert.ok(!r.stdout.includes('⚡') && !r.stdout.includes('🚦'), 'AC-20260909-08-5: no ⚡/🚦 — nothing unblocked to fan out from')
  const nonEmpty = r.stdout.split('\n').filter(l => l.trim() !== '')
  assert.strictEqual(nonEmpty[nonEmpty.length - 1], '🟠 next is blocked · waiting on 01-inflight · 1 more open',
    'AC-20260909-08-5/D4: the exact blocked footer, reworded wait clause')

  const rAll = runNode(SCRIPT, ['--root', dir, '--all'])
  assert.strictEqual(rAll.status, 0, rAll.stderr)
  assert.strictEqual(rAll.stdout.split('\n').filter(l => l === topCmd).length, 1,
    'AC-20260909-08-10/D3: top pick prints once — a ⛔ re-print is the defect this spec removes: ' + rAll.stdout)
  assert.match(rAll.stdout, /⛔ blocked:\n\/spec:run @specs\/20260701\/01-inflight\.md/,
    'AC-20260909-08-10/D3: ⛔ blocked keeps only the OTHER entry (01-inflight)')
})
