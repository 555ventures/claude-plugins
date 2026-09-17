'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const fx = require('./mock-app-fixtures')

// specs/20260917/01-the-client-confirms-the-story.md D3-D11: mocks-driver.js rewritten onto the
// seed's beat grammar and the SEED -> SHELL -> SCREENS -> THEME -> APPROVED chain (CLIENT
// retired, D5's beats-equality and beat-hash confirm replacing the old approvedAt chain). Cases
// below still tagged AC-20260914-01-4/5/6/12/15/23 and "no journeys" are untouched by this spec
// (specs/20260914/01-the-mock-contract-and-the-driver.md remains their owner) and are expected
// to fail only incidentally, from the D12 fixture-currency edits rippling ahead of the rest of
// this build's own File Plan rows landing.

const iso = '2026-09-14T00:00:00.000Z'

function statusPath(root) {
  return path.join(root, 'design/mocks/status.json')
}

function patchStatus(root, fn) {
  const s = fx.readStatus(root)
  fn(s)
  fs.writeFileSync(statusPath(root), JSON.stringify(s, null, 2))
  return s
}

function seedMarks(overrides) {
  return { seedDone: null, shellDrawn: null, themePicked: null, approved: null, ...overrides }
}

// D1's beat grammar, written directly (bypassing fx.writeSeed's single default beat) so each
// test below can pin its own beat text/screen/state — and, via beatHash, its own confirmed hash.
function writeBeatSeed(root, journeys) {
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  let body = '# Seed — Fixture Product\n\n## Records\n\n## Journeys\n\n'
  for (const j of journeys) {
    body += `### ${j.name}\n${j.persona}\n`
    j.beats.forEach((b, i) => {
      body += `${i + 1}. "${b.beat}" -> ${b.screen}${b.state ? '@' + b.state : ''}\n`
    })
    body += '\n'
  }
  fs.writeFileSync(path.join(root, 'design/mocks/seed.md'), body)
}

// spec/doctrine/mocks.md § Mocks: Checkpoint contract and the Behavior section's refusal
// contract ("Refusal text always ends with `remedy: <command>` and goes to stderr"): both the
// accepted-mark checkpoint output and every refusal's stderr are read by their trailing
// non-blank lines, never the whole blob, so an unrelated earlier line can't mask a missing one.
function lastNonBlankLines(text, n) {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  return lines.slice(-n)
}

// The Behavior section only requires refusal text to END with `remedy: <command>` — the landed
// driver appends it as a trailing " — remedy: ..." clause on the same line for most refusals,
// and as its own trailing line for at least one (the unresolved-edge refusal), so this checks
// the tail of the whole trimmed stream rather than assuming either shape.
function endsWithRemedy(text) {
  return /remedy: \S.*$/.test(text.replace(/\s+$/, ''))
}

test('AC-20260914-01-4: a cold root creates status.json schemaVersion 2 / app "app" and prints the SEED block in the pinned line order with no Skill: line', () => {
  const root = tmpdir('states-ac4')
  fx.writeSeed(root, { records: ['client'], journeys: ['first-visit'] })
  fx.writeLedger(root)

  const r = runNode('scripts/mocks-driver.js', ['--root', root], { env: { ...process.env, PATH: '' } })
  assert.strictEqual(r.status, 0, 'a cold-root plain run must succeed and print the SEED block: ' + r.stderr)

  assert.ok(fs.existsSync(statusPath(root)), 'a cold run must create design/mocks/status.json, or nothing derives state on the next run')
  const status = fx.readStatus(root)
  assert.strictEqual(status.schemaVersion, 2, 'a freshly created status.json must carry schemaVersion 2 — writing the old 1 would break every mark this spec adds')
  assert.strictEqual(status.app, 'app', 'D4: status.app must be the literal "app" (the scaffold\'s created subdirectory), or every host-app path resolution goes to the wrong directory')

  const out = r.stdout
  const idxRead = out.indexOf('Read only: design/mocks/seed.md')
  const idxScaffold = out.indexOf('npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s')
  const idxInstall = out.indexOf('npm i -D @555-ventures/mock-review')
  const idxCp = out.indexOf('cp ')
  assert.ok(idxRead !== -1, 'the SEED block must print "Read only: design/mocks/seed.md": ' + out)
  assert.ok(idxScaffold !== -1, 'D4: the SEED block must print the exact scaffold command verbatim: ' + out)
  assert.ok(idxInstall !== -1, 'D4: the SEED block must print the exact `npm i -D @555-ventures/mock-review` line: ' + out)
  assert.ok(idxCp !== -1, 'D4: the SEED block must print at least one `cp` template line: ' + out)
  assert.ok(idxRead < idxScaffold && idxScaffold < idxInstall && idxInstall < idxCp,
    'the four SEED lines must print in this exact order — Read only, scaffold, install, then the cp lines: ' + out)
  const cpCount = out.split('\n').filter((l) => l.trim().startsWith('cp ')).length
  assert.strictEqual(cpCount, 4, 'exactly one cp line per D4 template file, four total: ' + out)
  assert.doesNotMatch(out, /Skill:/, 'D12: SEED never carries a Skill: line')
})

test('AC-20260914-01-5: `--mark seed-done` refuses naming the missing records file, then records the mark and the next run carries Skill: mock-authoring', () => {
  const root = tmpdir('states-ac5')
  fx.writeSeed(root, { records: ['client', 'task'], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, { marks: seedMarks() })
  fx.writeApp(root, { records: ['client'] }) // task.ts deliberately missing
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  const missing = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'seed-done'], { env: stub.env() })
  assert.strictEqual(missing.status, 2, 'a missing declared records file must refuse seed-done: ' + missing.stderr)
  assert.match(missing.stderr, /app\/src\/records\/task\.ts/, 'the refusal must name the exact missing file: ' + missing.stderr)
  assert.match(missing.stderr, /remedy: write app\/src\/records\/task\.ts/, 'the refusal must name the exact remedy command: ' + missing.stderr)

  fs.writeFileSync(path.join(root, fx.APP, 'src/records/task.ts'), "export const tasks = [{ id: '1' }, { id: '2' }, { id: '3' }]\n")
  const done = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'seed-done'], { env: stub.env() })
  assert.strictEqual(done.status, 0, 'once every declared records file exists, seed-done must record: ' + done.stderr)
  assert.ok(fx.readStatus(root).marks.seedDone, 'marks.seedDone must be recorded after a successful seed-done mark')

  const next = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(next.stdout, /Skill: mock-authoring/, 'D12: the SHELL block printed after seed-done must carry the mock-authoring skill line: ' + next.stdout)
})

