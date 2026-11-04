#!/usr/bin/env node
'use strict'
// out-of-plan-triage.js --spec <path> --file <repo-relative path> [--root <dir>] [--gate-line "<text>"] [--json]
// Triages a gate failure in a file outside the File Plan by the FILE's risk, never the spec's tier.
// Owner: specs/20261103/07-the-file-decides-not-the-tier.md D1/D2.
//
// Surfaces = every backtick span on a bullet line (`- `/`* ` plus its indented continuation
// lines) of the host rules' `## Risk Tiers` section that contains `/`, no whitespace and no
// leading `-`, plus the config's `orchestratorOnly` globs. A trigger that exists only as prose
// (or outside a bullet) never matches — the host names the path in a bullet to make it ask.
//
// Verdict: a File Plan path or glob row → in-plan; a surface match → ask; otherwise auto, which
// prints the pick, the File Plan row and the Decisions row for the session to paste.
//
// What it deliberately does NOT do: read the spec's tier into the verdict (it only reports it),
// write any row into the spec, or predict collisions at lock time. Its test-reference check is a
// substring scan of the one failing file for concrete File Plan paths — not scope-reconcile's
// stem-based at-risk scan.
//
// Exit codes: 0 = auto (scope widened: rows printed) or in-plan · 1 = ask (Risk Tiers surface or
// orchestratorOnly path) · 2 = usage, unreadable spec, or config / pipelineRules / `## Risk Tiers`
// missing (remedy: /spec:doctor).

const fs = require('fs')
const path = require('path')
const { readConfig, readPipelineRules } = require('./lib/host-config')
const { extractSection } = require('./lib/spec-sections')
const { globMatch } = require('./lib/glob-match')
const { parseFilePlanRows } = require('./lib/file-plan')
const { fileShapes, isTestClassified } = require('./lib/file-shapes')
const { fmValue } = require('./lib/frontmatter')
const { writeOut } = require('./lib/sync-write')

const USAGE = 'usage: out-of-plan-triage.js --spec <path> --file <repo-relative path> [--root <dir>] [--gate-line "<text>"] [--json]'
const die = (msg) => { writeOut(2, 'out-of-plan-triage: ' + msg + '\n'); process.exit(2) }

const args = process.argv.slice(2)
let specArg = '', fileArg = '', rootArg = process.cwd(), gateLine = '', asJson = false
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--json') asJson = true
  else if (a === '--spec' || a === '--file' || a === '--root' || a === '--gate-line') {
    if (i + 1 >= args.length) die(a + ' needs a value\n' + USAGE)
    const v = args[++i]
    if (a === '--spec') specArg = v
    else if (a === '--file') fileArg = v
    else if (a === '--root') rootArg = v
    else gateLine = v
  } else die('unknown argument ' + a + '\n' + USAGE)
}
if (!specArg || !fileArg) die('--spec and --file are required\n' + USAGE)

