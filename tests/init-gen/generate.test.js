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
// can pass yet: init-gen.js does not exist on disk at all (TDD red). D4/A5 (the
// spike falsifying init.md's bare-directory `.claude/worktrees` ignore check) and
// the at-risk vacuous-pass escape (D8/D9's motivation) are the incidents
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

// AC-20260824-05-5 (specs/20260824/05-design-doctrine-cut.md D6/D10): the .design/ sidecar is
// retired everywhere it is still written or checked, including here — init-gen.js must stop
// emitting the specs/**/*.design/ gitignore line entirely (zero, not one) while continuing to
// write exactly one .claude/worktrees/ line, updated in place on AC-20260822-02-3's test per
// that spec's Assumption/D10 instruction, never weakened.
test('AC-20260822-02-3/AC-20260824-05-5: running generate twice — the second time with --refresh and an identical profile — leaves exactly one gitignore entry for .claude/worktrees/, zero for specs/**/*.design/ (D6 retires the sidecar entirely), and one gitattributes union line', () => {
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
  assert.strictEqual(designHits, 0,
    'D6/AC-20260824-05-5: init-gen.js must no longer emit the specs/**/*.design/ gitignore line ' +
    'at all, not even once — a sidecar nothing writes must not be provisioned by init: ' + gitignore)

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

// Direct fix: spec-review-driver.js parks its re-entry sidecar at
// specs/<date>/<spec>.review/ for the run's whole lifetime, but init provisioned no ignore entry
// for it — a host gate sweeping the whole tree (prettier --check .) redded on the pipeline's own
// scratch and hard-stopped the review before a reviewer dispatched. The pin is executed, not
// string-matched: git itself must report a sidecar child path as ignored after generate.
test('2026-08-31 review-sidecar ignore: generate provisions specs/**/*.review/ so git check-ignore covers the sidecar, idempotently across a --refresh re-run', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r1 = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r1.status, 0, 'first generate run must succeed cleanly: ' + r1.stderr)

  const probe = spawnSync('git', ['check-ignore', '-q', 'specs/20260101/01-x.review/review-state.json'], { cwd: dir })
  assert.strictEqual(probe.status, 0,
    'git must report a review-sidecar child path as ignored after generate — unignored, a whole-tree ' +
    'host gate reds on the review run\'s own scratch and hard-stops at GATE_RED before reviewer ' +
    'dispatch (hearwell 2026-08-31): ' + fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'))

  const r2 = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath, '--refresh'])
  assert.strictEqual(r2.status, 0, 'a --refresh re-run of an identical profile must still succeed: ' + r2.stderr)
  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  const hits = gitignore.split('\n').filter((l) => l.trim() === 'specs/**/*.review/').length
  assert.strictEqual(hits, 1,
    'two generate runs must leave exactly one specs/**/*.review/ line — the child-path probe (D4) ' +
    'is what keeps this idempotent on hosts where no sidecar exists on disk yet: ' + gitignore)
})

// AC-20260901-01-13: specs/20260901/01-build-driver.md D5 — spec-build-driver.js parks its own
// re-entry sidecar at specs/<date>/<spec>.build/ for the run's whole lifetime, the same shape as
// the review driver's specs/**/*.review/ sidecar above, and for the same reason: an unignored
// sidecar lets a whole-tree host gate red on the build run's own scratch. IGNORE_ENTRIES gains a
// specs/**/*.build/ entry with a child-path sample, and generate must stay idempotent across a
// --refresh re-run exactly like the review-sidecar entry above.
test('AC-20260901-01-13: generate provisions specs/**/*.build/ so git check-ignore covers the build-driver sidecar, idempotently across a --refresh re-run', () => {
  const dir = newHost('init-gen-generate-build')
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r1 = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r1.status, 0, 'first generate run must succeed cleanly: ' + r1.stderr)

  const probe = spawnSync('git', ['check-ignore', '-q', 'specs/20260101/01-x.build/build-state.json'], { cwd: dir })
  assert.strictEqual(probe.status, 0,
    'git must report a build-driver-sidecar child path as ignored after generate — unignored, a whole-tree ' +
    'host gate reds on the build run\'s own scratch and hard-stops the build before a repair or commit step ' +
    'is ever reached (AC-20260901-01-13, the same hearwell 2026-08-31 mechanism, closed here for build): ' +
    fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'))

  const r2 = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath, '--refresh'])
  assert.strictEqual(r2.status, 0, 'a --refresh re-run of an identical profile must still succeed: ' + r2.stderr)
  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  const hits = gitignore.split('\n').filter((l) => l.trim() === 'specs/**/*.build/').length
  assert.strictEqual(hits, 1,
    'two generate runs must leave exactly one specs/**/*.build/ line — the same child-path-probe idempotency ' +
    '(D4) the review-sidecar entry relies on must apply here too, on hosts where no build sidecar exists on ' +
    'disk yet: ' + gitignore)
})

