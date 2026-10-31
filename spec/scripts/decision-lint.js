#!/usr/bin/env node
'use strict'
// decision-lint.js --spec <path> --root <dir> [--json]
//
// Owner: specs/20261016/01-lock-refuses-unjustified-restrictions.md
// A spec's Decisions table can withhold an affordance from a product's users, or defer work into
// a cell no queue reads, and lock stays green because a refusal is the cheapest Decision to
// write. This lint runs at /spec:plan's lock and refuses (1) a restrictive row carrying neither
// `[guards: <text found in the host's rules § Risk Tiers>]` nor `[asked: <what the user chose>]`,
// and (2) a deferral row citing no queue id that `spec-queue show` resolves.
//
// Row enumeration and struck-row exclusion are promise-sweep.js's; the applicability cutoff is
// lib/spec-sections.js's DECISION_LINT_APPLIES_FROM (a path with no `specs/<YYYYMMDD>/` segment
// is linted in full).
//
// Structural checks (specs/20261029/05; applicable from STRUCTURAL_LINT_APPLIES_FROM): a
// `breaking: true` spec needs a live Decision tagged [asked:] or [breaking:]; a File Plan row
// whose basename is a dependency manifest or lockfile prints a notice and must name its packages
// in backticks in its Summary (or say `no dependency change`); a non-empty ## Data Model needs
// `tier: critical` and an `existing rows:` line. MANIFEST basenames (closed set, no host
// configuration): package.json, package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml,
// yarn.lock, bun.lockb, bun.lock, pyproject.toml, poetry.lock, Pipfile, Pipfile.lock,
// requirements*.txt, Cargo.toml, Cargo.lock, go.mod, go.sum, Gemfile, Gemfile.lock,
// composer.json, composer.lock.
//
// Deliberately does NOT: write a manifest or ledger row, render a report, verify an `[asked:]`
// attestation beyond non-emptiness, read spec-queue.json itself (it spawns spec-queue.js), or
// accept any allow-list file or failure-class enum.
//
// Stdout: `decision-lint: restrictions=<R> deferrals=<F> findings=<N>` then one
// `  <class> <Dn>: <detail>` line per finding; --json prints one object
// { findings: [{ severity, class, id, detail }], counts: { restrictions, deferrals, breaking,
// dependencyRows, dataModel }, notices: [{ kind: 'dependency-row', path }] }. Dependency notices
// (`📌 adds or changes dependencies — <path> (veto anytime)`) print after the finding lines and
// never change the exit code.
//
// Exit codes:
//   0  no findings (including a not-applicable pre-cutoff spec)
//   1  findings emitted
//   2  usage error, unreadable spec, no Decisions section, or unreadable host rules
//      (missing config, rules file, or § Risk Tiers section — fail-closed)

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { extractSection, DECISION_LINT_APPLIES_FROM, STRUCTURAL_LINT_APPLIES_FROM } = require('./lib/spec-sections')
const { fmValue } = require('./lib/frontmatter')
const { parseFilePlanRows } = require('./lib/file-plan')
const { readConfigStrict, configExists, CONFIG_RELPATH } = require('./lib/host-config')
const { writeOut } = require('./lib/driver-io')

const MANIFEST_RE = /^(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|bun\.lock|pyproject\.toml|poetry\.lock|Pipfile|Pipfile\.lock|requirements[^/]*\.txt|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|Gemfile|Gemfile\.lock|composer\.json|composer\.lock)$/
const RESTRICT_RE = /\b(cannot|can't|may not|must not|never)\s+(be\s+)?(edit|delet|undo|undone|restor|reassign|reactivat|renam|remov|fix|correct)\w*|\b(immutable|write-once|frozen to)\b|\bonly (an? |the )?[A-Z][a-z]+s? (can|may)\b|\b(restricted|limited) to (an? |the )?[A-Z][a-z]+s?\b|\brequires? a reason\b|\bwith(out)? (a )?reason only\b/i
const DEFER_RE = /\b(in|to|for) a (later|follow-up|future|separate) spec\b|\bnot (offered|now|in this spec)\b|\bdeferred (to|until)\b|\b(later|follow-up|future) spec\b|\bcheap(ly)? later\b|\babsent now\b/i
const QUEUE_ID_RE = /\bq\d+\b/g

const USAGE = 'decision-lint.js --spec <path> --root <dir> [--json]'

function die(msg) {
  process.stderr.write('decision-lint: ' + msg + '\n')
  process.exit(2)
}

let specPath = null, root = null, jsonOut = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--root') root = argv[++i]
  else if (a === '--json') jsonOut = true
  else die('unknown argument ' + a + ' — usage: ' + USAGE)
}
if (!specPath || !root) die('--spec and --root are both required — usage: ' + USAGE)

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  die('cannot read --spec ' + specPath + ' — confirm the spec file exists: ' + e.message)
}

const dateMatch = /specs\/(\d{8})\//.exec(specPath)
if (dateMatch && dateMatch[1] < DECISION_LINT_APPLIES_FROM) {
  const line = 'decision-lint: not-applicable spec=' + dateMatch[1] + ' appliesFrom=' + DECISION_LINT_APPLIES_FROM
  writeOut(1, (jsonOut
    ? JSON.stringify({
      findings: [], counts: { restrictions: 0, deferrals: 0 },
      notApplicable: { spec: dateMatch[1], appliesFrom: DECISION_LINT_APPLIES_FROM },
    }, null, 2)
    : line) + '\n')
  process.exit(0)
}

const decisions = extractSection(specText, 'Decisions')
if (decisions === null) die(specPath + ' has no ## Decisions section — add one from the spec template (spec-paths template)')

