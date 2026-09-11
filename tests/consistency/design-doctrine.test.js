'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ROOT, SPEC, read, runNode, tmpdir } = require('../helpers')
const { bare, advanceToJourneyApproved, advanceToThemePicked } = require('../mocks/mocks-driver-fixtures')

// specs/20260824/05-design-doctrine-cut.md D1/D2/D5: spec/doctrine/design.md holds five
// sections (contracts a script enforces or a worker applies only) capped at 160 lines;
// dc-extract.js and fidelity-check.js are deleted, the scripts the old "## Design Binding
// Pipeline" section documented. These tests pin the rewritten shape (AC-1), the size cap and
// literal ban that is the reopen condition for every retired seat/artifact (AC-2), and the
// spec-paths refusal plus on-disk deletion of both retired scripts (AC-4).

test('AC-20260824-05-1: spec/doctrine/design.md contains exactly the five D1 headings, in that order, and no other top-level heading', () => {
  const src = read('spec/doctrine/design.md')
  const headings = [...src.matchAll(/^## (.+)$/gm)].map((m) => m[1])
  assert.deepStrictEqual(headings, [
    'Design Canon (mocks, tokens, harness)',
    'Design Authoring Contracts',
    'Design Render Gate',
    'Design Atlas',
    'Workflows Encode Shape, Not Judgment'
  ], 'D1 fixes design.md to exactly these five headings in this order — a missing, reordered, ' +
    'renamed, or extra heading means shared-for section maps and every § citation resolve ' +
    'against a doctrine file whose actual sections no longer match what they name: got ' +
    JSON.stringify(headings))
})

// specs/20260907/09-atlas-index-and-note-navigation.md D13 (a recorded review-gate ruling):
// this cap rises 160 -> 170 to admit D11's two new § Design Atlas bullets — the additions are
// contracts, not procedure, which is the growth this cap exists to stop, so the ceiling moves
// rather than the contract. No other prose was rewritten to buy room.
test('AC-20260824-05-2: spec/doctrine/design.md is at most 170 lines and names none of the retired mechanism/seat literals', () => {
  const src = read('spec/doctrine/design.md')
  const lineCount = src.split('\n').length
  assert.ok(lineCount <= 170,
    'D1/D2 caps the rewritten doctrine at 170 lines (raised from 160 by specs/20260907/09 D13) ' +
    '— the cap IS the enforcement (a doctrine this short cannot also carry a retired ' +
    'mechanism\'s history or rationale): got ' + lineCount + ' lines')
  for (const literal of ['dc-extract', 'fidelity-check', 'skeletons', 'deltas.json', 'retainer',
    'vision consult', 'FIDELITY_REVIEW', 'ITERATE', 'wf-design']) {
    assert.ok(!src.includes(literal),
      'AC-2 bans the literal "' + literal + '" from design.md — its presence means a retired ' +
      'mechanism, seat, or artifact this series deleted is still documented as though it exists, ' +
      'and per this spec\'s Rationale the literal ban is the reopen condition for every seat and ' +
      'artifact the series retired: a future edit that reintroduces it must redden this suite')
  }
})

// specs/20260902/09-one-hand-wireframes-one-token-set.md D1/D2, AC-20260902-09-1/-2: the
// authorship paragraph in design.md § Design Atlas is replaced in place (one-hand authorship,
// the retired sequential-Fable-dispatch/Sonnet-mechanical split banned), and both commands
// that cite it (atlas.md, sketch.md) plus core.md § Model Placement's parenthetical are
// rewritten to match. The pre-image paragraph and commands still carry every retired literal
// and none of the replacement's, so every assertion below is red pre-D1/D2.

test('AC-20260902-09-1: design.md carries the D1 one-hand-authorship literals and none of the retired dispatch-split literals', () => {
  const src = read('spec/doctrine/design.md')
  for (const literal of [
    'no `Agent` dispatch ever writes a mock',
    '🎨 authored {N} in-session · {K} check-only dispatches',
    'skeleton-landed',
  ]) {
    assert.ok(src.includes(literal),
      'D1 replaces design.md\'s authorship paragraph in place — the literal "' + literal +
      '" must appear, or the doctrine still describes the retired fan-out authorship model ' +
      'instead of the one-hand rule and its report line')
  }
  for (const literal of ['Agent {model: "fable"}', 'sonnet-mechanical', 'positions.md', 'design-pick.json', 'rules-locked']) {
    assert.ok(!src.includes(literal),
      'D1 bans the retired literal "' + literal + '" from design.md — its presence means the ' +
      'sequential-Fable-dispatch/Sonnet-mechanical split, the position-brief grounding, or the ' +
      'retired "rules-locked" mark this spec retires is still documented as though it exists')
  }
})

test('AC-20260902-09-2: atlas.md and sketch.md cite the one-hand authorship rule and name none of the retired dispatch-split literals; core.md § Model Placement names every mock authored in-session; citations-check.js reports MISS=0', () => {
  for (const rel of ['spec/commands/atlas.md', 'spec/commands/sketch.md']) {
    const src = read(rel)
    assert.ok(src.includes('authored {N} in-session'),
      'D2: ' + rel + ' must cite the shared report line ("authored {N} in-session") — its ' +
      'absence means the command still describes its own dispatch shape instead of citing ' +
      'design.md\'s one paragraph')
    for (const literal of ['fable', 'sonnet-mechanical', 'Sonnet mock edit', 'one sequential']) {
      assert.ok(!src.includes(literal),
        'D2: ' + rel + ' must drop the retired literal "' + literal + '" — its presence means ' +
        'the command still documents the sequential-Fable-dispatch/Sonnet-mechanical-edit split ' +
        'that D1 retires from the shared doctrine paragraph this command cites')
    }
  }

  const core = read('spec/doctrine/core.md')
  assert.ok(core.includes('every mock, wireframe or themed, authored in-session'),
    'D2: core.md § Model Placement\'s parenthetical must name "every mock, wireframe or ' +
    'themed, authored in-session" in place of the retired "sketch-tier authorship" clause — ' +
    'its absence leaves the model-placement doctrine describing a design seat this spec retires')

  const check = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.strictEqual(check.status, 0, 'citations-check.js must exit 0 over the repo root (advisory scan, never a usage error): ' + check.stderr)
  assert.match(check.stdout, /\bMISS=0\b/,
    'D1/D2\'s doctrine and command edits must not orphan any "§ ..." citation elsewhere in ' +
    'spec/ — a nonzero MISS means some file still points at a heading these edits moved or ' +
    'removed: ' + check.stdout)
})

test('AC-20260824-05-4: spec-paths dc-extract and spec-paths fidelity-check are refused now that D5 retires both keys, and neither script exists on disk', () => {
  const BIN = path.join(SPEC, 'bin/spec-paths')
  const run = (...a) => execFileSync('bash', [BIN, ...a], { encoding: 'utf8' })

  for (const key of ['dc-extract', 'fidelity-check']) {
    let threw = false
    let output = ''
    try {
      run(key)
    } catch (e) {
      threw = true
      output = String(e.stdout || '') + String(e.stderr || '')
    }
    assert.ok(threw,
      'D5: `spec-paths ' + key + '` must exit non-zero now that the key is retired (its script ' +
      'is deleted along with the source-grep fidelity gate it served) — a still-resolving key ' +
      'means a caller gets a path to a file that is no longer there instead of a discoverable error')
    assert.match(output, /usage: spec-paths/,
      '`spec-paths ' + key + '` must print the usage line on refusal, the same way any other ' +
      'unknown key does, so a caller relying on the old key gets a discoverable error: ' + output)
  }

  for (const rel of ['scripts/dc-extract.js', 'scripts/fidelity-check.js']) {
    const p = path.join(SPEC, rel)
    assert.ok(!fs.existsSync(p),
      'D5: ' + rel + ' must be deleted with the source-grep fidelity gate it belonged to — its ' +
      'continued presence means the retired mechanism is still reachable even though its ' +
      'spec-paths key is gone: ' + p)
  }
})

// specs/20260902/10-page-notes-review-loop.md D6/D7/D8, AC-20260902-10-7/-8/-9 (TDD red):
// mocks.md carries no triage-bin literals yet, the driver's REVIEW step carries no sign-off
// line, and atlas.md/sketch.md still route their annotation loop through the retired
// "local annotation MCP" clause instead of `notes open`.

test('AC-20260902-10-7: spec/commands/mocks.md names the four D6 triage bins and the canon-first rule', () => {
  const src = read('spec/commands/mocks.md')
  for (const literal of ['mock detail', 'product understanding', 'question back', 'propose to decline']) {
    assert.ok(src.includes(literal),
      'D6: spec/commands/mocks.md must name the triage bin "' + literal +
      '" — its absence means the review loop\'s closed bin set is not documented where the ' +
      'session reads it')
  }
  assert.ok(src.includes('canon.md first'),
    'D6: spec/commands/mocks.md must say "canon.md first" — a note that hits a canon primitive ' +
    'must edit canon.md before any dependent screen, and this is the rule\'s one written home')
})

// specs/20260906/02-mocks-ends-at-wireframes.md D11: setup now goes through the shared
// mocks-driver-fixtures.js `advanceToJourneyApproved` helper (SKIN and REVIEW are retired).
// specs/20260907/10-client-review.md D1/D12: the sign-off state is renamed CLIENT in place
// (SIGNOFF is retired) — the D7/D10 approval literal is carried over unchanged.
// specs/20260910/04-theme-before-the-client-walk.md D3 fixture repair (D12 clean-up round):
// ADR-0013 reinstates THEME between WALK and CLIENT — the journey must be
// walked AND the theme picked, or the driver prints the THEME block instead of the CLIENT
// approval literal this AC pins.
test('AC-20260907-10-13 (retag of AC-20260902-10-8): WHEN the driver prints the CLIENT step THE SYSTEM includes the D10 approval literal', () => {
  const dir = tmpdir('mocks-review-client')
  advanceToThemePicked(dir)
  const step = bare(dir)
  assert.strictEqual(step.status, 0, 'a bare invocation at the CLIENT approval step must exit 0: ' + step.stderr)
  assert.ok(step.stdout.includes('the written brief, not these screens, holds scope'),
    'D10: the CLIENT step must print the exact literal "the written brief, not these screens, ' +
    'holds scope" — approval is on understanding, not on these screens holding scope: got ' + step.stdout)
  assert.ok(!step.stdout.includes('SIGNOFF'),
    'AC-20260907-10-1: the CLIENT step must never print the retired "SIGNOFF" state literal: got ' + step.stdout)
})

test('AC-20260902-10-9: spec/commands/atlas.md and spec/commands/sketch.md route their annotation loop through `notes open` and name neither the retired "annotation MCP" nor "Vibe Annotations", spec/doctrine/mocks.md carries "## Mocks: Page Notes", and citations-check.js reports MISS=0', () => {
  for (const rel of ['spec/commands/atlas.md', 'spec/commands/sketch.md']) {
    const src = read(rel)
    assert.ok(src.includes('notes open'),
      'D8: ' + rel + ' must route its annotation loop through `notes open` — its absence means ' +
      'the command still describes its own discovery-based mechanism instead of the one ' +
      'feedback mechanism every design surface shares')
    assert.ok(!src.includes('annotation MCP'),
      'D8: ' + rel + ' must drop the retired "annotation MCP" discovery clause — its presence ' +
      'means the local-annotation-MCP escape hatch this spec deletes is still documented')
    assert.ok(!src.includes('Vibe Annotations'),
      'D8: ' + rel + ' must drop the retired "Vibe Annotations" example — naming a specific ' +
      'MCP the annotation-MCP clause pointed at means that clause is still present')
  }

  const doctrine = read('spec/doctrine/mocks.md')
  assert.ok(doctrine.includes('## Mocks: Page Notes'),
    'D1\'s doctrine home: spec/doctrine/mocks.md must carry a "## Mocks: Page Notes" heading — ' +
    'its absence means the two scopes, statuses, who-resolves rule, and project-first rule have ' +
    'nowhere to live')

  const check = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.strictEqual(check.status, 0, 'citations-check.js must exit 0 over the repo root (advisory scan, never a usage error): ' + check.stderr)
  assert.match(check.stdout, /\bMISS=0\b/,
    'D8\'s doctrine and command edits must not orphan any "§ ..." citation elsewhere in spec/ — ' +
    'a nonzero MISS means some file still points at a heading these edits moved or removed: ' + check.stdout)
})

// specs/20260906/06-sketch-high-fidelity-and-critique.md D5/D2/D3, AC-20260906-06-4. Neither
// spec/agents/design-critic.md nor sketch.md's Critique step exist yet — TDD red on both halves.
// A3: tests/review/reviewer-seat.test.js's frontmatter() reads only flat "key: value" lines and
// cannot see reviewer.md's own `tools:` YAML list, so it cannot pin design-critic's tools array;
// per A3's fallback this file carries its own small reader (noted in the deviations sidecar).
function frontmatterWithLists(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(m, 'the file must open with a --- frontmatter block')
  const out = {}
  let listKey = null
  for (const line of m[1].split('\n')) {
    const item = line.match(/^\s*-\s+(\S.*)$/)
    if (item && listKey) { (out[listKey] = out[listKey] || []).push(item[1].trim()); continue }
    const kv = line.match(/^([a-zA-Z]+):\s*(\S.*)?$/)
    if (kv) { listKey = kv[2] ? null : kv[1]; if (kv[2]) out[kv[1]] = kv[2].trim() }
  }
  return out
}

// specs/20260907/08-walk-critic.md D8, AC-20260907-08-10: design-critic.md is rewritten in
// place as the journey walk — the four fixed blind-spot questions (prevent/recover/help/faster)
// and the eight-item plain-note reason vocabulary they fed are retired from this file along with
// them; the AC-20260906-06-4 arm pinning that shape is replaced whole, never inverted (a
// pass-on-absence flip would prove nothing about the NEW return contract this AC exists to pin).
test('AC-20260907-08-10: spec/agents/design-critic.md parses as model opus, effort medium, tools exactly Read/Grep/Glob/Bash, and its body names the six flow-break keys and the four forbidden words plus "an empty list is a valid return", with none of error-prevention, error-recovery or blindspot', () => {
  const criticPath = path.join(SPEC, 'agents/design-critic.md')
  assert.ok(fs.existsSync(criticPath), 'D8: spec/agents/design-critic.md must exist')
  const criticSrc = fs.readFileSync(criticPath, 'utf8')
  const fm = frontmatterWithLists(criticSrc)
  assert.strictEqual(fm.model, 'opus',
    'D8: design-critic.md frontmatter must CONTINUE TO declare model: opus — judgment seats run Opus per core § Model Placement: got ' + JSON.stringify(fm))
  assert.strictEqual(fm.effort, 'medium',
    'D8: design-critic.md frontmatter must CONTINUE TO declare effort: medium: got ' + JSON.stringify(fm))
  assert.deepStrictEqual(fm.tools, ['Read', 'Grep', 'Glob', 'Bash'],
    'D8: design-critic.md frontmatter must CONTINUE TO declare tools exactly Read, Grep, Glob, Bash (read-only, inspection only): got ' + JSON.stringify(fm.tools))

  const closeIdx = criticSrc.indexOf('---', 3)
  const body = criticSrc.slice(closeIdx + 3)

  for (const key of ['no-path-back', 'no-path-forward', 'dead-end-state', 'missing-data', 'ambiguous-control', 'unrecoverable-error']) {
    assert.ok(body.includes(key),
      'D8: design-critic.md\'s body must name the flow-break key "' + key + '" — the six allowed findings the journey walk replaces the four blind-spot questions with')
  }
  for (const word of ['naming', 'hierarchy', 'density', 'consider']) {
    assert.ok(body.includes(word),
      'D8: design-critic.md\'s body must name the forbidden word "' + word + '" — naming, hierarchy, density and any "consider…" suggestion are refused, not just the four fixed questions this file used to carry')
  }
  assert.ok(body.includes('an empty list is a valid return'),
    'D8: design-critic.md must contain the exact sentence "an empty list is a valid return", kept verbatim from the prior critique-pass prompt')

  for (const retired of ['error-prevention', 'error-recovery', 'blindspot']) {
    assert.ok(!body.includes(retired),
      'D8: design-critic.md\'s body must name none of the retired blind-spot literal "' + retired + '" — the four fixed usability questions have no producer left once this lands: ' + JSON.stringify(body.match(new RegExp('.{0,40}' + retired + '.{0,40}'))))
  }
})

// specs/20260907/08-walk-critic.md D9, AC-20260907-08-11.
test('AC-20260907-08-11: spec/commands/sketch.md § The run carries a critique step before the exit step naming check --states, render-gate, design-critic and --kind walk, and spec/doctrine/design.md no longer contains "four blind spots"', () => {
  const sketchSrc = read('spec/commands/sketch.md')
  const runIdx = sketchSrc.indexOf('## The run')
  assert.ok(runIdx !== -1, 'sketch.md must still carry a "## The run" heading to anchor the Critique step search')
  const nextHeadingIdx = sketchSrc.indexOf('\n## ', runIdx + 1)
  const runSection = sketchSrc.slice(runIdx, nextHeadingIdx === -1 ? sketchSrc.length : nextHeadingIdx)

  const critiqueIdx = runSection.search(/\*\*[^*]*Critique[^*]*\*\*/)
  assert.ok(critiqueIdx !== -1,
    'D9: spec/commands/sketch.md § The run must CONTINUE TO carry a step whose heading contains "Critique" — the walk over the brief\'s surfaces in declared order, before the exit stop')
  const exitIdx = runSection.search(/\*\*[^*]*Exit[^*]*\*\*/)
  assert.ok(exitIdx !== -1, 'sketch.md § The run must still carry an exit step to compare the Critique step\'s position against')
  assert.ok(critiqueIdx < exitIdx,
    'D9: the Critique step must be positioned before the exit step, never after — ratification must never be reachable without running the critique pass: critique@' + critiqueIdx + ' exit@' + exitIdx)
  for (const literal of ['check --states', 'render-gate', 'design-critic', '--kind walk']) {
    assert.ok(runSection.includes(literal),
      'D9: § The run\'s Critique step must name "' + literal + '" — the states check, the render rules, the critic dispatch, and the walk-kind note-writing verb the session records findings through')
  }

  const designDoctrine = read('spec/doctrine/design.md')
  assert.ok(!designDoctrine.includes('four blind spots'),
    'D9: spec/doctrine/design.md must no longer contain "four blind spots" — the one-line critique-pass summary is re-pointed at the journey walk: ' + JSON.stringify(designDoctrine.match(/.{0,60}four blind spots.{0,60}/)))
})

// specs/20260907/04-kit-canon-family.md D11: KIT is a new state inserted between SHAPES and
// WIREFRAMES — its § Mocks: State Machine order sentence, gated-mark list, and § Mocks:
// Authoring Rules must all name it.
test('AC-20260907-04-14: spec/doctrine/mocks.md names SEED, SHAPES, KIT, WIREFRAMES in that order within its § Mocks: State Machine order sentence, names kit-signed in its gated-mark list, and names both data-kit and data-bespoke in § Mocks: Authoring Rules', () => {
  const p = 'spec/doctrine/mocks.md'
  assert.ok(fs.existsSync(path.join(ROOT, p)), p + ' must exist for this doctrine pin to be meaningful')
  const src = read(p)

  const stateMachineIdx = src.indexOf('## Mocks: State Machine')
  assert.ok(stateMachineIdx !== -1, p + ' must carry a "## Mocks: State Machine" heading to anchor the order-sentence search')
  const nextHeadingIdx = src.indexOf('\n## ', stateMachineIdx + 1)
  const stateMachineSection = src.slice(stateMachineIdx, nextHeadingIdx === -1 ? src.length : nextHeadingIdx)

  const orderTokens = ['SEED', 'SHAPES', 'KIT', 'WIREFRAMES']
  const positions = orderTokens.map((tok) => stateMachineSection.indexOf('**' + tok + '**'))
  assert.ok(positions.every((pos) => pos !== -1),
    'D1/D11: § Mocks: State Machine must name SEED, SHAPES, KIT, and WIREFRAMES (each bold, as the section already does) — got positions ' + JSON.stringify(positions) + ' in:\n' + stateMachineSection)
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1],
      'D1/D11: the order sentence must name ' + orderTokens.join(' -> ') + ' in that order, with KIT sitting between SHAPES and WIREFRAMES — got positions ' + JSON.stringify(positions))
  }

  assert.match(stateMachineSection, /kit-signed/,
    'D11: § Mocks: State Machine\'s gated-mark list must name "kit-signed" alongside every other advancing mark')

  const authoringIdx = src.indexOf('## Mocks: Authoring Rules')
  assert.ok(authoringIdx !== -1, p + ' must carry a "## Mocks: Authoring Rules" heading to anchor the kit-rule search')
  const authoringNextIdx = src.indexOf('\n## ', authoringIdx + 1)
  const authoringSection = src.slice(authoringIdx, authoringNextIdx === -1 ? src.length : authoringNextIdx)
  assert.match(authoringSection, /data-kit\b/,
    'D11: § Mocks: Authoring Rules must name data-kit — the "name the shared parts" rule\'s one written home')
  assert.match(authoringSection, /data-bespoke\b/,
    'D11: § Mocks: Authoring Rules must name data-bespoke — the deliberate non-instance escape and its required difference')
})

