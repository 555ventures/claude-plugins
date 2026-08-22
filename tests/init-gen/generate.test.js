'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo, read } = require('../helpers')

// specs/20260822/02-init-generation-script.md: init.md's deterministic file-generation phase
// (config, rules, agents, skills, settings merge, patterns harness, manifest, gitignore/
// gitattributes mechanics) becomes one script, spec/scripts/init-gen.js, invoked as
// `generate --root <dir> --profile <path> [--refresh]`. These tests pin D1-D8/D13-D16 (the
// generate subcommand) by executing it against a synthetic host in tmpdir() — none of them
// can pass yet: init-gen.js does not exist on disk at all (TDD red, 2026-08-22). D4/A5 (the
// 2026-08-22 spike falsifying init.md's bare-directory `.claude/worktrees` ignore check) and
// the 2026-08-20 at-risk vacuous-pass escape (D8/D9's motivation) are the dated incidents
// behind AC-4 and AC-15/16 respectively.

// Builds a minimally complete profile per the spec's Contracts block — every required config
// field present, generatedBy/contractHash deliberately absent (the script stamps them), one
// plain agent and one tests-kind agent so AC-5's byte-identical-contract pin has two agents
// to compare.
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

function writeProfile(dir, profile) {
  const p = path.join(dir, 'profile.json')
  fs.writeFileSync(p, JSON.stringify(profile, null, 2))
  return p
}

function newHost(prefix) {
  const dir = tmpdir(prefix)
  gitRepo(dir) // seeds+commits a .gitignore containing ".claude/worktrees/\n" and a tracked a.txt
  return dir
}

const squash = (s) => s.replace(/\s+/g, ' ').trim()

function fencedBlock(src, heading) {
  const hIdx = src.indexOf(heading)
  if (hIdx === -1) throw new Error('heading not found in grounding-contract.md: ' + heading)
  const fenceStart = src.indexOf('```markdown', hIdx)
  const start = src.indexOf('\n', fenceStart) + 1
  const end = src.indexOf('```', start)
  return src.slice(start, end)
}

test('AC-20260822-02-1: generate against a synthetic host with a valid profile writes every grounding-layer deliverable and exits 0 with the config stamped', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0, 'a valid profile against a clean synthetic host must generate cleanly and exit 0: ' + r.stderr)

  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec.config.json'), 'utf8'))
  const version = runBash('bin/spec-paths', ['version']).stdout.trim()
  const hash = runBash('bin/spec-paths', ['contract-hash']).stdout.trim()
  assert.match(hash, /^[0-9a-f]{12}$/, 'setup: spec-paths contract-hash must itself produce a 12-hex digest for this assertion to be meaningful: ' + hash)
  assert.strictEqual(cfg.generatedBy, 'spec@' + version,
    'D3: a green manifest-check must stamp generatedBy as spec@<plugin version> — a wrong or missing stamp means a host can never tell which contract version generated it: ' + JSON.stringify(cfg))
  assert.strictEqual(cfg.contractHash, hash,
    'D3: contractHash must equal the spec-paths contract-hash output — a mismatch breaks the state-gate hook\'s drift detection for every future session on this host: ' + JSON.stringify(cfg))

  assert.ok(fs.existsSync(path.join(dir, '.claude/rules/spec-pipeline.md')),
    'the pipeline rules file must be written — a missing rules file leaves every future session in this host ungrounded')
  assert.ok(fs.existsSync(path.join(dir, '.claude/rules/conventions/queries.md')),
    'each profile.conventionRules entry must be written to its own file, or the routed convention never loads for a matching session')
  assert.ok(fs.existsSync(path.join(dir, '.claude/agents/data-layer.md')), 'each profile.agents entry must be written')
  assert.ok(fs.existsSync(path.join(dir, '.claude/agents/test-owner.md')), 'each profile.agents entry must be written')
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/spec-verify/SKILL.md')), 'the generated spec-verify skill must be written')
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/run/SKILL.md')), 'the generated run skill must be written')
  assert.ok(fs.existsSync(path.join(dir, '.claude/settings.json')), 'the settings permissions merge must be written')

  const patternsPath = path.join(dir, 'scripts/spec-patterns.sh')
  assert.ok(fs.existsSync(patternsPath), 'the patterns script must be written, or profile.patternSweeps has nowhere to land')
  assert.ok((fs.statSync(patternsPath).mode & 0o111) !== 0,
    'the patterns script must be executable — a non-executable script here breaks any session that invokes it directly: ' + patternsPath)
  const patternsRun = spawnSync('bash', [patternsPath], { cwd: dir, encoding: 'utf8' })
  assert.strictEqual(patternsRun.status, 0, 'the generated patterns script must run cleanly against its own host: ' + patternsRun.stderr)

  assert.ok(fs.existsSync(path.join(dir, '.claude/spec-manifest.json')), 'the deliverable manifest must be written')
})

