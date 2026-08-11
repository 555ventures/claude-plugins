'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, SPEC } = require('../helpers')

// 2026-08-10 drift-duplicate reconcile (spec 20260810/10-drift-duplicate-reconcile): ten
// places where a restated rule drifted from its original into disagreement — within one
// file, across a command/agent pair, or between a hook's claim and its actual behavior.
// Each test below pins the reconciled state: exactly one home statement per rule, every
// other site either citing it or matching it verbatim. Doctrine regex-pin mode over
// read() content, plus one exec-a-script check for the hook's `bash -n` syntax invariant.

function section(src, startHeading, endHeading) {
  const start = src.indexOf(startHeading)
  if (start === -1) throw new Error('heading not found: ' + startHeading)
  const from = start + startHeading.length
  const end = endHeading ? src.indexOf(endHeading, from) : src.length
  if (endHeading && end === -1) throw new Error('end heading not found: ' + endHeading)
  return src.slice(from, end === -1 ? src.length : end)
}

// ---------------------------------------------------------------------------
// AC-20260810-10-1 — D1: shared.md doctor-rewrite restatement aligned to the wholesale/--fix
// carve-out
// ---------------------------------------------------------------------------

test('AC-20260810-10-1: shared.md never states the doctor-rewrite rule as a bare "never rewrites either layer" without the wholesale/--fix qualifier', () => {
  const shared = read('spec/doctrine/shared.md')
  const bareMatches = shared.match(/never rewrites either layer(?!\s+wholesale)/g) || []
  assert.strictEqual(bareMatches.length, 0,
    'shared.md must not carry a flat "never rewrites either layer" restatement lacking the ' +
    '"wholesale" qualifier (D1) — an orchestrator reading only that restatement would refuse ' +
    'a sanctioned `/spec:doctor --fix` line-item repair, contradicting the canonical carve-out ' +
    'three paragraphs up in § Host Grounding')
  assert.match(shared, /never rewrites either layer wholesale/,
    'shared.md must keep exactly one full statement of the doctor-rewrite rule — "never ' +
    'rewrites either layer wholesale" with the `--fix` sanctioned-repair carve-out (D1) — or ' +
    'the rule has no home left at all')
})

// ---------------------------------------------------------------------------
// AC-20260810-10-2 — D2: dc-extract "Sonnet fallback" claim deleted, fail-closed truth stated
// ---------------------------------------------------------------------------

test('AC-20260810-10-2: shared.md carries zero occurrences of the fabricated dc-extract Sonnet-fallback claim', () => {
  const shared = read('spec/doctrine/shared.md')
  assert.doesNotMatch(shared, /Sonnet only as fallback/,
    'shared.md\'s § Workflows Encode Shape, Not Judgment parenthetical must drop "(Sonnet only ' +
    'as fallback)" (D2) — dc-extract.js runs no model and is fail-closed on every parse ' +
    'failure; the refuter demonstrated no Sonnet fallback exists anywhere in the script or its ' +
    'workflow callers, so the claim is fabricated, not merely stale')
})

test('AC-20260810-10-2: shared.md\'s § Workflows Encode Shape, Not Judgment site states dc-extract is deterministic and fail-closed on unparseable mocks', () => {
  const shared = read('spec/doctrine/shared.md')
  const workflowsSection = section(shared, '## Workflows Encode Shape, Not Judgment', '## Worker Git Ban')
  const dcExtractIdx = workflowsSection.search(/dc-extract/)
  assert.notStrictEqual(dcExtractIdx, -1,
    'shared.md\'s § Workflows Encode Shape, Not Judgment section has no dc-extract mention to ' +
    'anchor the fix on — the first global /dc-extract/ match in the file lands in the earlier ' +
    '§ Design Canon section instead, which is not the site this AC names')
  const nearby = workflowsSection.slice(Math.max(0, dcExtractIdx - 50), dcExtractIdx + 400)
  assert.match(nearby, /no model — fail-closed/,
    'the § Workflows Encode Shape, Not Judgment dc-extract parenthetical must be replaced with ' +
    'the true short form "(deterministic, no model — fail-closed on unparseable mocks)" (D2) — ' +
    'this section\'s shared-for readers (build/review/enforce) never load § Design Binding ' +
    'Pipeline, so a bare citation would strand them without the load-bearing fact')
})

