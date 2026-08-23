#!/usr/bin/env node
'use strict'
// release-legs.js stage  --root <dir> --manifest <path> [--out-dir <dir>]
// release-legs.js append --manifest <path> --leg journeys   --walked <N> --failed <M>
// release-legs.js append --manifest <path> --leg production --result <verified|skipped|failed>
// release-legs.js record --root <dir> --manifest <path> [--milestone <s>] [--briefs <N,N,...>]
//
// Why (2026-08-23, specs/20260823/01-release-legs.md): /spec:release was a ~10-step prose
// checklist a session re-performed by hand every milestone — deploy, ready check, migrations
// check, CI polling, e2e, hand-printf'd manifest JSON rows, and a verdict.js/ledger call the
// session had to remember on EVERY path, including the paths where it bails. This is release's
// version of what review got in review-legs.js: one script that runs the deterministic legs,
// owns every manifest row append, and owns every `verdict.js --profile release` invocation, so a
// red leg or an abandoned run can no longer leave the ledger silent by omission of a
// hand-performed step.
//
// Row grammar (closed; verdict.js --profile release copies `observed` verbatim — this header is
// the row grammar's one home; release.md cites this script rather than restating it, D11):
//   {"leg":"substrate","exit":0|1,"observed":{"checked":N,"failed":M,"inert":K}}
//   {"leg":"deploy","exit":E,"observed":{"result":"pass"|"fail"}}
//   {"leg":"ready","exit":E,"observed":{"result":"pass"|"fail"}}
//   {"leg":"migrations","exit":E,"observed":{"result":"pass"|"fail"}}     (only when runnable migrationsCheck)
//   {"leg":"ci","exit":0|1,"observed":{"conclusion":"<v>"}|{"status":"in-progress"}|{"unavailable":"no-adapter"|"transient"}}
//   {"leg":"e2e","exit":E,"observed":{"passed":N|{"unavailable":R},"failed":M|{"unavailable":R},
//       "skipped":K|{"unavailable":R}}}   where R = "no-format-declared"|"pattern-no-match"
//   {"leg":"journeys","exit":0|1,"observed":{"walked":N,"failed":M}}      (append-only)
//   {"leg":"production","exit":0|1,"observed":{"result":"verified"|"skipped"|"failed"}}  (append-only)
//
// `stage` runs the deterministic pre-promote legs in dependency order (D2): wave 1 in parallel =
// substrate + ci + deploy (mutually independent — wave-1 results are buffered, not appended,
// until all three settle, so a substrate precondition failure can still guarantee zero rows even
// though ci/deploy already ran); `ready` only after `deploy` exits 0; `migrations` (only when the
// config declares a runnable migrationsCheck) and `e2e` only after `ready` exits 0. A red
// deploy/ready leaves dependent legs unrun — absent rows, never fabricated ones. Every leg is
// blocking on the release profile (verdict.js's release profile treats all seven as required), so
// any red row makes `stage` exit 1 with a `RED_BLOCKING:` summary line naming every red leg.
// Child processes run via review-legs.js's `sh()` discipline (bash -c, cwd = --root,
// NODE_TEST_CONTEXT scrubbed) and their output is retained under --out-dir — a red leg with no
// retained output is undiagnosable.
//
// `append` is the sole emitter for the two session-observed legs (journeys, production): it
// validates the closed grammar, derives the row's exit itself, and refuses (exit 2) a duplicate
// row for any leg already present in the manifest.
//
// `record` is the single `verdict.js --profile release --ledger` invocation point on every path
// (early-leg STOP, red-journeys STOP, declined promote, and the normal close alike). It derives
// `--require migrations` itself from the config (release.migrationsCheck present and not "none" —
// never a caller flag), streams verdict.js's two stdout lines verbatim (the word, then the
// ledger row), appends the ledger row to .claude/spec-runs.jsonl under --root, and exits with
// verdict.js's own exit code.
//
// What this deliberately does NOT do: walk journeys or verify a promoted production deploy
// itself (session judgment via `append`), retry the ci leg past capabilities.ciPoll.timeoutSeconds
// (a still-in-progress row is appended and the run moves on), validate the release manifest's
// individual check kinds (manifest-check.sh's job), touch promoteCommand/productionUrl (Phase 3
// session concerns), or query an MCP server.
//
// Exit codes (all subcommands): 0 = green/recorded (stage: every leg it ran exited green; append:
// the appended row is green; record: verdict.js printed CLEAN) - 1 = red (stage: >=1 leg red,
// `RED_BLOCKING: <legs>` printed; append: the appended row is red; record: verdict.js printed
// GATE_RED/UNVERIFIED) - 2 = usage or precondition failure (unreadable config, missing/incomplete
// release block, missing or invalid .claude/release-manifest.json, unmatched substrate sentinel,
// non-empty --manifest on stage, duplicate leg or malformed --result on append, a spawned child
// dying with a null exit status on record's verdict.js invocation) — every exit 2 names its
// remedy on stderr.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn, spawnSync } = require('child_process')
const { readConfig, CONFIG_RELPATH } = require('./lib/host-config')

