'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260823/01-release-legs.md (2026-08-23): /spec:release's ~10-step prose checklist
// becomes one script, spec/scripts/release-legs.js (stage/append/record), so a red leg or an
// abandoned run can no longer leave the ledger silent by omission of a hand-performed step.
// Pins AC-20260823-01-1 through -14 by executing the real script against synthetic host trees.
//
// Route choices (Gotchas: async spawn vs spawnSync for a stub the CLI must reach):
//  - the staging URL is a REAL child-process HTTP server (spawn, unref'd stdio), never
//    in-process — spawnSync-ing release-legs.js would otherwise deadlock against an in-process
//    stub, and a plain unreachable port cannot prove "≥2 observed attempts" (AC-3).
//  - AC-3's refused-connection leg is proven via a PATH-stubbed `curl` that counts its own
//    invocations to a log file and always exits 1 — a real closed port cannot be *counted*.
//  - AC-7's poll loop is proven via a PATH-stubbed `gh` that reports in-progress on invocation 1
//    and conclusion:success from invocation 2 onward, tracked in a counter file (each poll
//    iteration is a fresh child process, so in-memory state cannot carry the count).
//
// specs/20260830/03-ci-leg-honest-absence.md D4 (2026-08-30, salon-os host-escape report):
// release-legs.js's ci leg copies review-legs.js's ci-query.js -> observed mapping verbatim
// (D4's own text: "literal row identical to the review pin"), so it inherited the same bug — an
// unpushed HEAD's shaUnseen shape mapped to `{"unavailable":"no-adapter"}`, indistinguishable
// from "no CI at all". The AC-20260830-03-4 test below reuses AC-7's `capabilities.forge:
// undefined` trick (JSON.stringify drops the key, so ci-query.js falls through to its dynamic gh
// probe instead of the forge:"none" short-circuit) and a PATH-stubbed `gh` branching on argv
// (--commit empty, --branch <name> a real red run) — the same A5 shim shape ci-query.test.js and
// review-legs.test.js use to pin the fallback that produces this shape in the first place.

const SCRIPT = 'scripts/release-legs.js'

function writeConfig(dir, config) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config, null, 2))
}

function writeReleaseManifest(dir, checks) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/release-manifest.json'), JSON.stringify({ checks }))
}

// TOTAL=2 FAILS=0 INERT=1 — the exact sentinel AC-20260823-01-4 spikes verbatim.
const GREEN_RELEASE_MANIFEST_CHECKS = [
  { claim: 'a verifiable production check', kind: 'exec', target: 'true' },
  { claim: 'an unverifiable-from-this-host check', kind: 'inert', target: 'declared: nothing to verify from here' },
]

function readRows(p) {
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
}

function rowFor(rows, leg) {
  return rows.find(r => r.leg === leg)
}

function writeExecutable(p, content) {
  fs.writeFileSync(p, content)
  fs.chmodSync(p, 0o755)
}

// A directory holding one PATH-stubbed binary named `name` — prepended onto PATH so bash -c
// resolves it before the real one.
function makeStubBin(dir, name, script) {
  const binDir = path.join(dir, '_stubbin')
  fs.mkdirSync(binDir, { recursive: true })
  writeExecutable(path.join(binDir, name), script)
  return binDir
}

function withStubPath(binDir) {
  return { ...process.env, PATH: binDir + path.delimiter + process.env.PATH }
}

// A REAL child-process HTTP server (never in-process — spawnSync-ing release-legs.js against an
// in-process stub would deadlock the parent event loop for the child's whole lifetime). Binds an
// OS-assigned ephemeral port and writes it to portFile once listening, so the test can poll for
// readiness without guessing a fixed port.
function startStagingServer(dir) {
  const serverFile = path.join(dir, '_stub-server.js')
  fs.writeFileSync(serverFile,
    'const http = require("http")\n' +
    'const fs = require("fs")\n' +
    'const server = http.createServer((req, res) => { res.statusCode = 200; res.end("ok") })\n' +
    'server.listen(0, "127.0.0.1", () => { fs.writeFileSync(process.argv[2], String(server.address().port)) })\n')
  const portFile = path.join(dir, '_stub-port')
  const child = spawn(process.execPath, [serverFile, portFile], { stdio: 'ignore' })
  return { child, portFile }
}

