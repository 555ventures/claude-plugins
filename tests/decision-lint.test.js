'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('./helpers')

// specs/20261016/01-lock-refuses-unjustified-restrictions.md D1–D5, D11: decision-lint.js refuses
// an untagged restriction or deferral row at plan lock; every fixture is built inline below.

const SCRIPT = 'scripts/decision-lint.js'
const RULES = '# Rules\n\n## Risk Tiers\n\n- Money/rates\n- Telegram send paths\n\n## Other\n\n- provenance lives here, outside Risk Tiers\n'
const RESTRICT_ROW = '| D2 | Tasks cannot be edited after creation | no update path exists |'
const DEFER_ROW = '| D3 | Reassignment is not offered now; a later spec adds it | cheap later |'

function specText(rows) {
  return '# Spec\n\n## Decisions (locked)\n\n| ID | Decision | One-line rationale |\n|----|----------|--------------------|\n' +
    rows.join('\n') + '\n\n## File Plan\n\nnone\n'
}

// A tmp git repo hosting config + rules + a queue holding one live item q7.
function host(rows, { specRel = 'specs/20261016/01-x.md', config = true, rules = RULES } = {}) {
  const dir = tmpdir('decision-lint')
  gitRepo(dir)
  if (config) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ pipelineRules: '.claude/rules/spec-pipeline.md' }))
  }
  fs.mkdirSync(path.join(dir, '.claude/rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/rules/spec-pipeline.md'), rules)
  fs.writeFileSync(path.join(dir, '.git/spec-queue.json'), JSON.stringify({
    version: 1, seq: 7, items: [{ id: 'q7', kind: 'prompt', payload: 'reassignment follow-up', added: new Date().toISOString() }],
  }))
  const spec = path.join(dir, specRel)
  fs.mkdirSync(path.dirname(spec), { recursive: true })
  fs.writeFileSync(spec, typeof rows === 'string' ? rows : specText(rows))
  return { dir, spec }
}

const lint = (h, extra = []) => runNode(SCRIPT, ['--spec', h.spec, '--root', h.dir, ...extra], { cwd: h.dir })

