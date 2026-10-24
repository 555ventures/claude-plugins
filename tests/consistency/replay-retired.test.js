'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read, runNode } = require('../helpers')

// specs/20261024/05-replay-retired.md: mutation replay is removed as one unit. This file pins
// that the retired vocabulary has zero live hits, the unit's files are gone, the doctrine and
// ADR records say so, and the unrelated prototype REPLAY step of the build stage is untouched.
// The retired identifiers are assembled from fragments so this file never matches its own sweep.

const j = (...parts) => parts.join('')
const RETIRED = [
  { id: j('scripts/', 'replay', '.js'), match: (t) => t.includes(j('scripts/', 'replay', '.js')) },
  { id: j('replay', '-corpus'), match: (t) => t.includes(j('replay', '-corpus')) },
  { id: j('spec:', 'replay'), match: (t) => t.includes(j('spec:', 'replay')) },
  { id: j('replay', 'Dueness'), match: (t) => t.includes(j('replay', 'Dueness')) },
  { id: j('replay', 'Debt'), match: (t) => t.includes(j('replay', 'Debt')) },
  { id: j('REPLAY', '_EVERY'), match: (t) => t.includes(j('REPLAY', '_EVERY')) },
  { id: j('isMeasurement', 'Replay'), match: (t) => t.includes(j('isMeasurement', 'Replay')) },
  { id: j('lastMeasurement', 'ReplayIdx'), match: (t) => t.includes(j('lastMeasurement', 'ReplayIdx')) },
  { id: j('corpus', 'Gaps'), match: (t) => t.includes(j('corpus', 'Gaps')) },
  { id: j('--audit', '-claims'), match: (t) => t.includes(j('--audit', '-claims')) },
  { id: j('inapplicable', 'Classes'), match: (t) => t.includes(j('inapplicable', 'Classes')) },
  // `--mark replayed` (the prototype REPLAY step) must not match: a word-char or dash may not follow.
  { id: j('--', 'replay'), match: (t) => new RegExp(j('--', 'replay', '(?![\\w-])')).test(t) },
]

const SELF = path.relative(ROOT, __filename)
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude-plugin-cache'])

function walk(abs, out) {
  const st = fs.statSync(abs)
  if (st.isFile()) { out.push(abs); return }
  for (const name of fs.readdirSync(abs)) {
    if (SKIP_DIRS.has(name)) continue
    walk(path.join(abs, name), out)
  }
}

function liveFiles() {
  const out = []
  for (const rel of ['spec', 'tests', 'scripts', 'README.md', '.claude/spec.config.json']) {
    const abs = path.join(ROOT, rel)
    if (fs.existsSync(abs)) walk(abs, out)
  }
  return out.filter((f) => path.relative(ROOT, f) !== SELF)
}

test('AC-20261024-05-1: no file under spec/, tests/, scripts/, README.md or .claude/spec.config.json spells any retired replay identifier', () => {
  const hits = []
  for (const f of liveFiles()) {
    let text
    try { text = fs.readFileSync(f, 'utf8') } catch { continue }
    for (const r of RETIRED) {
      if (r.match(text)) hits.push(path.relative(ROOT, f) + ' :: ' + r.id)
    }
  }
  assert.deepStrictEqual(hits, [],
    'a surviving retired identifier means a caller, doc or test still points at a command that no longer exists — a session following it dead-ends. Hits:\n  ' + hits.join('\n  '))
})

test('AC-20261024-05-1: the replay script, corpus library, command, corpus doctrine, tests/replay/ and the corpus-gaps test no longer exist', () => {
  const gone = [
    j('spec/scripts/', 'replay', '.js'),
    j('spec/scripts/lib/', 'replay', '-corpus.js'),
    j('spec/commands/', 'replay', '.md'),
    j('spec/doctrine/', 'replay', '-corpus.md'),
    j('tests/', 'replay'),
    'tests/fleet-reader/corpus-gaps.test.js',
  ]
  const present = gone.filter((rel) => fs.existsSync(path.join(ROOT, rel)))
  assert.deepStrictEqual(present, [],
    'a surviving file of the retired unit keeps the feature half-alive — its entrypoint, spec-paths key or test would dangle on the next edit: ' + present.join(', '))
})

test('AC-20261024-05-5: fleet-reader.js --json at this repo\'s root returns escapes and population and neither of the retired debt or gap keys', () => {
  const r = runNode('scripts/fleet-reader.js', ['--repos-root', ROOT, '--json'])
  assert.strictEqual(r.status, 0, 'fleet-reader --json must still derive and exit 0 after the replay queries are dropped: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok('escapes' in out && 'population' in out,
    'escapes and population are the surviving fleet answers; losing either breaks every report that reads them: ' + Object.keys(out).join(','))
  assert.ok(!(j('replay', 'Debt') in out),
    'a surviving top-level debt key means the fleet reader still interprets ledger rows nothing writes any more')
  assert.ok(!(j('corpus', 'Gaps') in (out.escapes || {})),
    'a surviving gap key under escapes means the fleet reader still reads the deleted corpus doctrine')
})