// AC-20260901-02-7: specs/20260901/02-run-provenance.md D6 — the never-blocking spec-session-stamp.sh
// hook writes a per-session scratch file at <root>/.claude/spec-session.json on every /spec: prompt.
// A per-session file must never ride a close commit (the same sidecar-class reasoning
// behind the .review/.build sidecar entries above) so init-gen.js's IGNORE_ENTRIES gains this exact
// bare-file path. Unlike the .review/.build sidecar entries this is a single file, not a directory
// glob, so the probe is the literal path itself rather than a child-path sample.
test('AC-20260901-02-7: generate leaves git check-ignore .claude/spec-session.json exiting 0, with the line appearing exactly once across two runs', () => {
  const dir = newHost('init-gen-generate-session-stamp')
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r1 = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r1.status, 0, 'first generate run must succeed cleanly: ' + r1.stderr)

  const probe = spawnSync('git', ['check-ignore', '-q', '.claude/spec-session.json'], { cwd: dir })
  assert.strictEqual(probe.status, 0,
    'git must report .claude/spec-session.json as ignored after generate — unignored, the per-session ' +
    'stamp a concurrent session writes on every /spec: prompt could ride a close commit, the exact ' +
    '7.45.0 sidecar-class defect D6 exists to prevent: ' + fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'))

  const r2 = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath, '--refresh'])
  assert.strictEqual(r2.status, 0, 'a --refresh re-run of an identical profile must still succeed: ' + r2.stderr)
  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  const hits = gitignore.split('\n').filter((l) => l.trim() === '.claude/spec-session.json').length
  assert.strictEqual(hits, 1,
    'two generate runs must leave exactly one .claude/spec-session.json line — a re-appended duplicate on ' +
    'every --refresh is the same idempotency defect the .claude/worktrees/ and sidecar entries above were ' +
    'fixed against: ' + gitignore)
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

test('AC-20260822-02-6/AC-20260823-02-8: an existing settings.json allow entry and a deny entry covering a config-derived allow are both preserved, with a printed conflict line naming the deny', () => {
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

// Review finding on specs/20260822/02-init-generation-script.md: generate
// silently destroyed a pre-existing host .claude/settings.json when that file failed to parse
// as JSON — every allow entry, every deny entry, and every unrelated top-level key were
// replaced by a freshly-derived permissions block, exit 0, no warning. Locked Decision D5
// requires settings.json to be "always merge-preserving (every existing entry kept ...), both
// modes". The approved fix parses the existing settings file in a pre-flight step before any
// file is written; an unparseable file makes generate exit 2 naming the settings path and a
// remedy, with nothing at all written — not the settings file, not the config, rules, agents,
// or any other generated target — and --refresh does not bypass this. These two tests pin
// AC-20260822-02-18.

test('AC-20260822-02-18: generate exits 2 naming .claude/settings.json and writes nothing when the existing settings file is unparseable', () => {
  const dir = newHost('init-gen-generate')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const badSettings = '{"permissions":{"allow":["Bash(custom:*)"],"deny":["Read(.secret*)"]},"someOtherKey":"must-survive" INVALID}'
  fs.writeFileSync(path.join(dir, '.claude/settings.json'), badSettings)
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 2,
    'AC-18/D5: an unparseable pre-existing settings.json must be caught by a pre-flight parse and exit 2, never fall through to the silent-clobber path that replaced every allow/deny entry with a freshly-derived block: ' + r.stderr)
  assert.match(r.stderr, /\.claude[/\\]settings\.json/,
    'AC-18: the refusal must name .claude/settings.json — a silent or unnamed refusal leaves the operator unable to tell which file has the hand-edit typo: ' + r.stderr)
  assert.ok(r.stderr.trim().length > '.claude/settings.json'.length + 20,
    'AC-18/D13: the refusal must print a remedy alongside the path, not just the bare filename, or the operator is left guessing how to recover: ' + r.stderr)

  const onDisk = fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')
  assert.strictEqual(onDisk, badSettings,
    'AC-18/D5: the existing settings file must be left byte-identical on a parse failure — any change here means the pre-existing allow/deny rules or unrelated keys were touched before the refusal fired: ' + onDisk)
  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
    'AC-18: nothing at all may be written on this refusal — a config file appearing here means the settings pre-flight check ran too late, after other targets were already written')
  assert.ok(!fs.existsSync(path.join(dir, '.claude/rules/spec-pipeline.md')),
    'AC-18: nothing at all may be written on this refusal — a rules file appearing here means the settings pre-flight check did not gate every other generated deliverable')
})

