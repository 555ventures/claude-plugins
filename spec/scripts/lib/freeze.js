'use strict'
// lib/freeze.js — the freeze's steps as exported functions, called in order by
// prototype-driver.js's `--mark frozen` and `--mark tests-derived` handlers.
//
// WHY: specs/20260928/02-freeze-export-and-the-contract.md D2 — the freeze is a long ordered
// sequence (gate → composites → captures → contract → spec reservation, then export → generated
// spec → deletion → ledger); keeping each step here as a small, independently callable function
// is what keeps prototype-driver.js's own mark handlers readable as an ordered list of calls
// rather than one long inline block. This module is not an entry point — every function here is
// reached only through the driver's own ACs (AC-20260928-02-4 .. AC-20260928-02-11), and none of
// them owns status.json/marks bookkeeping: the driver reads/writes status.json itself and passes
// this module whatever facts each step needs, so the persisted-state contract stays in one place.
//
// specs/20261001/01-the-freeze-signs-in-and-derives-its-tier.md D5/D7: `riskTierHits` matches the
// generated File Plan paths against the host rules' § Risk Tiers code spans (paths only, never
// diff content), and `writeSpec` renders the derived tier and its Rationale basis sentence.
//
// What this deliberately does NOT do: read or write design/prototypes/<stem>/status.json, decide
// which mark a driver invocation should record, or print anything to stdout/stderr — every
// function returns a plain result object (`{ ok: true, ... }` or `{ ok: false, message }`) and
// the driver is the sole place a refusal becomes a stderr line + exit code.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { globMatch } = require('./glob-match')
const { CONFIG_RELPATH } = require('./host-config')

// ---------------------------------------------------------------------------
// D3(2): compositeNames — kit-composite names declared for this host.
// ---------------------------------------------------------------------------
function toPascalCase(basename) {
  return basename
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function compositeNames(root, config) {
  const approvalPath = path.join(root, 'docs/design/approval.json')
  if (fs.existsSync(approvalPath)) {
    try {
      const doc = JSON.parse(fs.readFileSync(approvalPath, 'utf8'))
      return Object.keys((doc && doc.composites) || {})
    } catch {
      return []
    }
  }
  const kitDir = config.design && config.design.kit
  if (!kitDir) return []
  const abs = path.join(root, kitDir)
  let entries
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile())
    .map((e) => toPascalCase(path.basename(e.name, path.extname(e.name))))
}

// ---------------------------------------------------------------------------
// D3(4): gateCheck — the host gate run on the prototype tree.
// ---------------------------------------------------------------------------
function gateCheck({ root, worktreePath, config, designDir, stem }) {
  const declaredGate = config.prototype && config.prototype.gate
  const hostGate = config.gateCommand
  let cmd = declaredGate
  if (!cmd) {
    if (typeof hostGate === 'string' && /\{testDirs\}|\{scopeDirs\}/.test(hostGate)) {
      return {
        ok: false,
        ranGate: false,
        message: 'prototype.gate is not declared and the host gateCommand carries {testDirs}/{scopeDirs} ' +
          '— declare prototype.gate (a fixed command, no placeholders) before freezing',
      }
    }
    cmd = hostGate
  }
  if (!cmd) {
    return { ok: false, ranGate: false, message: 'prototype.gate is not declared and the host has no gateCommand — declare prototype.gate' }
  }
  const r = spawnSync('bash', ['-c', cmd], { cwd: worktreePath, encoding: 'utf8' })
  const combined = (r.stdout || '') + (r.stderr || '')
  fs.mkdirSync(designDir, { recursive: true })
  const logPath = path.join(designDir, 'gate.log')
  fs.writeFileSync(logPath, combined)
  if (r.status !== 0) {
    return {
      ok: false,
      ranGate: true,
      logPath,
      message: 'kit gates red on proto/' + stem + ' — see ' + path.relative(root, logPath),
    }
  }
  return { ok: true, ranGate: true, logPath }
}

