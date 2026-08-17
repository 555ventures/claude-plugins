'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// JJ-20260817-04: the 6.29.0 UPWELL-20260718-01 fix told the RedCheck agent to rewrite File
// Plan paths relative to the runner's workspace when a workspace-filtered command (e.g.
// `pnpm --filter app test`) collects zero files. But the sentinel instruction still tells the
// agent to echo `<path>` — the (possibly rewritten) invocation path — verbatim into
// AUDIT_RED:<path> / AUDIT_GREEN:<path>. crossCheckSentinels() then exact-matches
// `AUDIT_RED:` + the ORIGINAL File Plan path from the expectations list. On a workspace host
// where the agent rewrote `app/src/llm/foo.test.ts` down to `src/llm/foo.test.ts` to get the
// runner to collect it, the sentinel it reports is keyed to the rewritten path, the cross-check
// looks for the File Plan path, and every rewritten file reads back as "not-collected"/
// UNVERIFIED even when it is genuinely red — the workspace-path fix and the sentinel contract
// silently fight each other. The prompt also invites one combined multi-file runtime
// invocation ("<paths>", plural), which cannot yield a per-file exit code at all. Fix contract:
// the sentinel must always key off the File Plan path regardless of any rewritten invocation
// path, and the runtime leg must be one probe per file.

const src = fs.readFileSync(path.join(SPEC, 'workflows/src/wf-build.body.js'), 'utf8')
// Spec 20260817/03 hoists the RedCheck prompt into a top-level redCheckPrompt() function; the
// slice must keep covering the prompt text wherever it lives, or these pins pass vacuously.
const fnStart = src.indexOf('function redCheckPrompt')
const phaseStart = src.indexOf("phase('RedCheck')")
assert.ok(phaseStart !== -1, 'RedCheck phase missing from wf-build source')
const start = fnStart !== -1 ? Math.min(fnStart, phaseStart) : phaseStart
const end = src.indexOf('FAIL CLOSED', phaseStart)
const redBlock = src.slice(start, end)

test('JJ-20260817-04: the sentinel instruction keys AUDIT_RED/AUDIT_GREEN to the File Plan path even when the runner invocation path was rewritten', () => {
  assert.match(redBlock, /sentinel[\s\S]{0,400}(File Plan|original)\s+path/i,
    'today the sentinel instruction says to echo the (possibly workspace-rewritten) invocation ' +
    '`<path>` verbatim and never re-binds it to the File Plan path — on a workspace host where ' +
    'the agent rewrote the path to get the runner to collect the file, crossCheckSentinels() ' +
    'exact-matches against the File Plan path and every such file reads back as ' +
    '"not-collected"/UNVERIFIED even though it is genuinely red')
})

test('JJ-20260817-04: the runtime leg requires one probe invocation per file, not a combined multi-path run', () => {
  // The token is `args.gate.testCommand` today and becomes `gate.testCommand` after spec
  // 20260817/03 hoists the prompt into redCheckPrompt(…, gate, …) — the pin must survive that
  // rename red, or 03's landing would retire it spuriously with the combined-run defect intact.
  assert.doesNotMatch(src, /Runtime:\s*\$\{(args\.)?gate\.testCommand\}\s*<paths>/,
    'the prompt currently reads "Runtime: <testCommand> <paths>" (plural) inviting one combined ' +
    'invocation across all files, which yields only a single whole-run exit code and cannot ' +
    'attribute pass/fail to any individual file — the observation leg must mandate a separate ' +
    'probe per file')
})

// The cross-check function's strict path-identity match (sentinel keyed to expectations[].path)
// IS the desired post-fix behavior — the fix is prompt-side (make the agent report sentinels
// keyed correctly), not a loosening of crossCheckSentinels() itself. So this is left as a
// non-asserting demonstration, not a pin, to avoid encoding a behavior change into the function:
//
// const { crossCheckSentinels } = evalFns(src, ['crossCheckSentinels'])
// crossCheckSentinels(
//   [{ path: 'app/src/llm/foo.test.ts', expect: 'red' }],
//   [{ path: 'src/llm/foo.test.ts', sentinel: 'AUDIT_RED:src/llm/foo.test.ts', typecheckRed: true,
//      typecheckEvidence: 'app/src/llm/foo.test.ts: TS2307', assertionsRun: 3 }],
//   true)
// -> today returns one 'no sentinel reported' mismatch, because the reported sentinel is keyed
//    to the rewritten path, not the File Plan path. The fix is to make the prompt bind the two
//    together, not to make crossCheckSentinels() tolerant of the mismatch.