test('AC-20260914-01-6: `--mark shell-drawn` refuses on an error finding, records the mark on a warn-only ok check and advances to the first seed journey, then re-derives SCREENS when a journey is added mid-state', () => {
  const root = tmpdir('states-ac6')
  fx.writeSeed(root, { records: [], journeys: ['first-visit', 'daily-check'] })
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso }),
    journeys: { 'first-visit': { drawn: null, approved: null }, 'daily-check': { drawn: null, approved: null } },
  })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())

  stub.setCheck({
    ...fx.checkOk(),
    ok: false,
    findings: [{ kind: 'layer', severity: 'error', file: 'src/screens/home.tsx', message: 'imports @/review/store' }],
  })
  const bad = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'shell-drawn'], { env: stub.env() })
  assert.strictEqual(bad.status, 2, 'an error-severity finding must refuse shell-drawn: ' + bad.stderr)
  assert.match(bad.stderr, /src\/screens\/home\.tsx/, 'the refusal must print the finding\'s file: ' + bad.stderr)
  assert.match(bad.stderr, /imports @\/review\/store/, 'the refusal must print the finding\'s message: ' + bad.stderr)
  assert.ok(endsWithRemedy(bad.stderr),
    'the shell-drawn ok:false refusal must end with a `remedy: <command>` line — a diagnosis with no remedy leaves the session with no next command: ' + bad.stderr)

  stub.setCheck({
    ...fx.checkOk(),
    ok: true,
    journeys: [],
    findings: [{ kind: 'size', severity: 'warn', file: 'src/shells/ConsoleShell.tsx', message: '162 lines' }],
    shells: [{ name: 'ConsoleShell', file: 'src/shells/ConsoleShell.tsx', examples: ['Default'] }],
  })
  const good = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'shell-drawn'], { env: stub.env() })
  assert.strictEqual(good.status, 0, 'a warn-only finding with a non-empty shell examples entry must never refuse shell-drawn: ' + good.stderr)
  assert.ok(fx.readStatus(root).marks.shellDrawn, 'marks.shellDrawn must be recorded after a successful shell-drawn mark')
  const goodLines = lastNonBlankLines(good.stdout, 2)
  assert.strictEqual(goodLines[0],
    '📒 ledger: 0 said-by-user · 0 ratified-doc · 0 inferred (0 open) · 0 invented (0 open) · 0 process · 0 catches · 0 exclusions',
    'an accepted shell-drawn mark must print the ledger\'s countsLine as its second-to-last non-blank line (§ Provenance Ledger) — without it a session has no signal of the ledger state before clearing: ' + good.stdout)
  assert.strictEqual(goodLines[1],
    '✅ checkpoint — mocks state saved (SHELL → SCREENS); safe to /clear and re-run /spec:mocks',
    'an accepted shell-drawn mark must print the exact § Mocks: Checkpoint contract line as its last non-blank line, naming the SHELL → SCREENS transition — its absence means the command\'s own /clear-safe promise (spec/commands/mocks.md) is false: ' + good.stdout)
  const drawFirst = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(drawFirst.stdout, /draw journey first-visit/, 'the next run must print the first seed journey to draw: ' + drawFirst.stdout)

  patchStatus(root, (s) => {
    s.journeys['first-visit'] = { drawn: iso, approved: iso }
    s.journeys['daily-check'] = { drawn: iso, approved: iso }
  })
  fx.appendSeedJourney(root, 'onboarding')
  const state = runNode('scripts/mocks-driver.js', ['--root', root, '--state'], { env: stub.env() })
  assert.match(state.stdout, /SCREENS/, 'a journey added to the seed mid-SCREENS must reopen the SCREENS state rather than skip straight to THEME: ' + state.stdout)
  const drawOnboarding = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(drawOnboarding.stdout, /draw journey onboarding/, 'the plain run must print the newly added journey to draw: ' + drawOnboarding.stdout)
})

