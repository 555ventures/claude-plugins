'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260813/10-host-capabilities.md D2/D3/D6/D7: the single points that must actually
// consume the capabilities block (D1), so a declared capability isn't dead prose and a missing
// one isn't a silent assumption. D2: ci-query.js/observe-ci.js gate on capabilities.forge,
// printing the canonical "unavailable — no supported forge adapter" line and exiting cleanly on
// "none"; an absent block keeps today's dynamic gh probing unchanged (regression pin). D3:
// review.md/release.md drop the false "every mainstream runner prints skip counts" claim at both
// their skip-capture sites and state the honest unavailable-leg sentence instead; doctor.md folds
// an undeclared/staleness nudge into check 2, never a new numbered check. D6: wf-design.body.js,
// spec-design-driver.js, and genesis-explore.md generalize their Storybook/tool-name-enumerated
// language to capability shape, tool names surviving only as parenthetical/remedy examples. D7:
// release.md's ci poll loop keeps its 30s/600s defaults unchanged when capabilities.ciPoll is
// absent (regression pin, green pre-change per the AC's own wording).

// A fake `gh` ahead of the real one on PATH — the sanctioned test seam, zero network in the suite
// (mirrors tests/status/observe-ci.test.js's fakeGh/envWithGh pattern).
function fakeGh({ json = '[]', exit = 0 } = {}) {
  const bin = tmpdir('capabilities-ghbin')
  const lines = ['#!/usr/bin/env bash', 'cat <<\'GHJSON\'', json, 'GHJSON', `exit ${exit}`]
  fs.writeFileSync(path.join(bin, 'gh'), lines.join('\n') + '\n')
  fs.chmodSync(path.join(bin, 'gh'), 0o755)
  return bin
}
function envWithGh(binDir) {
  return Object.assign({}, process.env, { PATH: binDir + path.delimiter + process.env.PATH })
}

function writeCapabilities(dir, capabilities) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ capabilities }))
}

const CANONICAL_UNAVAILABLE = 'unavailable — no supported forge adapter'

