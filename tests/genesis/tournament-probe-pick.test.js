'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  DIM, bare, mark, writeFile, writeJSON, statusOf, writeBrief, writeHostingMenu,
  writeConventionsArtifacts, writeBindingSubset, ratifyBriefArtifacts, advanceToFinalists,
  finalist, BOOT_CMD,
} = require('./tournament.fixtures')

// specs/20260827/01-genesis-tournament.md / specs/20260902/08-genesis-shrink-brief-state.md:
// the tournament's PROBE and PICK steps, plus the per-step Doctrine: line contract that runs
// through every state DISCOVERY..ROADMAP. Owns AC-20260902-08-8, AC-20260902-08-15,
// AC-20260827-01-6, AC-20260827-01-8 (D7); shard of tournament.test.js, split by
// specs/20260903/07-test-file-budget-guard.md D7. Shared constants/helpers live in
// tests/genesis/tournament.fixtures.js.

// specs/20260902/08-genesis-shrink-brief-state.md D7 (AC-20260902-08-8): style-tile leaves
// PROBE_TASKS for every archetype entirely, and `.claude/genesis/sketch.html` is never authored
// anywhere. web-app is a visual archetype, so it reaches FINALISTS by ratifying a full BRIEF
// (D3/D4); this test's setup drives that path and asserts PROBE's task list carries no
// style-tile entry and no tile-source line.
test('AC-20260902-08-8, AC-20260902-08-15: WHEN the PROBE step prints for web-app THE SYSTEM lists the archetype\'s tasks without style-tile and without a tile-source line, probe-done accepts a probe.json that carries no tile entries, and (D15) probe-done SHALL CONTINUE TO re-run the finalist\'s gate, re-boot, and write the benchmark', () => {
  function raceWebApp(dir) {
    bare(dir)
    writeBrief(dir, { picks: ['- archetype: web-app'] })
    const disco = mark(dir, 'discovery-done')
    assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted: ' + disco.stderr)
    ratifyBriefArtifacts(dir)
    const briefWritten = mark(dir, 'brief-written')
    assert.strictEqual(briefWritten.status, 0, 'test setup requires brief-written to be accepted for web-app once D4\'s ratification artifacts hold: ' + briefWritten.stderr)

    writeHostingMenu(dir)
    const menuWritten = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
    assert.strictEqual(menuWritten.status, 0, 'test setup requires menu-written to be accepted: ' + menuWritten.stderr)
    writeBrief(dir, { picks: ['- archetype: web-app', '- ' + DIM + ': AWS'] })
    const done = mark(dir, 'menus-done')
    assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted: ' + done.stderr)
    assert.match(done.stdout, /state: FINALISTS/, 'D1: menus-done for web-app must reach FINALISTS directly now that EXPLORE is retired — landing anywhere else means the retired taste funnel is still wired into the tournament routing')

    writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
      finalists: [
        finalist('stack-a', { hosting: 'AWS' }, {
          scaffoldCommand: 'touch scaffolded.txt',
          gateCommand: 'echo run >> gate-runs.txt',
          bootCommand: BOOT_CMD,
          readyCheck: 'test -f booted',
          readyTimeout: 10,
        }),
        finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
      ],
    })
    const written = mark(dir, 'finalists-written', 'finalists.json')
    assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)
    const raced = bare(dir)
    assert.match(raced.stdout, /state: PROBE/, 'test setup requires the race to reach PROBE: ' + raced.stdout)
    return raced
  }

  const dir = tmpdir('tourn-ac8-webapp')
  const probeStep = raceWebApp(dir)
  assert.match(probeStep.stdout, /authed-crud-screen/, 'D7: web-app\'s PROBE step must still list authed-crud-screen — its absence means the probe-task table is not actually wired to the printed step')
  assert.match(probeStep.stdout, /background-job/, 'D7: web-app\'s PROBE step must still list background-job')
  assert.doesNotMatch(probeStep.stdout, /style-tile/, 'D7: style-tile must never appear in PROBE\'s task list for any archetype anymore — its presence means the retired taste-funnel task is still being offered')
  assert.doesNotMatch(probeStep.stdout, /tile source/i, 'D7: PROBE must never print a tile-source line — the mechanism that fed it (EXPLORE) is retired outright, so there is nothing left to source a tile from')

  function probeJsonPath(dir) {
    return path.join(dir, '.claude/genesis/tournament/evidence/stack-a/probe.json')
  }
  function shotAt(dir, filename) {
    const rel = '.claude/genesis/tournament/evidence/stack-a/' + filename
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, Buffer.from([0]))
    return rel
  }

  // over-cap retries — reuses the same dir: a refused mark records nothing, so PROBE
  // is still the derived state for the next attempt.
  writeJSON(probeJsonPath(dir), {
    tasks: [
      { task: 'authed-crud-screen', passed: true, retries: 3, tokens: 100, screenshot: null },
      { task: 'background-job', passed: true, retries: 0, tokens: 200, screenshot: null },
    ],
  })
  const r1 = mark(dir, 'probe-done')
  assert.strictEqual(r1.status, 2, 'D7: retries must be capped at 2 per task (D6\'s "retry cap: 2 per task") — a probe.json claiming 3 retries on authed-crud-screen must be refused, not silently accepted as evidence: ' + JSON.stringify(r1))
  assert.match(r1.stderr, /stack-a/, 'the refusal must name the offending finalist "stack-a"')
  assert.match(r1.stderr, /retries/, 'the refusal must name the offending field "retries" so the session knows exactly what is out of range')

  // missing background-job
  writeJSON(probeJsonPath(dir), {
    tasks: [
      { task: 'authed-crud-screen', passed: true, retries: 0, tokens: 100, screenshot: null },
    ],
  })
  const r2 = mark(dir, 'probe-done')
  assert.strictEqual(r2.status, 2, 'D7: probe.json must cover exactly the expected task set (no style-tile entry expected at all) — a probe.json missing background-job must be refused, not accepted as if the missing task were simply skipped: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /background-job/, 'the refusal must name the missing task "background-job" so the session knows exactly which probe slice still needs building')

  // valid — no style-tile entry anywhere in the accepted probe.json.
  const shot1 = shotAt(dir, 'authed-crud-screen.png')
  writeJSON(probeJsonPath(dir), {
    tasks: [
      { task: 'authed-crud-screen', passed: true, retries: 1, tokens: 100, screenshot: shot1 },
      { task: 'background-job', passed: true, retries: 0, tokens: 200, screenshot: null },
    ],
  })
  const r3 = mark(dir, 'probe-done')
  assert.strictEqual(r3.status, 0, 'D7: a probe.json covering exactly the expected tasks, with no tile entries at all, must be accepted: ' + r3.stderr)
  assert.match(r3.stdout, /state: PICK/, 'D7: a successful probe-done must advance the driver to PICK — anything else means the benchmark assembly this mark owns never actually ran')

  const gateRunsPath = path.join(dir, '.claude/genesis/tournament/finalists/stack-a/gate-runs.txt')
  const gateRunsLines = fs.readFileSync(gateRunsPath, 'utf8').trim().split('\n')
  assert.strictEqual(gateRunsLines.length, 2, 'D7: probe-done must re-execute the finalist\'s gateCommand once more on top of the race\'s own run — one line in gate-runs.txt means the post-probe gate never actually ran, leaving the benchmark\'s "gate: post" column reporting a fact nobody observed')

  const benchmark = JSON.parse(fs.readFileSync(path.join(dir, '.claude/genesis/tournament/benchmark.json'), 'utf8'))
  const row = benchmark.finalists.find((f) => f.name === 'stack-a')
  assert.ok(row, 'D7: benchmark.json must carry a row for stack-a — its absence means the one finalist that actually reached PROBE has no recorded benchmark evidence at all')
  assert.strictEqual(row.tokens, 300, 'D7: tokens must be summed from probe.json\'s two tasks only (100 + 200 = 300, no style-tile task to add in) — any other figure means a retired tile task is still being counted')
  assert.strictEqual(row.probePassed, 2, 'D7: probePassed must count the 2 passing tasks in probe.json')
  assert.strictEqual(row.probeTotal, 2, 'D7: probeTotal must count all 2 expected tasks, never 3 — a 3 here means the retired style-tile task is still part of the expected set')
  assert.strictEqual(row.gatePost, 0, 'D15: probe-done must CONTINUE TO re-run the finalist\'s gateCommand and record its post-probe exit — an unset gatePost means the re-run this AC pins as unchanged never happened')
  assert.strictEqual(row.bootPost, 0, 'D15: probe-done must CONTINUE TO re-boot the finalist and record its post-probe boot exit — an unset bootPost means the re-boot this AC pins as unchanged never happened')
  assert.ok(fs.existsSync(path.join(dir, '.claude/genesis/tournament/benchmark.md')), 'D7: benchmark.md must be written as the human-readable render of benchmark.json — its absence leaves PICK (D8) with no table to print verbatim')
  const gallery = fs.readFileSync(path.join(dir, '.claude/genesis/tournament/gallery.html'), 'utf8')
  assert.ok(gallery.includes(shot1), 'D7: gallery.html must contain the recorded authed-crud-screen screenshot\'s path — its absence means the gallery is missing an <img> cell for evidence that was actually captured')
})

