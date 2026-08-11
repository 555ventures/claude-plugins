'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// 2026-08-10 command-surface audit (spec 20260810/08-command-conflict-fixes): four blind
// auditors found twelve places where two doctrine passages (or doctrine and a script) send an
// orchestrator two ways. These tests pin the fix: each surface below states its behavior once,
// in the place its consumer reads it. Doctrine regex-pin mode over read() content — no script
// execution, since the defects are prose contradictions, not runtime bugs.

function section(src, startHeading, endHeading) {
  const start = src.indexOf(startHeading)
  if (start === -1) throw new Error('heading not found: ' + startHeading)
  const from = start + startHeading.length
  const end = endHeading ? src.indexOf(endHeading, from) : src.length
  if (endHeading && end === -1) throw new Error('end heading not found: ' + endHeading)
  return src.slice(from, end === -1 ? src.length : end)
}

// ---------------------------------------------------------------------------
// AC-20260810-08-1 — plan.md T2 tier branch: delegation/durability + Pipeline Entry + STOP
// ---------------------------------------------------------------------------

test('AC-20260810-08-1: plan.md T2 branch cites shared.md § Pipeline Entry and gates on delegation/durability with a STOP path', () => {
  const plan = read('spec/commands/plan.md')
  const tier = section(plan, '## Phase 0 — Context check & tier', '## Phase 1 — Discovery')
  assert.match(tier, /§\s*Pipeline Entry/,
    'a T2 orchestrator following plan.md cold has no pointer to shared.md § Pipeline Entry, so it cannot apply the delegation/durability gate')
  assert.match(tier, /delegation/i,
    'the T2 branch must state "delegation" as a criterion for writing a spec, or a T2 orchestrator will always write one')
  assert.match(tier, /durability/i,
    'the T2 branch must state "durability" as a criterion for writing a spec, or a T2 orchestrator will always write one')
  const t2Match = tier.match(/\*\*T2\*\*[\s\S]*?(?=\n\s*-\s*\*\*T3\*\*|\n\s*-\s*\*\*T1\/T2\*\*|$)/)
  assert.ok(t2Match, 'no distinct **T2** bullet found — the T2/T3 branch has not been split as D1 requires')
  assert.match(t2Match[0], /STOP/,
    'a T2 spec meeting neither delegation nor durability must STOP with a direct-work message, mirroring the existing T1 STOP wording')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-2 — review.md {root} vs {mainRoot} split
// ---------------------------------------------------------------------------

test('AC-20260810-08-2: review.md binds {root} in Phase 0 before its first use as "working tree under review"', () => {
  const review = read('spec/commands/review.md')
  const phase0 = section(review, '## Phase 0 — Preflight (parallel)', '## Phase 1 — Review workflow')
  const bindingIdx = phase0.search(/working tree under\s+review/)
  assert.notStrictEqual(bindingIdx, -1,
    'no sentence in Phase 0 defines {root} as "the working tree under review" — a cold orchestrator has no binding for the symbol it uses at step 1')
  const step1Idx = phase0.indexOf('\n1. ')
  assert.notStrictEqual(step1Idx, -1,
    'Phase 0 has no numbered step 1 — the AC anchors the binding before step 1\'s first {root} use, so the structure it relies on is gone')
  const step1UseIdx = phase0.indexOf('{root}', step1Idx)
  assert.ok(step1UseIdx !== -1 && bindingIdx < step1UseIdx,
    '{root} is used from step 1 onward before its "working tree under review" binding sentence appears — a cold orchestrator reaches the symbol unbound')
})

test('AC-20260810-08-2: review.md resolves {mainRoot} via {mergeBack} root at the top of Phase 4, before Phase 4 step 1', () => {
  const review = read('spec/commands/review.md')
  const phase4 = section(review, '## Phase 4 — Merge-back', '## Next pointer')
  const mainRootIdx = phase4.search(/\{mainRoot\}/)
  assert.notStrictEqual(mainRootIdx, -1,
    'Phase 4 never resolves {mainRoot} — the merge target symbol D2 introduces for the post-inspect main tree is absent, so the eleven main-tree consumers still resolve against the pre-relocation {root}')
  const step1Idx = phase4.search(/\n1\.\s*\*\*Inspect/)
  assert.ok(step1Idx !== -1 && mainRootIdx < step1Idx,
    '{mainRoot} must be resolved via {mergeBack} root before Phase 4 step 1 (Inspect), since inspect and the strategy ask run before the session relocates')
  assert.match(phase4.slice(0, step1Idx), /\{mergeBack\}\s*root/,
    '{mainRoot} must be derived from `{mergeBack} root --worktree {worktree}`, not invented some other way')
})

test('AC-20260810-08-2: every {mergeBack} inspect/merge/cleanup/verify call in Phase 4 takes --root {mainRoot}, never --root {root}', () => {
  const review = read('spec/commands/review.md')
  const phase4 = section(review, '## Phase 4 — Merge-back', '## Next pointer')
  const calls = phase4.match(/\{mergeBack\}\s+(inspect|merge|cleanup|verify)[^\n]*/g) || []
  assert.ok(calls.length >= 4,
    'expected to find inspect/merge/cleanup/verify invocations in Phase 4 — the section slice or heading anchors may have drifted')
  for (const call of calls) {
    assert.match(call, /--root \{mainRoot\}/,
      `Phase 4 merge-back call "${call}" must take --root {mainRoot} (the post-relocation main tree), not the Phase 0 {root} symbol which is still the pre-relocation worktree when inspect/strategy run`)
    assert.doesNotMatch(call, /--root \{root\}/,
      `Phase 4 merge-back call "${call}" still passes --root {root} — this hands the worktree path to a main-tree consumer`)
  }
  const observeCiIdx = phase4.search(/observe-ci[^\n]*/)
  if (observeCiIdx !== -1) {
    const observeLine = phase4.slice(observeCiIdx).split('\n')[0]
    assert.match(observeLine, /--root \{mainRoot\}/,
      'observe-ci in Phase 4 must run with --root {mainRoot}, since it runs after relocation and needs the main tree, not the worktree')
  }
})

test('AC-20260810-08-2: review.md no longer defines {root} as the main working tree', () => {
  const review = read('spec/commands/review.md')
  assert.doesNotMatch(review, /\{root\}\s+is\s+the\s+\*\*project root\*\*/,
    'the old Phase 4 sentence defining {root} as the main working tree must be deleted — D2 gives Phase 4 its own {mainRoot} symbol, and a leftover redefinition re-introduces the single-binding defect')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-3 — diff_base written at build time, template field documented
// ---------------------------------------------------------------------------

test('AC-20260810-08-3: build.md Phase 0 writes diff_base to spec frontmatter before any build edit, for in-place builds', () => {
  const build = read('spec/commands/build.md')
  const phase0 = section(build, '## Phase 0 — Preflight', '## Phase 1 — Run the build')
  assert.match(phase0, /diff_base:/,
    'build.md Phase 0 no longer records `git rev-parse HEAD` in conversation context only — an in-place build must write `diff_base:` into the spec frontmatter so a fresh review session can recover it from disk')
})

test('AC-20260810-08-3: spec.md template documents a commented diff_base field naming /spec:build as writer and /spec:review as reader', () => {
  const tmpl = read('spec/templates/spec.md')
  const diffBaseLine = tmpl.split('\n').find(l => l.includes('diff_base:'))
  assert.ok(diffBaseLine, 'spec/templates/spec.md has no commented `diff_base:` field — D3 requires it alongside the existing `build_base:` field')
  assert.match(diffBaseLine, /\/spec:build/,
    'the template diff_base comment must name /spec:build as the writer (for in-place builds)')
  assert.match(diffBaseLine, /\/spec:review/,
    'the template diff_base comment must name /spec:review as the reader')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-4 — review.md step 1 recovery order: build_base -> diff_base -> branch fallback
// ---------------------------------------------------------------------------

test('AC-20260810-08-4: review.md step 1 recovers build_base, then diff_base (diffed diff_base..HEAD), then falls back to the current branch name', () => {
  const review = read('spec/commands/review.md')
  const phase0 = section(review, '## Phase 0 — Preflight (parallel)', '## Phase 1 — Review workflow')
  const step1 = phase0.slice(0, phase0.indexOf('2. **Scope reconciliation'))
  assert.match(step1, /build_base/,
    'step 1 must still recover build_base first (worktree builds, unchanged)')
  assert.match(step1, /diff_base/,
    'step 1 must add a second recovery step reading diff_base for in-place builds — an in-place build has no build_base and today falls straight to the branch-name fallback, producing an empty diff post-checkpoint-commit')
  assert.match(step1, /\{diff_base\}\.\.HEAD/,
    'when diff_base is the recovered value, review must diff `{diff_base}..HEAD`, not the branch-name fallback\'s comparison')
  const buildBaseIdx = step1.search(/build_base/)
  const diffBaseIdx = step1.search(/diff_base/)
  const branchFallbackIdx = step1.search(/current branch|branch-name fallback|rev-parse --abbrev-ref HEAD/)
  assert.ok(buildBaseIdx < diffBaseIdx,
    'build_base must be checked before diff_base in the recovery order')
  assert.ok(diffBaseIdx < branchFallbackIdx,
    'diff_base must be checked before the current-branch-name fallback, or an in-place build never reaches its own diff_base')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-5 — doctor.md check 11 re-keyed to derived build branch + superseded enum
// ---------------------------------------------------------------------------

test('AC-20260810-08-5: doctor.md check 11 keys staleness to a derived spec/<stem> build branch, conditional on build_base: presence', () => {
  const doctor = read('spec/commands/doctor.md')
  const check11 = section(doctor, '11. **Spec-dir hygiene**', '12. **Run ledger hygiene**')
  assert.match(check11, /spec\/<[^>]*stem[^>]*>|spec\/\$\{?stem\}?|derived[^.\n]*spec\//i,
    'check 11 must derive the build branch as spec/<stem> from the spec filename (the literal rule enter-worktree.md and merge-back create apply), per D5')
  assert.match(check11, /build_base:/,
    'the re-keyed stale-implementing sub-check must stay conditional on build_base: presence, so in-place builds (no build_base) are skipped rather than false-flagged')
})

test('AC-20260810-08-5: doctor.md check 11 status enum includes superseded and drops the dead build_base-branch wording', () => {
  const doctor = read('spec/commands/doctor.md')
  const check11 = section(doctor, '11. **Spec-dir hygiene**', '12. **Run ledger hygiene**')
  assert.match(check11, /superseded/,
    'the status enum must include `superseded` (D6) — otherwise every correctly-retired spec is flagged and the recommended fix un-retires it')
  assert.doesNotMatch(check11, /build_base:`\s*branch no longer exists/,
    'the old "build_base: branch no longer exists" test must be deleted, not kept alongside the re-keyed check — the audit found this branch almost never disappears, so the class it exists for can never fire')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-6 / AC-20260810-08-11 — doctor.md check 12 threshold + exemptions + hygiene survives
// ---------------------------------------------------------------------------

test('AC-20260810-08-6: doctor.md check 12 raises the prose-leak threshold to ~1000 chars and exempts fast-path build, escape, and release rows alongside observe rows', () => {
  const doctor = read('spec/commands/doctor.md')
  const check12 = section(doctor, '12. **Run ledger hygiene**', '13. **Scaffold audit**')
  assert.match(check12, /~?1000\s*chars/,
    'the threshold must move from ~600 to ~1000 chars — review.md\'s mandated verbatim ledger row lands ~600-650 with ordinary values, so 600 flags a fully conforming row')
  assert.match(check12, /fast-path/i,
    'the required-field exemption must name fast-path build rows ("fastPath":true, no runId) — build.md\'s fast path is a sanctioned row shape the literal text currently flags')
  assert.match(check12, /escape/i,
    'the required-field exemption must name escape rows (their own field set, no runId)')
  assert.match(check12, /release/i,
    'the required-field exemption must name release rows (milestone/briefs fields instead of runId)')
})

test('AC-20260810-08-11: doctor.md check 12 continues to flag oversize ledger lines as prose leaks and require the ledger be git-tracked', () => {
  const doctor = read('spec/commands/doctor.md')
  const check12 = section(doctor, '12. **Run ledger hygiene**', '13. **Scaffold audit**')
  assert.match(check12, /prose leak/,
    'the oversize-line-is-a-prose-leak check must survive the threshold move — this is the hygiene purpose the threshold change must not weaken')
  assert.match(check12, /tracked by git/,
    'the git-tracked-ledger requirement must survive the threshold move')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-7 — release.md is user-invoked by design
// ---------------------------------------------------------------------------

test('AC-20260810-08-7: release.md states release is deliberately user-invoked and never suggested by Next pointers or --next', () => {
  const release = read('spec/commands/release.md')
  assert.match(release, /user-invoked/i,
    'release.md must state that releasing is deliberately user-invoked (D8) — otherwise the routing gap where no command ever points at /spec:release reads as an omission, not a design choice')
  assert.match(release, /--next|Next pointer/,
    'the user-invoked sentence must explicitly name that no Next pointer / --next derivation ever suggests /spec:release')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-8 — init.md Phase 6 fourth genesis arm (pending / unrecognized)
// ---------------------------------------------------------------------------

test('AC-20260810-08-8: init.md Phase 6 gains a fourth genesis arm for pending/unrecognized design values that warns, writes no design block, and names /spec:genesis-design', () => {
  const init = read('spec/commands/init.md')
  const phase6 = section(init, '## Phase 6 — Design foundation', '## Phase 7 — Verify')
  assert.match(phase6, /pending/,
    'Phase 6 must add an explicit arm for `.claude/genesis/status.json` with design: "pending" (or any unrecognized value) — today the three existing arms leave this state to orchestrator improvisation')
  assert.match(phase6, /warn/i,
    'the pending arm must warn (matching genesis.md\'s "warned, proceeds" gate), not silently proceed or block')
  assert.match(phase6, /\/spec:genesis-design/,
    'the pending arm\'s warning (and the Phase 7 report) must name /spec:genesis-design as the pending finisher')
  const pendingArmIdx = phase6.search(/pending/)
  assert.ok(pendingArmIdx !== -1, 'pending arm not found')
  const armText = phase6.slice(Math.max(0, pendingArmIdx - 400), pendingArmIdx + 400)
  assert.doesNotMatch(armText, /AskUserQuestion/,
    'the pending arm must never run the adopt/craft AskUserQuestion — a second canon is the worse failure than deferring')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-9 — genesis-design.md header seat + Next pointer atlas sweep
// ---------------------------------------------------------------------------

test('AC-20260810-08-9: genesis-design.md header names Opus alone, not "Fable or Opus"', () => {
  const gd = read('spec/commands/genesis-design.md')
  const header = gd.slice(0, gd.indexOf('## Input'))
  assert.doesNotMatch(header, /Fable or Opus/,
    'the header model-seat claim must read Opus alone (D10) — genesis-design\'s own Phase 4, Rules, and shared.md § Model Placement already say Opus, and the header self-contradicts them')
  assert.match(header, /Opus/,
    'the header must still name Opus as the seat')
})

test('AC-20260810-08-9: genesis-design.md terminal Next pointer inserts /spec:atlas before /spec:init', () => {
  const gd = read('spec/commands/genesis-design.md')
  const nextLine = gd.split('\n').find(l => l.trim().startsWith('Next:'))
  assert.ok(nextLine, 'genesis-design.md has no terminal "Next:" pointer line')
  assert.match(nextLine, /\/spec:atlas/,
    'the Next pointer must insert the atlas sweep stage (/spec:atlas) — it exists in architect\'s chain and shared.md but silently drops for users following genesis-design\'s own pointer')
  const atlasIdx = nextLine.indexOf('/spec:atlas')
  const initIdx = nextLine.indexOf('/spec:init')
  assert.ok(atlasIdx !== -1 && initIdx !== -1 && atlasIdx < initIdx,
    '/spec:atlas must come before /spec:init in the Next pointer sequence')
})

// ---------------------------------------------------------------------------
// AC-20260810-08-10 — review.md Phase 4 build_base attribution fixed to /git:enter-worktree
// ---------------------------------------------------------------------------

test('AC-20260810-08-10: review.md Phase 4 attributes build_base merge-back targeting to /git:enter-worktree, never /spec:build', () => {
  const review = read('spec/commands/review.md')
  const phase4 = section(review, '## Phase 4 — Merge-back', '## Next pointer')
  assert.match(phase4, /originating branch/,
    'Phase 4 must continue to describe merge-back as targeting the originating branch recovered from build_base in Phase 0 step 1')
  const attributionLine = phase4.split('\n').find(l => /originating branch/.test(l) && /recorded by/.test(l))
  assert.ok(attributionLine,
    'no "originating branch ... recorded by ..." attribution sentence found in Phase 4 — the merge target\'s recorder must be named')
  assert.match(attributionLine, /\/git:enter-worktree/,
    'the recorder of build_base must be attributed to /git:enter-worktree, matching build.md\'s own "Build never writes build_base" and review.md\'s own step 1')
  assert.doesNotMatch(attributionLine, /\/spec:build/,
    'the attribution line must never credit /spec:build with recording build_base — build.md itself states build never writes it')
})