async function waitForPort(portFile, timeoutMs = 5000) {
  const start = Date.now()
  while (!fs.existsSync(portFile)) {
    if (Date.now() - start > timeoutMs) throw new Error('staging stub server never became ready: ' + portFile)
    await new Promise(r => setTimeout(r, 20))
  }
  return Number(fs.readFileSync(portFile, 'utf8').trim())
}

// A working synthetic host: git repo (release-legs' ci leg shells `git rev-parse HEAD`), a
// reachable staging server, a green release-manifest, and a release/capabilities config a caller
// can override piecewise. Returns dir/stagingUrl/kill — callers MUST call kill() when done.
async function setupWorkingHost(prefix, { release = {}, capabilities = {}, checks = GREEN_RELEASE_MANIFEST_CHECKS, e2eCommand = 'true' } = {}) {
  const dir = fs.realpathSync(tmpdir(prefix))
  gitRepo(dir)
  const { child, portFile } = startStagingServer(dir)
  const port = await waitForPort(portFile)
  const stagingUrl = `http://127.0.0.1:${port}`
  writeConfig(dir, {
    release: { deployCommand: 'true', stagingUrl, e2eCommand, ...release },
    capabilities: { forge: 'none', ...capabilities },
  })
  writeReleaseManifest(dir, checks)
  return { dir, stagingUrl, kill: () => child.kill() }
}

test('AC-20260823-01-1: stage appends substrate, ci, deploy, ready, and e2e rows and exits 0 against a fully green host with no declared migrationsCheck', async () => {
  const host = await setupWorkingHost('rl-ac1')
  try {
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    assert.strictEqual(r.status, 0,
      'a fully green host (deploy passes, staging reachable, e2e passes, valid release manifest) ' +
      'must make stage exit 0 — a nonzero exit here means a leg the fixture set up to pass is ' +
      'being read as red: ' + r.stdout + ' / ' + r.stderr)
    const rows = readRows(runManifest)
    for (const leg of ['substrate', 'ci', 'deploy', 'ready', 'e2e']) {
      assert.ok(rowFor(rows, leg), leg + ' row is missing from the manifest — a leg that ran ' +
        'must always append its row or later verdict derivation silently treats it as never-run: ' +
        JSON.stringify(rows))
    }
    assert.ok(!rowFor(rows, 'migrations'),
      'migrationsCheck is absent from config — a migrations row here would be fabricated, since ' +
      'no host declared a runnable check: ' + JSON.stringify(rows))
    assert.deepStrictEqual(rowFor(rows, 'deploy'), { leg: 'deploy', exit: 0, observed: { result: 'pass' } },
      'D2/Contracts pin the deploy row grammar byte-for-byte — a shape drift here silently breaks ' +
      'the ledger\'s staging derivation, which reads deploy/ready exit codes alone: ' + JSON.stringify(rowFor(rows, 'deploy')))
  } finally {
    host.kill()
  }
})

test('AC-20260823-01-2: stage appends a red deploy row, appends no ready/migrations/e2e rows, prints RED_BLOCKING naming deploy, and exits 1 when deployCommand fails', async () => {
  const dir = fs.realpathSync(tmpdir('rl-ac2'))
  gitRepo(dir)
  writeConfig(dir, {
    release: { deployCommand: 'false', stagingUrl: 'http://127.0.0.1:1', e2eCommand: 'true' },
    capabilities: { forge: 'none' },
  })
  writeReleaseManifest(dir, GREEN_RELEASE_MANIFEST_CHECKS)
  const runManifest = path.join(dir, 'run-manifest.jsonl')
  const r = runNode(SCRIPT, ['stage', '--root', dir, '--manifest', runManifest, '--out-dir', path.join(dir, 'out')])
  assert.strictEqual(r.status, 1,
    'D2: a red deploy leg is blocking on the release profile — stage must exit 1, never mask a ' +
    'deploy failure as a run-level success: ' + r.stdout + ' / ' + r.stderr)
  const rows = readRows(runManifest)
  assert.deepStrictEqual(rowFor(rows, 'deploy'), { leg: 'deploy', exit: 1, observed: { result: 'fail' } },
    'the deploy row must record the exact grammar for a failed deploy: ' + JSON.stringify(rowFor(rows, 'deploy')))
  for (const leg of ['ready', 'migrations', 'e2e']) {
    assert.ok(!rowFor(rows, leg), 'D2: ready/migrations/e2e only run after a green deploy — a row ' +
      'for ' + leg + ' here means a dependent leg ran over a red deploy, or a fabricated row was ' +
      'appended for a leg that never executed: ' + JSON.stringify(rows))
  }
  assert.match(r.stdout, /RED_BLOCKING:.*deploy/,
    'the summary must print a RED_BLOCKING line naming deploy — without it the run\'s stdout gives ' +
    'no signal about which leg blocked promotion: ' + r.stdout)
})

