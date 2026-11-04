#!/usr/bin/env node
'use strict'
// expire-tests.js --root <r> --spec <spec path>  [--apply [--no-gate]] [--json]
// expire-tests.js --root <r> --all-done          [--apply [--no-gate]] [--json]
// expire-tests.js --root <r> --invariants        [--json]
//
// Owner: specs/20260911/03-tests-expire-at-close.md; specs/20261103/13-a-change-is-sized-by-its-files.md
// D10 (keep clauses), D11 (--no-gate).
//
// A spec's tests die when the spec does. This is the ONE place the classification runs — the review
// driver's close and /spec:doctor check 20 both call it.
//
// Named expire-tests.js, never test-expiry.js: `node --test` discovers `**/test-*.js` and would execute
// it as a test. The `spec-paths` key stays `test-expiry`.
//
// A test is *tagged* when an AC-ID occurs in its title or the contiguous comment block directly
// above the call (lib/scan-test-calls.js's own shape); an untagged test is never read for
// anything else. `--spec` scans only tests that cite one of the given spec's own AC-IDs (its own
// status counts as done, even while its frontmatter still literally says otherwise mid-close);
// `--all-done` scans every tagged test in the host. A tagged, in-scope test is *retired* only
// when every AC-ID it cites belongs to a spec that is `done` or `superseded`
// (a superseded owner is a terminal retire state, same as done) AND none of three keep
// clauses fire: (a) its own call text names a ledger escape class (`.claude/spec-runs.jsonl`'s
// `class` keys, top-level or nested in `incidents[]`); (b) its title or the contiguous comment block
// above it (the span an AC-ID is read from) holds the token `[invariant]` (kept as invariant) or
// `[pin]` (kept as pin) — a kept test is a tagged choice, never a side effect of what it spawns;
// a host-scanner case is judged on the same span; (c) a cited AC bullet (normalized whitespace, code spans stripped) contains `SHALL CONTINUE TO`
// spec is dated on or after the 20260911 floor — or the test is the one a `SHALL CONTINUE TO`
// bullet of any such spec that is not superseded names with `→ reuses <file> :: <title>`, whatever
// id the test itself carries (a reused test keeps the tag of the spec that wrote it; a pointer
// matching several cases keeps them all). An AC-ID whose owning spec cannot be found, whose
// spec is neither done nor superseded, or whose owning spec file cannot be read at all keeps the
// test open rather than retiring it — every unknown fails safe. A spec file under `specs/` that
// throws on read is never silently skipped: it is recorded as an
// unreadable owner, its AC-ID prefix derived from its own path
// (`specs/YYYYMMDD/NN[a]-*.md` -> `AC-YYYYMMDD-NN[a]-`), and every cited AC-ID starting with that
// prefix — whether or not a readable sibling also defines it — is treated as unresolved. The rule
// is prefix-scoped: an unreadable file never affects a citation outside its own derived prefix.
// One stderr warning is printed per unreadable file, before the stdout report, naming the file
// and its derived prefix; the exit code is unaffected.
//
// `--apply` removes each retired test's span (its comment block through the call's closing paren,
// trailing `;` and newline all included — lib/scan-test-calls.js's own `start`/`end`, widened here
// by one more character when a trailing newline follows), removes a line-start `describe(` that
// held a retired test and is left with no test/it/describe token (`emptiedSuites`), collapses a
// run of three-or-more blank lines down to one, deletes a file left with zero remaining test() calls
// and no line-start titled case or describe (the scanner can miss a kept case it misreads), and climbs to delete
// any directory the deletion leaves empty. Every span is cut only when it is visibly bounded (it
// ends on its own `)`, closes at its opening line's indent, and holds no titled case or describe
// that is not itself being cut); an unbounded case — or every case inside an emptied describe that
// is unbounded — stays in its file uncut, listed under `unscannable` with a reason and one stderr
// line each instead of under `retired`, while every bounded case beside it is still cut; the exit
// code is unaffected. The indent check is vacuous in a file with no indentation at all, so an
// overrun there can still end on an enclosing `})` — the host gate's parse catches it. A dry run mutates nothing on disk, and
// this script's own `--apply` flag is the ONLY way anything it derives
// reaches the tree: the review driver's close passes `--apply --no-gate` (deletions ride the close
// commit); /spec:doctor check 20's `--all-done --apply` is the catch-up sweep.
//
// An --apply is a change to the host like any other, so it lands through the host's own
// `gateCommand`, run in --root once every write is made (unless `--no-gate`: the writes are made,
// no gate runs, `gate` is `{"skipped":"no-gate"}`; `--no-gate` without `--apply` is a usage error). A red gate puts every touched file back
// byte-for-byte (deleted files and directories recreated) and names the gate and its output's tail
// on stderr. A host with no `gateCommand` gets the writes and one stderr
// warning that nothing checked them. A dry run never runs the gate.
//
// What this deliberately does NOT do: re-derive what a test case is (lib/scan-test-calls.js owns
// that), re-derive the AC-ID grammar or bullet parsing (lib/spec-sections.js owns both), or apply
// any sanction to a malformed AC bullet — a malformed bullet contributes no AC-ID to the ownership
// map and so keeps every test that cites it (unresolved, fail-safe).
//
// Exit codes: 0 = derived (dry run, or applied with the gate green or absent), regardless of how
//                 many tests were retirable, and regardless of how many spec files under --root
//                 were unreadable ·
//             1 = applied and the host's gateCommand went red (every write reverted) ·
//             2 = usage error, --root not a readable directory, or (in --spec mode) the named
//                 spec file cannot be read

