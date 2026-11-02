'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261029/08-the-policy-round-at-init.md: AC-20261029-08-3 (init.md policy rounds), AC-20261029-08-4
// (generate writes/validates policy, conditional ledger ignore rows), AC-20261029-08-5 (generate --dry-run
// and the Phase 5 confirm), AC-20261029-08-6 (Phase 1.5 substrate question), AC-20261029-08-8 (doctor check 24).

const CONFIG_REL = '.claude/spec.config.json'
const INIT_REL = 'spec/commands/init.md'
const PIN = '📌 policy defaults kept — edit .claude/spec.config.json policy to change (veto anytime)'

function baseProfile() {
  return {
    config: {
      gateCommand: 'node --test {testDirs}',
      testCommand: 'node --test',
      setupCommand: 'npm install',
      patternsScript: 'scripts/spec-patterns.sh',
      layerGroups: [['doctrine', 'scripts']],
      agentMap: { tests: 'test-owner', scripts: 'data-layer', default: 'data-layer' },
      pipelineRules: '.claude/rules/spec-pipeline.md',
      runtime: { inert: 'synthetic test host — no bootable process' }
    },
    rules: {
      paths: ['specs/**', '.claude/**'],
      sections: {
        'Risk Tiers': 'Risk tiers body.\n',
        'Planning': 'Planning body.\n',
        'Build': 'Build body.\n',
        'Worker Rules': 'Worker rules body.\n',
        'Test Rules': 'Test rules body.\n',
        'Review Checks': 'Review checks body.\n'
      }
    },
    conventionRules: [
      { file: 'queries.md', paths: ['src/**/queries.ts'], body: 'Queries convention body.\n' }
    ],
    agents: [
      {
        name: 'data-layer', kind: 'queries', description: 'Owns the data layer.',
        model: 'sonnet', persona: 'Data layer persona body.\n',
        expertise: ['src/**/queries.ts'], reference: ['src/schema.sql'],
        constraints: ['Never raw SQL outside queries.ts']
      },
      {
        name: 'test-owner', kind: 'tests', description: 'Owns the test suite.',
        model: 'sonnet', persona: 'Test owner persona body.\n',
        expertise: ['tests/**'], reference: ['tests/helpers.js'],
        constraints: ['Never writes implementation code']
      }
    ],
    selfVerifyExamples: "`node --test 'tests/x/*.test.js'`",
    skills: {
      specVerify: { description: 'Use to verify the app locally.', allowedTools: ['Bash(npm test:*)'], body: 'spec-verify body.\n' },
      run: { description: 'Use to run the app locally.', allowedTools: ['Bash(npm test:*)'], body: 'run body.\n' }
    },
    settings: { extraAllow: [], extraDeny: [] },
    patternSweeps: ['sweep "as any" -e \':\\s*any\' -g \'!*.test.ts\''],
    sourceRoot: 'src',
    manifestExtras: [],
    probeOutcomes: {
      testCommand: { failsLoud: true },
      atRisk: { applicable: true }
    }
  }
}

function setup(policy) {
  const dir = tmpdir('policy-round')
  gitRepo(dir)
  const profile = baseProfile()
  if (policy !== undefined) profile.config.policy = policy
  const profilePath = path.join(dir, 'profile.json')
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2))
  return { dir, profilePath }
}

const generate = (h, extra = []) => runNode('scripts/init-gen.js', ['generate', '--root', h.dir, '--profile', h.profilePath, ...extra])
const config = (h) => JSON.parse(fs.readFileSync(path.join(h.dir, CONFIG_REL), 'utf8'))
const gitignoreLines = (h) => fs.readFileSync(path.join(h.dir, '.gitignore'), 'utf8').split('\n').filter(Boolean)

// Every file under dir except .git, as { rel: content } — the byte-identical-tree oracle.
function snapshot(dir) {
  const out = {}
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8')
    }
  }
  walk(dir)
  return out
}

// A heading regex covers `## `, `### ` and bold-line forms the command may use.
function sectionAfter(src, startIdx, level) {
  const rest = src.slice(startIdx)
  const re = new RegExp('\\n#{1,' + level + '}\\s', 'g')
  re.lastIndex = 1
  const m = re.exec(rest)
  return m ? rest.slice(0, m.index) : rest
}

