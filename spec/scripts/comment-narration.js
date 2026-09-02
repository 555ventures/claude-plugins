#!/usr/bin/env node
'use strict'
// comment-narration.js — usage:
//   node comment-narration.js --root <dir> [--baseline <file>] [--hosts <csv>] [--people <csv>] [--json]
//   node comment-narration.js --rules-mode <hostRoot> [--baseline <file>] [--hosts <csv>] [--people <csv>] [--json]
//   node comment-narration.js --root <dir> --code-identical <ref> [--json]
//
// Owner: specs/20260902/01-comment-narration-gate.md D1-D7.
//
// Classifies every whole-line comment under the code-group directories, and every prose
// line under the doctrine-group directories, against six narration classes (date, version,
// prior, story, host, person); checks each scanned file's finding count against an optional
// ratchet baseline; and certifies a comment-only diff against a git ref via --code-identical.
//
// Deliberately does NOT: treat a trailing // after code, a /* */ block, or a * continuation
// line as a comment (whole-line only); write, regenerate, or otherwise touch a baseline file
// (hand-maintained, read-only here); judge which finding to fix — that stays with the sweep
// worker or the session running --code-identical.
//
// Exit codes:
//   0  no findings (baseline given: every scanned file at or under its count) ·
//      --code-identical: every file identical
//   1  findings present (baseline given: at least one file over its count) ·
//      --code-identical: at least one file differs
//   2  bad invocation: no mode, two modes together, an unreadable --root, an unreadable or
//      non-object --baseline, or an unresolvable --code-identical ref — stderr names the
//      remedy

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const USAGE = 'usage: node comment-narration.js --root <dir> | --rules-mode <hostRoot> | ' +
  '--root <dir> --code-identical <ref>'

function syncWrite(fd, str) {
  const buf = Buffer.from(str, 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}
function writeOut(str) { syncWrite(1, str.endsWith('\n') ? str : str + '\n') }
function writeErr(str) { syncWrite(2, str.endsWith('\n') ? str : str + '\n') }

function usageError(msg) {
  writeErr(`comment-narration: ${msg} — ${USAGE}`)
  process.exit(2)
}

function isReadableDir(p) {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}

// ---- D3 discriminator ----------------------------------------------------

function isCodeCommentLine(rawLine, isFirstLine) {
  const t = rawLine.trim()
  if (isFirstLine && t.startsWith('#!')) return false
  if (t.startsWith('//')) return true
  if (t.startsWith('#')) {
    const c = t[1]
    if (c === undefined) return true
    return !/[A-Za-z0-9_$]/.test(c)
  }
  return false
}

// ---- D4 classes ------------------------------------------------------------

const DATE_RE = /\b20\d{2}-\d{2}(-\d{2})?\b/
const MONTH_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? 20\d{2}\b/i
const VERSION_RE = /\bv?\d+\.\d+\.\d+\b/
const PRIOR_RE = /\b(previously|no longer|used to|formerly|originally|the original|was (?:deleted|removed|renamed|added|dropped|retired)|since (?:deleted|removed)|deleted at|retracted|now (?:lives|returns|reads|emits|counts|uses)|had been|before this (?:spec|change|fix)|pre-v\d)\b/i
const STORY_RE = /\b(caught at (?:review|build|lock)|found at review|fixed in the same session|fail-open fix|the (?:first|second|third|fourth|fifth|sixth) (?:recurrence|such)|founding incident)\b/i

function blankBackticks(line) {
  return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildLiteralRes(csv) {
  if (!csv) return []
  return csv.split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => new RegExp('\\b' + escapeRegExp(s) + '\\b', 'i'))
}

function classify(line, hostRes, peopleRes) {
  const classes = []
  if (DATE_RE.test(line) || MONTH_RE.test(line)) classes.push('date')
  if (VERSION_RE.test(blankBackticks(line))) classes.push('version')
  if (PRIOR_RE.test(line)) classes.push('prior')
  if (STORY_RE.test(line)) classes.push('story')
  if (hostRes.some((re) => re.test(line))) classes.push('host')
  if (peopleRes.some((re) => re.test(line))) classes.push('person')
  return classes
}

// ---- directory walking -----------------------------------------------------

function walkDir(dirAbs, root, results, opts, recursive) {
  let entries
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true })
  } catch {
    return
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const e of entries) {
    const abs = path.join(dirAbs, e.name)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (opts.excludeRel && opts.excludeRel(rel)) continue
    if (e.isDirectory()) {
      if (recursive) walkDir(abs, root, results, opts, recursive)
    } else if (e.isFile()) {
      if (!opts.filter || opts.filter(rel)) results.push(rel)
    }
  }
}

function collectFiles(root, dirs, opts = {}) {
  const results = []
  for (const d of dirs) {
    walkDir(path.join(root, d), root, results, opts, opts.recursive !== false)
  }
  return results
}

// ---- scanning ---------------------------------------------------------------

