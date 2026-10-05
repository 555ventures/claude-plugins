'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { runNode } = require('../helpers')
const {
  setupHost, patchConfig, writeStates, writePins, statusOf,
  designDir, worktreePath, DRIVER, BRIEF_REL, STEM,
} = require('./fixture')

// specs/20261001/01-the-freeze-signs-in-and-derives-its-tier.md D5-D8 — AC-20261001-01-9..16, -20, -21:
// `--mark tests-derived` derives the generated spec's tier from the host's § Risk Tiers paths.

const RULES_REL = '.claude/rules/spec-pipeline.md'
const BASE_SPANS = ['src/auth/**', 'migrations/{up,down}.sql']
const ROUTES = {
  '/women': { default: '/women', empty: '/women?proto=empty' },
  '/women/new': { default: '/women/new', error: '/women/new?proto=error' },
}

function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }) }
function branchExists(dir, name) { return git(dir, 'branch', '--list', name).trim() !== '' }

function rulesWith(spans) {
  return '# Rules\n\n## Risk Tiers\n\nTriggers:\n\n' + spans.map((s) => '- `' + s + '` — why.\n').join('') +
    '\n## Planning\n\n- `src/ui/a.js` is only named here, outside § Risk Tiers.\n'
}

function captureEnv(dir) {
  return Object.assign({}, process.env, { PROTO_CAPTURE_BIN: path.join(dir, 'capture-stub.js') })
}

function markTests(dir, extra) {
  return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', 'tests-derived', ...(extra || [])], { env: captureEnv(dir) })
}

function stateOf(dir) { return runNode(DRIVER, [BRIEF_REL, '--root', dir, '--state'], { env: captureEnv(dir) }).stdout }

// Drives a fixture host to just before `--mark tests-derived`: rules (undefined = the fixture's
// own file, null = removed, string = replaced) are committed on base, the prototype is approved
// and frozen, and the data/API + UI edits and the derived e2e file exist. Returns { dir, contract }.
function drive(opts) {
  opts = opts || {}
  const dir = setupHost()
  const rulesAbs = path.join(dir, RULES_REL)
  if (opts.rules === null) fs.rmSync(rulesAbs)
  else if (typeof opts.rules === 'string') fs.writeFileSync(rulesAbs, opts.rules)
  fs.writeFileSync(path.join(dir, 'src/db/old.js'), 'module.exports = { legacy: true }\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'seed base')

  writeStates(dir, ROUTES)
  const now = new Date().toISOString()
  const step = (n) => {
    const r = runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', n], { env: captureEnv(dir) })
    assert.strictEqual(r.status, 0, 'test setup requires --mark ' + n + ' to succeed: ' + r.stderr)
  }
  step('opened')
  writePins(dir, [
    { id: 'p1', round: 1, screen: '/women', state: 'default', anchor: null, note: 'n1', who: 'JJ', kind: 'behaviour', at: now },
    { id: 'p2', round: 1, screen: '/women', state: 'empty', anchor: null, note: 'n2', who: 'JJ', kind: 'look', at: now },
    { id: 'p3', round: 1, screen: '/women/new', state: 'error', anchor: null, note: 'n3', who: 'JJ', kind: 'behaviour', at: now },
  ])
  step('round-done')
  step('approved')
  patchConfig(dir, (cfg) => { cfg.prototype.export = ['src/db/**', 'drizzle/**'] })
  step('frozen')
  const contract = JSON.parse(fs.readFileSync(path.join(designDir(dir), 'contract.json'), 'utf8'))

  const wt = worktreePath(dir)
  fs.appendFileSync(path.join(wt, 'src/db/schema.js'), '// modified\n')
  fs.mkdirSync(path.join(wt, 'drizzle'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'drizzle/0001.sql'), '-- migration\n')
  fs.rmSync(path.join(wt, 'src/db/old.js'))
  fs.mkdirSync(path.join(wt, 'src/ui'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'src/ui/a.js'), 'export const A = 2\n')
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'edits on proto')

  const e2eAbs = path.join(dir, 'e2e/proto-28.smoke.spec.ts')
  fs.mkdirSync(path.dirname(e2eAbs), { recursive: true })
  fs.writeFileSync(e2eAbs,
    "test('" + contract.tests[0].ac + " pin " + contract.tests[0].pin + ": n1', () => {})\n" +
    "test('" + contract.tests[1].ac + " pin " + contract.tests[1].pin + ": n3', () => {})\n")
  return { dir, contract }
}

