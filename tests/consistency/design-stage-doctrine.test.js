'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, runNode } = require('../helpers')

// specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md D2-D5, D8-D10, D16: the design
// stage collapses to preflight -> reconcile -> look -> stamp, sketch.md becomes the sweep-loop
// entry point, plan.md/spec.md read src/screens/, design.md loses its render-gate/atlas sections,
// and spec-review-driver.js drops the advisory render-gate clause. None of these rewrites exist
// yet, so every test below is red against the pre-image (grep-confirmed at authoring time: every
// retired literal is still present in its named file, every new literal absent).

const STAGE_DESIGN_REL = 'spec/doctrine/stages/stage-design.md'
const STAGE_REVIEW_REL = 'spec/doctrine/stages/stage-review.md'
const SKETCH_REL = 'spec/commands/sketch.md'
const PLAN_REL = 'spec/commands/plan.md'
const SPEC_TEMPLATE_REL = 'spec/templates/spec.md'
const DESIGN_DOCTRINE_REL = 'spec/doctrine/design.md'
const REVIEW_DRIVER_REL = 'spec/scripts/spec-review-driver.js'

// ---------------------------------------------------------------------------
// AC-20260914-02-3
// ---------------------------------------------------------------------------

test('AC-20260914-02-3: WHEN spec/doctrine/stages/stage-design.md and spec/doctrine/stages/stage-review.md are read THE SYSTEM SHALL name preflight, reconcile, look, stamp, design.app, status.app, approval.json, check --json, "changed since approval", /spec:sketch in stage-design.md, and neither file contains render-gate, design-coverage.json, components.json, data-status, storyFormat, design-atlas, authorJustification, stories', () => {
  assert.ok(fs.existsSync(path.join(ROOT, STAGE_DESIGN_REL)), STAGE_DESIGN_REL + ' must exist for this pin to mean anything')
  assert.ok(fs.existsSync(path.join(ROOT, STAGE_REVIEW_REL)), STAGE_REVIEW_REL + ' must exist for this pin to mean anything')
  const design = read(STAGE_DESIGN_REL)
  const review = read(STAGE_REVIEW_REL)

  for (const literal of ['preflight', 'reconcile', 'look', 'stamp', 'design.app', 'status.app', 'approval.json', 'check --json', 'changed since approval', '/spec:sketch']) {
    assert.ok(design.includes(literal),
      'D2/D3: spec/doctrine/stages/stage-design.md must name "' + literal + '" — the four-step ' +
      'preflight/reconcile/look/stamp rewrite is pinned by this literal, whose absence means the ' +
      'old six-step render-gate doctrine still describes the design stage')
  }

  for (const [label, text] of [['stage-design.md', design], ['stage-review.md', review]]) {
    for (const retired of ['render-gate', 'design-coverage.json', 'components.json', 'data-status', 'storyFormat', 'design-atlas', 'authorJustification', 'stories']) {
      assert.ok(!text.includes(retired),
        'D2/D5: ' + label + ' must contain none of the retired second-artifact mechanics — found "' +
        retired + '", which describes a component-manifest/render-fidelity check this stage no ' +
        'longer runs once the mocks are the components')
    }
  }
})

// ---------------------------------------------------------------------------
// AC-20260914-02-16
// ---------------------------------------------------------------------------

test('AC-20260914-02-16: WHEN spec/scripts/spec-review-driver.js is read THE SYSTEM SHALL contain no render-gate — the REVIEWER step\'s printed text names no advisory run', () => {
  assert.ok(fs.existsSync(path.join(ROOT, REVIEW_DRIVER_REL)), REVIEW_DRIVER_REL + ' must exist for this pin to mean anything')
  const text = read(REVIEW_DRIVER_REL)
  assert.ok(!text.includes('render-gate'),
    'D5: spec/scripts/spec-review-driver.js must contain no "render-gate" literal anywhere — the ' +
    'REVIEWER step\'s printed text and its surrounding comments must drop the advisory ' +
    'render-gate-run clause whole, since the driver never ran the gate itself even before this spec')
})

// ---------------------------------------------------------------------------
// AC-20260914-02-8
// ---------------------------------------------------------------------------

test('AC-20260914-02-8: WHEN spec/commands/sketch.md is read THE SYSTEM SHALL name npx mock-review sweep, npx mock-review check, design/approval.json, "# job:", "# risk:", "# choice:", and contain none of data-screen-label, data-status, design-atlas, tokens.css, theme compose, frontend-design, ratified, render-gate, check --matrix', () => {
  assert.ok(fs.existsSync(path.join(ROOT, SKETCH_REL)), SKETCH_REL + ' must exist for this pin to mean anything')
  const text = read(SKETCH_REL)

  for (const literal of ['npx mock-review sweep', 'npx mock-review check', 'design/approval.json', '# job:', '# risk:', '# choice:']) {
    assert.ok(text.includes(literal),
      'D8: spec/commands/sketch.md must name "' + literal + '" — its absence means the sweep-loop ' +
      'rewrite (triage bins over the reviewer\'s own sweep, the UX argument comment lines kept ' +
      'verbatim) has not landed')
  }
  for (const retired of ['data-screen-label', 'data-status', 'design-atlas', 'tokens.css', 'theme compose', 'frontend-design', 'ratified', 'render-gate', 'check --matrix']) {
    assert.ok(!text.includes(retired),
      'D8: spec/commands/sketch.md must contain none of the retired second-artifact mechanics — ' +
      'found "' + retired + '", which describes a mock-HTML-era mechanism the reviewer page ' +
      '(the mock app\'s own approval hash) replaces')
  }
})

