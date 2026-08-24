#!/usr/bin/env node
'use strict'
// review-legs.js --root <dir> --spec <path> --base <ref> --manifest <path>
//   [--skips <file>] [--fix-delta] [--out-dir <dir>]
//
// Why (2026-08-17, v7 redesign): /spec:review Phase 0 was ~2 pages of leg choreography a
// session re-performed by hand every review — resolve the gate, launch five background legs,
// append JSONL rows, remember which legs feed which. Every step was deterministic; none needed
// a model. This script IS that phase: it runs every deterministic review leg, appends one JSONL
// row per leg to --manifest (the evidence manifest verdict.js derives from), and prints a
// red/green summary. The leg scripts (scope-reconcile.js, smoke.sh, ci-query.js, ac-matrix.js)
// are reused as-is — this file only orchestrates.
//
// Legs and row shapes (verdict.js's REVIEW_LEGS; observed is always a typed JSON object per
// specs/20260820/06-typed-evidence-manifest.md D1/D2 — the Contracts block there is the closed
// set, reproduced here for orientation):
//   reconcile      {"leg":"reconcile","exit":<0|3>,"observed":{"outOfPlan":N,"files":[…],
//                  "filesOmitted":M?}} — files is scope-reconcile's outOfPlan path array VERBATIM
//                  and in its order, always present ([] when N is 0), capped at 40 entries;
//                  filesOmitted is added only when N > 40 (specs/20260824/06-review-range-
//                  identity.md D5). verdict.js's countLegFinding reads outOfPlan only, never
//                  files.length.
//   gate           {"leg":"gate","exit":<code>,"observed":{"skips":N,"todos":N,"testsExecuted":N|
//                  {"unavailable":"pattern-no-match"|"no-format-declared"}}} — skips itself takes
//                  the same {"unavailable":...} shape (then no "todos" key) when skipReportPattern
//                  is absent/"none" or declared-but-unmatched; a gate that never ran at all (no
//                  {testDirs} resolution) appends the whole-row alternative
//                  {"unavailable":"gate-unresolvable","detail":"<reason>"}, exit 1
//   smoke          {"leg":"smoke","exit":<code>,"observed":{"result":"pass"|"inert"|"fail"}}
//   ci             {"leg":"ci","exit":<0|1>,"observed":{"conclusion":"<v>"}|{"status":"in-progress"}|
//                  {"unavailable":"no-adapter"|"transient"}}
//   at-risk        {"leg":"at-risk","exit":<code>,"observed":{"files":N,"testsExecuted":N|
//                  {"unavailable":"pattern-no-match"|"no-format-declared"}}} |
//                  {"unavailable":"no-test-command"} | {"malformed":{"entries":N,"of":M}} — exit is
//                  FORCED to 1 when files>0 and testsExecuted===0 strictly (D5, emitter-side
//                  contradiction; an unavailability object is not a zero)
//   ac-matrix / skip-reconcile — appended by ac-matrix.js itself (same manifest)
//   promise-sweep  {"leg":"promise-sweep","exit":<0|1>,"observed":{"rows":N,"carried":C,
//                  "sanctioned":S,"orphans":O}} — appended by promise-sweep.js itself (same
//                  manifest); runs in EVERY scope including --fix-delta — excluded from no scope
//                  (D4, specs/20260817/07-promise-sweep-leg.md)
//   patterns       {"matches":N} — recorded when config declares patternsScript; never required
//   drift          {"summary":"<first stdout line, bounded to 120 chars>"} — recorded when config
//                  declares driftScript
//
// specs/20260820/06-typed-evidence-manifest.md D2/D5 (2026-08-20, brief 16's second move): every
// row's `observed` is now a typed JSON object instead of a packed/prefixed string — a string row
// is manifest-invalid to verdict.js by construction (D1), so this script never emits one. Free-
// text sub-fields (gate's whole-row `detail`, drift's `summary`) are bounded to 120 chars AT THE
// EMITTER (D2) — the bound is on the string field, never the whole row object (D11: slicing a
// JSON object corrupts it). A new capability, `testCountPattern` (regex over runner output, group
// 1 = executed-test count, or "none"), is read the same way `skipReportPattern` already is and
// applied to the gate and at-risk legs' child output, writing `testsExecuted` as a number or a
// typed `{"unavailable":...}` — absent/"none"/no-match is never assumed zero (UPWELL-20260716-02's
// lesson, extended). The at-risk leg's exit is forced to 1 when it captured files>0 but a declared
// testCountPattern observed exactly 0 executed tests — the 2026-08-16 vacuous-green escape
// (files=N, exit=0, runner executed nothing) becomes a same-run red instead of silent decay.
// --fix-delta skips reconcile/at-risk/patterns (the fix diff is a response to findings) and
// re-runs everything else in full — a fix-delta pass must re-assert executed state, never
// inherit it (CROSS-20260727-01).
//
// What this deliberately does NOT do: derive a verdict (verdict.js is the sole derivation),
// extract skipped-test NAMES from gate output (runner-specific; the session passes --skips
// when the gate reports skips), or retry/poll anything.
//
// Incident (2026-08-20, spec review-observation-truth.md D1, Salon OS field report): env-
// preflight.js was authored and wired into build/design/doctor but absent from the review path —
// the 3rd recurrence of the authored-not-activated class. Before wave 1 (and before any manifest
// row is appended), this script now runs `env-preflight.js --root <root>` (default mode,
// process.env presence only — never --rules) as a hard precondition. A preflight exit 1 (>=1
// declared testEnv var unset) makes review-legs.js exit 2, with preflight's own per-var
// unset/provision lines and remedy sentence (printed on ITS stdout) re-emitted here on stderr,
// prefixed `review-legs.js:`, and no leg has spawned yet so no manifest row exists. A host with no
// testEnv registry (or an empty one) sees preflight exit 0 and zero behavior change.
//
// Exit codes: 0 = every blocking leg (gate/smoke/ci) green — findings legs may still have
// findings for disposition · 1 = a blocking leg is red (review hard-stops pre-reviewer) ·
// 2 = usage error or precondition failure (unreadable config/spec, scope-reconcile exit 2, or
// env-preflight.js exit 1 — an unprovisioned declared testEnv var)

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { readConfig, CONFIG_RELPATH } = require('./lib/host-config')
const { parseFilePlan, parseFilePlanRows } = require('./lib/file-plan')