test('AC-20260917-01-4: `--mark seed-done` refuses a seed journey still carrying a ```surfaces block (zero beats), naming the journey, the first offending line and a remedy citing § Mocks: Seed, then records the mark over a well-formed beat-grammar seed', () => {
  const root = tmpdir('states-ac4-new')
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(root, 'design/mocks/seed.md'),
    '# Seed — Fixture Product\n\n## Records\n\n## Journeys\n\n' +
    '### first-visit\nAnn opens the app.\n```surfaces\nhome\n```\n\n')
  fx.writeLedger(root)
  fx.writeStatus(root, { marks: seedMarks() })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  const bad = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'seed-done'], { env: stub.env() })
  assert.strictEqual(bad.status, 2, 'a journey with zero beats (still carrying the retired ```surfaces block) must refuse seed-done: ' + bad.stderr)
  assert.match(bad.stderr, /first-visit/, 'the refusal must name the offending journey: ' + bad.stderr)
  assert.match(bad.stderr, /```surfaces/, 'the refusal must quote the first offending line, or a session cannot find what to fix: ' + bad.stderr)
  assert.match(bad.stderr, /remedy:.*§ Mocks: Seed/, 'the refusal must cite § Mocks: Seed as its remedy: ' + bad.stderr)
  assert.strictEqual(fx.readStatus(root).marks.seedDone, null, 'a refused seed-done must leave marks.seedDone unset')

  writeBeatSeed(root, [{ name: 'first-visit', persona: 'Ann opens the app.', beats: [{ beat: 'I open the app', screen: 'home', state: null }] }])
  const ok = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'seed-done'], { env: stub.env() })
  assert.strictEqual(ok.status, 0, 'a well-formed beat-grammar seed must record seed-done: ' + ok.stderr)
  assert.ok(fx.readStatus(root).marks.seedDone, 'marks.seedDone must be recorded once the seed carries real beats')
})

test('AC-20260917-01-5: `--mark journey-drawn` refuses an unknown check journey, an out-of-seed --journey, an unresolved edge, then a beats mismatch against the seed, before recording drawn once the steps copy the seed verbatim', () => {
  const root = tmpdir('states-ac5-new')
  writeBeatSeed(root, [
    {
      name: 'first-visit',
      persona: 'Ann opens the app.',
      beats: [
        { beat: 'I open the app', screen: 'home', state: null },
        { beat: 'I tap Sign in', screen: 'login', state: 'empty' },
      ],
    },
    { name: 'daily-check', persona: 'Ann checks in daily.', beats: [{ beat: 'I open the app', screen: 'home', state: null }] },
  ])
  fx.writeLedger(root)
  fs.appendFileSync(path.join(root, 'design/mocks/ledger.md'),
    '| A1 | SCREENS | product | invented claim | invented | open | - | - | - |\n')
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: null, approved: null }, 'daily-check': { drawn: null, approved: null } },
  })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())

  stub.setCheck({ ...fx.checkOk(), journeys: [] })
  const noJourney = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-drawn', '--journey', 'first-visit'], { env: stub.env() })
  assert.strictEqual(noJourney.status, 2, 'a check --json reporting no journey with the given id must refuse journey-drawn: ' + noJourney.stderr)
  assert.match(noJourney.stderr, /remedy: add journey first-visit to src\/journeys\.ts/, 'the refusal must name the exact remedy: ' + noJourney.stderr)

  const notSeed = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-drawn', '--journey', 'nope'], { env: stub.env() })
  assert.strictEqual(notSeed.status, 2, 'a --journey not declared in the seed must refuse: ' + notSeed.stderr)
  assert.match(notSeed.stderr, /first-visit/, 'the refusal must name the seed journeys so the session can pick a real one: ' + notSeed.stderr)
  assert.match(notSeed.stderr, /daily-check/, 'the refusal must name every seed journey: ' + notSeed.stderr)
  assert.ok(endsWithRemedy(notSeed.stderr),
    'the out-of-seed --journey refusal must end with a `remedy: <command>` line: ' + notSeed.stderr)

  stub.setCheck({
    ...fx.checkOk(),
    journeys: [{ id: 'first-visit', title: 'First visit', steps: [], edges: [], resolved: false, unresolved: [{ from: 1, to: 2, reason: 'no control with text "Account" in ConsoleShell' }] }],
  })
  const unresolved = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-drawn', '--journey', 'first-visit'], { env: stub.env() })
  assert.strictEqual(unresolved.status, 2, 'an unresolved edge must refuse journey-drawn before any beats comparison runs: ' + unresolved.stderr)
  assert.match(unresolved.stderr, /step 1 → 2: no control with text "Account" in ConsoleShell/, 'the refusal must print the exact unresolved-edge line: ' + unresolved.stderr)
  assert.ok(endsWithRemedy(unresolved.stderr),
    'the unresolved-edge refusal must end with a `remedy: <command>` line: ' + unresolved.stderr)

  stub.setCheck({
    ...fx.checkOk(),
    journeys: [{
      id: 'first-visit', title: 'First visit', resolved: true, unresolved: [], edges: [],
      steps: [{ screen: 'home', beat: 'I open the app', state: null }, { screen: 'login', beat: 'I sign in', state: 'empty' }],
    }],
  })
  const mismatch = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-drawn', '--journey', 'first-visit'], { env: stub.env() })
  assert.strictEqual(mismatch.status, 2, 'a journey whose check --json steps paraphrase the seed beats must refuse journey-drawn: ' + mismatch.stderr)
  assert.match(mismatch.stderr, /beat 2: seed "I tap Sign in" -> login@empty, journeys\.ts "I sign in" -> login/,
    'the refusal must print the D4-pinned mismatch line exactly, both sides: ' + mismatch.stderr)
  assert.match(mismatch.stderr, /remedy: copy the seed's beats verbatim into src\/journeys\.ts/, 'the refusal must name the exact remedy: ' + mismatch.stderr)

  stub.setCheck({
    ...fx.checkOk(),
    journeys: [{
      id: 'first-visit', title: 'First visit', resolved: true, unresolved: [], edges: [],
      // the first step deliberately omits `state` entirely — D4: undefined/null state are equal.
      steps: [{ screen: 'home', beat: 'I open the app' }, { screen: 'login', beat: 'I tap Sign in', state: 'empty' }],
    }],
  })
  const ledgerBefore = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
  const resolved = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-drawn', '--journey', 'first-visit'], { env: stub.env() })
  assert.strictEqual(resolved.status, 0, 'once the steps equal the seed beats exactly (an absent state equal to state: null), journey-drawn must record: ' + resolved.stderr)
  assert.ok(fx.readStatus(root).journeys['first-visit'].drawn, 'journeys["first-visit"].drawn must be recorded')
  const ledgerAfter = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
  assert.strictEqual(ledgerAfter, ledgerBefore, 'journey-drawn must run no ledger gate — an open invented row must neither refuse nor be rewritten')
})

test('AC-20260917-01-6: `--mark journey-approved` refuses through resolved/beats/journey-thread/absent-verdict/stale-hash in D5 order, then records the client-confirmed beats hash with no approvedAt and no screens entry ever written or read', () => {
  const root = tmpdir('states-ac6-new')
  writeBeatSeed(root, [{
    name: 'first-visit',
    persona: 'Ann opens the app.',
    beats: [
      { beat: 'I open the app', screen: 'home', state: null },
      { beat: 'I tap Sign in', screen: 'login', state: 'empty' },
    ],
  }])
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: null } },
  })
  fx.writeApp(root, { records: [] })
  const openScreenNote = { id: 'N1', screen: 'home', state: null, component: null, key: null, snippet: null, status: 'open', thread: [] }
  fx.writeNotes(root, fx.defaultNotes({ notes: [openScreenNote] }))
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  const mark = () => runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-approved', '--journey', 'first-visit'], { env: stub.env() })

  stub.setCheck({ ...fx.checkOk(), journeys: [{ id: 'first-visit', title: 'First visit', resolved: false, unresolved: [{ from: 1, to: 2, reason: 'x' }], steps: [], edges: [] }] })
  let r = mark()
  assert.strictEqual(r.status, 2, 'resolved:false must refuse journey-approved before any later D5 check: ' + r.stderr)

  const mismatchedSteps = [{ screen: 'home', beat: 'I open the app', state: null }, { screen: 'login', beat: 'I sign in', state: 'empty' }]
  stub.setCheck({ ...fx.checkOk(), journeys: [{ id: 'first-visit', title: 'First visit', resolved: true, unresolved: [], steps: mismatchedSteps, edges: [] }] })
  r = mark()
  assert.strictEqual(r.status, 2, 'a beats mismatch must refuse journey-approved before the journey-thread or approval checks: ' + r.stderr)
  assert.match(r.stderr, /beat 2:/, 'the beats-mismatch refusal must name the first differing beat index: ' + r.stderr)

  const okSteps = [{ screen: 'home', beat: 'I open the app', state: null }, { screen: 'login', beat: 'I tap Sign in', state: 'empty' }]
  stub.setCheck({ ...fx.checkOk(), journeys: [{ id: 'first-visit', title: 'First visit', resolved: true, unresolved: [], steps: okSteps, edges: [] }] })

  fx.writeNotes(root, { ...fx.defaultNotes({ notes: [openScreenNote] }), journeys: { 'first-visit': { status: 'open', thread: [] } } })
  r = mark()
  assert.strictEqual(r.status, 2, 'an open journey conversation must refuse even once the beats match exactly: ' + r.stderr)
  assert.match(r.stderr, /first-visit/, 'the open-thread refusal must name the journey: ' + r.stderr)

  fx.writeNotes(root, { ...fx.defaultNotes({ notes: [openScreenNote] }), journeys: { 'first-visit': { status: 'approved', thread: [] } } })
  r = mark()
  assert.strictEqual(r.status, 2, 'a missing client verdict must refuse, naming both client open and client waive as remedies: ' + r.stderr)
  assert.match(r.stderr, /client open/, 'the absent-verdict refusal must name client open: ' + r.stderr)
  assert.match(r.stderr, /client waive --journey first-visit/, 'the absent-verdict refusal must name the exact client waive remedy: ' + r.stderr)

  fx.writeApproval(root, { ...fx.defaultApproval(), journeys: { 'first-visit': { client: 'ok', beats: 'deadbeef0000' } } })
  r = mark()
  assert.strictEqual(r.status, 2, 'a client-ok verdict whose stored hash no longer matches the seed must refuse, naming both hashes: ' + r.stderr)
  assert.match(r.stderr, /deadbeef0000/, 'the stale-hash refusal must name the stored (stale) hash: ' + r.stderr)
  assert.match(r.stderr, /7c0be20327a0/, 'the stale-hash refusal must name the current seed hash: ' + r.stderr)

  fx.writeApproval(root, { ...fx.defaultApproval(), journeys: { 'first-visit': { client: 'ok', beats: '7c0be20327a0' } } })
  r = mark()
  assert.strictEqual(r.status, 0, 'once the client-ok hash matches the current seed beats, journey-approved must record: ' + r.stderr)
  assert.strictEqual(fx.readStatus(root).journeys['first-visit'].beats, '7c0be20327a0', 'status.json must store the confirmed beats hash, or a later seed edit has nothing to compare against')
  const approvalAfter = fx.readApproval(root)
  assert.strictEqual(approvalAfter.journeys['first-visit'].approvedAt, undefined, 'D5 no longer reads or writes approvedAt on a journey approval')
  assert.deepStrictEqual(approvalAfter.screens, {}, 'D5 never reads or writes a screens entry — a stray one means the driver still depends on the retired screen-approve control')
  assert.strictEqual(fx.readNotes(root).notes[0].status, 'open', 'an open note on a step screen must never block or be touched by journey-approved, proving the D5 chain never reads it')
})

test('AC-20260917-01-7: editing an approved journey\'s beat after the client confirms voids the stored hash and reopens SCREENS to re-approve; an unchanged seed derives THEME instead', () => {
  const root = tmpdir('states-ac7-new')
  const confirmed = [
    { beat: 'I open the app', screen: 'home', state: null },
    { beat: 'I tap Sign in', screen: 'login', state: 'empty' },
  ]
  writeBeatSeed(root, [{ name: 'first-visit', persona: 'Ann opens the app.', beats: confirmed }])
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: iso, beats: '7c0be20327a0' } },
  })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  writeBeatSeed(root, [{
    name: 'first-visit',
    persona: 'Ann opens the app.',
    beats: [{ beat: 'I open the app', screen: 'home', state: null }, { beat: 'I tap Log in', screen: 'login', state: 'empty' }],
  }])
  const state = runNode('scripts/mocks-driver.js', ['--root', root, '--state'], { env: stub.env() })
  assert.match(state.stdout, /SCREENS/, 'a beat edit after client confirmation must reopen SCREENS, or a silently stale confirmation stands: ' + state.stdout)
  const bare = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(bare.stdout, /## Step: approve journey first-visit/, 'the bare run over a voided hash must print the approve-journey step again: ' + bare.stdout)

  writeBeatSeed(root, [{ name: 'first-visit', persona: 'Ann opens the app.', beats: confirmed }])
  const bare2 = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(bare2.stdout, /THEME/, 'an unchanged seed whose beats still hash to the stored value must derive THEME, not re-open SCREENS: ' + bare2.stdout)
})

test('AC-20260917-01-8: `--mark theme-picked` reads no approval.json — it refuses a null config.theme, then a theme absent from check --json themes, then records once the applied theme is listed, and the next run prints THEME\'s close block with no Skill: line', () => {
  const root = tmpdir('states-ac8-new')
  writeBeatSeed(root, [{ name: 'first-visit', persona: 'Ann opens the app.', beats: [{ beat: 'I open the app', screen: 'home', state: null }] }])
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: iso, beats: 'b87021072adb' } },
  })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  const mark = () => runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'theme-picked'], { env: stub.env() })

  stub.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: null }, themes: [] }))
  let r = mark()
  assert.strictEqual(r.status, 2, 'a null config.theme must refuse theme-picked: ' + r.stderr)
  assert.match(r.stderr, /mock\.config\.ts/, 'the null-theme refusal must name mock.config.ts: ' + r.stderr)
  assert.match(r.stderr, /src\/themes\//, 'the null-theme refusal must name src/themes/: ' + r.stderr)

  stub.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: 'warm' }, themes: [] }))
  r = mark()
  assert.strictEqual(r.status, 2, 'a theme applied in mock.config.ts but not listed under check --json themes must refuse, naming it: ' + r.stderr)
  assert.match(r.stderr, /warm/, 'the refusal must name the unlisted theme: ' + r.stderr)

  stub.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: 'warm' }, themes: ['warm'] }))
  fs.unlinkSync(path.join(root, fx.APP, 'design/approval.json'))
  r = mark()
  assert.strictEqual(r.status, 0, 'once check --json reports a listed, non-null theme, theme-picked must record without ever reading approval.json (deleted above): ' + r.stderr)
  assert.ok(fx.readStatus(root).marks.themePicked, 'marks.themePicked must be recorded')
  const next = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(next.stdout, /client open/, "THEME's close block must print client open: " + next.stdout)
  assert.match(next.stdout, /--mark approved/, "THEME's close block must print --mark approved: " + next.stdout)
  assert.doesNotMatch(next.stdout, /Skill:/, "D12: THEME's close block must never carry a Skill: line: " + next.stdout)
})

test('AC-20260917-01-9: `--mark approved` refuses an open note, an answered note, and an answered project note, then on a deferred note and an approved project note records the mark, appends exactly one exclusion row, and a second approved mark after a reopen writes no duplicate', () => {
  const root = tmpdir('states-ac9-new')
  writeBeatSeed(root, [{ name: 'first-visit', persona: 'Ann opens the app.', beats: [{ beat: 'I open the app', screen: 'home', state: null }] }])
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso, themePicked: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: iso, beats: 'b87021072adb' } },
  })
  fx.writeApp(root, {
    records: [],
    theme: 'warm',
    approval: fx.defaultApproval({ journeys: { 'first-visit': { client: 'ok', beats: 'b87021072adb' } } }),
  })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: 'warm' }, themes: ['warm'] }))
  const mark = () => runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'approved'], { env: stub.env() })

  fx.writeNotes(root, fx.defaultNotes({ notes: [{ id: 'n1', screen: 'home', state: null, component: null, key: null, snippet: null, status: 'open', thread: [{ text: 'Export the care plan as PDF' }] }] }))
  let r = mark()
  assert.strictEqual(r.status, 2, 'note n1 open must refuse approved: ' + r.stderr)
  assert.match(r.stderr, /n1/, 'the refusal must name the open note: ' + r.stderr)
  assert.match(r.stderr, /remedy: the client approves or defers it on the link/, 'the open-note refusal must name the exact D7 remedy: ' + r.stderr)

  fx.writeNotes(root, fx.defaultNotes({ notes: [{ id: 'n1', screen: 'home', state: null, component: null, key: null, snippet: null, status: 'answered', thread: [{ text: 'Export the care plan as PDF' }] }] }))
  r = mark()
  assert.strictEqual(r.status, 2, 'note n1 answered (not yet resolved by the client) must still refuse approved: ' + r.stderr)
  assert.match(r.stderr, /remedy: the client approves or defers it on the link/, 'the answered-note refusal must name the exact D7 remedy: ' + r.stderr)

  fx.writeNotes(root, fx.defaultNotes({
    notes: [
      { id: 'n1', screen: 'home', state: null, component: null, key: null, snippet: null, status: 'deferred', thread: [{ text: 'Export the care plan as PDF' }] },
      { id: 'n2', screen: null, state: null, component: null, key: null, snippet: null, status: 'answered', thread: [], project: true },
    ],
  }))
  r = mark()
  assert.strictEqual(r.status, 2, 'an answered project:true note n2 must refuse approved: ' + r.stderr)
  assert.match(r.stderr, /n2/, 'the refusal must name the open project note: ' + r.stderr)

  fx.writeNotes(root, fx.defaultNotes({
    notes: [
      { id: 'n1', screen: 'home', state: null, component: null, key: null, snippet: null, status: 'deferred', thread: [{ text: 'Export the care plan as PDF' }] },
      { id: 'n2', screen: null, state: null, component: null, key: null, snippet: null, status: 'approved', thread: [], project: true },
    ],
  }))
  const today = new Date().toISOString().slice(0, 10)
  r = mark()
  assert.strictEqual(r.status, 0, 'a deferred note and an approved project note must let approved record: ' + r.stderr)
  const ledger = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
  assert.ok(ledger.includes('| X1 | APPROVED | exclusion | Export the care plan as PDF | said-by-user | confirmed ' + today + ' | - | - | deferred: n1 |'),
    'a deferred note must append exactly the D7-pinned exclusion row: ' + ledger)
  const state = runNode('scripts/mocks-driver.js', ['--root', root, '--state'], { env: stub.env() })
  assert.match(state.stdout, /APPROVED/, '--state must print APPROVED once marks.approved is recorded: ' + state.stdout)

  const reopen = runNode('scripts/mocks-driver.js', ['--root', root, '--reopen', 'theme'], { env: stub.env() })
  assert.strictEqual(reopen.status, 0, '--reopen theme must succeed to set up the re-approve leg: ' + reopen.stderr)
  const rePick = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'theme-picked'], { env: stub.env() })
  assert.strictEqual(rePick.status, 0, 're-picking the theme must succeed: ' + rePick.stderr)
  const second = mark()
  assert.strictEqual(second.status, 0, 'a second approved mark after --reopen theme must record again: ' + second.stderr)
  const ledgerAfter = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
  const rows = ledgerAfter.split('\n').filter((l) => l.includes('deferred: n1'))
  assert.strictEqual(rows.length, 1, 'a second --mark approved for the same already-deferred note must never append a duplicate exclusion row: ' + ledgerAfter)

  // Prefix-collision regression: "deferred: n1" is a substring of "deferred: n10" — a bare
  // text.includes() test on the raw ledger wrongly treats n10's already-written row as covering
  // n1 too, silently dropping n1's exclusion row. This must run on a FRESH ledger with n10
  // ordered ahead of n1, so n10's row is written first and n1's guard check runs against a
  // ledger that already contains "deferred: n10" — the exact ordering the substring guard gets
  // wrong (a root that already carries n1's own row first makes both guards agree, which is
  // why reusing `root` here would be an inert pin).
  const root2 = tmpdir('states-ac9-collision')
  writeBeatSeed(root2, [{ name: 'first-visit', persona: 'Ann opens the app.', beats: [{ beat: 'I open the app', screen: 'home', state: null }] }])
  fx.writeLedger(root2)
  fx.writeStatus(root2, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso, themePicked: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: iso, beats: 'b87021072adb' } },
  })
  fx.writeApp(root2, {
    records: [],
    theme: 'warm',
    approval: fx.defaultApproval({ journeys: { 'first-visit': { client: 'ok', beats: 'b87021072adb' } } }),
  })
  const stub2 = fx.installStub(path.join(root2, 'stub-bin'), path.join(root2, 'stub-state'))
  stub2.setContract(fx.contractOk())
  stub2.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: 'warm' }, themes: ['warm'] }))
  const mark2 = () => runNode('scripts/mocks-driver.js', ['--root', root2, '--mark', 'approved'], { env: stub2.env() })

  fx.writeNotes(root2, fx.defaultNotes({
    notes: [
      { id: 'n10', screen: 'home', state: null, component: null, key: null, snippet: null, status: 'deferred', thread: [{ text: 'Print a weekly summary' }] },
      { id: 'n1', screen: 'home', state: null, component: null, key: null, snippet: null, status: 'deferred', thread: [{ text: 'Export the care plan as PDF' }] },
      { id: 'n2', screen: null, state: null, component: null, key: null, snippet: null, status: 'approved', thread: [], project: true },
    ],
  }))
  const collision = mark2()
  assert.strictEqual(collision.status, 0, 'a deferred n10 written ahead of a deferred n1 must let approved record: ' + collision.stderr)
  const ledgerCollision = fs.readFileSync(path.join(root2, 'design/mocks/ledger.md'), 'utf8')
  assert.match(ledgerCollision, /\| deferred: n1 \|/, 'n1 must get its own exclusion row even though "deferred: n1" is a substring of the already-written "deferred: n10": ' + ledgerCollision)
  assert.match(ledgerCollision, /\| deferred: n10 \|/, 'n10 must also get its exclusion row: ' + ledgerCollision)

  const reopen3 = runNode('scripts/mocks-driver.js', ['--root', root2, '--reopen', 'theme'], { env: stub2.env() })
  assert.strictEqual(reopen3.status, 0, '--reopen theme must succeed to set up the no-duplicate-after-collision leg: ' + reopen3.stderr)
  const rePick3 = runNode('scripts/mocks-driver.js', ['--root', root2, '--mark', 'theme-picked'], { env: stub2.env() })
  assert.strictEqual(rePick3.status, 0, 're-picking the theme must succeed for the no-duplicate-after-collision leg: ' + rePick3.stderr)
  const collisionAgain = mark2()
  assert.strictEqual(collisionAgain.status, 0, 'a second approved mark with n1 and n10 still deferred must record again: ' + collisionAgain.stderr)
  const ledgerCollisionAfter = fs.readFileSync(path.join(root2, 'design/mocks/ledger.md'), 'utf8')
  const n1Rows = ledgerCollisionAfter.split('\n').filter((l) => l.includes('| deferred: n1 |'))
  const n10Rows = ledgerCollisionAfter.split('\n').filter((l) => l.includes('| deferred: n10 |'))
  assert.strictEqual(n1Rows.length, 1, 'n1 must never get a duplicate exclusion row on a later approved mark: ' + ledgerCollisionAfter)
  assert.strictEqual(n10Rows.length, 1, 'n10 must never get a duplicate exclusion row on a later approved mark: ' + ledgerCollisionAfter)
})

test('AC-20260914-01-12: `--reopen shell` on an APPROVED root cascades marks and journey approvals, appends a reopens row, and leaves notes/approval byte-identical; `--reopen kit` refuses as retired', () => {
  const root = tmpdir('states-ac12')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso, themePicked: iso, approved: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: iso } },
  })
  fx.writeApp(root, { records: [] })
  const notesBefore = fs.readFileSync(path.join(root, fx.APP, 'design/notes.json'), 'utf8')
  const approvalBefore = fs.readFileSync(path.join(root, fx.APP, 'design/approval.json'), 'utf8')
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  const r = runNode('scripts/mocks-driver.js', ['--root', root, '--reopen', 'shell'], { env: stub.env() })
  assert.strictEqual(r.status, 0, '--reopen shell on a valid target must succeed: ' + r.stderr)
  const status = fx.readStatus(root)
  assert.strictEqual(status.marks.shellDrawn, null, '--reopen shell must clear marks.shellDrawn')
  assert.strictEqual(status.marks.themePicked, null, '--reopen shell must clear marks.themePicked (D10 cascade)')
  assert.strictEqual(status.marks.approved, null, '--reopen shell must clear marks.approved (D10 cascade)')
  assert.strictEqual(status.journeys['first-visit'].approved, null, '--reopen shell must clear every journey\'s approved (D10 cascade)')
  assert.strictEqual(status.reopens.length, 1, '--reopen must append exactly one reopens row')
  assert.strictEqual(status.reopens[0].target, 'shell', 'the reopens row must name the target')
  const cleared = status.reopens[0].cleared
  for (const key of ['shellDrawn', 'themePicked', 'approved']) {
    assert.ok(cleared.includes(key), `the reopens row's cleared list must include ${key}: ` + JSON.stringify(cleared))
  }
  assert.strictEqual(fs.readFileSync(path.join(root, fx.APP, 'design/notes.json'), 'utf8'), notesBefore, 'a reopen must never touch notes.json')
  assert.strictEqual(fs.readFileSync(path.join(root, fx.APP, 'design/approval.json'), 'utf8'), approvalBefore, 'a reopen must never touch approval.json')
  const state = runNode('scripts/mocks-driver.js', ['--root', root, '--state'], { env: stub.env() })
  assert.match(state.stdout, /SHELL/, 'after --reopen shell, --state must print SHELL: ' + state.stdout)

  const kit = runNode('scripts/mocks-driver.js', ['--root', root, '--reopen', 'kit'], { env: stub.env() })
  assert.strictEqual(kit.status, 2, '--reopen kit must refuse — KIT is retired: ' + kit.stderr)
  assert.match(kit.stderr, /retired \(ADR-0028\)/, 'the refusal must name the retirement: ' + kit.stderr)
})