// ---------------------------------------------------------------------------
// AC-20260914-02-9
// ---------------------------------------------------------------------------

test('AC-20260914-02-9: WHEN spec/commands/plan.md and spec/templates/spec.md are read THE SYSTEM SHALL name src/screens/ and design/approval.json in plan.md\'s roadmap-brief entry and src/screens/<label>.tsx in spec.md\'s design_source comment, and neither contains design/mocks/<label>.html', () => {
  assert.ok(fs.existsSync(path.join(ROOT, PLAN_REL)), PLAN_REL + ' must exist for this pin to mean anything')
  assert.ok(fs.existsSync(path.join(ROOT, SPEC_TEMPLATE_REL)), SPEC_TEMPLATE_REL + ' must exist for this pin to mean anything')
  const plan = read(PLAN_REL)
  const specTemplate = read(SPEC_TEMPLATE_REL)

  assert.ok(plan.includes('src/screens/'),
    'D9: spec/commands/plan.md\'s roadmap-brief entry must name "src/screens/" — a UI-bearing ' +
    'brief\'s reader must look for screens under the mock app, not a retired design/mocks/*.html path')
  assert.ok(plan.includes('design/approval.json'),
    'D9: spec/commands/plan.md must name "design/approval.json" — plan decides whether ' +
    '/spec:sketch is due by reading the approval record\'s approvedAt/hash, not a data-status attribute')
  assert.ok(specTemplate.includes('src/screens/<label>.tsx'),
    'D9: spec/templates/spec.md\'s design_source comment must name "src/screens/<label>.tsx" as ' +
    'the recorded value shape')

  for (const [label, text] of [['plan.md', plan], ['spec.md', specTemplate]]) {
    assert.ok(!text.includes('design/mocks/<label>.html'),
      'D9: ' + label + ' must contain no "design/mocks/<label>.html" literal — the retired mock-' +
      'HTML path must not survive in the rewritten design_source guidance')
  }
})

// ---------------------------------------------------------------------------
// AC-20260914-02-10
// ---------------------------------------------------------------------------

test('AC-20260914-02-10: WHEN spec/doctrine/design.md is read THE SYSTEM SHALL carry ## Design Canon, ## Design Authoring Contracts, ## Workflows Encode Shape, Not Judgment, neither ## Design Render Gate nor ## Design Atlas, name design/approval.json, src/records, examples, @/components/ui, be <=160 lines, and citations-check.js exits 0', () => {
  assert.ok(fs.existsSync(path.join(ROOT, DESIGN_DOCTRINE_REL)), DESIGN_DOCTRINE_REL + ' must exist for this pin to mean anything')
  const text = read(DESIGN_DOCTRINE_REL)

  // A `§ Section Name` citation only needs a byte-for-byte PREFIX match (parentheticals
  // tolerated, doctrine.md convention) — so this pin checks the heading's start-of-line prefix,
  // never the full line, since § Design Canon's own heading already carries a parenthetical.
  for (const heading of ['## Design Canon', '## Design Authoring Contracts', '## Workflows Encode Shape, Not Judgment']) {
    assert.match(text, new RegExp('^' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'm'),
      'D10: spec/doctrine/design.md must keep the "' + heading + '" heading — the rewrite keeps ' +
      'this section\'s body while deleting the two render-gate/atlas sections around it')
  }
  assert.doesNotMatch(text, /^## Design Render Gate$/m,
    'D10: "## Design Render Gate" must be deleted whole — the fidelity check it described has no ' +
    'home once the mocks are the components')
  assert.doesNotMatch(text, /^## Design Atlas$/m,
    'D10: "## Design Atlas" must be deleted whole — the whole-product view it described is a ' +
    'retired command (spec 03) with no doctrine section left to justify it')
  for (const literal of ['design/approval.json', 'src/records', 'examples', '@/components/ui']) {
    assert.ok(text.includes(literal),
      'D10: spec/doctrine/design.md must name "' + literal + '" — the rewritten canon describes ' +
      'the three import layers and the approval record, none of which this literal\'s absence would leave documented')
  }
  const lineCount = text.split('\n').length
  assert.ok(lineCount <= 160,
    'D10: spec/doctrine/design.md must stay at or under 160 lines — found ' + lineCount +
    '; deleting two whole sections must not be offset by growth elsewhere')

  const check = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.strictEqual(check.status, 0, 'citations-check.js must exit 0 (advisory scan, never a usage error) over the repo root: ' + check.stderr)
  assert.match(check.stdout, /\bMISS=0\b/,
    'D10: deleting § Design Render Gate and § Design Atlas must not orphan any citation of either ' +
    'section elsewhere in spec/ — a nonzero MISS here means some command or doctrine file still ' +
    'points at a heading this spec removed: ' + check.stdout)
})