function usage() {
  console.error('usage: review-legs.js --root <dir> --spec <path> --base <ref> --manifest <path> [--skips <file>] [--fix-delta] [--out-dir <dir>]')
}

let root = null, spec = null, base = null, manifest = null, skips = null, fixDelta = false, outDir = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--spec') spec = argv[++i]
  else if (a === '--base') base = argv[++i]
  else if (a === '--manifest') manifest = argv[++i]
  else if (a === '--skips') skips = argv[++i]
  else if (a === '--fix-delta') fixDelta = true
  else if (a === '--out-dir') outDir = argv[++i]
  else { usage(); process.exit(2) }
}
if (!root || !spec || !base || !manifest) { usage(); process.exit(2) }
root = path.resolve(root)
let config
try { config = readConfig(root) } catch (e) {
  console.error(`review-legs.js: cannot read ${CONFIG_RELPATH} under --root: ${e.message} — run /spec:init first`)
  process.exit(2)
}
if (!config.gateCommand) {
  console.error(`review-legs.js: no gateCommand in ${CONFIG_RELPATH} under --root — run /spec:init first`)
  process.exit(2)
}

// ---- D1 precondition: env-preflight.js, default mode, before wave 1 and before any manifest ----
// row is appended (specs/20260820/03-review-observation-truth.md). No --rules — that mode is
// doctor's registry-vs-doctrine check, unrelated to this run-time presence gate.
const preflight = spawnSync(process.execPath, [path.join(__dirname, 'env-preflight.js'), '--root', root], { encoding: 'utf8' })
if (preflight.status !== 0) {
  const detail = `${preflight.stdout || ''}${preflight.stderr || ''}`.trim() || `env-preflight.js exited ${preflight.status}`
  console.error(`review-legs.js: environment not provisioned — env-preflight.js failed before any leg could run:\n${detail}`)
  process.exit(2)
}
outDir = outDir || fs.mkdtempSync(path.join(require('os').tmpdir(), 'review-legs-'))
fs.mkdirSync(outDir, { recursive: true })