test('AC-20260822-02-2: a manifest that fails manifest-check.sh exits 1 and leaves the written config without generatedBy or contractHash', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.manifestExtras = [{ claim: 'x', kind: 'file', target: 'missing.txt' }]
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 1,
    'D3: a manifest-check red must exit 1, never 0 — a green exit on a failing check would let a broken host believe it is activated: ' + r.stderr)

  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec.config.json'), 'utf8'))
  assert.ok(!('generatedBy' in cfg),
    'D3: the config must be left WITHOUT generatedBy when manifest-check is red — a stamped config here would claim mechanical verification that never happened: ' + JSON.stringify(cfg))
  assert.ok(!('contractHash' in cfg),
    'D3: the config must be left WITHOUT contractHash when manifest-check is red, for the same reason: ' + JSON.stringify(cfg))
})

test('AC-20260822-02-3: running generate twice — the second time with --refresh and an identical profile — leaves exactly one gitignore entry each for .claude/worktrees/ and specs/**/*.design/, and one gitattributes union line', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r1 = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r1.status, 0, 'first generate run must succeed cleanly, or the idempotency this test checks is untestable: ' + r1.stderr)
  const r2 = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath, '--refresh'])
  assert.strictEqual(r2.status, 0, 'a --refresh re-run of an identical profile must still succeed: ' + r2.stderr)

  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  const worktreeHits = gitignore.split('\n').filter((l) => l.trim() === '.claude/worktrees/').length
  const designHits = gitignore.split('\n').filter((l) => l.trim() === 'specs/**/*.design/').length
  assert.strictEqual(worktreeHits, 1,
    'two generate runs must never produce a duplicate .claude/worktrees/ ignore line — the retired bare-directory idempotency check re-appended forever on every fresh host (D4): ' + gitignore)
  assert.strictEqual(designHits, 1,
    'two generate runs must never produce a duplicate specs/**/*.design/ ignore line: ' + gitignore)

  const gitattributes = fs.readFileSync(path.join(dir, '.gitattributes'), 'utf8')
  const unionHits = gitattributes.split('\n').filter((l) => l.trim() === '.claude/spec-runs.jsonl merge=union').length
  assert.strictEqual(unionHits, 1,
    'D12: two generate runs must never produce a duplicate merge=union gitattributes line — this behavioral pin is what replaces the retired init.md prose regex: ' + gitattributes)
})

test('AC-20260822-02-4: when the .claude/worktrees ignore entry already exists but the directory does not exist on disk, generate appends nothing (child-path probe, not the broken bare-directory form)', () => {
  const dir = newHost('init-gen-generate') // gitRepo() already seeds+commits a .gitignore with .claude/worktrees/
  assert.ok(!fs.existsSync(path.join(dir, '.claude/worktrees')),
    'setup: the worktrees directory must not exist on disk for this to exercise the fresh-host case A5 falsified')
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0, 'generate must succeed against a host whose ignore entry pre-exists without the directory: ' + r.stderr)

  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  const hits = gitignore.split('\n').filter((l) => l.trim() === '.claude/worktrees/').length
  assert.strictEqual(hits, 1,
    'A5: `git check-ignore -q .claude/worktrees` exits 1 on a fresh host (entry exists, directory does not) even though the entry is present — a script using that bare-directory form instead of the child-path probe (`.claude/worktrees/x`) re-appends the entry forever: ' + gitignore)
})