test('AC-20260822-02-18: --refresh does not bypass the unparseable-settings refusal', () => {
  const dir = newHost('init-gen-generate')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const badSettings = '{"permissions":{"allow":["Bash(custom:*)"],"deny":["Read(.secret*)"]},"someOtherKey":"must-survive" INVALID}'
  fs.writeFileSync(path.join(dir, '.claude/settings.json'), badSettings)
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath, '--refresh'])
  assert.strictEqual(r.status, 2,
    'AC-18/D5: "always merge-preserving ... both modes" means --refresh must not bypass the unparseable-settings refusal — a 0 here means a refresh run on a broken host silently destroys the existing permissions block: ' + r.stderr)

  const onDisk = fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')
  assert.strictEqual(onDisk, badSettings,
    'AC-18/D5: the existing settings file must stay byte-identical under --refresh too — any change here reproduces the exact silent clobber this finding was filed against: ' + onDisk)
})

// Review of specs/20260822/02-init-generation-script.md, round 2: the round-1
// settings pre-flight only caught JSON.parse throwing, never checked the parsed value's shape.
// A second blind reviewer broke generate again with two shapes JSON.parse accepts: a top-level
// `null` settings file passed pre-flight, then threw inside the merge AFTER every other target
// was already written (exit 1 — colliding with the documented manifest-check-red exit code); a
// top-level array passed pre-flight, exited 0 with no warning, and spread the user's allow/deny
// content into a numeric-indexed object. The round-2 fix splits the pre-flight into three arms
// (unreadable file / invalid JSON / valid-JSON-but-not-an-object), each exiting 2 with a remedy
// matched to its cause and nothing written; computes the settings merge pre-flight so no
// settings-derived throw can ever follow a write; makes validateProfile require
// conventionRules and check that iterated profile fields are arrays; and adds a top-level error
// boundary so any remaining uncaught throw exits 4 with a stack and a re-run remedy instead of
// Node's implicit 1. Ties to locked Decision D5 and the new exit-4 boundary.

test('AC-20260822-02-18: generate exits 2, names .claude/settings.json, and writes nothing when the existing settings file parses as valid JSON but the top level is not an object — across all three non-object shapes (null, array, bare string)', () => {
  const shapes = [
    { label: 'null', content: 'null' },
    { label: 'array', content: JSON.stringify(['perm-marker-A', 'perm-marker-B']) },
    { label: 'string', content: JSON.stringify('just-a-string') }
  ]
  for (const shape of shapes) {
    const dir = newHost('init-gen-generate')
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    const settingsPath = path.join(dir, '.claude/settings.json')
    fs.writeFileSync(settingsPath, shape.content)
    const profile = baseProfile()
    const profilePath = writeProfile(dir, profile)

    const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
    assert.strictEqual(r.status, 2,
      `AC-18/D5 (${shape.label} shape): a settings file that parses but is not a top-level object must be caught by pre-flight shape validation and exit 2 — anything else means either the null-shape merge-time throw after writes (exit 1) or the array-shape silent-clobber (exit 0) has come back: ` + r.stderr)
    assert.match(r.stderr, /\.claude[/\\]settings\.json/,
      `AC-18 (${shape.label} shape): the refusal must name .claude/settings.json — an unnamed refusal leaves the operator unable to tell which file needs fixing: ` + r.stderr)
    assert.match(r.stderr, /not an object/i,
      `AC-18 (${shape.label} shape): the remedy must say the top level is not an object — this is the shape check the round-1 fix never had, so a generic message here would mean the shape arm still doesn't exist: ` + r.stderr)
    assert.doesNotMatch(r.stderr, /not valid JSON/i,
      `AC-18 (${shape.label} shape): this file IS valid JSON — a "not valid JSON" message here means the shape arm collapsed back into the parse-error arm and the operator gets a remedy for the wrong cause: ` + r.stderr)

    const onDisk = fs.readFileSync(settingsPath, 'utf8')
    assert.strictEqual(onDisk, shape.content,
      `AC-18/D5 (${shape.label} shape): the existing settings file must be left byte-identical — any change here means the merge ran (and possibly threw, or silently spread content into a numeric-indexed object) before the refusal fired: ` + onDisk)
    assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
      `AC-18 (${shape.label} shape): nothing at all may be written on this refusal — a config file appearing here means the shape check ran too late, after other targets were already written`)
    assert.ok(!fs.existsSync(path.join(dir, '.claude/rules/spec-pipeline.md')),
      `AC-18 (${shape.label} shape): nothing at all may be written on this refusal — a rules file appearing here means the shape check did not gate every other generated deliverable`)
  }
})

