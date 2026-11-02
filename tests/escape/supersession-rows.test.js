'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261101/11-a-direction-flip-leaves-a-row.md D2, D5: supersession-rows.js derives the
// retired-spec row (--commit, appends through escape-row.js) and the deleted-shipped-file rows
// (--merge --json, derives only). Real git repos in a tmpdir; the ledger is the observable.

const SCRIPT = 'scripts/supersession-rows.js'
const SPEC_X = 'specs/20261004/01-x.md'

const specText = (status, extra = '') =>
  `---\nstatus: ${status}\n${extra}---\n\n# Spec\n`

function ledgerOf(root) {
  const f = path.join(root, '.claude', 'spec-runs.jsonl')
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
}

function rowsOf(root) {
  return (ledgerOf(root) || '').split('\n').filter(Boolean).map(l => JSON.parse(l))
}

// A repo with a ledger and a spec at `before` status; returns the sha of the commit that sets it
// to `after` (optionally with extra frontmatter).
function flipRepo(label, before, after, afterExtra = '', { ledger = true } = {}) {
  const root = fs.realpathSync(tmpdir(label))
  const g = gitRepo(root)
  if (ledger) {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), '')
  }
  fs.mkdirSync(path.join(root, path.dirname(SPEC_X)), { recursive: true })
  fs.writeFileSync(path.join(root, SPEC_X), specText(before))
  g('add', '-f', '-A'); g('commit', '-q', '-m', 'base')
  fs.writeFileSync(path.join(root, SPEC_X), specText(after, afterExtra))
  g('add', '-A'); g('commit', '-q', '-m', 'flip')
  return { root, g, sha: g('rev-parse', 'HEAD').trim() }
}

test('AC-20261101-11-1: --commit over a hardened-to-superseded flip appends one spec-superseded escape row carrying superseded_by, prints the supersession line and exits 0; a flip with no superseded_by records null', () => {
  const { root, sha } = flipRepo('sup-flip', 'hardened', 'superseded', 'superseded_by: D49\n')
  const r = runNode(SCRIPT, ['--commit', sha, '--root', root])
  assert.strictEqual(r.status, 0, 'a flip scan must exit 0 or /git:commit prints a warning on every retirement: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), `supersession spec=${SPEC_X} class=spec-superseded supersededBy=D49`,
    'the stdout line is the commit command\'s only report of the row — a different shape hides it from the owner: ' + r.stdout)
  const rows = rowsOf(root)
  assert.strictEqual(rows.length, 1, 'exactly one row per flipped spec, or the class count over-reports the flip: ' + ledgerOf(root))
  const row = rows[0]
  assert.strictEqual(row.stage, 'escape', 'only stage:"escape" rows are counted by fleet-reader byClass — any other stage leaves leak 1 at zero')
  assert.strictEqual(row.spec, SPEC_X, 'the row must name the retired spec')
  assert.deepStrictEqual(row.files, [SPEC_X], 'the spec file is the row\'s one file, which makes the writer\'s duplicate refusal the idempotency key')
  assert.strictEqual(row.class, 'spec-superseded', 'the class is what fleet-reader counts')
  assert.strictEqual(row.reviewRunId, null, 'reviewRunId must stay null — joining the original review would raise the false-CLEAN rate for a direction change')
  assert.strictEqual(row.sha, sha, 'sha must be the resolved 40-hex commit id: ' + sha)
  assert.strictEqual(row.via, 'commit', 'via must be commit for the retired-spec row')
  assert.strictEqual(row.supersededBy, 'D49', 'supersededBy must carry the spec\'s superseded_by value')

  const bare = flipRepo('sup-flip-bare', 'hardened', 'superseded')
  const r2 = runNode(SCRIPT, ['--commit', bare.sha, '--root', bare.root])
  assert.strictEqual(r2.status, 0, 'a flip without superseded_by must still be recorded: ' + r2.stderr)
  assert.strictEqual(r2.stdout.trim(), `supersession spec=${SPEC_X} class=spec-superseded supersededBy=null`,
    'a missing superseded_by prints the literal null: ' + r2.stdout)
  assert.strictEqual(rowsOf(bare.root)[0].supersededBy, null, 'a missing superseded_by is JSON null, not an empty string or an absent key')
})