test('AC-20260917-01-10: once every journey is approved the bare run derives THEME both before and after `--mark theme-picked` — never CLIENT — and only SHELL, both SCREENS steps and THEME\'s pick block carry the Skill line', () => {
  const root = tmpdir('states-ac10-new')
  writeBeatSeed(root, [{ name: 'first-visit', persona: 'Ann opens the app.', beats: [{ beat: 'I open the app', screen: 'home', state: null }] }])
  fx.writeLedger(root)
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  const skillLine = 'Skill: mock-authoring — load it before the first edit'

  fx.writeStatus(root, { marks: seedMarks() })
  const seed = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.doesNotMatch(seed.stdout, /Skill:/, 'SEED must never print a Skill: line: ' + seed.stdout)
  assert.doesNotMatch(seed.stdout, /\bCLIENT\b/, 'SEED must never mention the retired CLIENT state: ' + seed.stdout)

  fx.writeStatus(root, { marks: seedMarks({ seedDone: iso }) })
  const shell = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.ok(shell.stdout.includes(skillLine), 'SHELL must print the exact Skill line: ' + shell.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: null, approved: null } },
  })
  const draw = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.ok(draw.stdout.includes(skillLine), 'SCREENS (draw step) must print the exact Skill line: ' + draw.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: null } },
  })
  const approve = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.ok(approve.stdout.includes(skillLine), 'SCREENS (approve step) must print the exact Skill line: ' + approve.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: iso, beats: 'b87021072adb' } },
  })
  const themePick = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(themePick.stdout, /THEME/, 'once every journey is approved the bare run must derive THEME, never CLIENT: ' + themePick.stdout)
  assert.doesNotMatch(themePick.stdout, /\bCLIENT\b/, 'THEME must never mention the retired CLIENT state: ' + themePick.stdout)
  assert.ok(themePick.stdout.includes(skillLine), "THEME's pick block must print the exact Skill line: " + themePick.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso, themePicked: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: iso, beats: 'b87021072adb' } },
  })
  const themeClose = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(themeClose.stdout, /THEME/, 'once the theme is picked but not approved, the bare run must still derive THEME, never CLIENT: ' + themeClose.stdout)
  assert.doesNotMatch(themeClose.stdout, /\bCLIENT\b/, "THEME's close block must never mention the retired CLIENT state: " + themeClose.stdout)
  assert.doesNotMatch(themeClose.stdout, /Skill:/, "THEME's close block must never carry a Skill: line: " + themeClose.stdout)
  assert.match(themeClose.stdout, /client open/, "THEME's close block must print client open: " + themeClose.stdout)
  assert.match(themeClose.stdout, /--mark approved/, "THEME's close block must print --mark approved: " + themeClose.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso, themePicked: iso, approved: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: iso, beats: 'b87021072adb' } },
  })
  const approvedBlock = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.doesNotMatch(approvedBlock.stdout, /Skill:/, 'APPROVED must never print a Skill: line: ' + approvedBlock.stdout)
})