const fs = require('fs')
const path = require('path')
const { relPosix: relPosixFrom } = require('./lib/util')
const { listTestFiles, scanCalls, scanCases, scanDescribes, resolveReference } = require('./lib/scan-test-calls')
const { deriveInvariants } = require('./lib/invariants')
const {
  extractSection, parseAcBullets, AC_ID_RE_GLOBAL, normalizeForPinCheck, parseDisposition,
} = require('./lib/spec-sections')
const { fmValue } = require('./lib/frontmatter')
const { readConfig } = require('./lib/host-config')
const { resolveGateForFiles } = require('./lib/gate-resolve')
const hostRun = require('./lib/host-run')

const USAGE = 'expire-tests.js --root <r> (--spec <path> | --all-done | --invariants) [--apply [--no-gate]] [--json]'
const EXPIRY_APPLIES_FROM = '20260911'

const { writeLine: writeOut } = require('./lib/sync-write')

function die(msg) {
  writeOut(2, 'expire-tests: ' + msg)
  process.exit(2)
}

// ---- args --------------------------------------------------------------------------------------
let root = null
let specArg = null
let allDone = false
let invariantsMode = false
let apply = false
let noGate = false
let asJson = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--spec') specArg = argv[++i]
  else if (a === '--all-done') allDone = true
  else if (a === '--invariants') invariantsMode = true
  else if (a === '--apply') apply = true
  else if (a === '--no-gate') noGate = true
  else if (a === '--json') asJson = true
  else die('usage: ' + USAGE)
}
if (!root) die('usage: ' + USAGE)
root = path.resolve(root)

let rootStat = null
try {
  rootStat = fs.statSync(root)
} catch {
  rootStat = null
}
if (!rootStat || !rootStat.isDirectory()) die('usage: ' + USAGE + ' — --root must name an existing directory')

if (noGate && !apply) die('usage: ' + USAGE + ' — --no-gate needs --apply')

const modeCount = (specArg !== null ? 1 : 0) + (allDone ? 1 : 0) + (invariantsMode ? 1 : 0)
if (modeCount !== 1) die('usage: ' + USAGE + ' — exactly one of --spec/--all-done/--invariants is required')

const config = readConfig(root)
const relPosix = (abs) => relPosixFrom(root, abs)

// ---- --invariants --------------------------------------------------------------------------------
if (invariantsMode) {
  const inv = deriveInvariants(root, config)
  if (asJson) {
    writeOut(1, JSON.stringify(inv))
  } else {
    for (const s of inv.scripts) writeOut(1, s)
  }
  process.exit(0)
}

// ---- --spec: resolve + validate the closing spec -------------------------------------------------
let closingSpecRel = null
if (specArg !== null) {
  const abs = path.resolve(root, specArg)
  let text
  try {
    text = fs.readFileSync(abs, 'utf8')
  } catch {
    die('cannot read spec ' + specArg + ' — pass a --spec path that exists under --root')
  }
  closingSpecRel = relPosix(abs)
  void text // read only to validate readability; the AC-owner walk below re-reads it uniformly
}