function usage() {
  console.error('usage: release-legs.js stage  --root <dir> --manifest <path> [--out-dir <dir>]')
  console.error('       release-legs.js append --manifest <path> --leg journeys   --walked <N> --failed <M>')
  console.error('       release-legs.js append --manifest <path> --leg production --result <verified|skipped|failed>')
  console.error('       release-legs.js record --root <dir> --manifest <path> [--milestone <s>] [--briefs <N,N,...>]')
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

// Whole-payload stdout write immediately before process.exit(): process.stdout.write() truncates
// to 64KB on a pipe (async write, buffer cut before it drains), and a single fs.writeSync call can
// itself return short — the safe pattern is a loop until every byte is written.
function writeAll(fd, str) {
  const buf = Buffer.from(str, 'utf8')
  let written = 0
  while (written < buf.length) written += fs.writeSync(fd, buf, written)
}

const q = (p) => `"${p}"`

// ---- shared child-process discipline (copied from review-legs.js's sh(), D-Behavior) -----------
// bash -c, cwd = the passed root, NODE_TEST_CONTEXT scrubbed, output captured. A signal-killed or
// spawn-failed child collapses to a red leg (exit 1), never a silent pass — mirrors review-legs.js
// exactly so the two scripts' child-process semantics never drift apart.
function sh(cmd, opts = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...opts.env }
    delete env.NODE_TEST_CONTEXT
    const child = spawn('bash', ['-c', cmd], { cwd: opts.cwd, env })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', () => resolve({ code: 127, out, err }))
    child.on('close', code => resolve({ code: code === null ? 1 : code, out, err }))
  })
}

// ---- D5: skip/test-count tri-state routes, copied verbatim from review-legs.js so the two ------
// ---- consumers of these two declared capabilities never read them differently. -----------------
function computeTestsExecuted(output, pattern) {
  if (!pattern || pattern === 'none') return { unavailable: 'no-format-declared' }
  const m = new RegExp(pattern).exec(output)
  return m ? (Number(m[1]) || 0) : { unavailable: 'pattern-no-match' }
}

function computeSkips(output, pattern) {
  if (!pattern || pattern === 'none') return { unavailable: 'no-format-declared' }
  const m = new RegExp(pattern).exec(output)
  return m ? (Number(m[1]) || 0) : { unavailable: 'pattern-no-match' }
}