// ---------------------------------------------------------------------------
// D3(6): captureAll — one proto-capture.js (or PROTO_CAPTURE_BIN) invocation per route x state.
// ---------------------------------------------------------------------------
function routeSlug(routePath) {
  if (routePath === '/') return 'root'
  let s = routePath.replace(/\//g, '_')
  if (s.startsWith('_')) s = s.slice(1)
  return s
}

// `viewport` is the one size the driver resolved from states.json and also writes into the
// contract, so the contract never names a size the captures did not use.
// `baseUrl` is the resolved app address (a {port} url already substituted; D7); omitted = the
// config's own prototype.url. Contract urls stay the relative statePath.
// Omitted = 1280x800 so the lib stays callable standalone. Each capture file's own recorded
// `viewport` is checked against it; a capture doc with no `viewport` key passes (older/stub
// tools record none, and refusing them would break every caller that never recorded one).
function captureAll({ root, designDir, config, statesDoc, composites, viewport, baseUrl }) {
  const base = baseUrl || config.prototype.url
  const size = viewport || { width: 1280, height: 800 }
  const sizeText = size.width + 'x' + size.height
  const captureBin = process.env.PROTO_CAPTURE_BIN || path.join(__dirname, '..', 'proto-capture.js')
  const capturesDir = path.join(designDir, 'captures')
  fs.mkdirSync(capturesDir, { recursive: true })
  const routesOut = {}
  const idSet = new Set()
  let stateCount = 0

  for (const [routePath, states] of Object.entries(statesDoc.routes || {})) {
    const slug = routeSlug(routePath)
    routesOut[routePath] = {}
    for (const [stateName, statePath] of Object.entries(states || {})) {
      stateCount++
      const url = base + statePath
      const outFile = path.join(capturesDir, slug + '--' + stateName + '.json')
      const r = spawnSync(process.execPath, [
        captureBin, '--host', root, '--url', url, '--out', outFile, '--composites', composites.join(','),
        '--viewport', sizeText,
      ], { cwd: root, encoding: 'utf8', env: process.env })
      if (r.status !== 0) {
        return { ok: false, message: (r.stderr || '').trim() || 'capture failed for ' + url + ' (exit ' + r.status + ')' }
      }
      let capture
      try {
        capture = JSON.parse(fs.readFileSync(outFile, 'utf8'))
      } catch (e) {
        return { ok: false, message: 'capture wrote unreadable JSON at ' + outFile + ': ' + e.message }
      }
      const got = capture && capture.viewport
      if (got && typeof got === 'object' && (got.width !== size.width || got.height !== size.height)) {
        return {
          ok: false,
          message: url + ' captured at ' + got.width + 'x' + got.height + ', not the requested ' + sizeText +
            ' — check PROTO_CAPTURE_BIN honours --viewport, then re-run --mark frozen',
        }
      }
      for (const entry of capture.entries || []) idSet.add(entry.id)
      routesOut[routePath][stateName] = {
        url: statePath,
        capture: 'captures/' + path.basename(outFile),
      }
    }
  }

  return {
    ok: true,
    routes: routesOut,
    ids: [...idSet],
    routeCount: Object.keys(routesOut).length,
    stateCount,
    captureCount: stateCount,
  }
}

// ---------------------------------------------------------------------------
// D3(7): writeContract.
// ---------------------------------------------------------------------------
function writeContract({ designDir, brief, stem, base, viewport, routes, composites, ids, pinsTest, pinsLook, spec, e2eFile, tests }) {
  const contract = {
    schemaVersion: 1,
    brief,
    stem,
    frozenAt: new Date().toISOString(),
    base,
    viewport,
    routes,
    composites,
    ids,
    pins: { test: pinsTest, look: pinsLook },
    spec,
    e2eFile,
    tests,
  }
  fs.mkdirSync(designDir, { recursive: true })
  fs.writeFileSync(path.join(designDir, 'contract.json'), JSON.stringify(contract, null, 2) + '\n')
  return contract
}

// ---------------------------------------------------------------------------
// D3(8): reserveSpec — the next free two-digit spec number for today's date directory
// (spec-number-check.js's own derivation: the leading NN of `NN-*.md`/`NNa-*.md`).
// ---------------------------------------------------------------------------
function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function nextFreeSpecNumber(root, dateStamp) {
  const dir = path.join(root, 'specs', dateStamp)
  let entries = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return 1
  }
  let max = 0
  for (const name of entries) {
    const m = /^(\d{2})[a-z]?-.+\.md$/.exec(name)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

function reserveSpec(root, brief, briefSlug, behaviourPinIds) {
  const today = todayStamp()
  const nn = String(nextFreeSpecNumber(root, today)).padStart(2, '0')
  const specPath = 'specs/' + today + '/' + nn + '-' + briefSlug + '.md'
  const tests = behaviourPinIds.map((pinId, i) => ({ pin: pinId, ac: 'AC-' + today + '-' + nn + '-' + (i + 1) }))
  return { specPath, today, nn, tests }
}

// ---------------------------------------------------------------------------
// D5: exportHarden.
// ---------------------------------------------------------------------------
function gitBranchExists(root, name) {
  const r = spawnSync('git', ['-C', root, 'branch', '--list', name], { encoding: 'utf8' })
  return r.status === 0 && r.stdout.trim() !== ''
}

function classifyGlob(filePath, exportGlobs) {
  for (const g of exportGlobs) if (globMatch(g, filePath)) return g
  return exportGlobs[0]
}

function writeSubPlan(briefPath, files, exportGlobs) {
  const grouped = new Map()
  for (const g of exportGlobs) grouped.set(g, [])
  for (const f of files) {
    const g = classifyGlob(f.path, exportGlobs)
    if (!grouped.has(g)) grouped.set(g, [])
    grouped.get(g).push(f)
  }
  const lines = ['```harden']
  for (const [g, fs_] of grouped) {
    if (fs_.length === 0) continue
    lines.push(g)
    for (const f of fs_) lines.push('  ' + f.status + ' ' + f.path)
  }
  lines.push('```')
  const section = '## Data/API sub-plan\n\n' + lines.join('\n') + '\n'

  let brief = ''
  try {
    brief = fs.readFileSync(briefPath, 'utf8')
  } catch {
    brief = ''
  }
  // A previous section is replaced WHOLE, up to the next `## ` heading or end of file — never
  // just its heading line. `/^## Data\/API sub-plan\n[\s\S]*?(?=\n## |$)/m` looks like it does
  // that, but the `m` flag also makes `$` match end-of-LINE, so the lazy `[\s\S]*?` stops at the
  // first line break inside the section instead of the next heading, leaving the stale block's
  // own content behind. Locating the heading and the next heading as plain string searches
  // (never anchoring `$` under `m`) avoids that trap.
  const headingMatch = /^## Data\/API sub-plan\n/m.exec(brief)
  if (headingMatch) {
    const afterHeading = headingMatch.index + headingMatch[0].length
    const nextHeadingAt = brief.indexOf('\n## ', afterHeading)
    const sectionEnd = nextHeadingAt === -1 ? brief.length : nextHeadingAt
    brief = brief.slice(0, headingMatch.index) + section + brief.slice(sectionEnd)
  } else {
    brief = brief.replace(/\n*$/, '\n') + '\n' + section
  }
  fs.writeFileSync(briefPath, brief)
}

function exportHarden({ root, branch, stem, base, exportGlobs, alreadyExported, briefPath }) {
  const hardenBranch = 'harden/' + stem
  if (alreadyExported) return { skipped: true, hardenBranch }

  if (gitBranchExists(root, hardenBranch)) {
    return { ok: false, message: hardenBranch + ' exists — delete it or restore status.json' }
  }

  // The brief's sub-plan is written BEFORE harden/<stem> exists: a failure here (an unwritable
  // brief path) then leaves no branch behind for the rerun's "exists" refusal to wedge on. The
  // section is replaced whole, so a rerun after a later failure rewrites it idempotently.
  const pathspecs = exportGlobs.map((g) => ':(glob)' + g)
  const nameStatus = spawnSync('git', ['-C', root, 'diff', '--name-status', base + '...' + branch, '--', ...pathspecs], { encoding: 'utf8' })
  const files = (nameStatus.stdout || '').trim().split('\n').filter(Boolean).map((line) => {
    const [status, ...rest] = line.split('\t')
    return { status, path: rest.join('\t') }
  })
  if (files.length > 0) {
    try {
      writeSubPlan(briefPath, files, exportGlobs)
    } catch (e) {
      return { ok: false, message: 'cannot write the Data/API sub-plan into ' + briefPath + ' (' + e.message + ')' }
    }
  }

  const wtPath = path.join(root, '.claude/worktrees', 'harden-' + stem)
  const add = spawnSync('git', ['-C', root, 'worktree', 'add', wtPath, '-b', hardenBranch, base], { encoding: 'utf8' })
  if (add.status !== 0) {
    return { ok: false, message: 'git worktree add for ' + hardenBranch + ' failed: ' + (add.stderr || '').trim() }
  }

  const diff = spawnSync('git', ['-C', root, 'diff', base + '...' + branch, '--', ...pathspecs], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
  let commit = null
  if (diff.status === 0 && diff.stdout && diff.stdout.trim() !== '') {
    const apply = spawnSync('git', ['-C', wtPath, 'apply', '--index'], { input: diff.stdout, encoding: 'utf8' })
    if (apply.status !== 0) {
      spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' })
      return { ok: false, message: 'git apply --index into ' + hardenBranch + ' failed: ' + (apply.stderr || '').trim() }
    }
    const commitMsg = 'harden(' + stem + '): data and API layer exported from proto/' + stem
    const commitRes = spawnSync('git', ['-C', wtPath, 'commit', '-m', commitMsg], { encoding: 'utf8' })
    if (commitRes.status !== 0) {
      spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' })
      return { ok: false, message: 'git commit into ' + hardenBranch + ' failed: ' + (commitRes.stderr || '').trim() }
    }
    const rev = spawnSync('git', ['-C', wtPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
    commit = rev.stdout.trim()
  }

  const remove = spawnSync('git', ['-C', root, 'worktree', 'remove', wtPath], { encoding: 'utf8' })
  if (remove.status !== 0) spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' })

  return { ok: true, files, commit, hardenBranch }
}

// ---------------------------------------------------------------------------
// specs/20261005/05 D3: exportTests — carry the derived test file from proto/<stem> onto
// harden/<stem> as its own commit. Idempotent by branch content: skipped when the branch
// already holds e2eFile.
// ---------------------------------------------------------------------------
function exportTests({ root, branch, stem, base, e2eFile }) {
  const hardenBranch = 'harden/' + stem
  const has = spawnSync('git', ['-C', root, 'cat-file', '-e', hardenBranch + ':' + e2eFile], { encoding: 'utf8' })
  if (has.status === 0) return { skipped: true, hardenBranch }

  const wtPath = path.join(root, '.claude/worktrees', 'harden-' + stem)
  const fail = (step, r) => {
    spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' })
    return { ok: false, message: step + ' failed: ' + ((r && r.stderr) || '').trim() }
  }
  const add = spawnSync('git', ['-C', root, 'worktree', 'add', wtPath, hardenBranch], { encoding: 'utf8' })
  if (add.status !== 0) return fail('git worktree add for ' + hardenBranch, add)
  const diff = spawnSync('git', ['-C', root, 'diff', base + '...' + branch, '--', e2eFile], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
  if (diff.status !== 0) return fail('git diff ' + base + '...' + branch + ' -- ' + e2eFile, diff)
  const apply = spawnSync('git', ['-C', wtPath, 'apply', '--index'], { input: diff.stdout, encoding: 'utf8' })
  if (apply.status !== 0) return fail('git apply --index into ' + hardenBranch, apply)
  const commitRes = spawnSync('git', ['-C', wtPath, 'commit', '-m', 'harden(' + stem + '): derived behaviour tests from proto/' + stem], { encoding: 'utf8' })
  if (commitRes.status !== 0) return fail('git commit into ' + hardenBranch, commitRes)
  const rev = spawnSync('git', ['-C', wtPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const remove = spawnSync('git', ['-C', root, 'worktree', 'remove', wtPath], { encoding: 'utf8' })
  if (remove.status !== 0) spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' })
  return { ok: true, commit: rev.stdout.trim(), hardenBranch }
}

// ---------------------------------------------------------------------------
// D7: deletion — split into two postcondition-checking steps so the driver can persist
// status.json between them. dbDestroy is not assumed idempotent (a resume after a dirty-
// worktree refusal must not run it twice), so the driver records `marks.dbDestroyed` right
// after `runDbDestroy` succeeds, before ever attempting `removeProtoWorktreeAndBranch` — and
// passes `alreadyRan` back in on every subsequent call so a re-run skips it. Worktree removal
// and branch deletion each re-check their own postcondition first (registered / exists) so a
// re-run after either one already succeeded is a no-op rather than the wrong remedy.
// ---------------------------------------------------------------------------
function worktreeIsRegistered(root, worktreePath) {
  const r = spawnSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout) return false
  const realpath = (p) => { try { return fs.realpathSync(p) } catch { return path.resolve(p) } }
  const target = realpath(worktreePath)
  for (const line of r.stdout.split('\n')) {
    if (!line.startsWith('worktree ')) continue
    if (realpath(line.slice('worktree '.length)) === target) return true
  }
  return false
}

function runDbDestroy({ config, worktreePath, branch, brief, alreadyRan }) {
  if (alreadyRan) return { ok: true, ran: false }
  if (!(config.prototype && config.prototype.dbDestroy)) return { ok: true, ran: false }
  const env = Object.assign({}, process.env, { PROTO_BRANCH: branch, PROTO_WORKTREE: worktreePath, PROTO_BRIEF: brief })
  const r = spawnSync('bash', ['-c', config.prototype.dbDestroy], { cwd: worktreePath, encoding: 'utf8', env })
  if (r.status !== 0) {
    return { ok: false, message: 'prototype.dbDestroy failed (exit ' + r.status + '): ' + ((r.stdout || '') + (r.stderr || '')).trim() }
  }
  return { ok: true, ran: true }
}

function removeProtoWorktreeAndBranch({ root, worktreePath, branch, stem }) {
  if (worktreeIsRegistered(root, worktreePath)) {
    const remove = spawnSync('git', ['-C', root, 'worktree', 'remove', worktreePath], { encoding: 'utf8' })
    if (remove.status !== 0) {
      return {
        ok: false,
        message: 'commit or discard on proto/' + stem + ', then re-run the mark — git worktree remove failed: ' + (remove.stderr || '').trim(),
      }
    }
  }
  if (gitBranchExists(root, branch)) {
    const del = spawnSync('git', ['-C', root, 'branch', '-D', branch], { encoding: 'utf8' })
    if (del.status !== 0) {
      return { ok: false, message: 'git branch -D ' + branch + ' failed: ' + (del.stderr || '').trim() }
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// D8: ledgerRow — the plain object; the driver appends it through lib/driver-io.js's
// appendLedger so both drivers share the one JSONL-append implementation.
// ---------------------------------------------------------------------------
function ledgerRow({ specPath, brief, branch, rounds, pinsTotal, pinsBehaviour, pinsLook, routes, states, captures, exportedFiles, exportedCommit, hardenBranch }) {
  return {
    ts: new Date().toISOString(),
    stage: 'prototype',
    spec: specPath,
    brief,
    branch,
    rounds,
    pins: { total: pinsTotal, behaviour: pinsBehaviour, look: pinsLook },
    routes,
    states,
    captures,
    exported: { files: exportedFiles, commit: exportedCommit },
    harden: hardenBranch,
    verdict: 'frozen',
  }
}

// ---------------------------------------------------------------------------
// D6: writeSpec — token substitution into spec/templates/prototype-spec.md, whose header
// comment is the sole grammar authority for every {{…}} token below (never restated here).
// ---------------------------------------------------------------------------
// D6: the brief's `## Result` first paragraph, whole — up to the blank line that ends it or the
// next `## ` heading. The previous single regex (`/^## Result\n+([\s\S]*?)(?:\n\n|\n## |$)/m`)
// truncated a hard-wrapped paragraph to its first line: the `m` flag needed for `^` to match a
// heading mid-file also makes `$` match end-of-LINE, so the lazy capture group stopped at the
// first line break rather than the paragraph's real end. Locating the heading and the
// paragraph's end as plain string/non-`m` searches avoids that trap.
function briefFirstResultParagraph(briefText) {
  const text = briefText || ''
  const headingMatch = /^## Result\n+/m.exec(text)
  if (!headingMatch) return null
  const rest = text.slice(headingMatch.index + headingMatch[0].length)
  const endMatch = /\n[ \t]*\n|\n## /.exec(rest)
  const paragraph = endMatch ? rest.slice(0, endMatch.index) : rest
  const trimmed = paragraph.trim()
  return trimmed ? trimmed.replace(/\n/g, ' ') : null
}

function titleCase(briefSlug) {
  const words = briefSlug.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// pinsById: { [pinId]: { note, screen, state } } — read fresh from pins.json by the caller
// (still on disk at tests-derived time, before runDbDestroy/removeProtoWorktreeAndBranch run).
function writeSpec({ root, specPath, brief, briefSlug, briefText, contract, filePlanRows, e2eFile, pinsById, tier, tierHits }) {
  const templatePath = path.join(__dirname, '..', '..', 'templates', 'prototype-spec.md')
  let template = fs.readFileSync(templatePath, 'utf8')
  // Strip the leading HTML comment block (the token/grammar documentation) — it is authoring
  // guidance for this function, never part of the written spec.
  template = template.replace(/^<!--[\s\S]*?-->\n/, '')

  const today = specPath.match(/specs\/(\d{8})\//)[1]
  const dateFmt = today.slice(0, 4) + '-' + today.slice(4, 6) + '-' + today.slice(6, 8)
  const acIds = contract.tests.map((t) => t.ac)

  const filePlanRowLines = [
    ...filePlanRows.map((r) => '| ' + r.path + ' | ' + r.action + ' | ' + r.layer + ' | ' + (r.summary || '') + ' |'),
    '| ' + e2eFile + ' | CREATE | tests | derived behaviour tests, one per pin — ' + acIds.join(', ') + ' |',
  ].join('\n')

  const contractsBody =
    '`design/prototypes/' + contract.stem + '/contract.json` carries the frozen routes × states ' +
    'table and the captured composite ids:\n\n' +
    '| Route | State | URL |\n|-------|-------|-----|\n' +
    Object.entries(contract.routes || {}).flatMap(([routePath, states]) =>
      Object.entries(states || {}).map(([stateName, s]) => '| ' + routePath + ' | ' + stateName + ' | ' + (s.url || '') + ' |'),
    ).join('\n')

  const acceptanceCriteria = contract.tests.map((t) => {
    const pin = (pinsById && pinsById[t.pin]) || {}
    const note = pin.note || t.pin
    const screen = pin.screen || ''
    const state = pin.state || ''
    return '- **' + t.ac + '**: WHEN pin ' + t.pin + ' ("' + note + '", ' + screen + ' / ' + state +
      ') is exercised THE SYSTEM SHALL pass its derived test → writes ' + e2eFile
  }).join('\n')

  const hits = tierHits || []
  const tierValue = tier || 'standard'
  const guard = 'the host\'s pipeline rules § Risk Tiers'
  let tierBasis
  if (hits.length === 0) {
    tierBasis = tierValue === 'critical'
      ? 'Tier: critical — declared at freeze; no File Plan path is named in ' + guard + '.'
      : 'Tier: standard — no File Plan path is named in ' + guard + '.'
  } else {
    const more = hits.length === 1 ? '' : ' and ' + (hits.length - 1) + ' more'
    const named = '`' + hits[0].path + '` is named in ' + guard + ' (`' + hits[0].trigger + '`)' + more
    tierBasis = tierValue === 'critical'
      ? 'Tier: critical because ' + named + '; the user confirmed the lock at freeze.'
      : 'Tier: standard — ' + named + '; ruled not a risk change by the user at freeze.'
  }

  const substitutions = {
    tier: tierValue,
    tierBasis,
    date: dateFmt,
    brief,
    area: briefSlug,
    title: titleCase(briefSlug),
    goal: briefFirstResultParagraph(briefText) ||
      ('The functional prototype for brief ' + brief + ' (' + briefSlug + ') is rebuilt from its frozen contract.'),
    base: contract.base,
    stem: contract.stem,
    d1AcCitations: acIds.join(', '),
    filePlanRows: filePlanRowLines,
    contractsBody,
    acceptanceCriteria,
  }

  let out = template
  for (const [key, value] of Object.entries(substitutions)) {
    out = out.split('{{' + key + '}}').join(value)
  }

  const abs = path.join(root, specPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, out)
  return abs
}

// ---------------------------------------------------------------------------
// D5: riskTierHits — which generated File Plan paths the host's pipeline rules § Risk Tiers
// spells as code. Paths only: no diff content is read and no prose statement is judged.
// ---------------------------------------------------------------------------
// `{a,b}` groups holding a comma, innermost-first (the pattern admits no nested brace); a group
// without a comma stays literal.
function braceExpand(glob) {
  const m = /\{([^{}]*,[^{}]*)\}/.exec(glob)
  if (!m) return [glob]
  const out = []
  for (const alt of m[1].split(',')) {
    out.push(...braceExpand(glob.slice(0, m.index) + alt + glob.slice(m.index + m[0].length)))
  }
  return out
}

function riskTierHits({ root, config, paths }) {
  const rulesPath = config && config.pipelineRules
  const fail = () => ({
    ok: false,
    message: 'cannot derive the generated spec\'s tier — ' + (typeof rulesPath === 'string' && rulesPath ? rulesPath : 'pipelineRules (unset in ' + CONFIG_RELPATH + ')') + ' is unreadable or has no "## Risk Tiers" section; ' +
      'remedy: run /spec:doctor, then re-run --mark tests-derived',
  })
  if (typeof rulesPath !== 'string' || rulesPath === '') return fail()
  let text
  try {
    text = fs.readFileSync(path.join(root, rulesPath), 'utf8')
  } catch {
    return fail()
  }
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith('## Risk Tiers'))
  if (start === -1) return fail()
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { end = i; break }
  }
  const spans = []
  for (const line of lines.slice(start + 1, end)) {
    const re = /`([^`]+)`/g
    let m
    while ((m = re.exec(line)) !== null) {
      if (/\s/.test(m[1])) continue
      const candidates = braceExpand(m[1]).map((g) => {
        let c = g.startsWith('./') ? g.slice(2) : g
        if (c.endsWith('/')) c += '**'
        return c
      })
      spans.push({ span: m[1], candidates })
    }
  }
  const hits = []
  for (const p of paths) {
    const found = spans.find((s) => s.candidates.some((c) => globMatch(c, p)))
    if (found) hits.push({ path: p, trigger: found.span })
  }
  return { ok: true, rulesPath, hits }
}

module.exports = {
  riskTierHits,
  compositeNames,
  gateCheck,
  routeSlug,
  captureAll,
  writeContract,
  reserveSpec,
  nextFreeSpecNumber,
  todayStamp,
  exportHarden,
  exportTests,
  writeSpec,
  runDbDestroy,
  removeProtoWorktreeAndBranch,
  ledgerRow,
}