// ---- AC-ID ownership map: every well-formed AC bullet in every specs/**/*.md file --------------
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', 'fixtures', '__fixtures__'])
function walkSpecs(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkSpecs(full, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
}

const specsDir = path.join(root, 'specs')
const specFiles = []
if (fs.existsSync(specsDir)) walkSpecs(specsDir, specFiles)

// acId -> [{ specRel, status, raw, dateStr }, ...] — many-to-many: a collided id keeps every owner, and
// an unreadable spec's path-derived AC-ID prefix is held unresolved (matchesUnreadablePrefix).
function derivedAcPrefix(rel) {
  const m = /^specs\/(\d{8})\/(\d{2}[a-z]?)-/.exec(rel)
  return m ? 'AC-' + m[1] + '-' + m[2] + '-' : null
}

const acOwners = new Map()
const pinnedByReference = new Map() // test file -> Set(call start) a live pin's `→ reuses` names
const unreadableSpecs = [] // [{ rel, prefix }]
for (const f of specFiles) {
  const rel = relPosix(f)
  let text
  try {
    text = fs.readFileSync(f, 'utf8')
  } catch {
    const prefix = derivedAcPrefix(rel)
    if (prefix) unreadableSpecs.push({ rel, prefix })
    continue
  }
  const status = fmValue(text, 'status')
  const dateMatch = /specs\/(\d{8})\//.exec(rel)
  const dateStr = dateMatch ? dateMatch[1] : null
  const acSection = extractSection(text, 'Acceptance Criteria')
  if (acSection === null) continue
  for (const bullet of parseAcBullets(acSection)) {
    if (bullet.malformed) continue
    if (!acOwners.has(bullet.id)) acOwners.set(bullet.id, [])
    acOwners.get(bullet.id).push({ specRel: rel, status, raw: bullet.raw, dateStr })
    if (status === 'superseded' || !dateStr || dateStr < EXPIRY_APPLIES_FROM) continue
    if (!/SHALL CONTINUE TO/.test(normalizeForPinCheck(bullet.raw))) continue
    const disposition = parseDisposition(bullet.raw)
    if (!disposition || disposition.kind !== 'reuses') continue
    for (const call of resolveReference(root, disposition.file, disposition.prefix)) {
      if (!pinnedByReference.has(disposition.file)) pinnedByReference.set(disposition.file, new Set())
      pinnedByReference.get(disposition.file).add(call.start)
    }
  }
}

// One stderr warning per unreadable spec file, before the stdout report,
// naming the file and its derived prefix — exit code unaffected.
const unreadablePrefixes = new Set(unreadableSpecs.map((u) => u.prefix))
function matchesUnreadablePrefix(id) {
  for (const p of unreadablePrefixes) {
    if (id.startsWith(p)) return true
  }
  return false
}
for (const u of unreadableSpecs) {
  writeOut(2, '⚠ spec unreadable: ' + u.rel + ' — every AC-ID under ' + u.prefix +
    ' is treated as unresolved, so tests citing them are kept')
}

const closingSpecAcIds = new Set()
if (closingSpecRel !== null) {
  for (const [id, owners] of acOwners) {
    if (owners.some((o) => o.specRel === closingSpecRel)) closingSpecAcIds.add(id)
  }
}

// ---- defect-class ids ------------------------------------------------------------------------------
function collectEscapeClasses() {
  const classes = new Set()
  let text
  try {
    text = fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8')
  } catch {
    return classes
  }
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let row
    try {
      row = JSON.parse(t)
    } catch {
      continue
    }
    if (typeof row.class === 'string' && row.class) classes.add(row.class)
    if (Array.isArray(row.incidents)) {
      for (const inc of row.incidents) {
        if (inc && typeof inc.class === 'string' && inc.class) classes.add(inc.class)
      }
    }
  }
  return classes
}
const escapeClasses = collectEscapeClasses()

// ---- walk the host's test-classified files, scan every call ------------------------------------
const testFiles = listTestFiles(root, config).map(relPosix).sort()

function citedAcIds(call) {
  const hay = (call.title || '') + '\n' + (call.commentAbove || '')
  return Array.from(new Set(hay.match(AC_ID_RE_GLOBAL) || []))
}

