#!/usr/bin/env node
'use strict'
// release.js — linear release gate.
//   node release.js [--root <dir>] [--json] [--promote] [-- <note words>]
// Argv is read only up to `--`; everything after it is note text, never a flag. An unknown --flag before it exits 2.
// Staging: deploy → ready (curl <stagingUrl><healthPath>, 3 tries 5 s apart) → migrations (release.migrationsCheck,
// when set and not `none`) → e2e (BASE_URL, STAGING_URL, RELEASE_NOTE). With release.testCountPattern set, an e2e that
// exits 0 but counts 0 tests, or matches nothing, stops. A green run records {sha, note} in the git common dir.
// --promote: only on a record whose sha is HEAD; the record is cleared, promoteCommand runs, then production must
// answer at <productionUrl><healthPath> before `✅ released` prints. Missing config keys, a missing or stale record -> exit 2.

const path = require('path')
const { spawnSync } = require('child_process')
const { readConfig, readRelease, writeRelease } = require('./lib/state')
const { run, testsExecuted } = require('./lib/host')
const git = require('./lib/git')
const { render } = require('./lib/report')

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// curl -fsS, 3 tries 5 s apart. A missing curl is not retried.
function ready(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync('curl', ['-fsS', '--max-time', '10', url], { encoding: 'utf8' })
    if (r.error && r.error.code === 'ENOENT') return { ok: false, why: 'curl is not installed — install curl to run the ready check' }
    if (r.status === 0) return { ok: true, body: r.stdout.trim() }
    if (attempt < 3) sleep(5000)
    else return { ok: false, why: `${url} did not answer in 3 tries: ${(r.stderr || '').trim() || `exit ${r.status}`}` }
  }
}

function main(argv) {
  let root = process.cwd()
  let json = false
  let promote = false
  const words = []
  const cut = argv.indexOf('--')
  const flags = cut < 0 ? argv : argv.slice(0, cut)
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--root') root = path.resolve(flags[++i])
    else if (flags[i] === '--json') json = true
    else if (flags[i] === '--promote') promote = true
    else if (flags[i].startsWith('--')) {
      process.stderr.write(`release: unknown flag ${flags[i]} — flags are --root <dir>, --json and --promote; put a note after --\n`)
      return 2
    } else words.push(flags[i])
  }
  if (cut >= 0) words.push(...argv.slice(cut + 1))
  let rel
  try { rel = readConfig(root).release || {} } catch (e) { // a refused config (an unmigrated shape) is exit 2
    if (typeof e.exit !== 'number') throw e
    process.stderr.write(`release: ${e.message}\n`); return e.exit
  }
  const need = promote ? ['promoteCommand', 'productionUrl'] : ['deployCommand', 'stagingUrl', 'e2eCommand']
  const missing = need.filter((k) => !rel[k])
  if (missing.length) {
    process.stderr.write(`release: config.release is missing ${missing.join(', ')} in .claude/spec.config.json — add ${missing.length > 1 ? 'them' : 'it'} or run /spec:init\n`)
    return 2
  }
  let head
  try { head = git.headSha(root) } catch (e) { process.stderr.write(`release: ${e.message}\n`); return 2 }
  const note = words.join(' ')
  const health = rel.healthPath || ''
  const out = (o) => {
    process.stdout.write(json ? JSON.stringify(o) + '\n' : render(o))
    return o.blocks ? 1 : 0
  }
  const stop = (name, bullets, why) => out({ outcome: `release stopped at ${name}`, bullets, blocks: why, next: `fix ${name}, then re-run /spec:release` })

  if (promote) {
    const rec = readRelease(root)
    if (!rec || rec.sha !== head) {
      process.stderr.write(`release: ${rec ? `HEAD moved since the green staging run (${String(rec.sha).slice(0, 7)} → ${head.slice(0, 7)})` : 'there is no green staging run'} — run /spec:release first\n`)
      return 2
    }
    writeRelease(root, null) // the approval is spent: any failure from here stages again
    const env = { STAGING_URL: rel.stagingUrl || '', BASE_URL: rel.stagingUrl || '', RELEASE_NOTE: note || rec.note || '' }
    const p = run(rel.promoteCommand, { cwd: root, env })
    if (p.status !== 0) return stop('promote', [], `promote exited ${p.status}:\n${p.tail}`)
    const prod = ready(rel.productionUrl + health)
    if (!prod.ok) return stop('production', ['promote ok'], `production did not answer after the promote: ${prod.why}`)
    const shown = note || rec.note
    return out({
      outcome: `✅ released${shown ? ' — ' + shown : ''}`,
      bullets: ['promote ok', `production answered at ${rel.productionUrl + health}: ${prod.body.slice(0, 400) || '(empty body)'}`, `staged sha ${rec.sha}`],
      next: 'nothing needs you — promoted',
    })
  }

  writeRelease(root, null) // every staging run starts without an approval
  const env = { STAGING_URL: rel.stagingUrl, BASE_URL: rel.stagingUrl, RELEASE_NOTE: note }
  const bullets = []
  const d = run(rel.deployCommand, { cwd: root, env })
  if (d.status !== 0) return stop('deploy', bullets, `deploy exited ${d.status}:\n${d.tail}`)
  bullets.push('deploy ok')
  const r = ready(rel.stagingUrl + health)
  if (!r.ok) return stop('ready', bullets, r.why)
  bullets.push('ready ok')
  if (typeof rel.migrationsCheck === 'string' && rel.migrationsCheck.trim() && rel.migrationsCheck !== 'none') {
    const m = run(rel.migrationsCheck, { cwd: root, env })
    if (m.status !== 0) return stop('migrations', bullets, `migrations exited ${m.status}:\n${m.tail}`)
    bullets.push('migrations ok')
  }
  const e = run(rel.e2eCommand, { cwd: root, env })
  if (e.status !== 0) return stop('e2e', bullets, `e2e exited ${e.status}:\n${e.tail}`)
  const counted = rel.testCountPattern && rel.testCountPattern !== 'none'
  const n = counted ? testsExecuted(e.stdout + e.stderr, rel.testCountPattern) : null
  if (counted && !n) return stop('e2e', bullets, `e2e exited 0 but ran no tests (testCountPattern ${rel.testCountPattern} ${n === 0 ? 'counted 0' : 'matched nothing'}):\n${e.tail}`)
  bullets.push(counted ? `e2e ok (${n} tests)` : 'e2e ok (tests not counted)')
  writeRelease(root, { sha: head, note })
  return out({ outcome: `✅ staging verified${note ? ' — ' + note : ''}`, bullets, pins: `promote? staging is green on ${head.slice(0, 7)} — promote only on the user's yes`, next: 'promote to production when ready' })
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { main }
