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
// Legs and row shapes (verdict.js's REVIEW_LEGS, byte-compatible):
//   reconcile      {"leg":"reconcile","exit":<0|3>,"observed":"outOfPlan=<N>"}
//   gate           {"leg":"gate","exit":<code>,"observed":"skips=<N> todos=<M>"|"unavailable — …"}
//   smoke          {"leg":"smoke","exit":<code>,"observed":"pass"|"inert"|"fail"}
//   ci             {"leg":"ci","exit":<0|1>,"observed":"unavailable"|"unavailable-transient"|"in-progress"|"conclusion=<v>"}
//   at-risk        {"leg":"at-risk","exit":<code>,"observed":"files=<N>"|"unavailable — …"}
//   ac-matrix / skip-reconcile — appended by ac-matrix.js itself (same manifest)
//   patterns       recorded when config declares patternsScript; never required
//   drift          recorded when config declares driftScript
// --fix-delta skips reconcile/at-risk/patterns (the fix diff is a response to findings) and
// re-runs everything else in full — a fix-delta pass must re-assert executed state, never
// inherit it (CROSS-20260727-01).
//
// What this deliberately does NOT do: derive a verdict (verdict.js is the sole derivation),
// extract skipped-test NAMES from gate output (runner-specific; the session passes --skips
// when the gate reports skips), or retry/poll anything.
//
// Exit codes: 0 = every blocking leg (gate/smoke/ci) green — findings legs may still have
// findings for disposition · 1 = a blocking leg is red (review hard-stops pre-reviewer) ·
// 2 = usage error or precondition failure (unreadable config/spec, scope-reconcile exit 2)

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { readConfig } = require('./lib/host-config')
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
  console.error(`review-legs.js: cannot read .claude/spec.config.json under --root: ${e.message} — run /spec:init first`)
  process.exit(2)
}
if (!config.gateCommand) {
  console.error('review-legs.js: no gateCommand in .claude/spec.config.json under --root — run /spec:init first')
  process.exit(2)
}
outDir = outDir || fs.mkdtempSync(path.join(require('os').tmpdir(), 'review-legs-'))
fs.mkdirSync(outDir, { recursive: true })

