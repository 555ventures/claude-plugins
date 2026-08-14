'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { ROOT, read } = require('../helpers')

// 2026-08-13 command-report audit (spec 20260813/07-command-report-conformance): 8 of 16 spec
// commands ended off-contract and the git plugin had zero report shape at all (Class A/D2) —
// one command's ending was pinned, everything else drifted freely. This test scans every
// ```report fenced block across spec/commands/*.md + git/commands/*.md (D1's fence tag makes
// the surface mechanically findable) and pins the whole surface at once: an outcome-anchored
// open, a Next-line (or spec-status-placeholder) close, a closed anchor glyph set, and the two
// highest-traffic Class-A rulings by literal string. Doctrine regex-pin mode over read()
// content — no script execution, since the surface is prose shape, not runtime behavior.

const SPEC_COMMANDS_DIR = 'spec/commands'
const GIT_COMMANDS_DIR = 'git/commands'
const EXEMPT = new Set(['spec/commands/status.md']) // status.md's script renders itself (doctrine-sanctioned)

function listMdFiles(relDir) {
  return fs.readdirSync(path.join(ROOT, relDir))
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(relDir, f))
}

function allCommandFiles() {
  return [...listMdFiles(SPEC_COMMANDS_DIR), ...listMdFiles(GIT_COMMANDS_DIR)]
}

function migratingSetFiles() {
  return allCommandFiles().filter(rel => !EXEMPT.has(rel))
}

function reportBlocks(src) {
  const out = []
  const re = /```report\r?\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(src))) out.push(m[1])
  return out
}

const OPEN_ANCHOR_RE = /^(✅|⚠️|🚫) \*\*/
const NEXT_RE = /^Next:/
const PLACEHOLDER = '{spec-status --next, verbatim}'

function firstLine(block) {
  return block.split('\n')[0].trim()
}

function lastNonEmptyLine(block) {
  const lines = block.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (t !== '') return t
  }
  return ''
}

function opensWithAnchor(block) {
  return OPEN_ANCHOR_RE.test(firstLine(block))
}

function closesWithNext(block) {
  const last = lastNonEmptyLine(block)
  return NEXT_RE.test(last) || last === PLACEHOLDER
}

// ---------------------------------------------------------------------------
// AC-20260813-07-1 — every report block opens with an outcome anchor, closes with Next
// ---------------------------------------------------------------------------

test('AC-20260813-07-1: every ```report block in spec/commands and git/commands opens with an outcome anchor (✅/⚠️/🚫 **) and closes with a Next line or the {spec-status --next, verbatim} placeholder', () => {
  const files = allCommandFiles()
  let blockCount = 0
  for (const rel of files) {
    const src = read(rel)
    reportBlocks(src).forEach((block, i) => {
      blockCount++
      assert.ok(opensWithAnchor(block),
        `${rel} report block #${i + 1} does not open with "✅ **"/"⚠️ **"/"🚫 **" — a reader hitting the top line can't tell the outcome without reading the whole block: "${firstLine(block)}"`)
      assert.ok(closesWithNext(block),
        `${rel} report block #${i + 1} does not end with "Next:" or the literal placeholder "{spec-status --next, verbatim}" — the close-the-loop invariant is broken (literal failing shape this catches: a block ending "🧹 next (optional): /spec:audit", release.md's pre-migration close): last line was "${lastNonEmptyLine(block)}"`)
    })
  }
  assert.ok(blockCount > 0,
    'no ```report blocks found anywhere in spec/commands or git/commands — the D1 fence-tag migration has not landed, so this pin has no surface to certify yet')
})

// ---------------------------------------------------------------------------
// AC-20260813-07-2 — every migrating-set file carries a report block + renderer invocation
// ---------------------------------------------------------------------------

