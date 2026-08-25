'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, read, runBash } = require('../helpers')

// specs/20260825/01-genesis-panel-collapse.md (2026-08-25): deletes the genesis MoA panel
// (wf-panel.js: three blind Sonnet proposers + a Fable aggregator) and replaces it with one
// proposer — the planning session itself — over the retained wf-research.js fan-out. Panel
// verdicts don't reproduce run-to-run and identical-evidence deliberation herds (both sources
// cited in the spec's Rationale); the collapse deletes the readers and keeps the research
// slices. These tests pin the key/file/manifest deletion (AC-1), the doctrine section swap and
// its literal ban (AC-2), the archetype registry's product-free three-column shape (AC-3), the
// two genesis commands' literal ban (AC-4), README/design.md's literal ban (AC-5), and the
// retained wf-research/shared-for regression (AC-6). None of AC-1..AC-5 can pass yet — the
// panel is still wired into every one of these files (TDD red, 2026-08-25); AC-6 is a sanctioned
// green-pre-change regression pin.

// ---------------------------------------------------------------------------
// AC-20260825-01-1
// ---------------------------------------------------------------------------

test('AC-20260825-01-1: spec-paths wf-panel is refused now that D1 retires the key, and wf-panel.js and its entrypoints.json row are both gone', () => {
  const r = runBash('bin/spec-paths', ['wf-panel'])
  assert.notStrictEqual(r.status, 0,
    'D1 retires the wf-panel spec-paths key — a still-zero exit means the key still resolves ' +
    'and any command invoking `spec-paths wf-panel` would get a path to a deleted script instead ' +
    'of a discoverable error: ' + JSON.stringify(r))
  assert.match(r.stderr, /^usage: spec-paths/,
    'an unknown key must print the usage line to stderr, the same way every other unknown key ' +
    'does — a caller relying on the old key needs a discoverable error, not a silent wrong path ' +
    'or a bare non-zero exit: ' + JSON.stringify(r.stderr))

  const wfPanelPath = path.join(SPEC, 'workflows/wf-panel.js')
  assert.ok(!fs.existsSync(wfPanelPath),
    'D1 deletes spec/workflows/wf-panel.js with the panel it implements — its continued ' +
    'presence on disk means the three-proposer/aggregator mechanism this spec exists to remove ' +
    'is still reachable even if nothing resolves a key to it: ' + wfPanelPath)

  const manifest = JSON.parse(read('spec/entrypoints.json'))
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest, 'spec/workflows/wf-panel.js'),
    'D1 drops the spec/entrypoints.json row for wf-panel.js along with the script and the ' +
    'spec-paths key — a surviving row here means the entry-point manifest still documents a ' +
    'call site for a file that no longer exists: ' + JSON.stringify(Object.keys(manifest)))
})

// ---------------------------------------------------------------------------
// AC-20260825-01-2
// ---------------------------------------------------------------------------

test('AC-20260825-01-2: genesis.md carries the new Decision Record heading and none of the retired panel/proposer literals', () => {
  const src = read('spec/doctrine/genesis.md')
  assert.match(src, /^## Genesis: Decision Record \(one proposer\)$/m,
    'D2 replaces the panel/loop/menu sections with one new "## Genesis: Decision Record (one ' +
    'proposer)" section stating the session reads the research menus and writes the ADRs ' +
    'directly — its absence means the collapse never actually landed the doctrine that tells ' +
    'the two genesis commands what to do instead of invoking the panel')

  const banned = [
    [/wf-panel/, 'wf-panel'],
    [/proposer\s+panel/i, 'proposer panel'],
    [/\bMoA\b/, 'MoA'],
    [/aggregator/i, 'aggregator'],
    [/Panel\s+Roles/, 'Panel Roles'],
    [/panel-results/, 'panel-results'],
    [/roleKeys/, 'roleKeys'],
    [/runProposers/, 'runProposers'],
    [/Session\s+↔\s+Workflow\s+Loop/, 'Session ↔ Workflow Loop']
  ]
  for (const [re, label] of banned) {
    assert.ok(!re.test(src),
      'D2 bans the literal "' + label + '" from genesis.md — its presence means the retired ' +
      'panel/aggregator/role-menu mechanism is still documented as though it exists, e.g. a ' +
      'surviving `runProposers: false` would mean a stale control flag from the deleted panel ' +
      'is still part of the doctrine contract')
  }
})

// ---------------------------------------------------------------------------
// AC-20260825-01-3
// ---------------------------------------------------------------------------

