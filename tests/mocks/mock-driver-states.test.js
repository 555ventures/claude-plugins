'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const fx = require('./mock-app-fixtures')

// specs/20260914/01-the-mock-contract-and-the-driver.md D3-D12, D16: mocks-driver.js rewritten
// over SEED -> SHELL -> SCREENS -> THEME -> CLIENT -> APPROVED, deriving state from
// design/mocks/status.json (schemaVersion 2) plus disk. Each test below pins one AC's exact
// WHEN/THEN chain; the pre-image driver has none of this state machine, so every case is red.

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
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z' }),
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
    s.journeys['first-visit'] = { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' }
    s.journeys['daily-check'] = { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' }
  })
  fx.appendSeedJourney(root, 'onboarding')
  const state = runNode('scripts/mocks-driver.js', ['--root', root, '--state'], { env: stub.env() })
  assert.match(state.stdout, /SCREENS/, 'a journey added to the seed mid-SCREENS must reopen the SCREENS state rather than skip straight to THEME: ' + state.stdout)
  const drawOnboarding = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(drawOnboarding.stdout, /draw journey onboarding/, 'the plain run must print the newly added journey to draw: ' + drawOnboarding.stdout)
})

test('AC-20260914-01-7: `--mark journey-drawn` refuses an unknown check journey, an out-of-seed --journey, and an unresolved edge, then records drawn with no ledger gate', () => {
  const root = tmpdir('states-ac7')
  fx.writeSeed(root, { records: [], journeys: ['first-visit', 'daily-check'] })
  fx.writeLedger(root)
  fs.appendFileSync(path.join(root, 'design/mocks/ledger.md'),
    '| A1 | SCREENS | product | invented claim | invented | open | - | - | - |\n')
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z' }),
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
    'the out-of-seed --journey refusal must end with a `remedy: <command>` line — a session that typos a journey name still needs a next command, not just the seed list: ' + notSeed.stderr)

  stub.setCheck({
    ...fx.checkOk(),
    journeys: [{ id: 'first-visit', title: 'First visit', steps: [], edges: [], resolved: false, unresolved: [{ from: 1, to: 2, reason: 'no control with text "Account" in ConsoleShell' }] }],
  })
  const unresolved = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-drawn', '--journey', 'first-visit'], { env: stub.env() })
  assert.strictEqual(unresolved.status, 2, 'an unresolved edge must refuse journey-drawn: ' + unresolved.stderr)
  assert.match(unresolved.stderr, /step 1 → 2: no control with text "Account" in ConsoleShell/, 'the refusal must print the exact unresolved-edge line: ' + unresolved.stderr)
  assert.ok(endsWithRemedy(unresolved.stderr),
    'the unresolved-edge refusal must end with a `remedy: <command>` line — a journey stuck on an unresolved edge needs a next command, not just a diagnosis: ' + unresolved.stderr)

  stub.setCheck({
    ...fx.checkOk(),
    journeys: [{ id: 'first-visit', title: 'First visit', steps: [], edges: [], resolved: true, unresolved: [] }],
  })
  const ledgerBefore = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
  const resolved = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-drawn', '--journey', 'first-visit'], { env: stub.env() })
  assert.strictEqual(resolved.status, 0, 'a resolved journey must record drawn: ' + resolved.stderr)
  assert.ok(fx.readStatus(root).journeys['first-visit'].drawn, 'journeys["first-visit"].drawn must be recorded')
  const ledgerAfter = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8')
  assert.strictEqual(ledgerAfter, ledgerBefore, 'journey-drawn must run no ledger gate — an open invented row must neither refuse nor be rewritten')
})