test('AC-20260822-02-18: --refresh does not bypass the non-object-settings refusal for the array shape', () => {
  const dir = newHost('init-gen-generate')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const settingsPath = path.join(dir, '.claude/settings.json')
  const content = JSON.stringify(['perm-marker-A', 'perm-marker-B'])
  fs.writeFileSync(settingsPath, content)
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath, '--refresh'])
  assert.strictEqual(r.status, 2,
    'AC-18/D5: "always merge-preserving ... both modes" covers the shape arm too — a 0 here under --refresh means a top-level-array settings file on a refresh run silently spreads the user\'s array content into a numeric-indexed permissions object: ' + r.stderr)

  const onDisk = fs.readFileSync(settingsPath, 'utf8')
  assert.strictEqual(onDisk, content,
    'AC-18/D5: the existing array-shaped settings file must stay byte-identical under --refresh too — any change here reproduces the exact silent-clobber-into-numeric-indexed-object finding this pin exists to catch: ' + onDisk)
})

test('AC-20260822-02-18/AC-20260823-02-6: an unreadable existing settings.json exits 2 with a permissions remedy distinct from the invalid-JSON message', () => {
  const isRoot = !!(process.getuid && process.getuid() === 0)
  if (isRoot) return // chmod 000 cannot deny a root-owned process; this pin cannot distinguish the fix from the bug under root, so it is skipped rather than asserting a false pass

  const dir = newHost('init-gen-generate')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const settingsPath = path.join(dir, '.claude/settings.json')
  fs.writeFileSync(settingsPath, JSON.stringify({ permissions: { allow: ['Bash(custom:*)'], deny: [] } }, null, 2))
  fs.chmodSync(settingsPath, 0o000)
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  try {
    const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
    assert.strictEqual(r.status, 2,
      'AC-18/D5: an unreadable existing settings file must be its own pre-flight arm and exit 2, not fall through to a JSON-parse or shape error: ' + r.stderr)
    assert.match(r.stderr, /cannot read/i,
      'AC-18: the unreadable-file arm must say the file cannot be read — a generic or parse-flavored message here means this is not actually a separate arm from the invalid-JSON case: ' + r.stderr)
    assert.match(r.stderr, /permission/i,
      'AC-18: the remedy for an unreadable file must point at permissions — this is the remedy that has to differ from "fix the JSON", or the operator chases the wrong fix: ' + r.stderr)
    assert.doesNotMatch(r.stderr, /not valid JSON/i,
      'AC-18: this pins the remedy split, which is the whole point of the separate read arm — a "not valid JSON" message on an unreadable (not unparseable) file means read failures and parse failures still share one arm: ' + r.stderr)
  } finally {
    fs.chmodSync(settingsPath, 0o644)
  }
})

test('AC-20260822-02-19/AC-20260823-02-7: an uncaught internal error (a .gitignore that is a directory, not a file) exits 4 with a stack and a re-run remedy instead of Node\'s implicit exit 1', () => {
  const dir = newHost('init-gen-generate')
  fs.rmSync(path.join(dir, '.gitignore'), { force: true })
  fs.mkdirSync(path.join(dir, '.gitignore'))
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 4,
    'AC-19: an uncaught internal throw (writing to a .gitignore that is actually a directory) must be caught by the top-level error boundary and exit 4 — today this exits 1 with a raw Node stack after every other target has already been written, indistinguishable from Node\'s own crash exit: ' + r.status + ' stderr: ' + r.stderr)
  assert.match(r.stderr, /unexpected internal error/i,
    'AC-19: the boundary must label the failure as an unexpected internal error, or the operator cannot tell this apart from one of the documented refusal exits (1/2/3): ' + r.stderr)
  assert.match(r.stderr, /re-?run/i,
    'AC-19: the boundary must print a re-run remedy alongside the stack — a bare stack trace with no next step leaves the operator to guess whether re-running is even safe: ' + r.stderr)
})