test('AC-20260813-10-4: ci-query.js prints the canonical unavailable line and exits cleanly when capabilities.forge is "none"', () => {
  const dir = tmpdir('capabilities-ciquery-none')
  writeCapabilities(dir, { forge: 'none', skipReportPattern: 'none', ciPoll: { intervalSeconds: 30, timeoutSeconds: 600 } })
  const ghBin = fakeGh({ json: '[]' })
  const r = runNode('scripts/ci-query.js', ['--branch', 'main', '--root', dir], { env: envWithGh(ghBin) })
  assert.strictEqual(r.status, 0,
    'a declared-forge-none host must exit cleanly, never crash or hang: ' + r.stderr)
  assert.match(r.stdout, new RegExp(CANONICAL_UNAVAILABLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'capabilities.forge:"none" must make ci-query.js print the canonical unavailable line instead of calling gh — both review\'s and release\'s ci legs read this script verbatim (D2)')
})

test('AC-20260813-10-4: observe-ci.js prints the canonical unavailable line and exits cleanly when capabilities.forge is "none"', () => {
  const dir = tmpdir('capabilities-observe-none')
  gitRepo(dir)
  writeCapabilities(dir, { forge: 'none', skipReportPattern: 'none', ciPoll: { intervalSeconds: 30, timeoutSeconds: 600 } })
  const ghBin = fakeGh({ json: '[]' })
  const r = runNode('scripts/observe-ci.js', ['--root', dir], { env: envWithGh(ghBin) })
  assert.strictEqual(r.status, 0,
    'a declared-forge-none host must exit cleanly, never crash or hang: ' + r.stderr)
  assert.match(r.stdout, new RegExp(CANONICAL_UNAVAILABLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'capabilities.forge:"none" must make observe-ci.js print the canonical unavailable line instead of silently probing gh — a GitLab/Bitbucket host currently degrades with no signal at all (D2)')
})

test('AC-20260813-10-4 (regression pin): ci-query.js with no capabilities block keeps probing gh dynamically and returns its real JSON result unchanged', () => {
  const dir = tmpdir('capabilities-ciquery-legacy')
  // Deliberately no .claude/spec.config.json at all — a legacy host that predates this spec.
  const ghBin = fakeGh({ json: JSON.stringify([{ status: 'completed', conclusion: 'success', headSha: 'abc123def', url: 'https://x/y', updatedAt: '2026-08-14T00:00:00Z' }]) })
  const r = runNode('scripts/ci-query.js', ['--branch', 'main', '--root', dir], { env: envWithGh(ghBin) })
  assert.strictEqual(r.status, 0, 'a legacy host with no config at all must keep exiting 0 on a normal gh answer: ' + r.stderr)
  const parsed = JSON.parse(r.stdout)
  assert.strictEqual(parsed.available, true,
    'a config-absent host must keep probing gh dynamically and returning its real result — gating on "block absent" rather than strictly "forge:\'none\'" would silently break every legacy host that never ran /spec:init\'s capabilities detection')
})

test('AC-20260813-10-5: review.md drops the false "every mainstream runner" skip-format claim and states the unavailable-leg sentence at the gate-leg capture', () => {
  const review = read('spec/commands/review.md')
  assert.doesNotMatch(review, /every mainstream runner/i,
    'the false universal-skip-format claim silently zeroes skip counts on go test/cargo/pytest(no -rs)/Gradle hosts (C2) — it must be dropped from review.md\'s gate-leg capture')
  assert.match(review, /unavailable — host runner declares no skip format/,
    'a host with no declared skipReportPattern (or no match) must report the gate leg\'s skip observation as honestly unavailable, never assumed-zero (D3)')
})

test('AC-20260813-10-5: release.md drops the parasitic "same rule as review\'s" skip-format claim and states the unavailable-leg sentence at the e2e-leg capture', () => {
  const release = read('spec/commands/release.md')
  assert.doesNotMatch(release, /every mainstream runner/i,
    'release.md must not carry the universal-skip-format claim at its e2e-leg skip capture either — the blind-spot pass found it inherited review\'s false claim verbatim')
  assert.match(release, /unavailable — host runner declares no skip format/,
    'release.md\'s e2e-leg skip capture must state the same unavailable-leg sentence review.md does — a runner with no declared pattern must never be assumed-zero (D3)')
})

test('AC-20260813-10-5: doctor.md folds the capabilities undeclared/staleness nudge into check 2, with no new numbered check', () => {
  const doctor = read('spec/commands/doctor.md')
  assert.match(doctor, /capabilities undeclared/i,
    'doctor check 2 must gain the undeclared-capabilities nudge — a host missing the block runs CI observation and skip accounting on silent assumptions with nothing surfacing it (D2)')
  assert.match(doctor, /declared none, host looks GitHub-capable/i,
    'doctor check 2 must name the staleness case — forge:"none" declared while a GitHub remote and gh are both live — or a stale declaration goes undetected (D2)')
  assert.doesNotMatch(doctor, /^21\.\s/m,
    'D2 folds the capabilities nudge into check 2 to avoid a third near-duplicate "run /spec:init" nudge stacking on hosts where checks 2+15 already fire — a new numbered check 21 would mean that fold-in was abandoned for a stand-alone check')
})

test('AC-20260813-10-6: wf-review.body.js names the configured testCommand as the source of truth for the repro runner, with package.json surviving only as an example', () => {
  const src = read('spec/workflows/src/wf-review.body.js')
  assert.match(src, /configured\s+`?testCommand`?\s*—\s*the source of truth/,
    'the repro-runner discovery text must name the configured testCommand as the source of truth (D6) — otherwise a verifier agent on a host with no package.json has no general mechanism to fall back on')
  const packageJsonMatches = src.match(/[^\n]*package\.json[^\n]*/g) || []
  assert.ok(packageJsonMatches.length > 0,
    'package.json must still appear somewhere in wf-review.body.js as the worked example for the discovery fallback — losing it entirely strips reviewers of the one concrete illustration')
  assert.ok(packageJsonMatches.every(line => /e\.g\.,?\s+package\.json/.test(line)),
    'package.json must survive only inside an e.g./example context, never as the hard-coded assumption itself (D6) — a host with no package.json (e.g. a Cargo or Go repo) must not be steered at a file that does not exist for it')
})

test('AC-20260813-10-6: wf-design.body.js generalizes the hard-coded "Storybook loop" phrase to a capability-shaped component preview host', () => {
  const src = read('spec/workflows/src/wf-design.body.js')
  assert.doesNotMatch(src, /Storybook loop/i,
    'a Widgetbook/Ladle/Histoire host is told to look for a "Storybook loop" that does not exist for it (D6) — the phrase must generalize')
  assert.match(src, /component preview host/i,
    'the generalized capability-shaped phrasing ("the host\'s component preview host") must replace the Storybook-specific note (D6)')
})

test('AC-20260813-10-6: spec-design-driver.js generalizes the ITERATE step\'s Storybook-only navigation mechanics to preview-host affordances, keeping Storybook as an example', () => {
  const src = read('spec/scripts/spec-design-driver.js')
  assert.match(src, /preview host's search\/deep-link affordances/i,
    'the ITERATE step must name the preview host\'s search/deep-link affordances as the general mechanism (D6) — as written today a Widgetbook host is handed dead Storybook-only navigation instructions')
  assert.match(src, /\(Storybook[:,]/,
    'Storybook\'s concrete deep-link shape must survive as a parenthetical example — UPWELL-20260730-01\'s hard-won navigation guidance must not be lost, only demoted to an example')
})

test('AC-20260813-10-6: genesis-explore.md\'s render-capability STOP is capability-shaped, naming Chrome/Playwright only in the remedy text', () => {
  const explore = read('spec/commands/genesis-explore.md')
  assert.match(explore, /no scriptable browser-capture capability/i,
    'the Setup precondition\'s trigger must be capability-shaped, not enumerate Chrome/Playwright by name as the condition itself (D5) — an equivalent capture tool would otherwise be silently excluded')
  assert.match(explore, /STOP/,
    'absence of a capture capability must still produce a hard STOP — D5 preserves the pinned hardness, it only reshapes the trigger wording')
})

test('AC-20260813-10-7 (regression pin): release.md continues to default the CI poll loop to 30 seconds / 10 minutes when capabilities.ciPoll is absent', () => {
  const release = read('spec/commands/release.md')
  assert.match(release, /every 30 seconds/,
    'the poll interval default must stay 30 seconds for hosts declaring no capabilities.ciPoll override (D7) — unchanged behavior everywhere the block is absent')
  assert.match(release, /up to 10 minutes/,
    'the poll timeout default must stay 10 minutes (600s) for hosts declaring no capabilities.ciPoll override (D7)')
})