const root = path.resolve(rootArg)
const file = fileArg.replace(/^\.\//, '')

let specText
try { specText = fs.readFileSync(path.resolve(specArg), 'utf8') } catch (e) { die('cannot read spec ' + specArg + '\n' + USAGE) }

const cfg = readConfig(root)
const rules = readPipelineRules(root, cfg)
if (!rules.ok) die('host config has no readable pipelineRules file (' + (rules.rel || 'no pipelineRules key') + ') — run /spec:doctor')
const tiers = extractSection(rules.text, 'Risk Tiers')
if (tiers === null) die('rules file ' + rules.rel + ' has no `## Risk Tiers` section — run /spec:doctor')

// Surfaces: backtick spans on bullet lines (and their indented continuations).
const spans = []
let inBullet = false
for (const line of tiers.split('\n')) {
  if (/^[-*] /.test(line)) inBullet = true
  else if (!(inBullet && /^\s+\S/.test(line))) { inBullet = false; continue }
  for (const m of line.matchAll(/`([^`]+)`/g)) {
    const s = m[1]
    if (s.includes('/') && !/\s/.test(s) && !s.startsWith('-')) spans.push(s.replace(/^\.\//, ''))
  }
}
const isGlob = (s) => /[*?[]/.test(s)
const spanMatches = (s) => isGlob(s) ? globMatch(s, file) : s.endsWith('/') ? file.startsWith(s) : file === s
const orchGlobs = Array.isArray(cfg.orchestratorOnly) ? cfg.orchestratorOnly.filter((g) => typeof g === 'string') : []

const rows = parseFilePlanRows(specText)
const planned = rows.flatMap((r) => r.paths)
const tier = fmValue(specText, 'tier')

let verdict, surface = null, reason, namesPlanned = [], layer = null, nextDecision = null

if (planned.some((p) => isGlob(p) ? globMatch(p, file) : p === file)) {
  verdict = 'in-plan'
  reason = 'already a File Plan row'
} else {
  const hit = spans.find(spanMatches)
  const orch = hit === undefined ? orchGlobs.find((g) => globMatch(g, file)) : undefined
  if (hit !== undefined) {
    verdict = 'ask'; surface = hit
    reason = 'is a § Risk Tiers surface (`' + hit + '`)'
  } else if (orch !== undefined) {
    verdict = 'ask'; surface = 'orchestratorOnly ' + orch
    reason = 'matches orchestratorOnly `' + orch + '`'
  } else {
    verdict = 'auto'
    const isTest = isTestClassified(file, fileShapes(cfg))
    let src = ''
    if (isTest) { try { src = fs.readFileSync(path.join(root, file), 'utf8') } catch (e) { src = '' } }
    if (isTest) {
      for (const p of planned) if (!isGlob(p) && src.includes(p) && !namesPlanned.includes(p)) namesPlanned.push(p)
    }
    reason = !isTest ? 'not a test file'
      : namesPlanned.length ? 'its source names File Plan row ' + namesPlanned.join(', ') + ' — an in-place update of a pin on planned work'
      : 'its source names no File Plan path'
    if (isTest) layer = 'tests'
    else {
      const dirs = path.posix.dirname(file).split('/').filter((d) => d && d !== '.')
      let best = 0
      layer = 'other'
      for (const r of rows) for (const p of r.paths) {
        const pd = path.posix.dirname(p).split('/').filter((d) => d && d !== '.')
        let n = 0
        while (n < dirs.length && n < pd.length && dirs[n] === pd[n]) n++
        if (n > best) { best = n; layer = r.layer || 'other' }
      }
    }
    const decisions = extractSection(specText, 'Decisions') || ''
    let max = 0
    for (const m of decisions.matchAll(/^\|\s*D(\d+)\b/gm)) max = Math.max(max, Number(m[1]))
    nextDecision = 'D' + (max + 1)
  }
}

if (asJson) {
  writeOut(1, JSON.stringify({ verdict, file, tier, surface, namesPlanned, layer, nextDecision, reason }) + '\n')
} else if (verdict === 'in-plan') {
  writeOut(1, 'triage: in-plan — ' + file + ' is already a File Plan row; dispatch its owning worker\n')
} else if (verdict === 'ask') {
  writeOut(1, 'triage: ask — ' + file + ' ' + reason +' — ask: add to scope / file separately / pause\n')
} else {
  const clause = gateLine ? ' (gate line: ' + gateLine + ')' : ''
  writeOut(1, [
    '📌 Auto-picked add to scope — ' + file + ' (veto anytime)',
    'triage: auto — ' + file + ' is not a § Risk Tiers surface; ' + reason,
    'File Plan row:',
    '| ' + file + ' | MODIFY | ' + layer + ' | gate line — updated in place, never weakened [auto: out-of-plan-triage] |',
    'Decisions row:',
    '| ' + nextDecision + ' | Scope widened at build: `' + file + '` enters the File Plan' + clause +
      '; the pin is updated in place, never weakened. [auto: out-of-plan-triage — ' + reason +
      '] [no-ac: the gate line is the oracle] | The file\'s risk decides, never the spec\'s tier. |',
    '',
  ].join('\n'))
}
process.exit(verdict === 'ask' ? 1 : 0)
