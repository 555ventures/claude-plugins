'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { ROOT, read, tmpdir, runNode } = require('../helpers')

// 2026-08-10 stale-reference sweep (spec 20260810/09-stale-reference-sweep): six broken §
// citations accumulated silently in one audit cycle because nothing scanned the corpus for
// them. This file pins the new deterministic checker (spec/scripts/citations-check.js, D9) —
// its scan grammar (two-line window, two-word lookback, loud SKIP accounting), its CLI
// contract, and its wiring into spec-paths + doctor check 20. The script does not exist yet
// on current code, so every test below fails until it is built (TDD red phase).

function writeFixture(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
}

// ---------------------------------------------------------------------------
// AC-20260810-09-1
// ---------------------------------------------------------------------------

test('AC-20260810-09-1: citations-check.js reports one MISS for a ghost heading and TOTAL=2 CHECKED=2 SKIP=0 MISS=1', () => {
  const root = tmpdir('citations-ac1')
  writeFixture(root, {
    'spec/commands/a.md': 'See b.md § Real Heading.\nAlso check b.md § Ghost.\n',
    'spec/doctrine/b.md': '## Real Heading\n\ncontent\n'
  })
  const r = runNode('scripts/citations-check.js', ['--root', root])
  assert.match(r.stdout,
    /MISS\s+.*a\.md:2\s*§\s*Ghost\s*→\s*.*b\.md/,
    'a MISS line naming a.md, line 2, "Ghost", and b.md must be printed — without it an ' +
    'orchestrator following the ghost citation has no signal the target heading is missing: ' +
    (r.stderr || r.stdout))
  assert.match(r.stdout, /TOTAL=2 CHECKED=2 SKIP=0 MISS=1/,
    'the sentinel line must report exactly 2 total citations, 2 checked, 0 skipped, 1 miss ' +
    'for this fixture — a wrong count means the scanner double-counts or drops a citation: ' +
    (r.stdout || ''))
})

// ---------------------------------------------------------------------------
// AC-20260810-09-2
// ---------------------------------------------------------------------------

test('AC-20260810-09-2: citations-check.js treats a parenthetical-suffixed heading as a match via prefix comparison', () => {
  const root = tmpdir('citations-ac2a')
  writeFixture(root, {
    'spec/commands/a.md': 'Follow the § Escalation Contract, for detail.\n',
    'spec/doctrine/a.md': '## Escalation Contract (build)\n\ncontent\n'
  })
  const r = runNode('scripts/citations-check.js', ['--root', root])
  assert.match(r.stdout, /MISS=0/,
    '"§ Escalation Contract" must prefix-match "## Escalation Contract (build)" — a literal ' +
    'byte-for-byte match rule would flag every parenthesized heading as broken, which the ' +
    'live corpus (e.g. "Escalation Contract (build)") relies on not happening: ' + (r.stdout || ''))
})

test('AC-20260810-09-2: citations-check.js resolves a citation wrapped across a line break via a two-line window', () => {
  const root = tmpdir('citations-ac2b')
  writeFixture(root, {
    'spec/commands/a.md': 'This references shared\n§ Real Heading.\nMore text follows here.\n',
    'spec/doctrine/core.md': '## Real Heading\n\ncontent\n'
  })
  const r = runNode('scripts/citations-check.js', ['--root', root])
  assert.match(r.stdout, /MISS=0/,
    'a citation split across a line break ("...shared\\n§ Real Heading...") must resolve ' +
    'identically to the unwrapped form via the mandated two-line window — a line-local ' +
    'scanner would report a false MISS here, exactly the defect the audit found in six live ' +
    'files: ' + (r.stdout || ''))
})

test('AC-20260810-09-2: citations-check.js resolves the two-word idiom "shared invariants §" against the core.md + design.md union (v7 split)', () => {
  const root = tmpdir('citations-ac2c')
  writeFixture(root, {
    'spec/commands/a.md': 'Per shared invariants § Real Heading, and shared invariants § Design Thing too.\n',
    'spec/doctrine/core.md': '## Real Heading\n\ncontent\n',
    'spec/doctrine/design.md': '## Design Thing\n\ncontent\n'
  })
  const r = runNode('scripts/citations-check.js', ['--root', root])
  assert.match(r.stdout, /MISS=0/,
    'the two-word lookback idiom "shared invariants §" must resolve against BOTH core.md and ' +
    'design.md (the v7 split of shared.md) — a checker aimed at only one file would false-MISS ' +
    'every citation whose heading lives in the other: ' + (r.stdout || ''))
})

test('AC-20260810-09-2: citations-check.js counts an unresolvable file reference and "pipeline rules §" as SKIP, never MISS', () => {
  const root = tmpdir('citations-ac2d')
  writeFixture(root, {
    'spec/commands/a.md':
      'This cites gh § Something unresolvable, and also pipeline rules § Anything here.\n'
  })
  const r = runNode('scripts/citations-check.js', ['--root', root])
  assert.match(r.stdout, /MISS=0/,
    'neither an unresolvable file reference ("gh §") nor "pipeline rules §" (a host-generated ' +
    'file by design) may be counted a MISS — a MISS here would send every doctor run chasing a ' +
    'citation the checker was never supposed to be able to resolve: ' + (r.stdout || ''))
  assert.match(r.stdout, /SKIP=2/,
    'both citations must be counted as SKIP (loud, not silent) — the sentinel line is the only ' +
    'place coverage is inspectable, so a skip that vanishes from the count defeats the ' +
    '"skips are loud, never silent" contract: ' + (r.stdout || ''))
})