// ---------------------------------------------------------------------------
// AC-20260810-10-3 — D3: reviewer.md/review.md/wf-review.body.js drift-gate framing reconciled
// to the "Phase 0 grep matrix IS the gate; AC↔test check is the semantic backstop" ownership
// ---------------------------------------------------------------------------

test('AC-20260810-10-3: reviewer.md\'s no-driftScript arm calls the AC↔test coverage check the semantic backstop, not itself the drift gate', () => {
  const reviewer = read('spec/agents/reviewer.md')
  assert.match(reviewer, /semantic backstop/,
    'reviewer.md\'s no-driftScript Cross-Cutting Checks bullet must say "semantic backstop" ' +
    '(D3) — review.md already owns "the Phase 0 grep matrix IS the drift gate" as the ' +
    'canonical statement, and reviewer.md\'s own "your coverage check IS the drift gate" ' +
    'phrasing contradicts it: a T3 panel\'s reviewer would believe their check is the gate ' +
    'when review.md\'s Phase 0 grep already made that determination mechanically')
})

test('AC-20260810-10-3: spec/workflows/src/wf-review.body.js\'s DRIFT_NOTE uses the backstop framing and carries zero "THIS check is the drift gate" claims', () => {
  const body = read('spec/workflows/src/wf-review.body.js')
  assert.doesNotMatch(body, /THIS check is the drift gate/,
    'wf-review.body.js\'s DRIFT_NOTE must drop "THIS check is the drift gate; a missing test ' +
    'is hard" (D3) — the runtime reviewer prompt sent to a live T3 panel currently disagrees ' +
    'with the system prompt (reviewer.md) it also carries, once reviewer.md is fixed')
  assert.match(body, /semantic backstop/,
    'wf-review.body.js\'s DRIFT_NOTE must be rewritten to "the Phase 0 grep matrix is the ' +
    'deterministic drift gate; your AC↔test check is the semantic backstop — a test that ' +
    'names an AC-ID without testing the behavior is still hard" (D3)')
})

test('AC-20260810-10-3: the generated spec/workflows/wf-review.js carries the same DRIFT_NOTE fix as its body.js source (regenerated in the same diff)', () => {
  const generated = read('spec/workflows/wf-review.js')
  assert.doesNotMatch(generated, /THIS check is the drift gate/,
    'spec/workflows/wf-review.js must be regenerated via `npm run build:workflows` after the ' +
    'body.js DRIFT_NOTE fix (D3) — a stale generated file still sends a live T3 panel the old ' +
    '"THIS check is the drift gate" claim regardless of what the source now says')
  assert.match(generated, /semantic backstop/,
    'the generated wf-review.js must carry the regenerated backstop-framed DRIFT_NOTE, not a ' +
    'stale pre-regeneration copy')
})

test('AC-20260810-10-3: review.md drops the false "already calibrates this via hasDriftScript" parenthetical while keeping "the Phase 0 grep matrix IS the drift gate"', () => {
  const review = read('spec/commands/review.md')
  const driftGateSection = section(review, '## Drift gate', '## Phase 2')
  assert.doesNotMatch(driftGateSection, /already calibrates\s+this/,
    'review.md § Drift gate must drop the "(The workflow\'s reviewer prompt already calibrates ' +
    'this via `hasDriftScript`.)" parenthetical (D3) — the flag only toggles whether the ' +
    'DRIFT_NOTE string is appended at all, it never calibrates the drift-gate/backstop ' +
    'ownership split, so the claim was false')
  assert.match(driftGateSection, /Phase 0 grep matrix IS the drift/,
    'review.md § Drift gate must continue to state "the Phase 0 grep matrix IS the drift gate" ' +
    'unchanged — D3 owns this section as the canonical drift-gate statement and only corrects ' +
    'the false parenthetical beside it')
})

