'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
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

const FRAG_PATH = path.join(ROOT, 'spec/workflows/fragments/gate-loop.js.frag')

test('AC-20260813-05-7: the gate-loop fragment exists, avoids __WF_NAME__, and is spliced byte-identically into both wf-build.js and wf-design.js', () => {
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