function readManifestRows(manifestPath) {
  if (!fs.existsSync(manifestPath)) return []
  const rows = []
  for (const line of fs.readFileSync(manifestPath, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* ignored — not this script's job to validate */ }
  }
  return rows
}

function manifestHasRows(manifestPath) {
  if (!fs.existsSync(manifestPath)) return false
  return fs.readFileSync(manifestPath, 'utf8').split('\n').some(l => l.trim())
}

function requireReleaseBlock(config, label) {
  if (!config.release || typeof config.release !== 'object' || Array.isArray(config.release)) {
    console.error(`release-legs.js ${label}: no "release" block in ${CONFIG_RELPATH} under --root — ` +
      `run release.md Phase 0's grounding interview to populate it before running ${label}`)
    process.exit(2)
  }
  return config.release
}

function isRunnableMigrationsCheck(release) {
  return typeof release.migrationsCheck === 'string' && release.migrationsCheck.trim() && release.migrationsCheck !== 'none'
}

// ================================================================================================
// stage
// ================================================================================================

function runSubstrateLeg(root, outDir) {
  return new Promise(resolve => {
    const manifestCheckPath = path.join(__dirname, 'manifest-check.sh')
    const child = spawn('bash', [manifestCheckPath, '--manifest', '.claude/release-manifest.json'], { cwd: root })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    const finish = (code) => {
      fs.writeFileSync(path.join(outDir, 'substrate.txt'), out + err)
      if (code === null) {
        resolve({ fail2: true, message: 'release-legs.js stage: manifest-check.sh died without an exit ' +
          'status (signal-killed, failed to spawn, or output exceeded maxBuffer) — re-run it directly ' +
          'under --root to diagnose' })
        return
      }
      if (code === 5) {
        resolve({ fail2: true, message: 'release-legs.js stage: .claude/release-manifest.json is missing ' +
          'or invalid under --root — build the release manifest per release.md Phase 1, then re-run stage' })
        return
      }
      const m = /TOTAL=(\d+)\s+FAILS=(\d+)\s+INERT=(\d+)/.exec(out)
      if (!m) {
        resolve({ fail2: true, message: 'release-legs.js stage: manifest-check.sh\'s output did not ' +
          'contain the TOTAL=<n> FAILS=<n> INERT=<n> sentinel — cannot trust an unparsed substrate ' +
          'result:\n' + out + err })
        return
      }
      resolve({ row: { leg: 'substrate', exit: code === 0 ? 0 : 1,
        observed: { checked: Number(m[1]), failed: Number(m[2]), inert: Number(m[3]) } } })
    }
    child.on('error', () => finish(null))
    child.on('close', finish)
  })
}

function ciQueryOnce(root) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  const commit = (head.status === 0 && head.stdout ? head.stdout : '').trim() || 'HEAD'
  const r = spawnSync(process.execPath, [path.join(__dirname, 'ci-query.js'), '--commit', commit, '--root', root],
    { encoding: 'utf8' })
  // D4: review-legs.js's exact output->row mapping, copied verbatim so the two ci consumers can
  // never drift apart.
  let observed = { unavailable: 'no-adapter' }, exit = 0
  const line = ((r.stdout) || '').trim().split('\n').pop() || ''
  if (/^unavailable/.test(line)) observed = { unavailable: 'no-adapter' }
  else {
    try {
      const j = JSON.parse(line)
      if (!j.available) observed = { unavailable: j.transient ? 'transient' : 'no-adapter' }
      else if (j.status && j.status !== 'completed') observed = { status: 'in-progress' }
      else { observed = { conclusion: j.conclusion }; exit = /^(failure|timed_out|cancelled)$/.test(j.conclusion) ? 1 : 0 }
    } catch { observed = { unavailable: 'no-adapter' } }
  }
  return { exit, observed }
}

async function runCiLeg(root, capabilities) {
  const poll = (capabilities && capabilities.ciPoll) || {}
  const intervalMs = (Number(poll.intervalSeconds) > 0 ? Number(poll.intervalSeconds) : 30) * 1000
  const timeoutMs = (Number(poll.timeoutSeconds) > 0 ? Number(poll.timeoutSeconds) : 600) * 1000
  const start = Date.now()
  let result = ciQueryOnce(root)
  // D4: exactly ONE ci row is appended per stage run, after the loop resolves — never one row per
  // poll iteration.
  while (result.observed && result.observed.status === 'in-progress' && (Date.now() - start) < timeoutMs) {
    await sleep(intervalMs)
    result = ciQueryOnce(root)
  }
  return { leg: 'ci', exit: result.exit, observed: result.observed }
}

async function runDeployLeg(root, deployCommand, outDir) {
  const r = await sh(deployCommand, { cwd: root })
  fs.writeFileSync(path.join(outDir, 'deploy.txt'), r.out + r.err)
  return { leg: 'deploy', exit: r.code, observed: { result: r.code === 0 ? 'pass' : 'fail' } }
}

// D6: a plain curl probe, retried up to 3 attempts 5s apart, exit 0 iff any attempt succeeds.
// runtime.readyCheck is deliberately NOT reused (it probes local boot, the wrong host for a
// deployed URL). Shells bare `curl` (PATH-resolved), never an absolute path.
async function runReadyLeg(stagingUrl, healthPath) {
  const url = stagingUrl + (healthPath || '')
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync('curl', ['-fsS', '--max-time', '10', url], { encoding: 'utf8' })
    if (r.status === 0) return { leg: 'ready', exit: 0, observed: { result: 'pass' } }
    if (attempt < 3) await sleep(5000)
  }
  return { leg: 'ready', exit: 1, observed: { result: 'fail' } }
}

async function runMigrationsLeg(root, migrationsCheck, outDir) {
  const r = await sh(migrationsCheck, { cwd: root })
  fs.writeFileSync(path.join(outDir, 'migrations.txt'), r.out + r.err)
  return { leg: 'migrations', exit: r.code, observed: { result: r.code === 0 ? 'pass' : 'fail' } }
}