test('AC-20260914-01-8: `--mark journey-approved` refuses through the approvedAt/screen/notes/project-note/journey-thread chain, then records approved once every condition clears', () => {
  const root = tmpdir('states-ac8')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: null } },
  })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck({
    ...fx.checkOk(),
    journeys: [{ id: 'first-visit', title: 'First visit', steps: [{ screen: 'console-home' }], edges: [], resolved: true, unresolved: [] }],
  })
  const mark = () => runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'journey-approved', '--journey', 'first-visit'], { env: stub.env() })

  let r = mark()
  assert.strictEqual(r.status, 2, 'missing approval.journeys["first-visit"].approvedAt must refuse: ' + r.stderr)
  assert.match(r.stderr, /approvedAt/, 'the refusal must name the missing key: ' + r.stderr)

  fx.writeApproval(root, fx.defaultApproval({ journeys: { 'first-visit': { approvedAt: '2026-09-14T00:00:00.000Z', client: null } } }))
  r = mark()
  assert.strictEqual(r.status, 2, 'a step screen missing its own approvedAt must still refuse: ' + r.stderr)
  assert.match(r.stderr, /console-home/, 'the refusal must name the unapproved screen: ' + r.stderr)

  fx.writeApproval(root, {
    ...fx.readApproval(root),
    screens: { 'console-home': { hash: 'h1', approvedAt: '2026-09-14T00:00:00.000Z', states: [], viewports: [], schemes: [], screenshots: [] } },
  })
  fx.writeNotes(root, fx.defaultNotes({ notes: [{ id: 'N002', screen: 'console-home', state: null, component: null, key: null, snippet: null, status: 'open', thread: [] }] }))
  r = mark()
  assert.strictEqual(r.status, 2, 'an open note on one of the approved journey\'s screens must refuse: ' + r.stderr)
  assert.match(r.stderr, /N002/, 'the refusal must name the open note\'s id: ' + r.stderr)

  fx.writeNotes(root, fx.defaultNotes({
    notes: [
      { id: 'N002', screen: 'console-home', state: null, component: null, key: null, snippet: null, status: 'answered', thread: [] },
      { id: 'P1', screen: null, state: null, component: null, key: null, snippet: null, status: 'open', thread: [], project: true },
    ],
  }))
  r = mark()
  assert.strictEqual(r.status, 2, 'an open project:true note must refuse regardless of which screen it sits on: ' + r.stderr)
  assert.match(r.stderr, /P1/, 'the refusal must name the open project note\'s id: ' + r.stderr)

  fx.writeNotes(root, fx.defaultNotes({
    notes: [
      { id: 'N002', screen: 'console-home', state: null, component: null, key: null, snippet: null, status: 'answered', thread: [] },
      { id: 'P1', screen: null, state: null, component: null, key: null, snippet: null, status: 'approved', thread: [], project: true },
    ],
    journeys: { 'first-visit': { status: 'open', thread: [] } },
  }))
  r = mark()
  assert.strictEqual(r.status, 2, 'an open journey conversation thread must refuse even with every screen and note otherwise clear: ' + r.stderr)
  assert.match(r.stderr, /first-visit/, 'the refusal must name the open journey: ' + r.stderr)

  fx.writeNotes(root, fx.defaultNotes({
    notes: [
      { id: 'N002', screen: 'console-home', state: null, component: null, key: null, snippet: null, status: 'answered', thread: [] },
      { id: 'P1', screen: null, state: null, component: null, key: null, snippet: null, status: 'approved', thread: [], project: true },
    ],
    journeys: { 'first-visit': { status: 'approved', thread: [] } },
  }))
  r = mark()
  assert.strictEqual(r.status, 0, 'once every D7 condition clears, journey-approved must record: ' + r.stderr)
  assert.ok(fx.readStatus(root).journeys['first-visit'].approved, 'journeys["first-visit"].approved must be recorded')
})

test('AC-20260914-01-9: `--mark theme-picked` refuses a missing approval.theme, then a config theme mismatch, then records the mark and the next run is a CLIENT block with no Skill: line', () => {
  const root = tmpdir('states-ac9')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' } },
  })
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  const mark = () => runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'theme-picked'], { env: stub.env() })

  stub.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: null }, themes: [] }))
  let r = mark()
  assert.strictEqual(r.status, 2, 'a missing approval.theme must refuse theme-picked: ' + r.stderr)
  assert.match(r.stderr, /approval\.theme/, 'the refusal must name approval.theme: ' + r.stderr)
  assert.ok(endsWithRemedy(r.stderr),
    'the missing-approval.theme refusal must end with a `remedy: <command>` line — a session with no theme picked yet still needs a next command named: ' + r.stderr)

  fx.writeApproval(root, { ...fx.defaultApproval(), theme: 'warm' })
  r = mark()
  assert.strictEqual(r.status, 2, 'a picked theme not yet applied in mock.config.ts (config.theme still null) must refuse: ' + r.stderr)
  assert.match(r.stderr, /remedy: set theme: "warm" in mock\.config\.ts/, 'the refusal must name the exact remedy: ' + r.stderr)

  stub.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: 'warm' }, themes: ['warm'] }))
  r = mark()
  assert.strictEqual(r.status, 0, 'once config.theme matches the approved theme, theme-picked must record: ' + r.stderr)
  assert.ok(fx.readStatus(root).marks.themePicked, 'marks.themePicked must be recorded')
  const next = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.match(next.stdout, /CLIENT/, 'the next run must print the CLIENT block: ' + next.stdout)
  assert.doesNotMatch(next.stdout, /Skill:/, 'D12: CLIENT never carries a Skill: line: ' + next.stdout)
})