// allDone(ids): every cited AC-ID resolves to a done/superseded spec. The closing spec counts as done; a
// collided id needs EVERY owner done; an unresolved or unreadable-prefix id never counts.
function allCitedDone(ids) {
  return ids.every((id) => {
    if (matchesUnreadablePrefix(id)) return false
    const owners = acOwners.get(id)
    if (!owners || owners.length === 0) return false
    return owners.every((owner) => {
      if (closingSpecRel !== null && owner.specRel === closingSpecRel) return true
      return owner.status === 'done' || owner.status === 'superseded'
    })
  })
}

function classify(call, ids, file) {
  if (!allCitedDone(ids)) return 'open'
  for (const cls of escapeClasses) {
    if (call.callText.includes(cls)) return 'class'
  }
  const span = (call.title || '') + '\n' + (call.commentAbove || '')
  if (span.includes('[invariant]')) return 'invariant'
  if (span.includes('[pin]')) return 'pin'
  for (const id of ids) {
    const owners = acOwners.get(id) || []
    for (const owner of owners) {
      if (!owner.dateStr || owner.dateStr < EXPIRY_APPLIES_FROM) continue
      if (/SHALL CONTINUE TO/.test(normalizeForPinCheck(owner.raw))) return 'pin'
    }
  }
  const referenced = pinnedByReference.get(file)
  if (referenced && referenced.has(call.start)) return 'pin'
  return 'retired'
}

let scanned = 0
const kept = { class: 0, invariant: 0, pin: 0, open: 0 }
const retiredByFile = new Map() // file -> [{ call, ids }]
let retired = [] // every retired row; a refused span's row leaves it before render

for (const file of testFiles) {
  let src
  try {
    src = fs.readFileSync(path.join(root, file), 'utf8')
  } catch {
    continue
  }
  const calls = scanCases(root, config, file, src)
  scanned += calls.length
  for (const call of calls) {
    const ids = citedAcIds(call)
    if (ids.length === 0) continue // untagged — never read for anything else
    const inScope = closingSpecRel !== null
      ? ids.some((id) => closingSpecAcIds.has(id))
      : true // --all-done: every tagged test is in scope
    if (!inScope) continue
    const cls = classify(call, ids, file)
    if (cls === 'retired') {
      call.row = { file, acIds: ids, title: call.title }
      retired.push(call.row)
      if (!retiredByFile.has(file)) retiredByFile.set(file, [])
      retiredByFile.get(file).push(call)
    } else {
      kept[cls]++
    }
  }
}
const tagged = retired.length + kept.class + kept.invariant + kept.pin + kept.open

// ---- classify emptied on every run; disk writes stay behind --apply ----
// Span removal runs in memory on every run so a dry run reports the same `emptied` array an apply would.
const emptied = []
const emptiedSuites = [] // [{ file, title }] — describes this pass leaves with zero cases
const unscannable = [] // [{ file, title, reason }] — spans refused; each stays in its file uncut
const refused = new Set() // the `retired` rows those spans carried
const writes = [] // [{ abs, before, after }] — after:null deletes; performed only under --apply