test('AC-20260825-01-3: the Archetype Registry table has exactly three columns and no cell names a framework, language, runtime, or catalog product', () => {
  const src = read('spec/doctrine/genesis.md')
  const headingMatch = src.match(/^## Genesis: Archetype Registry.*$/m)
  assert.ok(headingMatch,
    'the "## Genesis: Archetype Registry" heading must still exist — without it there is no ' +
    'section boundary to parse the registry table from')

  const afterHeading = src.slice(headingMatch.index + headingMatch[0].length)
  const nextHeading = afterHeading.match(/^## /m)
  const section = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading

  const rows = section.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'))
  assert.ok(rows.length >= 3,
    'expected at least a header row, a separator row, and one data row inside the Archetype ' +
    'Registry section — a parse that finds fewer means the table itself is missing or malformed: ' +
    'found ' + rows.length + ' pipe-delimited lines')

  const cellsOf = (row) => row.slice(1, -1).split('|').map((c) => c.trim())

  for (const row of rows) {
    const cols = cellsOf(row).length
    assert.strictEqual(cols, 3,
      'D4 fixes the registry table to exactly the three columns `Archetype | Hard-to-reverse ' +
      'dimension keys (floor) | Design stage` — the candidate-stacks column is deleted — a row ' +
      'with a different column count means the table still carries (or is missing) a column: ' +
      JSON.stringify(row))
  }

  const BANNED_CELL = /Next|Remix|Svelte|Flutter|Expo|Swift|Kotlin|Tauri|Electron|Storybook|Widgetbook|Python|Rust|TypeScript|\bGo\b|\bTS\b|\bRN\b/
  const dataRows = rows.slice(2)
  for (const row of dataRows) {
    for (const cell of cellsOf(row)) {
      assert.ok(!BANNED_CELL.test(cell),
        'D4: no registry table cell may name a specific framework, language, runtime, or ' +
        'catalog product — dimension keys are the only vocabulary (core § Rule Enforcement); ' +
        'a cell like "Next/Remix/SvelteKit + API, TS" is exactly the named-stack rot the ' +
        'registry shrink removes: ' + JSON.stringify(cell))
    }
  }
})

// ---------------------------------------------------------------------------
// AC-20260825-01-4
// ---------------------------------------------------------------------------

test('AC-20260825-01-4: genesis-architect.md and genesis-design.md name none of the retired panel literals and still name wf-research', () => {
  const banned = [
    [/wf-panel/, 'wf-panel'],
    [/panel-results/, 'panel-results'],
    [/Panel\s+Roles/, 'Panel Roles'],
    [/roleKeys/, 'roleKeys'],
    [/runProposers/, 'runProposers'],
    [/aggregator/i, 'aggregator']
  ]
  for (const rel of ['spec/commands/genesis-architect.md', 'spec/commands/genesis-design.md']) {
    const src = read(rel)
    for (const [re, label] of banned) {
      assert.ok(!re.test(src),
        'D5/D6: ' + rel + ' must not name the retired literal "' + label + '" — e.g. ' +
        'architect.md still containing `Workflow {scriptPath: <spec-paths wf-panel output>}` ' +
        'would mean the command still invokes a workflow this spec deletes')
    }
    assert.match(src, /wf-research/,
      'D5/D6: ' + rel + ' must still name wf-research — the research fan-out is retained, only ' +
      'the panel that read its output is removed; its absence would mean the command lost its ' +
      'only remaining research call, not just the panel')
  }
})

// ---------------------------------------------------------------------------
// AC-20260825-01-5
// ---------------------------------------------------------------------------

test('AC-20260825-01-5: README.md and design.md name no wf-panel and no proposer-panel/blind-proposer literal', () => {
  const banned = [
    [/wf-panel/, 'wf-panel'],
    [/proposer\s+panel/i, 'proposer panel'],
    [/blind[\s-]+proposer/i, 'blind proposer / blind-proposer']
  ]
  for (const rel of ['README.md', 'spec/doctrine/design.md']) {
    const src = read(rel)
    for (const [re, label] of banned) {
      assert.ok(!re.test(src),
        'D8: ' + rel + ' must not name "' + label + '" — e.g. the README line "has a blind ' +
        'proposer panel argue the stack" would mean the plugin\'s own public description still ' +
        'describes a mechanism this spec deletes')
    }
  }
})

// ---------------------------------------------------------------------------
// AC-20260825-01-6 (regression pin — SHALL CONTINUE TO, sanctioned green pre-change)
// ---------------------------------------------------------------------------

test('AC-20260825-01-6: spec-paths wf-research continues to resolve to an existing path and shared-for genesis-architect continues to emit Host Grounding', () => {
  const wfResearch = runBash('bin/spec-paths', ['wf-research'])
  assert.strictEqual(wfResearch.status, 0,
    'D9: the retained research fan-out must keep resolving through spec-paths after the panel ' +
    'is deleted — a non-zero exit here means the collapse broke the mechanism it was supposed ' +
    'to keep, not just the one it was supposed to remove: ' + JSON.stringify(wfResearch))
  const wfResearchPath = wfResearch.stdout.trim()
  assert.ok(fs.existsSync(wfResearchPath),
    'the resolved wf-research.js path must actually exist on disk: ' + wfResearchPath)

  const sharedFor = runBash('bin/spec-paths', ['shared-for', 'genesis-architect'])
  assert.strictEqual(sharedFor.status, 0,
    'D9: `spec-paths shared-for genesis-architect` must continue to succeed after the panel ' +
    'collapse: ' + JSON.stringify(sharedFor))
  assert.match(sharedFor.stdout, /## Host Grounding/,
    'D9: genesis-architect must continue to be served § Host Grounding — a section map broken ' +
    'by this spec\'s doctrine edits would mean the command reads no grounding doctrine at all: ' +
    sharedFor.stdout)
})