const rows = []
function appendRow(leg, exit, observed) {
  const row = { leg, exit, observed: String(observed).slice(0, 120) }
  rows.push(row)
  fs.appendFileSync(manifest, JSON.stringify(row) + '\n')
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

  // ---- wave 1 (parallel): reconcile, gate, ci ---------------------------------------------
  // smoke deliberately runs AFTER the gate (wave 2): a gate that itself boots the app (this
  // repo's smoke-leg test does) collides with a concurrent smoke boot on shared runtime state
  // (observed 2026-08-17: two boots rm -f'ing each other's ready file, and a SIGTERM landing
  // in the handler-install window under full-suite load — status 143, shutdown-unclean).
  const wave1 = []

  let reconcileJson = null
  if (!fixDelta) {
    wave1.push(sh(`node ${q(path.join(scriptDir, 'scope-reconcile.js'))} --root ${q(root)} --base ${q(base)} --spec ${q(spec)} --json`).then(r => {
      if (r.code === 2) { console.error(`review-legs.js: scope-reconcile precondition failure:\n${r.err || r.out}`); process.exit(2) }
      fs.writeFileSync(reconcilePath, r.out)
      try { reconcileJson = JSON.parse(r.out) } catch { reconcileJson = null }
      const n = reconcileJson ? reconcileJson.outOfPlan.length : 0
      appendRow('reconcile', r.code, `outOfPlan=${n}`)
    }))
  }

  const resolved = resolveGate(specText)
  if (resolved.gate) {
    wave1.push(sh(resolved.gate).then(r => {
      fs.writeFileSync(gateOutPath, r.out + r.err)
      const pat = config.capabilities && config.capabilities.skipReportPattern
      let observed
      if (pat && pat !== 'none') {
        const m = new RegExp(pat).exec(r.out + r.err)
        // No match is honestly unavailable, never assumed-zero (UPWELL-20260716-02's lesson) —
        // runners that print a zero-skip line still match the declared pattern with count 0.
        observed = m ? `skips=${Number(m[1]) || 0} todos=${m[2] !== undefined ? Number(m[2]) || 0 : 0}`
          : 'unavailable — skip format did not match gate output'
      } else {
        observed = 'unavailable — host runner declares no skip format'
      }
      appendRow('gate', r.code, observed)
    }))
  } else {
    appendRow('gate', 1, `unavailable: ${resolved.reason}`)
  }

  wave1.push(sh(`node ${q(path.join(scriptDir, 'ci-query.js'))} --commit $(git rev-parse HEAD) --root ${q(root)}`).then(r => {
    let observed = 'unavailable', exit = 0
    const line = (r.out || '').trim().split('\n').pop() || ''
    if (/^unavailable/.test(line)) observed = 'unavailable'
    else {
      try {
        const j = JSON.parse(line)
        if (!j.available) observed = j.transient ? 'unavailable-transient' : 'unavailable'
        else if (j.status && j.status !== 'completed') observed = 'in-progress'
        else { observed = `conclusion=${j.conclusion}`; exit = /^(failure|timed_out|cancelled)$/.test(j.conclusion) ? 1 : 0 }
      } catch { observed = 'unavailable' }
    }
    appendRow('ci', exit, observed)
  }))

  await Promise.all(wave1)

  // ---- wave 2 (parallel): smoke + at-risk + patterns (post-gate; at-risk/patterns need ----
  // ---- reconcile's output) ----------------------------------------------------------------
  const wave2 = []
  wave2.push(sh(`bash ${q(path.join(scriptDir, 'smoke.sh'))}`).then(r => {
    appendRow('smoke', r.code, r.code === 0 ? 'pass' : r.code === 4 ? 'inert' : 'fail')
  }))
  if (!fixDelta) {
    const atRisk = (reconcileJson && Array.isArray(reconcileJson.atRisk)) ? reconcileJson.atRisk : []
    if (!atRisk.length) appendRow('at-risk', 0, 'files=0')
    else if (!config.testCommand) appendRow('at-risk', 0, 'unavailable — host declares no testCommand')
    else wave2.push(sh(`${config.testCommand} ${atRisk.map(q).join(' ')}`).then(r => appendRow('at-risk', r.code, `files=${atRisk.length}`)))

    if (config.patternsScript) {
      const dirs = reconcileJson
        ? [...new Set([].concat(reconcileJson.outOfPlan, reconcileJson.unrealized, reconcileJson.excluded || []).map(f => path.dirname(typeof f === 'string' ? f : f.file || '')))].filter(Boolean)
        : []
      wave2.push(sh(`DIFF_BASE=${q(base)} bash ${q(path.resolve(root, config.patternsScript))} ${dirs.map(q).join(' ')}`).then(r => {
        fs.writeFileSync(patternsPath, r.out)
        appendRow('patterns', r.code, `matches=${r.out.split('\n').filter(l => l.trim()).length}`)
      }))
    }
  }
  if (config.driftScript) {
    wave2.push(sh(`${config.driftScript} ${q(spec)}`).then(r => appendRow('drift', r.code, (r.out.trim().split('\n')[0] || '').slice(0, 120))))
  }
  await Promise.all(wave2)

  // ---- wave 3: ac-matrix (+ skip-reconcile) — needs the gate row present in the manifest --
  const acr = await sh(`node ${q(path.join(scriptDir, 'ac-matrix.js'))} --spec ${q(spec)} --root ${q(root)} --manifest ${q(manifest)}${skips ? ` --skips ${q(skips)}` : ''}${config.driftScript ? ' --has-drift-script' : ''}`)
  fs.writeFileSync(path.join(outDir, 'ac-matrix.txt'), acr.out + acr.err)

  // ---- summary ----------------------------------------------------------------------------
  const all = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const byLeg = new Map(all.map(r => [r.leg, r]))
  const BLOCKING = ['gate', 'smoke', 'ci']
  let blockedBy = []
  for (const r of byLeg.values()) {
    const red = r.leg === 'smoke' ? (r.exit !== 0 && r.exit !== 4) : r.exit !== 0
    const blocking = BLOCKING.includes(r.leg)
    if (red && blocking) blockedBy.push(r.leg)
    console.log(`${red ? (blocking ? '❌' : '⚠️ ') : '✅'} ${r.leg.padEnd(14)} exit=${r.exit} ${r.observed}${red && !blocking ? ' (findings — disposition in review)' : ''}`)
  }
  console.log(`manifest: ${manifest}`)
  console.log(`outputs: ${outDir}  (reconcile.json, gate-output.txt, ac-matrix.txt${config.patternsScript ? ', patterns.txt' : ''})`)
  if (blockedBy.length) {
    console.log(`RED_BLOCKING: ${blockedBy.join(',')}`)
    process.exit(1)
  }
  process.exit(0)
}

main()