function specText(dir, contract) { return fs.readFileSync(path.join(dir, contract.spec), 'utf8') }
function specExists(dir, contract) { return fs.existsSync(path.join(dir, contract.spec)) }

const ONE_HIT = rulesWith([...BASE_SPANS, 'drizzle/*.sql'])
const THREE_HIT = rulesWith(['./src/{db,auth}/schema.js', 'src/ui/', 'DROP TABLE', 'e2e/'])

test('AC-20261001-01-9: with no hit and no --tier the generated spec is tier: standard with the no-path Rationale line and the 🚦 standard (0 risk-listed paths) line prints', () => {
  const { dir, contract } = drive()
  const r = markTests(dir)
  assert.strictEqual(r.status, 0, 'a zero-hit host must still freeze without any flag: ' + JSON.stringify(r))
  const text = specText(dir, contract)
  assert.match(text, /^tier: standard$/m, 'the zero-hit spec must carry tier: standard in its frontmatter: ' + text.slice(0, 300))
  assert.ok(text.includes("Tier: standard — no File Plan path is named in the host's pipeline rules § Risk Tiers."),
    'the Rationale must state why the tier is standard, so a cold reader sees the basis: ' + text)
  assert.ok(r.stdout.includes('🚦 generated spec tier: standard (0 risk-listed paths)'),
    'the mark must print the 🚦 tier line so the session can report the derived tier: ' + r.stdout)
})

test('AC-20261001-01-10: a File Plan path named in § Risk Tiers refuses the mark listing path and trigger, writes no spec, and leaves the export and worktree resumable at TESTS', () => {
  const { dir, contract } = drive({ rules: ONE_HIT })
  const r = markTests(dir)
  assert.strictEqual(r.status, 2, 'a risk-listed path with no --tier must stop for the user, never default silently: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('1 File Plan path named in .claude/rules/spec-pipeline.md § Risk Tiers:'),
    'the refusal header must count the hits and name the rules file and section: ' + r.stderr)
  assert.ok(r.stderr.includes('  drizzle/0001.sql ← `drizzle/*.sql`'),
    'the refusal must list each hit beside the span that named it: ' + r.stderr)
  assert.ok(r.stderr.includes('--tier critical'), 'the refusal must name the --tier remedy: ' + r.stderr)
  assert.ok(!specExists(dir, contract), 'no generated spec may be written before the user confirms the lock: ' + contract.spec)
  assert.ok(branchExists(dir, 'harden/' + STEM), 'the refusal sits after the export and must keep harden/<stem> so the re-run resumes: ' + git(dir, 'branch', '--list'))
  assert.ok(fs.existsSync(worktreePath(dir)), 'the prototype worktree must survive the refusal: ' + worktreePath(dir))
  assert.strictEqual(stateOf(dir), 'TESTS\n', '--state must still print TESTS after the refusal: ' + stateOf(dir))
})

test('AC-20261001-01-11: re-running the refused mark with --tier critical writes tier: critical with the confirmed-lock Rationale, prints the 🚦 line, reaches CLOSED, and the spec lints clean', () => {
  const { dir, contract } = drive({ rules: ONE_HIT })
  const first = markTests(dir)
  assert.strictEqual(first.status, 2, 'test setup requires the one-hit refusal first: ' + JSON.stringify(first))
  const r = markTests(dir, ['--tier', 'critical'])
  assert.strictEqual(r.status, 0, 'the confirmed re-run must complete the freeze: ' + JSON.stringify(r))
  const text = specText(dir, contract)
  assert.match(text, /^tier: critical$/m, 'the confirmed spec must carry tier: critical: ' + text.slice(0, 300))
  assert.match(text, /^status: hardened$/m, 'the spec must still be written hardened: ' + text.slice(0, 300))
  assert.ok(text.includes("Tier: critical because `drizzle/0001.sql` is named in the host's pipeline rules § Risk Tiers (`drizzle/*.sql`); the user confirmed the lock at freeze."),
    'the Rationale must open with the critical basis so a reviewer sees why: ' + text)
  assert.ok(r.stdout.includes('🚦 generated spec tier: critical (1 risk-listed path)'),
    'the mark must print the singular 🚦 line: ' + r.stdout)
  assert.strictEqual(stateOf(dir), 'CLOSED\n', 'the re-run must reach CLOSED: ' + stateOf(dir))
  const lint = runNode('scripts/ac-matrix.js', ['--spec', contract.spec, '--lint', '--resolve-root', dir], { cwd: dir })
  assert.strictEqual(lint.status, 0, 'the generated spec must still pass ac-matrix --lint with the new Rationale paragraph: ' + JSON.stringify(lint))
  const sweep = runNode('scripts/promise-sweep.js', ['--spec', contract.spec], { cwd: dir })
  assert.strictEqual(sweep.status, 0, 'the generated spec must still pass promise-sweep: ' + JSON.stringify(sweep))
})

