'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ROOT, SPEC, read, runNode, tmpdir } = require('../helpers')
const { bare, advanceToThemePicked } = require('../mocks/mocks-driver-fixtures')

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

test('AC-20260824-05-2: spec/doctrine/design.md is at most 160 lines and names none of the retired mechanism/seat literals', () => {
  const src = read('spec/doctrine/design.md')
  const lineCount = src.split('\n').length
  assert.ok(lineCount <= 160,
    'D1/D2 caps the rewritten doctrine at 160 lines — the cap IS the enforcement (a doctrine ' +
    'this short cannot also carry a retired mechanism\'s history or rationale): got ' +
    lineCount + ' lines')
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
// mocks-driver-fixtures.js `advanceToThemePicked` helper (SKIN and REVIEW are retired — the
// sign-off step is SIGNOFF, reached straight from theme-picked, with no skin/review marks in
// between).
test('AC-20260902-10-8: WHEN the driver prints the SIGNOFF step with the theme picked THE SYSTEM includes the D7 sign-off literal', () => {
  const dir = tmpdir('mocks-review-signoff')
  advanceToThemePicked(dir)
  const step = bare(dir)
  assert.strictEqual(step.status, 0, 'a bare invocation at the SIGNOFF sign-off step must exit 0: ' + step.stderr)
  assert.ok(step.stdout.includes('the written brief, not these screens, holds scope'),
    'D7: the sign-off step must print the exact literal "the written brief, not these screens, ' +
    'holds scope" — approval is on understanding, not on these screens holding scope: got ' + step.stdout)
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

test('AC-20260906-06-4: spec/agents/design-critic.md parses as model opus, effort medium, tools exactly Read/Grep/Glob/Bash, and a body naming the four blind-spot questions in order plus "empty list is a valid return"; spec/commands/sketch.md carries a Critique step under § The run naming check --states, render-gate, design-critic and notes add, positioned before the exit step', () => {
  const criticPath = path.join(SPEC, 'agents/design-critic.md')
  assert.ok(fs.existsSync(criticPath), 'D5: spec/agents/design-critic.md must exist — the critic agent file has not been created yet')
  const criticSrc = fs.readFileSync(criticPath, 'utf8')
  const fm = frontmatterWithLists(criticSrc)
  assert.strictEqual(fm.model, 'opus',
    'D5: design-critic.md frontmatter must declare model: opus — judgment seats run Opus per core § Model Placement: got ' + JSON.stringify(fm))
  assert.strictEqual(fm.effort, 'medium',
    'D5: design-critic.md frontmatter must declare effort: medium: got ' + JSON.stringify(fm))
  assert.deepStrictEqual(fm.tools, ['Read', 'Grep', 'Glob', 'Bash'],
    'D5: design-critic.md frontmatter must declare tools exactly Read, Grep, Glob, Bash (inspection only, read-only so it cannot "fix" its way past the session): got ' + JSON.stringify(fm.tools))

  const closeIdx = criticSrc.indexOf('---', 3)
  const body = criticSrc.slice(closeIdx + 3)
  for (const literal of ['prevent', 'recover', 'help', 'faster']) {
    assert.ok(body.includes(literal),
      'D5: design-critic.md\'s body must contain the four blind-spot questions — missing "' + literal + '"')
  }
  const positions = ['prevent', 'recover', 'help', 'faster'].map((w) => body.indexOf(w))
  assert.ok(positions.every((v, i) => i === 0 || v > positions[i - 1]),
    'D5: the four questions must appear in the fixed order prevent, recover, help, faster (CHI 2026\'s measured heuristics, in the order the spec fixes them): got positions ' + JSON.stringify(positions))
  assert.ok(body.includes('empty list is a valid return'),
    'D5: design-critic.md must contain the exact phrase "empty list is a valid return" — an empty findings list is a valid, honest return, never a failure to invent a gap')

  const sketchSrc = read('spec/commands/sketch.md')
  const runIdx = sketchSrc.indexOf('## The run')
  assert.ok(runIdx !== -1, 'sketch.md must still carry a "## The run" heading to anchor the Critique step search')
  const nextHeadingIdx = sketchSrc.indexOf('\n## ', runIdx + 1)
  const runSection = sketchSrc.slice(runIdx, nextHeadingIdx === -1 ? sketchSrc.length : nextHeadingIdx)

  const critiqueIdx = runSection.search(/\*\*[^*]*Critique[^*]*\*\*/)
  assert.ok(critiqueIdx !== -1,
    'D3: spec/commands/sketch.md § The run must carry a step whose heading contains "Critique" — the fixed critique pass (states check · render rules · one fresh-context critic) before the exit stop')
  const exitIdx = runSection.search(/\*\*[^*]*Exit[^*]*\*\*/)
  assert.ok(exitIdx !== -1, 'sketch.md § The run must still carry an exit step to compare the Critique step\'s position against')
  assert.ok(critiqueIdx < exitIdx,
    'D3: the Critique step must be positioned before the exit step, never after — ratification must never be reachable without running the critique pass: critique@' + critiqueIdx + ' exit@' + exitIdx)
  for (const literal of ['check --states', 'render-gate', 'design-critic', 'notes add']) {
    assert.ok(runSection.includes(literal),
      'D3: § The run must name "' + literal + '" — the Critique step wires the states check, the render rules, the critic dispatch, and the note-writing verb the session records findings through')
  }
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
test('AC-20260907-06-8: spec/commands/sketch.md carries a step under § The run, positioned before both the Critique and Exit steps, whose heading names Theme and whose body names theme state/compose/open/adopt, the no-kit gray-floor warning literal, and "end the turn"; the file names neither "/spec:mocks THEME" nor "no theme picked yet" anywhere', () => {
  const src = read('spec/commands/sketch.md')

  assert.ok(!src.includes('/spec:mocks THEME'),
    'D7 retires the mocks-THEME hand-off from sketch.md outright — "/spec:mocks THEME" must not appear anywhere in the file: ' + JSON.stringify(src.match(/.{0,40}\/spec:mocks THEME.{0,40}/)))
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

  for (const literal of [
    'theme state', 'theme compose', 'theme open', 'theme adopt',
    '⚠️ no design/kit/ and no theme — sketching gray, structure only (run /spec:mocks to KIT first)',
    'end the turn',
  ]) {
    assert.ok(runSection.includes(literal),
      'D7: § The run must name "' + literal + '" — the Theme step wires the driver\'s theme subcommand family, the no-kit gray floor, and the turn-ending look-stop hand-off')
  }
})

// specs/20260907/06-theme-pick-moves-to-sketch.md D8, AC-20260907-06-9: § Design Canon's
// "Fidelity lives in sketch" sentence gains that the theme itself is picked on sketch's first
// run, that candidates are the signed-off gray kit re-rendered per direction at
// design/theme/<kebab>/kit.html, and that the picked direction's kit page is the fidelity
// reference every later sketch surface is built from. TDD red: today's sentence names none of
// this — no "design/theme/", no "fidelity reference", and no mention that the theme is picked
// on sketch's first run.
test('AC-20260907-06-9: spec/doctrine/design.md § Design Canon names design/theme/<kebab>/kit.html, the phrase "fidelity reference", and that the theme is picked on /spec:sketch\'s first run', () => {
  const src = read('spec/doctrine/design.md')
  const canonIdx = src.indexOf('## Design Canon')
  assert.ok(canonIdx !== -1, 'spec/doctrine/design.md must still carry a "## Design Canon" heading to anchor this search')
  const nextHeadingIdx = src.indexOf('\n## ', canonIdx + 1)
  const canonSection = src.slice(canonIdx, nextHeadingIdx === -1 ? src.length : nextHeadingIdx)

  assert.match(canonSection, /design\/theme\/<kebab>\/kit\.html/,
    'D8: § Design Canon must name design/theme/<kebab>/kit.html — the candidate direction path every later sketch surface is built from: ' + canonSection)
  assert.ok(canonSection.includes('fidelity reference'),
    'D8: § Design Canon must name the phrase "fidelity reference" — the picked direction\'s kit page is the fidelity reference: ' + canonSection)
  assert.match(canonSection, /theme[^.]*picked[^.]*(?:\/spec:sketch|sketch)[^.]*first run|(?:\/spec:sketch|sketch)[^.]*first run[^.]*theme[^.]*picked/,
    'D8: § Design Canon must say the theme itself is picked on /spec:sketch\'s first run: ' + canonSection)
})
