'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, runNode, SPEC } = require('../helpers')
const { writeBrief, writeConventionsArtifacts, writeBindingSubset } = require('./tournament.fixtures.js')
const mockApp = require('../mocks/mock-app-fixtures.js')

// specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md D6, AC-20260914-02-4,
// AC-20260914-02-5, AC-20260914-02-6, AC-20260914-02-13: genesis-driver.js derives BRIEF's
// journey/notes counts from design/approval.json and design/notes.json (never lib/mocks-notes),
// auto-picks framework/language/packageManager and skips the tournament once a mock app exists,
// and gates --mark skeleton-landed on `mock-review check --json` instead of the retired
// data-shell/design-atlas mechanics. None of this exists in genesis-driver.js today, so every
// test below is red until D6 lands — except AC-13, a sanctioned green-pre-change pin (rules §
// Gotchas: an AC pinning a not-yet-built mechanism's absence), noted in the deviations sidecar.

const SCRIPT = 'scripts/genesis-driver.js'

function bare(dir, opts) {
  return runNode(SCRIPT, ['--root', dir], opts)
}

function state(dir, opts) {
  return runNode(SCRIPT, ['--root', dir, '--state'], opts)
}

function mark(dir, name, file, opts) {
  const argv = ['--root', dir, '--mark', name]
  if (file) argv.push('--file', file)
  return runNode(SCRIPT, argv, opts)
}

function statusOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.claude/genesis/status.json'), 'utf8'))
}

// ---------------------------------------------------------------------------
// AC-20260914-02-4
// ---------------------------------------------------------------------------