test('AC-20261001-01-12: --tier standard on a one-hit fixture writes tier: standard with the ruled-not-a-risk Rationale', () => {
  const { dir, contract } = drive({ rules: ONE_HIT })
  const r = markTests(dir, ['--tier', 'standard'])
  assert.strictEqual(r.status, 0, 'the user ruling the hit not a risk change must let the freeze through: ' + JSON.stringify(r))
  const text = specText(dir, contract)
  assert.match(text, /^tier: standard$/m, 'the ruled spec must carry tier: standard: ' + text.slice(0, 300))
  assert.ok(text.includes("Tier: standard — `drizzle/0001.sql` is named in the host's pipeline rules § Risk Tiers (`drizzle/*.sql`); ruled not a risk change by the user at freeze."),
    'the Rationale must record that a risk-listed path was ruled not a risk change: ' + text)
})

test('AC-20261001-01-13: brace, ./ and directory spans match in File Plan row order, a whitespace span is dropped, and the refusal reports the span as written', () => {
  const { dir, contract } = drive({ rules: THREE_HIT })
  const r = markTests(dir)
  assert.strictEqual(r.status, 2, 'three hits and no --tier must refuse: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('3 File Plan paths named in'), 'the header must count three hits in the plural: ' + r.stderr)
  const a = r.stderr.indexOf('  src/db/schema.js ← `./src/{db,auth}/schema.js`')
  const b = r.stderr.indexOf('  src/ui/a.js ← `src/ui/`')
  const c = r.stderr.indexOf('  e2e/proto-28.smoke.spec.ts ← `e2e/`')
  assert.ok(a > -1 && b > a && c > b,
    'the three hits must appear in File Plan row order, each beside its original unexpanded span: ' + r.stderr)
  assert.ok(!r.stderr.includes('DROP TABLE'), 'a span containing whitespace must be dropped, never listed or matched: ' + r.stderr)
  assert.ok(!specExists(dir, contract), 'no spec may be written on the refusal: ' + contract.spec)
})

test('AC-20261001-01-14: a missing pipeline rules file and a rules file with no ## Risk Tiers line each refuse the mark naming the rules path and /spec:doctor', () => {
  for (const [label, rules] of [['absent rules file', null], ['no Risk Tiers section', '# Rules\n\n## Planning\n\nnothing\n']]) {
    const { dir, contract } = drive({ rules })
    const r = markTests(dir)
    assert.strictEqual(r.status, 2, label + ': a tier that cannot be derived must refuse, never default to standard: ' + JSON.stringify(r))
    assert.ok(r.stderr.includes("cannot derive the generated spec's tier"), label + ': the refusal must say the tier cannot be derived: ' + r.stderr)
    assert.ok(r.stderr.includes('.claude/rules/spec-pipeline.md'), label + ': the refusal must name the rules path: ' + r.stderr)
    assert.ok(r.stderr.includes('/spec:doctor'), label + ': the refusal must name the /spec:doctor remedy: ' + r.stderr)
    assert.ok(!specExists(dir, contract), label + ': no generated spec may be written: ' + contract.spec)
  }
})

test('AC-20261001-01-15: --tier high exits 2 naming the allowed values before the export creates harden/<stem>', () => {
  const { dir } = drive()
  const r = markTests(dir, ['--tier', 'high'])
  assert.strictEqual(r.status, 2, 'an unknown tier value must refuse: ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('--tier must be standard or critical'), 'the refusal must name the two allowed values: ' + r.stderr)
  assert.ok(!branchExists(dir, 'harden/' + STEM), 'the flag check runs before any other work, so no harden/<stem> may exist: ' + git(dir, 'branch', '--list'))
})

test('AC-20261001-01-16: --tier critical on a zero-hit fixture writes tier: critical with the declared-at-freeze Rationale', () => {
  const { dir, contract } = drive()
  const r = markTests(dir, ['--tier', 'critical'])
  assert.strictEqual(r.status, 0, 'upgrading to critical must always be accepted, for prose-only triggers: ' + JSON.stringify(r))
  const text = specText(dir, contract)
  assert.match(text, /^tier: critical$/m, 'the declared spec must carry tier: critical: ' + text.slice(0, 300))
  assert.ok(text.includes("Tier: critical — declared at freeze; no File Plan path is named in the host's pipeline rules § Risk Tiers."),
    'the Rationale must say the tier was declared, not derived from a path: ' + text)
})

test('AC-20261001-01-20: a re-run with --tier critical after the spec already exists leaves its tier line and basis untouched and prints no tier line', () => {
  const { dir, contract } = drive()
  const wt = worktreePath(dir)
  fs.writeFileSync(path.join(wt, 'src/ui-scratch.txt'), 'uncommitted\n')
  const first = markTests(dir)
  assert.strictEqual(first.status, 2, 'test setup requires the dirty-worktree refusal after the spec write: ' + JSON.stringify(first))
  assert.ok(first.stderr.includes('commit or discard on proto/'), 'the first stop must be the dirty-worktree refusal: ' + first.stderr)
  assert.ok(specExists(dir, contract), 'test setup requires the spec on disk before the re-run: ' + contract.spec)
  fs.rmSync(path.join(wt, 'src/ui-scratch.txt'))
  const r = markTests(dir, ['--tier', 'critical'])
  assert.strictEqual(r.status, 0, 'the resume must complete: ' + JSON.stringify(r))
  const text = specText(dir, contract)
  assert.match(text, /^tier: standard$/m, 'a spec already on disk is never rewritten, so --tier must not flip its tier: ' + text.slice(0, 300))
  assert.ok(text.includes("Tier: standard — no File Plan path is named in the host's pipeline rules § Risk Tiers."),
    'the first write must have recorded its basis, and the resume must leave it as written: ' + text)
  assert.ok(!r.stdout.includes('generated spec tier'), 'no 🚦 line may print when no spec was written on this run: ' + r.stdout)
})

test('AC-20261001-01-21: --tier critical on the three-hit fixture names the first hit, counts "and 2 more", and prints the plural 🚦 line', () => {
  const { dir, contract } = drive({ rules: THREE_HIT })
  const r = markTests(dir, ['--tier', 'critical'])
  assert.strictEqual(r.status, 0, 'a confirmed three-hit freeze must complete: ' + JSON.stringify(r))
  const text = specText(dir, contract)
  assert.ok(text.includes("Tier: critical because `src/db/schema.js` is named in the host's pipeline rules § Risk Tiers (`./src/{db,auth}/schema.js`) and 2 more; the user confirmed the lock at freeze."),
    'the basis must name the first hit and count the rest: ' + text)
  assert.ok(r.stdout.includes('🚦 generated spec tier: critical (3 risk-listed paths)'),
    'the 🚦 line must use the plural for three hits: ' + r.stdout)
})

test('a re-run after the risk refusal keeps each exported file\'s own File Plan action — a deleted file is DELETE and an added file is CREATE, never MODIFY', () => {
  const { dir, contract } = drive({ rules: ONE_HIT })
  const first = markTests(dir)
  assert.strictEqual(first.status, 2, 'test setup requires the one-hit refusal first, so the re-run skips the export: ' + JSON.stringify(first))
  const r = markTests(dir, ['--tier', 'critical'])
  assert.strictEqual(r.status, 0, 'the confirmed re-run must complete the freeze: ' + JSON.stringify(r))
  const text = specText(dir, contract)
  assert.ok(text.includes('| src/db/old.js | DELETE |'),
    'a file the export deleted must be a DELETE row on the resumed run, or the build wave check refuses the spec: ' + text)
  assert.ok(text.includes('| drizzle/0001.sql | CREATE |'),
    'a file the export added must stay a CREATE row on the resumed run: ' + text)
  assert.ok(text.includes('| src/db/schema.js | MODIFY |'),
    'a file the export changed must stay a MODIFY row: ' + text)
})