test('AC-20260827-01-6: picked refuses a ## Picks that matches zero finalists by naming the zero count and ## Picks, and once exactly one finalist matches it records the winner and the PICK to DECIDE checkpoint; the PICK step text carries the benchmark.md table and the evidence-informs-never-decides line', () => {
  const dir = tmpdir('tourn-ac6')
  advanceToFinalists(dir, 'backend-api')
  writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
    finalists: [
      finalist('stack-a', { hosting: 'AWS' }, {
        scaffoldCommand: 'touch scaffolded.txt',
        gateCommand: 'exit 0',
        bootCommand: BOOT_CMD,
        readyCheck: 'test -f booted',
        readyTimeout: 10,
      }),
      finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
    ],
  })
  const written = mark(dir, 'finalists-written', 'finalists.json')
  assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)
  const raced = bare(dir)
  assert.match(raced.stdout, /state: PROBE/, 'test setup requires the race to reach PROBE: ' + raced.stdout)

  const shotPath = path.join(dir, '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png')
  fs.mkdirSync(path.dirname(shotPath), { recursive: true })
  fs.writeFileSync(shotPath, Buffer.from([0]))
  writeJSON(path.join(dir, '.claude/genesis/tournament/evidence/stack-a/probe.json'), {
    tasks: [
      { task: 'authed-crud-resource', passed: true, retries: 0, tokens: 10, screenshot: '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png' },
      { task: 'background-job', passed: true, retries: 0, tokens: 20, screenshot: null },
    ],
  })
  const probed = mark(dir, 'probe-done')
  assert.strictEqual(probed.status, 0, 'test setup requires probe-done to be accepted: ' + probed.stderr)
  assert.match(probed.stdout, /state: PICK/, 'test setup requires probe-done to reach PICK: ' + probed.stdout)

  writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': Azure'] })
  const noMatch = mark(dir, 'picked')
  assert.strictEqual(noMatch.status, 2, 'D8: a ## Picks that matches neither finalist\'s picks must be refused — accepting it would record a winner the user never actually chose: ' + JSON.stringify(noMatch))
  assert.match(noMatch.stderr, /\b0\b/, 'the refusal must name the match count (0) so the session understands no finalist was found, not that something else went wrong')
  assert.match(noMatch.stderr, /## Picks/, 'the refusal must name "## Picks" so the session knows to rewrite the brief\'s picks to match one finalist, per D8\'s own remedy')

  const pickStep = bare(dir)
  assert.match(pickStep.stdout, /executed evidence informs the pick; it never makes it/, 'D8: the PICK step text must carry this exact line — its absence means the driver stops reminding the session that the benchmark numbers inform, and never automatically decide, the winner')
  const benchmarkMd = fs.readFileSync(path.join(dir, '.claude/genesis/tournament/benchmark.md'), 'utf8')
  assert.ok(pickStep.stdout.includes(benchmarkMd.trimEnd()), 'D8: the PICK step must print benchmark.md verbatim — a step text that omits or paraphrases the table forces the session to go open a second file mid-decision')

  writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': GCP'] })
  const matched = mark(dir, 'picked')
  assert.strictEqual(matched.status, 0, 'a ## Picks matching exactly one finalist (stack-b) must be accepted: ' + matched.stderr)
  assert.strictEqual(statusOf(dir).tournament.winner, 'stack-b', 'D8: a successful picked mark must record tournament.winner as the matching finalist\'s name — its absence or a wrong name means decided (D9) has no reliable winner to enforce against')
  assert.match(matched.stdout, /\(PICK → DECIDE\)/, 'the checkpoint line must read (PICK → DECIDE) so a /clear-ing session knows the decision record step comes next')
})