test('AC-20260917-01-11: `client open` requires only one drawn journey (never a CLIENT state), prints the served URL with the config token, refuses on a missing serve URL, and `client waive` writes only that journey\'s client verdict, reason, timestamp and beat hash', () => {
  const root = tmpdir('states-ac11-new')
  writeBeatSeed(root, [{
    name: 'first-visit',
    persona: 'Ann opens the app.',
    beats: [
      { beat: 'I open the app', screen: 'home', state: null },
      { beat: 'I tap Sign in', screen: 'login', state: 'empty' },
    ],
  }])
  fx.writeLedger(root)
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: null, approved: null } },
  })
  stub.setCheck(fx.checkOk({ serve: { url: 'http://127.0.0.1:45980' } }))
  const noDrawn = runNode('scripts/mocks-driver.js', ['--root', root, 'client', 'open'], { env: stub.env() })
  assert.strictEqual(noDrawn.status, 2, 'client open with no journey drawn must refuse: ' + noDrawn.stderr)
  assert.match(noDrawn.stderr, /remedy: --mark journey-drawn --journey/, 'the refusal must name the exact remedy: ' + noDrawn.stderr)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: iso, approved: null } },
  })
  const opened = runNode('scripts/mocks-driver.js', ['--root', root, 'client', 'open'], { env: stub.env() })
  assert.strictEqual(opened.status, 0, 'client open with at least one drawn journey (while --state is SCREENS) must succeed: ' + opened.stderr)
  assert.match(opened.stdout, /http:\/\/127\.0\.0\.1:45980\/\?client=k9/, 'client open must print the exact served URL with the client token query param: ' + opened.stdout)

  stub.setCheck(fx.checkOk({ serve: { url: null } }))
  const notServing = runNode('scripts/mocks-driver.js', ['--root', root, 'client', 'open'], { env: stub.env() })
  assert.strictEqual(notServing.status, 2, 'client open with no running serve process must refuse: ' + notServing.stderr)
  assert.match(notServing.stderr, /remedy: npx mock-review serve/, 'the refusal must name the exact serve remedy: ' + notServing.stderr)

  stub.setCheck(fx.checkOk({ serve: { url: 'http://127.0.0.1:45980' } }))
  const waive = runNode('scripts/mocks-driver.js', ['--root', root, 'client', 'waive', '--journey', 'first-visit', '--reason', 'no client'], { env: stub.env() })
  assert.strictEqual(waive.status, 0, 'client waive over the Contracts seed journey must succeed: ' + waive.stderr)
  const approvalAfter = fx.readApproval(root)
  assert.deepStrictEqual(approvalAfter, {
    contractVersion: 1,
    screens: {},
    journeys: { 'first-visit': { client: 'waived', reason: 'no client', at: approvalAfter.journeys['first-visit'].at, beats: '7c0be20327a0' } },
  }, 'client waive must write exactly {client, reason, at, beats} for that journey and touch nothing else in approval.json: ' + JSON.stringify(approvalAfter))
  assert.ok(approvalAfter.journeys['first-visit'].at, 'client waive must record a timestamp')
})