test('AC-20260823-01-3: stage appends a red ready row and exits 1 after observing at least 2 attempts when the staging URL refuses every connection', { timeout: 30000 }, () => {
  const dir = fs.realpathSync(tmpdir('rl-ac3'))
  gitRepo(dir)
  const curlLog = path.join(dir, 'curl-hits.log')
  // A real closed port would refuse connections but cannot be COUNTED — the ready leg's own
  // curl invocation is stubbed on PATH instead, always refusing (exit 1) and logging one line
  // per invocation, which is what "≥2 observed attempts" is measured against.
  const binDir = makeStubBin(dir, 'curl', '#!/usr/bin/env bash\necho hit >> ' + JSON.stringify(curlLog) + '\nexit 1\n')
  writeConfig(dir, {
    release: { deployCommand: 'true', stagingUrl: 'http://127.0.0.1:1', e2eCommand: 'true' },
    capabilities: { forge: 'none' },
  })
  writeReleaseManifest(dir, GREEN_RELEASE_MANIFEST_CHECKS)
  const runManifest = path.join(dir, 'run-manifest.jsonl')
  const r = runNode(SCRIPT, ['stage', '--root', dir, '--manifest', runManifest, '--out-dir', path.join(dir, 'out')],
    { env: withStubPath(binDir), timeout: 25000 })
  assert.strictEqual(r.status, 1,
    'D6: an always-refused ready check must make stage exit 1 — never a silent pass over an ' +
    'unreachable deployment: ' + r.stdout + ' / ' + r.stderr)
  const rows = readRows(runManifest)
  assert.deepStrictEqual(rowFor(rows, 'ready'), { leg: 'ready', exit: 1, observed: { result: 'fail' } },
    'D6: exhausting all 3 retry attempts must record exit!=0 and {"result":"fail"} — a 0-exit ' +
    'here would fabricate a healthy staging deploy: ' + JSON.stringify(rowFor(rows, 'ready')))
  const hits = fs.existsSync(curlLog) ? fs.readFileSync(curlLog, 'utf8').trim().split('\n').filter(l => l).length : 0
  assert.ok(hits >= 2,
    'D6: the ready leg is retried up to 3 attempts 5s apart — fewer than 2 observed curl ' +
    'invocations means the retry loop gave up on the first refusal instead of actually retrying: ' +
    'observed ' + hits + ' invocation(s)')
})

test('AC-20260823-01-4: stage refuses at exit 2 naming the release-manifest.json remedy when the file is absent, and transcribes the spiked TOTAL=2 FAILS=0 INERT=1 sentinel verbatim when it is valid', async () => {
  // (a) missing .claude/release-manifest.json — fail closed, zero rows appended.
  const dirA = fs.realpathSync(tmpdir('rl-ac4a'))
  gitRepo(dirA)
  writeConfig(dirA, {
    release: { deployCommand: 'true', stagingUrl: 'http://127.0.0.1:1', e2eCommand: 'true' },
    capabilities: { forge: 'none' },
  })
  const runManifestA = path.join(dirA, 'run-manifest.jsonl')
  const rA = runNode(SCRIPT, ['stage', '--root', dirA, '--manifest', runManifestA, '--out-dir', path.join(dirA, 'out')])
  assert.strictEqual(rA.status, 2,
    'D3: a missing .claude/release-manifest.json must fail closed at exit 2 — running the ' +
    'remaining legs over an unverified deliverable substrate would ship a release that never ' +
    'checked its own production readiness: ' + rA.stdout + ' / ' + rA.stderr)
  assert.match(rA.stderr, /release-manifest\.json/,
    'the error must name the missing file so the remedy is discoverable: ' + rA.stderr)
  assert.match(rA.stderr, /Phase 1/,
    'D3: the error must name the release.md Phase 1 remedy (build the release manifest) — ' +
    'without it a stopped session has no route back to a green run: ' + rA.stderr)
  assert.deepStrictEqual(readRows(runManifestA), [],
    'D3: a substrate precondition failure must append zero rows — a partial manifest here would ' +
    'let verdict.js observe legs that never actually ran: ' + JSON.stringify(readRows(runManifestA)))

  // (b) a valid manifest — the sentinel is transcribed verbatim into the substrate row.
  const host = await setupWorkingHost('rl-ac4b')
  try {
    const runManifestB = path.join(host.dir, 'run-manifest.jsonl')
    const rB = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifestB, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifestB)
    assert.deepStrictEqual(rowFor(rows, 'substrate'),
      { leg: 'substrate', exit: 0, observed: { checked: 2, failed: 0, inert: 1 } },
      'D3: the substrate row must transcribe manifest-check.sh\'s TOTAL=2 FAILS=0 INERT=1 ' +
      'sentinel verbatim into {"checked":2,"failed":0,"inert":1} — a hand-counted or re-derived ' +
      'value here can silently drift from the sentinel manifest-check.sh actually printed: ' +
      JSON.stringify(rowFor(rows, 'substrate')) + ' (stage status ' + rB.status + ')')
  } finally {
    host.kill()
  }
})