// ---------------------------------------------------------------------------
// AC-20260810-10-4 — D4: two circular canonicity pairs in shared.md given single homes in
// § Model Placement
// ---------------------------------------------------------------------------

test('AC-20260810-10-4: shared.md gives both circular canonicity pairs single homes in § Model Placement — consult-free-T3 markers once, and "Opus is the cost-rational default" once, each cited elsewhere', () => {
  const shared = read('spec/doctrine/shared.md')
  const coverageGapMatches = shared.match(/not a coverage gap/g) || []
  assert.strictEqual(coverageGapMatches.length, 1,
    'shared.md must state "...and that\'s a pass, not a coverage gap" exactly once (D4) — ' +
    'today both § Model Placement\'s Retainer pattern bullet and § Escalation Contract\'s ' +
    'closing paragraph independently restate the consult-free-T3 rule with this marker, each ' +
    'citing the other as though the other were the home, so neither can be safely edited alone')
  const modelPlacement = section(shared, '## Model Placement', '## Escalation Contract (build)')
  assert.match(modelPlacement, /not a coverage gap/,
    '§ Model Placement (the Retainer pattern bullet) must keep the surviving full statement of ' +
    'the consult-free-T3 rule (D4) — it is the section a model-seat question loads')
  const escalation = section(shared, '## Escalation Contract (build)', '## ')
  assert.match(escalation, /§\s*Model Placement/,
    '§ Escalation Contract\'s reduced copy must cite § Model Placement by its actual heading ' +
    '(D4), or a reader following the citation lands nowhere')

  const literalMatches = shared.match(/Opus is the cost-rational default/g) || []
  assert.strictEqual(literalMatches.length, 1,
    'shared.md must state "Opus is the cost-rational default" exactly once, in § Model ' +
    'Placement\'s standalone-design named exception (D4) — a second full restatement ' +
    'elsewhere recreates the circular-canonicity defect this decision fixes')
  assert.match(modelPlacement, /Opus is the cost-rational default/,
    '§ Model Placement must be the site carrying the standalone-design-seat rule\'s full ' +
    'statement (D4)')
  const designBinding = section(shared, '## Design Binding Pipeline (/spec:design)', '## ')
  assert.match(designBinding, /§\s*Model Placement/,
    '§ Design Binding Pipeline\'s standalone-seat copy must cite § Model Placement by its ' +
    'actual heading (D4)')
})

// ---------------------------------------------------------------------------
// AC-20260810-10-5 — D5: shared.md's runtime-LLM-rule-check sentence gains the design-harness
// carve-out, self-contained
// ---------------------------------------------------------------------------

test('AC-20260810-10-5: shared.md § Rule Enforcement names the design-harness checklist walk as a second sanctioned runtime LLM rule-check, alongside /spec:plan', () => {
  const shared = read('spec/doctrine/shared.md')
  const ruleEnforcement = section(shared, '## Rule Enforcement', '## Pipeline Entry')
  const sanctionedIdx = ruleEnforcement.search(/only sanctioned runtime LLM/)
  assert.notStrictEqual(sanctionedIdx, -1,
    '§ Rule Enforcement has no "only sanctioned runtime LLM rule-check" sentence to anchor the ' +
    'carve-out on')
  const sentence = ruleEnforcement.slice(sanctionedIdx, sanctionedIdx + 400)
  assert.match(sentence, /design harness/i,
    'the sanctioned-runtime-LLM-check sentence must name the design harness\'s per-mock ' +
    'checklist walk as a second sanctioned case (D5) — the mandatory Sonnet checklist walk ' +
    '(§ Design Binding Pipeline) is a prose surface with no deterministic checker, which the ' +
    'flat "only /spec:plan" claim falsifies later in the same file')
  assert.match(sentence, /\/spec:plan/,
    'the carve-out must be stated alongside /spec:plan, not as a replacement for it')
  assert.match(ruleEnforcement, /§\s*Design Binding Pipeline/,
    'the carve-out sentence must cite § Design Binding Pipeline for the full mechanism (D5), ' +
    'while standing self-contained for doctor/enforce readers whose shared-for scope never ' +
    'loads that section')
})

