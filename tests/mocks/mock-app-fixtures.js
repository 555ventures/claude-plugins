'use strict'
// specs/20260914/01-the-mock-contract-and-the-driver.md D15: the synthetic mock-app host every
// mocks-driver.js exec test builds against, plus a stub `mock-review` executable that answers
// `contract --json`, `check --json` and `sweep [--json]` from fixture files the test itself
// writes and rewrites between driver runs. The package (`@555-ventures/mock-review`) is never installed
// in this repo — the stub is the only "package" any test here ever spawns.
//
// Layout mirrors the contract's host section (spec/templates/mock/contract.json, D1): the
// driver-owned files (`status.json`, `seed.md`, `ledger.md`) live at the root under
// `design/mocks/`; every reviewer-owned file (`mock.config.ts`, `src/records/*.ts`,
// `design/notes.json`, `design/approval.json`) lives under `<root>/app/` (D3's `status.app`).
//
// What this deliberately does NOT do: parse or validate anything it writes against the
// contract's shapes — that validation is `lib/mock-cli.js`'s own job and is exercised by
// mock-cli.test.js against these same fixtures, not re-proved here.
const fs = require('fs')
const path = require('path')

const APP = 'app'

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true })
}

// design/mocks/seed.md — the beat grammar (D1/File Plan spec/templates/mocks-seed.md row): a
// `## Records` section naming entities by bare label (mapped by the driver to
// `<app>/src/records/<entity>.ts`), then one `### <journey-kebab>` block per journey in seed
// order (the order parseSeedJourneys — spec/scripts/lib/surfaces.js — returns), each a persona
// line followed by numbered `N. "sentence" -> screen[@state]` beats. Every fixture journey here
// carries the one beat `1. "A fixture persona opens the app" -> home` — its beatHash is
// `eff77e5a1211` (sha256 of `A fixture persona opens the app -> home`, first 12 hex; see
// DEFAULT_BEAT_HASH below), so any test needing a journey's stored/confirmed hash to match this
// fixture's own seed can use that constant instead of recomputing it.
const DEFAULT_BEAT_TEXT = 'A fixture persona opens the app'
const DEFAULT_BEAT_HASH = 'eff77e5a1211'

function writeSeed(root, { records = [], journeys = [] } = {}) {
  mkdirp(path.join(root, 'design/mocks'))
  let body = '# Seed — Fixture Product\n\n## Records\n'
  for (const r of records) body += `- ${r}\n`
  body += '\n## Journeys\n\n'
  for (const j of journeys) {
    body += `### ${j}\nA fixture persona does the one thing this journey is for.\n` +
      `1. "${DEFAULT_BEAT_TEXT}" -> home\n\n`
  }
  fs.writeFileSync(path.join(root, 'design/mocks/seed.md'), body)
}

function appendSeedJourney(root, journey) {
  const p = path.join(root, 'design/mocks/seed.md')
  const cur = fs.readFileSync(p, 'utf8')
  fs.writeFileSync(p, cur + `### ${journey}\nA fixture persona does the one thing this journey is for.\n` +
    `1. "${DEFAULT_BEAT_TEXT}" -> home\n\n`)
}

function writeLedger(root) {
  mkdirp(path.join(root, 'design/mocks'))
  fs.writeFileSync(path.join(root, 'design/mocks/ledger.md'),
    '# Provenance ledger — Fixture Product\n\n' +
    '## Assumptions\n\n' +
    '| id | step | kind | claim | tag | status | rejected | dependents | note |\n' +
    '| - | - | - | - | - | - | - | - | - |\n\n' +
    '## Misunderstandings\n\n' +
    '| id | what | step | cost | note |\n' +
    '| - | - | - | - | - |\n')
}

function defaultStatus(overrides = {}) {
  return {
    schemaVersion: 2,
    state: 'SEED',
    app: APP,
    marks: { seedDone: null, shellDrawn: null, themePicked: null, approved: null },
    journeys: {},
    reopens: [],
    lastUpdated: null,
    ...overrides,
  }
}