test('AC-20260823-01-5: stage refuses at exit 2 without appending when --manifest already names a file holding at least one row', () => {
  const dir = fs.realpathSync(tmpdir('rl-ac5'))
  gitRepo(dir)
  writeConfig(dir, {
    release: { deployCommand: 'true', stagingUrl: 'http://127.0.0.1:1', e2eCommand: 'true' },
    capabilities: { forge: 'none' },
  })
  writeReleaseManifest(dir, GREEN_RELEASE_MANIFEST_CHECKS)
  const runManifest = path.join(dir, 'run-manifest.jsonl')
  const priorRow = { leg: 'deploy', exit: 0, observed: { result: 'pass' } }
  fs.writeFileSync(runManifest, JSON.stringify(priorRow) + '\n')
  const before = fs.readFileSync(runManifest, 'utf8')
  const r = runNode(SCRIPT, ['stage', '--root', dir, '--manifest', runManifest, '--out-dir', path.join(dir, 'out')])
  assert.strictEqual(r.status, 2,
    'D9: a --manifest already holding a row means a prior run\'s file was reused — appending ' +
    'onto it would double every leg row and corrupt verdict.js\'s leg map silently: ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(fs.readFileSync(runManifest, 'utf8'), before,
    'D9: the refusal must append nothing — the pre-existing manifest content must be byte-unchanged: ' +
    'before=' + JSON.stringify(before) + ' after=' + JSON.stringify(fs.readFileSync(runManifest, 'utf8')))
})

test('AC-20260823-01-6: stage appends exactly one ci row {"unavailable":"no-adapter"} exit 0 when the host declares capabilities.forge "none"', async () => {
  const host = await setupWorkingHost('rl-ac6', { capabilities: { forge: 'none' } })
  try {
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    const ciRows = rows.filter(r => r.leg === 'ci')
    assert.strictEqual(ciRows.length, 1,
      'D13/D3: a declared "none" forge must still yield exactly one ci row — zero rows would make ' +
      'verdict.js derive UNVERIFIED for a leg the host explicitly declared as inapplicable: ' +
      JSON.stringify(ciRows))
    assert.deepStrictEqual(ciRows[0], { leg: 'ci', exit: 0, observed: { unavailable: 'no-adapter' } },
      'D4/A3: capabilities.forge:"none" must map to the canonical no-adapter row, never a probed ' +
      'or fabricated conclusion: ' + JSON.stringify(ciRows[0]))
  } finally {
    host.kill()
  }
})

