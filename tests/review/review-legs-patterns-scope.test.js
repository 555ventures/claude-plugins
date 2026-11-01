'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { makeReviewLegsHost } = require('./review-legs.fixtures')

// Owner: the /spec:fix fix row for the patterns-leg scope defect (review-legs.js wave 2).
//
// The patterns leg's scope is the dirs of every file the diff changed, minus pipeline-owned
// paths — derived from scope-reconcile's `changed` set. A scope built from reconcile's exception
// sets (outOfPlan/unrealized/excluded) never contains a planned, realized source edit: the leg
// then sweeps only specs/ and .claude and reports a zero over a diff that added the very
// shortcut it sweeps for. The host below has src/foo.js planned and realized, a specs/ write
// in the same diff (pipeline-owned → excluded), and an eslint-disable line added to src/foo.js.
// The patterns script lives OUTSIDE the host tree so it is not itself an out-of-plan change
// (whose dirname "." would sweep the whole tree and mask the defect).
//
// `matches` is the sum of the script's `### <name>: N` totals, never a count of output lines —
// the script's own "## Mechanical pattern sweep" and "Scope:" header lines are not matches.

const SCRIPT = 'scripts/review-legs.js'
const GREEN_TEST = "const { test } = require('node:test'); test('ok', () => {})\n"

function patternsScript(dir) {
  const file = path.join(dir, 'patterns.sh')
  fs.writeFileSync(file, [
    '#!/usr/bin/env bash',
    'set -u',
    'DIRS=("$@")',
    '[ ${#DIRS[@]} -eq 0 ] && DIRS=(src)',
    'echo "## Mechanical pattern sweep"; echo "Scope: ${DIRS[*]}"; echo',
    'out=$(grep -rn "eslint-disable" "${DIRS[@]}" 2>/dev/null || true)',
    'count=0; [ -n "$out" ] && count=$(printf \'%s\\n\' "$out" | wc -l | tr -d \' \')',
    'echo "### eslint-disable: ${count}"',
    'echo "Sweep complete."',
    'exit 0',
    '',
  ].join('\n'))
  return file
}

function runLegs({ withHit, extraFiles = {} }) {
  const script = patternsScript(tmpdir('review-legs-patterns-script'))
  const { dir, base } = makeReviewLegsHost('review-legs-patterns-scope', {
    config: {
      gateCommand: 'true',
      testCommand: 'node --test',
      runtime: { inert: 'synthetic host — nothing boots' },
      capabilities: { forge: 'none' },
      patternsScript: script,
    },
    testBody: GREEN_TEST,
    // Overrides the fixture's planned src/foo.js rewrite in the same implement commit.
    extraFiles: {
      ...(withHit ? { 'src/foo.js': '// eslint-disable-next-line no-console\nmodule.exports = () => 42\n' } : {}),
      ...extraFiles,
    },
  })
  const outDir = tmpdir('review-legs-patterns-outdir')
  const manifest = path.join(tmpdir('review-legs-patterns-manifest'), 'manifest.jsonl')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260824/06-test.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const patternsOut = fs.readFileSync(path.join(outDir, 'patterns.txt'), 'utf8')
  const rows = fs.readFileSync(manifest, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const row = rows.find(x => x.leg === 'patterns')
  return { r, patternsOut, row }
}

test('patterns leg scope: a diff that edits a planned src/ file and writes under specs/ sweeps src/ and counts the eslint-disable it added', () => {
  const { r, patternsOut, row } = runLegs({ withHit: true })
  const scope = (patternsOut.match(/^Scope: (.*)$/m) || [])[1]
  assert.ok(scope !== undefined, 'the script must have run and printed its Scope line: ' + r.stdout + r.stderr)
  const dirs = scope.split(' ').filter(Boolean)
  assert.ok(dirs.includes('src'),
    'src/ is a planned, realized change in the diff and MUST be in the sweep scope — a scope derived from ' +
    'reconcile\'s exception sets never contains it: ' + JSON.stringify(scope))
  assert.ok(!dirs.some(d => d.startsWith('specs')),
    'pipeline-owned paths (specs/) are not source and stay out of the sweep scope: ' + JSON.stringify(scope))
  assert.ok(row, 'a patterns row must land in the manifest when patternsScript is declared: ' + r.stdout + r.stderr)
  assert.strictEqual(row.observed.matches, 1,
    'the one eslint-disable the diff added in src/ must be counted — not the header lines: ' + patternsOut)
})

test('patterns leg scope: a changed root-level file enters the scope as itself and nested dirs are pruned — never "." which would sweep specs/ and .claude', () => {
  const { patternsOut } = runLegs({ withHit: true, extraFiles: { 'README.md': '# root file\n', 'src/lib/util.js': 'module.exports = 1\n' } })
  const scope = (patternsOut.match(/^Scope: (.*)$/m) || [])[1] || ''
  const dirs = scope.split(' ').filter(Boolean)
  assert.ok(dirs.includes('README.md'),
    'a root-level changed file is swept as the file itself: ' + JSON.stringify(scope))
  assert.ok(!dirs.includes('.'),
    'a "." entry sweeps the whole tree including pipeline-owned specs/ and .claude — the one scope the user excluded: ' + JSON.stringify(scope))
  assert.ok(dirs.includes('src') && !dirs.includes('src/lib'),
    'src/lib sits under src and must be pruned — the sweep visits each argument separately, so an overlap counts every hit in src/lib twice: ' + JSON.stringify(scope))
})

test('patterns leg count: a sweep with no hit reports matches:0 — the script\'s own header lines are never counted as matches', () => {
  const { patternsOut, row } = runLegs({ withHit: false })
  assert.match(patternsOut, /^### eslint-disable: 0$/m, 'sanity: the script itself saw no hit: ' + patternsOut)
  assert.strictEqual(row.observed.matches, 0,
    'an empty sweep is matches:0 in the ledger; counting output lines would report the "## ..." and ' +
    '"Scope:" header as matches: ' + JSON.stringify(row))
})
