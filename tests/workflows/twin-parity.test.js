'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ROOT, read, evalFns } = require('../helpers')

// specs/20260813/05-workflow-correctness-repairs.md D5/D6/D8 (AC-20260813-05-7, -8, -10). Today
// wf-design's gate-repair loop is a hand-copied twin of wf-build's — it never gained wf-build's
// deviations sidecar, anti-oscillation repair history, or phantom-failure hardening even though
// the justifying comments were copied over (the drift this spec fixes). D5 extracts the shared
// loop into fragments/gate-loop.js.frag, spliced into both bodies verbatim (the fragment must
// avoid __WF_NAME__ so the spliced region is byte-identical in both generated files). D6 records
// the exhaustion cause (`exhaustedBy`) instead of collapsing four distinct causes into one opaque
// `gate-exhausted` token. D8 wraps the trust-boundary asserts in named functions
// (`assertGateArgs`, `assertBatchKinds`, `assertResolutions`) specifically so
// `evalFns`/`extractFn` — which cannot reach bare top-level statements — can execute them.

// specs/20260813/06a-return-envelope-corrections.md (2026-08-14) D4/D3(c): `const GATE` moves
// into this same fragment, immediately above `runGateLoop`, single-sourcing the schema both
// twins dispatch with (spec 06's D7 loosening had drifted — it only reached wf-build). Tag-only
// addition below: the byte-identical-splice pin already covers the moved definition by
// construction, no new assertion needed.

const FRAG_PATH = path.join(ROOT, 'spec/workflows/fragments/gate-loop.js.frag')

test('AC-20260813-05-7 / AC-20260813-06a-6: the gate-loop fragment exists, avoids __WF_NAME__, and is spliced byte-identically into both wf-build.js and wf-design.js (now including the moved GATE definition)', () => {
  assert.ok(fs.existsSync(FRAG_PATH),
    'fragments/gate-loop.js.frag must exist — the shared gate-repair loop (probe, repair-round ' +
    'loop, phantom-failure hardening, anti-oscillation history, deviations sidecar, exhaustion ' +
    'return assembly) currently lives duplicated in wf-build.body.js and wf-design.body.js, which ' +
    'is exactly how wf-design drifted out of sync with wf-build\'s hardening')
  const frag = fs.readFileSync(FRAG_PATH, 'utf8').replace(/\n+$/, '')
  assert.ok(!frag.includes('__WF_NAME__'),
    'the fragment must not use __WF_NAME__ — build-workflows.js substitutes it per-workflow, which ' +
    'would make the spliced region differ between wf-build.js and wf-design.js and break the ' +
    'byte-identical-region guarantee this AC requires')
  const buildGen = read('spec/workflows/wf-build.js')
  const designGen = read('spec/workflows/wf-design.js')
  assert.ok(buildGen.includes(frag),
    'wf-build.js (generated) must contain the gate-loop fragment spliced in verbatim')
  assert.ok(designGen.includes(frag),
    'wf-design.js (generated) must contain the SAME gate-loop fragment text as wf-build.js — a ' +
    'byte-identical spliced region is what makes the twins impossible to drift apart again')
})

test('AC-20260813-05-8: the gate-loop fragment\'s exhaustion return carries exhaustedBy from the closed cause set plus a deviations array', () => {
  assert.ok(fs.existsSync(FRAG_PATH), 'fragments/gate-loop.js.frag must exist')
  const frag = fs.readFileSync(FRAG_PATH, 'utf8')
  for (const cause of ['agent-died', 'no-attributable-failure', 'oscillation', 'ceiling']) {
    assert.ok(frag.includes(cause),
      `the exhaustion return must be able to report exhaustedBy: '${cause}' — collapsing this ` +
      `cause into the opaque single gate-exhausted token makes a dead gate agent indistinguishable ` +
      `from a genuinely red gate`)
  }
  assert.match(frag, /deviations/,
    'the shared return assembly must carry a deviations array (sidecar rows accumulated across ' +
    'repair rounds) — this is the exact machinery wf-design never received when it was hand-copied')
})

test('AC-20260813-05-10: assertGateArgs throws naming testCommand when args.gate lacks a string testCommand', () => {
  const buildSrc = read('spec/workflows/wf-build.js')
  const { assertGateArgs } = evalFns(buildSrc, ['assertGateArgs'])
  assert.throws(() => assertGateArgs({ command: 'echo hi' }), /testCommand/,
    'assertGateArgs must throw, naming testCommand, when args.gate has no string testCommand — an ' +
    'unguarded deref elsewhere in the workflow crashes cryptically mid-run instead of failing loud ' +
    'at the trust boundary')
})

test('AC-20260813-05-10: assertBatchKinds throws naming a batch kind outside the closed set', () => {
  const designSrc = read('spec/workflows/wf-design.js')
  const { assertBatchKinds } = evalFns(designSrc, ['assertBatchKinds'])
  assert.throws(() => assertBatchKinds([{ id: 'a', kind: 'bogus', files: [] }]), /bogus/,
    'assertBatchKinds must throw naming the invalid kind value "bogus" when a batch\'s kind falls ' +
    'outside {foundation, implement, stories} — an unvalidated kind today silently routes a batch ' +
    'to the wrong worker prompt instead of failing loud')
})