// specs/20260907/06-theme-pick-moves-to-sketch.md D7, AC-20260907-06-8: `/spec:sketch` gains the
// theme pick as its own first run — a new step under § The run, before the Critique and Exit
// steps, replacing the "no theme picked yet, sketching gray" branch's `/spec:mocks THEME`
// hand-off with the driver's own `theme` subcommand family and a reworded gray-floor warning.
// TDD red: today's sketch.md has no step naming "Theme" at all (the theme run lives entirely
// inside step 3's "Scoped sweep" absent-tokens clause), and that clause still names both
// "/spec:mocks THEME" and "no theme picked yet" — so every assertion below is false against the
// pre-image, including the two literals this AC requires to be absent everywhere in the file.
// Retagged (specs/20260910/04-theme-before-the-client-walk.md D9, ADR-0013): the theme pick
// belongs to /spec:mocks's THEME state; sketch.md's Theme step runs `theme state` as the
// normal-path check (`picked` is expected) and points the absent-tokens fallback at
// `/spec:mocks` (THEME) plus `theme shortlist` + `--mark theme-picked` for a host that skipped
// mocks — an interview/`theme open`/`theme adopt` flow inside sketch.md is exactly the collision
// this spec's Rationale owns (D9 hands that pick back to `/spec:mocks` on purpose). TDD red: this
// spec's own worktree still carries sketch.md's `theme open`/`theme adopt` interview body with no
// `theme shortlist` mention anywhere, so the literal-presence assertions below fail against it.
test('AC-20260907-06-8 (retag of the interview-body literals, specs/20260910/04-theme-before-the-client-walk.md D9): spec/commands/sketch.md carries a step under § The run, positioned before both the Critique and Exit steps, whose heading names Theme and whose body names theme state and theme shortlist but neither theme open nor theme adopt as a live command; the file names no "no theme picked yet" anywhere', () => {
  const src = read('spec/commands/sketch.md')

  assert.ok(!src.includes('no theme picked yet'),
    'D7 rewords the absent-theme branch — the retired "no theme picked yet" phrasing must not appear anywhere in the file: ' + JSON.stringify(src.match(/.{0,40}no theme picked yet.{0,40}/)))

  const runIdx = src.indexOf('## The run')
  assert.ok(runIdx !== -1, 'sketch.md must still carry a "## The run" heading to anchor the Theme step search')
  const nextHeadingIdx = src.indexOf('\n## ', runIdx + 1)
  const runSection = src.slice(runIdx, nextHeadingIdx === -1 ? src.length : nextHeadingIdx)

  const themeIdx = runSection.search(/\*\*[^*]*Theme[^*]*\*\*/)
  assert.ok(themeIdx !== -1,
    'D7: § The run must carry a step whose heading contains "Theme" — the new first-run theme pick, replacing step 3\'s old absent-tokens clause')
  const critiqueIdx = runSection.search(/\*\*[^*]*Critique[^*]*\*\*/)
  assert.ok(critiqueIdx !== -1, 'sketch.md § The run must still carry the Critique step to compare the Theme step\'s position against')
  const exitIdx = runSection.search(/\*\*[^*]*Exit[^*]*\*\*/)
  assert.ok(exitIdx !== -1, 'sketch.md § The run must still carry the Exit step to compare the Theme step\'s position against')
  assert.ok(themeIdx < critiqueIdx,
    'D7: the Theme step must run before the Critique step: theme@' + themeIdx + ' critique@' + critiqueIdx)
  assert.ok(themeIdx < exitIdx,
    'D7: the Theme step must run before the Exit step: theme@' + themeIdx + ' exit@' + exitIdx)

  // The AC's six literals must live in the THEME STEP'S OWN body, not merely somewhere in
  // "## The run" — a literal that drifted into a sibling step (e.g. the old step 3's leftover
  // gray-floor line) would still pass a whole-section check. Anchor on heading TEXT, never on
  // line numbers or step numerals, so a concurrent renumbering of the surrounding steps
  // (doctrine worker, same spec) cannot desync this slice.
  const stepStarts = [...runSection.matchAll(/\n\d+\.\s+\*\*/g)].map((m) => m.index)
  const themeStepStart = stepStarts.filter((i) => i <= themeIdx).pop()
  assert.ok(themeStepStart !== undefined,
    'could not find the numbered-list-item start ("N. **") the Theme heading belongs to — the step list shape may have changed: ' + JSON.stringify({ themeIdx, stepStarts }))
  const themeStepEnd = stepStarts.find((i) => i > themeIdx)
  const themeStep = runSection.slice(themeStepStart, themeStepEnd === undefined ? runSection.length : themeStepEnd)

  for (const literal of ['theme state', 'theme shortlist']) {
    assert.ok(themeStep.includes(literal),
      'D9: the Theme step\'s OWN body must name "' + literal + '" — theme state stays the normal-path check, theme shortlist is the fallback authoring path for a host that skipped mocks; a literal sitting in a sibling step does not satisfy this AC: ' + themeStep)
  }
  for (const retired of ['theme open', 'theme adopt']) {
    assert.ok(!themeStep.includes(retired),
      'D9: the Theme step must name neither "' + retired + '" as a live command — both are retired in favor of `theme shortlist` + `--mark theme-picked`: ' + themeStep)
  }
})

