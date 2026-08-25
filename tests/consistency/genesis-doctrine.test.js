'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, read, runBash } = require('../helpers')

// specs/20260825/01-genesis-panel-collapse.md (2026-08-25): deletes the genesis MoA panel
// (wf-panel.js: three blind Sonnet proposers + a Fable aggregator) and replaces it with one
// proposer — the planning session itself — over the retained wf-research.js fan-out. Panel
// verdicts don't reproduce run-to-run and identical-evidence deliberation herds (both sources
// cited in the spec's Rationale); the collapse deletes the readers and keeps the research
// slices. These tests pin the key/file/manifest deletion (AC-1), the doctrine section swap and
// its literal ban (AC-2), the archetype registry's product-free three-column shape (AC-3), the
// two genesis commands' literal ban (AC-4), README/design.md's literal ban (AC-5), and the
// retained wf-research/shared-for regression (AC-6). None of AC-1..AC-5 can pass yet — the
// panel is still wired into every one of these files (TDD red, 2026-08-25); AC-6 is a sanctioned
// green-pre-change regression pin.

// ---------------------------------------------------------------------------
// AC-20260825-01-1
// ---------------------------------------------------------------------------

test('AC-20260825-01-1: spec-paths wf-panel is refused now that D1 retires the key, and wf-panel.js and its entrypoints.json row are both gone', () => {
  const r = runBash('bin/spec-paths', ['wf-panel'])
  assert.notStrictEqual(r.status, 0,
    'D1 retires the wf-panel spec-paths key — a still-zero exit means the key still resolves ' +
    'and any command invoking `spec-paths wf-panel` would get a path to a deleted script instead ' +
    'of a discoverable error: ' + JSON.stringify(r))
  assert.match(r.stderr, /^usage: spec-paths/,
    'an unknown key must print the usage line to stderr, the same way every other unknown key ' +
    'does — a caller relying on the old key needs a discoverable error, not a silent wrong path ' +
    'or a bare non-zero exit: ' + JSON.stringify(r.stderr))

  const wfPanelPath = path.join(SPEC, 'workflows/wf-panel.js')
  assert.ok(!fs.existsSync(wfPanelPath),
    'D1 deletes spec/workflows/wf-panel.js with the panel it implements — its continued ' +
    'presence on disk means the three-proposer/aggregator mechanism this spec exists to remove ' +
    'is still reachable even if nothing resolves a key to it: ' + wfPanelPath)

  const manifest = JSON.parse(read('spec/entrypoints.json'))
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest, 'spec/workflows/wf-panel.js'),
    'D1 drops the spec/entrypoints.json row for wf-panel.js along with the script and the ' +
    'spec-paths key — a surviving row here means the entry-point manifest still documents a ' +
    'call site for a file that no longer exists: ' + JSON.stringify(Object.keys(manifest)))
})

// File-local helper: AC-2/AC-4/AC-5 each carried the same
// `for (const [re, label] of banned) { assert.ok(!re.test(src), ...) }` loop over their own
// banned-literal list (review finding, .claude/rules/spec-pipeline.md § Review Checks — three or
// more near-identical blocks in one diff names the extraction). Not lifted into tests/helpers.js:
// `grep -rn 'for (const \[re' tests/` shows this file is the only consumer, and
// tests/consistency/design-doctrine.test.js's banned-literal shape is `!src.includes(literal)`
// over plain strings, not regexes — a shared export would widen a single-caller helper into
// cross-file surface for no second caller. msgFor(label) still builds each call site's own
// specific, worked-example failure message; only the loop mechanics are shared.
function assertNoBannedLiterals (src, banned, msgFor) {
  for (const [re, label] of banned) {
    assert.ok(!re.test(src), msgFor(label))
  }
}

// ---------------------------------------------------------------------------
// AC-20260825-01-2
// ---------------------------------------------------------------------------

