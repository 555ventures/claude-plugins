#!/usr/bin/env node
'use strict'
// report-render.js --slots <path> — the sole render authority for the end-of-run report
// skeleton (spec/doctrine/shared.md § Console Output Style; specs/20260813/06-report-renderer.md).
//
// Before this script the console-output contract was prose-only: every command hand-filled
// its own fenced template at report time, and drifted from every other command under
// long-context runs (the audit that produced this spec found exactly ONE command's report
// ending test-pinned repo-wide). This is the spec-status precedent (v6.15.0/v6.23.0) applied
// to the report layer — the render lives in code, a command only assembles a slots object and
// prints this script's stdout verbatim.
//
// Deliberately does NOT: derive `next` — a `status-verbatim` slot is captured by the calling
// command running `spec-status --next` itself; shelling out to spec-status from here would be
// a second derivation path and break the v6.20.0 sole-derivation rule (D3). Does NOT reorder,
// merge, or rewrite slot text — glossing quality (plain English, no identifiers) stays a prose
// obligation on the assembling command; this script only guarantees shape. Does NOT retry any
// command phase on failure — a slots-file contract violation is discovered strictly AFTER the
// side-effecting work a command already did (merges, ledger rows), so the only safe recovery
// is: fix the slots file and re-run THIS SCRIPT alone, never re-run the command's phases.
//
// Slots file schema (JSON, passed via --slots <path> — never inline shell args; free text in
// argv is the corruption class the workflow layer already banned):
//   outcome: { anchor: '✅'|'⚠️'|'🚫', text: string }              required, bold-rendered
//   bullets: [string]                                             optional, plain lines
//   pins:    [string]                                             optional, 📌-anchored
//   warns:   [string]                                             optional, ⚠️-anchored
//   blocks:  [string]                                             optional, 🚫-anchored item lines
//   artifacts: [string]                                           optional, 📦-anchored path lines
//   found:   [string]                                             optional, ✨-anchored
//   next: { kind: 'command'|'status-verbatim'|'none', text?, reason? }   required
// Render order (fixed): outcome → bullets → pins → warns → blocks → artifacts → found → next.
// Empty optional arrays drop their lines entirely — no blank anchor lines. Slot text must NOT
// arrive pre-anchored with one of the glyphs this script itself prepends (✅⚠️🚫📦✨📌🎯) —
// double-anchoring is a contract violation, checked uniformly across every slot regardless of
// whether that particular slot type gets an anchor prepended.
// next.kind 'command': text is one non-empty line, must not end with '?' (a recommendation,
// never an open question). next.kind 'status-verbatim': text renders verbatim as the close —
// byte-identical, may span lines and itself begin with 🎯 (spec-status's own captured output).
// next.kind 'none': renders `Next: nothing needs you — {reason}` (reason required).
//
// Exit codes: 0 rendered; 2 contract violation (message names the offending slot and the
// remedy — fix the slots file and re-run this script only; usage errors are also exit 2).

const fs = require('fs')

let slotsPath = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--slots') slotsPath = argv[++i]
  else {
    console.error(`report-render: unrecognized argument '${argv[i]}' — usage: report-render.js --slots <path>`)
    process.exit(2)
  }
}
if (!slotsPath) {
  console.error('report-render: --slots <path> is required — usage: report-render.js --slots <path>')
  process.exit(2)
}

function fail(slot, msg) {
  console.error(`report-render: ${slot} — ${msg}; fix the slots file and re-run this script only (never re-run the command's phases)`)
  process.exit(2)
}

let raw
try {
  raw = fs.readFileSync(slotsPath, 'utf8')
} catch (e) {
  console.error(`report-render: cannot read --slots ${slotsPath} (${e.message}) — pass the path the command wrote its slots JSON to`)
  process.exit(2)
}
let slots
try {
  slots = JSON.parse(raw)
} catch (e) {
  fail('slots-file', `${slotsPath} is not valid JSON (${e.message})`)
}

const OUTCOME_ANCHORS = new Set(['✅', '⚠️', '🚫'])
// The fixed anchor set this script itself prepends across the skeleton — slot text may never
// arrive already carrying one of these (double-anchoring), even for a slot type (bullets) this
// script renders plain; the invariant is contract-wide, not per-slot.
const ANCHOR_GLYPHS = ['✅', '⚠️', '🚫', '📦', '✨', '📌', '🎯']

function assertString(v, slot) {
  if (typeof v !== 'string' || v.length === 0) fail(slot, 'must be a non-empty string')
}

function assertNotPreAnchored(v, slot) {
  for (const g of ANCHOR_GLYPHS) {
    if (v === g || v.startsWith(g + ' ')) {
      fail(slot, `entry must not carry its own anchor ("${v}") — the script prepends the anchor`)
    }
  }
}

function arrayOf(name) {
  const v = slots[name]
  if (v === undefined) return []
  if (!Array.isArray(v)) fail(name, 'must be an array')
  v.forEach((entry, i) => {
    assertString(entry, `${name}[${i}]`)
    assertNotPreAnchored(entry, `${name}[${i}]`)
  })
  return v
}

// ---- outcome (required) --------------------------------------------------------------------
if (!slots.outcome || typeof slots.outcome !== 'object') fail('outcome', 'is required')
if (!OUTCOME_ANCHORS.has(slots.outcome.anchor)) {
  fail('outcome.anchor', `must be one of ✅|⚠️|🚫 (got ${JSON.stringify(slots.outcome.anchor)})`)
}
assertString(slots.outcome.text, 'outcome.text')
assertNotPreAnchored(slots.outcome.text, 'outcome.text')

// ---- optional arrays ------------------------------------------------------------------------
const bullets = arrayOf('bullets')
const pins = arrayOf('pins')
const warns = arrayOf('warns')
const blocks = arrayOf('blocks')
const artifacts = arrayOf('artifacts')
const found = arrayOf('found')

// ---- next (required) ------------------------------------------------------------------------
const next = slots.next
if (!next || typeof next !== 'object' || !next.kind) {
  fail('next', 'is required (kind: command|status-verbatim|none) — a report may never silently end without a close')
}
let nextLine
if (next.kind === 'command') {
  assertString(next.text, 'next.text')
  if (next.text.includes('\n')) fail('next.text', 'must be one line — a command-kind next may not span multiple lines')
  if (next.text.endsWith('?')) fail('next.text', 'must not end with "?" — next is a recommendation, never an open question')
  nextLine = `Next: ${next.text}`
} else if (next.kind === 'status-verbatim') {
  assertString(next.text, 'next.text')
  nextLine = next.text
} else if (next.kind === 'none') {
  assertString(next.reason, 'next.reason')
  nextLine = `Next: nothing needs you — ${next.reason}`
} else {
  fail('next.kind', `must be one of command|status-verbatim|none (got ${JSON.stringify(next.kind)})`)
}

// ---- render (fixed order) -------------------------------------------------------------------
const out = []
out.push(`${slots.outcome.anchor} **${slots.outcome.text}**`)
bullets.forEach(b => out.push(b))
pins.forEach(p => out.push(`📌 ${p}`))
warns.forEach(w => out.push(`⚠️ ${w}`))
blocks.forEach(b => out.push(`🚫 ${b}`))
artifacts.forEach(a => out.push(`📦 ${a}`))
found.forEach(f => out.push(`✨ ${f}`))
out.push(nextLine)

console.log(out.join('\n'))
process.exit(0)
