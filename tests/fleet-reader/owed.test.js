'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { tmpdir, runNode } = require('../helpers')

// specs/20260903/01-owed-query-and-row-handoff.md: the ninth fleet-reader question, `owed`
// (D1-D7). Pins AC-20260903-01-1, -2, -3, -4, -5, -6, -7, -9. spec/scripts/fleet-reader.js
// carries no `owed` key and no `--owed` flag on the pre-image tree — every assertion below
// fails today (TDD red phase), not on a stub that merely exits non-zero.

const SCRIPT = 'scripts/fleet-reader.js'

function mkRepo(root, name, { config = true, git = 'dir', selfRepair = false, rows = [] } = {}) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  if (config) fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  if (git === 'dir') fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  if (selfRepair) {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude-plugin/marketplace.json'), '{}')
  }
  if (rows.length) {
    fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  }
  return dir
}

function writeFile(repoDir, rel, content) {
  const full = path.join(repoDir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

function runJson(root, extraArgs = []) {
  const r = runNode(SCRIPT, ['--repos-root', root, '--json', ...extraArgs])
  assert.strictEqual(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

function hashTree(dir) {
  const files = []
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else files.push(p)
    }
  })(dir)
  files.sort()
  const h = crypto.createHash('sha256')
  for (const f of files) {
    h.update(path.relative(dir, f))
    h.update(fs.readFileSync(f))
  }
  return h.digest('hex')
}

function escRow(overrides = {}) {
  return {
    stage: 'escape', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null,
    unclassedReason: null, via: 'manual', ...overrides,
  }
}

function amendRow(overrides = {}) {
  return { stage: 'escape-class', unclassedReason: null, via: 'manual', ...overrides }
}

function replayRow(overrides = {}) {
  return { stage: 'replay', files: null, legs: 'green', tokens: 0, ...overrides }
}

// AC-20260903-01-1
test('AC-20260903-01-1: owed.groups joins an escape-class amendment onto its escape row before grouping (class asc), and lists a missed replay row under its own class with recurrences read from escapes.byClass', () => {
  const root = tmpdir('owed-groups')
  mkRepo(root, 'host-a', {
    rows: [
      escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/x1.md', file: 'x1.js', class: 'c-one', preventedBy: 'review-check', reviewRunId: 'rv_aaaaaaaaaaa1' }),
      escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/x2.md', file: 'x2.js', class: null, preventedBy: 'runtime-leg', reviewRunId: 'rv_aaaaaaaaaaa2' }),
      amendRow({ ts: '2026-08-03T00:00:00Z', spec: 'specs/x2.md', file: 'x2.js', escapeTs: '2026-08-02T00:00:00Z', class: 'c-one' }),
      replayRow({ ts: '2026-08-04T00:00:00Z', spec: 'specs/x3.md', runId: 'rp_bbbbbbbbbbb1', reviewRunId: 'rv_aaaaaaaaaaa3', class: 'c-two', outcome: 'missed' }),
    ],
  })
  const out = runJson(root)
  assert.strictEqual(out.owed.groups.length, 2,
    'AC-1: exactly two class groups (c-one, c-two) must be derived — a wrong count means the amendment join or the class grouping is broken: ' + JSON.stringify(out.owed.groups))
  const [g0, g1] = out.owed.groups
  assert.strictEqual(g0.class, 'c-one',
    'AC-1: groups must sort class asc — c-one before c-two: ' + JSON.stringify(out.owed.groups.map(g => g.class)))
  assert.strictEqual(g0.recurrences, 2,
    'AC-1/D7: recurrences must be escapes.byClass["c-one"] (2, joined) — a wrong count breaks the printed policy pointer\'s own number: ' + JSON.stringify(g0))
  assert.strictEqual(g0.policy, 'core § Incident Policy (recurrences 2; guard bar 3)',
    'D7: the policy pointer must be the literal fixed sentence with the joined count substituted in, never a restatement: ' + g0.policy)
  assert.strictEqual(g0.items.length, 2,
    'AC-1: both the review-check row and its amended-to-c-one runtime-leg row must land in the c-one group: ' + JSON.stringify(g0.items))
  assert.strictEqual(g0.items[0].kind, 'escape', 'AC-1: an escape item must carry kind:"escape": ' + JSON.stringify(g0.items[0]))
  assert.strictEqual(g0.items[0].preventedBy, 'review-check',
    'AC-1: items sort repo asc then ts asc — the 2026-08-01 row precedes the 2026-08-02 one within the same repo: ' + JSON.stringify(g0.items[0]))
  assert.strictEqual(g0.items[0].reviewRunId, 'rv_aaaaaaaaaaa1',
    'AC-1: an escape item must carry its own reviewRunId verbatim: ' + JSON.stringify(g0.items[0]))
  assert.strictEqual(g0.items[0].key, 'escape:host-a:2026-08-01T00:00:00Z:x1.js',
    'D4: the key must be escape:<repo>:<ts>:<file> — a wrong key breaks the citation-scan join and the /spec:escape row-handoff alike: ' + g0.items[0].key)
  assert.strictEqual(g0.items[1].preventedBy, 'runtime-leg',
    'AC-1: the second (2026-08-02) row must carry its own preventedBy, unaffected by the amendment: ' + JSON.stringify(g0.items[1]))
  assert.strictEqual(g0.items[1].key, 'escape:host-a:2026-08-02T00:00:00Z:x2.js',
    'D4/Behavior: the key uses the escape row\'s OWN ts, never the amendment\'s — an amendment changes the group an item lands in without ever changing its key: ' + g0.items[1].key)
  assert.strictEqual(g1.class, 'c-two', 'AC-1: the second group must be c-two: ' + JSON.stringify(g1))
  assert.strictEqual(g1.recurrences, 0,
    'AC-1: c-two has zero escape rows — escapes.byClass has no entry for it, so recurrences must read 0, never crash on an undefined lookup: ' + JSON.stringify(g1))
  assert.strictEqual(g1.items.length, 1, 'AC-1: the c-two group must hold exactly the one missed replay item: ' + JSON.stringify(g1.items))
  const replayItem = g1.items[0]
  assert.strictEqual(replayItem.kind, 'replay', 'AC-1: a replay item must carry kind:"replay": ' + JSON.stringify(replayItem))
  assert.strictEqual(replayItem.key, 'rp_bbbbbbbbbbb1', 'D4: a replay item\'s key is the bare runId literal: ' + replayItem.key)
  assert.strictEqual(replayItem.outcome, 'missed', 'AC-1: the replay item must carry its own outcome verbatim: ' + JSON.stringify(replayItem))
})

// AC-20260903-01-2
test('AC-20260903-01-2: owed.ambiguous lists doctrine/none/out-of-enum preventedBy rows sorted repo asc ts asc, hostOwned counts exactly the enforcer and test rows, and neither an enforcer nor a test row appears anywhere else in owed', () => {
  const root = tmpdir('owed-ambiguous')
  mkRepo(root, 'host-a', {
    rows: [
      escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/d.md', file: 'doctrine-row.js', class: 'a-cls', preventedBy: 'doctrine' }),
      escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/n.md', file: 'none-row.js', class: 'a-cls', preventedBy: 'none' }),
      escRow({ ts: '2026-08-03T00:00:00Z', spec: 'specs/e.md', file: 'enforcer-row.js', class: 'a-cls', preventedBy: 'enforcer' }),
      escRow({ ts: '2026-08-04T00:00:00Z', spec: 'specs/t.md', file: 'test-row.js', class: 'a-cls', preventedBy: 'test' }),
      escRow({ ts: '2026-08-05T00:00:00Z', spec: 'specs/b.md', file: 'bogus-row.js', class: 'a-cls', preventedBy: 'bogus' }),
    ],
  })
  const out = runJson(root)
  assert.strictEqual(out.owed.ambiguous.length, 3,
    'D2: exactly the doctrine, none, and bogus (out-of-enum) rows must land in ambiguous: ' + JSON.stringify(out.owed.ambiguous.map(i => i.preventedBy)))
  assert.deepStrictEqual(out.owed.ambiguous.map(i => i.preventedBy), ['doctrine', 'none', 'bogus'],
    'D2: ambiguous sorts repo asc then ts asc — with one repo, ts order must place doctrine (08-01) before none (08-02) before bogus (08-05): ' + JSON.stringify(out.owed.ambiguous.map(i => i.preventedBy)))
  assert.strictEqual(out.owed.hostOwned, 2, 'D2: hostOwned must count exactly the enforcer and test rows: ' + out.owed.hostOwned)
  const dump = JSON.stringify(out.owed)
  assert.ok(!dump.includes('enforcer-row.js'),
    'D2: an enforcer-preventedBy row must never surface anywhere in owed (groups, ambiguous, or feedback) — hostOwned is a count, never a list: ' + dump)
  assert.ok(!dump.includes('test-row.js'),
    'D2: a test-preventedBy row must never surface anywhere in owed either: ' + dump)
})

// AC-20260903-01-3
test('AC-20260903-01-3: a self-repair repo\'s plugin-blaming escape rows never become owed items — selfRepairExcluded counts them while the class\'s recurrences (read from escapes.byClass) still includes them', () => {
  const root = tmpdir('owed-selfrepair')
  mkRepo(root, 'plugin-repo', {
    selfRepair: true,
    rows: [
      escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/s1.md', file: 's1.js', class: 'c-one', preventedBy: 'review-check' }),
      escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/s2.md', file: 's2.js', class: 'c-one', preventedBy: 'runtime-leg' }),
    ],
  })
  mkRepo(root, 'host-b', {
    rows: [
      escRow({ ts: '2026-08-03T00:00:00Z', spec: 'specs/h1.md', file: 'h1.js', class: 'c-one', preventedBy: 'review-check' }),
    ],
  })
  const out = runJson(root)
  assert.strictEqual(out.owed.selfRepairExcluded, 2,
    'D3: exactly the self-repair repo\'s two plugin-blaming rows must be counted as excluded: ' + out.owed.selfRepairExcluded)
  const group = out.owed.groups.find(g => g.class === 'c-one')
  assert.ok(group, 'D3: the host repo\'s own c-one row must still form a group: ' + JSON.stringify(out.owed.groups))
  assert.strictEqual(group.items.length, 1,
    'D3: only the host repo\'s row may appear as an item — the self-repair repo\'s two rows must be excluded from the listing: ' + JSON.stringify(group.items))
  assert.strictEqual(group.items[0].repo, 'host-b', 'D3: the one listed item must be the host repo\'s own row: ' + JSON.stringify(group.items[0]))
  assert.strictEqual(group.recurrences, 3,
    'D3: recurrences reads escapes.byClass, which counts ALL c-one rows fleet-wide including the excluded self-repair ones — reporting 1 here would silently understate the fleet-wide recurrence count core § Incident Policy\'s bar is measured against: ' + group.recurrences)
})

// AC-20260903-01-4
test('AC-20260903-01-4: the citation scan crosses each item key against a self-repair repo\'s specs/spec/tests trees (spec/ or tests/ hit or a status:done specs/ hit = fixed, any other specs/ hit = in-flight, no hit = uncited, docs/roadmap/ never counts), and citationScan/cited.status read null/unknown when no self-repair repo is in the population', () => {
  const root = tmpdir('owed-citation')
  const plugin = mkRepo(root, 'plugin-repo', { selfRepair: true })
  writeFile(plugin, 'spec/agents/x.md', 'sees rp_000000000001 here\n')
  writeFile(plugin, 'tests/t.test.js', '// pins rp_000000000002\n')
  writeFile(plugin, 'specs/20260901/01-a.md', '---\nstatus: done\n---\n# a\nrp_000000000003\n')
  writeFile(plugin, 'specs/20260901/02-b.md', '---\nstatus: hardened\n---\n# b\nrp_000000000004\n')
  writeFile(plugin, 'docs/roadmap/00-overview.md', 'mentions rp_000000000005 as a planned item\n')
  mkRepo(root, 'host-a', {
    rows: [1, 2, 3, 4, 5].map((n) => replayRow({
      ts: `2026-08-0${n}T00:00:00Z`, spec: 'specs/y.md', runId: `rp_00000000000${n}`,
      reviewRunId: `rv_yyyyyyyyyy0${n}`, class: 'c-y', outcome: 'missed',
    })),
  })
  const out = runJson(root)
  const byKey = Object.fromEntries(out.owed.groups.flatMap(g => g.items).map(i => [i.key, i]))
  assert.strictEqual(byKey.rp_000000000001.cited.status, 'fixed',
    'D5: a hit under spec/ marks fixed regardless of any spec status: ' + JSON.stringify(byKey.rp_000000000001))
  assert.ok(byKey.rp_000000000001.cited.by.includes('spec/agents/x.md'),
    'D5: cited.by must name the exact repo-relative path holding the citation: ' + JSON.stringify(byKey.rp_000000000001.cited))
  assert.strictEqual(byKey.rp_000000000002.cited.status, 'fixed',
    'D5: a hit under tests/ marks fixed — a direct (no-spec) fix lands as a test whose header cites the id: ' + JSON.stringify(byKey.rp_000000000002))
  assert.ok(byKey.rp_000000000002.cited.by.includes('tests/t.test.js'),
    'D5: cited.by must name the citing tests/ path: ' + JSON.stringify(byKey.rp_000000000002.cited))
  assert.strictEqual(byKey.rp_000000000003.cited.status, 'fixed',
    'D5: a hit under specs/ in a status:done spec marks fixed: ' + JSON.stringify(byKey.rp_000000000003))
  assert.ok(byKey.rp_000000000003.cited.by.includes('specs/20260901/01-a.md'),
    'D5: cited.by must name the citing done spec\'s path: ' + JSON.stringify(byKey.rp_000000000003.cited))
  assert.strictEqual(byKey.rp_000000000004.cited.status, 'in-flight',
    'D5: a hit under specs/ in a non-done (hardened) spec marks in-flight, never fixed: ' + JSON.stringify(byKey.rp_000000000004))
  assert.match(byKey.rp_000000000004.next, /specs\/20260901\/02-b\.md/,
    'D7: next must name the citing in-flight spec\'s path: ' + byKey.rp_000000000004.next)
  assert.match(byKey.rp_000000000004.next, /hardened/,
    'D7: next must name the citing spec\'s own status: ' + byKey.rp_000000000004.next)
  assert.strictEqual(byKey.rp_000000000005.cited.status, 'uncited',
    'D5: docs/roadmap/ is not a citation surface — a mention there is a plan, not a fix, and must never mark fixed or in-flight: ' + JSON.stringify(byKey.rp_000000000005))
  assert.match(byKey.rp_000000000005.next, /^reproduce in tests\/fixtures\/ before claiming/,
    'D7: an uncited item\'s next action must open with the exact reproduce-first sentence: ' + byKey.rp_000000000005.next)

  const root2 = tmpdir('owed-citation-nopluginrepo')
  mkRepo(root2, 'host-a', {
    rows: [replayRow({
      ts: '2026-08-01T00:00:00Z', spec: 'specs/y.md', runId: 'rp_000000000009',
      reviewRunId: 'rv_yyyyyyyyyy09', class: 'c-y', outcome: 'missed',
    })],
  })
  const out2 = runJson(root2)
  assert.strictEqual(out2.owed.citationScan, null,
    'D5: with no self-repair repo in the population the citation scan must be null, never an empty-but-present shape: ' + JSON.stringify(out2.owed.citationScan))
  const item2 = out2.owed.groups.flatMap(g => g.items)[0]
  assert.strictEqual(item2.cited.status, 'unknown',
    'D5: with no self-repair repo to scan, every item must read cited.status "unknown" — asserting uncited here would falsely claim the scan ran and found nothing: ' + JSON.stringify(item2.cited))
  assert.match(item2.next, /no plugin checkout under/,
    'D7: the next action for an unknown-status item must state the reason (no plugin checkout under reposRoot) rather than a generic message: ' + item2.next)
})

// AC-20260903-01-5
test('AC-20260903-01-5: two escape rows sharing repo and ts get distinct file-qualified keys, a missed replay item\'s key is its bare runId, and an unstamped feedback finding\'s key is its bare id', () => {
  const root = tmpdir('owed-keys')
  const repo = mkRepo(root, 'host-a', {
    rows: [
      escRow({ ts: '2026-08-23T18:21:47Z', spec: 'specs/m.md', file: 'a.js', class: 'c-one', preventedBy: 'review-check' }),
      escRow({ ts: '2026-08-23T18:21:47Z', spec: 'specs/m.md', file: 'b.js', class: 'c-one', preventedBy: 'runtime-leg' }),
      replayRow({ ts: '2026-08-24T00:00:00Z', spec: 'specs/n.md', runId: 'rp_0123456789ab', reviewRunId: 'rv_zzzzzzzzzzz1', class: 'c-two', outcome: 'missed' }),
    ],
  })
  writeFile(repo, 'docs/spec-feedback/20260815-brief.md',
    '---\nfindings:\n  - id: HOST-20260815-01\n    category: workflow-defect\n    stage: build\n    severity: soft\n---\n# brief\n')
  const out = runJson(root)
  const g = out.owed.groups.find(gr => gr.class === 'c-one')
  const keys = g.items.map(i => i.key).sort()
  assert.deepStrictEqual(keys, ['escape:host-a:2026-08-23T18:21:47Z:a.js', 'escape:host-a:2026-08-23T18:21:47Z:b.js'],
    'D4: two escape rows sharing repo+ts must get distinct keys via the file component — a shared-key collision would let one citation "fix" two distinct defects: ' + JSON.stringify(keys))
  const replayItem = out.owed.groups.find(gr => gr.class === 'c-two').items[0]
  assert.strictEqual(replayItem.key, 'rp_0123456789ab', 'D4: a replay item\'s key is the bare runId literal, no prefix or decoration: ' + replayItem.key)
  assert.strictEqual(out.owed.feedback.unstamped[0].key, 'HOST-20260815-01',
    'D4: an unstamped feedback finding\'s key is the bare finding id literal: ' + out.owed.feedback.unstamped[0].key)
})

// AC-20260903-01-6
test('AC-20260903-01-6: feedback.files lists parsed:true/false with findings/unstamped counts path-asc, feedback.unstamped carries the one unstamped finding\'s full fields, and a repo with no docs/spec-feedback directory contributes no files entry', () => {
  const root = tmpdir('owed-feedback')
  const repo = mkRepo(root, 'host-a', {})
  writeFile(repo, 'docs/spec-feedback/20260815-brief.md',
    '---\nfindings:\n' +
    '  - id: HOST-A-1\n    category: cat1\n    stage: build\n    severity: soft\n    intake: yes\n' +
    '  - id: HOST-A-2\n    category: cat2\n    stage: plan\n    severity: hard\n' +
    '---\n# brief\n')
  writeFile(repo, 'docs/spec-feedback/prune.md', '# nothing parseable here, no frontmatter block\n')
  mkRepo(root, 'host-b', {}) // no docs/spec-feedback directory at all
  const out = runJson(root)
  assert.deepStrictEqual(out.owed.feedback.files, [
    { path: 'docs/spec-feedback/20260815-brief.md', parsed: true, findings: 2, unstamped: 1 },
    { path: 'docs/spec-feedback/prune.md', parsed: false, findings: 0, unstamped: 0 },
  ], 'D6: files must list both files, path asc, with the exact parsed/findings/unstamped shape — a frontmatter-less file must read parsed:false findings:0 unstamped:0, never crash or be silently dropped: ' + JSON.stringify(out.owed.feedback.files))
  assert.strictEqual(out.owed.feedback.unstamped.length, 1,
    'D6: exactly the one finding with no intake: block is unstamped — a stamped finding must never surface here: ' + JSON.stringify(out.owed.feedback.unstamped))
  const f = out.owed.feedback.unstamped[0]
  assert.strictEqual(f.kind, 'feedback', 'D6: an unstamped feedback item must carry kind:"feedback": ' + JSON.stringify(f))
  assert.strictEqual(f.id, 'HOST-A-2', 'D6: id must be the finding\'s own id: ' + JSON.stringify(f))
  assert.strictEqual(f.category, 'cat2', 'D6: category must be the finding\'s own category: ' + JSON.stringify(f))
  assert.strictEqual(f.stage, 'plan', 'D6: stage must be the finding\'s own stage: ' + JSON.stringify(f))
  assert.strictEqual(f.severity, 'hard', 'D6: severity must be the finding\'s own severity: ' + JSON.stringify(f))
  assert.strictEqual(f.key, 'HOST-A-2', 'D4/D6: key must equal the finding\'s own id literal: ' + JSON.stringify(f))
  assert.ok(f.cited, 'D6: an unstamped finding must still carry a cited field like every other owed item: ' + JSON.stringify(f))
  const paths = out.owed.feedback.files.map(x => x.path)
  assert.ok(!paths.some(p => p.startsWith('host-b')),
    'D6: a repo with no docs/spec-feedback/ directory must contribute NO files entry — silently inventing an empty one would misrepresent a repo that was never scanned, and exit must still be 0: ' + JSON.stringify(out.owed.feedback.files))
})

// AC-20260903-01-7
test('AC-20260903-01-7: --owed prints population first, one recurrence-header line per class group, one bracketed-status line per non-fixed item, no line naming a fixed item, trailing hidden/excluded counts, and owed:none over an empty fleet; without --owed the render carries no Owed line, stays deterministic across two runs, and --json is unaffected by --owed', () => {
  const root = tmpdir('owed-render')
  mkRepo(root, 'host-a', {
    rows: [
      escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/x1.md', file: 'x1.js', class: 'c-one', preventedBy: 'review-check', reviewRunId: 'rv_aaaaaaaaaaa1' }),
      escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/x2.md', file: 'x2.js', class: 'c-one', preventedBy: 'runtime-leg', reviewRunId: 'rv_aaaaaaaaaaa2' }),
      replayRow({ ts: '2026-08-04T00:00:00Z', spec: 'specs/x3.md', runId: 'rp_bbbbbbbbbbb1', reviewRunId: 'rv_aaaaaaaaaaa3', class: 'c-two', outcome: 'missed' }),
    ],
  })
  const plugin = mkRepo(root, 'plugin-repo', { selfRepair: true })
  writeFile(plugin, 'tests/cited.test.js', '// cites escape:host-a:2026-08-01T00:00:00Z:x1.js\n')

  const owed = runNode(SCRIPT, ['--repos-root', root, '--owed'])
  assert.strictEqual(owed.status, 0, owed.stderr)
  assert.match(owed.stdout, /^Fleet population/,
    'D7: the population block must print first — an owed render that buries or drops population violates D4\'s existing population-first rule: ' + owed.stdout)
  assert.match(owed.stdout, /Owed — plugin-blaming rows across this machine's checkouts \(citation scan:/,
    'D7: the owed section must open with the exact fixed lead line: ' + owed.stdout)
  assert.match(owed.stdout, /^ {2}c-one: recurrences=2 → core § Incident Policy \(recurrences 2; guard bar 3\)$/m,
    'D7: the c-one group header must be the exact form — a restatement or a wrong count breaks the pointer readers copy verbatim: ' + owed.stdout)
  assert.match(owed.stdout, /escape:host-a:2026-08-02T00:00:00Z:x2\.js[\s\S]*?\[uncited → reproduce in tests\/fixtures\/ before claiming/,
    'D7: the one non-fixed c-one item must print its key with a bracketed uncited status on the same line: ' + owed.stdout)
  assert.ok(!owed.stdout.includes('escape:host-a:2026-08-01T00:00:00Z:x1.js'),
    'D7: the item cited by plugin-repo\'s tests/cited.test.js must be FIXED and therefore print no line at all — only the hidden count may reflect it: ' + owed.stdout)
  assert.match(owed.stdout, /^ {2}hidden: 1 rows already cited by landed code or a done spec$/m,
    'D7: exactly one item is fixed — the hidden count must read 1: ' + owed.stdout)
  assert.match(owed.stdout, /^ {2}excluded: selfRepair=0 hostOwned=0$/m,
    'D7: this fixture excludes nothing — both counts must read 0: ' + owed.stdout)

  const empty = runNode(SCRIPT, ['--repos-root', tmpdir('owed-render-empty'), '--owed'])
  assert.strictEqual(empty.status, 0, empty.stderr)
  assert.match(empty.stdout, /owed: none — every plugin-blaming row on this machine is cited/,
    'D7: an empty fleet (zero groups, zero ambiguous, zero unstamped feedback) must print the exact owed:none sentence: ' + empty.stdout)
  assert.match(empty.stdout, /^ {2}hidden: 0 rows already cited by landed code or a done spec$/m,
    'D7: the hidden:/excluded: lines must still print even on an empty fleet: ' + empty.stdout)
  assert.match(empty.stdout, /^ {2}excluded: selfRepair=0 hostOwned=0$/m,
    'D7: the excluded: line must still print on an empty fleet: ' + empty.stdout)

  const bare1 = runNode(SCRIPT, ['--repos-root', root])
  const bare2 = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(bare1.status, 0, bare1.stderr)
  assert.strictEqual(bare1.stdout, bare2.stdout,
    'D1/D7: the bare render (no --owed) must be deterministic across two runs of the same fleet — this stands in for "byte-identical to the pre-change render" since no pre-change binary is available to diff against in this fixture-only harness: ' + JSON.stringify({ bare1: bare1.stdout, bare2: bare2.stdout }))
  assert.ok(!bare1.stdout.includes('Owed —'),
    'D1: without --owed, the render must carry NO Owed — line at all: ' + bare1.stdout)

  const jsonNoOwed = runNode(SCRIPT, ['--repos-root', root, '--json'])
  const jsonWithOwed = runNode(SCRIPT, ['--repos-root', root, '--json', '--owed'])
  assert.strictEqual(jsonNoOwed.status, 0, jsonNoOwed.stderr)
  assert.strictEqual(jsonWithOwed.status, 0, jsonWithOwed.stderr)
  assert.strictEqual(jsonNoOwed.stdout, jsonWithOwed.stdout,
    'D1: --json output must be unaffected by --owed — the owed key is always present under --json regardless of the render selector: ' + JSON.stringify({ jsonNoOwed: jsonNoOwed.stdout, jsonWithOwed: jsonWithOwed.stdout }))
})

// AC-20260903-01-9
test('AC-20260903-01-9: running --owed and --owed --json over a synthetic fleet whose self-repair repo holds spec/test/feedback files leaves every file byte-identical', () => {
  const root = tmpdir('owed-readonly')
  mkRepo(root, 'host-a', {
    rows: [escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/x1.md', file: 'x1.js', class: 'c-one', preventedBy: 'review-check' })],
  })
  const plugin = mkRepo(root, 'plugin-repo', { selfRepair: true })
  writeFile(plugin, 'spec/agents/x.md', 'sees escape:host-a:2026-08-01T00:00:00Z:x1.js\n')
  writeFile(plugin, 'tests/t.test.js', '// nothing here\n')
  writeFile(plugin, 'docs/spec-feedback/brief.md', '---\nfindings:\n  - id: F-1\n    category: c\n    stage: s\n    severity: soft\n---\n# f\n')

  const before = hashTree(root)
  const r1 = runNode(SCRIPT, ['--repos-root', root, '--owed'])
  assert.strictEqual(r1.status, 0, r1.stderr)
  const r2 = runNode(SCRIPT, ['--repos-root', root, '--owed', '--json'])
  assert.strictEqual(r2.status, 0, r2.stderr)
  const after = hashTree(root)
  assert.strictEqual(after, before,
    'D9/AC-9: the citation scan reads specs/spec/tests recursively but must never write, cache, or otherwise mutate a host repo it only has authority to read — a changed hash means --owed corrupted a host checkout: ' + JSON.stringify({ before, after }))
})
