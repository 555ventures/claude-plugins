'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, runNode, runBash } = require('../helpers')

// specs/20260813/06-report-renderer.md: the console-output contract was prose-only
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

// specs/20260903/04-reports-write-the-queue.md: report-render.js gains an optional `queued`
// slot so a deferred `spec-queue add` write is shown, never left as report prose (D1).
// AC-20260903-04-1/2/3 pin the render position, empty/absent byte-identity, and the
// pre-anchored/non-string rejection.

test('AC-20260903-04-1: a `queued` entry renders as a 📋-anchored line after `found` and before the `Next:` close', () => {
  const dir = tmpdir('report-render-queue-ac1')
  const slotsPath = writeSlots(dir, {
    outcome: { anchor: '✅', text: 'plan locked' },
    found: ['spec 04 hardened'],
    queued: ['added q9 (/spec:plan @docs/roadmap/26-x.md) at position 2'],
    next: { kind: 'command', text: '/spec:build specs/x.md' },
  })
  const r = runNode('scripts/report-render.js', ['--slots', slotsPath])
  assert.strictEqual(r.status, 0,
    'a `queued` array of plain strings is a contract-valid slots file — the renderer must not reject the new optional slot: ' + r.stderr)
  const lines = r.stdout.trim().split('\n')
  const foundIdx = lines.indexOf('✨ spec 04 hardened')
  const queuedIdx = lines.indexOf('📋 added q9 (/spec:plan @docs/roadmap/26-x.md) at position 2')
  const nextIdx = lines.indexOf('Next: /spec:build specs/x.md')
  assert.ok(foundIdx !== -1 && queuedIdx !== -1 && nextIdx !== -1,
    '`found`, `queued`, and `next` must each render as their own line in the fixed skeleton — a missing line means the deferred write is not shown to the user: ' + r.stdout)
  assert.ok(foundIdx < queuedIdx && queuedIdx < nextIdx,
    'the `queued` line must render strictly between `found` and `next` per the amended render order (found → queued → next) — a queue write shown out of position reads as unrelated to the close')
})

test('AC-20260903-04-2: an empty or absent `queued` array renders byte-identical stdout — no 📋 line and no blank line', () => {
  const dir = tmpdir('report-render-queue-ac2')
  const base = {
    outcome: { anchor: '✅', text: 'plan locked' },
    found: ['spec 04 hardened'],
    next: { kind: 'command', text: '/spec:build specs/x.md' },
  }
  const withEmptyPath = writeSlots(dir, { ...base, queued: [] })
  const rWithEmpty = runNode('scripts/report-render.js', ['--slots', withEmptyPath])
  const absentDir = tmpdir('report-render-queue-ac2-absent')
  const absentPath = writeSlots(absentDir, base)
  const rAbsent = runNode('scripts/report-render.js', ['--slots', absentPath])
  assert.strictEqual(rWithEmpty.status, 0, 'a `queued: []` slots file must exit 0: ' + rWithEmpty.stderr)
  assert.strictEqual(rAbsent.status, 0, rAbsent.stderr)
  assert.strictEqual(rWithEmpty.stdout, rAbsent.stdout,
    '`queued: []` and an absent `queued` key must produce byte-identical stdout — a droppable empty array must never leave a blank 📋 line or any other stray output behind: ' +
      JSON.stringify({ withEmpty: rWithEmpty.stdout, absent: rAbsent.stdout }))
  assert.ok(!rWithEmpty.stdout.includes('📋'),
    'neither an empty nor an absent `queued` array may render a 📋 line — the slot is fully droppable when there is nothing to show')
})

test('AC-20260903-04-3: a pre-anchored or non-string `queued` entry exits 2 naming `queued[0]` and the remedy', () => {
  const preAnchoredDir = tmpdir('report-render-queue-ac3-anchored')
  const preAnchoredPath = writeSlots(preAnchoredDir, {
    outcome: { anchor: '✅', text: 'plan locked' },
    queued: ['📋 added q9'],
    next: { kind: 'command', text: '/spec:status' },
  })
  const rAnchored = runNode('scripts/report-render.js', ['--slots', preAnchoredPath])
  assert.strictEqual(rAnchored.status, 2,
    'a `queued` entry that already carries the 📋 anchor must be a contract violation — the script prepends the anchor itself, so a pre-anchored entry would double-anchor the rendered line: stdout=' + rAnchored.stdout)
  assert.match(rAnchored.stderr, /queued\[0\]/,
    'the exit-2 message must name the offending slot as `queued[0]` and the remedy (fix the slots file and re-run this script only) so the calling command knows exactly what to fix')

  const nonStringDir = tmpdir('report-render-queue-ac3-nonstring')
  const nonStringPath = writeSlots(nonStringDir, {
    outcome: { anchor: '✅', text: 'plan locked' },
    queued: [{ text: 'added q9' }],
    next: { kind: 'command', text: '/spec:status' },
  })
  const rNonString = runNode('scripts/report-render.js', ['--slots', nonStringPath])
  assert.strictEqual(rNonString.status, 2,
    'a `queued` entry that is not a string must be a contract violation, matching every other optional array slot\'s uniform string-or-fail rule: stdout=' + rNonString.stdout)
  assert.match(rNonString.stderr, /queued\[0\]/,
    'the exit-2 message must name the offending slot as `queued[0]` even when the entry is a non-string value')
})

// Mirrors the awk-range extraction used elsewhere in this suite (tests/terminal-observable-acs.test.js's
// `between`): slice by line index from the heading up to (not including) the next `## ` heading, so the
// count matches exactly what a human reading the file between the two headings would count.