test('AC-20260914-01-10: `--mark approved` refuses a journey with no client verdict, then an open note, then records approved and --state prints APPROVED', () => {
  const root = tmpdir('states-ac10')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z', themePicked: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' } },
  })
  fx.writeApp(root, { records: [], theme: 'warm' })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk({ config: { ...fx.checkOk().config, theme: 'warm' } }))
  const mark = () => runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'approved'], { env: stub.env() })

  fx.writeApproval(root, { ...fx.defaultApproval(), journeys: { 'first-visit': { approvedAt: '2026-09-14T00:00:00.000Z', client: null } }, theme: 'warm' })
  let r = mark()
  assert.strictEqual(r.status, 2, 'a journey with no recorded client verdict must refuse approved: ' + r.stderr)
  assert.match(r.stderr, /first-visit/, 'the refusal must name the journey missing a client verdict: ' + r.stderr)
  assert.match(r.stderr, /remedy: client waive --journey <j> --reason <r>/, 'the refusal must name the exact waive remedy: ' + r.stderr)

  fx.writeApproval(root, { ...fx.readApproval(root), journeys: { 'first-visit': { approvedAt: '2026-09-14T00:00:00.000Z', client: 'ok' } } })
  fx.writeNotes(root, fx.defaultNotes({ notes: [{ id: 'N009', screen: 'console-home', state: null, component: null, key: null, snippet: null, status: 'open', thread: [] }] }))
  r = mark()
  assert.strictEqual(r.status, 2, 'an open note anywhere must refuse approved even with every journey client-verdicted: ' + r.stderr)
  assert.match(r.stderr, /N009/, 'the refusal must name the open note: ' + r.stderr)

  fx.writeNotes(root, fx.defaultNotes())
  r = mark()
  assert.strictEqual(r.status, 0, 'with every journey client-verdicted and nothing open, approved must record: ' + r.stderr)
  const state = runNode('scripts/mocks-driver.js', ['--root', root, '--state'], { env: stub.env() })
  assert.match(state.stdout, /APPROVED/, '--state must print APPROVED once marks.approved is recorded: ' + state.stdout)
})

test('AC-20260914-01-12: `--reopen shell` on an APPROVED root cascades marks and journey approvals, appends a reopens row, and leaves notes/approval byte-identical; `--reopen kit` refuses as retired', () => {
  const root = tmpdir('states-ac12')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z', themePicked: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' } },
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

test('AC-20260914-01-13: SHELL, SCREENS and THEME blocks carry the mock-authoring Skill line; SEED, CLIENT and APPROVED never do', () => {
  const root = tmpdir('states-ac13')
  fx.writeSeed(root, { records: [], journeys: ['first-visit'] })
  fx.writeLedger(root)
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())
  stub.setCheck(fx.checkOk())

  const skillLine = 'Skill: mock-authoring — load it before the first edit'

  fx.writeStatus(root, { marks: seedMarks() })
  const seed = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.doesNotMatch(seed.stdout, /Skill:/, 'SEED must never print a Skill: line: ' + seed.stdout)

  fx.writeStatus(root, { marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z' }) })
  const shell = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.ok(shell.stdout.includes(skillLine), 'SHELL must print the exact Skill line: ' + shell.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: null, approved: null } },
  })
  const screens = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.ok(screens.stdout.includes(skillLine), 'SCREENS must print the exact Skill line: ' + screens.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' } },
  })
  const theme = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.ok(theme.stdout.includes(skillLine), 'THEME must print the exact Skill line: ' + theme.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z', themePicked: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' } },
  })
  const client = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.doesNotMatch(client.stdout, /Skill:/, 'CLIENT must never print a Skill: line: ' + client.stdout)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z', themePicked: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' } },
  })
  const approvedBlock = runNode('scripts/mocks-driver.js', ['--root', root], { env: stub.env() })
  assert.doesNotMatch(approvedBlock.stdout, /Skill:/, 'APPROVED must never print a Skill: line: ' + approvedBlock.stdout)
})