test('AC-20260813-07-2: every command file in the migrating set (all spec commands except status.md, plus all three git commands) contains at least one ```report block and a report-render invocation', () => {
  const files = migratingSetFiles()
  assert.strictEqual(files.length, 18,
    'the migrating-set file count drifted from 18 (15 spec commands excluding status.md + 3 git commands) — spec/commands or git/commands gained/lost a file, or the status.md exemption stopped matching; re-derive the set before trusting the per-file checks below')
  for (const rel of files) {
    const src = read(rel)
    assert.ok(reportBlocks(src).length >= 1,
      `${rel} has no \`\`\`report block — every non-exempt command must adopt the D1 fenced report template (slot-assembly + renderer invocation + filled example)`)
    assert.match(src, /report-render/,
      `${rel} never invokes report-render (\`node "$(spec-paths report-render)" --slots <file>\`) — the D1 renderer adoption is missing from this command's report step`)
  }
})

test('AC-20260813-07-2: status.md is exempt from the report-render migration (its script renders itself)', () => {
  const status = read('spec/commands/status.md')
  assert.ok(status.length > 0, 'spec/commands/status.md is missing entirely — the exemption has nothing to exempt')
  assert.ok(!migratingSetFiles().includes('spec/commands/status.md'),
    'status.md must never appear in the migrating set — its script renders itself and D2 names it exempt by name')
})

// ---------------------------------------------------------------------------
// AC-20260813-07-3 — anchor glyphs inside report blocks come from the fixed set
// ---------------------------------------------------------------------------

const ANCHOR_SET = new Set(['✅', '⚠️', '🚫', '📌', '📦', '✨'])
const LEADING_EMOJI_RE = /^(\p{Extended_Pictographic}️?)/u

test('AC-20260813-07-3: every leading anchor glyph inside a ```report block belongs to the fixed set ✅⚠️🚫📌📦✨ (catches stray glyphs like a 🔍- or 🧹-anchored line)', () => {
  const files = allCommandFiles()
  let anchorLineCount = 0
  for (const rel of files) {
    const src = read(rel)
    reportBlocks(src).forEach((block, bi) => {
      block.split('\n').forEach((line, li) => {
        const trimmed = line.trim()
        const m = trimmed.match(LEADING_EMOJI_RE)
        if (!m) return
        anchorLineCount++
        assert.ok(ANCHOR_SET.has(m[1]),
          `${rel} report block #${bi + 1} line ${li + 1} opens with anchor "${m[1]}", which is outside the fixed set (✅⚠️🚫📌📦✨) — the fixed-anchor-set contract is closed and this glyph must be retired to a plain bullet or remapped: "${trimmed}"`)
      })
    })
  }
  assert.ok(anchorLineCount > 0,
    'no anchor-glyph lines were found inside any ```report block — the D1 fence-tag migration has not landed, so the fixed-anchor-set rule has nothing to exercise yet')
})

// ---------------------------------------------------------------------------
// AC-20260813-07-4 — the two highest-traffic Class-A rulings, pinned by literal string
// ---------------------------------------------------------------------------

test('AC-20260813-07-4: review.md\'s non-CLEAN arm closes with "Next: /spec:build" naming the spec path and the hard-findings count', () => {
  const review = read('spec/commands/review.md')
  assert.match(review, /Next:\s*\/spec:build\b[^\n]*\bfindings\b/i,
    'review.md must close its non-CLEAN arm with the sanctioned literal chain "Next: /spec:build {specPath} — fix the N hard findings" (D3/A1) — without it a non-CLEAN review leaves no route back to fixing what it just reported')
})

test('AC-20260813-07-4: merge.md\'s dirty-tree STOP names "Next: /git:commit" as the staged remedy', () => {
  const merge = read('git/commands/merge.md')
  assert.match(merge, /Next:\s*\/git:commit\b/,
    'merge.md must stage "Next: /git:commit" in its dirty-tree STOP (D4/A10) — without this literal the STOP leaves the operator to guess the remedy for uncommitted changes blocking the merge')
})