test('AC-20260822-02-5: the Worker Contract section is strictEqual across every generated agent (with selfVerifyExamples substituted verbatim), and only the tests-kind agent carries the Tests-kind addendum bullets', () => {
  const dir = newHost('init-gen-generate')
  const selfVerify = "`node --test 'tests/x/*.test.js'`"
  const profile = baseProfile()
  profile.selfVerifyExamples = selfVerify
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0, 'setup: this generate call must succeed: ' + r.stderr)

  const contractSrc = read('spec/templates/grounding-contract.md')
  const contractBlock = fencedBlock(contractSrc, '## Worker Contract (byte-identical across all generated agents)')
  const addendumBlock = fencedBlock(contractSrc, '## Tests-kind addendum (appended after the contract bullets, identical wording)')
  const expectedContract = squash(
    contractBlock.replace('`bun lint`, `bun test:run <your files>`, `bunx tsc --noEmit`', selfVerify)
  )
  const addendumBullets = addendumBlock.split('\n').filter((l) => l.trim().startsWith('-')).map(squash)
  assert.ok(addendumBullets.length === 2, 'setup: the contract template must carry exactly two Tests-kind addendum bullets')

  const plainMd = fs.readFileSync(path.join(dir, '.claude/agents/data-layer.md'), 'utf8')
  const testsMd = fs.readFileSync(path.join(dir, '.claude/agents/test-owner.md'), 'utf8')
  const plainSection = squash(plainMd.slice(plainMd.indexOf('## Worker Contract (spec pipeline)')))
  const testsSection = squash(testsMd.slice(testsMd.indexOf('## Worker Contract (spec pipeline)')))

  assert.ok(plainSection.includes(squash(selfVerify)),
    'D6: profile.selfVerifyExamples must appear verbatim in the non-tests agent\'s contract section: ' + plainSection)
  assert.ok(testsSection.includes(squash(selfVerify)),
    'D6: profile.selfVerifyExamples must appear verbatim in the tests-kind agent\'s contract section too: ' + testsSection)

  assert.strictEqual(plainSection, expectedContract,
    'AC-5: the non-tests agent\'s Worker Contract section must be exactly the byte-identical contract text (host self-verify examples substituted, nothing else) — any drift here means agents no longer share one contract: ' + plainSection)
  assert.ok(testsSection.startsWith(expectedContract),
    'AC-5: the tests-kind agent must carry the full byte-identical contract before anything else, or the shared contract itself has drifted for tests-kind agents: ' + testsSection)
  for (const bullet of addendumBullets) {
    assert.ok(testsSection.includes(bullet),
      'AC-5: the tests-kind agent must carry the Tests-kind addendum bullet verbatim: ' + bullet)
    assert.ok(!plainSection.includes(bullet),
      'AC-5: a non-tests agent must NOT carry the Tests-kind addendum — it is scoped to tests-kind agents only: ' + bullet)
  }
})

test('AC-20260822-02-6: an existing settings.json allow entry and a deny entry covering a config-derived allow are both preserved, with a printed conflict line naming the deny', () => {
  const dir = newHost('init-gen-generate')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({
    permissions: { allow: ['Bash(custom-thing:*)'], deny: ['Bash(node --test:*)'] }
  }, null, 2))
  const profile = baseProfile() // config.testCommand "node --test" derives a would-be Bash(node --test:*) allow
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0,
    'D5: settings.json is the merge-preserving exception in both modes — a pre-existing conflicting deny must never turn into a refresh refusal: ' + r.stderr)

  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'))
  assert.ok(settings.permissions.allow.includes('Bash(custom-thing:*)'),
    'D5: the pre-existing user allow entry must be preserved verbatim: ' + JSON.stringify(settings))
  assert.ok(settings.permissions.deny.includes('Bash(node --test:*)'),
    'D5: the pre-existing deny entry must be preserved verbatim even though it covers a config-derived would-be allow — never remove or override it: ' + JSON.stringify(settings))
  assert.match(r.stdout + r.stderr, /Bash\(node --test:\*\)/,
    'D5 requires a printed conflict line naming the deny — a silent merge here means the operator never learns their deny is shadowing the config: ' + r.stdout + r.stderr)
})

test('AC-20260822-02-7: an existing target file with differing content and no --refresh exits 3, names the file, and leaves every target byte-identical with nothing else written', () => {
  const dir = newHost('init-gen-generate')
  fs.mkdirSync(path.join(dir, '.claude/rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/rules/spec-pipeline.md'), 'USER EDIT\n')
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 3, 'D5: an existing differing target with no --refresh must exit 3, never silently overwrite: ' + r.stderr)
  assert.match(r.stdout + r.stderr, /spec-pipeline\.md/,
    'D5 requires the refusal to name the differing file, or the operator cannot tell which hand-edit is at risk: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(path.join(dir, '.claude/rules/spec-pipeline.md'), 'utf8'), 'USER EDIT\n',
    'the existing target must remain byte-identical — any change here is exactly the silent clobber D5 exists to prevent')
  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
    'D5 says a refusal writes NOTHING — a config file appearing here means other targets were written before the refusal fired')
})