// Host rules: fail-closed, never "no strict surfaces".
if (!configExists(root)) die('no readable ' + CONFIG_RELPATH + ' under --root ' + root + ' — run /spec:init (or pass --root <host repo>)')
let riskTiers
try {
  const cfg = readConfigStrict(root)
  if (!cfg || typeof cfg.pipelineRules !== 'string' || !cfg.pipelineRules) throw new Error('config has no pipelineRules path')
  const rules = fs.readFileSync(path.resolve(root, cfg.pipelineRules), 'utf8')
  riskTiers = extractSection(rules, 'Risk Tiers')
  if (riskTiers === null) throw new Error(cfg.pipelineRules + ' has no ## Risk Tiers section')
} catch (e) {
  die('unreadable host rules — ' + e.message + ' — run /spec:doctor to repair the grounding layer')
}
const tiersLower = riskTiers.toLowerCase()

const rows = decisions.split('\n').filter(l => /^\|\s*(~~)?\s*D\d+/.test(l) && !/^\|\s*~~/.test(l))

const tagTexts = (row, name) =>
  [...row.matchAll(new RegExp('\\[' + name + ':\\s*([^\\]]*)\\]', 'gi'))].map(m => m[1].trim())

const queueScript = path.join(__dirname, 'spec-queue.js')
const resolved = new Map()
function queueExit(id) {
  if (!resolved.has(id)) {
    const r = spawnSync('node', [queueScript, 'show', id], { cwd: root, encoding: 'utf8' })
    resolved.set(id, r.status === null ? 'signal' : r.status)
  }
  return resolved.get(id)
}

const findings = []
const push = (cls, id, detail) => findings.push({ severity: 'hard', class: cls, id, detail })
let restrictions = 0, deferrals = 0

for (const row of rows) {
  const id = row.match(/^\|\s*(D\d+[a-zA-Z′']*)/)[1]

  if (RESTRICT_RE.test(row)) {
    restrictions++
    const asked = tagTexts(row, 'asked').filter(Boolean)
    const guards = tagTexts(row, 'guards').filter(Boolean)
    const bad = guards.filter(g => !tiersLower.includes(g.toLowerCase()))
    for (const g of bad) push('guard-not-in-risk-tiers', id, '[guards: ' + g + '] — "' + g + '" does not occur in the host rules § Risk Tiers; name a listed surface or use [asked: <what the user chose>]')
    if (asked.length === 0 && guards.length === 0) {
      push('unjustified-restriction', id, 'row withholds an affordance with no stated failure it prevents — tag it [guards: <text from the host rules § Risk Tiers>] or [asked: <what the user chose>] (ask via AskUserQuestion)')
    }
  }

  if (DEFER_RE.test(row)) {
    deferrals++
    const ids = [...new Set(row.match(QUEUE_ID_RE) || [])]
    if (ids.length === 0) {
      push('untracked-deferral', id, 'row defers work with no queue id — run spec-queue add "<subject>" --lane <lane> and cite the q<id> in the row')
    } else {
      for (const q of ids) {
        const code = queueExit(q)
        if (code !== 0) push('dead-queue-id', id, q + ' does not resolve (spec-queue show exit ' + code + ') — cite a live or done id from spec-queue add')
      }
    }
  }
}

let breaking = 0, dataModel = 0
const notices = []
if (!dateMatch || dateMatch[1] >= STRUCTURAL_LINT_APPLIES_FROM) {
  if (fmValue(specText, 'breaking') === 'true') {
    breaking = 1
    const tagged = rows.some(r => tagTexts(r, 'asked').some(Boolean) || tagTexts(r, 'breaking').some(Boolean))
    if (!tagged) push('breaking-unasked', 'frontmatter', 'breaking: true has no reader — add [breaking: <what breaks for whom>] or [asked: <what the user chose>] to the Decision that introduces the break')
  }

  for (const r of parseFilePlanRows(specText)) {
    for (const p of r.paths) {
      if (!MANIFEST_RE.test(path.basename(p))) continue
      if (r.summary === 'no dependency change') continue
      notices.push({ kind: 'dependency-row', path: p })
      if (r.summary === null || !/`[^`]+`/.test(r.summary)) {
        push('missing-dependency-names', p, p + ' adds or changes dependencies but its Summary names no package — write the packages in backticks (adds `zod@3`) or the literal `no dependency change`')
      }
    }
  }

  const dm = extractSection(specText, 'Data Model')
  const dmBody = dm === null ? '' : dm.replace(/\{\s*Persistence changes:[\s\S]*?\}/, '').trim()
  if (dmBody) {
    dataModel = 1
    if (fmValue(specText, 'tier') !== 'critical') push('data-model-requires-critical', 'Data Model', '## Data Model is non-empty — a persisted-data change is tier: critical (core § Tiers); set tier: critical or remove the section')
    if (!/^existing rows:\s*\S/m.test(dmBody)) push('missing-existing-rows-line', 'Data Model', '## Data Model has no `existing rows:` line — add `existing rows: unaffected` or `existing rows: <what changes>` on its own line')
  }
}

const counts = { restrictions, deferrals, breaking, dependencyRows: notices.length, dataModel }
if (jsonOut) {
  writeOut(1, JSON.stringify({ findings, counts, notices }, null, 2) + '\n')
} else {
  const out = ['decision-lint: restrictions=' + restrictions + ' deferrals=' + deferrals + ' findings=' + findings.length]
  for (const f of findings) out.push('  ' + f.class + ' ' + f.id + ': ' + f.detail)
  for (const n of notices) out.push('📌 adds or changes dependencies — ' + n.path + ' (veto anytime)')
  writeOut(1, out.join('\n') + '\n')
}
process.exit(findings.length ? 1 : 0)
