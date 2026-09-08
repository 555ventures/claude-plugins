#!/usr/bin/env node
'use strict'
// design-ac-reconcile.js --spec <path> --components <design/components.json>
//   [--component <name>]... [--json]
//
// /spec:design Step 6's AC ↔ design-landed reconcile (core § Incident Policy same-session fix;
// the triggering host spec's D15/D16 hold the field record).
//
// WHY: plan writes Acceptance Criteria and File Plan test rows before design exists. Design then
// lands REAL components (design.md: "built here are real and kept"), which makes any AC whose
// subject is one of those components already true. Build's red-check then demands a failing test
// for it, and the only route to red is a fragile mount (the whole app router beside a portalled
// overlay) that does not fail — it pins a CPU. The sanctioned escape, `[pre-green: design-landed]`,
// existed but nobody owned applying it: Step 6 rewrote the spec's UI section and never revisited
// the ACs. This script is the deterministic half of that duty, run before `designed:` is stamped.
//
// WHAT IT CHECKS: every well-formed AC bullet that names a landed component (a components.json
// entry with `props` or `mockRefs` — a bare vocabulary commitment is not landed; `--component`
// narrows the set to the names given, e.g. the ones this run created) must be reconciled in one
// of two sanctioned ways:
//   1. tagged `[pre-green: design-landed]` — the kept component alone satisfies the AC, so its
//      test is legitimately green at build time; or
//   2. cited by AC id in the spec's `## Decisions` section — the AC's red comes from wiring the
//      build still owes (route, server transition), and the Decision row says which test row
//      carries it (the router-mount vs portal-mount split lives there).
// An AC that is neither is a finding: it will reach red-check with no honest way to be red.
//
// Name matching is a word-boundary match of the component name (plain or backticked) against the
// AC's full text. Deliberately no fuzzier: a false positive costs one Decisions row; a false
// negative is the status quo.
//
// Exit codes: 0 = executed, nothing to reconcile · 1 = executed, findings (one per AC) ·
// 2 = usage, unreadable --spec/--components, or a spec with no `## Acceptance Criteria` section.
// Side-effect free — it never edits the spec; the Step 6 dispatch applies the tag or the row.
const fs = require('fs')
const path = require('path')
const { extractSection, parseAcBullets, acIdOccurs } = require('./lib/spec-sections')

function usage(msg) {
  if (msg) process.stderr.write('design-ac-reconcile: ' + msg + '\n')
  process.stderr.write('usage: design-ac-reconcile.js --spec <path> --components <components.json> [--component <name>]... [--json]\n')
  process.exit(2)
}

const argv = process.argv.slice(2)
let specPath = null
let componentsPath = null
const only = []
let jsonOut = false
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--components') componentsPath = argv[++i]
  else if (a === '--component') only.push(argv[++i])
  else if (a === '--json') jsonOut = true
  else usage('unknown argument ' + a)
}
if (!specPath || !componentsPath) usage('--spec and --components are required')
if (only.some((n) => typeof n !== 'string' || !n.trim())) usage('--component needs a non-empty name')

let specText
try { specText = fs.readFileSync(specPath, 'utf8') } catch (e) { usage('cannot read --spec ' + specPath + ': ' + e.message) }
let manifest
try { manifest = JSON.parse(fs.readFileSync(componentsPath, 'utf8')) } catch (e) { usage('cannot read/parse --components ' + componentsPath + ': ' + e.message) }
if (!Array.isArray(manifest)) usage('--components must be a top-level JSON array (components-check.js is the schema authority)')

const acSection = extractSection(specText, 'Acceptance Criteria')
if (acSection === null || acSection === undefined) usage('spec has no `## Acceptance Criteria` section: ' + specPath)
const decisions = extractSection(specText, 'Decisions') || ''

const landed = manifest
  .filter((e) => e && typeof e.name === 'string' && e.name.trim() &&
    (Array.isArray(e.props) || Array.isArray(e.mockRefs) || (e.props && typeof e.props === 'object')))
  .map((e) => e.name.trim())
const names = only.length ? only.filter((n) => landed.includes(n) || manifest.some((e) => e && e.name === n)) : landed

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentions = (text, name) => new RegExp('(^|[^A-Za-z0-9_])`?' + escapeRe(name) + '`?([^A-Za-z0-9_]|$)').test(text)

const bullets = parseAcBullets(acSection).filter((b) => !b.malformed && b.id)
const findings = []
const reconciled = []
for (const b of bullets) {
  const named = names.filter((n) => mentions(b.raw, n))
  if (!named.length) continue
  if (b.preGreen === 'design-landed') { reconciled.push({ id: b.id, components: named, by: 'pre-green' }); continue }
  if (acIdOccurs(decisions, b.id)) { reconciled.push({ id: b.id, components: named, by: 'decision' }); continue }
  findings.push({
    id: b.id,
    components: named,
    detail: b.id + ' names landed component(s) ' + named.join(', ') + ' and is neither tagged ' +
      '[pre-green: design-landed] nor cited in ## Decisions — red-check will demand a red test no ' +
      'honest mount can produce. Tag it (the kept component alone satisfies it) or add a Decisions ' +
      'row citing ' + b.id + ' that names the wiring test row where red stays honest.',
  })
}

const summary = { spec: path.resolve(specPath), landed: names, checked: bullets.length, reconciled, findings }
if (jsonOut) {
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
} else {
  for (const f of findings) console.log('HARD  unreconciled-design-ac  ' + f.detail)
  console.log('design-ac-reconcile: ' + names.length + ' landed component(s) · ' + bullets.length + ' AC(s) checked · ' +
    reconciled.length + ' reconciled · ' + findings.length + ' finding(s)')
}
process.exitCode = findings.length ? 1 : 0