test('AC-20260914-01-14: `client open` prints the served URL with the config token, refuses when serve.url is null or run outside CLIENT, and `client waive` writes only that journey\'s client verdict', () => {
  const root = tmpdir('states-ac14')
  fx.writeSeed(root, { records: [], journeys: ['first-visit', 'daily-check'] })
  fx.writeLedger(root)
  fx.writeApp(root, { records: [] })
  const stub = fx.installStub(path.join(root, 'stub-bin'), path.join(root, 'stub-state'))
  stub.setContract(fx.contractOk())

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z', themePicked: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' }, 'daily-check': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' } },
  })
  stub.setCheck(fx.checkOk({ serve: { url: 'http://127.0.0.1:45980' }, config: { ...fx.checkOk().config, client: { token: 'k9' } } }))
  const opened = runNode('scripts/mocks-driver.js', ['--root', root, 'client', 'open'], { env: stub.env() })
  assert.strictEqual(opened.status, 0, 'client open with a running serve URL must succeed: ' + opened.stderr)
  assert.match(opened.stdout, /http:\/\/127\.0\.0\.1:45980\/\?client=k9/, 'client open must print the exact served URL with the client token query param: ' + opened.stdout)

  stub.setCheck(fx.checkOk({ serve: { url: null } }))
  const notServing = runNode('scripts/mocks-driver.js', ['--root', root, 'client', 'open'], { env: stub.env() })
  assert.strictEqual(notServing.status, 2, 'client open with no running serve process must refuse: ' + notServing.stderr)
  assert.match(notServing.stderr, /remedy: npx mock-review serve/, 'the refusal must name the exact serve remedy: ' + notServing.stderr)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: null, approved: null }, 'daily-check': { drawn: null, approved: null } },
  })
  const wrongState = runNode('scripts/mocks-driver.js', ['--root', root, 'client', 'open'], { env: stub.env() })
  assert.strictEqual(wrongState.status, 2, 'client open outside CLIENT must refuse: ' + wrongState.stderr)
  assert.match(wrongState.stderr, /CLIENT/, 'the refusal must name the CLIENT state it requires: ' + wrongState.stderr)

  fx.writeStatus(root, {
    marks: seedMarks({ seedDone: '2026-09-14T00:00:00.000Z', shellDrawn: '2026-09-14T00:00:00.000Z', themePicked: '2026-09-14T00:00:00.000Z' }),
    journeys: { 'first-visit': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' }, 'daily-check': { drawn: '2026-09-14T00:00:00.000Z', approved: '2026-09-14T00:00:00.000Z' } },
  })
  const approvalBefore = fx.defaultApproval({ journeys: { 'first-visit': { approvedAt: '2026-09-14T00:00:00.000Z', client: 'ok' } }, theme: 'warm' })
  fx.writeApproval(root, approvalBefore)
  const waive = runNode('scripts/mocks-driver.js', ['--root', root, 'client', 'waive', '--journey', 'daily-check', '--reason', 'no reply in 7 days'], { env: stub.env() })
  assert.strictEqual(waive.status, 0, 'client waive with a valid seed journey must succeed: ' + waive.stderr)
  const approvalAfter = fx.readApproval(root)
  assert.strictEqual(approvalAfter.journeys['daily-check'].client, 'waived', 'client waive must set that journey\'s client to "waived"')
  assert.strictEqual(approvalAfter.journeys['daily-check'].reason, 'no reply in 7 days', 'client waive must record the given reason')
  assert.ok(approvalAfter.journeys['daily-check'].at, 'client waive must record a timestamp')
  assert.deepStrictEqual(approvalAfter.journeys['first-visit'], approvalBefore.journeys['first-visit'], 'client waive must leave every other journey\'s approval untouched')
  assert.strictEqual(approvalAfter.theme, 'warm', 'client waive must leave every other top-level key of approval.json untouched')
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
    'the unknown-`--mark` refusal must end with a `remedy: <command>` line — a session that typos a mark name still needs a next command, not just "is unknown": ' + unknownMark.stderr)
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