test('AC-20260822-02-14: a successful generate writes one manifest row per generated deliverable plus every manifestExtras row verbatim', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.manifestExtras = [{ claim: 'a host-authored substrate file', kind: 'file', target: 'server/seed.js' }]
  fs.mkdirSync(path.join(dir, 'server'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'server/seed.js'), '// seed\n')
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0, 'setup: this generate call must succeed for the manifest to be inspectable: ' + r.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec-manifest.json'), 'utf8'))

  assert.ok(manifest.checks.some((c) => c.claim === 'a host-authored substrate file' && c.kind === 'file' && c.target === 'server/seed.js'),
    'AC-14: every manifestExtras row must land in the manifest verbatim — a dropped row means manifest-check never verifies that deliverable: ' + JSON.stringify(manifest))
  assert.ok(manifest.checks.some((c) => c.kind === 'file' && /conventions[/\\]queries\.md/.test(c.target)),
    'AC-14: each convention rule must have its own manifest row: ' + JSON.stringify(manifest))
  assert.ok(manifest.checks.filter((c) => c.kind === 'file' && /agents[/\\]/.test(c.target)).length >= 2,
    'AC-14: each generated agent must have its own manifest row: ' + JSON.stringify(manifest))
  assert.ok(manifest.checks.some((c) => /spec-verify[/\\]SKILL\.md/.test(c.target)), 'AC-14: the spec-verify skill must have a manifest row: ' + JSON.stringify(manifest))
  assert.ok(manifest.checks.some((c) => /run[/\\]SKILL\.md/.test(c.target)), 'AC-14: the run skill must have a manifest row: ' + JSON.stringify(manifest))
  assert.ok(manifest.checks.some((c) => c.kind === 'exec' && /patterns/.test(c.target)),
    'AC-14: the patterns script must have an exec manifest row: ' + JSON.stringify(manifest))
  assert.ok(manifest.checks.some((c) => c.kind === 'exec' && /settings/i.test(c.claim)),
    'AC-14: the settings permissions merge must have its own exec manifest row: ' + JSON.stringify(manifest))
  assert.ok(manifest.checks.some((c) => c.kind === 'smoke'),
    'AC-14: a smoke row must be present per the script-owned emissions list: ' + JSON.stringify(manifest))
  assert.ok(manifest.checks.some((c) => c.kind === 'remote' || c.kind === 'inert'),
    'AC-14: a remote-or-inert row must be present per the script-owned emissions list: ' + JSON.stringify(manifest))
})

test('AC-20260822-02-15: probeOutcomes.testCommand.failsLoud true writes the negated exec manifest row that keeps the activation claim permanently re-verifiable', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.probeOutcomes.testCommand = { failsLoud: true }
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0, 'setup: this generate call must succeed: ' + r.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec-manifest.json'), 'utf8'))
  const row = manifest.checks.find((c) => c.kind === 'exec' && /^bash -c "! /.test(c.target) && c.target.includes('node --test'))
  assert.ok(row,
    'A4: a failsLoud:true outcome must write an exec row shaped `bash -c "! <testCommand> <nonexistent path>"` — the negation form exits 0 for a fails-loud runner, making doctor check 6b able to re-verify the activation forever instead of trusting a one-shot interview answer: ' + JSON.stringify(manifest))
})

test('AC-20260822-02-15: probeOutcomes.testCommand.failsLoud false with an acceptedReason writes an inert manifest row carrying that reason', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.probeOutcomes.testCommand = { failsLoud: false, acceptedReason: 'cargo test matches-nothing exits 0 on this host, accepted' }
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0, 'setup: this generate call must succeed: ' + r.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec-manifest.json'), 'utf8'))
  assert.ok(manifest.checks.some((c) => c.kind === 'inert' && c.target === 'cargo test matches-nothing exits 0 on this host, accepted'),
    'a declined testCommand activation must be recorded as an explicit inert row carrying the user\'s accepted-risk reason, never silently dropped — this is the vacuous-pass class the 2026-08-20 at-risk escape was built on: ' + JSON.stringify(manifest))
})

test('AC-20260822-02-16: probeOutcomes.atRisk.applicable false with a reason writes an inert manifest row naming at-risk detection and that reason', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.probeOutcomes.atRisk = { applicable: false, reason: 'this host imports by dotted module path only — the stem scan never fires here' }
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0, 'setup: this generate call must succeed: ' + r.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec-manifest.json'), 'utf8'))
  assert.ok(manifest.checks.some((c) => c.kind === 'inert' && /at.?risk/i.test(c.claim) &&
    c.target === 'this host imports by dotted module path only — the stem scan never fires here'),
    'D9: an inapplicable at-risk leg must be recorded as an explicit inert row naming at-risk detection and the interview\'s stated reason — a silent drop here reproduces "indistinguishable from clean," the exact gap D9 exists to close: ' + JSON.stringify(manifest))
})

test('AC-20260822-02-17: a profile missing a required config field exits 2, names the field, and writes nothing', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  delete profile.config.gateCommand
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 2, 'D13: a missing required profile field is a usage error and must exit 2, never partially generate: ' + r.stderr)
  assert.match(r.stderr, /gateCommand/,
    '§ Worker Rules: an error path must name the field it needed — a silent failure here leaves the operator guessing which of a dozen fields is missing: ' + r.stderr)
  assert.ok(r.stderr.trim().length > 'gateCommand'.length + 20,
    'D13 requires the remedy be printed alongside the field name, not just the bare field: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
    'a usage-error exit must write nothing — a partial config here means a later manifest-check would run against an incomplete host')
})