test('AC-20261101-11-2: --commit appends nothing and prints nothing for a spec already superseded in the parent and for a commit touching no spec', () => {
  const same = flipRepo('sup-noflip', 'superseded', 'superseded', 'superseded_by: D1\n')
  const before = ledgerOf(same.root)
  const r = runNode(SCRIPT, ['--commit', same.sha, '--root', same.root])
  assert.strictEqual(r.status, 0, 'a non-flip commit must exit 0: ' + r.stderr)
  assert.strictEqual(r.stdout, '', 'a spec already superseded in the parent is not an event — output would print a phantom row on every later edit: ' + r.stdout)
  assert.strictEqual(ledgerOf(same.root), before, 'the ledger must be byte-identical — a second row for the same retirement double-counts the flip')

  const root = fs.realpathSync(tmpdir('sup-nonspec'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), '')
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src/a.js'), 'x\n')
  g('add', '-f', '-A'); g('commit', '-q', '-m', 'edit src')
  const r2 = runNode(SCRIPT, ['--commit', g('rev-parse', 'HEAD').trim(), '--root', root])
  assert.strictEqual(r2.status, 0, 'a commit touching only src must exit 0: ' + r2.stderr)
  assert.strictEqual(r2.stdout, '', 'a commit touching no spec prints nothing: ' + r2.stdout)
  assert.strictEqual(ledgerOf(root), '', 'a commit touching no spec leaves the ledger byte-identical')
})

test('AC-20261101-11-3: running --commit twice over the same sha appends nothing the second time and prints already recorded for the spec', () => {
  const { root, sha } = flipRepo('sup-twice', 'hardened', 'superseded', 'superseded_by: D49\n')
  assert.strictEqual(runNode(SCRIPT, ['--commit', sha, '--root', root]).status, 0, 'setup: the first scan must succeed')
  assert.strictEqual(rowsOf(root).length, 1, 'setup: one row after the first scan')
  const r = runNode(SCRIPT, ['--commit', sha, '--root', root])
  assert.strictEqual(r.status, 0, 'the writer\'s duplicate refusal must not fail the scan: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), `already recorded spec=${SPEC_X}`,
    'a re-scan must report the skip so the owner knows the row exists: ' + r.stdout)
  assert.strictEqual(rowsOf(root).length, 1, 'a re-scan must not double-count the retirement in escapes.byClass')
})

test('AC-20261101-11-4: --commit with no ledger exits 0 writing nothing, with a non-git root exits 2, and with an unresolvable sha exits 2 naming it', () => {
  const noLedger = flipRepo('sup-noledger', 'hardened', 'superseded', '', { ledger: false })
  const r = runNode(SCRIPT, ['--commit', noLedger.sha, '--root', noLedger.root])
  assert.strictEqual(r.status, 0, 'a host with no ledger sees no failure from the commit hook: ' + r.stderr)
  assert.strictEqual(r.stdout, '', 'a host with no ledger sees no output: ' + r.stdout)
  assert.ok(!fs.existsSync(path.join(noLedger.root, '.claude/spec-runs.jsonl')), 'the scan must never create a ledger the host did not opt into')

  const plain = fs.realpathSync(tmpdir('sup-notgit'))
  const r2 = runNode(SCRIPT, ['--commit', 'HEAD', '--root', plain])
  assert.strictEqual(r2.status, 2, 'a non-git --root is a usage error, not a silent success: ' + r2.stdout + r2.stderr)

  const r3 = runNode(SCRIPT, ['--commit', 'deadbeef', '--root', noLedger.root])
  assert.strictEqual(r3.status, 2, 'an unresolvable sha is exit 2: ' + r3.stdout + r3.stderr)
  assert.match(r3.stderr, /deadbeef/, 'the error must name the sha so the caller sees what failed to resolve: ' + r3.stderr)
})