// A span is cut only when visibly bounded (a misread host file can yield a span that eats a sibling):
// it ends on its own `)`, closes at its opening line's indent, and no line-start case/describe inside it
// falls outside `inner`. Returns why not, or null.
const LINE_START_CALL_RE =
  /^[ \t]*(?:(?:test|it)(?:\.(?:only|skip|concurrent|sequential|fails|todo|fixme))*(?:\s*\(\s*['"`]|\.(?:each|for)\b)|describe\b[\w.]*\s*\()/
let hostSiblings = [] // the current file's span-carrying host cases (unboundedReason reads it)
function unboundedReason(src, rec, inner) {
  if (rec.cuttable === false) return 'its span is not known \u2014 the host scanner printed no start/end'
  if (rec.source === 'host') {
    // The host declared this span: only a not-retired case inside it is refused (no JavaScript
    // paren or indent reading of a file the plugin cannot parse).
    for (const o of hostSiblings) {
      if ((o.start !== rec.start || o.end !== rec.end) && o.start >= rec.start && o.end <= rec.end && !inner.some((r) => r.start === o.start && r.end === o.end)) {
        return 'it holds a test or describe that is not retired'
      }
    }
    return null
  }
  const lineStart = rec.start + rec.commentAbove.length
  const indent = /^[ \t]*/.exec(src.slice(lineStart, lineStart + 200))[0]
  const callEnd = lineStart + indent.length + rec.callText.length
  if (src[callEnd - 1] !== ')') return 'its call never closes before the end of the file'
  const closeLineStart = src.lastIndexOf('\n', callEnd - 1) + 1
  const closeIndent = /^[ \t]*/.exec(src.slice(closeLineStart, closeLineStart + 200))[0]
  if (closeLineStart !== lineStart && closeIndent !== indent) {
    return 'its closing line is indented differently from its opening line'
  }
  for (let nl = src.indexOf('\n', lineStart); nl !== -1 && nl + 1 < callEnd; nl = src.indexOf('\n', nl + 1)) {
    const ls = nl + 1
    if (!LINE_START_CALL_RE.test(src.slice(ls, ls + 200))) continue
    if (!inner.some((r) => r.start <= ls && ls < r.end)) return 'it holds a test or describe that is not retired'
  }
  return null
}

for (const [file, calls] of retiredByFile) {
  const abs = path.join(root, file)
  let src
  try {
    src = fs.readFileSync(abs, 'utf8')
  } catch {
    continue
  }
  hostSiblings = calls.some((c) => c.source === 'host')
    ? scanCases(root, config, file, src).filter((c) => c.cuttable !== false)
    : []
  // A retired case whose span is not visibly bounded is never cut: its row moves from `retired`
  // to `unscannable` and it stays in the file, while every bounded case beside it is still cut.
  const refuse = (c, reason) => {
    unscannable.push({ file, title: c.title, reason })
    refused.add(c.row)
  }
  let removals = []
  for (const c of calls) {
    const reason = unboundedReason(src, c, [])
    if (reason) refuse(c, reason)
    else removals.push({ start: c.start, end: c.end, call: c })
  }
  // A line-start describe( left with no case or describe once its removals are cut goes too (inner first) —
  // vitest fails an empty suite. An unbounded emptied describe keeps every case inside it.
  const retiredOnly = removals.slice()
  for (const d of scanDescribes(src).sort((a, b) => b.start - a.start)) {
    const inside = (r) => r.start >= d.start && r.end <= d.end
    if (!retiredOnly.some(inside)) continue
    const callStart = src.indexOf('describe(', d.start + d.commentAbove.length)
    const callEnd = callStart + d.callText.length
    let body = ''
    let pos = callStart + 'describe('.length
    for (const r of removals.filter(inside).sort((a, b) => a.start - b.start)) {
      if (r.start < pos) continue
      body += src.slice(pos, r.start)
      pos = r.end
    }
    body += src.slice(pos, callEnd)
    if (body.split('\n').some((line) => LINE_START_CALL_RE.test(line))) continue
    const reason = unboundedReason(src, d, removals)
    if (reason) {
      for (const r of removals.filter(inside)) {
        if (r.call) refuse(r.call, 'its describe ' + JSON.stringify(d.title) + ' cannot be bounded — ' + reason)
      }
      removals = removals.filter((r) => !inside(r))
      continue
    }
    removals.push({ start: d.start, end: d.end, title: d.title })
  }
  for (const r of removals) if (r.title) emptiedSuites.push({ file, title: r.title })
  if (removals.length === 0) continue
  // Merge retired spans before cutting: identical spans collapse, overlapping or touching spans
  // become their union, so each byte is cut at most once.
  const merged = []
  for (const r of removals.slice().sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push({ start: r.start, end: r.end })
  }
  const spans = merged
    .map((r) => ({ start: r.start, end: src[r.end] === '\n' && src[r.end - 1] !== '\n' ? r.end + 1 : r.end }))
    .sort((a, b) => b.start - a.start)
  const before = src
  for (const { start, end } of spans) {
    src = src.slice(0, start) + src.slice(end)
  }
  // Collapse a run of three-or-more blank lines down to one.
  const lines = src.split('\n')
  const collapsed = []
  let blankRun = 0
  for (const line of lines) {
    if (line.trim() === '') {
      blankRun++
      if (blankRun <= 2) collapsed.push(line)
    } else {
      blankRun = 0
      collapsed.push(line)
    }
  }
  src = collapsed.join('\n')

  // A kept case the scanner misread is invisible to scanCalls but still starts a line, so a file
  // with any line-start titled case or describe left is never deleted.
  const hostFile = calls.some((c) => c.source === 'host')
  if (!hostFile && scanCalls(src).length === 0 && !src.split('\n').some((line) => LINE_START_CALL_RE.test(line))) {
    emptied.push(file)
    writes.push({ abs, before, after: null })
  } else {
    writes.push({ abs, before, after: src })
  }
}

retired = retired.filter((r) => !refused.has(r))

// ---- --apply: write, then the host's gate decides whether the writes stay -----------------------
let gate = noGate && apply ? { skipped: 'no-gate' } : null
if (apply && writes.length > 0) {
  for (const w of writes) {
    if (w.after !== null) {
      fs.writeFileSync(w.abs, w.after)
      continue
    }
    fs.unlinkSync(w.abs)
    let dir = path.dirname(w.abs)
    while (dir !== root && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir)
      dir = path.dirname(dir)
    }
  }
  // A {testDirs}/{scopeDirs}/{testFiles} gate points at the test files the sweep left in the directories it touched;
  // a root-level test file ('.' dirname vs '' relPosix) must count as surviving.
  const touchedDirs = new Set(writes.map((w) => relPosix(path.dirname(w.abs)) || '.'))
  const emptiedSet = new Set(emptied)
  const surviving = testFiles.filter((f) => !emptiedSet.has(f) && touchedDirs.has(path.posix.dirname(f)))
  const declared = config && typeof config.gateCommand === 'string' ? config.gateCommand.trim() : ''
  const placeholder = /\{testDirs\}|\{scopeDirs\}|\{testFiles\}/.test(declared)
  const command = placeholder && surviving.length === 0 ? '' : resolveGateForFiles(declared, surviving)
  if (noGate) {
    // writes stay; the caller's own gate certifies the tree
  } else if (!command) {
    writeOut(2, (placeholder
      ? '⚠ the sweep left no test file in the directories it touched to point the gateCommand\'s ' +
        '{testDirs}/{scopeDirs}/{testFiles} at'
      : '⚠ no gateCommand in the host config') +
      ' — the applied sweep was not checked; run the host\'s gates before committing it')
  } else {
    const run = hostRun.run(command, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
    })
    const ok = run.status === 0
    const reverted = !ok
    if (reverted) {
      for (const w of writes) {
        fs.mkdirSync(path.dirname(w.abs), { recursive: true })
        fs.writeFileSync(w.abs, w.before)
      }
    }
    gate = { command, ok, reverted }
    if (!ok) {
      const tail = ((run.stdout || '') + (run.stderr || '') + (run.error ? String(run.error) : ''))
        .trimEnd().split('\n').slice(-40).join('\n')
      writeOut(2, 'expire-tests: the host gate `' + command + '` went red after the sweep (exit ' +
        (run.status === null ? run.signal : run.status) + ') — ' +
        'every touched file is restored; fix what the gate names in the kept code, then rerun with --apply' +
        '\n' + tail)
    }
  }
}
const exitCode = gate && gate.ok === false ? 1 : 0

// ---- render --------------------------------------------------------------------------------------
const scope = closingSpecRel !== null ? 'spec:' + closingSpecRel : 'all-done'
const applied = apply && !(gate && gate.reverted)
const result = { scope, scanned, tagged, kept, retired, emptied, emptiedSuites, unscannable, applied, gate }
for (const u of unscannable) {
  writeOut(2, 'expire-tests: left ' + u.file + ' untouched — ' + JSON.stringify(u.title) + ': ' + u.reason +
    '; its retired tests stay until it is trimmed by hand')
}

if (asJson) {
  writeOut(1, JSON.stringify(result))
  process.exit(exitCode)
}

const lines = retired.map((r) => 'retire ' + r.file + ' — ' + r.title)
const keptTotal = kept.class + kept.invariant + kept.pin + kept.open
lines.push('expiry: scanned ' + scanned + ' tagged ' + tagged + ' kept ' + keptTotal +
  ' retired ' + retired.length + (unscannable.length ? ' unscannable ' + unscannable.length : '') + ' (' +
  (!apply ? 'dry run' : gate && gate.reverted ? 'reverted: gate red' : gate && gate.ok === false ? 'applied: gate red' : 'applied') + ')')
writeOut(1, lines.join('\n'))
process.exit(exitCode)