test('AC-20260827-01-8: every state from DISCOVERY through ROADMAP prints a Doctrine: spec/doctrine/genesis.md § Genesis: line naming the section governing that step', () => {
  const DOCTRINE_LINE = /^Doctrine: spec\/doctrine\/genesis\.md § Genesis: /m

  const dir = tmpdir('tourn-ac8')
  const discovery = bare(dir)
  assert.match(discovery.stdout, DOCTRINE_LINE, 'D10: DISCOVERY must print a Doctrine: line — its absence leaves the session with no printed pointer to the section governing this step, the entire reason D10 deletes the command\'s own per-state pointer list')

  writeBrief(dir, { picks: ['- archetype: backend-api'] })
  const briefStep = mark(dir, 'discovery-done')
  assert.strictEqual(briefStep.status, 0, 'test setup requires discovery-done to be accepted on a brief naming its archetype (D2): ' + briefStep.stderr)
  assert.match(briefStep.stdout, DOCTRINE_LINE, 'D10: BRIEF must print a Doctrine: line — specs/20260902/08-genesis-shrink-brief-state.md D1 inserts BRIEF between DISCOVERY and MENUS, and it must carry the same per-state pointer every other step does')

  const briefWritten = mark(dir, 'brief-written')
  assert.strictEqual(briefWritten.status, 0, 'test setup requires brief-written to be accepted immediately for backend-api (DESIGN_SKIPPED_ARCHETYPES owe nothing beyond DISCOVERY, D4): ' + briefWritten.stderr)
  assert.match(briefWritten.stdout, DOCTRINE_LINE, 'D10: MENUS must print a Doctrine: line')

  writeHostingMenu(dir)
  const menuWritten = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(menuWritten.status, 0, 'test setup requires menu-written to be accepted: ' + menuWritten.stderr)
  writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': AWS'] })
  const finalistsStep = mark(dir, 'menus-done')
  assert.strictEqual(finalistsStep.status, 0, 'test setup requires menus-done to be accepted: ' + finalistsStep.stderr)
  assert.match(finalistsStep.stdout, DOCTRINE_LINE, 'D10: FINALISTS must print a Doctrine: line')

  writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
    finalists: [
      finalist('stack-a', { hosting: 'AWS' }, {
        scaffoldCommand: 'touch scaffolded.txt',
        gateCommand: 'exit 0',
        bootCommand: BOOT_CMD,
        readyCheck: 'test -f booted',
        readyTimeout: 10,
      }),
      finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
    ],
  })
  const written = mark(dir, 'finalists-written', 'finalists.json')
  assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)
  const probeStep = bare(dir)
  assert.match(probeStep.stdout, /state: PROBE/, 'test setup requires the race to reach PROBE: ' + probeStep.stdout)
  assert.match(probeStep.stdout, DOCTRINE_LINE, 'D10: PROBE must print a Doctrine: line')

  const shotPath = path.join(dir, '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png')
  fs.mkdirSync(path.dirname(shotPath), { recursive: true })
  fs.writeFileSync(shotPath, Buffer.from([0]))
  writeJSON(path.join(dir, '.claude/genesis/tournament/evidence/stack-a/probe.json'), {
    tasks: [
      { task: 'authed-crud-resource', passed: true, retries: 0, tokens: 10, screenshot: '.claude/genesis/tournament/evidence/stack-a/authed-crud-resource.png' },
      { task: 'background-job', passed: true, retries: 0, tokens: 20, screenshot: null },
    ],
  })
  const pickStep = mark(dir, 'probe-done')
  assert.strictEqual(pickStep.status, 0, 'test setup requires probe-done to be accepted: ' + pickStep.stderr)
  assert.match(pickStep.stdout, DOCTRINE_LINE, 'D10: PICK must print a Doctrine: line')

  writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': AWS'] })
  const decideStep = mark(dir, 'picked')
  assert.strictEqual(decideStep.status, 0, 'test setup requires picked to be accepted: ' + decideStep.stderr)
  assert.match(decideStep.stdout, DOCTRINE_LINE, 'D10: DECIDE must print a Doctrine: line')

  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1, archetype: 'backend-api', language: 'typescript', framework: 'hono',
    packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
    designCatalog: 'none', gateCommand: 'exit 0', scaffoldCommand: 'touch scaffolded.txt',
    decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.
Race evidence: \`.claude/genesis/tournament/benchmark.md\`.

## Dissents
GCP was considered and rejected — no other minority option surfaced.
`)
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)
  const skeletonStep = bare(dir)
  assert.match(skeletonStep.stdout, /SKELETON/, 'test setup requires the post-decided root scaffold to reach SKELETON: ' + skeletonStep.stdout)
  assert.match(skeletonStep.stdout, DOCTRINE_LINE, 'D10: SKELETON must print a Doctrine: line')

  writeBindingSubset(dir, 'exit 0')
  const gateStep = mark(dir, 'skeleton-landed')
  assert.strictEqual(gateStep.status, 0, 'test setup requires skeleton-landed to be accepted: ' + gateStep.stderr)
  assert.match(gateStep.stdout, /ROADMAP/, 'test setup requires a green zero-day gate to reach ROADMAP: ' + gateStep.stdout)
  assert.match(gateStep.stdout, DOCTRINE_LINE, 'D10: ROADMAP must print a Doctrine: line')
})