// D5: BASE_URL={stagingUrl} is a shell env-var prefix on the whole e2eCommand, never an option
// passed to spawn — a multi-statement e2eCommand script must see it too.
async function runE2eLeg(root, release, capabilities, outDir) {
  const cmd = `BASE_URL=${q(release.stagingUrl)} ${release.e2eCommand}`
  const r = await sh(cmd, { cwd: root })
  fs.writeFileSync(path.join(outDir, 'e2e.txt'), r.out + r.err)
  const output = r.out + r.err
  const skipped = computeSkips(output, capabilities.skipReportPattern)
  let passed, failed
  if (r.code === 0) {
    failed = 0
    const executed = computeTestsExecuted(output, capabilities.testCountPattern)
    if (typeof executed === 'number' && typeof skipped === 'number') passed = executed - skipped
    else if (typeof executed !== 'number') passed = executed // testCountPattern's own unavailability reason
    else passed = skipped // executed known, skipped unavailable — carry skipped's own reason
  } else {
    // D5: no failure-count format exists as a declared capability — both are unconditionally
    // typed unavailable on a red e2e run.
    passed = { unavailable: 'no-format-declared' }
    failed = { unavailable: 'no-format-declared' }
  }
  return { leg: 'e2e', exit: r.code, observed: { passed, failed, skipped } }
}

async function cmdStage(argv) {
  let root = null, manifest = null, outDir = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') root = argv[++i]
    else if (a === '--manifest') manifest = argv[++i]
    else if (a === '--out-dir') outDir = argv[++i]
    else { usage(); process.exit(2) }
  }
  if (!root || !manifest) { usage(); process.exit(2) }
  root = path.resolve(root)

  const config = readConfig(root)
  const release = requireReleaseBlock(config, 'stage')
  for (const key of ['deployCommand', 'stagingUrl', 'e2eCommand']) {
    if (typeof release[key] !== 'string' || !release[key].trim()) {
      console.error(`release-legs.js stage: release.${key} is missing from ${CONFIG_RELPATH} under ` +
        '--root — run release.md Phase 0\'s grounding interview to populate it')
      process.exit(2)
    }
  }

  // D9: one fresh manifest per release run — a re-run onto a stale manifest would double every
  // leg row and corrupt verdict.js's leg map silently.
  if (manifestHasRows(manifest)) {
    console.error(`release-legs.js stage: --manifest ${manifest} already contains row(s) — start a ` +
      'fresh manifest per release run (a re-run onto a stale manifest would double every leg row)')
    process.exit(2)
  }

  outDir = outDir || fs.mkdtempSync(path.join(os.tmpdir(), 'release-legs-'))
  fs.mkdirSync(outDir, { recursive: true })

  const capabilities = config.capabilities || {}
  const rows = []
  function appendRow(row) {
    rows.push(row)
    fs.appendFileSync(manifest, JSON.stringify(row) + '\n')
  }

  // ---- wave 1 (parallel): substrate + ci + deploy — results buffered until all settle, so a -----
  // ---- substrate precondition failure can still guarantee zero appended rows. --------------------
  const [substrateResult, ciRow, deployRow] = await Promise.all([
    runSubstrateLeg(root, outDir),
    runCiLeg(root, capabilities),
    runDeployLeg(root, release.deployCommand, outDir),
  ])

  if (substrateResult.fail2) {
    console.error(substrateResult.message)
    process.exit(2)
  }
  appendRow(substrateResult.row)
  appendRow(ciRow)
  appendRow(deployRow)

  if (deployRow.exit === 0) {
    const readyRow = await runReadyLeg(release.stagingUrl, release.healthPath)
    appendRow(readyRow)
    if (readyRow.exit === 0) {
      const wave2 = [runE2eLeg(root, release, capabilities, outDir)]
      const runMigrations = isRunnableMigrationsCheck(release)
      if (runMigrations) wave2.push(runMigrationsLeg(root, release.migrationsCheck, outDir))
      const results = await Promise.all(wave2)
      appendRow(results[0])
      if (runMigrations) appendRow(results[1])
    }
  }

  // ---- summary: mirrors review-legs.js's per-leg line, RED_BLOCKING, manifest/outputs footer ----
  const lines = []
  const blocked = []
  for (const row of rows) {
    const red = row.exit !== 0
    if (red) blocked.push(row.leg)
    lines.push(`${red ? '❌' : '✅'} ${row.leg.padEnd(11)} exit=${row.exit} ${JSON.stringify(row.observed)}`)
  }
  lines.push(`manifest: ${manifest}`)
  const outFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.txt')).sort()
  lines.push(`outputs: ${outDir}  (${outFiles.join(', ')})`)
  if (blocked.length) lines.push(`RED_BLOCKING: ${blocked.join(',')}`)
  writeAll(1, lines.join('\n') + '\n')
  process.exit(blocked.length ? 1 : 0)
}