test('AC-20260825-01-2: genesis.md carries the new Decision Record heading and none of the retired panel/proposer literals', () => {
  const src = read('spec/doctrine/genesis.md')
  assert.match(src, /^## Genesis: Decision Record \(one proposer\)$/m,
    'D2 replaces the panel/loop/menu sections with one new "## Genesis: Decision Record (one ' +
    'proposer)" section stating the session reads the research menus and writes the ADRs ' +
    'directly — its absence means the collapse never actually landed the doctrine that tells ' +
    'the two genesis commands what to do instead of invoking the panel')

  const banned = [
    [/wf-panel/, 'wf-panel'],
    [/proposer\s+panel/i, 'proposer panel'],
    [/\bMoA\b/, 'MoA'],
    [/aggregator/i, 'aggregator'],
    [/Panel\s+Roles/, 'Panel Roles'],
    [/panel-results/, 'panel-results'],
    [/roleKeys/, 'roleKeys'],
    [/runProposers/, 'runProposers'],
    [/Session\s+↔\s+Workflow\s+Loop/, 'Session ↔ Workflow Loop'],
    // Every pattern above requires "panel" adjacent to another word — that gap is exactly what
    // let a live present-tense doctrine sentence ("verified by argument — research citations,
    // panel scrutiny, user rulings") stay green through a full review. Ban the bare word too.
    [/\bpanel\b/i, 'panel']
  ]
  assertNoBannedLiterals(src, banned, (label) => label === 'panel'
    ? 'D2 bans the bare literal "panel" from genesis.md — every other entry in this list requires ' +
      '"panel" adjacent to another word, which is exactly the hole that let the live sentence ' +
      '"verified by argument — research citations, panel scrutiny, user rulings" stay green ' +
      'through a full review; a surviving bare "panel" means that hole is still open'
    : 'D2 bans the literal "' + label + '" from genesis.md — its presence means the retired ' +
      'panel/aggregator/role-menu mechanism is still documented as though it exists, e.g. a ' +
      'surviving `runProposers: false` would mean a stale control flag from the deleted panel ' +
      'is still part of the doctrine contract')
})

// ---------------------------------------------------------------------------
// AC-20260825-01-3
// ---------------------------------------------------------------------------