function scanCodeFile(root, rel, findings, hostRes, peopleRes) {
  let raw
  try {
    raw = fs.readFileSync(path.join(root, rel), 'utf8')
  } catch {
    return 0
  }
  const lines = raw.split('\n')
  let count = 0
  lines.forEach((line, i) => {
    if (!isCodeCommentLine(line, i === 0)) return
    const classes = classify(line, hostRes, peopleRes)
    if (classes.length) {
      findings.push({ file: rel, line: i + 1, classes, text: line.trim() })
      count++
    }
  })
  return count
}

function scanProseFile(root, rel, findings, hostRes, peopleRes) {
  let raw
  try {
    raw = fs.readFileSync(path.join(root, rel), 'utf8')
  } catch {
    return 0
  }
  const lines = raw.split('\n')
  let count = 0
  let inFence = false
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('```')) { inFence = !inFence; return }
    if (inFence) return
    const classes = classify(line, hostRes, peopleRes)
    if (classes.length) {
      findings.push({ file: rel, line: i + 1, classes, text: line.trim() })
      count++
    }
  })
  return count
}

const CODE_DIRS = ['spec/scripts', 'spec/bin', 'scripts', 'tests']
const PROSE_DIRS = ['spec/commands', 'spec/doctrine', 'spec/agents', 'spec/templates',
  'git/commands', '.claude/rules', '.claude/agents']

function excludeFixtures(rel) {
  return rel === 'tests/fixtures' || rel.startsWith('tests/fixtures/')
}

function runPluginScan(root, baseline, hostRes, peopleRes, jsonMode) {
  if (!isReadableDir(root)) usageError(`--root ${root} is not a readable directory`)
  const codeFiles = collectFiles(root, CODE_DIRS, { excludeRel: excludeFixtures })
  const proseFiles = collectFiles(root, PROSE_DIRS, { filter: (rel) => rel.endsWith('.md') })

  const findings = []
  const files = {}
  for (const rel of codeFiles) files[rel] = scanCodeFile(root, rel, findings, hostRes, peopleRes)
  for (const rel of proseFiles) files[rel] = scanProseFile(root, rel, findings, hostRes, peopleRes)

  finishScan('plugin', findings, files, baseline, jsonMode)
}

function runRulesMode(hostRoot, baseline, hostRes, peopleRes, jsonMode) {
  const rulesFiles = collectFiles(hostRoot, ['.claude/rules'], { filter: (rel) => rel.endsWith('.md') })
  const agentsFiles = collectFiles(hostRoot, ['.claude/agents'],
    { filter: (rel) => rel.endsWith('.md'), recursive: false })

  const findings = []
  const files = {}
  for (const rel of [...rulesFiles, ...agentsFiles]) {
    files[rel] = scanProseFile(hostRoot, rel, findings, hostRes, peopleRes)
  }

  const efPath = path.join(hostRoot, '.claude/rules/enforcement.json')
  if (fs.existsSync(efPath)) {
    let raw, parsed
    try {
      raw = fs.readFileSync(efPath, 'utf8')
    } catch (e) {
      usageError(`cannot read .claude/rules/enforcement.json (${e.code || e.message})`)
    }
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      usageError(`.claude/rules/enforcement.json is not valid JSON (${e.message})`)
    }
    if (Array.isArray(parsed)) {
      parsed.forEach((entry, idx) => {
        if (entry && typeof entry.notes === 'string') {
          const pseudo = `.claude/rules/enforcement.json#${entry.id}`
          const classes = classify(entry.notes, hostRes, peopleRes)
          if (classes.length) findings.push({ file: pseudo, line: idx + 1, classes, text: entry.notes.trim() })
          files[pseudo] = classes.length ? 1 : 0
        }
      })
    }
  }

  finishScan('rules', findings, files, baseline, jsonMode)
}

function finishScan(mode, findings, files, baseline, jsonMode) {
  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : (a.file < b.file ? -1 : 1)))
  const totalCount = findings.length
  const fileCount = Object.keys(files).length

  const overage = []
  if (baseline !== null) {
    for (const [file, count] of Object.entries(files)) {
      const base = Object.prototype.hasOwnProperty.call(baseline, file) ? baseline[file] : 0
      if (count > base) overage.push({ file, count, base })
    }
    overage.sort((a, b) => (a.file < b.file ? -1 : 1))
  }

  if (jsonMode) {
    writeOut(JSON.stringify({ mode, findings, files, total: totalCount }))
  } else {
    const lines = findings.map((f) => {
      const text = f.text.length > 160 ? f.text.slice(0, 160) : f.text
      return `${f.file}:${f.line} [${f.classes.join(',')}] ${text}`
    })
    lines.push(`${totalCount} findings in ${fileCount} files`)
    writeOut(lines.join('\n'))
  }

  if (overage.length) {
    for (const o of overage) {
      writeErr(`comment-narration: ${o.file}: ${o.count} findings > baseline ${o.base} — ` +
        'remove narration, never raise the baseline')
    }
    process.exit(1)
  }

  const exitCode = baseline !== null ? 0 : (totalCount > 0 ? 1 : 0)
  process.exit(exitCode)
}