test('AC-20260813-05-10: assertResolutions throws naming the offending key when a resolution value fails the args token alphabet', () => {
  const buildSrc = read('spec/workflows/wf-build.js')
  const { assertResolutions } = evalFns(buildSrc, ['assertResolutions'])
  assert.throws(() => assertResolutions({ D3: "use the old name — it's fine" }), /D3/,
    'assertResolutions must throw naming the offending key "D3" when its value fails the closed ' +
    'args token alphabet /^[A-Za-z0-9._\\/:@=-]+$/ — free-text resolutions are the last open door ' +
    'in the 2026 args-corruption class (quotes/backslashes corrupting the JSON channel)')
})

// AC-20260813-05-15 (post-build ruling, spec D12): the gate's pass sentinel is the single point the
// whole pipeline trusts — every "gate passed" verdict in build and design reduces to whether
// __GATE_PASS__ appeared. Before 2026-08-13 the probe was `( <gate> ) && echo __GATE_PASS__`, whose
// own instruction text told the gate agent it fires "ONLY when the WHOLE gate command exits 0 (even
// if it contains `;`)" — false: a subshell reports its LAST statement's status, so a `;`-joined host
// gate whose first leg failed still printed the sentinel. The spec's Rationale originally deferred
// this as out-of-findings; the user ruled it in after the build (D12).
//
// The FIX is two lines, and the second line is not cosmetic. POSIX (and bash) ignore errexit for
// any command of an AND-OR list other than the last — and that suppression reaches INSIDE the
// subshell — so the obvious `( set -e; <gate> ) && echo <sentinel>` leaves the `set -e` completely
// inert, as does `if ( set -e; <gate> ); then`. Only a standalone subshell whose `$?` is tested on
// its own line actually applies errexit. The execution pins below are what caught that; keep them.
// Matched against workflow SOURCE, where the probe lives inside a JS template literal — so the line
// break is the two characters `\` `n`, not a real newline (String.raw keeps it that way).
const SENTINEL_WRAPPER = String.raw`( set -e; ${'${gateCmd}'} )\nif [ $? -eq 0 ]; then echo ${'${GATE_SENTINEL}'}; fi`
// Executed as a real shell script, so this one takes a real newline.
const PROBE = (gate) => `( set -e; ${gate} )\nif [ $? -eq 0 ]; then echo __GATE_PASS__; fi`

test('AC-20260813-05-15: the gate probe runs the host gate under `set -e` and tests $? on its own line, never as the left operand of &&', () => {
  const frag = fs.readFileSync(FRAG_PATH, 'utf8')
  assert.ok(frag.includes(SENTINEL_WRAPPER),
    'the shared gate probe must run the host gate as a standalone `( set -e; <gate> )` subshell and ' +
    'print the sentinel from a separate `$?` test — without set -e a `;`-joined host gate reports ' +
    'only its LAST statement\'s status, and folding the test back into `( … ) && echo` silently ' +
    'disables the set -e again (errexit is ignored for the non-final command of an AND-OR list)')

  for (const generated of ['spec/workflows/wf-build.js', 'spec/workflows/wf-design.js']) {
    assert.ok(read(generated).includes(SENTINEL_WRAPPER),
      `${generated} must carry the hardened probe — both twins splice the same fragment, so a ` +
      'miss here means the fragment was bypassed and that workflow can still report a false green')
  }
})

test('AC-20260813-05-15: the hardened probe is falsifiable — an early failing leg of a `;`-joined gate prints no sentinel, where the old probe did', () => {
  const run = (script) => execFileSync('bash', ['-c', script], { encoding: 'utf8' }).trim()

  assert.strictEqual(run(PROBE('false; true')), '',
    'the hardened probe must swallow the sentinel when an EARLY leg of a `;`-joined gate fails — ' +
    'if this prints the sentinel the probe is back to trusting the last statement only, which is ' +
    'the false-green this guard exists to kill')

  assert.strictEqual(run('( false; true ) && echo __GATE_PASS__ || true'), '__GATE_PASS__',
    'the ORIGINAL probe shape must still print the sentinel here — this asserts the defect was real; ' +
    'if it ever stops printing, the assertion above is passing vacuously and the pin has stopped ' +
    'measuring anything')

  assert.strictEqual(run('( set -e; false; true ) && echo __GATE_PASS__ || true'), '__GATE_PASS__',
    'the NAIVE fix (set -e folded into the left operand of &&) must still print the sentinel — this ' +
    'pins WHY the probe is two lines: errexit is ignored for the non-final command of an AND-OR ' +
    'list, so anyone "simplifying" the probe back to one line reintroduces the false green')

  assert.strictEqual(run(PROBE('true; true')), '__GATE_PASS__',
    'a fully passing `;`-joined gate must still print the sentinel — if this fails, the hardening ' +
    'turned every green gate red and no build or design run can ever complete')

  assert.strictEqual(run(PROBE('false && true')), '',
    'a failing `&&`-joined gate (the common host shape, and the only shape the design driver emits) ' +
    'must keep failing exactly as before — the hardening must not change these semantics')

  assert.strictEqual(run(PROBE('true && true')), '__GATE_PASS__',
    'a passing `&&`-joined gate must keep passing — the regression half of the pin above')

  assert.strictEqual(run(PROBE('false || true')), '__GATE_PASS__',
    'a gate that DELIBERATELY tolerates a non-zero step via `||` must keep passing — errexit never ' +
    'applies to the left operand of `||`, so hosts that opted into tolerance keep it')
})