test('AC-20261029-08-3: init.md Phase 3 carries exactly two policy-round headings naming their keys, eight (Recommended) options, the 📌 line, and the dismissed-round exception', () => {
  const init = read(INIT_REL)
  const heads = [...init.matchAll(/^(#{2,6})\s+.*Policy round [12].*$/gm)]
  assert.strictEqual(heads.length, 2, 'init.md must carry exactly the headings Policy round 1 and Policy round 2, or the interview has no policy rounds: ' + heads.length)
  const [h1, h2] = heads
  assert.match(h1[0], /Policy round 1/, 'round 1 heading must come first')
  assert.match(h2[0], /Policy round 2/, 'round 2 heading must come second')
  const round1 = init.slice(h1.index, h2.index)
  const round2 = sectionAfter(init, h2.index, h2[1].length)
  for (const k of ['worktreePerSpec', 'directLaneToMain', 'mergeStrategy', 'testExpiry']) {
    assert.ok(round1.includes(k), 'round 1 must name ' + k + ', or its answer has no key to land in')
  }
  for (const k of ['ledgerCommitted', 'reviewService', 'models', 'riskTiers']) {
    assert.ok(round2.includes(k), 'round 2 must name ' + k + ', or its answer has no key to land in')
  }
  const recommended = (round1 + round2).split('(Recommended)').length - 1
  assert.strictEqual(recommended, 8, 'eight questions each carry one recommended-first option; found ' + recommended)
  assert.ok(init.includes(PIN), 'init.md must print the exact policy-defaults line for a dismissed round, or the veto is invisible')
})

test('AC-20261029-08-4: generate without a policy block writes POLICY_DEFAULTS, prints the 📌 line and adds no ledger ignore line', () => {
  const { POLICY_DEFAULTS } = require('../../spec/scripts/lib/host-config')
  assert.ok(POLICY_DEFAULTS, 'host-config.js must export POLICY_DEFAULTS')
  const h = setup()
  const r = generate(h)
  assert.strictEqual(r.status, 0, 'generate must succeed: ' + r.stderr)
  assert.deepStrictEqual(config(h).policy, JSON.parse(JSON.stringify(POLICY_DEFAULTS)), 'an absent block must be written as the defaults, or doctor has nothing to validate')
  assert.ok(r.stdout.includes('📌 policy defaults kept'), 'an absent block must print the veto line: ' + r.stdout)
  assert.ok(!gitignoreLines(h).some(l => l.startsWith('.claude/spec-runs')), 'the default (committed) ledger must not be ignored')
})

test('AC-20261029-08-4: generate with ledgerCommitted false writes it, prints no 📌 line and ends .gitignore with both ledger lines', () => {
  const h = setup({ ledgerCommitted: false })
  const r = generate(h)
  assert.strictEqual(r.status, 0, 'generate must succeed: ' + r.stderr)
  const cfg = config(h)
  assert.strictEqual(cfg.policy.ledgerCommitted, false, 'the answer must land in the config')
  assert.strictEqual(cfg.policy.mergeStrategy, 'derived', 'other keys must be defaulted')
  assert.ok(!r.stdout.includes('📌'), 'a present block must not print the defaults-kept line: ' + r.stdout)
  const lines = gitignoreLines(h)
  assert.deepStrictEqual(lines.slice(-2), ['.claude/spec-runs.jsonl', '.claude/spec-runs/'], 'the ledger must be gitignored or it is staged by git add -A: ' + lines.join('|'))
})

test('AC-20261029-08-4: generate with an invalid policy exits 2 naming the finding and writes no config', () => {
  const h = setup({ testExpiry: 'sometimes' })
  const r = generate(h)
  assert.strictEqual(r.status, 2, 'an invalid block must exit 2: ' + r.stdout + r.stderr)
  assert.ok((r.stdout + r.stderr).includes('policy: testExpiry: expected one of classify|off'), 'the finding must be named: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(path.join(h.dir, CONFIG_REL)), 'a refused generate must leave no config behind')
})

test('AC-20261029-08-5: generate --dry-run prints the confirm line with permission and file counts, one item line each, writes nothing and exits 0', () => {
  const count = (r) => {
    const m = r.stdout.match(/Confirm before writing: (\d+) permissions, (\d+) files/)
    assert.ok(m, 'dry-run must print the Confirm before writing anchor: ' + r.stdout + r.stderr)
    return { n: Number(m[1]), m: Number(m[2]) }
  }
  const items = (r) => r.stdout.split('\n').filter(l => l.startsWith('  + '))

  const a = setup()
  const before = snapshot(a.dir)
  const ra = generate(a, ['--dry-run'])
  assert.strictEqual(ra.status, 0, 'dry-run must exit 0: ' + ra.stderr)
  assert.deepStrictEqual(snapshot(a.dir), before, 'dry-run must write nothing, or the confirm precedes the writes it asks about')
  const ca = count(ra)
  const itemsA = items(ra)
  assert.strictEqual(itemsA.length, ca.n + ca.m, 'one + line per permission and file: ' + ra.stdout)
  const perms = itemsA.filter(l => /^  \+ (allow|deny) /.test(l))
  const files = itemsA.filter(l => !/^  \+ (allow|deny) /.test(l)).map(l => l.slice(4))
  assert.strictEqual(perms.length, ca.n, 'N must count the allow and deny lines: ' + ra.stdout)
  assert.ok(ca.n >= 2 && files.length >= 3, 'fixture sanity: a fresh host has permissions and files to write: ' + ra.stdout)

  // Host B: fully generated, then all but two targets removed and settings cut to one derived allow.
  const b = setup()
  const gb = generate(b)
  assert.strictEqual(gb.status, 0, 'setup generate must succeed: ' + gb.stderr)
  const keep = new Set([CONFIG_REL, '.claude/rules/spec-pipeline.md'])
  for (const f of files) if (!keep.has(f)) fs.rmSync(path.join(b.dir, f), { force: true })
  const firstAllow = perms.find(l => l.startsWith('  + allow ')).slice('  + allow '.length)
  fs.writeFileSync(path.join(b.dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: [firstAllow], deny: [] } }, null, 2) + '\n')
  const beforeB = snapshot(b.dir)
  const rb = generate(b, ['--dry-run'])
  assert.strictEqual(rb.status, 0, 'dry-run over a partly-written host must exit 0: ' + rb.stdout + rb.stderr)
  const cb = count(rb)
  assert.strictEqual(cb.n, ca.n - 1, 'a permission already present must not be counted: ' + JSON.stringify({ a: ca, b: cb }))
  assert.strictEqual(cb.m, ca.m - 2, 'a target already on disk must not be counted: ' + JSON.stringify({ a: ca, b: cb }))
  assert.deepStrictEqual(snapshot(b.dir), beforeB, 'dry-run must leave the host byte-identical')
})

test('AC-20261029-08-5: init.md Phase 5 runs --dry-run before its AskUserQuestion and carries the Confirm before writing anchor', () => {
  const init = read(INIT_REL)
  const at = init.indexOf('## Phase 5')
  const phase = init.slice(at, init.indexOf('## Phase 6'))
  assert.ok(at !== -1 && phase.includes('--dry-run'), 'Phase 5 must run generate --dry-run first, or permissions are written unconfirmed')
  assert.ok(phase.indexOf('--dry-run') < phase.indexOf('AskUserQuestion'), 'the dry run must precede the question, or the question has nothing to list')
  assert.ok(phase.includes('Confirm before writing:'), 'the question text must be the printed anchor line')
})

test('AC-20261029-08-6: init.md Phase 1.5 opens with the substrate AskUserQuestion before the Health endpoint bullet', () => {
  const init = read(INIT_REL)
  const at = init.indexOf('## Phase 1.5')
  const phase = init.slice(at, init.indexOf('## Phase 2'))
  const health = phase.indexOf('Health endpoint')
  assert.ok(at !== -1 && health !== -1, 'Phase 1.5 must exist with its Health endpoint bullet')
  const head = phase.slice(0, health)
  assert.ok(head.includes('AskUserQuestion'), 'the question must open the phase, or substrate is created before the owner answers')
  assert.ok(head.includes('Create them (Recommended)') && head.includes('Declare them inert instead'), 'both options must be stated before the first item')
})

test('AC-20261029-08-8: doctor.md carries exactly one check 24 titled Policy block naming policy-check and --json', () => {
  const doctor = read('spec/commands/doctor.md')
  assert.strictEqual((doctor.match(/^24\./gm) || []).length, 1, 'exactly one check may be numbered 24')
  const m = doctor.match(/^24\.\s+\*\*Policy block\*\*[\s\S]*?(?=\n\d+\.\s|\n## )/m)
  assert.ok(m, 'check 24 must be titled Policy block, or the drift is never reported')
  assert.ok(m[0].includes('policy-check') && m[0].includes('--json'), 'check 24 must run policy-check with --json: ' + m[0])
})