// ---- D7 oracle --------------------------------------------------------------

function stripCode(text) {
  const lines = text.split('\n')
  const kept = []
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t === '') return
    if (isCodeCommentLine(line, i === 0)) return
    kept.push(t)
  })
  return kept.join('\n')
}

function runOracle(root, ref, jsonMode) {
  if (!isReadableDir(root)) usageError(`--root ${root} is not a readable directory`)

  const gitDir = spawnSync('git', ['-C', root, 'rev-parse', '--git-dir'], { encoding: 'utf8' })
  if (gitDir.status !== 0) usageError(`${root} is not a git repository (git rev-parse --git-dir failed)`)

  const verify = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    { encoding: 'utf8' })
  if (verify.status !== 0) {
    usageError(`--code-identical ref "${ref}" is not resolvable in ${root} (git rev-parse failed)`)
  }

  const lsFiles = spawnSync('git', ['-C', root, 'ls-files', '--', ...CODE_DIRS], { encoding: 'utf8' })
  if (lsFiles.status !== 0) usageError(`git ls-files failed in ${root} (${lsFiles.stderr.trim()})`)
  const currentFiles = lsFiles.stdout.split('\n').filter(Boolean).filter((f) => !excludeFixtures(f)).sort()

  const lsTree = spawnSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', ref, '--', ...CODE_DIRS],
    { encoding: 'utf8' })
  if (lsTree.status !== 0) usageError(`git ls-tree failed for ref ${ref} in ${root} (${lsTree.stderr.trim()})`)
  const baseFiles = lsTree.stdout.split('\n').filter(Boolean).filter((f) => !excludeFixtures(f)).sort()
  const currentSet = new Set(currentFiles)

  const differ = []
  for (const rel of currentFiles) {
    const show = spawnSync('git', ['-C', root, 'show', `${ref}:${rel}`], { encoding: 'utf8' })
    if (show.status !== 0) { differ.push({ file: rel, reason: 'missing-at-base' }); continue }
    let worktreeText
    try {
      worktreeText = fs.readFileSync(path.join(root, rel), 'utf8')
    } catch {
      differ.push({ file: rel, reason: 'missing-at-base' })
      continue
    }
    if (stripCode(show.stdout) !== stripCode(worktreeText)) differ.push({ file: rel, reason: 'code-changed' })
  }
  for (const rel of baseFiles) {
    if (!currentSet.has(rel)) differ.push({ file: rel, reason: 'deleted' })
  }

  const unionCount = new Set([...currentFiles, ...baseFiles]).size

  if (jsonMode) {
    writeOut(JSON.stringify({ mode: 'code-identical', base: ref, files: unionCount, differ }))
  } else {
    const lines = differ.map((d) => `${d.file} ${d.reason}`)
    lines.push(differ.length ? `${differ.length} files differ` : `identical: ${unionCount} files`)
    writeOut(lines.join('\n'))
  }
  process.exit(differ.length ? 1 : 0)
}

// ---- argv parsing + dispatch -------------------------------------------------

let root = null
let rulesMode = null
let codeIdentical = null
let baselinePath = null
let hostsCsv = ''
let peopleCsv = ''
let jsonMode = false

const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--rules-mode') rulesMode = argv[++i]
  else if (a === '--code-identical') codeIdentical = argv[++i]
  else if (a === '--baseline') baselinePath = argv[++i]
  else if (a === '--hosts') hostsCsv = argv[++i]
  else if (a === '--people') peopleCsv = argv[++i]
  else if (a === '--json') jsonMode = true
  else usageError(`unrecognized argument "${a}"`)
}

if (root !== null && rulesMode !== null) usageError('--root and --rules-mode cannot both be given')
if (root === null && rulesMode === null) usageError('no mode given: pass --root <dir> or --rules-mode <hostRoot>')
if (codeIdentical !== null && rulesMode !== null) usageError('--code-identical requires --root, not --rules-mode')

const hostRes = buildLiteralRes(hostsCsv)
const peopleRes = buildLiteralRes(peopleCsv)

let baseline = null
if (baselinePath !== null) {
  let raw
  try {
    raw = fs.readFileSync(baselinePath, 'utf8')
  } catch (e) {
    usageError(`cannot read --baseline ${baselinePath} (${e.code || e.message})`)
  }
  try {
    baseline = JSON.parse(raw)
  } catch (e) {
    usageError(`--baseline ${baselinePath} is not valid JSON (${e.message})`)
  }
  if (baseline === null || typeof baseline !== 'object' || Array.isArray(baseline)) {
    usageError(`--baseline ${baselinePath} must be a JSON object of {"path": count}`)
  }
}

if (rulesMode !== null) {
  runRulesMode(rulesMode, baseline, hostRes, peopleRes, jsonMode)
} else if (codeIdentical !== null) {
  runOracle(root, codeIdentical, jsonMode)
} else {
  runPluginScan(root, baseline, hostRes, peopleRes, jsonMode)
}