// Repo with `main` holding the done sibling specs and source files, and branch spec/x deleting
// (or renaming) paths. `plan` is the sibling's File Plan body lines.
function mergeRepo(label, { siblingStatus = 'done', plan, files, remove = [], rename = [], byPlan = null }) {
  const root = fs.realpathSync(tmpdir(label))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), '')
  fs.mkdirSync(path.join(root, 'specs/d'), { recursive: true })
  const fp = (lines) => `\n## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n${lines.join('\n')}\n`
  fs.writeFileSync(path.join(root, 'specs/d/01-y.md'), specText(siblingStatus) + fp(plan))
  fs.writeFileSync(path.join(root, 'specs/d/02-x.md'), specText('implementing') + (byPlan ? fp(byPlan) : ''))
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true })
    fs.writeFileSync(path.join(root, f), 'x\n')
  }
  g('add', '-f', '-A'); g('commit', '-q', '-m', 'base')
  g('checkout', '-q', '-b', 'spec/x')
  for (const f of remove) g('rm', '-q', f)
  for (const [a, b] of rename) g('mv', a, b)
  g('commit', '-q', '-m', 'branch work')
  g('checkout', '-q', 'main')
  return root
}

function merge(root) {
  return runNode(SCRIPT, ['--merge', '--root', root, '--target', 'main', '--source', 'spec/x', '--by', 'specs/d/02-x.md', '--json'])
}

test('AC-20261101-11-5: --merge --json prints one shipped-file-deleted row per owning done spec with its sorted deleted paths, writes nothing, and prints [] when the owner is superseded', () => {
  const plan = ['| src/zones/rule.ts | CREATE | scripts | r |', '| src/zones/index.ts | CREATE | scripts | i |']
  const files = ['src/zones/rule.ts', 'src/zones/index.ts']
  const root = mergeRepo('sup-merge', { plan, files, remove: files })
  const r = merge(root)
  assert.strictEqual(r.status, 0, '--merge must exit 0: ' + r.stderr)
  const rows = JSON.parse(r.stdout)
  assert.strictEqual(rows.length, 1, 'two files created by one spec are one row (grouped per owner): ' + r.stdout)
  const { ts, ...rest } = rows[0]
  assert.strictEqual(typeof ts, 'string', 'the row carries a ts key like every ledger row')
  assert.deepStrictEqual(rest, {
    spec: 'specs/d/01-y.md', files: ['src/zones/index.ts', 'src/zones/rule.ts'], class: 'shipped-file-deleted',
    reviewRunId: null, sha: null, via: 'review', supersededBy: 'specs/d/02-x.md',
  }, 'the derived row must match the Contracts shape exactly (sha null until the merge lands): ' + r.stdout)
  assert.strictEqual(fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8'), '',
    '--merge derives only — a write here records the deletion before the merge lands')

  const dead = mergeRepo('sup-merge-dead', { siblingStatus: 'superseded', plan, files, remove: files })
  const r2 = merge(dead)
  assert.strictEqual(r2.status, 0, 'a superseded owner is not an error: ' + r2.stderr)
  assert.deepStrictEqual(JSON.parse(r2.stdout), [], 'files from a superseded spec were never shipped work — a row would count discarded non-work')
})

test('AC-20261101-11-6: --merge --json prints [] when the deleted file has only MODIFY rows, a tests-layer CREATE row, belongs to the --by spec, or was renamed', () => {
  const cases = [
    ['modify-only', { plan: ['| src/a.js | MODIFY | scripts | m |'], files: ['src/a.js'], remove: ['src/a.js'] }],
    ['tests-layer', { plan: ['| tests/zones/rule.test.js | CREATE | tests | t |'], files: ['tests/zones/rule.test.js'], remove: ['tests/zones/rule.test.js'] }],
    ['by-spec', { plan: ['| src/z.js | MODIFY | scripts | m |'], files: ['src/z.js'], remove: ['src/z.js'],
      byPlan: ['| src/z.js | CREATE | scripts | c |'] }],
    ['renamed', { plan: ['| src/a.js | CREATE | scripts | c |'], files: ['src/a.js'], rename: [['src/a.js', 'src/b.js']] }],
  ]
  for (const [name, spec] of cases) {
    const root = mergeRepo('sup-merge-neg-' + name, spec)
    const r = merge(root)
    assert.strictEqual(r.status, 0, name + ': must exit 0: ' + r.stderr)
    assert.deepStrictEqual(JSON.parse(r.stdout), [],
      name + ': must derive no row — a row here counts expired tests, a rename or the merging spec\'s own work as discarded product work: ' + r.stdout)
  }
})