const rows = []
function appendRow(leg, exit, observed) {
  const row = { leg, exit, observed }
  rows.push(row)
  fs.appendFileSync(manifest, JSON.stringify(row) + '\n')
}

// D5: testCountPattern is read/handled exactly like skipReportPattern below — absent or "none"
// means the host declares no format (sanctioned, never a finding); declared but unmatched means
// drift (pages via verdict.js's gate-skips finding for skips specifically; at-risk's contradiction
// rule for testsExecuted). Never assumed zero either way.
function computeTestsExecuted(output, pattern) {
  if (!pattern || pattern === 'none') return { unavailable: 'no-format-declared' }
  const m = new RegExp(pattern).exec(output)
  return m ? (Number(m[1]) || 0) : { unavailable: 'pattern-no-match' }
}

function computeSkips(output, pattern) {
  if (!pattern || pattern === 'none') return { skips: { unavailable: 'no-format-declared' } }
  const m = new RegExp(pattern).exec(output)
  if (!m) return { skips: { unavailable: 'pattern-no-match' } }
  return { skips: Number(m[1]) || 0, todos: m[2] !== undefined ? Number(m[2]) || 0 : 0 }
}

function sh(cmd, opts = {}) {
  return new Promise((resolve) => {
    // Scrub the test-runner context vars: a gate that itself runs `node --test` must behave as
    // a fresh top-level runner even when review-legs.js was invoked from inside one (a nested
    // runner inheriting NODE_TEST_CONTEXT degrades to a silent child-protocol run — exit 0
    // over failing tests).
    const env = { ...process.env, ...opts.env }
    delete env.NODE_TEST_CONTEXT
    const child = spawn('bash', ['-c', cmd], { cwd: root, env })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', () => resolve({ code: 127, out, err }))
    child.on('close', code => resolve({ code: code === null ? 1 : code, out, err }))
  })
}

// Gate resolution: {testDirs}/{scopeDirs} from the spec's File Plan test rows, glob form —
// a bare directory does not run under `node --test` on Node 26 (JJ-20260815-04).
function resolveGate(specText) {
  let gate = config.gateCommand
  if (!/\{testDirs\}|\{scopeDirs\}/.test(gate)) return { gate }
  const layerTests = parseFilePlanRows(specText)
    .filter(r => r.layer && /^tests?$/i.test(r.layer.trim())).flatMap(r => r.paths)
  const heuristic = parseFilePlan(specText)
    .filter(f => /(^|\/)tests?\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(f))
  const testFiles = [...new Set([...layerTests, ...heuristic])]
  if (!testFiles.length) return { gate: null, reason: 'no File Plan test rows to resolve {testDirs}' }
  const globs = new Set()
  for (const f of testFiles) {
    const dir = path.dirname(f)
    const m = path.basename(f).match(/(\.[a-z]+)+$/i)
    const suffix = /\.(test|spec)\./.test(f) ? '*.' + f.split('.').slice(-2).join('.') : (m ? '*' + m[0] : '*')
    globs.add(`'${dir === '.' ? '' : dir + '/'}${suffix}'`)
  }
  const dirsStr = [...globs].join(' ')
  return { gate: gate.replace(/\{testDirs\}/g, dirsStr).replace(/\{scopeDirs\}/g, [...new Set(testFiles.map(f => path.dirname(f)))].join(' ')) }
}