// ---------------------------------------------------------------------------
// AC-20260810-10-6 — D6: merge.md single cleanup-sequence statement; build.md single args
// alphabet enumeration
// ---------------------------------------------------------------------------

test('AC-20260810-10-6: git/merge.md states the worktree-cleanup sequence\'s numbered steps exactly once (Step 7), with rule 4 citing "Step 7" instead of restating it', () => {
  const merge = read('git/commands/merge.md')
  const stepNumberedSequences = merge.match(/1\.\s*\*\*`ExitWorktree\(action="keep"\)`\*\*/g) || []
  assert.strictEqual(stepNumberedSequences.length, 1,
    'git/merge.md must carry the numbered ExitWorktree(keep) -> merge -> remove-worktree ' +
    'sequence exactly once, in Step 7 (D6) — rule 4 under NON-NEGOTIABLE RULES currently ' +
    'restates the same three-step sequence near-verbatim instead of citing Step 7, so an edit ' +
    'to one site silently stops matching the other')
  const rulesSection = section(merge, '## NON-NEGOTIABLE RULES', null)
  const rule4 = rulesSection.split('\n').find(l => /^4\./.test(l.trim()))
  assert.ok(rule4, 'NON-NEGOTIABLE RULES rule 4 (worktree cleanup) not found')
  assert.match(rule4, /Step 7/,
    'rule 4 must cite "Step 7\'s sequence exactly" (D6) rather than re-enumerating the ' +
    'ExitWorktree/merge/remove-worktree steps inline')
  assert.ok(rule4.length < 200,
    'rule 4 must shrink to a short citation of Step 7, not remain a near-full restatement of ' +
    'the sequence (D6) — its current length is the drift-duplication defect itself')
})

test('AC-20260810-10-6: spec/commands/build.md states the args no-free-text alphabet\'s full enumeration exactly once, matching the paths/ids/enums/booleans family', () => {
  const build = read('spec/commands/build.md')
  const alphabetMatches = build.match(/paths[,/]\s*ids[,/]\s*enums/gi) || []
  assert.strictEqual(alphabetMatches.length, 1,
    'spec/commands/build.md must state the args alphabet enumeration ("paths, ids, enums, ' +
    'booleans, and the host\'s gate command") exactly once (D6) — today the canonical block ' +
    'near "Invariant — no free text" states the full alphabet while an earlier Phase 0 ' +
    'sentence independently states a narrower "paths/ids/enums" form omitting booleans and ' +
    'commands; the two alphabets currently differ, which is the defect the reconcile fixes')
  assert.match(build, /paths,\s*ids,\s*enums,\s*booleans,\s*and\s*the\s*host's\s*gate\s*command/,
    'build.md must keep the full canonical enumeration ("paths, ids, enums, booleans, and the ' +
    'host\'s gate command") as the one surviving home (D6)')
})

// ---------------------------------------------------------------------------
// AC-20260810-10-7 — D7: spec-state-gate.sh header + shared.md companion claim state the
// literal four-command gated list, matching the script's actual case pattern
// ---------------------------------------------------------------------------

