#!/usr/bin/env node
'use strict'
// supersession-rows.js --commit <sha> --root <dir>
//                    | --merge --root <dir> --target <ref> --source <ref> --by <spec path> --json
//
// Owner: specs/20261101/11-a-direction-flip-leaves-a-row.md D2, D5.
// Why: the one derivation of "what counts as a direction flip" — a commit that flips a spec to
// status: superseded (--commit, appends one spec-superseded escape row through escape-row.js) and a
// merge whose source branch deletes a file a done spec's File Plan created (--merge, derives
// shipped-file-deleted rows and prints them as a JSON array; the review driver appends them once
// the merge has landed). Both feed fleet-reader's escapes.byClass.
//
// What this deliberately does NOT do: write a ledger in --merge mode, create a ledger the host
// did not opt into, resolve or validate supersededBy (a free-form value), treat a rename as a
// deletion, count MODIFY rows or tests-layer rows as shipped work, or print a verdict.
//
// Exit codes: 0 = derived (nothing derived is still 0)
//             2 = usage; --root not a git repository; sha/ref unresolvable; the escape-row writer refused a row

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { fmValue } = require('./lib/frontmatter')
const { parseFilePlanRows, isTestsRow } = require('./lib/file-plan')

function usage() {
  console.error(
    'Usage: supersession-rows.js --commit <sha> --root <dir>\n' +
    '     | supersession-rows.js --merge --root <dir> --target <ref> --source <ref> --by <spec path> --json'
  )
  process.exit(2)
}

function fail(msg) {
  console.error('supersession-rows: ' + msg)
  process.exit(2)
}

const argv = process.argv.slice(2)
let mode = null, sha = null, rootArg = null, target = null, source = null, by = null
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--commit') { if (mode) usage(); mode = 'commit'; sha = argv[++i] }
  else if (a === '--merge') { if (mode) usage(); mode = 'merge' }
  else if (a === '--root') rootArg = argv[++i]
  else if (a === '--target') target = argv[++i]
  else if (a === '--source') source = argv[++i]
  else if (a === '--by') by = argv[++i]
  else if (a === '--json') { /* --merge always prints JSON */ }
  else usage()
}
if (!mode || !rootArg) usage()
if (mode === 'commit' && !sha) usage()
if (mode === 'merge' && (!target || !source || !by)) usage()

const root = path.resolve(rootArg)
function git(args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
const inside = git(['rev-parse', '--is-inside-work-tree'])
if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
  fail(`--root ${rootArg} is not a git repository — pass the repo root`)
}

function resolveRef(ref) {
  const r = git(['rev-parse', '--verify', '--quiet', ref + '^{commit}'])
  if (r.status !== 0) fail(`cannot resolve ${ref} in ${rootArg} — pass an existing commit or ref`)
  return r.stdout.trim()
}

const SPEC_MD = /^specs\/(?:.*\/)?[^/]+\.md$/

if (mode === 'commit') {
  const full = resolveRef(sha)
  if (!fs.existsSync(path.join(root, '.claude', 'spec-runs.jsonl'))) process.exit(0)
  const names = git(['show', '--format=', '--name-only', full]).stdout
    .split('\n').map(s => s.trim()).filter(p => SPEC_MD.test(p)).sort()
  const writer = path.join(__dirname, 'escape-row.js')
  for (const p of names) {
    const now = git(['show', `${full}:${p}`])
    if (now.status !== 0 || fmValue(now.stdout, 'status') !== 'superseded') continue
    const before = git(['show', `${full}^:${p}`])
    if (before.status === 0 && fmValue(before.stdout, 'status') === 'superseded') continue
    const sup = (fmValue(now.stdout, 'superseded_by') || '').trim() || null
    const row = {
      ts: new Date().toISOString(), stage: 'escape', spec: p, files: [p], reviewRunId: null,
      class: 'spec-superseded', sha: full, via: 'commit', supersededBy: sup,
    }
    const w = spawnSync(process.execPath, [writer, '--append', '--root', root, '--row', JSON.stringify(row)], { encoding: 'utf8' })
    if (w.status === 0) console.log(`supersession spec=${p} class=spec-superseded supersededBy=${sup === null ? 'null' : sup}`)
    else if (w.status === 3) console.log(`already recorded spec=${p}`)
    else {
      console.error(`supersession-rows: escape-row.js --append exited ${w.status} for ${p}: ${(w.stderr || w.stdout || "").trim()} -- see the writer's reason with: node "$(spec-paths escape-row)" --check --row '${JSON.stringify(row)}'`)
      process.exit(2)
    }
  }
  process.exit(0)
}

// --merge
resolveRef(target)
resolveRef(source)
const deleted = new Set(
  git(['diff', '--name-status', '--diff-filter=D', `${target}...${source}`]).stdout
    .split('\n').filter(Boolean).map(l => l.split('\t')[1]).filter(Boolean)
)

function walk(dir, out) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p)
  }
  return out
}

const byNorm = path.normalize(by)
const rows = []
if (deleted.size) {
  for (const abs of walk(path.join(root, 'specs'), []).sort()) {
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (path.normalize(rel) === byNorm) continue
    let text
    try { text = fs.readFileSync(abs, 'utf8') } catch { continue }
    if (fmValue(text, 'status') !== 'done') continue
    const hit = new Set()
    for (const r of parseFilePlanRows(text)) {
      if (!/^create$/i.test(String(r.action || '').trim()) || isTestsRow(r)) continue
      for (const p of r.paths) if (deleted.has(p)) hit.add(p)
    }
    if (hit.size) {
      rows.push({
        ts: new Date().toISOString(), spec: rel, files: [...hit].sort(), reviewRunId: null,
        class: 'shipped-file-deleted', sha: null, via: 'review', supersededBy: by,
      })
    }
  }
}
console.log(JSON.stringify(rows))
process.exit(0)