test('AC-20260914-02-4: WHEN genesis-driver.js --root <host> runs at BRIEF on a host whose design/mocks/status.json is APPROVED (schemaVersion 2), whose design/approval.json has journeys first-visit and daily-check, and whose design/notes.json has one open note and one open journey conversation THE SYSTEM prints "seed journeys: 2 · notes open: 2" and never requires lib/mocks-notes', () => {
  const dir = tmpdir('genesis-mock-app-brief')

  mockApp.writeStatus(dir, { state: 'APPROVED' })
  mockApp.writeLedger(dir)
  mockApp.writeSeed(dir, { records: [], journeys: ['first-visit', 'daily-check'] })
  mockApp.writeApp(dir, {
    records: [],
    notes: {
      notes: [{ id: 'N001', screen: 'home', state: 'default', component: 'Card', key: 'title', snippet: 'Welcome', status: 'open', thread: [] }],
      journeys: {
        'first-visit': { status: 'open', thread: [] },
        'daily-check': { status: 'resolved', thread: [] },
      },
    },
    approval: {
      journeys: {
        'first-visit': { approvedAt: '2026-09-01T00:00:00.000Z', client: false },
        'daily-check': { approvedAt: '2026-09-01T00:00:00.000Z', client: false },
      },
    },
  })

  writeBrief(dir, { picks: ['- archetype: web-app'] })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief naming a visual archetype: ' + disco.stderr)

  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare invocation at BRIEF with an APPROVED, open-ledger mocks set must exit 0: ' + r.stderr)
  assert.match(r.stdout, /seed journeys: 2 · notes open: 2/,
    'D6(a): BRIEF must print "seed journeys: 2 · notes open: 2" derived from design/approval.json\'s ' +
    'journeys keys (first-visit, daily-check) and design/notes.json\'s open-status notes+journeys ' +
    '(one note, one journey conversation) — today\'s driver prints a different count from a different ' +
    'source (seedJourneysMap() off design/mocks/seed.md, and "notes unresolved" via lib/mocks-notes ' +
    'reading a root-level design/mocks/notes.json this mock-app host never writes): ' + r.stdout)

  // Second half: the module must be absent from the driver's require graph — deleting it in a
  // copy of the plugin must leave the run's exit unchanged (spec 03 deletes the file for good).
  const specCopy = tmpdir('genesis-mock-app-nolib-spec')
  fs.cpSync(SPEC, specCopy, { recursive: true })
  fs.rmSync(path.join(specCopy, 'scripts/lib/mocks-notes.js'), { force: true })
  const baseline = bare(dir)
  const mutant = spawnSync(process.execPath, [path.join(specCopy, 'scripts/genesis-driver.js'), '--root', dir], { encoding: 'utf8' })
  assert.strictEqual(mutant.status, baseline.status,
    'D6(a): deleting spec/scripts/lib/mocks-notes.js must not change this run\'s exit code — a ' +
    'differing exit here means the driver still requires the module, so a host that later deletes ' +
    'it (spec 03) breaks every BRIEF invocation: baseline=' + baseline.status + ' mutant=' + mutant.status +
    ' mutantStderr=' + mutant.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260914-02-5 / AC-20260914-02-13
// ---------------------------------------------------------------------------

test('AC-20260914-02-5: WHEN MENUS runs on a host whose design/mocks/status.json says app: "app", with app/mock.config.ts present and framework, language, packageManager open THE SYSTEM prints the three auto-pick lines, leaves testRunner open, and records status.tournament = { "skipped": "mock-app" }, and never routes a tournament archetype to FINALISTS', () => {
  const dir = tmpdir('genesis-mock-app-menus-autopick')

  mockApp.writeStatus(dir, { state: 'SEED' })
  mockApp.writeApp(dir)

  writeBrief(dir, {
    // Dimension keys in ## Open Dimensions are matched by parseOpenDimensions's
    // `/^- ([a-z0-9-]+):/` — kebab-case only — so package-manager/test-runner (not the
    // stack-descriptor's camelCase field names) are the dimension keys here.
    dims: { framework: 'open', language: 'open', 'package-manager': 'open', 'test-runner': 'open' },
    // backend-api: a TOURNAMENT archetype (so this test can prove the tournament is skipped)
    // that is also DESIGN_SKIPPED, so brief-written is accepted immediately with no mocks/
    // doctrine artifacts owed — the mock-app host above is for MENUS to read, not for BRIEF's
    // ratification gate.
    picks: ['- archetype: backend-api'],
  })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted: ' + disco.stderr)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'test setup requires brief-written to be accepted immediately for backend-api (DESIGN_SKIPPED_ARCHETYPES owe nothing beyond discovery): ' + bw.stderr)

  // test-runner is the one dimension the mock app never fixes, so it needs its own menu+pick
  // before menus-done can close — written here, ahead of the first bare() call, so the
  // driver's own auto-pick write (below) never collides with this fixture's own writeBrief
  // rewrite.
  fs.mkdirSync(path.join(dir, '.claude/genesis/interview-research'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/interview-research/test-runner.json'),
    JSON.stringify({ dimension: 'test-runner', options: [{ label: 'vitest', packages: [] }] }, null, 2))
  const menuWritten = mark(dir, 'menu-written', 'interview-research/test-runner.json')
  assert.strictEqual(menuWritten.status, 0, 'test setup requires menu-written to be accepted for test-runner: ' + menuWritten.stderr)
  writeBrief(dir, {
    dims: { framework: 'open', language: 'open', 'package-manager': 'open', 'test-runner': 'open' },
    picks: ['- archetype: backend-api', '- test-runner: vitest'],
  })

  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare invocation at MENUS on a mock-app host must exit 0: ' + r.stderr)
  assert.match(r.stdout, /📌 Auto-picked vite-react — the mock app is the product's frontend \(ADR-0028\)/,
    'D6(b): MENUS must print the framework auto-pick line naming vite-react and ADR-0028 — its ' +
    'absence means the driver still treats framework as an open dimension to be menu-researched ' +
    'even though the mock app already fixes it: ' + r.stdout)
  assert.match(r.stdout, /📌 Auto-picked typescript/,
    'D6(b): MENUS must print the language auto-pick line naming typescript: ' + r.stdout)
  assert.match(r.stdout, /📌 Auto-picked npm/,
    'D6(b): MENUS must print the packageManager auto-pick line naming npm: ' + r.stdout)
  assert.match(r.stdout, /test-runner/,
    'D6(b): test-runner must stay open (no mock-app dimension fixes a test runner) — its absence ' +
    'from the step text means MENUS auto-decided a dimension the mock app never determines: ' + r.stdout)
  assert.ok(!/open, no menu yet: [^\n]*\bframework\b/.test(r.stdout) && !/open, menu written, no pick: [^\n]*\bframework\b/.test(r.stdout),
    'D6(b): framework must no longer be listed among the open dimensions still owing a menu or a ' +
    'pick — it is recorded as decided the instant the mock app is found: ' + r.stdout)

  const status = statusOf(dir)
  assert.deepStrictEqual(status.tournament, { skipped: 'mock-app' },
    'D6(c): status.tournament must be recorded as { "skipped": "mock-app" } as soon as MENUS ' +
    'observes the mock app — its absence means a tournament archetype (backend-api here) will ' +
    'still race scaffolds against an app that already exists: ' + JSON.stringify(status.tournament))

  // D6(b): "record those three as decided" means writing the pick, not merely excluding the
  // dimension from the open set — brief.md's ## Picks section must carry the three auto-picked
  // lines in brief.md's own kebab-case dimension-key grammar, alongside test-runner's untouched
  // session-written pick.
  const briefAfterMenus = fs.readFileSync(path.join(dir, '.claude/genesis/brief.md'), 'utf8')
  assert.match(briefAfterMenus, /^- framework: vite-react$/m,
    'D6(b): brief.md\'s ## Picks section must carry "- framework: vite-react" the instant MENUS ' +
    'observes the mock app — its absence means a later ## Picks reader (decideCheck\'s ADR-naming ' +
    'check, a resumed session) never sees framework recorded as decided, only as no-longer-open: ' + briefAfterMenus)
  assert.match(briefAfterMenus, /^- language: typescript$/m,
    'D6(b): brief.md\'s ## Picks section must carry "- language: typescript": ' + briefAfterMenus)
  assert.match(briefAfterMenus, /^- package-manager: npm$/m,
    'D6(b): brief.md\'s ## Picks section must carry "- package-manager: npm": ' + briefAfterMenus)
  assert.match(briefAfterMenus, /^- test-runner: vitest$/m,
    'D6(b): test-runner\'s own session-written pick must survive the mock-app auto-pick write ' +
    'untouched — test-runner is governed by its own pick, never overwritten by the auto-pick ' +
    'mechanism that only owns framework/language/package-manager: ' + briefAfterMenus)

  // D6(b): re-rendering MENUS a second time (a bare re-run, the normal /clear-and-resume path)
  // must not re-append the same three auto-picked lines — the write must be idempotent.
  const r2 = bare(dir)
  assert.strictEqual(r2.status, 0, 'a second bare invocation at MENUS on a mock-app host must exit 0: ' + r2.stderr)
  const briefAfterSecondMenus = fs.readFileSync(path.join(dir, '.claude/genesis/brief.md'), 'utf8')
  for (const line of ['- framework: vite-react', '- language: typescript', '- package-manager: npm']) {
    const occurrences = briefAfterSecondMenus.split('\n').filter((l) => l === line).length
    assert.strictEqual(occurrences, 1,
      'D6(b): re-running the bare driver at MENUS must not duplicate the auto-written "' + line +
      '" Picks line — found ' + occurrences + ' occurrences, which means the auto-pick write is ' +
      'not idempotent and brief.md\'s ## Picks would grow one duplicate line per re-run: ' + briefAfterSecondMenus)
  }

  // D6(c): once the tournament is recorded skipped at MENUS, closing menus-done must route
  // straight to DECIDE — backend-api is a TOURNAMENT_ARCHETYPES member, so a next-state
  // computation that ignores status.tournament.skipped would still print FINALISTS here.
  const menusDone = mark(dir, 'menus-done')
  assert.strictEqual(menusDone.status, 0,
    'test setup requires menus-done to be accepted once framework/language/package-manager are ' +
    'auto-decided and test-runner carries its own menu+pick: ' + menusDone.stderr)
  assert.doesNotMatch(menusDone.stdout, /FINALISTS/,
    'D6(c): --mark menus-done\'s own output must never mention FINALISTS for a mock-app host — ' +
    'backend-api is a TOURNAMENT_ARCHETYPES member, so a next-state computation that does not ' +
    'consult status.tournament.skipped would print the FINALISTS step text and a ' +
    '"(MENUS → FINALISTS)" checkpoint line even though the tournament was already recorded ' +
    'skipped at MENUS: ' + menusDone.stdout)

  const st = state(dir)
  assert.strictEqual(st.status, 0, '--state must exit 0 after menus-done on a mock-app host: ' + st.stderr)
  assert.match(st.stdout, /\bDECIDE\b/,
    'D6(c): --state must print DECIDE once menus-done is accepted on a mock-app host — the ' +
    'tournament was recorded skipped at MENUS, so the derived state must fall straight through ' +
    'FINALISTS/RACE/PROBE/PICK to DECIDE: ' + st.stdout)
  for (const forbidden of ['FINALISTS', 'RACE', 'PROBE', 'PICK']) {
    assert.ok(!st.stdout.includes(forbidden),
      'D6(c): --state must never print ' + forbidden + ' after menus-done on a mock-app host — ' +
      'its presence means the tournament ran (or was about to run) despite status.tournament.skipped ' +
      'already being recorded at MENUS: ' + st.stdout)
  }

  // AC-13's negative control lives in the same test (cheap, on the same fixture family): a
  // mock-app-free host must show framework still open, no auto-pick line at all. Genuinely
  // green pre-change (no auto-pick mechanism exists yet anywhere in the driver) — kept as a
  // regression pin for once D6 lands.
  const noAppDir = tmpdir('genesis-mock-app-menus-no-app')
  writeBrief(noAppDir, {
    dims: { framework: 'open', language: 'open', 'package-manager': 'open', 'test-runner': 'open' },
    picks: ['- archetype: backend-api'],
  })
  assert.strictEqual(mark(noAppDir, 'discovery-done').status, 0, 'test setup requires discovery-done on the no-mock-app host')
  assert.strictEqual(mark(noAppDir, 'brief-written').status, 0, 'test setup requires brief-written on the no-mock-app host')
  const noAppR = bare(noAppDir)
  assert.strictEqual(noAppR.status, 0, 'a bare invocation at MENUS on a host with no mock app must exit 0: ' + noAppR.stderr)
  assert.ok(!noAppR.stdout.includes('📌 Auto-picked'),
    'AC-20260914-02-13: a host with no <status.app>/mock.config.ts must print no auto-pick line at all: ' + noAppR.stdout)
  assert.match(noAppR.stdout, /\bframework\b/,
    'AC-20260914-02-13: framework must stay open (still listed as owing a menu) on a host with no mock app: ' + noAppR.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260914-02-6
// ---------------------------------------------------------------------------

// Drives an empty root through discovery/brief/menus/decided for a design-skipped, non-tournament
// archetype (data-ml — the cheapest ratification path, per genesis-driver.test.js's own
// advanceToDecide default), so this test's own fixture stays scoped to the SCAFFOLD/SKELETON
// mechanics under test rather than re-proving BRIEF or the tournament.
function advanceToDecided(dir) {
  writeBrief(dir, { picks: ['- archetype: data-ml'] })
  assert.strictEqual(mark(dir, 'discovery-done').status, 0, 'test setup requires discovery-done to be accepted')
  assert.strictEqual(mark(dir, 'brief-written').status, 0, 'test setup requires brief-written to be accepted immediately for data-ml')
  fs.mkdirSync(path.join(dir, '.claude/genesis/interview-research'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/interview-research/hosting.json'),
    JSON.stringify({ dimension: 'hosting', options: [{ label: 'AWS', packages: [] }] }, null, 2))
  assert.strictEqual(mark(dir, 'menu-written', 'interview-research/hosting.json').status, 0, 'test setup requires menu-written to be accepted')
  writeBrief(dir, { picks: ['- archetype: data-ml', '- hosting: AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted: ' + done.stderr)

  fs.writeFileSync(path.join(dir, '.claude/genesis/stack-descriptor.json'), JSON.stringify({
    schemaVersion: 1, archetype: 'web-app', language: 'typescript', framework: 'next',
    packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
    designCatalog: 'none', gateCommand: 'true', scaffoldCommand: 'true',
    decisionRecords: ['docs/adr/0001-hosting.md'],
  }, null, 2))
  fs.mkdirSync(path.join(dir, 'docs/adr'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/adr/0001-hosting.md'),
    '# 0001. Hosting choice\n\n## Decision\nAWS chosen for `hosting`.\n\n## Dissents\nFly.io was considered and rejected for regional latency — no other minority option surfaced.\n')
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted with a complete descriptor and ADR: ' + decided.stderr)
}

test('AC-20260914-02-6: WHEN --mark skeleton-landed runs on a host with app/mock.config.ts and the stub mock-review check --json reports ok: false with one finding THE SYSTEM exits 2 printing that finding\'s file and message and leaves marks.skeletonLanded null; WHEN it reports ok: true and the gate is green THE SYSTEM records the mark with status.scaffold = { "skipped": "mock-app" } and scaffold.log absent', () => {
  // --- ok: false leg ---
  const redDir = tmpdir('genesis-mock-app-skeleton-red')
  advanceToDecided(redDir)
  mockApp.writeStatus(redDir, { state: 'SEED' })
  mockApp.writeApp(redDir)

  const redStub = mockApp.installStub(path.join(redDir, '.bin'), path.join(redDir, '.mock-stub-state'))
  redStub.setContract(mockApp.contractOk())
  redStub.setCheck(mockApp.checkOk({
    ok: false,
    findings: [{ kind: 'missing-state', severity: 'error', file: 'app/src/screens/Home.tsx', message: 'Home is missing state "empty"' }],
  }))

  const scaffoldRun = bare(redDir, { env: redStub.env() })
  assert.strictEqual(scaffoldRun.status, 0, 'test setup requires the auto-run scaffold to complete: ' + scaffoldRun.stderr)
  writeBindingSubset(redDir, 'true')

  const landedRed = mark(redDir, 'skeleton-landed', undefined, { env: redStub.env() })
  assert.strictEqual(landedRed.status, 2,
    'D6(d): --mark skeleton-landed must exit 2 when mock-review check --json reports ok: false — a ' +
    'zero or other exit here means the driver still accepts the old data-shell/design-atlas gate ' +
    'chain instead of mock-review check\'s own ok flag: ' + JSON.stringify(landedRed))
  assert.match(landedRed.stdout + landedRed.stderr, /app\/src\/screens\/Home\.tsx/,
    'D6(d): the refusal must print the failing finding\'s file: ' + JSON.stringify(landedRed))
  assert.match(landedRed.stdout + landedRed.stderr, /Home is missing state "empty"/,
    'D6(d): the refusal must print the failing finding\'s message: ' + JSON.stringify(landedRed))
  assert.strictEqual(statusOf(redDir).marks.skeletonLanded, null,
    'D6(d): marks.skeletonLanded must stay null when the gate refuses the mark: ' + JSON.stringify(statusOf(redDir).marks))

  // --- ok: true leg ---
  const greenDir = tmpdir('genesis-mock-app-skeleton-green')
  advanceToDecided(greenDir)
  mockApp.writeStatus(greenDir, { state: 'SEED' })
  mockApp.writeApp(greenDir)

  const greenStub = mockApp.installStub(path.join(greenDir, '.bin'), path.join(greenDir, '.mock-stub-state'))
  greenStub.setContract(mockApp.contractOk())
  greenStub.setCheck(mockApp.checkOk())

  const scaffoldRunGreen = bare(greenDir, { env: greenStub.env() })
  assert.strictEqual(scaffoldRunGreen.status, 0, 'test setup requires the auto-run scaffold to complete: ' + scaffoldRunGreen.stderr)
  assert.strictEqual(statusOf(greenDir).scaffold && statusOf(greenDir).scaffold.skipped, 'mock-app',
    'D6(d): SCAFFOLD must not run scaffoldCommand at all once the mock app exists — status.scaffold ' +
    'must be { "skipped": "mock-app" } instead of the executed-command record the driver writes ' +
    'today: ' + JSON.stringify(statusOf(greenDir).scaffold))
  assert.strictEqual(fs.existsSync(path.join(greenDir, '.claude/genesis/scaffold.log')), false,
    'D6(d): scaffold.log must not exist — nothing was ever run to produce it once scaffoldCommand ' +
    'is skipped for a mock-app host')

  writeBindingSubset(greenDir, 'true')
  const landedGreen = mark(greenDir, 'skeleton-landed', undefined, { env: greenStub.env() })
  assert.strictEqual(landedGreen.status, 0,
    'D6(d): --mark skeleton-landed must succeed when mock-review check --json reports ok: true and the gate is green: ' + landedGreen.stderr)
  assert.strictEqual(statusOf(greenDir).marks.skeletonLanded, true,
    'D6(d): marks.skeletonLanded must be recorded true on success: ' + JSON.stringify(statusOf(greenDir).marks))
})

// Spec 02 review advisory: appendDerivedPicksToBrief returned silently when brief.md carried no
// "## Picks" heading. The dimension stopped being listed open (MENUS excludes what the mock app
// fixes) but nothing recorded it as decided, so every later Picks reader — decideCheck's
// ADR-naming check, a resumed session — saw it as neither, with no error anywhere.
test('MENUS on a mock-app host whose brief.md has no "## Picks" heading refuses by name instead of silently losing the derived picks', () => {
  const dir = tmpdir('genesis-mock-app-no-picks')

  mockApp.writeStatus(dir, { state: 'SEED' })
  mockApp.writeApp(dir)

  writeBrief(dir, {
    dims: { framework: 'open', language: 'open', 'package-manager': 'open', 'test-runner': 'open' },
    picks: ['- archetype: backend-api'],
  })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted: ' + disco.stderr)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'test setup requires brief-written to be accepted for backend-api: ' + bw.stderr)

  // The heading is removed only now, after the marks that read it: this pins the state a brief
  // hand-edited (or written from an older template) lands in, not a malformed fixture.
  const briefPath = path.join(dir, '.claude/genesis/brief.md')
  const stripped = fs.readFileSync(briefPath, 'utf8').replace(/^## Picks[\s\S]*$/m, '')
  fs.writeFileSync(briefPath, stripped)

  const r = bare(dir)
  assert.strictEqual(r.status, 2,
    'MENUS must refuse when the derived picks have no "## Picks" heading to land under — exiting 0 ' +
    'here means the picks were dropped silently and the dimensions read as neither open nor decided: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /## Picks/, 'the refusal must name the missing heading: ' + r.stderr)
  assert.match(r.stderr, /remedy: add a "## Picks" heading/, 'the refusal must name the exact remedy: ' + r.stderr)
  assert.match(r.stderr, /framework/, 'the refusal must name at least one pick that had nowhere to land: ' + r.stderr)
  assert.strictEqual(fs.readFileSync(briefPath, 'utf8'), stripped,
    'a refused MENUS render must leave brief.md byte-identical — a partial write is how the picks get lost in a second shape')
})