test('AC-20260822-02-17: a profile with a non-array where an array is required (agents: {}), and a profile missing conventionRules entirely, both exit 2 naming the offending field and leave the host tree untouched', () => {
  const cases = [
    {
      label: 'agents not an array',
      mutate: (p) => { p.agents = {} },
      fieldPattern: /agents/
    },
    {
      label: 'conventionRules missing',
      mutate: (p) => { delete p.conventionRules },
      fieldPattern: /conventionRules/
    }
  ]
  for (const c of cases) {
    const dir = newHost('init-gen-generate')
    const profile = baseProfile()
    c.mutate(profile)
    const profilePath = writeProfile(dir, profile)

    const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
    assert.strictEqual(r.status, 2,
      `AC-17 (${c.label}): an invalid profile shape must be caught by validateProfile and exit 2 — today this either falls through to a raw TypeError crash (agents: {} is not iterable) or is never checked at all (conventionRules absent) instead of a clean, named usage error: ` + r.status + ' stderr: ' + r.stderr)
    assert.match(r.stderr, c.fieldPattern,
      `AC-17 (${c.label}): the error must name the offending field — a silent or generic failure here leaves the operator guessing which profile field is malformed: ` + r.stderr)
    assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
      `AC-17 (${c.label}): a usage-error exit must write nothing — a config file appearing here means generation proceeded past the invalid field before the check fired`)
    assert.ok(!fs.existsSync(path.join(dir, '.claude/rules/spec-pipeline.md')),
      `AC-17 (${c.label}): a usage-error exit must write nothing — a rules file appearing here means generation proceeded past the invalid field before the check fired`)
  }
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

// Review rv_e83659d49386 closed specs/20260822/02-init-generation-script.md CLEAN
// but waived four executed defect sites into this spec (20260823/02) under the two-iteration fix
// cap: a string settings.extraAllow/extraDeny spreads per character into the host allow list at
// exit 0 (spiked: 12 one-char entries — no error boundary can ever catch it, only a shape check
// can); a non-array/primitive at either of validateProfile's config.agentMap or rules.sections
// `in`-operator sites dies as a bare TypeError at Node's implicit exit 1, colliding with the
// documented manifest-check-red exit code; and the unreadable-settings remedy told a
// directory-shaped settings.json operator to `chmod` a file when the true cause is EISDIR. These
// five tests pin AC-20260823-02-1 through AC-20260823-02-5 — none can pass yet, since D1
// (optional-array arm), D2 (object-shape guards), and D4 (EISDIR branch) are not yet implemented
// in init-gen.js (TDD red).

test('AC-20260823-02-1: a settings.extraAllow that is the string "Bash(bun x *)" exits 2 naming settings.extraAllow as must-be-an-array and writes nothing, never spreading it into twelve one-character allow entries', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.settings.extraAllow = 'Bash(bun x *)'
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 2,
    'D1: a string settings.extraAllow is iterable and silently spreads per character into the host permissions allow list at exit 0 (the parent review\'s executed corruption repro) unless a shape check refuses it at exit 2: ' + r.status + ' stderr: ' + r.stderr)
  assert.match(r.stderr, /settings\.extraAllow/,
    'AC-1: the refusal must name settings.extraAllow — an unnamed refusal leaves the operator unable to tell which profile field is malformed: ' + r.stderr)
  assert.match(r.stderr, /must be an array/i,
    'D1: the message must use the same must-be-an-array shape the required-array loop already uses, or the two refusal classes read as inconsistent: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(dir, '.claude/settings.json')),
    'AC-1: nothing may be written on this refusal — a settings.json appearing here is exactly the twelve-one-char-entry corruption this pin exists to prevent: ' + (fs.existsSync(path.join(dir, '.claude/settings.json')) ? fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8') : ''))
  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
    'AC-1: a config file appearing here means generation proceeded past the invalid settings.extraAllow field before the check fired')
})