test('AC-20261016-01-1: an untagged restriction row exits 1 with an unjustified-restriction finding naming D2', () => {
  const r = lint(host([RESTRICT_ROW]))
  assert.strictEqual(r.status, 1, 'an untagged "cannot be edited" row must block lock — a refusal is otherwise the cheapest Decision to write: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /unjustified-restriction D2: /, 'the finding must name its class and row id so the planner knows which row to tag: ' + r.stdout)
})

test('AC-20261016-01-2: a restriction row tagged [guards:] with text found in Risk Tiers exits 0, case-insensitively', () => {
  for (const tag of ['Money/rates', 'money/rates']) {
    const r = lint(host([RESTRICT_ROW.replace('exists |', 'exists [guards: ' + tag + '] |')]))
    assert.strictEqual(r.status, 0, '[guards: ' + tag + '] names a Risk Tiers surface and must lock — else every justified restriction needs a waiver: ' + r.stdout + r.stderr)
    assert.match(r.stdout, /restrictions=1 deferrals=0 findings=0/, 'the counts line is the plan ledger row source: ' + r.stdout)
  }
})

test('AC-20261016-01-3: a [guards:] tag whose text is absent from Risk Tiers exits 1 with guard-not-in-risk-tiers naming the text', () => {
  const r = lint(host([RESTRICT_ROW.replace('exists |', 'exists [guards: provenance] |')]))
  assert.strictEqual(r.status, 1, 'a guard the host never listed as a strict surface must not justify a restriction — the tag would be decoration: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /guard-not-in-risk-tiers D2: .*provenance/, 'the finding must name the unmatched guard text so the planner can fix the tag: ' + r.stdout)
})

test('AC-20261016-01-4: an [asked:] tag with text justifies a restriction, an empty [asked: ] does not', () => {
  const ok = lint(host([RESTRICT_ROW.replace('exists |', 'exists [asked: JJ chose write-once on 2026-10-16] |')]))
  assert.strictEqual(ok.status, 0, 'an [asked:] attestation records the user\'s choice and must lock: ' + ok.stdout + ok.stderr)
  const empty = lint(host([RESTRICT_ROW.replace('exists |', 'exists [asked: ] |')]))
  assert.strictEqual(empty.status, 1, 'an empty [asked: ] is no sanction — otherwise the tag is a free bypass: ' + empty.stdout + empty.stderr)
  assert.match(empty.stdout, /unjustified-restriction/, 'the empty tag must surface as the restriction finding: ' + empty.stdout)
})

test('AC-20261016-01-5: a deferral row citing no queue id exits 1 with an untracked-deferral finding naming D3', () => {
  const r = lint(host([DEFER_ROW]))
  assert.strictEqual(r.status, 1, 'deferred work written into a cell no queue reads is lost — lock must refuse it: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /untracked-deferral D3: /, 'the finding must name its class and row id: ' + r.stdout)
})

test('AC-20261016-01-6: a deferral citing a live queue id exits 0 with deferrals=1, and a dead id exits 1 with dead-queue-id naming it', () => {
  const live = lint(host([DEFER_ROW.replace('cheap later |', 'cheap later (q7) |')]))
  assert.strictEqual(live.status, 0, 'a deferral citing a queue item spec-queue show resolves is tracked and must lock: ' + live.stdout + live.stderr)
  assert.match(live.stdout, /deferrals=1/, 'the counts line must count the matched deferral row: ' + live.stdout)
  const dead = lint(host([DEFER_ROW.replace('cheap later |', 'cheap later (q999) |')]))
  assert.strictEqual(dead.status, 1, 'a cited id the queue cannot resolve tracks nothing — lock must refuse it: ' + dead.stdout + dead.stderr)
  assert.match(dead.stdout, /dead-queue-id D3: q999 /, 'the finding must name the dead id so the planner can fix the citation: ' + dead.stdout)
})

test('AC-20261016-01-7: a spec dated before the cutoff exits 0 not-applicable, and a path with no date segment is linted in full', () => {
  const old = lint(host([RESTRICT_ROW], { specRel: 'specs/20261015/01-x.md' }))
  assert.strictEqual(old.status, 0, 'pre-cutoff specs would otherwise produce bulk findings that train waiving: ' + old.stdout + old.stderr)
  assert.match(old.stdout, /decision-lint: not-applicable spec=20261015 appliesFrom=20261016/, 'the not-applicable line is how a reader tells skipped from clean: ' + old.stdout)
  const loose = lint(host([RESTRICT_ROW], { specRel: 'drafts/x.md' }))
  assert.strictEqual(loose.status, 1, 'a path with no specs/<date>/ segment must run in full — an undated path is no escape from the lint: ' + loose.stdout + loose.stderr)
})

test('AC-20261016-01-8: a struck row is skipped, and a missing Decisions section, host config or Risk Tiers section exits 2', () => {
  const struck = lint(host([RESTRICT_ROW.replace('| D2 |', '| ~~D2~~ |')]))
  assert.strictEqual(struck.status, 0, 'a struck row is retired and must not block lock: ' + struck.stdout + struck.stderr)
  assert.match(struck.stdout, /restrictions=0/, 'a struck row must not be counted as a restriction: ' + struck.stdout)
  const noDecisions = lint(host('# Spec\n\n## Goal\n\nnothing\n'))
  assert.strictEqual(noDecisions.status, 2, 'a spec with no Decisions section is a usage error, not a clean pass: ' + noDecisions.stdout + noDecisions.stderr)
  const noConfig = lint(host([RESTRICT_ROW], { config: false }))
  assert.strictEqual(noConfig.status, 2, 'an unreadable host config must fail closed — never read as "no strict surfaces": ' + noConfig.stdout + noConfig.stderr)
  const noTiers = lint(host([RESTRICT_ROW], { rules: '# Rules\n\n## Planning\n\nx\n' }))
  assert.strictEqual(noTiers.status, 2, 'a rules file with no Risk Tiers section must fail closed: ' + noTiers.stdout + noTiers.stderr)
})

test('AC-20261016-01-9: --json prints one object with an unjustified-restriction and an untracked-deferral finding and counts 1/1', () => {
  const r = lint(host([RESTRICT_ROW, DEFER_ROW]), ['--json'])
  assert.strictEqual(r.status, 1, 'two untagged rows are two findings and exit 1: ' + r.stdout + r.stderr)
  let j
  assert.doesNotThrow(() => { j = JSON.parse(r.stdout) }, '--json stdout must be one parseable object or the ledger row cannot copy the counts: ' + r.stdout)
  assert.deepStrictEqual(j.findings.map(f => f.class).sort(), ['unjustified-restriction', 'untracked-deferral'],
    'the two findings must carry their classes for downstream readers: ' + r.stdout)
  assert.ok(j.findings.every(f => f.severity === 'hard' && typeof f.id === 'string' && typeof f.detail === 'string'),
    'every finding carries severity hard, id and detail per the Contracts shape: ' + r.stdout)
  assert.deepStrictEqual(j.counts, { restrictions: 1, deferrals: 1 }, 'counts are the removability numbers the plan ledger copies: ' + r.stdout)
})