test('AC-20260914-01-15: every retired verb refuses exit 2 with its exact D11 replacement text', () => {
  const root = tmpdir('states-ac15')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root)
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  const cases = [
    { argv: ['notes', 'open'], text: 'npx mock-review sweep' },
    { argv: ['stop', 'open', 'shapes'], text: 'approvals are recorded on the served page' },
    { argv: ['theme', 'compose', '--direction', 'a'], text: 'author `src/themes/<k>.css`, pick on the page, then `--mark theme-picked`' },
    { argv: ['look', 'home'], text: 'npx mock-review check --look <screen>' },
    { argv: ['look-probe'], text: 'npx mock-review check --look <screen>' },
    { argv: ['--refresh-register'], text: 'retired (ADR-0028)' },
    { argv: ['--mark', 'kit-signed'], text: 'retired (ADR-0028)' },
    { argv: ['--mark', 'shape-picked'], text: 'retired (ADR-0028)' },
    { argv: ['--mark', 'canon-written'], text: 'retired (ADR-0028)' },
    { argv: ['ledger', 'derive'], text: 'retired (ADR-0028)' },
    { argv: ['client', 'log'], text: 'retired (ADR-0028)' },
  ]
  for (const c of cases) {
    const r = runNode('scripts/mocks-driver.js', ['--root', root, ...c.argv], { env: stub.env() })
    assert.strictEqual(r.status, 2, `retired verb ${c.argv.join(' ')} must refuse exit 2: ` + r.stderr)
    assert.ok(r.stderr.includes(c.text), `retired verb ${c.argv.join(' ')} must name its D11 replacement text "${c.text}": ` + r.stderr)
  }

  // A genuinely unknown --mark (never a retired D11 spelling) refuses through the driver's
  // generic dispatch fallthrough, not the D11 table above — pinned here because it exercises the
  // same `--mark <value>` dispatch path as the cases above, and it too must end in a remedy line.
  const unknownMark = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'totally-bogus'], { env: stub.env() })
  assert.strictEqual(unknownMark.status, 2, 'an unknown --mark value must refuse exit 2: ' + unknownMark.stderr)
  assert.ok(endsWithRemedy(unknownMark.stderr),
    'the unknown-`--mark` refusal must end with a `remedy: <command>` line: ' + unknownMark.stderr)
})