test('AC-20260825-01-3: the Archetype Registry table has exactly three columns and no cell names a framework, language, runtime, or catalog product', () => {
  const src = read('spec/doctrine/genesis.md')
  const headingMatch = src.match(/^## Genesis: Archetype Registry.*$/m)
  assert.ok(headingMatch,
    'the "## Genesis: Archetype Registry" heading must still exist — without it there is no ' +
    'section boundary to parse the registry table from')

  const afterHeading = src.slice(headingMatch.index + headingMatch[0].length)
  const nextHeading = afterHeading.match(/^## /m)
  const section = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading

  const rows = section.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'))
  assert.ok(rows.length >= 3,
    'expected at least a header row, a separator row, and one data row inside the Archetype ' +
    'Registry section — a parse that finds fewer means the table itself is missing or malformed: ' +
    'found ' + rows.length + ' pipe-delimited lines')

  const cellsOf = (row) => row.slice(1, -1).split('|').map((c) => c.trim())

  for (const row of rows) {
    const cols = cellsOf(row).length
    assert.strictEqual(cols, 3,
      'D4 fixes the registry table to exactly the three columns `Archetype | Hard-to-reverse ' +
      'dimension keys (floor) | Design stage` — the candidate-stacks column is deleted — a row ' +
      'with a different column count means the table still carries (or is missing) a column: ' +
      JSON.stringify(row))
  }

  const BANNED_CELL = /Next|Remix|Svelte|Flutter|Expo|Swift|Kotlin|Tauri|Electron|Storybook|Widgetbook|Python|Rust|TypeScript|\bGo\b|\bTS\b|\bRN\b/
  const dataRows = rows.slice(2)
  for (const row of dataRows) {
    for (const cell of cellsOf(row)) {
      assert.ok(!BANNED_CELL.test(cell),
        'D4: no registry table cell may name a specific framework, language, runtime, or ' +
        'catalog product — dimension keys are the only vocabulary (core § Rule Enforcement); ' +
        'a cell like "Next/Remix/SvelteKit + API, TS" is exactly the named-stack rot the ' +
        'registry shrink removes: ' + JSON.stringify(cell))
    }
  }
})

// ---------------------------------------------------------------------------
// AC-20260825-01-4
// ---------------------------------------------------------------------------

test('AC-20260825-01-4: genesis-architect.md and genesis-design.md name none of the retired panel literals and still name wf-research', () => {
  const banned = [
    [/wf-panel/, 'wf-panel'],
    [/panel-results/, 'panel-results'],
    [/Panel\s+Roles/, 'Panel Roles'],
    [/roleKeys/, 'roleKeys'],
    [/runProposers/, 'runProposers'],
    [/aggregator/i, 'aggregator']
  ]
  for (const rel of ['spec/commands/genesis-architect.md', 'spec/commands/genesis-design.md']) {
    const src = read(rel)
    assertNoBannedLiterals(src, banned, (label) =>
      'D5/D6: ' + rel + ' must not name the retired literal "' + label + '" — e.g. ' +
      'architect.md still containing `Workflow {scriptPath: <spec-paths wf-panel output>}` ' +
      'would mean the command still invokes a workflow this spec deletes')
    assert.match(src, /wf-research/,
      'D5/D6: ' + rel + ' must still name wf-research — the research fan-out is retained, only ' +
      'the panel that read its output is removed; its absence would mean the command lost its ' +
      'only remaining research call, not just the panel')
  }
})

// ---------------------------------------------------------------------------
// AC-20260825-01-5
// ---------------------------------------------------------------------------

test('AC-20260825-01-5: README.md and design.md name no wf-panel and no proposer-panel/blind-proposer literal', () => {
  const banned = [
    [/wf-panel/, 'wf-panel'],
    [/proposer\s+panel/i, 'proposer panel'],
    [/blind[\s-]+proposer/i, 'blind proposer / blind-proposer']
  ]
  for (const rel of ['README.md', 'spec/doctrine/design.md']) {
    const src = read(rel)
    assertNoBannedLiterals(src, banned, (label) =>
      'D8: ' + rel + ' must not name "' + label + '" — e.g. the README line "has a blind ' +
      'proposer panel argue the stack" would mean the plugin\'s own public description still ' +
      'describes a mechanism this spec deletes')
  }

  // spec/workflows/wf-research.js is invisible to both automatic sweeps: .claude/spec.config.json's
  // pipelineOwnedPaths lists "spec/workflows/wf-*.js", and pipelineOwnedGlobs prunes that pattern
  // from collision-closure's literals leg and from scope-reconcile — so this enumerated-file test
  // is the ONLY gate that can see a stale panel/proposer/aggregator reference left inside it. Do
  // not "simplify" this block away as redundant with the loop above: it is the other sweeps' blind
  // spot, not a duplicate check, and it deliberately bans a stricter list than README/design.md do
  // (those two files legitimately keep "one proposer" as the spec's new vocabulary).
  const wfResearchBanned = [
    [/wf-panel/, 'wf-panel'],
    [/\bpanel\b/i, 'panel'],
    [/proposer/i, 'proposer'],
    [/aggregator/i, 'aggregator']
  ]
  const wfResearchSrc = read('spec/workflows/wf-research.js')
  assertNoBannedLiterals(wfResearchSrc, wfResearchBanned, (label) =>
    'D8: spec/workflows/wf-research.js must not name "' + label + '" — this file is pruned from ' +
    'both pipelineOwnedGlobs sweeps (collision-closure\'s literals leg and scope-reconcile) by ' +
    '.claude/spec.config.json\'s pipelineOwnedPaths, so a surviving panel/proposer/aggregator ' +
    'reference here would ship invisibly to every other gate this repo runs')
})

// ---------------------------------------------------------------------------
// AC-20260825-01-6 (regression pin — SHALL CONTINUE TO, sanctioned green pre-change)
// ---------------------------------------------------------------------------

test('AC-20260825-01-6: spec-paths wf-research continues to resolve to an existing path and shared-for genesis-architect continues to emit Host Grounding', () => {
  const wfResearch = runBash('bin/spec-paths', ['wf-research'])
  assert.strictEqual(wfResearch.status, 0,
    'D9: the retained research fan-out must keep resolving through spec-paths after the panel ' +
    'is deleted — a non-zero exit here means the collapse broke the mechanism it was supposed ' +
    'to keep, not just the one it was supposed to remove: ' + JSON.stringify(wfResearch))
  const wfResearchPath = wfResearch.stdout.trim()
  assert.ok(fs.existsSync(wfResearchPath),
    'the resolved wf-research.js path must actually exist on disk: ' + wfResearchPath)

  const sharedFor = runBash('bin/spec-paths', ['shared-for', 'genesis-architect'])
  assert.strictEqual(sharedFor.status, 0,
    'D9: `spec-paths shared-for genesis-architect` must continue to succeed after the panel ' +
    'collapse: ' + JSON.stringify(sharedFor))
  assert.match(sharedFor.stdout, /## Host Grounding/,
    'D9: genesis-architect must continue to be served § Host Grounding — a section map broken ' +
    'by this spec\'s doctrine edits would mean the command reads no grounding doctrine at all: ' +
    sharedFor.stdout)
})

// specs/20260825/02-genesis-consultant-discovery.md (2026-08-25) adds three more ACs to this
// same doctrine-pin file. D1/D2 rewrite the panel-era § Genesis: Discovery Interview posture: out
// go the fixed Product/User/Scope/Architect lens batches, the scripted "Probe once" / "One probe
// round, never a recursion" / "Reflect back, twice" sentences, and the read-back sign-off gate;
// in comes an adaptive interview gated by a silent ten-key coverage audit, whose keys (plus D5's
// six derived dimension keys) must now be named in genesis.md (AC-1). D3 introduces the brief
// template `spec/templates/genesis-brief.md`: six fixed `## ` headings in order and a ten-line,
// all-`dark` `## Coverage` skeleton (AC-2). D3/D4 add an On-disk Handoff roster line naming that
// template as `brief.md`'s source and the throwaway `.claude/genesis/sketch.html`, pruned by
// `/spec:genesis-design` (AC-3). None of AC-1..AC-3 can pass yet — the old lens/probe/read-back
// literals are still live, the template file does not exist, and the roster names neither
// artifact (TDD red, 2026-08-25).

// Build a regex matching a multi-word phrase with `\s+` between words instead of a literal space,
// so a doctrine file that hard-wraps the phrase across two lines still gets caught (memory:
// doctrine-regex-linewrap — a literal-space pin can pass on a wrapped file while the banned
// phrase is still live).
function wordsRe (phrase) {
  const words = phrase.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(words.join('\\s+'))
}

// ---------------------------------------------------------------------------
// AC-20260825-02-1
// ---------------------------------------------------------------------------

test("AC-20260825-02-1: genesis.md, genesis-architect.md, and genesis-design.md carry none of the retired scripted-interview literals, and genesis.md names every coverage key and every D5 derived dimension key", () => {
  const banned = [
    [wordsRe('Probe once'), 'Probe once'],
    [wordsRe('One probe round'), 'One probe round'],
    [wordsRe('never a recursion'), 'never a recursion'],
    [wordsRe('read-back gate'), 'read-back gate'],
    [wordsRe('Reflect back, twice'), 'Reflect back, twice'],
    [/\[Product lens\]/, '[Product lens]'],
    [/\[User lens\]/, '[User lens]'],
    [/\[Scope lens\]/, '[Scope lens]'],
    [/\[Architect lens\]/, '[Architect lens]']
  ]
  const files = [
    'spec/doctrine/genesis.md',
    'spec/commands/genesis-architect.md',
    'spec/commands/genesis-design.md'
  ]
  for (const rel of files) {
    const src = read(rel)
    assertNoBannedLiterals(src, banned, (label) =>
      'D1: ' + rel + ' must not contain the retired scripted-interview literal "' + label + '" — ' +
      'e.g. a surviving "One probe round, never a recursion" means the fixed lens-batch / probe / ' +
      'read-back script this spec deletes is still the documented interview posture instead of ' +
      'the adaptive, coverage-audited one D1 requires')
  }

  const genesisSrc = read('spec/doctrine/genesis.md')
  const requiredKeys = [
    'payer', 'tenancy', 'data-sensitivity', 'residency', 'ai-use', 'unattended',
    'integrations', 'scale-outage', 'vendor-budget', 'offline-mobile',
    'tenancy-model', 'data-residency', 'llm-provider', 'background-jobs',
    'observability', 'api-versioning'
  ]
  for (const key of requiredKeys) {
    assert.ok(genesisSrc.includes(key),
      'D1/D5: genesis.md must name the key "' + key + '" — its absence means either the D2 ' +
      'coverage audit or the D5 derived-dimension table is missing from the doctrine, and the ' +
      'session has no fixed structure left to run the interview against')
  }
})

// ---------------------------------------------------------------------------
// AC-20260825-02-2
// ---------------------------------------------------------------------------

test('AC-20260825-02-2: spec/templates/genesis-brief.md exists with the six D3 headings in order and a ten-line all-dark Coverage block', () => {
  const templatePath = path.join(SPEC, 'templates/genesis-brief.md')
  assert.ok(fs.existsSync(templatePath),
    'D3: spec/templates/genesis-brief.md must exist — its absence means the brief-as-interface ' +
    'template this spec introduces was never created, and neither genesis command has a skeleton ' +
    'to author .claude/genesis/brief.md from: ' + templatePath)

  const src = fs.readFileSync(templatePath, 'utf8')
  const headings = [...src.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  const expectedHeadings = [
    "What I think you're building", 'Coverage', 'Non-goals',
    'Open Dimensions', 'Research Angles', 'Picks'
  ]
  assert.deepStrictEqual(headings, expectedHeadings,
    'D3: genesis-brief.md must contain exactly these six `## ` headings in this order — a ' +
    'missing, renamed, reordered, or extra heading means the brief-as-interface contract (the ' +
    'fixed page shape every genesis command reads and re-renders) is not what D3 locked: got ' +
    JSON.stringify(headings))

  // `m` makes `$` match before every line terminator, not just end-of-string — so a
  // trailing `\n?$` alternative in the lookahead let the lazy `[\s\S]*?` stop after the
  // FIRST coverage line every time. `(?![\s\S])` asserts true end-of-string regardless
  // of the `m` flag, so the capture only stops at the next `## ` heading or real EOF.
  const coverageMatch = src.match(/^## Coverage\n([\s\S]*?)(?=\n## |(?![\s\S]))/m)
  assert.ok(coverageMatch,
    'D3: a `## Coverage` section must be findable in genesis-brief.md to check its ten-line ' +
    'skeleton against')
  const coverageLines = coverageMatch[1].split('\n').map((l) => l.trim()).filter(Boolean)
  assert.strictEqual(coverageLines.length, 10,
    'D2/D3: the template\'s `## Coverage` block must pre-fill exactly the ten coverage keys, one ' +
    'line each — a count other than ten means the fixed audit structure the interview depends on ' +
    'is incomplete or padded in the shipped template: found ' + coverageLines.length + ' lines: ' +
    JSON.stringify(coverageLines))

  const grammar = /^- (payer|tenancy|data-sensitivity|residency|ai-use|unattended|integrations|scale-outage|vendor-budget|offline-mobile): (covered|dark|n\/a)( — .+)?$/
  for (const line of coverageLines) {
    assert.match(line, grammar,
      'D2: coverage line "' + line + '" does not match the grammar `^- <key>: covered|dark|n/a( ' +
      '— <reason>)?$` — a line outside this grammar means the driver spec\'s later parser (spec ' +
      '03/04) has no fixed shape to read the audit from')
    assert.match(line, /: dark$/,
      'D3: every coverage line in the pristine (freshly-copied) template must read exactly ' +
      '"dark" with no trailing reason — a template that ships any key pre-marked covered/n-a ' +
      'means the audit starts already-answered instead of silently dark: ' + JSON.stringify(line))
  }
})

// ---------------------------------------------------------------------------
// AC-20260825-02-3
// ---------------------------------------------------------------------------

test("AC-20260825-02-3: genesis.md's On-disk Handoff roster names genesis-brief.md as brief.md's template and sketch.html as the throwaway artifact pruned at /spec:genesis-design", () => {
  const src = read('spec/doctrine/genesis.md')
  const headingMatch = src.match(/^## Genesis: On-disk Handoff.*$/m)
  assert.ok(headingMatch,
    'the "## Genesis: On-disk Handoff" heading must still exist — without it there is no section ' +
    'boundary to check the artifact roster from')
  const afterHeading = src.slice(headingMatch.index + headingMatch[0].length)
  const nextHeading = afterHeading.match(/^## /m)
  const section = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading

  const briefBulletIdx = section.indexOf('`.claude/genesis/brief.md`')
  assert.ok(briefBulletIdx !== -1,
    'the `.claude/genesis/brief.md` roster bullet must still exist in § On-disk Handoff')
  const briefWindow = section.slice(briefBulletIdx, briefBulletIdx + 400)
  assert.match(briefWindow, /genesis-brief\.md/,
    'D3: the brief.md roster bullet must name genesis-brief.md as the template it is authored ' +
    'from (e.g. "template via `spec-paths templates`") — its absence means the template ' +
    'introduced by this spec is undocumented as brief.md\'s source: ' + JSON.stringify(briefWindow))

  const sketchIdx = section.indexOf('sketch.html')
  assert.ok(sketchIdx !== -1,
    'D4: § On-disk Handoff must name .claude/genesis/sketch.html — its absence means the ' +
    'throwaway core-screen sketch this spec introduces has no roster entry at all')
  const sketchWindow = section.slice(Math.max(0, sketchIdx - 300), sketchIdx + 300)
  assert.match(sketchWindow, /prune/i,
    'D4: the sketch.html roster entry must say it is deleted at a prune step — its absence means ' +
    'the roster does not document that this is a throwaway artifact, not a durable one: ' +
    JSON.stringify(sketchWindow))
  assert.match(sketchWindow, /genesis-design/,
    'D4: the sketch.html roster entry must name /spec:genesis-design as the command whose prune ' +
    'step deletes it — its absence means the roster does not say WHEN the throwaway artifact ' +
    'goes away: ' + JSON.stringify(sketchWindow))
})
