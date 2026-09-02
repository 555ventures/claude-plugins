'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, runNode, runBash } = require('../helpers')

// specs/20260813/06-report-renderer.md (2026-08-13): the console-output contract was prose-only
// (exactly one command's report ending was test-pinned repo-wide, per the audit) — every other
// command freehanded its skeleton and drifted under long-context runs. This spec gives the
// contract its first deterministic carrier: spec/scripts/report-render.js reads a slots JSON
// file and renders the fixed skeleton to stdout, refusing double-anchored text and free-form
// endings (D1/D2/D3). This file pins the renderer by execution (AC-1..5) and the shared.md
// § Console Output Style edit that names it as the render authority (AC-10).

function writeSlots(dir, slots) {
  const p = path.join(dir, 'slots.json')
  fs.writeFileSync(p, JSON.stringify(slots))
  return p
}

test('AC-20260813-06-1: a full slots file renders the skeleton in fixed order with script-prepended anchors', () => {
  const dir = tmpdir('report-render-ac1')
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'review CLEAN' },
    pins: ['auto-picked ff-merge'],
    next: { kind: 'command', text: '/spec:audit' },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 0,
    'the renderer must exit 0 on a contract-valid slots file, or no command can ever print its report: ' + r.stderr)
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], '✅ **review CLEAN**',
    'the outcome line must render bold with the script-prepended anchor exactly as the spec\'s literal example — a differently-shaped opening breaks every command\'s report step')
  assert.ok(lines.includes('📌 auto-picked ff-merge'),
    'a `pins` entry must render as its own 📌-anchored line — this is the derived-decision announce slot the whole spec exists to make mechanical')
  assert.strictEqual(lines[lines.length - 1], 'Next: /spec:audit',
    'the report must close on the next.command line verbatim as the LAST line — a report that keeps talking after Next: leaves the reader unsure where the ask actually is')
})

test('AC-20260813-06-2: a missing `next` slot exits 2 naming the missing slot and its remedy', () => {
  const dir = tmpdir('report-render-ac2a')
  const slotsPath = writeSlots(dir, { outcome: { anchor: '✅', text: 'done' } })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 2,
    'a slots file with no `next` must exit 2 (contract violation) — `next` is required, never a droppable slot, so a report can never silently end without a close: stdout=' + r.stdout)
  assert.match(r.stderr, /next/i,
    'the exit-2 message must name the missing `next` slot so the calling command knows what to fix')
})

test('AC-20260813-06-2: next.kind "none" with a reason renders the close as "Next: nothing needs you — {reason}"', () => {
  const dir = tmpdir('report-render-ac2b')
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'nothing to do' },
    next: { kind: 'none', reason: 'everything already shipped' },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 0, 'a genuinely-no-action close is a valid contract, not a violation: ' + r.stderr)
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[lines.length - 1], 'Next: nothing needs you — everything already shipped',
    'kind:"none" must render the fixed no-action close naming the reason verbatim — without the fixed phrasing a genuinely-no-action report reads the same as an unfinished one')
})

test('AC-20260813-06-2: next.kind "status-verbatim" text is emitted verbatim as the close, byte-identical', () => {
  const dir = tmpdir('report-render-ac2c')
  const verbatim = '🎯 Next\n→ /spec:build specs/x.md'
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'done' },
    next: { kind: 'status-verbatim', text: verbatim },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(r.stdout.includes(verbatim),
    'status-verbatim text (spec-status\'s own captured `--next` output) must survive byte-identical as the close — the renderer never re-derives or reformats a second time (D3 sole-derivation rule), even though it may span lines and itself start with 🎯')
})

test('AC-20260813-06-3: a `bullets` entry arriving pre-anchored with its own emoji exits 2 naming the offending slot', () => {
  const dir = tmpdir('report-render-ac3a')
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'done' },
    bullets: ['✅ already anchored'],
    next: { kind: 'command', text: '/spec:status' },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 2,
    'slot text must NOT carry its own anchor — the script prepends it; a pre-anchored bullet would double-anchor the rendered line, so this must be a contract violation: stdout=' + r.stdout)
  assert.match(r.stderr, /bullet/i, 'the exit-2 message must name the offending `bullets` slot')
})

test('AC-20260813-06-3: next.kind "command" text ending in "?" exits 2 naming the offending slot', () => {
  const dir = tmpdir('report-render-ac3b')
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'done' },
    next: { kind: 'command', text: 'run /spec:build now?' },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 2,
    'a command-kind `next` ending in "?" reads as an open question — the close-the-loop rule requires exactly one recommended action, never a question, so this must be a contract violation: stdout=' + r.stdout)
  assert.match(r.stderr, /next/i, 'the exit-2 message must name the offending `next` slot')
})

test('AC-20260813-06-3: next.kind "command" text spanning multiple lines exits 2 naming the offending slot', () => {
  const dir = tmpdir('report-render-ac3c')
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'done' },
    next: { kind: 'command', text: '/spec:build specs/x.md\nthen /spec:review' },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 2,
    'a command-kind `next` must be one non-empty line — a multi-line command text violates the contract and must exit 2 rather than silently rendering a multi-line close: stdout=' + r.stdout)
  assert.match(r.stderr, /next/i, 'the exit-2 message must name the offending `next` slot')
})

test('AC-20260813-06-4: empty optional slot arrays drop their lines entirely — no blank anchor lines render', () => {
  const dir = tmpdir('report-render-ac4a')
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'done' },
    bullets: [],
    artifacts: [],
    next: { kind: 'command', text: '/spec:status' },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines.length, 2,
    'only the outcome and next lines should render when `bullets`/`artifacts` are empty arrays — a blank anchor line for a droppable slot would print noise between real content: ' + JSON.stringify(lines))
})

test('AC-20260813-06-4: `blocks` entries render as 🚫-anchored lines positioned between warns and artifacts', () => {
  const dir = tmpdir('report-render-ac4b')
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'done' },
    warns: ['disk almost full'],
    blocks: ['migration 003 failed'],
    artifacts: ['docs/report.md'],
    next: { kind: 'command', text: '/spec:status' },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.trim().split('\n')
  const warnIdx = lines.indexOf('⚠️ disk almost full')
  const blockIdx = lines.indexOf('🚫 migration 003 failed')
  const artifactIdx = lines.indexOf('📦 docs/report.md')
  assert.ok(warnIdx !== -1 && blockIdx !== -1 && artifactIdx !== -1,
    'warns, blocks, and artifacts must each render as their own fixed-anchor line — doctor\'s severity-split item lists and multi-artifact reports are otherwise inexpressible: ' + r.stdout)
  assert.ok(warnIdx < blockIdx && blockIdx < artifactIdx,
    'blocks must render strictly between warns and artifacts per the fixed skeleton order (D2/Behavior render order)')
})

test('AC-20260813-06-5: `spec-paths report-render` prints the renderer\'s absolute path', () => {
  const r = runBash('bin/spec-paths', ['report-render'])
  assert.strictEqual(r.status, 0, 'the report-render key must resolve, or every command that calls it fails silently: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), path.join(SPEC, 'scripts/report-render.js'),
    'spec-paths report-render must print the renderer\'s own absolute path — a wrong or missing key breaks the command that resolves it silently (§ Risk Tiers, spec-paths)')
})

// Mirrors the awk-range extraction used elsewhere in this suite (tests/terminal-observable-acs.test.js's
// `between`): slice by line index from the heading up to (not including) the next `## ` heading, so the
// count matches exactly what a human reading the file between the two headings would count.


