'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  DIM, bare, mark, writeFile, writeJSON, statusOf, writeBrief, writeConventionsArtifacts,
  advanceToFinalists, finalist, BOOT_CMD,
} = require('./tournament.fixtures')

// specs/20260827/01-genesis-tournament.md: the tournament's DECIDE step — descriptor/ADR
// enforcement against the recorded winner and the finalists/logs deletion + re-scaffold.
// Owns AC-20260827-01-7 (D7); shard of tournament.test.js, split by
// specs/20260903/07-test-file-budget-guard.md D7. Shared constants/helpers live in
// tests/genesis/tournament.fixtures.js.

test('AC-20260827-01-7: decided refuses a descriptor scaffoldCommand that differs from the recorded winner\'s, refuses when no ADR cites benchmark.md, and once both hold deletes the raced finalists/ and logs/ while keeping the benchmark, gallery, and evidence, then re-scaffolds the winner clean into --root on the next bare run', () => {
  const winnerCmd = 'touch root-scaffolded.txt'

  function fullFlowToPickedWinner(dir) {
    advanceToFinalists(dir, 'backend-api')
    writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
      finalists: [
        finalist('stack-a', { hosting: 'AWS' }, {
          scaffoldCommand: winnerCmd,
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

    writeBrief(dir, { picks: ['- archetype: backend-api', '- ' + DIM + ': AWS'] })
    const picked = mark(dir, 'picked')
    assert.strictEqual(picked.status, 0, 'test setup requires picked to be accepted: ' + picked.stderr)
    assert.strictEqual(statusOf(dir).tournament.winner, 'stack-a', 'test setup requires stack-a to be recorded as the winner')

    // D2: conventionsCheck() runs ahead of D9's own scaffoldCommand-mismatch/benchmark-citation
    // checks inside handleDecided — every one of this test's three `decided` calls (mismatch,
    // noCite, ok) needs a valid conventions.json already present to even reach those checks.
    writeConventionsArtifacts(dir)
  }

  function descriptorFor(scaffoldCommand) {
    return {
      schemaVersion: 1, archetype: 'backend-api', language: 'typescript', framework: 'hono',
      packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
      designCatalog: 'none', gateCommand: 'exit 0', scaffoldCommand,
      decisionRecords: ['docs/adr/0001-hosting.md'],
    }
  }

  function writeAdr(dir, citeBenchmark) {
    writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.
${citeBenchmark ? 'Race evidence: `.claude/genesis/tournament/benchmark.md`.\n' : ''}
## Dissents
GCP was considered and rejected — no other minority option surfaced.
`)
  }

  const mismatch = tmpdir('tourn-ac7-mismatch')
  fullFlowToPickedWinner(mismatch)
  writeJSON(path.join(mismatch, '.claude/genesis/stack-descriptor.json'), descriptorFor('touch different.txt'))
  writeAdr(mismatch, true)
  const r1 = mark(mismatch, 'decided')
  assert.strictEqual(r1.status, 2, 'D9: once a tournament winner is recorded, the descriptor\'s scaffoldCommand must equal the winner\'s exactly — a descriptor scaffolding something the race never actually validated must be refused: ' + JSON.stringify(r1))
  assert.match(r1.stderr, /scaffoldCommand/, 'the refusal must name "scaffoldCommand" so the session knows exactly which descriptor field disagrees with the winner')

  const noCite = tmpdir('tourn-ac7-nocite')
  fullFlowToPickedWinner(noCite)
  writeJSON(path.join(noCite, '.claude/genesis/stack-descriptor.json'), descriptorFor(winnerCmd))
  writeAdr(noCite, false)
  const r2 = mark(noCite, 'decided')
  assert.strictEqual(r2.status, 2, 'D9: at least one listed ADR must cite the literal benchmark.md path — without it the decision record has no durable link back to the executed evidence the tournament produced: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /benchmark\.md/, 'the refusal must name "benchmark.md" so the session knows exactly what citation is missing')

  const ok = tmpdir('tourn-ac7-ok')
  fullFlowToPickedWinner(ok)
  writeJSON(path.join(ok, '.claude/genesis/stack-descriptor.json'), descriptorFor(winnerCmd))
  writeAdr(ok, true)
  const r3 = mark(ok, 'decided')
  assert.strictEqual(r3.status, 0, 'a descriptor matching the winner\'s scaffoldCommand, with an ADR citing benchmark.md, must be accepted: ' + r3.stderr)

  const finalistsDir = path.join(ok, '.claude/genesis/tournament/finalists')
  const logsDir = path.join(ok, '.claude/genesis/tournament/logs')
  assert.strictEqual(fs.existsSync(finalistsDir), false, 'D9/A3: a successful decided must delete tournament/finalists/ — the probe slice was built under retry caps with no spec and no review, and JJ\'s re-scaffold-clean ruling means it must not survive as the project foundation')
  assert.strictEqual(fs.existsSync(logsDir), false, 'D9: a successful decided must delete tournament/logs/ along with finalists/ — both were scratch race output, never durable evidence')
  assert.ok(fs.existsSync(path.join(ok, '.claude/genesis/tournament/benchmark.json')), 'D9/A3: benchmark.json must survive the finalists/logs deletion — it is the ADR\'s cited evidence, not scratch output')
  assert.ok(fs.existsSync(path.join(ok, '.claude/genesis/tournament/benchmark.md')), 'D9/A3: benchmark.md must survive the finalists/logs deletion')
  assert.ok(fs.existsSync(path.join(ok, '.claude/genesis/tournament/gallery.html')), 'D9/A3: gallery.html must survive the finalists/logs deletion')
  assert.ok(fs.existsSync(path.join(ok, '.claude/genesis/tournament/evidence')), 'D9/A3: evidence/ must survive the finalists/logs deletion')

  const scaffoldRun = bare(ok)
  assert.ok(fs.existsSync(path.join(ok, 'root-scaffolded.txt')), 'D9: the next bare invocation after decided must run the winner\'s scaffoldCommand fresh, in --root itself — the raced copy under tournament/finalists/ (already deleted) is never moved or promoted into the project root')
  assert.match(scaffoldRun.stdout, /SKELETON/, 'a freshly-completed root scaffold must advance the driver to SKELETON exactly as the non-tournament path already does')
})
