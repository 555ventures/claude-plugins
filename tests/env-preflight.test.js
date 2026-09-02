'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC, tmpdir, read } = require('./helpers')

// specs/20260815/05-env-preflight.md — runId wf_e4778d03-81b: an unprovisioned
// environment variable reached the gate as an ordinary
// red, indistinguishable from broken code, and burned a full repair round it could not win. This
// pins the new `spec/scripts/env-preflight.js` (D2) by execution against synthetic hosts in
// tmpdir(), plus the doctor.md/design.md doctrine wiring (D4/D3a) by regex over live prose.
// AC-20260815-05-1, -2, -3, -4, -7, -8, -9.

const SCRIPT = path.join(SPEC, 'scripts/env-preflight.js')
const VAR = 'ENV_PREFLIGHT_TEST_DB_URL'
const PROVISION = 'docker compose up -d db'

function host(testEnvValue) {
  const root = fs.realpathSync(tmpdir('envpre'))
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  const config = testEnvValue === undefined ? {} : { testEnv: testEnvValue }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(config))
  return root
}

// Run the script with a caller-controlled environment so the host's real process env (which
// may or may not happen to carry VAR) never leaks into the result.
function run(root, extraEnv, ...args) {
  const cleanEnv = { ...process.env }
  delete cleanEnv[VAR]
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args],
    { encoding: 'utf8', env: { ...cleanEnv, ...extraEnv } })
}

test('AC-20260815-05-1: a declared var absent from the environment exits 1 and prints both the var name and its provision command', () => {
  const root = host([{ var: VAR, provision: PROVISION }])
  const r = run(root, {})
  assert.strictEqual(r.status, 1, `expected exit 1 on a missing declared var, got ${r.status} (stderr: ${r.stderr})`)
  const out = r.stdout + r.stderr
  assert.ok(out.includes(VAR), `output must name the missing variable "${VAR}" so the operator knows what to provision: ${out}`)
  assert.ok(out.includes(PROVISION), `output must print the literal provision command "${PROVISION}" — without it the STOP has no remedy: ${out}`)
})

test('AC-20260815-05-2: every declared var set non-empty exits 0', () => {
  const root = host([{ var: VAR, provision: PROVISION }])
  const r = run(root, { [VAR]: 'postgres://localhost/db' })
  assert.strictEqual(r.status, 0, `expected exit 0 when the declared var is set and non-empty, got ${r.status} (stderr: ${r.stderr})`)
})

test('AC-20260815-05-2: a declared var set to the empty string exits 1 exactly as if it were unset', () => {
  const root = host([{ var: VAR, provision: PROVISION }])
  const r = run(root, { [VAR]: '' })
  assert.strictEqual(r.status, 1, `an empty-string value is the same failure as unset (a stale .env with "${VAR}=" must not read as provisioned) — got ${r.status} (stderr: ${r.stderr})`)
  const out = r.stdout + r.stderr
  assert.ok(out.includes(VAR), `empty-string miss must still name the variable: ${out}`)
})

test('AC-20260815-05-3: no testEnv key in config exits 0 with no miss lines — undeclared hosts stay legacy no-op', () => {
  const root = host(undefined)
  const r = run(root, {})
  assert.strictEqual(r.status, 0, `absent testEnv registry must be a silent no-op, got ${r.status} (stderr: ${r.stderr})`)
})

test('AC-20260815-05-3: an empty testEnv array exits 0 with no miss lines', () => {
  const root = host([])
  const r = run(root, {})
  assert.strictEqual(r.status, 0, `an empty testEnv array declares nothing to check, got ${r.status} (stderr: ${r.stderr})`)
})