test('AC-20260914-01-23: a schemaVersion 1 status.json refuses exit 2 naming the reset remedy and writes nothing', () => {
  const root = tmpdir('states-ac23')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  const oldShape = { schemaVersion: 1, state: 'SHAPES', marks: {} }
  fs.writeFileSync(statusPath(root), JSON.stringify(oldShape, null, 2))
  const before = fs.readFileSync(statusPath(root), 'utf8')

  const r = runNode('scripts/mocks-driver.js', ['--root', root], { env: { ...process.env, PATH: '' } })
  assert.strictEqual(r.status, 2, 'a schemaVersion 1 status.json must refuse rather than be silently reinterpreted: ' + r.stderr)
  assert.match(r.stderr, /schemaVersion 1/, 'the refusal must name the old schema version: ' + r.stderr)
  assert.match(r.stderr, /remedy: rm design\/mocks\/status\.json/, 'the refusal must name the exact reset remedy: ' + r.stderr)
  assert.strictEqual(fs.readFileSync(statusPath(root), 'utf8'), before, 'a schemaVersion 1 refusal must write nothing — status.json must be byte-identical to before the run')
})

// Review rv_25e5d4359af0: deriveState's SCREENS loop iterates the seed's journeys, so a seed
// declaring none makes SCREENS unreachable — the driver walked SEED → SHELL → THEME → CLIENT →
// APPROVED and approved a mock with no screen ever drawn. seed-done is the one gate that can
// still see the empty journey set as an error rather than as a satisfied loop.
test('`--mark seed-done` refuses a seed.md that declares no journeys, naming the remedy and leaving the mark unset', () => {
  const root = tmpdir('states-no-journeys')
  fx.writeSeed(root, { records: ['client'], journeys: [] })
  fx.writeLedger(root)
  fx.writeStatus(root, { marks: seedMarks() })
  fx.writeApp(root, { records: ['client'] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  const r = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'seed-done'], { env: stub.env() })
  assert.strictEqual(r.status, 2, 'a seed declaring no journeys must refuse seed-done rather than let the mock reach APPROVED with no screen drawn: ' + r.stderr)
  assert.match(r.stderr, /declares no journeys/, 'the refusal must name the empty journey set as the cause: ' + r.stderr)
  assert.ok(endsWithRemedy(r.stderr), 'the refusal must end with a remedy naming what to add: ' + r.stderr)
  assert.match(r.stderr, /### <journey>/, 'the remedy must name the exact seed grammar to add: ' + r.stderr)
  assert.strictEqual(fx.readStatus(root).marks.seedDone, null, 'a refused seed-done must leave marks.seedDone unset')

  fx.appendSeedJourney(root, 'first-visit')
  const ok = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'seed-done'], { env: stub.env() })
  assert.strictEqual(ok.status, 0, 'once the seed declares a journey, seed-done must record as before — the new guard must not block a well-formed seed: ' + ok.stderr)
  assert.ok(fx.readStatus(root).marks.seedDone, 'marks.seedDone must be recorded once a journey is declared')
})