async function main() {
  let specText
  try { specText = fs.readFileSync(path.resolve(root, spec), 'utf8') } catch (e) {
    console.error(`review-legs.js: cannot read --spec ${spec}: ${e.message}`); process.exit(2)
  }
  const scriptDir = __dirname
  const q = (p) => `"${p}"`
  const reconcilePath = path.join(outDir, 'reconcile.json')
  const gateOutPath = path.join(outDir, 'gate-output.txt')
  const patternsPath = path.join(outDir, 'patterns.txt')
  const atRiskPath = path.join(outDir, 'at-risk.txt')
  // Advertise at-risk.txt only when THIS run wrote it — a reused --out-dir can hold a stale
  // copy from a prior run, and an existence probe would advertise it as this run's evidence.
  let wroteAtRisk = false

  // ---- wave 1 (parallel): reconcile, gate, ci ---------------------------------------------
  // smoke deliberately runs AFTER the gate AND after the at-risk/patterns wave (its own wave
  // below): anything that runs host tests can boot or build the app and collide with a
  // concurrent smoke boot on shared runtime state. Observed twice: 2026-08-17, gate vs smoke
  // (two boots rm -f'ing each other's ready file, and a SIGTERM landing in the handler-install
  // window under full-suite load — status 143, shutdown-unclean); 2026-08-21 UpWell, at-risk
  // vs smoke (an at-risk test's production build clobbered the artifact smoke was booting —
  // ENOTEMPTY under .nitro/vite, then readyCheck never passed; 3/3 runs, smoke alone green).
  const wave1 = []

  let reconcileJson = null
  if (!fixDelta) {
    wave1.push(sh(`node ${q(path.join(scriptDir, 'scope-reconcile.js'))} --root ${q(root)} --base ${q(base)} --spec ${q(spec)} --json`).then(r => {
      if (r.code === 2) { console.error(`review-legs.js: scope-reconcile precondition failure:\n${r.err || r.out}`); process.exit(2) }
      fs.writeFileSync(reconcilePath, r.out)
      try { reconcileJson = JSON.parse(r.out) } catch { reconcileJson = null }
      // D5 (specs/20260824/06-review-range-identity.md): files is scope-reconcile's outOfPlan
      // array verbatim and in its order, always present ([] when N is 0), capped at 40; an
      // unparseable scope-reconcile JSON keeps today's n=0 path and emits files:[].
      const paths = reconcileJson ? reconcileJson.outOfPlan : []
      const n = paths.length
      appendRow('reconcile', r.code,
        { outOfPlan: n, files: paths.slice(0, 40), ...(n > 40 ? { filesOmitted: n - 40 } : {}) })
    }))
  }

  const resolved = resolveGate(specText)
  if (resolved.gate) {
    wave1.push(sh(resolved.gate).then(r => {
      fs.writeFileSync(gateOutPath, r.out + r.err)
      const output = r.out + r.err
      const skipPat = config.capabilities && config.capabilities.skipReportPattern
      const countPat = config.capabilities && config.capabilities.testCountPattern
      // No match is honestly unavailable, never assumed-zero (UPWELL-20260716-02's lesson) —
      // runners that print a zero-skip line still match the declared pattern with count 0.
      const observed = { ...computeSkips(output, skipPat), testsExecuted: computeTestsExecuted(output, countPat) }
      appendRow('gate', r.code, observed)
    }))
  } else {
    // D2: the whole-row unavailable alternative — no gate command could be resolved at all — is
    // still a red gate row (exit 1), with the reason bounded to 120 chars at this emitter.
    appendRow('gate', 1, { unavailable: 'gate-unresolvable', detail: String(resolved.reason || '').slice(0, 120) })
  }

  wave1.push(sh(`node ${q(path.join(scriptDir, 'ci-query.js'))} --commit $(git rev-parse HEAD) --root ${q(root)}`).then(r => {
    let observed = { unavailable: 'no-adapter' }, exit = 0
    const line = (r.out || '').trim().split('\n').pop() || ''
    if (/^unavailable/.test(line)) observed = { unavailable: 'no-adapter' }
    else {
      try {
        const j = JSON.parse(line)
        if (!j.available) observed = { unavailable: j.transient ? 'transient' : 'no-adapter' }
        else if (j.status && j.status !== 'completed') observed = { status: 'in-progress' }
        else { observed = { conclusion: j.conclusion }; exit = /^(failure|timed_out|cancelled)$/.test(j.conclusion) ? 1 : 0 }
      } catch { observed = { unavailable: 'no-adapter' } }
    }
    appendRow('ci', exit, observed)
  }))

  await Promise.all(wave1)

  // ---- wave 2 (parallel): at-risk + patterns (post-gate; both need reconcile's output) ----
  const wave2 = []
  if (!fixDelta) {
    const atRisk = (reconcileJson && Array.isArray(reconcileJson.atRisk)) ? reconcileJson.atRisk : []
    // Zero at-risk files is a genuine, known zero (nothing needed to run) — not an unmade
    // observation, so testsExecuted is the literal 0 here, never a typed unavailability.
    if (!atRisk.length) appendRow('at-risk', 0, { files: 0, testsExecuted: 0 })
    else if (!config.testCommand) appendRow('at-risk', 0, { unavailable: 'no-test-command' })
    // scope-reconcile emits atRisk as {file, refs} objects (the `refs` provenance is load-bearing
    // and the patterns consumer below already reads the object form). Extract `.file` — a bare
    // map(q) stringified each entry to "[object Object]", a path matching no test files, and
    // `node --test` exits 0 over zero matched tests — so the leg reported files=N as a VACUOUS
    // GREEN having executed nothing (observed 36c2f14: files=11 exit=0, runner printed pass 0).
    // Fail closed on a malformed entry rather than shipping garbage to the runner: a schema
    // drift here must be legible, never silent.
    else {
      const malformed = atRisk.filter(a => !a || typeof a.file !== 'string' || !a.file.trim())
      if (malformed.length) {
        fs.writeFileSync(atRiskPath, `malformed atRisk entries (expected {file, refs}):\n${JSON.stringify(malformed, null, 2)}\n`)
        wroteAtRisk = true
        appendRow('at-risk', 1, { malformed: { entries: malformed.length, of: atRisk.length } })
      } else {
        const atRiskFiles = atRisk.map(a => a.file)
        wave2.push(sh(`${config.testCommand} ${atRiskFiles.map(q).join(' ')}`).then(r => {
          // The leg's finding is contractually "{failing files/digest, session-extracted from
          // runner output}" — discarding the output makes that finding unproducible.
          fs.writeFileSync(atRiskPath, `$ ${config.testCommand} ${atRiskFiles.map(q).join(' ')}\n\n${r.out}${r.err}`)
          wroteAtRisk = true
          const testsExecuted = computeTestsExecuted(r.out + r.err, config.capabilities && config.capabilities.testCountPattern)
          // D5: exit is FORCED to 1 when files>0 and testsExecuted===0 STRICTLY (an unavailability
          // object is not a zero) — the 2026-08-16 vacuous-green escape becomes a same-run red.
          const exit = (testsExecuted === 0) ? 1 : r.code
          appendRow('at-risk', exit, { files: atRisk.length, testsExecuted })
        }))
      }
    }

    if (config.patternsScript) {
      const dirs = reconcileJson
        ? [...new Set([].concat(reconcileJson.outOfPlan, reconcileJson.unrealized, reconcileJson.excluded || []).map(f => path.dirname(typeof f === 'string' ? f : f.file || '')))].filter(Boolean)
        : []
      wave2.push(sh(`DIFF_BASE=${q(base)} bash ${q(path.resolve(root, config.patternsScript))} ${dirs.map(q).join(' ')}`).then(r => {
        fs.writeFileSync(patternsPath, r.out)
        appendRow('patterns', r.code, { matches: r.out.split('\n').filter(l => l.trim()).length })
      }))
    }
  }
  if (config.driftScript) {
    // D2: drift's summary is the one built-in free-text field — bounded to 120 chars at this
    // emitter, never sliced as a whole row downstream.
    wave2.push(sh(`${config.driftScript} ${q(spec)}`).then(r =>
      appendRow('drift', r.code, { summary: (r.out.trim().split('\n')[0] || '').slice(0, 120) })))
  }
  await Promise.all(wave2)

  // ---- wave 2b: smoke, ALONE — after every leg that can run host tests or build the app ---
  // (gate in wave 1, at-risk/patterns in wave 2; see the wave-1 comment for both observed
  // collisions). Its full output is retained: a red smoke row with no captured boot log is
  // undiagnosable and has cost multi-run archaeology (UpWell 2026-08-21).
  const smokeR = await sh(`bash ${q(path.join(scriptDir, 'smoke.sh'))}`)
  fs.writeFileSync(path.join(outDir, 'smoke.txt'), smokeR.out + smokeR.err)
  appendRow('smoke', smokeR.code, { result: smokeR.code === 0 ? 'pass' : smokeR.code === 4 ? 'inert' : 'fail' })

  // ---- wave 3: ac-matrix (+ skip-reconcile) — needs the gate row present in the manifest --
  const acr = await sh(`node ${q(path.join(scriptDir, 'ac-matrix.js'))} --spec ${q(spec)} --root ${q(root)} --manifest ${q(manifest)}${skips ? ` --skips ${q(skips)}` : ''}${config.driftScript ? ' --has-drift-script' : ''}`)
  fs.writeFileSync(path.join(outDir, 'ac-matrix.txt'), acr.out + acr.err)

  // ---- wave 3b: promise-sweep — runs in EVERY scope including --fix-delta (D4: the spec text
  // may be amended during a fix pass, and the leg is milliseconds); appends its own manifest row
  // the same way ac-matrix.js does above, never via appendRow (that would double-write it).
  const psr = await sh(`node ${q(path.join(scriptDir, 'promise-sweep.js'))} --spec ${q(spec)} --manifest ${q(manifest)}`)
  fs.writeFileSync(path.join(outDir, 'promise-sweep.txt'), psr.out + psr.err)

  // ---- summary ----------------------------------------------------------------------------
  const all = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const byLeg = new Map(all.map(r => [r.leg, r]))
  const BLOCKING = ['gate', 'smoke', 'ci']
  let blockedBy = []
  for (const r of byLeg.values()) {
    const red = r.leg === 'smoke' ? (r.exit !== 0 && r.exit !== 4) : r.exit !== 0
    const blocking = BLOCKING.includes(r.leg)
    if (red && blocking) blockedBy.push(r.leg)
    console.log(`${red ? (blocking ? '❌' : '⚠️ ') : '✅'} ${r.leg.padEnd(14)} exit=${r.exit} ${JSON.stringify(r.observed)}${red && !blocking ? ' (findings — disposition in review)' : ''}`)
  }
  console.log(`manifest: ${manifest}`)
  console.log(`outputs: ${outDir}  (reconcile.json, gate-output.txt, smoke.txt, ac-matrix.txt, promise-sweep.txt${config.patternsScript ? ', patterns.txt' : ''}${wroteAtRisk ? ', at-risk.txt' : ''})`)
  if (blockedBy.length) {
    console.log(`RED_BLOCKING: ${blockedBy.join(',')}`)
    process.exit(1)
  }
  process.exit(0)
}

main()