test('AC-20260815-05-4: --rules mode exits 3 naming a declared var absent from the rules file\'s ## Test Rules section', () => {
  const root = host([{ var: VAR, provision: PROVISION }])
  const rulesPath = path.join(root, 'rules.md')
  fs.writeFileSync(rulesPath, '## Test Rules\n\nNothing here names any environment variable.\n')
  const r = run(root, {}, '--rules', rulesPath)
  assert.strictEqual(r.status, 3, `a declared var missing from § Test Rules must exit 3 so doctor can flag the prose/registry drift, got ${r.status} (stderr: ${r.stderr})`)
  const out = r.stdout + r.stderr
  assert.ok(out.includes(VAR), `the exit-3 output must name the undocumented variable "${VAR}": ${out}`)
})

test('AC-20260815-05-4: --rules mode exits 0 when the declared var does appear in the ## Test Rules section', () => {
  const root = host([{ var: VAR, provision: PROVISION }])
  const rulesPath = path.join(root, 'rules.md')
  fs.writeFileSync(rulesPath, `## Test Rules\n\n${VAR} gates the db suite: ${PROVISION}\n`)
  const r = run(root, {}, '--rules', rulesPath)
  assert.strictEqual(r.status, 0, `the var is documented in § Test Rules so this must agree cleanly, got ${r.status} (stderr: ${r.stderr})`)
})

test('AC-20260815-05-9: a testEnv registry that is not an array exits 2', () => {
  const root = host('not-an-array')
  const r = run(root, {})
  assert.strictEqual(r.status, 2, `a malformed (non-array) testEnv must be a config defect, not a silent no-op, got ${r.status} (stderr: ${r.stderr})`)
})

test('AC-20260815-05-9: a testEnv row missing "provision" exits 2 naming the offending row', () => {
  const root = host([{ var: VAR }])
  const r = run(root, {})
  assert.strictEqual(r.status, 2, `a row missing "provision" must be a config defect naming the row index, got ${r.status} (stderr: ${r.stderr})`)
  const out = r.stdout + r.stderr
  assert.ok(/0/.test(out), `the exit-2 output must name the offending row (index 0): ${out}`)
})

test('AC-20260815-05-7: doctor doctrine\'s check 6b invokes spec-paths env-preflight with --rules', () => {
  const doctor = read('spec/commands/doctor.md')
  assert.match(doctor, /env-preflight[\s\S]{0,120}--rules|--rules[\s\S]{0,120}env-preflight/,
    'doctor.md check 6b must invoke `spec-paths env-preflight` with `--rules` so the registry↔§ Test Rules ' +
    'cross-check is deterministic instead of a model reading prose — this pin fails while 6b still states ' +
    'only the prose obligation')
})

// AC-20260824-02-3 (specs/20260824/02-design-stage-on-render-gate.md D15, retagged in place
// from AC-20260815-05-8): the driver-stepped body dies with the design-driver state machine —
// D1 rebuilds /spec:design as six steps (preflight → author (direct Sonnet dispatch) → host
// gate → render gate → look → reconcile), so the old `wf-design` invocation step this pin
// named is retired along with the workflow file itself (D2). The pin carries
// AC-20260815-05-8's incident forward onto the new step: an unprovisioned environment must
// never reach the author dispatch.
// `wf-design` is not part of the oracle — a surviving reference
// to a retired literal is exactly the Gotcha this repo's Assumptions call out.
test('AC-20260824-02-3 (AC-20260815-05-8 incident carried forward): design doctrine names env-preflight before the author dispatch step with STOP-on-miss semantics', () => {
  const design = read('spec/commands/design.md')
  assert.match(design, /env-preflight[\s\S]{0,400}(Agent\s*\{model:\s*"sonnet"\}|dispatch)/,
    'design.md\'s six-step body must name env-preflight ahead of the author dispatch step (D3 before D4) ' +
    '— without it, an unprovisioned environment reaches the per-surface Sonnet dispatch exactly like the ' +
    'original salon-os incident on build (AC-20260815-05-8)')
  assert.match(design, /env-preflight[\s\S]{0,400}STOP/,
    'the env-preflight mention must carry STOP-on-miss semantics — a preflight named with no STOP remedy ' +
    'nearby lets an unprovisioned environment continue past it into the author dispatch anyway')
})