function writeStatus(root, overrides = {}) {
  mkdirp(path.join(root, 'design/mocks'))
  fs.writeFileSync(path.join(root, 'design/mocks/status.json'),
    JSON.stringify(defaultStatus(overrides), null, 2))
}

function readStatus(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'design/mocks/status.json'), 'utf8'))
}

function defaultNotes(overrides = {}) {
  return { contractVersion: 1, notes: [], journeys: {}, ...overrides }
}

function defaultApproval(overrides = {}) {
  return { contractVersion: 1, screens: {}, journeys: {}, ...overrides }
}

// The app-side host: mock.config.ts, one src/records/<r>.ts per record entity, and the two
// reviewer-owned JSON files. `theme` (string|null) seeds mock.config.ts's `theme` field.
function writeApp(root, { records = [], theme = null, notes, approval } = {}) {
  const appDir = path.join(root, APP)
  mkdirp(path.join(appDir, 'src/records'))
  mkdirp(path.join(appDir, 'design'))
  fs.writeFileSync(path.join(appDir, 'mock.config.ts'),
    'export default {\n' +
    "  name: 'app',\n" +
    '  port: 5180,\n' +
    "  targets: { viewports: ['360x800'], schemes: ['light'] },\n" +
    `  theme: ${theme ? `'${theme}'` : 'null'},\n` +
    "  client: { token: 'k9' },\n" +
    '}\n')
  for (const r of records) {
    fs.writeFileSync(path.join(appDir, 'src/records', `${r}.ts`),
      `export const ${r}s = [{ id: '1' }, { id: '2' }, { id: '3' }]\n`)
  }
  fs.writeFileSync(path.join(appDir, 'design/notes.json'),
    JSON.stringify(defaultNotes(notes), null, 2))
  fs.writeFileSync(path.join(appDir, 'design/approval.json'),
    JSON.stringify(defaultApproval(approval), null, 2))
}

function readNotes(root) {
  return JSON.parse(fs.readFileSync(path.join(root, APP, 'design/notes.json'), 'utf8'))
}

function writeNotes(root, obj) {
  fs.writeFileSync(path.join(root, APP, 'design/notes.json'), JSON.stringify(obj, null, 2))
}

function readApproval(root) {
  return JSON.parse(fs.readFileSync(path.join(root, APP, 'design/approval.json'), 'utf8'))
}

function writeApproval(root, obj) {
  fs.writeFileSync(path.join(root, APP, 'design/approval.json'), JSON.stringify(obj, null, 2))
}

const STUB_SCRIPT = `#!/usr/bin/env bash
set -u
VERB="\${1:-}"
shift || true
STATE="\${MOCK_STUB_DIR:-}"
if [ -z "$STATE" ]; then echo "mock-review: MOCK_STUB_DIR unset" >&2; exit 2; fi
case "$VERB" in
  contract)
    cat "$STATE/contract.json"
    ;;
  check)
    cat "$STATE/check.json"
    ;;
  sweep)
    if printf '%s\\n' "$@" | grep -q -- '--json'; then
      if [ -f "$STATE/sweep.json" ]; then cat "$STATE/sweep.json"; else echo '{"contractVersion":1,"inventory":[],"queue":[]}'; fi
    else
      if [ -f "$STATE/sweep.txt" ]; then cat "$STATE/sweep.txt"; else echo "queue empty"; fi
    fi
    ;;
  answer)
    exit 0
    ;;
  serve)
    if [ -f "$STATE/serve-url.txt" ]; then cat "$STATE/serve-url.txt"; else echo "http://127.0.0.1:0"; fi
    ;;
  *)
    echo "mock-review: unknown verb $VERB" >&2
    exit 2
    ;;
esac
`