// ================================================================================================
// append — the sole emitter for journeys/production, D7
// ================================================================================================

function cmdAppend(argv) {
  let manifest = null, leg = null, walked = null, failed = null, result = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--manifest') manifest = argv[++i]
    else if (a === '--leg') leg = argv[++i]
    else if (a === '--walked') walked = argv[++i]
    else if (a === '--failed') failed = argv[++i]
    else if (a === '--result') result = argv[++i]
    else { usage(); process.exit(2) }
  }
  if (!manifest || !leg) { usage(); process.exit(2) }
  if (leg !== 'journeys' && leg !== 'production') {
    console.error(`release-legs.js append: --leg must be journeys or production — got ${leg}`)
    process.exit(2)
  }

  let row
  if (leg === 'journeys') {
    const w = Number(walked), f = Number(failed)
    if (!Number.isInteger(w) || w < 0 || !Number.isInteger(f) || f < 0) {
      console.error('release-legs.js append --leg journeys: --walked and --failed must both be ' +
        'non-negative integers')
      process.exit(2)
    }
    row = { leg: 'journeys', exit: f === 0 ? 0 : 1, observed: { walked: w, failed: f } }
  } else {
    if (result !== 'verified' && result !== 'skipped' && result !== 'failed') {
      console.error(`release-legs.js append --leg production: --result must be one of ` +
        `verified|skipped|failed — got ${result}`)
      process.exit(2)
    }
    row = { leg: 'production', exit: result === 'failed' ? 1 : 0, observed: { result } }
  }

  // D7: refuse a duplicate row for any leg already in the manifest.
  if (readManifestRows(manifest).some(r => r.leg === leg)) {
    console.error(`release-legs.js append: manifest ${manifest} already has a ${leg} row — append ` +
      'refuses a duplicate (it would corrupt verdict.js\'s per-leg map)')
    process.exit(2)
  }

  fs.appendFileSync(manifest, JSON.stringify(row) + '\n')
  process.exit(row.exit)
}

// ================================================================================================
// record — the single verdict.js --profile release --ledger invocation point, D8
// ================================================================================================

function cmdRecord(argv) {
  let root = null, manifest = null, milestone = null, briefs = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') root = argv[++i]
    else if (a === '--manifest') manifest = argv[++i]
    else if (a === '--milestone') milestone = argv[++i]
    else if (a === '--briefs') briefs = argv[++i]
    else { usage(); process.exit(2) }
  }
  if (!root || !manifest) { usage(); process.exit(2) }
  root = path.resolve(root)

  const config = readConfig(root)
  const release = requireReleaseBlock(config, 'record')

  const verdictArgs = ['--manifest', manifest, '--profile', 'release', '--ledger']
  if (milestone) verdictArgs.push('--milestone', milestone)
  if (briefs) verdictArgs.push('--briefs', briefs)
  // D8: --require migrations is derived here, never a caller flag.
  if (isRunnableMigrationsCheck(release)) verdictArgs.push('--require', 'migrations')

  const verdictPath = path.join(__dirname, 'verdict.js')
  const r = spawnSync(process.execPath, [verdictPath, ...verdictArgs], { encoding: 'utf8' })
  // The null-exit-status gotcha: spawnSync's status is null when the child is signal-killed,
  // fails to spawn, or overflows maxBuffer — handing that straight to process.exit would exit 0,
  // a fail-open in exactly the place this gate must fail closed.
  if (r.status === null) {
    console.error('release-legs.js record: verdict.js died without an exit status (signal-killed, ' +
      `failed to spawn, or output exceeded maxBuffer) — re-run node ${q(verdictPath)} ` +
      `${verdictArgs.join(' ')} directly to diagnose`)
    process.exit(2)
  }

  if (r.stdout) writeAll(1, r.stdout)
  if (r.stderr) writeAll(2, r.stderr)

  const ledgerLine = (r.stdout || '').split('\n')[1] || ''
  if (ledgerLine.trim()) {
    const claudeDir = path.join(root, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.appendFileSync(path.join(claudeDir, 'spec-runs.jsonl'), ledgerLine.trim() + '\n')
  }
  process.exit(r.status)
}

// ================================================================================================

const [sub, ...rest] = process.argv.slice(2)
if (sub === 'stage') cmdStage(rest).catch(e => { console.error('release-legs.js stage: ' + e.stack); process.exit(2) })
else if (sub === 'append') cmdAppend(rest)
else if (sub === 'record') cmdRecord(rest)
else { usage(); process.exit(2) }
