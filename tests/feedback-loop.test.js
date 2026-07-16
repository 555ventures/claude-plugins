'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, runBash } = require('./helpers')

// The feedback loop (v5.4.0, shared § Feedback Loop): hosts emit signals as side effects,
// /spec:release flushes them into evidence-carrying briefs, the plugin repo's /intake
// triages them under the accepted-equals-failing-test contract, and the shipped intake
// ledger closes the return path via doctor's upstream-fixes check. Pinned here so a prose
// edit can't silently sever any leg of the loop. This file is also UPWELL-20260716-07's pin.

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')
const paths = (...args) => runBash('bin/spec-paths', args)

test('spec-paths: intake and feedback-template keys resolve to files that exist', () => {
  for (const key of ['intake', 'feedback-template']) {
    const res = paths(key)
    assert.strictEqual(res.status, 0)
    const p = res.stdout.trim()
    assert.ok(fs.existsSync(p), `${key} → ${p} does not exist`)
  }
})

test('brief template: version stamp, evidence bar, and intake stamp shape are present', () => {
  const tpl = read('templates/feedback-brief.md')
  assert.match(tpl, /plugin: spec@\{VERSION\}/, 'version stamp is what makes already-fixed vs regression decidable')
  assert.match(tpl, /evidence: \{.*REQUIRED/, 'no evidence, no finding')
  assert.match(tpl, /disposition: accepted \| rejected \| already-fixed \| duplicate/)
  assert.match(tpl, /Append-only/i)
})

test('INTAKE.md: states the failing-test contract; every row is complete and its pin resolves', () => {
  const ledger = read('INTAKE.md')
  assert.match(ledger, /failing test first/i)
  const rows = ledger.split('\n').filter(l => /^\| UPWELL-|^\| [A-Z]+-\d{8}-\d{2} \|/.test(l))
  assert.ok(rows.length >= 12, `expected the seeded UpWell rows, got ${rows.length}`)
  for (const row of rows) {
    const cols = row.split('|').map(s => s.trim()).filter(Boolean)
    assert.strictEqual(cols.length, 6, `row needs all 6 columns: ${row}`)
    const [id, , , , pinnedBy, fixedIn] = cols
    assert.match(id, /^[A-Z]+-\d{8}-\d{2}$/, `unstable finding id: ${id}`)
    assert.ok(/^\d+\.\d+\.\d+$/.test(fixedIn) || fixedIn === 'open',
      `Fixed in must be a version or open: ${fixedIn}`)
    // A pin naming a test file must actually exist — a dangling pin lies to every host.
    const m = pinnedBy.match(/`(tests\/[^`]+)`/)
    if (m) assert.ok(fs.existsSync(path.join(ROOT, m[1])), `pin missing on disk: ${m[1]}`)
    else assert.match(pinnedBy, /pre-contract/, `non-test pin must be marked pre-contract: ${pinnedBy}`)
  }
})

test('release.md: flush step writes versioned briefs, never empty ones, never edits old ones', () => {
  const release = read('commands/release.md')
  assert.match(release, /docs\/spec-feedback\/<YYYYMMDD>-brief\.md/)
  assert.match(release, /spec-paths feedback-template/)
  assert.match(release, /never write an empty/i)
  assert.match(release, /never edit a prior brief/i)
})

test('doctor.md: check 12 roll-up has a brief destination; check 15 closes the return path', () => {
  const doctor = read('commands/doctor.md')
  assert.match(doctor, /offer to write them as a feedback brief/i)
  assert.match(doctor, /Upstream fixes/)
  assert.match(doctor, /spec-paths intake/)
  assert.match(doctor, /generatedBy/, 'version arithmetic needs the host stamp')
  assert.match(doctor, /regression signal/i, 'same-version re-report must not read as a stale workaround')
})

test('shared.md: Feedback Loop section exists and is scoped into release doctrine', () => {
  assert.match(read('doctrine/shared.md'), /^## Feedback Loop$/m)
  const scoped = paths('shared-for', 'release')
  assert.strictEqual(scoped.status, 0)
  assert.match(scoped.stdout, /^## Feedback Loop$/m, 'release sessions must receive the flush doctrine')
})

test('scaffold ledger: the loop is registered with a promote/retire condition', () => {
  const ledger = read('doctrine/scaffold-ledger.md')
  assert.match(ledger, /\| Feedback loop \(release brief flush \+ shipped intake ledger \+ doctor upstream-fixes check\) \|/)
  assert.match(ledger, /Retire the flush if two quarters of briefs/)
})

test('/intake (repo-local, unshipped): contract and host-safety rules are stated', () => {
  const cmdPath = path.join(ROOT, '.claude/commands/intake.md')
  assert.ok(fs.existsSync(cmdPath), 'intake command must live in the repo .claude/, not ship in spec/commands/')
  assert.ok(!fs.existsSync(path.join(SPEC, 'commands/intake.md')), 'intake must NOT ship to hosts')
  const cmd = fs.readFileSync(cmdPath, 'utf8')
  assert.match(cmd, /spec\/INTAKE\.md/)
  assert.match(cmd, /Never accept without the failing test/i)
  assert.match(cmd, /Never edit host code/i)
  assert.match(cmd, /re-execut/i, 'verify-in-place is what makes the loop trustworthy')
})

test('fixture host: parses, satisfies the grounding shape, and carries each sweep signal', () => {
  const host = path.join(ROOT, 'tests/fixtures/minimal-host')
  const config = JSON.parse(fs.readFileSync(path.join(host, '.claude/spec.config.json'), 'utf8'))
  for (const key of ['generatedBy', 'contractHash', 'gateCommand', 'testCommand', 'setupCommand',
    'patternsScript', 'layerGroups', 'agentMap', 'pipelineRules', 'runtime']) {
    assert.ok(key in config, `required config key missing: ${key}`)
  }
  const rules = fs.readFileSync(path.join(host, config.pipelineRules), 'utf8')
  for (const section of ['Risk Tiers', 'Planning', 'Build', 'Worker Rules', 'Test Rules', 'Review Checks', 'Gotchas']) {
    assert.match(rules, new RegExp(`^## ${section}$`, 'm'))
  }
  assert.match(rules, /\[plugin\]/, 'sweep signal: a [plugin]-tagged gotcha')
  const ledgerLines = fs.readFileSync(path.join(host, '.claude/spec-runs.jsonl'), 'utf8')
    .trim().split('\n').map(l => JSON.parse(l))
  for (const row of ledgerLines) {
    assert.ok(['build', 'review', 'escape', 'release'].includes(row.stage), `bad stage: ${row.stage}`)
  }
  assert.ok(ledgerLines.some(r => r.stage === 'review' && r.tests && r.tests.skipped > 0),
    'sweep signal: a review row with non-zero skips')
  assert.ok(ledgerLines.some(r => r.stage === 'escape' && r.preventedBy),
    'sweep signal: an escape row with its prevention delta')
  const brief = fs.readFileSync(path.join(host, 'docs/spec-feedback/20260716-brief.md'), 'utf8')
  assert.match(brief, /^plugin: spec@5\.0\.0$/m, 'briefs must stamp the emitting version')
  assert.doesNotMatch(brief, /^\s+intake:/m, 'fixture brief must be unstamped so sweep tests see it as new')
})