test('AC-20261024-05-6: the build driver and build stage doctrine still carry the prototype REPLAY step\'s mark, and the driver its state file', () => {
  const driver = fs.readFileSync(path.join(SPEC, 'scripts/spec-build-driver.js'), 'utf8')
  const stage = fs.readFileSync(path.join(SPEC, 'doctrine/stages/stage-build.md'), 'utf8')
  for (const [name, text] of [['spec-build-driver.js', driver], ['stage-build.md', stage]]) {
    assert.ok(text.includes('--mark replayed'),
      name + ' lost `--mark replayed` — retiring mutation replay must not take the unrelated prototype REPLAY step with it')
  }
  assert.ok(driver.includes('replay-state.json'),
    'spec-build-driver.js lost `replay-state.json` — the prototype REPLAY step\'s resumable state is part of a different feature that stays')
})

test('AC-20261024-05-7: doctor.md has no replay baseline-red honesty check and its numbered checks run contiguously from 1', () => {
  const doc = fs.readFileSync(path.join(SPEC, 'commands/doctor.md'), 'utf8')
  assert.ok(!/Replay baseline-red honesty/.test(doc),
    'doctor still audits a replay baseline that nothing produces — every host doctor run would report on a ghost')
  const start = doc.indexOf('## Checks')
  const end = doc.indexOf('\n## ', start + 1)
  assert.ok(start !== -1 && end !== -1, 'doctor.md must keep its "## Checks" section so the numbering can be read')
  const nums = [...doc.slice(start, end).matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]))
  assert.ok(nums.length > 0, 'the Checks section must carry numbered checks')
  assert.deepStrictEqual(nums, nums.map((_, i) => i + 1),
    'a gap in the check numbering after dropping a check leaves reports citing a check that does not exist: ' + nums.join(','))
})

test('AC-20261024-05-8: core.md § Feedback Loop names the escape ledger as the one ground-truth signal and carries no replay token', () => {
  const core = fs.readFileSync(path.join(SPEC, 'doctrine/core.md'), 'utf8')
  const at = core.indexOf('## Feedback Loop')
  assert.ok(at !== -1, 'core.md must keep its Feedback Loop section')
  const next = core.indexOf('\n## ', at + 1)
  const section = core.slice(at, next === -1 ? undefined : next).replace(/\s+/g, ' ')
  assert.ok(section.includes('The **escape ledger** is the pipeline\'s one ground-truth signal.'),
    'doctrine must state the escape ledger as the single ground-truth signal, or the pipeline still advertises a second signal that no longer exists')
  assert.ok(!/replay/i.test(section),
    'a replay token left in the Feedback Loop section teaches sessions to run a cadence that was retired')
})

test('AC-20261024-05-9: ac-drift.js over this repository exits 0 after the deletions, every orphaned criterion carrying its retirement tag', () => {
  // The spec text spells `--all-done`, a flag only test-expiry.js takes; ac-drift.js exits 2 on
  // it (usage), so the sound reading of the AC is the plain whole-repo ac-drift run.
  const r = runNode('scripts/ac-drift.js', ['--root', ROOT])
  assert.strictEqual(r.status, 0,
    'a criterion whose only citing test was deleted must be tagged retired in its done spec, or the standing drift gate stays red: ' + r.stdout + r.stderr)
})

test('AC-20261024-05-11: ADR-0036 is accepted and names ADR-0025 in Applies to, and ADR-0025 is amended by ADR-0036', () => {
  const adr36 = path.join(ROOT, 'docs/adr/0036-replay-retired.md')
  assert.ok(fs.existsSync(adr36), 'docs/adr/0036-replay-retired.md must exist — the retirement needs its durable record')
  const a36 = fs.readFileSync(adr36, 'utf8')
  assert.match(a36, /^- Status: accepted$/m, 'ADR-0036 must be accepted, or the record reads as a proposal')
  assert.match(a36, /^- Applies to:[^\n]*ADR-0025/m,
    'ADR-0036 must name ADR-0025 in Applies to, or the amendment link is one-way and unfindable from the new record')
  const a25 = fs.readFileSync(path.join(ROOT, 'docs/adr/0025-replay-runs-on-demand.md'), 'utf8')
  assert.match(a25, /^- Amended by:[^\n]*ADR-0036/m,
    'ADR-0025 must carry the backlink to ADR-0036, or a reader of the old record never learns it was superseded')
})