// specs/20260907/06-theme-pick-moves-to-sketch.md D8, AC-20260907-06-9: § Design Canon's
// "Fidelity lives in sketch" sentence gains that the theme itself is picked on sketch's first
// run, that candidates are the signed-off gray kit re-rendered per direction at
// design/theme/<kebab>/kit.html, and that the picked direction's kit page is the fidelity
// reference every later sketch surface is built from. TDD red: today's sentence names none of
// this — no "design/theme/", no "fidelity reference", and no mention that the theme is picked
// on sketch's first run.
// Retagged (specs/20260910/04-theme-before-the-client-walk.md D9/AC-20260910-04-10, ADR-0013):
// the theme pick belongs to /spec:mocks's THEME state, picked by the client on the two dense
// screens — § Design Canon's "picked on /spec:sketch's first run" clause is exactly the phrase
// AC-20260910-04-10 requires design.md to keep absent, the collision this spec's Rationale owns.
// TDD red: this spec's own worktree still carries that literal in spec/doctrine/design.md, so the
// "must NOT say" assertion below fails against it.
test('AC-20260907-06-9 (retag of the sketch-first-run clause, specs/20260910/04-theme-before-the-client-walk.md D9): spec/doctrine/design.md § Design Canon names design/theme/<kebab>/kit.html and the phrase "fidelity reference", and no longer says the theme is picked on /spec:sketch\'s first run', () => {
  const src = read('spec/doctrine/design.md')
  const canonIdx = src.indexOf('## Design Canon')
  assert.ok(canonIdx !== -1, 'spec/doctrine/design.md must still carry a "## Design Canon" heading to anchor this search')
  const nextHeadingIdx = src.indexOf('\n## ', canonIdx + 1)
  const canonSection = src.slice(canonIdx, nextHeadingIdx === -1 ? src.length : nextHeadingIdx)

  assert.match(canonSection, /design\/theme\/<kebab>\/kit\.html/,
    'D8: § Design Canon must name design/theme/<kebab>/kit.html — the candidate direction path every later sketch surface is built from: ' + canonSection)
  assert.ok(canonSection.includes('fidelity reference'),
    'D8: § Design Canon must name the phrase "fidelity reference" — the picked direction\'s kit page is the fidelity reference: ' + canonSection)
  assert.ok(!/first run/.test(canonSection),
    'D9/AC-20260910-04-10: § Design Canon must no longer say the theme is picked on /spec:sketch\'s first run — the pick moves back to /spec:mocks\'s THEME state: ' + canonSection)
})