test('AC-20260917-01-19: two seed journeys sharing the identical beat "I open the app" -> home both record seed-done and journey-drawn, never refusing on a shared sentence or a shared screen', () => {
  const root = tmpdir('states-ac19')
  writeBeatSeed(root, [
    { name: 'first-visit', persona: 'Ann opens the app.', beats: [{ beat: 'I open the app', screen: 'home', state: null }] },
    { name: 'daily-check', persona: 'Ann checks in daily.', beats: [{ beat: 'I open the app', screen: 'home', state: null }] },
  ])
  fx.writeLedger(root)
  fx.writeStatus(root, { marks: seedMarks() })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  const seedDone = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'seed-done'], { env: stub.env() })
  assert.strictEqual(seedDone.status, 0, 'two journeys sharing the identical beat sentence and screen must never refuse seed-done: ' + seedDone.stderr)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: iso, shellDrawn: iso }),
    journeys: { 'first-visit': { drawn: null, approved: null }, 'daily-check': { drawn: null, approved: null } },
  })
  const step = { screen: 'home', beat: 'I open the app', state: null }
  for (const j of ['first-visit', 'daily-check']) {
    stub.setCheck(fx.checkOk({ journeys: [{ id: j, title: j, resolved: true, unresolved: [], steps: [step], edges: [] }] }))
    const drawn = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-drawn', '--journey', j], { env: stub.env() })
    assert.strictEqual(drawn.status, 0, `journey-drawn for ${j} must never refuse on a shared sentence or a shared screen: ` + drawn.stderr)
    assert.ok(fx.readStatus(root).journeys[j].drawn, `journeys["${j}"].drawn must be recorded: ` + j)
  }
})