test('AC-20260823-02-2: a settings.extraDeny that is the number 42 exits 2 naming settings.extraDeny as must-be-an-array, never dying with Node\'s bare "is not iterable" TypeError at exit 1', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.settings.extraDeny = 42
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 2,
    'D1: a numeric settings.extraDeny is not iterable and currently throws uncaught inside mergeSettings (a spread of 42) before the exit-4 boundary even starts, colliding with the documented manifest-check-red exit 1 — a shape check must refuse it at exit 2 instead: ' + r.status + ' stderr: ' + r.stderr)
  assert.match(r.stderr, /settings\.extraDeny/,
    'AC-2: the refusal must name settings.extraDeny — an unnamed refusal leaves the operator unable to tell which profile field is malformed: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /is not iterable/,
    'AC-2: a raw "is not iterable" TypeError in stderr means the bare Node crash still reached the operator instead of a matched remedy: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
    'AC-2: a config file appearing here means generation proceeded past the invalid settings.extraDeny field before the check fired')
})

test('AC-20260823-02-3: a config.agentMap that is the number 42 exits 2 naming config.agentMap as must-be-an-object with the profile-schema remedy, never throwing "Cannot use \'in\' operator" at exit 1', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.config.agentMap = 42
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 2,
    'D2: `\'tests\' in 42` throws a bare TypeError today at Node\'s implicit exit 1 — a plain-object guard ahead of the `in`-operator loop must catch this and refuse at exit 2 instead: ' + r.status + ' stderr: ' + r.stderr)
  assert.match(r.stderr, /config\.agentMap/,
    'AC-3: the refusal must name config.agentMap — an unnamed refusal leaves the operator unable to tell which profile field is malformed: ' + r.stderr)
  assert.match(r.stderr, /must be an object/i,
    'D2: the message must say config.agentMap must be an object, or the operator gets no actionable remedy for the shape it actually has: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /Cannot use 'in' operator/,
    'AC-3: a raw "Cannot use \'in\' operator" TypeError in stderr means the bare Node crash still reached the operator instead of a matched remedy: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
    'AC-3: a config file appearing here means generation proceeded past the invalid config.agentMap field before the check fired')
})

test('AC-20260823-02-4: a rules.sections that is the string "x" exits 2 naming rules.sections as must-be-an-object, never throwing at exit 1', () => {
  const dir = newHost('init-gen-generate')
  const profile = baseProfile()
  profile.rules.sections = 'x'
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 2,
    'D2: `\'Risk Tiers\' in "x"` throws a bare TypeError today at Node\'s implicit exit 1 — a plain-object guard ahead of the `in`-operator loop must catch this and refuse at exit 2 instead: ' + r.status + ' stderr: ' + r.stderr)
  assert.match(r.stderr, /rules\.sections/,
    'AC-4: the refusal must name rules.sections — an unnamed refusal leaves the operator unable to tell which profile field is malformed: ' + r.stderr)
  assert.match(r.stderr, /must be an object/i,
    'D2: the message must say rules.sections must be an object, or the operator gets no actionable remedy for the shape it actually has: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /Cannot use 'in' operator/,
    'AC-4: a raw "Cannot use \'in\' operator" TypeError in stderr means the bare Node crash still reached the operator instead of a matched remedy: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
    'AC-4: a config file appearing here means generation proceeded past the invalid rules.sections field before the check fired')
})

test('AC-20260823-02-5: an existing .claude/settings.json path that is a directory exits 2 naming it a directory and does NOT tell the operator to chmod it, writing nothing', () => {
  const dir = newHost('init-gen-generate')
  const settingsPath = path.join(dir, '.claude/settings.json')
  fs.mkdirSync(settingsPath, { recursive: true })
  const profile = baseProfile()
  const profilePath = writeProfile(dir, profile)

  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 2,
    'D4: a directory-shaped .claude/settings.json must still refuse at exit 2 via the unreadable-settings pre-flight arm: ' + r.status + ' stderr: ' + r.stderr)
  assert.match(r.stderr, /\.claude[/\\]settings\.json/,
    'AC-5: the refusal must name .claude/settings.json — an unnamed refusal leaves the operator unable to tell which path is the problem: ' + r.stderr)
  assert.match(r.stderr, /directory/i,
    'AC-5/D4: the refusal must say the path is a directory, or the operator has no way to distinguish this cause from a permissions error: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /chmod/i,
    'AC-5: the red edge — Node\'s current EISDIR message happens to contain the word "directory" already, but the fix must stop prescribing `chmod`, which cannot turn a directory into a file: ' + r.stderr)
  assert.ok(fs.statSync(settingsPath).isDirectory(),
    'AC-5: the settings path must be left untouched on this refusal — anything other than a directory here means generate wrote into or replaced it before refusing')
  assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
    'AC-5: a config file appearing here means generation proceeded past the unreadable-settings pre-flight before the check fired')
})
