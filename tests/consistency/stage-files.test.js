'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, runNode } = require('../helpers')

// specs/20260912/03-run-isolates-and-owns-the-stages.md D7-D9: the three stage command bodies
// move to spec/doctrine/stages/stage-{build,review,design}.md with frontmatter dropped, and
// citations-check.js's SCANNED_DIRS grows to see them. AC-20260912-03-6, -8, -15.

const STAGES_DIR = path.join(SPEC, 'doctrine/stages')
const OLD_HEADINGS = {
  'stage-build.md': [
    'Input',
    'Build stage — the build driver owns this part of the state machine',
    'Worker Contract — every dispatch this session makes',
    '`blocked` returns',
    'Report',
    'Rules',
  ],
  'stage-review.md': [
    'Input',
    'Protocol — the driver owns the state machine',
    'Rules — the judgments this session holds',
  ],
  'stage-design.md': [
    'Input',
    'Resume — derived from disk, evaluated top-down, every invocation',
    'Step 1 — Preflight',
    'Standalone preamble (D10) — no `design_source` anywhere, no brief',
    'Step 2 — Author (direct dispatch)',
    'Step 3 — Host gate',
    'Step 4 — Render gate',
    'Step 5 — Your look (blocking)',
    'Step 6 — Reconcile + stamp',
    'Report',
    'Rules',
  ],
}

function headingsOf(text) {
  return text.split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => l.slice(3).trim())
}

// ---------------------------------------------------------------------------
// AC-20260912-03-6
// ---------------------------------------------------------------------------

test('AC-20260912-03-6: the three retired command files are absent from spec/commands/', () => {
  for (const name of ['build.md', 'review.md', 'design.md']) {
    const p = path.join(SPEC, 'commands', name)
    assert.ok(!fs.existsSync(p),
      'spec/commands/' + name + ' must be deleted — its body moves to ' +
      'spec/doctrine/stages/stage-' + name + ' (D7); its continued presence means the command is ' +
      'still registered as an invokable /spec:' + name.replace('.md', ''))
  }
})

for (const [name, headings] of Object.entries(OLD_HEADINGS)) {
  test(`AC-20260912-03-6: spec/doctrine/stages/${name} exists, carries no YAML frontmatter, and its ordered "## " heading list equals its predecessor command file's exactly`, () => {
    const p = path.join(STAGES_DIR, name)
    assert.ok(fs.existsSync(p),
      'spec/doctrine/stages/' + name + ' does not exist — D7 moves the retired command\'s body ' +
      'here; without it the stage has no doctrine home once its command file is deleted')
    const text = fs.readFileSync(p, 'utf8')
    assert.notStrictEqual(text.split('\n')[0], '---',
      name + ' must carry no YAML frontmatter — Claude Code registers every .md under a plugin\'s ' +
      'commands/ as a slash command regardless of frontmatter, so this file living under ' +
      'doctrine/stages/ must not look like a stray copy of a command file either')
    assert.deepStrictEqual(headingsOf(text), headings,
      name + '\'s ordered "## " heading list must equal the retired command file\'s exactly — a ' +
      'changed heading here means the move silently rewrote structure the citation index and ' +
      'other doctrine still reference by name: ' + JSON.stringify(headingsOf(text)))
  })
}

// ---------------------------------------------------------------------------
// AC-20260912-03-8
// ---------------------------------------------------------------------------

test('AC-20260912-03-8: citations-check.js scans spec/doctrine/stages/ and reports a ghost citation there as a MISS, counted in TOTAL', () => {
  const root = tmpdir('stage-files-ac8')
  fs.mkdirSync(path.join(root, 'spec/doctrine/stages'), { recursive: true })
  fs.writeFileSync(path.join(root, 'spec/doctrine/core.md'), '## Real Heading\n\ncontent\n')
  fs.writeFileSync(path.join(root, 'spec/doctrine/stages/stage-probe.md'),
    'See core.md § No Such Heading.\n')
  const r = runNode('scripts/citations-check.js', ['--root', root])
  assert.match(r.stdout, /MISS\s+.*stage-probe\.md:1\s*§\s*No Such Heading/,
    'a dangling § citation inside spec/doctrine/stages/ must be reported as a MISS naming ' +
    'stage-probe.md — without SCANNED_DIRS covering this directory the file is invisible to the ' +
    'checker entirely, exactly like the moved stage files\' own citations would be: ' +
    (r.stdout || r.stderr))
  assert.match(r.stdout, /TOTAL=1 CHECKED=1 SKIP=0 MISS=1/,
    'the sentinel line must count this one citation in TOTAL — a scanner that never visits ' +
    'spec/doctrine/stages/ prints TOTAL=0, silently excluding the directory from the whole guard: ' +
    (r.stdout || ''))
})

// ---------------------------------------------------------------------------
// AC-20260912-03-15
// ---------------------------------------------------------------------------

// Measured at build, once the doctrine wave had written all three files — each cap IS that
// file's true line count, not a round number chosen ahead of it (D14). These caps may only ever
// shrink: a future spec that genuinely needs more prose in a stage file owes the same measure-
// then-pin ruling the command-file budgets in tests/consistency/read-load.test.js carry.
const STAGE_CAPS = {
  'stage-build.md': 96,
  'stage-review.md': 129,
  'stage-design.md': 212,
}

for (const [name, cap] of Object.entries(STAGE_CAPS)) {
  test(`AC-20260912-03-15: spec/doctrine/stages/${name} holds at or under its pinned line cap of ${cap}, measured at build (frontmatter already dropped)`, () => {
    const p = path.join(STAGES_DIR, name)
    assert.ok(fs.existsSync(p),
      'spec/doctrine/stages/' + name + ' does not exist yet — this cap cannot be checked until ' +
      'the doctrine wave creates the file; it is red for that reason alone in the pre-image')
    const lines = fs.readFileSync(p, 'utf8').split('\n').length
    assert.ok(lines <= cap,
      name + ' is ' + lines + ' lines, over its pinned cap of ' + cap + ' — the cap is measured ' +
      'at build and may only shrink, never rise to quietly cover new growth (core § Doctrine ' +
      'Authoring: procedure belongs in a driver script, prose states contracts)')
  })
}