// specs/20260907/07-mocks-retires-theme.md D8, AC-20260907-07-10 (retag AC-20260907-10-13): the
// mocks driver's state machine is SEED -> SHAPES -> KIT -> WIREFRAMES -> WALK -> CLIENT ->
// APPROVED, with no THEME step and (per specs/20260907/10-client-review.md D1/D12) no SIGNOFF
// step — composing candidate directions and picking one is /spec:sketch's own job now, and the
// last human gate before APPROVED is named CLIENT (ADR-0012). Accordingly, spec/doctrine/mocks.md
// describes no THEME and no SIGNOFF state anywhere, except § Provenance Ledger's own "retired
// step names still parse" clause, which deliberately names THEME and SIGNOFF (alongside SKIN and
// REVIEW) as retired-but-still-parsing step names.
// Retagged (specs/20260910/04-theme-before-the-client-walk.md D9, ADR-0013): THEME returns to
// the mocks state machine between WALK and CLIENT, and `theme-picked`/`--reopen theme` return as
// live literals alongside it — exactly the collision this spec's own Rationale names ("the pins
// that assert 'never THEME' and 'theme-picked is unknown' are the collision this spec owns; they
// are retagged to the new derivation, never weakened"). `direction-composed` and the "Theme =
// recompose, never repaint" bullet stay retired (this spec reuses neither). SIGNOFF stays fully
// retired — unrelated to this spec, unchanged. TDD red: spec/doctrine/mocks.md's pre-image still
// forbids THEME everywhere outside § Provenance Ledger and still forbids theme-picked/--reopen
// theme outright, so the assertions below (which now scope the forbidden zone to exclude
// § Mocks: State Machine, and drop theme-picked/--reopen theme from the forbidden-literal list)
// are false against the pre-image — the doctrine text has not moved yet.
test('AC-20260907-10-13 (retag of AC-20260907-07-10, re-retagged specs/20260910/04-theme-before-the-client-walk.md D9): spec/doctrine/mocks.md carries no SIGNOFF occurrence outside § Provenance Ledger\'s retired-step-names clause, no THEME occurrence outside § Provenance Ledger or § Mocks: State Machine, no direction-composed or "Theme = recompose, never repaint" bullet, and names SEED, SHAPES, KIT, WIREFRAMES, WALK, CLIENT, APPROVED in that order within its § Mocks: State Machine order sentence', () => {
  const p = 'spec/doctrine/mocks.md'
  assert.ok(fs.existsSync(path.join(ROOT, p)), p + ' must exist for this doctrine pin to be meaningful')
  const src = read(p)

  const ledgerIdx = src.indexOf('## Provenance Ledger')
  assert.ok(ledgerIdx !== -1, p + ' must carry a "## Provenance Ledger" heading to anchor the retired-step-names clause search')
  const ledgerNextIdx = src.indexOf('\n## ', ledgerIdx + 1)
  const ledgerEnd = ledgerNextIdx === -1 ? src.length : ledgerNextIdx
  const ledgerSection = src.slice(ledgerIdx, ledgerEnd)

  const stateMachineIdx = src.indexOf('## Mocks: State Machine')
  assert.ok(stateMachineIdx !== -1, p + ' must carry a "## Mocks: State Machine" heading to anchor the order-sentence search')
  const smNextIdx = src.indexOf('\n## ', stateMachineIdx + 1)
  const stateMachineEnd = smNextIdx === -1 ? src.length : smNextIdx
  const stateMachineSection = src.slice(stateMachineIdx, stateMachineEnd)

  // D9: THEME may appear in exactly two homes now — § Provenance Ledger's retired-step-names
  // clause (SKIN/REVIEW/THEME/SIGNOFF, unchanged) and § Mocks: State Machine's own order
  // sentence (ADR-0013's reinstatement) — nowhere else.
  const withoutLedgerAndStateMachine = ledgerIdx < stateMachineIdx
    ? src.slice(0, ledgerIdx) + src.slice(ledgerEnd, stateMachineIdx) + src.slice(stateMachineEnd)
    : src.slice(0, stateMachineIdx) + src.slice(stateMachineEnd, ledgerIdx) + src.slice(ledgerEnd)
  assert.ok(!withoutLedgerAndStateMachine.includes('THEME'),
    'D9: no occurrence of "THEME" may remain outside § Provenance Ledger\'s retired-step-names clause and § Mocks: State Machine\'s own order sentence: ' +
    JSON.stringify(withoutLedgerAndStateMachine.match(/.{0,40}THEME.{0,40}/)))
  assert.match(stateMachineSection, /THEME/, 'D9: § Mocks: State Machine must itself name THEME once ADR-0013 reinstates it: ' + stateMachineSection)

  const withoutLedger = src.slice(0, ledgerIdx) + src.slice(ledgerEnd)
  assert.ok(!withoutLedger.includes('SIGNOFF'),
    'D12: no occurrence of "SIGNOFF" may remain outside § Provenance Ledger\'s retired-step-names clause — the state stays renamed CLIENT: ' + JSON.stringify(withoutLedger.match(/.{0,40}SIGNOFF.{0,40}/)))
  assert.match(ledgerSection, /THEME/,
    'D8: § Provenance Ledger must still name THEME beside SKIN and REVIEW in its retired-but-still-parsing clause: ' + ledgerSection)
  assert.match(ledgerSection, /SIGNOFF/,
    'D12: § Provenance Ledger must name SIGNOFF beside SKIN, REVIEW and THEME in its retired-but-still-parsing clause: ' + ledgerSection)
  assert.match(ledgerSection, /SKIN/, 'D8: § Provenance Ledger\'s retired-but-still-parsing clause must still name SKIN alongside THEME/SIGNOFF: ' + ledgerSection)
  assert.match(ledgerSection, /REVIEW/, 'D8: § Provenance Ledger\'s retired-but-still-parsing clause must still name REVIEW alongside THEME/SIGNOFF: ' + ledgerSection)
  assert.match(ledgerSection, /SKETCH/, 'D8: § Provenance Ledger\'s live step-vocabulary examples must add SKETCH in THEME\'s place: ' + ledgerSection)
  assert.match(ledgerSection, /CLIENT/, 'D12: § Provenance Ledger\'s live step-vocabulary examples must list CLIENT (SIGNOFF\'s successor): ' + ledgerSection)

  for (const literal of ['direction-composed', 'Theme = recompose, never repaint']) {
    assert.ok(!src.includes(literal),
      'D9: spec/doctrine/mocks.md must name none of the retired literal "' + literal + '" — its presence means a retired mark or authoring rule this spec does not reinstate is still documented: ' +
      JSON.stringify(src.match(new RegExp('.{0,40}' + literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.{0,40}'))))
  }

  const orderTokens = ['SEED', 'SHAPES', 'KIT', 'WIREFRAMES', 'WALK', 'CLIENT', 'APPROVED']
  const positions = orderTokens.map((tok) => stateMachineSection.indexOf('**' + tok + '**'))
  assert.ok(positions.every((pos) => pos !== -1),
    'AC-20260907-10-13: § Mocks: State Machine must name every live state SEED, SHAPES, KIT, WIREFRAMES, WALK, CLIENT, APPROVED (each bold) — got positions ' + JSON.stringify(positions) + ' in:\n' + stateMachineSection)
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1],
      'AC-20260907-10-13: the order sentence must name ' + orderTokens.join(' -> ') + ' in that order, with SIGNOFF renamed CLIENT in its slot: got positions ' + JSON.stringify(positions))
  }
})

// specs/20260907/07-mocks-retires-theme.md D9, AC-20260907-07-11: spec/commands/mocks.md's own
// "## THEME interview rule" section is deleted whole (successor: spec/commands/sketch.md § The
// run's Theme step, specs/20260907/06 D7); its generic skill-line closing paragraph re-homes
// under "## The driver loop".
//
// Deviation (recorded in specs/20260907/07-mocks-retires-theme.deviations.md): D9's premise that
// spec/commands/mocks.md ALREADY carries the paragraph "Every authoring step block the driver
// prints carries the frontend-design skill line; act on it before the first edit (§ Mocks:
// Authoring Rules — the one binding home)." — as prose merely being relocated — is false against
// HEAD: `grep -rn "frontend-design skill line" spec/` finds this literal nowhere in the repo. The
// AC's own requirement is still fully testable and left as an executable pin below; the doctrine
// worker authors the paragraph net-new under "## The driver loop" rather than moving one.
// Retagged (specs/20260910/04-theme-before-the-client-walk.md D9, ADR-0013): spec/commands/
// mocks.md gains a "## Theme (THEME state)" heading — THEME is a step the driver can print (this
// file's own step-narration promise) — so a blanket "no THEME occurrence anywhere" check is
// exactly the collision this spec's Rationale owns. The "## THEME interview rule" heading name
// (sketch.md's own theme-authoring-inside-sketch section) is unrelated prose and stays forbidden.
// TDD red: this spec's own worktree carries no "## Theme (THEME state)" heading anywhere in
// spec/commands/mocks.md, so the assertion requiring it below fails against it.
test('AC-20260907-10-19 (retag of AC-20260907-07-11, re-retagged specs/20260910/04-theme-before-the-client-walk.md D9): spec/commands/mocks.md carries no "## THEME interview rule" heading, no "## Sign-off" heading, and a "## Theme (THEME state)" heading (the only sanctioned THEME occurrence); carries the frontend-design skill-line paragraph under "## The driver loop"; a "## Client review (CLIENT state)" heading names client open --address, notes address … --port, notes waive, seven days, stop open signoff and --mark approved; the look rule names CLIENT and its <step> enumeration is unchanged (shapes | kit | journey:<j> | signoff)', () => {
  const p = 'spec/commands/mocks.md'
  const src = read(p)

  assert.ok(!src.includes('## THEME interview rule'),
    'D9: "## THEME interview rule" must be deleted whole — its successor lives under this file\'s own "## Theme (THEME state)" heading: ' + JSON.stringify(src.match(/.{0,40}THEME interview rule.{0,40}/)))
  assert.ok(src.includes('## Theme (THEME state)'),
    'D9/AC-20260910-04-10: spec/commands/mocks.md must carry a "## Theme (THEME state)" heading now that THEME is reinstated: ' + src.slice(0, 200))
  assert.ok(!src.includes('## Sign-off'),
    'D12: "## Sign-off (SIGNOFF state)" must be replaced whole by "## Client review (CLIENT state)": ' + JSON.stringify(src.match(/.{0,40}## Sign-off.{0,40}/)))

  const skillLine = 'Every authoring step block the driver prints carries the frontend-design skill line'
  assert.ok(src.includes(skillLine), 'D9: the generic skill-line paragraph must be present verbatim: ' + skillLine)
  const runLoopIdx = src.indexOf('## The driver loop')
  assert.ok(runLoopIdx !== -1, p + ' must still carry a "## The driver loop" heading')
  const runLoopNextIdx = src.indexOf('\n## ', runLoopIdx + 1)
  const runLoopSection = src.slice(runLoopIdx, runLoopNextIdx === -1 ? src.length : runLoopNextIdx)
  assert.ok(runLoopSection.includes(skillLine),
    'D9: the skill-line paragraph must specifically live as the closing paragraph of "## The driver loop", not merely appear elsewhere in the file: ' + runLoopSection)

  assert.match(src, /`shapes`\s*\|\s*`kit`\s*\|\s*`journey:<j>`\s*\|\s*`signoff`/,
    'AC-20260907-10-19: § Look rule\'s <step> enumeration must CONTINUE TO read "shapes | kit | journey:<j> | signoff" — the stop step name is unchanged (D9 Rationale): ' + JSON.stringify(src.match(/`shapes`[^)]*`signoff`/)))
  assert.ok(src.includes('a pick stop — SHAPES —'),
    'D9: § Look rule\'s pick-stop parenthetical must read exactly "a pick stop — SHAPES —" once THEME is dropped: ' + JSON.stringify(src.match(/a pick stop.{0,20}/)))
  assert.match(src, /look rule[\s\S]{0,300}CLIENT|CLIENT[\s\S]{0,300}look rule/i,
    'AC-20260907-10-19: the look rule must name CLIENT: ' + JSON.stringify(src.match(/.{0,80}(look rule|CLIENT).{0,80}/i)))

  const clientHeadingIdx = src.indexOf('## Client review (CLIENT state)')
  assert.ok(clientHeadingIdx !== -1,
    'D12: spec/commands/mocks.md must carry a "## Client review (CLIENT state)" heading in place of the retired "## Sign-off (SIGNOFF state)": ' + src.slice(0, 200))
  const clientNextIdx = src.indexOf('\n## ', clientHeadingIdx + 1)
  const clientSection = src.slice(clientHeadingIdx, clientNextIdx === -1 ? src.length : clientNextIdx)
  for (const literal of ['client open --address', 'notes address', '--port', 'notes waive', 'seven days', 'stop open signoff', '--mark approved']) {
    assert.ok(clientSection.includes(literal),
      'AC-20260907-10-19: "## Client review (CLIENT state)" must name "' + literal + '": got ' + clientSection)
  }

  assert.ok(!src.includes('theme tokens'),
    'D9: § Sign-off\'s "theme tokens … in place" clause must be dropped — the theme is no longer picked before sign-off: ' + JSON.stringify(src.match(/.{0,40}theme tokens.{0,40}/)))

  assert.ok(src.includes('✅ mocks approved — {N} journeys, signed off by {name}'),
    'D9: § Report\'s outcome slot must read the exact theme-less literal "✅ mocks approved — {N} journeys, signed off by {name}": ' + JSON.stringify(src.match(/✅ mocks approved.{0,60}/)))
  assert.ok(!src.includes('theme: {direction}'),
    'D9: § Report\'s "theme: {direction} — rejected {others}" bullet must be deleted: ' + JSON.stringify(src.match(/.{0,40}theme: \{direction\}.{0,40}/)))
})

// ---------------------------------------------------------------------------
// AC-20260907-10-20
// ---------------------------------------------------------------------------
test('AC-20260907-10-20: spec/doctrine/mocks.md § Mocks: Look and Serve names CLIENT in the reachability sentence in SIGNOFF\'s place, and § Mocks: Page Notes\' ADR-0012 paragraph names notes waive, withdrawn and accepted', () => {
  const p = 'spec/doctrine/mocks.md'
  const src = read(p)

  const lookIdx = src.indexOf('## Mocks: Look and Serve')
  assert.ok(lookIdx !== -1, p + ' must carry a "## Mocks: Look and Serve" heading')
  const lookNextIdx = src.indexOf('\n## ', lookIdx + 1)
  const lookSection = src.slice(lookIdx, lookNextIdx === -1 ? src.length : lookNextIdx)
  assert.match(lookSection, /CLIENT/,
    'D20: § Mocks: Look and Serve\'s reachability sentence must name CLIENT in SIGNOFF\'s retired place: ' + lookSection)
  assert.ok(!lookSection.includes('SIGNOFF'),
    'D20: § Mocks: Look and Serve must never name the retired "SIGNOFF" state: ' + lookSection)

  const notesIdx = src.indexOf('## Mocks: Page Notes')
  assert.ok(notesIdx !== -1, p + ' must carry a "## Mocks: Page Notes" heading')
  const notesNextIdx = src.indexOf('\n## ', notesIdx + 1)
  const notesSection = src.slice(notesIdx, notesNextIdx === -1 ? src.length : notesNextIdx)
  assert.match(notesSection, /ADR-0012/, '§ Mocks: Page Notes must carry its ADR-0012 paragraph: ' + notesSection)
  for (const literal of ['notes waive', 'withdrawn', 'accepted']) {
    assert.ok(notesSection.includes(literal),
      'D20: § Mocks: Page Notes\' ADR-0012 paragraph must name "' + literal + '": got ' + notesSection)
  }
})

// ---------------------------------------------------------------------------
// AC-20260910-02-5
// ---------------------------------------------------------------------------
test('AC-20260910-02-5: spec/doctrine/mocks.md gains the "Every edge is a real control" rule under § Mocks: Authoring Rules and "?walk" under § Mocks: Look and Serve; spec/commands/mocks.md and spec/templates/mocks-seed.md each name data-to', () => {
  const p = 'spec/doctrine/mocks.md'
  const src = read(p)

  const rulesIdx = src.indexOf('## Mocks: Authoring Rules')
  assert.ok(rulesIdx !== -1, p + ' must carry a "## Mocks: Authoring Rules" heading')
  const rulesNextIdx = src.indexOf('\n## ', rulesIdx + 1)
  const rulesSection = src.slice(rulesIdx, rulesNextIdx === -1 ? src.length : rulesNextIdx)
  assert.match(rulesSection, /\*\*Every edge is a real control\.\*\*/,
    'D5: § Mocks: Authoring Rules must carry the bold rule name "Every edge is a real control." naming the data-to rule refused at journey-drawn: got ' + rulesSection)
  assert.match(rulesSection, /data-to/,
    'D5: § Mocks: Authoring Rules\' new rule must name the data-to attribute: got ' + rulesSection)

  const lookIdx = src.indexOf('## Mocks: Look and Serve')
  assert.ok(lookIdx !== -1, p + ' must carry a "## Mocks: Look and Serve" heading')
  const lookNextIdx = src.indexOf('\n## ', lookIdx + 1)
  const lookSection = src.slice(lookIdx, lookNextIdx === -1 ? src.length : lookNextIdx)
  assert.ok(lookSection.includes('?walk'),
    'D5: § Mocks: Look and Serve must name the literal "?walk" — the walk-mode query token this spec adds: got ' + lookSection)

  const commandsPath = 'spec/commands/mocks.md'
  assert.ok(fs.existsSync(path.join(ROOT, commandsPath)), commandsPath + ' must exist')
  const commandsSrc = read(commandsPath)
  assert.ok(commandsSrc.includes('data-to'),
    'D5: ' + commandsPath + '\'s WIREFRAMES step must tell the authoring session to put data-to on the advancing control: got no "data-to" anywhere in the file')

  const seedTemplatePath = 'spec/templates/mocks-seed.md'
  assert.ok(fs.existsSync(path.join(ROOT, seedTemplatePath)), seedTemplatePath + ' must exist')
  const seedTemplateSrc = read(seedTemplatePath)
  assert.ok(seedTemplateSrc.includes('data-to'),
    'D5: ' + seedTemplatePath + '\'s "## Journeys" comment must name data-to: got no "data-to" anywhere in the file')
})

// ---------------------------------------------------------------------------
// AC-20260910-06-4
// ---------------------------------------------------------------------------
test('AC-20260910-06-4: spec/doctrine/mocks.md § Mocks: Authoring Rules carries the bold rule name "Screens carry the client\'s records" and § Mocks: Seed carries the literals "## Dense screens" and "## Records"; spec/templates/mocks-seed.md carries both headings; spec/commands/mocks.md carries "records/"', () => {
  const p = 'spec/doctrine/mocks.md'
  const src = read(p)

  const authoringIdx = src.indexOf('## Mocks: Authoring Rules')
  assert.ok(authoringIdx !== -1, p + ' must carry a "## Mocks: Authoring Rules" heading')
  const authoringNextIdx = src.indexOf('\n## ', authoringIdx + 1)
  const authoringSection = src.slice(authoringIdx, authoringNextIdx === -1 ? src.length : authoringNextIdx)
  assert.match(authoringSection, /\*\*Screens carry the client's records\.?\*\*/,
    'D4: § Mocks: Authoring Rules must carry the bold rule name "Screens carry the client\'s records" — the rule naming that wireframes draw the seed\'s Records values: got ' + authoringSection)

  const seedIdx = src.indexOf('## Mocks: Seed')
  assert.ok(seedIdx !== -1, p + ' must carry a "## Mocks: Seed" heading')
  const seedNextIdx = src.indexOf('\n## ', seedIdx + 1)
  const seedSection = src.slice(seedIdx, seedNextIdx === -1 ? src.length : seedNextIdx)
  assert.ok(seedSection.includes('## Dense screens'),
    'D4: § Mocks: Seed must name the literal "## Dense screens" — the plural grammar D1 adds: got ' + seedSection)
  assert.ok(seedSection.includes('## Records'),
    'D4: § Mocks: Seed must name the literal "## Records" — the new section D2 adds: got ' + seedSection)

  const seedTemplatePath = 'spec/templates/mocks-seed.md'
  assert.ok(fs.existsSync(path.join(ROOT, seedTemplatePath)), seedTemplatePath + ' must exist')
  const seedTemplateSrc = read(seedTemplatePath)
  assert.ok(seedTemplateSrc.includes('## Dense screens'),
    'D4: ' + seedTemplatePath + ' must carry the "## Dense screens" heading: got no such heading in the file')
  assert.ok(seedTemplateSrc.includes('## Records'),
    'D4: ' + seedTemplatePath + ' must carry the "## Records" heading: got no such heading in the file')

  const commandsPath = 'spec/commands/mocks.md'
  const commandsSrc = read(commandsPath)
  assert.ok(commandsSrc.includes('records/'),
    'D4: ' + commandsPath + ' must name "records/" — the SEED records ask and the WIREFRAMES draw-with-them line: got no "records/" anywhere in the file')
})

// ---------------------------------------------------------------------------
// AC-20260910-03-9
// ---------------------------------------------------------------------------
// specs/20260910/03-client-journey-player.md D9: spec/doctrine/mocks.md gains a
// "## Mocks: Client Player" heading and the CLIENT sentence in § Mocks: State Machine is
// rewritten to close on "confirmed-or-waived" (the walk/confirm mechanism this spec adds, in
// place of the retired "answered/raised" description); § Mocks: Page Notes' "Client review is
// the same page and the same notes" sentence is retired along with it (the client route is now
// the dedicated player, not the session's own review page). spec/commands/mocks.md § Client
// review names `client log` and `client waive`. Every assertion below is red pre-D9: the
// heading does not exist, the CLIENT sentence carries none of "confirmed-or-waived", the
// retired sentence is still present, and neither `client log` nor `client waive` is named yet.
test('AC-20260910-03-9: spec/doctrine/mocks.md carries a "## Mocks: Client Player" heading, § Mocks: State Machine\'s CLIENT sentence carries the literal "confirmed-or-waived", and the file carries no "Client review is the same page" sentence; spec/commands/mocks.md § Client review names "client log" and "client waive"', () => {
  const mocksDoctrinePath = 'spec/doctrine/mocks.md'
  const src = read(mocksDoctrinePath)

  assert.ok(src.includes('## Mocks: Client Player'),
    'D9: ' + mocksDoctrinePath + ' must carry a "## Mocks: Client Player" heading naming the pages, the walk record, walk-to-unlock and the promotion rule: got no such heading in the file')

  const stateMachineIdx = src.indexOf('## Mocks: State Machine')
  assert.ok(stateMachineIdx !== -1, mocksDoctrinePath + ' must carry a "## Mocks: State Machine" heading')
  const stateMachineNextIdx = src.indexOf('\n## ', stateMachineIdx + 1)
  const stateMachineSection = src.slice(stateMachineIdx, stateMachineNextIdx === -1 ? src.length : stateMachineNextIdx)
  assert.ok(stateMachineSection.includes('confirmed-or-waived'),
    'D9: § Mocks: State Machine\'s CLIENT sentence must carry the literal "confirmed-or-waived" — the walk/confirm-or-waive closure this spec adds: got\n' + stateMachineSection)

  assert.ok(!src.includes('Client review is the same page'),
    'D9: ' + mocksDoctrinePath + ' must carry no "Client review is the same page" sentence — the client route is now the dedicated player, not the session\'s review page restated: got the retired sentence still present')

  const commandsPath = 'spec/commands/mocks.md'
  const commandsSrc = read(commandsPath)
  const clientReviewIdx = commandsSrc.indexOf('## Client review')
  assert.ok(clientReviewIdx !== -1, commandsPath + ' must carry a "## Client review" heading')
  const clientReviewNextIdx = commandsSrc.indexOf('\n## ', clientReviewIdx + 1)
  const clientReviewSection = commandsSrc.slice(clientReviewIdx, clientReviewNextIdx === -1 ? commandsSrc.length : clientReviewNextIdx)
  assert.ok(clientReviewSection.includes('client log'),
    'D9: ' + commandsPath + ' § Client review must name `client log`: got\n' + clientReviewSection)
  assert.ok(clientReviewSection.includes('client waive'),
    'D9: ' + commandsPath + ' § Client review must name `client waive`: got\n' + clientReviewSection)
})

// specs/20260910/04-theme-before-the-client-walk.md D9, AC-20260910-04-10 (ADR-0013): THEME
// returns to /spec:mocks's own state machine, between WALK and CLIENT — the doctrine binding
// homes this spec's Decisions table names directly. TDD red: spec/doctrine/mocks.md's § Mocks:
// State Machine order sentence carries no THEME and no "?theme=" literal yet, spec/doctrine/
// design.md still says the theme is picked on /spec:sketch's first run, spec/commands/sketch.md
// step 3 still runs its own theme open/theme adopt interview with no theme shortlist mention, and
// spec/commands/mocks.md carries no "## Theme (THEME state)" heading — so every assertion below
// is false against the pre-image.
test('AC-20260910-04-10: spec/doctrine/mocks.md carries WALK -> THEME -> CLIENT in its § Mocks: State Machine order sentence and the literal "?theme="; spec/doctrine/design.md does not carry "picked on /spec:sketch\'s first run"; spec/commands/sketch.md step 3 carries `theme shortlist` and neither `theme open` nor `theme adopt` as a live command; spec/commands/mocks.md carries "## Theme (THEME state)"', () => {
  const mocksDoctrine = read('spec/doctrine/mocks.md')
  const smIdx = mocksDoctrine.indexOf('## Mocks: State Machine')
  assert.ok(smIdx !== -1, 'spec/doctrine/mocks.md must carry a "## Mocks: State Machine" heading to anchor this search')
  const smNextIdx = mocksDoctrine.indexOf('\n## ', smIdx + 1)
  const smSection = mocksDoctrine.slice(smIdx, smNextIdx === -1 ? mocksDoctrine.length : smNextIdx)
  const walkIdx = smSection.indexOf('**WALK**')
  const themeIdx = smSection.indexOf('**THEME**')
  const clientIdx = smSection.indexOf('**CLIENT**')
  assert.ok(walkIdx !== -1 && themeIdx !== -1 && clientIdx !== -1,
    'AC-20260910-04-10: § Mocks: State Machine must name **WALK**, **THEME** and **CLIENT** (each bold): got positions ' + JSON.stringify({ walkIdx, themeIdx, clientIdx }) + ' in:\n' + smSection)
  assert.ok(walkIdx < themeIdx && themeIdx < clientIdx,
    'AC-20260910-04-10: the order sentence must name WALK -> THEME -> CLIENT in that order: got positions ' + JSON.stringify({ walkIdx, themeIdx, clientIdx }))
  assert.ok(mocksDoctrine.includes('?theme='),
    'AC-20260910-04-10: spec/doctrine/mocks.md must carry the literal "?theme=" (the D1 link-swap param): got no occurrence')

  const designDoctrine = read('spec/doctrine/design.md')
  assert.ok(!/picked on `\/spec:sketch`'s first run/.test(designDoctrine),
    'AC-20260910-04-10: spec/doctrine/design.md must not carry "picked on `/spec:sketch`\'s first run": ' + JSON.stringify(designDoctrine.match(/.{0,40}first run.{0,40}/)))

  const sketchCmd = read('spec/commands/sketch.md')
  const step3Idx = sketchCmd.search(/\n3\.\s+\*\*/)
  assert.ok(step3Idx !== -1, 'spec/commands/sketch.md must carry a numbered step 3 ("3. **...") to anchor the Theme step search')
  const step4Idx = sketchCmd.indexOf('\n4. ', step3Idx + 1)
  const step3Section = sketchCmd.slice(step3Idx, step4Idx === -1 ? sketchCmd.length : step4Idx)
  assert.match(step3Section, /theme shortlist/, 'AC-20260910-04-10: spec/commands/sketch.md step 3 must carry `theme shortlist`: ' + step3Section)
  assert.ok(!step3Section.includes('theme open'), 'AC-20260910-04-10: spec/commands/sketch.md step 3 must name no `theme open` as a live command: ' + step3Section)
  assert.ok(!step3Section.includes('theme adopt'), 'AC-20260910-04-10: spec/commands/sketch.md step 3 must name no `theme adopt` as a live command: ' + step3Section)

  const mocksCmd = read('spec/commands/mocks.md')
  assert.ok(mocksCmd.includes('## Theme (THEME state)'),
    'AC-20260910-04-10: spec/commands/mocks.md must carry a "## Theme (THEME state)" heading: got no occurrence')
})

// ---------------------------------------------------------------------------
// AC-20260911-01-11
// ---------------------------------------------------------------------------
// specs/20260911/01-the-page-waits-for-the-server.md D6: the "A client's no promotes" paragraph
// in § Mocks: Client Player names the mark's English control ("That's not right") instead of
// the retired `違う`, and the section gains no language claim of any kind. TDD red: the
// pre-image's only Japanese in this file is exactly that one control name, at this heading.
test('AC-20260911-01-11: spec/doctrine/mocks.md § Mocks: Client Player carries no character in the Hiragana/Katakana or CJK-Unified-Ideographs ranges', () => {
  const p = 'spec/doctrine/mocks.md'
  const src = read(p)
  const headingIdx = src.indexOf('## Mocks: Client Player')
  assert.ok(headingIdx !== -1, p + ' must carry a "## Mocks: Client Player" heading to anchor this search')
  const nextHeadingIdx = src.indexOf('\n## ', headingIdx + 1)
  const section = src.slice(headingIdx, nextHeadingIdx === -1 ? src.length : nextHeadingIdx)
  assert.ok(!/[぀-ヿ一-龯]/.test(section),
    'D6: § Mocks: Client Player must carry no Japanese character — the section is the only doctrine that ever named a player control, and retiring the two-language chrome means it names none: got\n' +
    JSON.stringify(section.match(/.{0,20}[぀-ヿ一-龯].{0,20}/)))
})