// The same stub behaviour behind the shebang the real `@555-ventures/mock-review` bin uses. A shebang
// interpreter is resolved against the spawn's own PATH, so this variant is the one that can
// tell whether spawnEnv's empty-PATH fallback still reaches the node that is already running.
const NODE_STUB_SCRIPT = `#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const [verb, ...rest] = process.argv.slice(2)
const state = process.env.MOCK_STUB_DIR || ''
if (!state) { console.error('mock-review: MOCK_STUB_DIR unset'); process.exit(2) }
const cat = (name, fallback) => {
  const p = path.join(state, name)
  if (fs.existsSync(p)) { process.stdout.write(fs.readFileSync(p, 'utf8')); return }
  if (fallback === undefined) { console.error('mock-review: missing ' + name); process.exit(2) }
  process.stdout.write(fallback)
}
switch (verb) {
  case 'contract': cat('contract.json'); break
  case 'check': cat('check.json'); break
  case 'sweep':
    if (rest.includes('--json')) cat('sweep.json', '{"contractVersion":1,"inventory":[],"queue":[]}')
    else cat('sweep.txt', 'queue empty')
    break
  case 'answer': break
  case 'serve': cat('serve-url.txt', 'http://127.0.0.1:0'); break
  default:
    console.error('mock-review: unknown verb ' + verb)
    process.exit(2)
}
`

// Installs the stub executable at `binDir/mock-review` (caller decides whether that's the app's
// own node_modules/.bin, per the mock-cli test's "only found in the app bin" case, or a scratch
// PATH directory) and returns helpers to (re)write the JSON/text the stub answers with, plus an
// `env()` that prepends `binDir` to PATH and threads `MOCK_STUB_DIR`.
function installStub(binDir, stateDir, { shebang = 'bash' } = {}) {
  mkdirp(binDir)
  mkdirp(stateDir)
  const bin = path.join(binDir, 'mock-review')
  fs.writeFileSync(bin, shebang === 'node' ? NODE_STUB_SCRIPT : STUB_SCRIPT)
  fs.chmodSync(bin, 0o755)
  const writeJson = (name, obj) => fs.writeFileSync(path.join(stateDir, name), JSON.stringify(obj))
  return {
    bin,
    binDir,
    stateDir,
    setContract(obj) { writeJson('contract.json', obj) },
    setCheck(obj) { writeJson('check.json', obj) },
    setSweepJson(obj) { writeJson('sweep.json', obj) },
    setSweepText(text) { fs.writeFileSync(path.join(stateDir, 'sweep.txt'), text) },
    setServeUrl(url) { fs.writeFileSync(path.join(stateDir, 'serve-url.txt'), url) },
    env(extra = {}) {
      return {
        ...process.env,
        PATH: binDir + path.delimiter + process.env.PATH,
        MOCK_STUB_DIR: stateDir,
        ...extra,
      }
    },
  }
}

// The one-call convenience most driver-state tests want: a cold or warm root plus a stub on
// PATH (not the app bin — mock-cli.test.js exercises the app-bin-only case directly) answering
// a default `contractVersion: 1` and a default green `check --json`.
function contractOk(overrides = {}) {
  return { contractVersion: 2, package: '@555-ventures/mock-review', version: '1.0.0', ...overrides }
}

function checkOk(overrides = {}) {
  return {
    contractVersion: 1,
    ok: true,
    findings: [],
    screens: [],
    shells: [],
    journeys: [],
    themes: [],
    config: { name: 'app', port: 5180, targets: {}, theme: null, client: { token: 'k9' } },
    serve: { url: null },
    ...overrides,
  }
}

module.exports = {
  APP,
  DEFAULT_BEAT_TEXT,
  DEFAULT_BEAT_HASH,
  writeSeed,
  appendSeedJourney,
  writeLedger,
  defaultStatus,
  writeStatus,
  readStatus,
  defaultNotes,
  defaultApproval,
  writeApp,
  readNotes,
  writeNotes,
  readApproval,
  writeApproval,
  installStub,
  contractOk,
  checkOk,
}