test('AC-20260823-01-7: stage appends exactly ONE ci row with conclusion success — never one row per poll iteration — when a PATH-stubbed gh reports in-progress once then completed', async () => {
  const host = await setupWorkingHost('rl-ac7', {
    capabilities: { forge: undefined, ciPoll: { intervalSeconds: 1, timeoutSeconds: 30 } },
  })
  try {
    const ghCountFile = path.join(host.dir, 'gh-count')
    const ghScript =
      '#!/usr/bin/env bash\n' +
      'N=0\n' +
      '[ -f ' + JSON.stringify(ghCountFile) + ' ] && N=$(cat ' + JSON.stringify(ghCountFile) + ')\n' +
      'N=$((N+1))\n' +
      'echo "$N" > ' + JSON.stringify(ghCountFile) + '\n' +
      'if [ "$N" -ge 2 ]; then\n' +
      '  echo \'[{"status":"completed","conclusion":"success","headSha":"abc123","url":"http://example.com/run","updatedAt":"2026-08-23T00:00:00Z"}]\'\n' +
      'else\n' +
      '  echo \'[{"status":"in_progress","conclusion":null,"headSha":"abc123","url":"http://example.com/run","updatedAt":"2026-08-23T00:00:00Z"}]\'\n' +
      'fi\n' +
      'exit 0\n'
    const binDir = makeStubBin(host.dir, 'gh', ghScript)
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')],
      { env: withStubPath(binDir), timeout: 20000 })
    const rows = readRows(runManifest)
    const ciRows = rows.filter(row => row.leg === 'ci')
    assert.strictEqual(ciRows.length, 1,
      'D4: the ci leg must append exactly ONE row after the poll loop resolves — one row per poll ' +
      'iteration would corrupt the leg map (verdict.js keeps last-in-file-wins, but a double append ' +
      'is exactly the corruption D4 exists to prevent): ' + JSON.stringify(ciRows) + ' (stage status ' + r.status + ', stderr ' + r.stderr + ')')
    assert.deepStrictEqual(ciRows[0], { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
      'the single appended row must carry the RESOLVED conclusion (success), not the in-progress ' +
      'status the first poll observed: ' + JSON.stringify(ciRows[0]))
    const ghInvocations = fs.existsSync(ghCountFile) ? Number(fs.readFileSync(ghCountFile, 'utf8').trim()) : 0
    assert.ok(ghInvocations >= 2,
      'setup check: the stub gh must actually have been invoked at least twice (once in-progress, ' +
      'once completed) or this test is not exercising the poll loop at all: ' + ghInvocations)
  } finally {
    host.kill()
  }
})