test('AC-20260810-10-7: spec-state-gate.sh\'s header comment and shared.md\'s companion claim both state the literal command list the script\'s match pattern implements', () => {
  const scriptSrc = read('spec/scripts/spec-state-gate.sh')
  const caseMatch = scriptSrc.match(/case "\$PROMPT" in\s*\n\s*([^\n)]+)\)/)
  assert.ok(caseMatch, 'could not locate the gating case pattern in spec-state-gate.sh — the ' +
    'script structure has changed and the derived command list can no longer be trusted')
  const commands = caseMatch[1].split('|').map(s => s.replace(/\*/g, '').trim())
  assert.deepStrictEqual(commands, ['/spec:plan', '/spec:design', '/spec:build', '/spec:review'],
    'the gated-command list derived from the script\'s own case pattern no longer matches the ' +
    'four commands this test (and A1\'s refuter-verified assumption) expects — re-derive by ' +
    'hand rather than trust this literal, per pipeline rules § Gotchas')
  const header = scriptSrc.slice(0, scriptSrc.indexOf('set -u'))
  assert.doesNotMatch(header, /every pipeline command/,
    'spec-state-gate.sh\'s header comment must stop claiming the drift warning fires "on every ' +
    'pipeline command" (D7) — the script\'s own case pattern gates on exactly four commands ' +
    '(/spec:plan, /spec:design, /spec:build, /spec:review), so the header promises coverage ' +
    'the hook does not have')
  for (const cmd of commands) {
    assert.match(header, new RegExp(cmd.replace(':', '\\:'), 'i'),
      `spec-state-gate.sh's header must literally list ${cmd} among the commands it gates (D7)`)
  }
  const shared = read('spec/doctrine/shared.md')
  const groundingDrift = section(shared, '## Grounding Drift', '## ')
  assert.doesNotMatch(groundingDrift, /every pipeline command/,
    'shared.md § Grounding Drift\'s companion claim must stop saying the state-gate hook ' +
    'recomputes the hash "on every pipeline command" (D7) — it must state the same literal ' +
    'four-command list the script actually gates on')
  for (const cmd of commands) {
    assert.match(groundingDrift, new RegExp(cmd.replace(':', '\\:'), 'i'),
      `shared.md § Grounding Drift must literally list ${cmd} among the gated commands (D7), ` +
      'matching the script\'s own case pattern')
  }

  const { spawnSync } = require('child_process')
  const path = require('path')
  const fullPath = path.join(SPEC, 'scripts/spec-state-gate.sh')
  const check = spawnSync('bash', ['-n', fullPath], { encoding: 'utf8' })
  assert.strictEqual(check.status, 0,
    'spec-state-gate.sh must remain syntactically valid bash (`bash -n` exit 0) after the D7 ' +
    `header comment-only edit — a broken hook blocks or pollutes every session's prompts in ` +
    `every host repo: ${check.stderr}`)
})

// ---------------------------------------------------------------------------
// AC-20260810-10-8 — D8: scaffold-ledger.md stray blank line inside the guard-registry table
// deleted
// ---------------------------------------------------------------------------

test('AC-20260810-10-8: scaffold-ledger.md\'s guard-registry table has no blank line between its header and its last row', () => {
  const ledger = read('spec/doctrine/scaffold-ledger.md')
  // Anchor after the header-separator row ('|---|...|') so every line in the region is a
  // full `|`-prefixed data row, not the header text's own line-wrapped continuation. The
  // '## Adding a row' heading is preceded by a blank line Markdown requires to separate the
  // table from the next heading — that trailing blank is not "inside" the table (between
  // header and last row) and must be trimmed before counting, not counted against this AC.
  const tableRegion = section(ledger, '|---|---|---|---|---|', '## Adding a row').trim()
  const lines = tableRegion.split('\n')
  const blankLines = lines.filter(l => l.trim() === '')
  assert.strictEqual(blankLines.length, 0,
    'scaffold-ledger.md\'s guard-registry table must have zero blank lines between its header ' +
    'row and its last row (D8) — a stray blank line ~line 48 currently breaks Markdown table ' +
    'rendering, splitting the registry into two separate tables for any human reading it at ' +
    'promote/retire time')
  const nonEmptyLines = lines.filter(l => l.trim() !== '')
  for (const line of nonEmptyLines) {
    assert.match(line, /^\|/,
      'every non-empty line inside the guard-registry table region must be a `|`-prefixed ' +
      `table row after D8's fix, or the table is still malformed: "${line.slice(0, 60)}..."`)
  }
})