// ---------------------------------------------------------------------------
// AC-20260810-09-3
// ---------------------------------------------------------------------------

// AC-20260824-05-7 (specs/20260824/05-design-doctrine-cut.md D10, Assumption A3): this test
// already existed at that spec's lock as the live-corpus zero-miss regression pin — tagged here
// rather than duplicated, per A3's "if one exists, tag it instead of creating one."
// AC-20260825-01-7 (specs/20260825/01-genesis-panel-collapse.md D9): the same live-corpus
// MISS=0 pin must CONTINUE TO hold across the genesis panel collapse's doctrine/command edits —
// tagged here rather than duplicated, per that spec's D9/AC-7.
test('AC-20260810-09-3/AC-20260824-05-7/AC-20260825-01-7: citations-check.js run against this live repo after the sweep reports MISS=0', () => {
  const r = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.match(r.stdout, /MISS=0/,
    'a clean self-application run is D7\'s executed proof that every broken citation in the ' +
    'live doctrine corpus was actually repointed or reworded, not just the audit\'s six hand-' +
    'picked instances; AC-20260824-05-7/D10 and AC-20260825-01-7/D9 require this to CONTINUE TO ' +
    'hold across the design-doctrine rewrite and the genesis panel collapse — a MISS here means ' +
    'one of those doctrine edits left a live § citation pointing at a heading that moved or ' +
    'disappeared: ' + (r.stdout || r.stderr || 'script produced no output'))
})

// ---------------------------------------------------------------------------
// AC-20260810-09-4
// ---------------------------------------------------------------------------

test('AC-20260810-09-4: citations-check.js prints usage to stderr and exits 2 on an unknown flag', () => {
  const r = runNode('scripts/citations-check.js', ['--bogus-flag'])
  assert.strictEqual(r.status, 2,
    'an unknown flag must exit 2 (usage error) per the script\'s documented exit-code ' +
    'alphabet, not silently proceed or crash with a different code: got ' + r.status)
  assert.match(r.stderr, /usage/i,
    'the usage line must go to stderr so a caller piping stdout still sees the error: ' +
    (r.stderr || '(nothing printed to stderr)'))
})

// ---------------------------------------------------------------------------
// AC-20260810-09-5
// ---------------------------------------------------------------------------

test('AC-20260810-09-5: spec-paths citations-check prints the checker script\'s absolute path', () => {
  const { runBash } = require('../helpers')
  const r = runBash('bin/spec-paths', ['citations-check'])
  const printed = (r.stdout || '').trim()
  assert.ok(path.isAbsolute(printed) && printed.endsWith('citations-check.js'),
    'spec-paths citations-check must print an absolute path ending in citations-check.js — ' +
    'commands resolve every script through spec-paths, so a missing/wrong key breaks doctor ' +
    'check 20 silently: got "' + printed + '" (stderr: ' + (r.stderr || '') + ')')
})

test('AC-20260810-09-5: doctor.md documents a numbered advisory check invoking citations-check (check 15 after the v7 renumber)', () => {
  const doctor = read('spec/commands/doctor.md')
  assert.match(doctor, /15\.\s*\*\*[^*]*\*\*[\s\S]{0,400}citations-check/,
    'doctor.md must contain a numbered check that names citations-check — without it a ' +
    'fresh /spec:doctor run never invokes the checker at all')
  const idx = doctor.search(/15\.\s*\*\*/)
  const nearby = doctor.slice(idx, idx + 400)
  assert.match(nearby, /advisory/i,
    'the citations check must stay documented as advisory — a silently-blocking check would ' +
    'contradict the Decision that scoped it advisory')
})

// ---------------------------------------------------------------------------
// AC-20260810-09-6
// ---------------------------------------------------------------------------

test('AC-20260810-09-6: manifest-check.sh prints the machine sentinel TOTAL=4 FAILS=1 INERT=1, keeps the prose summary, and still exits 1', () => {
  const { runBash } = require('../helpers')
  const dir = tmpdir('manifest-ac6')
  const passFile = path.join(dir, 'ok.txt')
  fs.writeFileSync(passFile, 'present\n')
  const manifest = {
    checks: [
      { claim: 'file one exists', kind: 'file', target: passFile },
      { claim: 'file one exists again', kind: 'file', target: passFile },
      { claim: 'a command that always fails', kind: 'exec', target: 'exit 1' },
      { claim: 'a declared exemption', kind: 'inert', target: 'not applicable to this host' }
    ]
  }
  const manifestPath = path.join(dir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  const r = runBash('scripts/manifest-check.sh', ['--manifest', manifestPath])
  assert.strictEqual(r.status, 1,
    'manifest-check.sh must continue to exit 1 when any check fails — the sentinel line is ' +
    'additive, not a replacement for the existing pass/fail exit code: got ' + r.status)
  assert.match(r.stdout, /TOTAL=4 FAILS=1 INERT=1/,
    'the new machine sentinel line must report TOTAL=4 FAILS=1 INERT=1 for this manifest — ' +
    'release.md\'s substrate field parses these counts verbatim, so a missing or wrong ' +
    'sentinel corrupts the ledger row verdict.js writes: ' + (r.stdout || ''))
  assert.match(r.stdout, /of 4 checks FAILED/,
    'the existing human prose summary sentence must still print alongside the sentinel — D6 ' +
    'adds the machine line, it does not remove the human-readable one: ' + (r.stdout || ''))
})
