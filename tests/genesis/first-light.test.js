'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  bare, mark, writeFile, writeJSON, statusOf, writeBrief, writeConventionsArtifacts,
  writeBindingSubset, advanceToMenusReady, DIM,
} = require('./tournament.fixtures.js')

// specs/20260913/08-silence-is-not-a-pass.md D5 (AC-20260913-08-9, AC-20260913-08-10): brief
// 01 is the first-light brief — roadmapCheck() must refuse --mark roadmap-written by name when
// the 01-*.md brief's header (text before its first ## heading) has no "First light:" line, and
// accept the mark once it does, or when the roadmap has no 01- brief at all. Both ACs are red on
// the pre-image: roadmapCheck() has no first-light branch yet.

function writeDecideArtifacts(dir, { scaffoldCommand = 'true', gateCommand = 'true' } = {}) {
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1,
    archetype: 'data-ml',
    language: 'python',
    framework: 'none',
    packageManager: 'pip',
    testRunner: 'pytest',
    linter: 'ruff',
    typechecker: 'mypy',
    designCatalog: 'none',
    gateCommand,
    scaffoldCommand,
    decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents
Fly.io was considered and rejected for regional latency — no other minority option surfaced.
`)
}

// Drives a fresh host (the non-visual data-ml archetype, which owes nothing beyond DISCOVERY per
// specs/20260902/08 D4) all the way to ROADMAP so this file's tests can exercise --mark
// roadmap-written itself, the one mark D5's refusal sits on. Mirrors
// tests/genesis/genesis-driver.test.js's own advanceToRoadmap/writeValidDecideArtifacts recipe
// (duplicated file-locally per that file's own header comment on the cross-file fixture-sharing
// constraint) using tournament.fixtures.js's shared helpers for every step short of DECIDE.
function advanceToRoadmapState(dir) {
  advanceToMenusReady(dir, 'data-ml')
  writeBrief(dir, { picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'], label: 'first-light.test.js' })
  const menusDone = mark(dir, 'menus-done')
  assert.strictEqual(menusDone.status, 0, 'test setup requires menus-done to be accepted with a picked archetype and dimension: ' + menusDone.stderr)
  writeDecideArtifacts(dir)
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted with a complete descriptor and ADR: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  writeBindingSubset(dir, 'true')
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted with a green gate: ' + landed.stderr)
  assert.match(landed.stdout, /ROADMAP/, 'test setup requires a green zero-day gate to reach ROADMAP: ' + landed.stdout)
}

function writeOverview(dir) {
  writeFile(path.join(dir, 'docs/roadmap/00-overview.md'), '# Overview\n\nSee Sequence.\n')
}

function writeRoadmapBrief(dir, name, { dependsOn = '—', firstLight = null } = {}) {
  const flLine = firstLight ? `First light: ${firstLight}\n` : ''
  writeFile(path.join(dir, 'docs/roadmap', name), `# ${name}

Phase: P0 · Depends on: ${dependsOn}
${flLine}
## Result
Something observable.
`)
}

test('AC-20260913-08-9: --mark roadmap-written refuses by name when the 01- brief header carries no "First light:" line, exiting 2 and leaving status.marks.roadmapWritten unset', () => {
  const dir = tmpdir('first-light-refuse')
  advanceToRoadmapState(dir)
  writeOverview(dir)
  writeRoadmapBrief(dir, '01-onboarding.md', { dependsOn: '—' })

  const written = mark(dir, 'roadmap-written')
  assert.strictEqual(written.status, 2, 'a 01- brief with no "First light:" header must be refused with exit 2 — an accepted mark here (today\'s pre-image behavior, since roadmapCheck has no first-light branch yet) is exactly the silent roadmap D5 exists to stop: stdout=' + written.stdout + ' stderr=' + written.stderr)
  assert.match(written.stderr, /docs\/roadmap\/01-onboarding\.md/, 'the refusal must name the offending file by path — a generic message leaves the session guessing which brief to fix: ' + written.stderr)
  assert.match(written.stderr, /First light:/, 'the refusal must name the missing header verbatim so the session knows exactly what line to add, not just that something is wrong: ' + written.stderr)

  const st = statusOf(dir)
  assert.ok(!st.marks.roadmapWritten, 'roadmap-written must not be recorded on a refused mark — a true value here means the driver advanced state past a check it just failed')
})

test('AC-20260913-08-10: --mark roadmap-written accepts a 01- brief once its header carries "First light:", and also accepts a roadmap with no 01- brief at all', () => {
  const dirWithFirstLight = tmpdir('first-light-accept')
  advanceToRoadmapState(dirWithFirstLight)
  writeOverview(dirWithFirstLight)
  writeRoadmapBrief(dirWithFirstLight, '01-onboarding.md', {
    dependsOn: '—',
    firstLight: 'one patient visit row written by a caregiver, visible in the admin list',
  })
  const written = mark(dirWithFirstLight, 'roadmap-written')
  assert.strictEqual(written.status, 0, 'a 01- brief whose header carries "First light: <a record>" must be accepted — refusing it here means no compliant brief could ever satisfy the check: stdout=' + written.stdout + ' stderr=' + written.stderr)
  assert.ok(statusOf(dirWithFirstLight).marks.roadmapWritten, 'roadmap-written must be recorded true once the mark is accepted')

  const dirNoOnePrefix = tmpdir('first-light-legacy')
  advanceToRoadmapState(dirNoOnePrefix)
  writeOverview(dirNoOnePrefix)
  writeRoadmapBrief(dirNoOnePrefix, '02-a.md', { dependsOn: '—' })
  writeRoadmapBrief(dirNoOnePrefix, '03-b.md', { dependsOn: '02' })
  const writtenLegacy = mark(dirNoOnePrefix, 'roadmap-written')
  assert.strictEqual(writtenLegacy.status, 0, 'a roadmap whose briefs are all numbered 02+ (no 01-*.md at all) must never be refused by the first-light check — legacy numbering is explicitly out of this check\'s scope: stdout=' + writtenLegacy.stdout + ' stderr=' + writtenLegacy.stderr)
  assert.ok(statusOf(dirNoOnePrefix).marks.roadmapWritten, 'roadmap-written must be recorded true for a legacy host with no 01- brief')
})