test('AC-20260823-01-8: stage appends the e2e row with passed = executed - skipped (never the raw executed count) and exports BASE_URL into the child env', async () => {
  const host = await setupWorkingHost('rl-ac8')
  try {
    const e2eScript = path.join(host.dir, 'e2e-stub.sh')
    writeExecutable(e2eScript,
      '#!/usr/bin/env bash\n' +
      'echo "executed 5 tests"\n' +
      'echo "skipped 1 test"\n' +
      'echo "BASE_URL=$BASE_URL"\n' +
      'exit 0\n')
    // Rewrite config on top of the working host with testCountPattern/skipReportPattern declared
    // and e2eCommand pointing at the stub script (a single simple command, so a `VAR=val cmd`
    // prefix release-legs.js builds scopes BASE_URL to the whole script regardless of how many
    // statements the script itself runs).
    writeConfig(host.dir, {
      release: { deployCommand: 'true', stagingUrl: host.stagingUrl, e2eCommand: e2eScript },
      capabilities: {
        forge: 'none',
        testCountPattern: 'executed (\\d+) tests',
        skipReportPattern: 'skipped (\\d+) test',
      },
    })
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const outDir = path.join(host.dir, 'out')
    runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', outDir])
    const rows = readRows(runManifest)
    assert.deepStrictEqual(rowFor(rows, 'e2e'), { leg: 'e2e', exit: 0, observed: { passed: 4, failed: 0, skipped: 1 } },
      'D5 (literal): executed=5, skipped=1 must derive passed=4 (5-1), never the raw executed ' +
      'count — reporting passed=5 here would silently count a known-skipped test as a pass: ' +
      JSON.stringify(rowFor(rows, 'e2e')))
    const e2eOutput = fs.readFileSync(path.join(outDir, 'e2e.txt'), 'utf8')
    assert.match(e2eOutput, new RegExp('BASE_URL=' + host.stagingUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the e2e leg must export BASE_URL={stagingUrl} into the child\'s environment — without it ' +
      'the e2e suite has no way to know which deployment to exercise: ' + e2eOutput)
  } finally {
    host.kill()
  }
})

test('AC-20260823-01-9: stage appends passed as a typed no-format-declared unavailability, never an assumed number, when no testCountPattern is declared', async () => {
  const host = await setupWorkingHost('rl-ac9')
  try {
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    const e2eRow = rowFor(rows, 'e2e')
    assert.ok(e2eRow, 'the e2e leg must still have run and appended a row: ' + JSON.stringify(rows))
    assert.deepStrictEqual(e2eRow.observed.passed, { unavailable: 'no-format-declared' },
      'D5/UPWELL-20260716-02: with no declared testCountPattern, passed must be the typed ' +
      'unavailability object, never an assumed zero or any other invented number: ' +
      JSON.stringify(e2eRow.observed))
    assert.strictEqual(e2eRow.observed.failed, 0,
      'D5: on an exit-0 e2e run, failed is always the literal 0 regardless of whether the ' +
      'passed count could be derived: ' + JSON.stringify(e2eRow.observed))
  } finally {
    host.kill()
  }
})

test('AC-20260823-01-10: append --leg journeys derives exit from --failed (0 -> exit 0, nonzero -> exit 1) and exits with the row\'s own exit code', () => {
  const dir = fs.realpathSync(tmpdir('rl-ac10'))
  const manifestGreen = path.join(dir, 'green.jsonl')
  const rGreen = runNode(SCRIPT, ['append', '--manifest', manifestGreen, '--leg', 'journeys', '--walked', '2', '--failed', '0'])
  assert.strictEqual(rGreen.status, 0,
    'D7: a journeys append with --failed 0 must exit 0 — the appended row is green: ' + rGreen.stdout + ' / ' + rGreen.stderr)
  assert.deepStrictEqual(readRows(manifestGreen), [{ leg: 'journeys', exit: 0, observed: { walked: 2, failed: 0 } }],
    'D7: the appended row must carry the exact journeys grammar with exit 0 when failed is 0: ' +
    JSON.stringify(readRows(manifestGreen)))

  const manifestRed = path.join(dir, 'red.jsonl')
  const rRed = runNode(SCRIPT, ['append', '--manifest', manifestRed, '--leg', 'journeys', '--walked', '2', '--failed', '1'])
  assert.strictEqual(rRed.status, 1,
    'D7: a journeys append with --failed 1 must exit 1 — the appended row is red, and the ' +
    'subcommand\'s own exit must mirror it so a caller can react without re-reading the manifest: ' +
    rRed.stdout + ' / ' + rRed.stderr)
  assert.deepStrictEqual(readRows(manifestRed), [{ leg: 'journeys', exit: 1, observed: { walked: 2, failed: 1 } }],
    'D7: the appended row\'s exit must be 1 when failed > 0: ' + JSON.stringify(readRows(manifestRed)))
})

test('AC-20260823-01-11: append refuses a duplicate leg row without appending, and refuses a production --result outside the closed enum naming it', () => {
  const dir = fs.realpathSync(tmpdir('rl-ac11'))
  const manifest = path.join(dir, 'dup.jsonl')
  const priorRow = { leg: 'journeys', exit: 0, observed: { walked: 1, failed: 0 } }
  fs.writeFileSync(manifest, JSON.stringify(priorRow) + '\n')
  const r = runNode(SCRIPT, ['append', '--manifest', manifest, '--leg', 'journeys', '--walked', '2', '--failed', '0'])
  assert.strictEqual(r.status, 2,
    'D7: appending a leg that already has a manifest row must refuse at exit 2 — a duplicate row ' +
    'would corrupt verdict.js\'s per-leg map: ' + r.stdout + ' / ' + r.stderr)
  assert.strictEqual(readRows(manifest).length, 1,
    'D7: a refused duplicate append must not change the row count: ' + JSON.stringify(readRows(manifest)))

  const manifest2 = path.join(dir, 'enum.jsonl')
  const rEnum = runNode(SCRIPT, ['append', '--manifest', manifest2, '--leg', 'production', '--result', 'bogus'])
  assert.strictEqual(rEnum.status, 2,
    'D7: a production --result outside verified|skipped|failed must refuse at exit 2 — an ' +
    'unvalidated free-text result would let a malformed row reach the release ledger: ' +
    rEnum.stdout + ' / ' + rEnum.stderr)
  assert.match(rEnum.stderr, /verified.*skipped.*failed|failed.*skipped.*verified|verified\|skipped\|failed/,
    'the refusal must name the closed enum so the remedy is discoverable: ' + rEnum.stderr)
})

test('AC-20260823-01-12: stage and record both refuse at exit 2 when the config carries no release block, and stage additionally refuses when the block is missing a required key', () => {
  // (a) stage: no release block at all.
  const dirA = fs.realpathSync(tmpdir('rl-ac12a'))
  gitRepo(dirA)
  writeConfig(dirA, {})
  writeReleaseManifest(dirA, GREEN_RELEASE_MANIFEST_CHECKS)
  const rA = runNode(SCRIPT, ['stage', '--root', dirA, '--manifest', path.join(dirA, 'm.jsonl'), '--out-dir', path.join(dirA, 'out')])
  assert.strictEqual(rA.status, 2,
    'D1/AC-12: stage against a config with no release block must refuse at exit 2 — running ' +
    'legs against undeclared deploy mechanics would invent behavior nothing configured: ' +
    rA.stdout + ' / ' + rA.stderr)
  assert.match(rA.stderr, /Phase 0/,
    'the refusal must name the release.md Phase 0 grounding interview as the remedy: ' + rA.stderr)

  // (b) stage: release block present but missing stagingUrl.
  const dirB = fs.realpathSync(tmpdir('rl-ac12b'))
  gitRepo(dirB)
  writeConfig(dirB, { release: { deployCommand: 'true', e2eCommand: 'true' } })
  writeReleaseManifest(dirB, GREEN_RELEASE_MANIFEST_CHECKS)
  const rB = runNode(SCRIPT, ['stage', '--root', dirB, '--manifest', path.join(dirB, 'm.jsonl'), '--out-dir', path.join(dirB, 'out')])
  assert.strictEqual(rB.status, 2,
    'stage requires deployCommand + stagingUrl + e2eCommand (Contracts) — a release block ' +
    'missing stagingUrl must refuse at exit 2, not silently probe an undefined URL: ' +
    rB.stdout + ' / ' + rB.stderr)
  assert.match(rB.stderr, /stagingUrl/,
    'the refusal must name the missing key: ' + rB.stderr)

  // (c) record: no release block at all.
  const dirC = fs.realpathSync(tmpdir('rl-ac12c'))
  writeConfig(dirC, {})
  const manifestC = path.join(dirC, 'm.jsonl')
  fs.writeFileSync(manifestC, [
    { leg: 'deploy', exit: 0, observed: { result: 'pass' } },
    { leg: 'ready', exit: 0, observed: { result: 'pass' } },
    { leg: 'e2e', exit: 0, observed: { passed: 1, failed: 0, skipped: 0 } },
    { leg: 'journeys', exit: 0, observed: { walked: 1, failed: 0 } },
    { leg: 'substrate', exit: 0, observed: { checked: 1, failed: 0, inert: 0 } },
    { leg: 'production', exit: 0, observed: { result: 'verified' } },
    { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
  ].map(r => JSON.stringify(r)).join('\n') + '\n')
  const rC = runNode(SCRIPT, ['record', '--root', dirC, '--manifest', manifestC])
  assert.strictEqual(rC.status, 2,
    'AC-12: record against a config with no release block must also refuse at exit 2, even ' +
    'over an otherwise-complete manifest — "any subcommand" is not scoped to stage alone: ' +
    rC.stdout + ' / ' + rC.stderr)
})

const RELEASE_SEVEN_GREEN = [
  { leg: 'deploy', exit: 0, observed: { result: 'pass' } },
  { leg: 'ready', exit: 0, observed: { result: 'pass' } },
  { leg: 'e2e', exit: 0, observed: { passed: 10, failed: 0, skipped: 2 } },
  { leg: 'journeys', exit: 0, observed: { walked: 5, failed: 0 } },
  { leg: 'substrate', exit: 0, observed: { checked: 2, failed: 0, inert: 1 } },
  { leg: 'production', exit: 0, observed: { result: 'verified' } },
  { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
]

function writeRunManifest(p, rows) {
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

test('AC-20260823-01-13: record derives --require migrations itself and prints UNVERIFIED, exiting 1, when a runnable migrationsCheck is declared but no migrations row exists', () => {
  const dir = tmpdir('rl-ac13')
  writeConfig(dir, { release: { migrationsCheck: 'npm run migrate:check' } })
  const manifest = path.join(dir, 'm.jsonl')
  writeRunManifest(manifest, RELEASE_SEVEN_GREEN)
  const r = runNode(SCRIPT, ['record', '--root', dir, '--manifest', manifest])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED',
    'D8: record must derive --require migrations itself from a runnable migrationsCheck — a ' +
    'manifest green on all seven base legs but missing the required migrations row must print ' +
    'UNVERIFIED (never a caller-supplied flag, and never a silent CLEAN over an absent leg): ' +
    r.stdout + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1,
    'UNVERIFIED must exit non-zero so a caller cannot mistake it for a recorded success: ' + r.stderr)
})

test('AC-20260823-01-14: record prints CLEAN and appends exactly one row per invocation to .claude/spec-runs.jsonl, copying leg observations verbatim, with no hidden dedup across repeated invocations', () => {
  const dir = tmpdir('rl-ac14')
  writeConfig(dir, { release: {} }) // no migrationsCheck -> no --require, legacy/declined shape
  const manifest = path.join(dir, 'm.jsonl')
  writeRunManifest(manifest, RELEASE_SEVEN_GREEN)
  const ledgerPath = path.join(dir, '.claude', 'spec-runs.jsonl')

  const r1 = runNode(SCRIPT, ['record', '--root', dir, '--manifest', manifest])
  assert.strictEqual(r1.stdout.split('\n')[0], 'CLEAN',
    'D8: a manifest green on all seven base legs with no declared migrationsCheck must derive ' +
    'CLEAN — the legacy/declined path must reach the same word as pre-this-spec verdict.js: ' +
    r1.stdout + ' / ' + r1.stderr)
  const rowsAfterFirst = readRows(ledgerPath)
  assert.strictEqual(rowsAfterFirst.length, 1,
    'record must append exactly ONE row to .claude/spec-runs.jsonl per invocation — zero rows ' +
    'means the STOP/close ledger append this spec exists to make structural never fired: ' +
    JSON.stringify(rowsAfterFirst))
  assert.strictEqual(rowsAfterFirst[0].stage, 'release',
    'the appended row must carry stage:"release" so fleet-reader and doctor can classify it: ' +
    JSON.stringify(rowsAfterFirst[0]))
  assert.deepStrictEqual(rowsAfterFirst[0].substrate, { checked: 2, failed: 0, inert: 1 },
    'D3/verdict.js: the substrate leg\'s observed object must be copied into the ledger row ' +
    'verbatim, never re-derived: ' + JSON.stringify(rowsAfterFirst[0]))

  const r2 = runNode(SCRIPT, ['record', '--root', dir, '--manifest', manifest])
  assert.strictEqual(r2.stdout.split('\n')[0], 'CLEAN', 'a second record over the same manifest must derive the same word: ' + r2.stdout)
  const rowsAfterSecond = readRows(ledgerPath)
  assert.strictEqual(rowsAfterSecond.length, 2,
    'a second record invocation must append exactly one MORE row (no hidden dedup) — the ledger ' +
    'is an append-only run history, not a keyed upsert: ' + JSON.stringify(rowsAfterSecond))
})

test('AC-20260830-03-4: the release ci leg maps ci-query.js\'s shaUnseen shape to the same {"unavailable":"sha-unseen",branch,branchConclusion} row at exit 0 as the review leg', async () => {
  // capabilities.forge: undefined (JSON.stringify drops it) puts ci-query.js in legacy dynamic-
  // probe mode, same as AC-20260823-01-7 above; setupWorkingHost's gitRepo(dir) carries no remote
  // at all, so HEAD is unpushed by construction.
  const host = await setupWorkingHost('rl-shaunseen', { capabilities: { forge: undefined } })
  try {
    const ghScript =
      '#!/usr/bin/env bash\n' +
      'if [[ "$*" == *"--commit"* ]]; then\n' +
      "  echo '[]'\n" +
      'elif [[ "$*" == *"--branch"* ]]; then\n' +
      '  echo \'[{"status":"completed","conclusion":"failure","headSha":"abc","url":"u","updatedAt":"t"}]\'\n' +
      'fi\n'
    const binDir = makeStubBin(host.dir, 'gh', ghScript)
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')],
      { env: withStubPath(binDir) })
    const rows = readRows(runManifest)
    assert.deepStrictEqual(rowFor(rows, 'ci'),
      { leg: 'ci', exit: 0, observed: { unavailable: 'sha-unseen', branch: 'main', branchConclusion: 'failure' } },
      'D4: release-legs.js\'s ci leg must copy review-legs.js\'s exact sha-unseen mapping (D4\'s own literal ' +
      'row, identical to the review pin) — an unpushed HEAD with a real red origin run must never redden the ' +
      'release ci leg (the never-block ruling) nor collapse to the pre-spec {"unavailable":"no-adapter"} ' +
      'label that hides the salon-os condition: ' + JSON.stringify(rowFor(rows, 'ci')) +
      ' (stage status ' + r.status + ', stderr ' + r.stderr + ')')
  } finally {
    host.kill()
  }
})
