'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ROOT, SPEC, read, runNode, tmpdir } = require('../helpers')

// specs/20260824/05-design-doctrine-cut.md D1/D2/D5: spec/doctrine/design.md holds five
// sections (contracts a script enforces or a worker applies only) capped at 160 lines;
// dc-extract.js and fidelity-check.js are deleted, the scripts the old "## Design Binding
// Pipeline" section documented. These tests pin the rewritten shape (AC-1), the size cap and
// literal ban that is the reopen condition for every retired seat/artifact (AC-2), and the
// spec-paths refusal plus on-disk deletion of both retired scripts (AC-4).

test('AC-20260824-05-1: spec/doctrine/design.md contains exactly the five D1 headings, in that order, and no other top-level heading', () => {
  const src = read('spec/doctrine/design.md')
  const headings = [...src.matchAll(/^## (.+)$/gm)].map((m) => m[1])
  assert.deepStrictEqual(headings, [
    'Design Canon (mocks, tokens, harness)',
    'Design Authoring Contracts',
    'Design Render Gate',
    'Design Atlas',
    'Workflows Encode Shape, Not Judgment'
  ], 'D1 fixes design.md to exactly these five headings in this order — a missing, reordered, ' +
    'renamed, or extra heading means shared-for section maps and every § citation resolve ' +
    'against a doctrine file whose actual sections no longer match what they name: got ' +
    JSON.stringify(headings))
})

test('AC-20260824-05-2: spec/doctrine/design.md is at most 160 lines and names none of the retired mechanism/seat literals', () => {
  const src = read('spec/doctrine/design.md')
  const lineCount = src.split('\n').length
  assert.ok(lineCount <= 160,
    'D1/D2 caps the rewritten doctrine at 160 lines — the cap IS the enforcement (a doctrine ' +
    'this short cannot also carry a retired mechanism\'s history or rationale): got ' +
    lineCount + ' lines')
  for (const literal of ['dc-extract', 'fidelity-check', 'skeletons', 'deltas.json', 'retainer',
    'vision consult', 'FIDELITY_REVIEW', 'ITERATE', 'wf-design']) {
    assert.ok(!src.includes(literal),
      'AC-2 bans the literal "' + literal + '" from design.md — its presence means a retired ' +
      'mechanism, seat, or artifact this series deleted is still documented as though it exists, ' +
      'and per this spec\'s Rationale the literal ban is the reopen condition for every seat and ' +
      'artifact the series retired: a future edit that reintroduces it must redden this suite')
  }
})

// specs/20260902/09-one-hand-wireframes-one-token-set.md D1/D2, AC-20260902-09-1/-2: the
// authorship paragraph in design.md § Design Atlas is replaced in place (one-hand authorship,
// the retired sequential-Fable-dispatch/Sonnet-mechanical split banned), and both commands
// that cite it (atlas.md, sketch.md) plus core.md § Model Placement's parenthetical are
// rewritten to match. The pre-image paragraph and commands still carry every retired literal
// and none of the replacement's, so every assertion below is red pre-D1/D2.

test('AC-20260902-09-1: design.md carries the D1 one-hand-authorship literals and none of the retired dispatch-split literals', () => {
  const src = read('spec/doctrine/design.md')
  for (const literal of [
    'no `Agent` dispatch ever writes a mock',
    '🎨 authored {N} in-session · {K} check-only dispatches',
    'skeleton-landed',
  ]) {
    assert.ok(src.includes(literal),
      'D1 replaces design.md\'s authorship paragraph in place — the literal "' + literal +
      '" must appear, or the doctrine still describes the retired fan-out authorship model ' +
      'instead of the one-hand rule and its report line')
  }
  for (const literal of ['Agent {model: "fable"}', 'sonnet-mechanical', 'positions.md', 'design-pick.json', 'rules-locked']) {
    assert.ok(!src.includes(literal),
      'D1 bans the retired literal "' + literal + '" from design.md — its presence means the ' +
      'sequential-Fable-dispatch/Sonnet-mechanical split, the position-brief grounding, or the ' +
      'retired "rules-locked" mark this spec retires is still documented as though it exists')
  }
})

test('AC-20260902-09-2: atlas.md and sketch.md cite the one-hand authorship rule and name none of the retired dispatch-split literals; core.md § Model Placement names every mock authored in-session; citations-check.js reports MISS=0', () => {
  for (const rel of ['spec/commands/atlas.md', 'spec/commands/sketch.md']) {
    const src = read(rel)
    assert.ok(src.includes('authored {N} in-session'),
      'D2: ' + rel + ' must cite the shared report line ("authored {N} in-session") — its ' +
      'absence means the command still describes its own dispatch shape instead of citing ' +
      'design.md\'s one paragraph')
    for (const literal of ['fable', 'sonnet-mechanical', 'Sonnet mock edit', 'one sequential']) {
      assert.ok(!src.includes(literal),
        'D2: ' + rel + ' must drop the retired literal "' + literal + '" — its presence means ' +
        'the command still documents the sequential-Fable-dispatch/Sonnet-mechanical-edit split ' +
        'that D1 retires from the shared doctrine paragraph this command cites')
    }
  }

  const core = read('spec/doctrine/core.md')
  assert.ok(core.includes('every mock, wireframe or themed, authored in-session'),
    'D2: core.md § Model Placement\'s parenthetical must name "every mock, wireframe or ' +
    'themed, authored in-session" in place of the retired "sketch-tier authorship" clause — ' +
    'its absence leaves the model-placement doctrine describing a design seat this spec retires')

  const check = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.strictEqual(check.status, 0, 'citations-check.js must exit 0 over the repo root (advisory scan, never a usage error): ' + check.stderr)
  assert.match(check.stdout, /\bMISS=0\b/,
    'D1/D2\'s doctrine and command edits must not orphan any "§ ..." citation elsewhere in ' +
    'spec/ — a nonzero MISS means some file still points at a heading these edits moved or ' +
    'removed: ' + check.stdout)
})

test('AC-20260824-05-4: spec-paths dc-extract and spec-paths fidelity-check are refused now that D5 retires both keys, and neither script exists on disk', () => {
  const BIN = path.join(SPEC, 'bin/spec-paths')
  const run = (...a) => execFileSync('bash', [BIN, ...a], { encoding: 'utf8' })

  for (const key of ['dc-extract', 'fidelity-check']) {
    let threw = false
    let output = ''
    try {
      run(key)
    } catch (e) {
      threw = true
      output = String(e.stdout || '') + String(e.stderr || '')
    }
    assert.ok(threw,
      'D5: `spec-paths ' + key + '` must exit non-zero now that the key is retired (its script ' +
      'is deleted along with the source-grep fidelity gate it served) — a still-resolving key ' +
      'means a caller gets a path to a file that is no longer there instead of a discoverable error')
    assert.match(output, /usage: spec-paths/,
      '`spec-paths ' + key + '` must print the usage line on refusal, the same way any other ' +
      'unknown key does, so a caller relying on the old key gets a discoverable error: ' + output)
  }

  for (const rel of ['scripts/dc-extract.js', 'scripts/fidelity-check.js']) {
    const p = path.join(SPEC, rel)
    assert.ok(!fs.existsSync(p),
      'D5: ' + rel + ' must be deleted with the source-grep fidelity gate it belonged to — its ' +
      'continued presence means the retired mechanism is still reachable even though its ' +
      'spec-paths key is gone: ' + p)
  }
})

// specs/20260902/10-page-notes-review-loop.md D6/D7/D8, AC-20260902-10-7/-8/-9 (TDD red):
// mocks.md carries no triage-bin literals yet, the driver's REVIEW step carries no sign-off
// line, and atlas.md/sketch.md still route their annotation loop through the retired
// "local annotation MCP" clause instead of `notes open`.

test('AC-20260902-10-7: spec/commands/mocks.md names the four D6 triage bins and the canon-first rule', () => {
  const src = read('spec/commands/mocks.md')
  for (const literal of ['mock detail', 'product understanding', 'question back', 'propose to decline']) {
    assert.ok(src.includes(literal),
      'D6: spec/commands/mocks.md must name the triage bin "' + literal +
      '" — its absence means the review loop\'s closed bin set is not documented where the ' +
      'session reads it')
  }
  assert.ok(src.includes('canon.md first'),
    'D6: spec/commands/mocks.md must say "canon.md first" — a note that hits a canon primitive ' +
    'must edit canon.md before any dependent screen, and this is the rule\'s one written home')
})

// Condensed driver chain, file-local (each doctrine test file builds its own fixture rather
// than importing tests/mocks/mocks-driver.test.js's helpers) — advances a cold root through
// every mark up to review-opened + every journey reviewed, so the driver's own bare-step
// output is observed at the REVIEW sign-off step rather than asserted from a paraphrase.
const DOC_FACT_KEYS = [
  'primary-surface', 'platforms-horizon', 'tenancy', 'offline', 'realtime', 'ai-in-loop',
  'residency', 'payer', 'day-one-integrations', 'scale-outage', 'vendor-limits', 'retention',
  'legal-floor',
]
const DOC_JOURNEY = 'onboarding'
const DOC_LABELS = ['signin', 'invite', 'session-live']
const DOC_DENSE = 'session-live'

function docWriteFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function docWriteJSON(p, obj) { docWriteFile(p, JSON.stringify(obj, null, 2) + '\n') }
function docBare(dir, extra = []) { return runNode('scripts/mocks-driver.js', ['--root', dir, ...extra]) }
function docMark(dir, name, extra = []) { return runNode('scripts/mocks-driver.js', ['--root', dir, '--mark', name, ...extra]) }
function docLedger(dir, sub, extra = []) { return runNode('scripts/mocks-driver.js', ['--root', dir, 'ledger', sub, ...extra]) }

function advanceToReviewSignoff(dir) {
  docBare(dir)
  docWriteJSON(path.join(dir, 'design/targets.json'), { schemaVersion: 1, themes: ['light'], viewports: [{ name: 'mobile', width: 390, height: 844 }] })
  docWriteFile(path.join(dir, 'docs/design/research-brief.md'), '# Research brief\n\n## Findings\nSynthetic brief.\n')
  DOC_FACT_KEYS.forEach((key, i) => {
    const r = docLedger(dir, 'add', ['--id', 'P' + (i + 1), '--step', 'SEED', '--kind', 'product', '--claim', key, '--tag', 'said-by-user', '--status', 'confirmed'])
    assert.strictEqual(r.status, 0, 'test setup requires ledger add to accept fact row "' + key + '": ' + r.stderr)
  })
  const factLines = DOC_FACT_KEYS.map((k, i) => `- ${k}: P${i + 1}`).join('\n')
  docWriteFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
Synthetic product for the AC-20260902-10-8 exec leg.
Built for the doctrine test suite.
It must let a user complete a short check-in.

## Facts
${factLines}

## References
- none

## Journeys
### ${DOC_JOURNEY}
Mika (dispatch lead) signs in, sends an invite, and reaches the live session.
\`\`\`surfaces
${DOC_LABELS[0]} -> ${DOC_LABELS[1]}
${DOC_LABELS[1]} -> ${DOC_LABELS[2]}
\`\`\`

## Dense screen
- ${DOC_DENSE}
`)
  const seedDone = docMark(dir, 'seed-done')
  assert.strictEqual(seedDone.status, 0, 'test setup requires seed-done to be accepted: ' + seedDone.stderr)

  docWriteFile(path.join(dir, 'design/shapes/calm.html'), '<main data-screen-label="' + DOC_DENSE + '" data-shape="calm">calm</main>\n')
  docWriteFile(path.join(dir, 'design/shapes/bold.html'), '<main data-screen-label="' + DOC_DENSE + '" data-shape="bold">bold</main>\n')
  const shapeLedger = docLedger(dir, 'add', ['--id', 'P14', '--step', 'SHAPES', '--kind', 'product', '--claim', 'shape: calm', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'bold'])
  assert.strictEqual(shapeLedger.status, 0, 'test setup requires the shape ledger row to be accepted: ' + shapeLedger.stderr)
  const shapePicked = docMark(dir, 'shape-picked', ['--shape', 'calm'])
  assert.strictEqual(shapePicked.status, 0, 'test setup requires shape-picked to be accepted: ' + shapePicked.stderr)

  docWriteFile(path.join(dir, 'design/mocks/canon.md'), '## Shells\nnone\n\n## Primitives\n- **Button** — primary action\n\n## Rules\n- One screen at a time.\n\n## Grounding\nThis canon is binding: see docs/design/research-brief.md for the research basis.\n')
  const canonWritten = docMark(dir, 'canon-written')
  assert.strictEqual(canonWritten.status, 0, 'test setup requires canon-written to be accepted: ' + canonWritten.stderr)

  for (const label of DOC_LABELS) {
    docWriteFile(path.join(dir, 'design/mocks', label + '.html'),
      '<link rel="stylesheet" href="../wire/tokens.css">\n<link rel="stylesheet" href="../wire/wire.css">\n' +
      '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
  }
  const drawn = docMark(dir, 'journey-drawn', ['--journey', DOC_JOURNEY])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted: ' + drawn.stderr)
  const approved = docMark(dir, 'journey-approved', ['--journey', DOC_JOURNEY])
  assert.strictEqual(approved.status, 0, 'test setup requires journey-approved to be accepted: ' + approved.stderr)

  for (const [kebab, ledgerId, other] of [['quiet', 'P15', 'warm'], ['warm', 'P16', 'quiet']]) {
    const ledgerR = docLedger(dir, 'add', ['--id', ledgerId, '--step', 'THEME', '--kind', 'product', '--claim', 'theme-directions: ' + kebab, '--tag', 'said-by-user', '--status', 'confirmed'])
    assert.strictEqual(ledgerR.status, 0, 'test setup requires the theme-directions ledger row "' + kebab + '" to be accepted: ' + ledgerR.stderr)
    docWriteFile(path.join(dir, 'design/theme', kebab, 'tokens.css'), ':root{--text-body:#111}\n')
    for (const label of DOC_LABELS) {
      docWriteFile(path.join(dir, 'design/theme', kebab, label + '.html'), '<link rel="stylesheet" href="tokens.css">\n<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
    }
    const r = docMark(dir, 'direction-composed', ['--direction', kebab])
    assert.strictEqual(r.status, 0, 'test setup requires direction-composed to be accepted for "' + kebab + '": ' + r.stderr)
  }
  const themeLedger = docLedger(dir, 'add', ['--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'warm'])
  assert.strictEqual(themeLedger.status, 0, 'test setup requires the theme-pick ledger row to be accepted: ' + themeLedger.stderr)
  const themePicked = docMark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(themePicked.status, 0, 'test setup requires theme-picked to be accepted: ' + themePicked.stderr)

  for (const label of DOC_LABELS) {
    docWriteFile(path.join(dir, 'design/mocks', label + '.html'),
      '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
      '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
  }
  const skinned = docMark(dir, 'journey-skinned', ['--journey', DOC_JOURNEY])
  assert.strictEqual(skinned.status, 0, 'test setup requires journey-skinned to be accepted: ' + skinned.stderr)

  const opened = docMark(dir, 'review-opened', ['--decider', 'Ren'])
  assert.strictEqual(opened.status, 0, 'test setup requires review-opened to be accepted: ' + opened.stderr)
  const reviewed = docMark(dir, 'journey-reviewed', ['--journey', DOC_JOURNEY])
  assert.strictEqual(reviewed.status, 0, 'test setup requires journey-reviewed to be accepted: ' + reviewed.stderr)
}

test('AC-20260902-10-8: WHEN the driver prints the REVIEW step with every journey reviewed THE SYSTEM includes the D7 sign-off literal and the recorded decider\'s name', () => {
  const dir = tmpdir('mocks-review-signoff')
  advanceToReviewSignoff(dir)
  const step = docBare(dir)
  assert.strictEqual(step.status, 0, 'a bare invocation at the REVIEW sign-off step must exit 0: ' + step.stderr)
  assert.ok(step.stdout.includes('the written brief, not these screens, holds scope'),
    'D7: the sign-off step must print the exact literal "the written brief, not these screens, ' +
    'holds scope" — approval is on understanding, not on these screens holding scope: got ' + step.stdout)
  assert.ok(step.stdout.includes('Ren'),
    'D7: the sign-off step must include the recorded decider\'s name ("Ren", set via ' +
    '--mark review-opened --decider "Ren"): got ' + step.stdout)
})

test('AC-20260902-10-9: spec/commands/atlas.md and spec/commands/sketch.md route their annotation loop through `notes open` and name neither the retired "annotation MCP" nor "Vibe Annotations", spec/doctrine/mocks.md carries "## Mocks: Page Notes", and citations-check.js reports MISS=0', () => {
  for (const rel of ['spec/commands/atlas.md', 'spec/commands/sketch.md']) {
    const src = read(rel)
    assert.ok(src.includes('notes open'),
      'D8: ' + rel + ' must route its annotation loop through `notes open` — its absence means ' +
      'the command still describes its own discovery-based mechanism instead of the one ' +
      'feedback mechanism every design surface shares')
    assert.ok(!src.includes('annotation MCP'),
      'D8: ' + rel + ' must drop the retired "annotation MCP" discovery clause — its presence ' +
      'means the local-annotation-MCP escape hatch this spec deletes is still documented')
    assert.ok(!src.includes('Vibe Annotations'),
      'D8: ' + rel + ' must drop the retired "Vibe Annotations" example — naming a specific ' +
      'MCP the annotation-MCP clause pointed at means that clause is still present')
  }

  const doctrine = read('spec/doctrine/mocks.md')
  assert.ok(doctrine.includes('## Mocks: Page Notes'),
    'D1\'s doctrine home: spec/doctrine/mocks.md must carry a "## Mocks: Page Notes" heading — ' +
    'its absence means the two scopes, statuses, who-resolves rule, and project-first rule have ' +
    'nowhere to live')

  const check = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.strictEqual(check.status, 0, 'citations-check.js must exit 0 over the repo root (advisory scan, never a usage error): ' + check.stderr)
  assert.match(check.stdout, /\bMISS=0\b/,
    'D8\'s doctrine and command edits must not orphan any "§ ..." citation elsewhere in spec/ — ' +
    'a nonzero MISS means some file still points at a heading these edits moved or removed: ' + check.stdout)
})
