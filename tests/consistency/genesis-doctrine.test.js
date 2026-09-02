'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read, runBash } = require('../helpers')

// specs/20260825/01-genesis-panel-collapse.md: deletes the genesis MoA panel (wf-panel.js:
// three blind Sonnet proposers + a Fable aggregator) and replaces it with one proposer — the
// planning session itself — over the retained wf-research.js fan-out; panel verdicts don't
// reproduce run-to-run and identical-evidence deliberation herds (spec Rationale). These tests
// pin the key/file/manifest deletion (AC-1), the doctrine section swap and its literal ban
// (AC-2), the archetype registry's product-free three-column shape (AC-3), the two genesis
// commands' literal ban (AC-4), README/design.md's literal ban (AC-5), and the retained
// wf-research/shared-for regression (AC-6, a sanctioned green-pre-change pin).

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

// Repo-wide retired-name sweep, shared by AC-20260825-04-9 (`genesis-architect`),
// AC-20260827-02-8 (`genesis-explore`), and AC-20260827-03-7 (`genesis-design`) — per §
// Review Checks (three or more near-identical blocks names the extraction). File-local for the
// same reason assertNoBannedLiterals above is: every sweep lives in this file, and a
// tests/helpers.js export would widen a single-file helper into cross-file surface for no
// second-file caller.
//
// `citations` is the structural answer to the self-reference trap: a spec that retires a
// command usually has the command's name inside its OWN filename, so every dated provenance
// header citing that spec (Test Rules require those headers), the run ledger's plan row, and
// the driver's retained review evidence all contain the banned literal while pointing at the
// record of the kill rather than at the dead command. Each citation string is DELETED from a
// file's content before the literal is looked for, so citing the killing spec is always legal
// and pointing at the command never is. Exact strings only — never a "looks like a path" shape
// rule, which is the evadable-guard class § Gotchas bans (a live stale reference written as a
// path would hide behind it). Each citation must strictly contain and exceed the literal, so
// nobody can hollow the sweep out by passing the bare name as its own citation.
//
// Returns offending repo-relative paths; each call site keeps its own assert and its own
// spec-cited consequence message.
function sweepRetiredLiteral (literal, { citations = [], waivedPaths = [], waivedPrefixes = [] }) {
  for (const c of citations) {
    assert.ok(c.includes(literal) && c.length > literal.length,
      'sweep misuse: citation "' + c + '" must strictly contain and exceed the literal "' +
      literal + '" — a citation equal to (or not containing) the literal would subtract every ' +
      'live mention and silently hollow out the sweep it is supposed to narrow')
  }
  const isWaived = (rel) =>
    waivedPaths.includes(rel) || waivedPrefixes.some((pre) => rel.startsWith(pre))
  const walk = (dir, acc) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(abs, acc)
      else if (ent.isFile()) acc.push(abs)
    }
    return acc
  }
  const offenders = []
  for (const abs of walk(ROOT, [])) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    if (isWaived(rel)) continue
    let content = fs.readFileSync(abs, 'utf8')
    for (const c of citations) content = content.split(c).join('')
    if (content.includes(literal)) offenders.push(rel)
  }
  return offenders
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

test('AC-20260825-01-4: genesis.md and genesis-design.md name none of the retired panel literals and still name wf-research', () => {
  const banned = [
    [/wf-panel/, 'wf-panel'],
    [/panel-results/, 'panel-results'],
    [/Panel\s+Roles/, 'Panel Roles'],
    [/roleKeys/, 'roleKeys'],
    [/runProposers/, 'runProposers'],
    [/aggregator/i, 'aggregator']
  ]
  // specs/20260825/04-genesis-driver.md D11: genesis-architect.md is retired and /spec:genesis
  // (spec/commands/genesis.md) is the greenfield entry point — the banned-literal pin follows the
  // command to its new file in place, never weakened, never dropped.
  // specs/20260827/03-genesis-design-state.md D7: spec/commands/genesis-design.md is deleted —
  // read()ing it here would throw once the file is gone. Dropped from this list in place (its
  // own deletion is pinned separately by this file's AC-20260827-03-7 test); the one remaining
  // file still carries the invariant unchanged.
  for (const rel of ['spec/commands/genesis.md']) {
    const src = read(rel)
    assertNoBannedLiterals(src, banned, (label) =>
      'D5/D6: ' + rel + ' must not name the retired literal "' + label + '" — e.g. ' +
      'the genesis entry point still containing `Workflow {scriptPath: <spec-paths wf-panel output>}` ' +
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

  // spec/workflows/wf-research.js gets its own, stricter sweep than README/design.md above.
  // This block is a STANDING invariant — it runs on every `npm test` — whereas
  // collision-closure's literals leg runs only at plan lock, and only for the stems a
  // planner names. (Until specs/20260825/05, `.claude/spec.config.json` also excluded
  // `spec/workflows/wf-*.js` from both automatic sweeps, so this block was the only gate
  // that could see the file at all; that exclusion is gone, but the standing ban stays.)
  // The stricter list is deliberate: README/design.md legitimately keep "one proposer" as
  // the spec's new vocabulary; wf-research.js has no reason to say any of these.
  const wfResearchBanned = [
    [/wf-panel/, 'wf-panel'],
    [/\bpanel\b/i, 'panel'],
    [/proposer/i, 'proposer'],
    [/aggregator/i, 'aggregator']
  ]
  const wfResearchSrc = read('spec/workflows/wf-research.js')
  assertNoBannedLiterals(wfResearchSrc, wfResearchBanned, (label) =>
    'D8: spec/workflows/wf-research.js must not name "' + label + '" — a surviving ' +
    'panel/proposer/aggregator reference here would ship in every host as the ' +
    '`spec:wf-research` description; this standing sweep is the gate that sees it on every run')
})

// ---------------------------------------------------------------------------
// AC-20260825-01-6 (regression pin — SHALL CONTINUE TO, sanctioned green pre-change)
// ---------------------------------------------------------------------------

test('AC-20260825-01-6: spec-paths wf-research continues to resolve to an existing path and shared-for genesis continues to emit Host Grounding', () => {
  const wfResearch = runBash('bin/spec-paths', ['wf-research'])
  assert.strictEqual(wfResearch.status, 0,
    'D9: the retained research fan-out must keep resolving through spec-paths after the panel ' +
    'is deleted — a non-zero exit here means the collapse broke the mechanism it was supposed ' +
    'to keep, not just the one it was supposed to remove: ' + JSON.stringify(wfResearch))
  const wfResearchPath = wfResearch.stdout.trim()
  assert.ok(fs.existsSync(wfResearchPath),
    'the resolved wf-research.js path must actually exist on disk: ' + wfResearchPath)

  // specs/20260825/04-genesis-driver.md D13 renamed this `shared-for` section list from
  // `genesis-architect` to `genesis` with an identical section set; the pin follows the key.
  const sharedFor = runBash('bin/spec-paths', ['shared-for', 'genesis'])
  assert.strictEqual(sharedFor.status, 0,
    'D9: `spec-paths shared-for genesis` must continue to succeed after the panel ' +
    'collapse: ' + JSON.stringify(sharedFor))
  assert.match(sharedFor.stdout, /## Host Grounding/,
    'D9: /spec:genesis must continue to be served § Host Grounding — a section map broken ' +
    'by this spec\'s doctrine edits would mean the command reads no grounding doctrine at all: ' +
    sharedFor.stdout)
})

// specs/20260825/02-genesis-consultant-discovery.md D1/D2/D3/D4/D5: rewrites the panel-era §
// Genesis: Discovery Interview posture — out go the fixed Product/User/Scope/Architect lens
// batches, the scripted "Probe once" / "One probe round, never a recursion" / "Reflect back,
// twice" sentences, and the read-back sign-off gate; in comes an adaptive interview gated by a
// silent ten-key coverage audit, whose keys (plus D5's six derived dimension keys) are named in
// genesis.md (AC-1). The brief template `spec/templates/genesis-brief.md` carries six fixed
// `## ` headings in order and a ten-line, all-`dark` `## Coverage` skeleton (AC-2). The On-disk
// Handoff roster names that template as `brief.md`'s source and the throwaway
// `.claude/genesis/sketch.html`, pruned at the driver's rules-locked mark (AC-3).

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

test("AC-20260825-02-1: genesis.md (doctrine), genesis.md (command), and genesis-design.md carry none of the retired scripted-interview literals, and genesis.md names every coverage key and every D5 derived dimension key", () => {
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
  // specs/20260827/03-genesis-design-state.md D7: spec/commands/genesis-design.md is deleted
  // and dropped from this list in place (see the AC-20260825-01-4 test above); the two
  // remaining files still carry the invariant unchanged.
  const files = [
    'spec/doctrine/genesis.md',
    'spec/commands/genesis.md',
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
  // specs/20260827/03-genesis-design-state.md D4/D8: /spec:genesis-design is deleted and its
  // prune step becomes an act of the driver's own accepted rules-locked mark — the sketch-prune
  // sentence names that mark, never a deleted command.
  assert.doesNotMatch(sketchWindow, /genesis-design/,
    'D8: the sketch.html roster entry must no longer name /spec:genesis-design — the command is ' +
    'deleted, and a surviving mention here would point the session at a dead command: ' +
    JSON.stringify(sketchWindow))
  assert.match(sketchWindow, /rules-locked/,
    'D4/D8: the sketch.html roster entry must name the driver\'s rules-locked mark as what prunes ' +
    'it — its absence means the roster does not say WHEN the throwaway artifact goes away now ' +
    'that the prune is a driver act, not a separate command: ' + JSON.stringify(sketchWindow))
})

// specs/20260825/03-genesis-currency-executed.md D7/D8: the model-placement paragraph's
// currency sentence in genesis.md names registry-check.js (`spec-paths registry-check`) as the
// mechanism, wired into the genesis commands' menu steps in place of the retired Haiku
// currency pass.

// ---------------------------------------------------------------------------
// AC-20260825-03-9
// ---------------------------------------------------------------------------

test('AC-20260825-03-9: genesis.md and genesis-driver.js name registry-check, and neither carries still_current, Haiku pass, Haiku currency, or verifyKeys', () => {
  const banned = [
    [/still_current/, 'still_current'],
    [wordsRe('Haiku pass'), 'Haiku pass'],
    [wordsRe('Haiku currency'), 'Haiku currency'],
    [/verifyKeys/, 'verifyKeys']
  ]
  // specs/20260825/04-genesis-driver.md D4/D13: genesis-driver.js RUNS the registry-check
  // currency check on `--mark menu-written` rather than the architect stage's menu step
  // narrating it — the pin follows the mechanism to its new home; the invariant (every file
  // that owns a menu step names the deterministic currency script) is unchanged.
  //
  // spec/commands/genesis-explore.md (specs/20260827/02-genesis-explore-state.md D10) and
  // spec/commands/genesis-design.md (specs/20260827/03-genesis-design-state.md D7) are both
  // deleted — read()ing either here would throw. Both are dropped from the `files` list below
  // in place (their own deletions are pinned separately, by this file's AC-20260827-02-8 and
  // AC-20260827-03-7 tests); the two remaining files still carry the invariant unchanged.
  const files = [
    'spec/doctrine/genesis.md',
    'spec/scripts/genesis-driver.js',
  ]
  for (const rel of files) {
    const src = read(rel)
    assert.match(src, /registry-check/,
      'D7/D8: ' + rel + ' must name registry-check — its absence means this file was never ' +
      'updated to invoke or document the deterministic script that replaces the retired Haiku ' +
      'currency pass, leaving no currency mechanism named at all')
    assertNoBannedLiterals(src, banned, (label) =>
      'D6/D7/D8: ' + rel + ' must not contain the retired literal "' + label + '" — e.g. ' +
      'a genesis file keeping `verifyKeys: [<the version-bearing subset>]` in its ' +
      'workflow-call step means the deleted Haiku opinion seat and its args plumbing are still ' +
      'documented as though they exist, even though D6 deletes them from wf-research.js itself')
  }
})

// specs/20260825/04-genesis-driver.md: the architect stage is driver-stepped.
// `/spec:genesis-architect` is retired and replaced by a thin `spec/commands/genesis.md` looping
// on `spec/scripts/genesis-driver.js`; the ops-conventions ADR paragraph, the day-zero skeleton
// list, and the roadmap decomposition rules move verbatim out of the command into three
// `spec/doctrine/genesis.md` sections; the `shared-for` section list is rekeyed
// genesis-architect -> genesis. AC-20260825-04-9 is the conformance pin over all of it, plus the
// D15 regression that genesis-explore keeps being served § Design Canon.
//
// .claude/rules/spec-pipeline.md § Gotchas: a conformance guard that decides what to inspect by
// name-shape is a hole evadable by the exact thing it guards — a hand-enumerated file list for
// the stale-name sweep would miss files like tests/ or the repo-root
// .claude-plugin/marketplace.json exactly as an enumerated list did on this rename (see
// specs/20260825/04-genesis-driver.deviations.md). The sweep is inverted: walk the whole repo
// from ROOT and read everything, then subtract an explicit, justified waive-list — never
// enumerate what to check.

// ---------------------------------------------------------------------------
// AC-20260825-04-9
// ---------------------------------------------------------------------------

test('AC-20260825-04-9: spec-paths resolves genesis-driver and shared-for genesis, the retired command file is gone, genesis.md is a thin shell, the three migrated doctrine sections exist, and no file in the repo outside an explicit, justified waive-list names genesis-architect', () => {
  const driver = runBash('bin/spec-paths', ['genesis-driver'])
  assert.strictEqual(driver.status, 0,
    'D13: `spec-paths genesis-driver` must exit 0 — /spec:genesis resolves the driver it loops ' +
    'on through this key, so a missing key strands the one greenfield entry point silently ' +
    '(rules § Risk Tiers, spec-paths): ' + driver.stderr)
  const driverPath = driver.stdout.trim()
  assert.ok(fs.existsSync(driverPath),
    'D13: the resolved genesis-driver.js path must actually exist on disk — a key that resolves ' +
    'to nothing fails at the moment the user runs /spec:genesis, not here: ' + driverPath)

  const sharedFor = runBash('bin/spec-paths', ['shared-for', 'genesis'])
  assert.strictEqual(sharedFor.status, 0,
    'D13: `spec-paths shared-for genesis` must exit 0 — without it the one greenfield command ' +
    'reads no scoped doctrine at all: ' + sharedFor.stderr)
  for (const section of ['## Host Grounding', '## Question Style']) {
    assert.ok(sharedFor.stdout.includes(section),
      'D13: `shared-for genesis` must serve ' + section + ' — shared-for filtering silently ' +
      'DROPS a section whose name does not match, so its absence means the command runs the ' +
      'whole greenfield interview without the doctrine that governs it')
  }

  assert.strictEqual(fs.existsSync(path.join(SPEC, 'commands/genesis-architect.md')), false,
    'D11: spec/commands/genesis-architect.md must be deleted — leaving it on disk means two ' +
    'greenfield entry points ship at once, one of them narrating a phase choreography the ' +
    'driver now owns')

  const cmdPath = path.join(SPEC, 'commands/genesis.md')
  assert.ok(fs.existsSync(cmdPath),
    'D11: spec/commands/genesis.md must exist — it is the entry point the state gate now admits ' +
    'and the only command that loops on the driver')
  const cmdLines = read('spec/commands/genesis.md').split('\n').length
  assert.ok(cmdLines <= 120,
    'D11: spec/commands/genesis.md must be at most 120 lines, found ' + cmdLines + ' — the whole ' +
    'point of the driver is that the command stops re-reading phase prose into context; a command ' +
    'that grows back past this bound has silently reabsorbed the choreography the driver owns')

  const doctrine = read('spec/doctrine/genesis.md')
  for (const heading of [
    '## Genesis: Ops Conventions ADR',
    '## Genesis: Day-Zero Skeleton',
    '## Genesis: Roadmap Decomposition',
  ]) {
    assert.ok(doctrine.includes(heading),
      'D11: spec/doctrine/genesis.md must carry the migrated heading "' + heading + '" — its ' +
      'absence means that block of judgment guidance was lost with the deleted command rather ' +
      'than moved, and the driver would print a step no doctrine explains')
  }

  // D14: waived by explicit path (never by name-shape or extension), each entry justified.
  // Re-verify a waived entry's own hit before trusting it — a fix landing concurrently can
  // remove the very mention it waives. Mechanics shared via sweepRetiredLiteral; this spec's
  // own filename does not carry the literal, so it needs no citation subtraction.
  const offenders = sweepRetiredLiteral('genesis-architect', {
    waivedPaths: [
      // D14 waives it by name: a wording edit re-stamps every host repo's grounding as stale
      // (rules § Risk Tiers), and the contract hash is not paid for a word.
      'spec/templates/grounding-contract.md',
      // its `description` is the changelog surface; historical entries legitimately record that
      // the command is retired.
      'spec/.claude-plugin/plugin.json',
      // its header comment states the incident history (the choreography it replaced).
      'spec/scripts/genesis-driver.js',
      // this file's own header/body names the retired literal as the string under test.
      'tests/consistency/genesis-doctrine.test.js',
      // dated incident-header comments recording the rename (Test Rules require those headers).
      'tests/genesis-gate.test.js',
      'tests/genesis/research-menu.test.js',
    ],
    waivedPrefixes: [
      // dated historical records — a spec that renamed a command must keep naming it.
      'specs/',
      'docs/roadmap/',
      'docs/audit/',
      // driver-written retained review evidence, keyed by run id; never a human-read pointer.
      '.claude/spec-runs/',
    ],
  })
  assert.deepStrictEqual(offenders, [],
    'D14: these files outside the waive-list still name the retired `genesis-architect` command: ' +
    offenders.join(', ') + ' — a surviving mention points a reader, or a future session, at a ' +
    'command that no longer exists, which is exactly the stale-reference class the ' +
    'one-binding-home rule exists to prevent. A repo-wide sweep replaces the old hand-enumerated ' +
    'file list because that list missed tests/ and .claude-plugin/marketplace.json on this same ' +
    'rename (rules § Gotchas: classify by location, never by name-shape)')

  // D15 regression pin, retargeted specs/20260827/02-genesis-explore-state.md D10: the explore
  // stage is not untouched by a later spec — D10 deletes genesis-explore's own `shared-for` map
  // entry outright and folds Design Canon into `genesis` instead (the driver runs the taste
  // funnel end-to-end from the entry point). AC-20260825-04-9's own sibling-list regression pin
  // is retargeted in place from `genesis-explore` to `genesis`, never weakened;
  // AC-20260827-02-8's own test below pins genesis-explore's fall-through-to-full-doctrine
  // behavior.
  const genesisShared = runBash('bin/spec-paths', ['shared-for', 'genesis'])
  assert.strictEqual(genesisShared.status, 0,
    'D10: `spec-paths shared-for genesis` must continue to exit 0 — a non-zero exit here means ' +
    'folding Design Canon into genesis\'s own section list broke the resolver itself: ' +
    genesisShared.stderr)
  assert.match(genesisShared.stdout, /## Design Canon/,
    'D10: /spec:genesis must now be served § Design Canon directly — its absence means the entry ' +
    'point lost the doctrine governing the taste funnel it now runs end-to-end')
})

// specs/20260827/01-genesis-tournament.md D1/D3/D10/D11: spec/commands/genesis.md drops its
// own "## Per-state judgment pointers" section — the driver prints a Doctrine: line per state
// instead (the behavioral half of AC-20260827-01-8, pinned by step-text assertions in
// tests/genesis/tournament.test.js) — and spec/doctrine/genesis.md gains a
// "## Genesis: Tournament of Scaffolds" section. spec/templates/status.json carries the
// `tournament` key, and spec/templates/finalists.json exists.

// ---------------------------------------------------------------------------
// AC-20260827-01-8 (file-level half; the step-text half lives in tournament.test.js)
// ---------------------------------------------------------------------------

test('AC-20260827-01-8: spec/commands/genesis.md drops its per-state pointer section and stays within the 120-line pin, spec/doctrine/genesis.md gains the Tournament of Scaffolds section, status.json carries a tournament key, and finalists.json parses as exactly two finalists each carrying the four command keys', () => {
  const cmdSrc = read('spec/commands/genesis.md')
  assert.ok(!cmdSrc.includes('## Per-state judgment pointers'),
    'D10: spec/commands/genesis.md must not contain "## Per-state judgment pointers" — the ' +
    'driver now prints a Doctrine: line per state (AC-20260827-01-8\'s step-text half in ' +
    'tournament.test.js), and a surviving pointer section means the command still carries the ' +
    'choreography prose D10 moves out of it, leaving two binding homes instead of one')
  const cmdLines = cmdSrc.split('\n').length
  assert.ok(cmdLines <= 120,
    'D10: spec/commands/genesis.md must stay at most 120 lines (AC-20260825-04-9\'s own pin) — ' +
    'found ' + cmdLines + '. The command sat at 119 of 120 before this spec; three new states ' +
    '(FINALISTS, PROBE, PICK) could not land as prose here at all, which is exactly why D10 ' +
    'deletes the pointer section rather than growing it — a line count back over the pin means ' +
    'the choreography crept back in')

  const doctrineSrc = read('spec/doctrine/genesis.md')
  assert.match(doctrineSrc, /^## Genesis: Tournament of Scaffolds$/m,
    'D11: spec/doctrine/genesis.md must carry a "## Genesis: Tournament of Scaffolds" heading — ' +
    'its absence means the states, the probe-task table\'s home, the evidence-informs-never-' +
    'decides rule, the cost line, the retry cap, the re-scaffold-clean rule, and the ' +
    'finalists.json/probe.json/benchmark.json roster this spec introduces have no doctrine home ' +
    'at all, even though the driver (spec/scripts/genesis-driver.js) already cites the section ' +
    'from every tournament-state step text')

  const statusTemplate = JSON.parse(read('spec/templates/status.json'))
  assert.ok(Object.prototype.hasOwnProperty.call(statusTemplate, 'tournament'),
    'D1: spec/templates/status.json must carry the key `tournament` — its absence means a fresh ' +
    'project\'s status.json template has no field for the driver to record tournament.finalists/' +
    'race/post/winner/skipped into, contradicting the Contracts section\'s own status.tournament ' +
    'shape: ' + JSON.stringify(Object.keys(statusTemplate)))

  const finalistsPath = path.join(SPEC, 'templates/finalists.json')
  assert.ok(fs.existsSync(finalistsPath),
    'D3: spec/templates/finalists.json must exist — its absence means the template the FINALISTS ' +
    'step points a session at (to compose finalists.json\'s shape from) was never created: ' +
    finalistsPath)
  const finalistsTemplate = JSON.parse(fs.readFileSync(finalistsPath, 'utf8'))
  assert.ok(Array.isArray(finalistsTemplate.finalists) && finalistsTemplate.finalists.length === 2,
    'D3: the shipped finalists.json template must carry exactly two finalists — the Contracts ' +
    'section\'s own worked example is two, and a template outside the driver\'s own 2-3 range ' +
    'would demonstrate an invalid shape to every session that copies it: ' +
    JSON.stringify(finalistsTemplate.finalists))
  for (const f of finalistsTemplate.finalists) {
    for (const key of ['scaffoldCommand', 'gateCommand', 'bootCommand', 'readyCheck']) {
      assert.ok(typeof f[key] === 'string' && f[key].trim(),
        'D3: each finalist in the shipped finalists.json template must carry a non-empty "' +
        key + '" — its absence in the finalist named "' + f.name + '" means the template ' +
        'demonstrates an incomplete finalist shape to every session that copies it')
    }
  }
})

// specs/20260827/02-genesis-explore-state.md D11: explore's Round 0 folds into the driver as
// states between MENUS and FINALISTS; `/spec:genesis-explore` and its hook arm are deleted, and
// the name is swept from every live surface via this file's own standing repo-wide emptiness
// sweep for the retired literal, on the AC-20260825-04-9 pattern above (same inverted
// walk-then-waive shape, its own justified waive-list — narrower than AC-20260825-04-9's, since
// fewer files legitimately still need the retired name).

// ---------------------------------------------------------------------------
// AC-20260827-02-8
// ---------------------------------------------------------------------------

test('AC-20260827-02-8: spec-paths shared-for genesis serves Design Canon and continues to serve Host Grounding, shared-for genesis-explore falls back to the full doctrine, the retired command file and its entrypoints.json rows are gone, genesis.md doctrine carries the new heading and not the old one, and no file outside a justified waive-list names genesis-explore', () => {
  const genesisShared = runBash('bin/spec-paths', ['shared-for', 'genesis'])
  assert.strictEqual(genesisShared.status, 0,
    'D10: `spec-paths shared-for genesis` must exit 0 — a non-zero exit here means folding Design Canon into genesis\'s own section list broke the resolver itself: ' + genesisShared.stderr)
  assert.match(genesisShared.stdout, /## Design Canon/,
    'D10: /spec:genesis must be served § Design Canon — its absence means the entry point runs the taste funnel end-to-end with no doctrine governing it')
  assert.match(genesisShared.stdout, /## Host Grounding/,
    'AC-20260827-02-8 SHALL CONTINUE TO: /spec:genesis must keep being served § Host Grounding — D10 only ADDS Design Canon to the section list, it never drops the grounding doctrine every command carries')

  // D10: the retired command's own shared-for map entry is gone entirely — a scoped call now
  // falls back to the `*)` arm (full doctrine), which the OLD scoped list never served
  // (## Design Render Gate is design-family doctrine the old genesis-explore SECTIONS list
  // deliberately excluded, per spec-paths.test.js's own prior pin).
  const exploreFallback = runBash('bin/spec-paths', ['shared-for', 'genesis-explore'])
  assert.strictEqual(exploreFallback.status, 0,
    'D10: `spec-paths shared-for genesis-explore` must still exit 0 even with its map entry gone — the `*)` fallback arm (A5) serves the full doctrine rather than erroring: ' + exploreFallback.stderr)
  assert.match(exploreFallback.stdout, /## Design Render Gate/,
    'AC-20260827-02-8/D10: a genesis-explore call must now fall back to the FULL doctrine, which contains § Design Render Gate — a scoped output still narrower than the full doc here means the map entry was not actually removed')

  assert.strictEqual(fs.existsSync(path.join(SPEC, 'commands/genesis-explore.md')), false,
    'D10: spec/commands/genesis-explore.md must be deleted (worker file deletion, no git) — its continued presence means the retired command is still reachable even though its hook arm and shared-for entry are gone')

  const entrypoints = JSON.parse(read('spec/entrypoints.json'))
  const entrypointOffenders = []
  function walkEntrypoints(node) {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (typeof item === 'string' && item.includes('genesis-explore')) entrypointOffenders.push(item)
        else walkEntrypoints(item)
      }
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walkEntrypoints(v)
    }
  }
  walkEntrypoints(entrypoints)
  assert.deepStrictEqual(entrypointOffenders, [],
    'D10: spec/entrypoints.json must name spec/commands/genesis-explore.md in no row — a surviving row means the entry-point manifest still documents a call site for a deleted command: ' +
    JSON.stringify(entrypointOffenders))

  const genesisDoctrine = read('spec/doctrine/genesis.md')
  assert.match(genesisDoctrine, /^## Genesis: Explore State$/m,
    'D11: spec/doctrine/genesis.md must carry the "## Genesis: Explore State" heading — its absence means the rewritten § Explore Stage section (states, marks, external candidate, tile fold, driver-vs-session split) was never landed')
  assert.ok(!genesisDoctrine.includes('## Genesis: Explore Stage'),
    'D11: spec/doctrine/genesis.md must NOT carry the old "## Genesis: Explore Stage" heading — a surviving old heading alongside the new one means the section was duplicated rather than rewritten in place, and any `§ Genesis: Explore Stage` citation elsewhere (e.g. spec/templates/design-positions.md) would still resolve')

  // D11/.claude/rules/spec-pipeline.md § Gotchas: classify by location (a repo-wide walk),
  // never by name-shape — a narrower, hand-enumerated file list is the exact hole the
  // genesis-architect sweep above closes the same way. Mechanics shared via
  // sweepRetiredLiteral.
  //
  // `citations` replaces eight hand-enumerated waives that existed only because THIS spec's own
  // filename contains the literal: six tests/ files carrying a dated provenance header citing
  // it, the append-only run ledger's plan row, and the driver's retained review evidence. Each
  // is a citation of the record of the kill, never a live pointer at the deleted command, and
  // subtraction closes the trap structurally — a file added tomorrow that cites this spec by
  // slug is legal, while any live mention of the command still reddens the sweep.
  const offenders = sweepRetiredLiteral('genesis-explore', {
    citations: [
      'specs/20260827/02-genesis-explore-state.md',
      'specs/20260827/02-genesis-explore-state.deviations.md',
      '02-genesis-explore-state.md',
    ],
    waivedPaths: [
      // this test file's own header/body names the retired literal as the string under test.
      'tests/consistency/genesis-doctrine.test.js',
      // its `description` is the changelog surface; the changelog paragraph names the retired
      // command by design (D14) — a historical record, not a stale reference.
      'spec/.claude-plugin/plugin.json',
      // its header comment states the incident history this spec adds to (the funnel-to-driver
      // fold) — a dated record of what changed, not a live pointer at the deleted command.
      'spec/scripts/genesis-driver.js',
      // D14 waives it by name: a wording edit re-stamps every host repo's grounding as stale
      // (rules § Risk Tiers), and the contract hash is not paid for a word.
      'spec/templates/grounding-contract.md',
      // AC-20260827-02-7 asserts the hook IGNORES this exact prompt string, so the literal is
      // the input under test — the honest waive replacing runtime string-splitting that evaded
      // a sweep already waiving it.
      'tests/genesis-gate.test.js',
      // specs/20260827/03-genesis-design-state.md AC-20260827-03-5 asserts spec/commands/genesis.md's
      // chain bullet never names genesis-explore either — the literal is the input under test,
      // the same reason tests/genesis-gate.test.js is waived just above.
      'tests/genesis/design-state.test.js',
    ],
    waivedPrefixes: [
      // dated historical records — a spec that retires a command must keep naming it in its own
      // (and its siblings') spec documents and the roadmap/audit trail.
      'specs/',
      'docs/roadmap/',
      'docs/audit/',
      'docs/adr/',
    ],
  })
  assert.deepStrictEqual(offenders, [],
    'D11: these files outside the waive-list still name the retired `genesis-explore` command: ' +
    offenders.join(', ') + ' — one binding home for the command name means every live surface ' +
    '(doctrine, commands, README, marketplace listing, canonical docs) must be swept in the same ' +
    'spec that deletes the command, not left for a later pass to discover')
})

// specs/20260827/03-genesis-design-state.md D8: the design lock stops being a command —
// /spec:genesis-design and its hook arm are deleted, the driver gains a DESIGN state between
// ROADMAP and HANDOFF, and the name is swept from every live surface the same way spec 02 swept
// genesis-explore (this file's third repo-wide emptiness sweep, on the same pattern, via the
// shared sweepRetiredLiteral helper).

// ---------------------------------------------------------------------------
// AC-20260827-03-7
// ---------------------------------------------------------------------------

test('AC-20260827-03-7: spec-paths shared-for genesis serves Design Authoring Contracts and continues to serve Design Canon and Host Grounding, the retired command file and its entrypoints.json rows are gone, genesis.md doctrine carries the new Design State heading, and no file outside a justified waive-list names genesis-design', () => {
  const genesisShared = runBash('bin/spec-paths', ['shared-for', 'genesis'])
  assert.strictEqual(genesisShared.status, 0,
    'D7: `spec-paths shared-for genesis` must exit 0 — a non-zero exit here means folding Design Authoring Contracts into genesis\'s own section list broke the resolver itself: ' + genesisShared.stderr)
  assert.match(genesisShared.stdout, /## Design Authoring Contracts/,
    'D7: /spec:genesis must be served § Design Authoring Contracts — its absence means the driver ratifies the design pick with no doctrine section governing it')
  assert.match(genesisShared.stdout, /## Design Canon/,
    'AC-20260827-03-7 SHALL CONTINUE TO: /spec:genesis must keep being served § Design Canon — D7 only ADDS Design Authoring Contracts to the section list, it never drops the section spec 02 already added')
  assert.match(genesisShared.stdout, /## Host Grounding/,
    'AC-20260827-03-7 SHALL CONTINUE TO: /spec:genesis must keep being served § Host Grounding — a section map broken by this spec\'s doctrine edits would mean the command reads no grounding doctrine at all')

  assert.strictEqual(fs.existsSync(path.join(SPEC, 'commands/genesis-design.md')), false,
    'D7: spec/commands/genesis-design.md must be deleted (worker file deletion, no git) — its continued presence means the retired command is still reachable even though its hook arm and shared-for entry are gone')

  const entrypoints = JSON.parse(read('spec/entrypoints.json'))
  const entrypointOffenders = []
  function walkEntrypoints(node) {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (typeof item === 'string' && item.includes('genesis-design')) entrypointOffenders.push(item)
        else walkEntrypoints(item)
      }
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walkEntrypoints(v)
    }
  }
  walkEntrypoints(entrypoints)
  assert.deepStrictEqual(entrypointOffenders, [],
    'D7: spec/entrypoints.json must name spec/commands/genesis-design.md in no row — a surviving row means the entry-point manifest still documents a call site for a deleted command: ' +
    JSON.stringify(entrypointOffenders))

  const genesisDoctrine = read('spec/doctrine/genesis.md')
  assert.match(genesisDoctrine, /^## Genesis: Design State$/m,
    'D8: spec/doctrine/genesis.md must carry the "## Genesis: Design State" heading — its absence means the ratification variant of the old Phase 4 (tokens ratified not authored, doctrine distilled, the ledgers, base primitives + component vocabulary, the design-rules closure check, the prune) was never landed')

  // D8/.claude/rules/spec-pipeline.md § Gotchas: classify by location (a repo-wide walk),
  // never by name-shape — the same pattern the genesis-explore sweep above uses. Mechanics
  // shared via sweepRetiredLiteral.
  //
  // `citations` replaces the dated-provenance-header trap the same way the genesis-explore
  // sweep's citations do: THIS spec's own filename contains the literal, so every dated header
  // citing it (tests/ provenance comments, the run ledger's plan row) would otherwise redden the
  // sweep permanently. Each is a citation of the record of the kill, never a live pointer at the
  // deleted command.
  const offenders = sweepRetiredLiteral('genesis-design', {
    citations: [
      'specs/20260827/03-genesis-design-state.md',
      '03-genesis-design-state.md',
    ],
    waivedPaths: [
      // this test file's own header/body names the retired literal as the string under test.
      'tests/consistency/genesis-doctrine.test.js',
      // its `description` is the changelog surface; the changelog paragraph names the retired
      // command by design (D11) — a historical record, not a stale reference.
      'spec/.claude-plugin/plugin.json',
      // its header comment states the incident history this spec adds to (the design-lock-to-
      // driver fold) — a dated record of what changed, not a live pointer at the deleted command,
      // the same reason this file is already waived for the genesis-explore sweep above.
      'spec/scripts/genesis-driver.js',
      // D14 waives it by name (specs/20260825/04): a wording edit re-stamps every host repo's
      // grounding as stale, and the contract hash is not paid for a word.
      'spec/templates/grounding-contract.md',
      // AC-20260827-03-6 asserts the hook now IGNORES this exact prompt string, so the literal
      // is the input under test — the same reason this file is already waived for genesis-explore.
      'tests/genesis-gate.test.js',
      // AC-20260827-03-1/-5 assert the driver reaches DESIGN and that the HANDOFF/chain-bullet
      // wording never names the retired command — the literal is the input under test.
      'tests/genesis/design-state.test.js',
    ],
    waivedPrefixes: [
      // dated historical records — a spec that retires a command must keep naming it in its own
      // (and its siblings') spec documents and the roadmap/audit trail.
      'specs/',
      'docs/roadmap/',
      'docs/audit/',
      'docs/adr/',
    ],
  })
  assert.deepStrictEqual(offenders, [],
    'D8: these files outside the waive-list still name the retired `genesis-design` command: ' +
    offenders.join(', ') + ' — one binding home for the command name means every live surface ' +
    '(doctrine, commands, README, marketplace listing, canonical docs) must be swept in the same ' +
    'spec that deletes the command, not left for a later pass to discover')
})

// specs/20260827/04-genesis-conventions-handoff.md D1/D5/D6/D7: spec/doctrine/genesis.md gains
// a "## Genesis: Conventions Probe Suite" heading; spec/commands/genesis.md's chain bullet ends
// at /spec:enforce (greenfield genesis is now init + enforce), retiring its `next`:
// `{kind: 'command', text: '/spec:init'}` literal along with the plain "next: /spec:init"
// wording, since HANDOFF is not terminal; spec/templates/status.json carries a `handoff` key;
// spec/templates/conventions.json is the nine-floor-key starting-point template. This test is
// [no-ac: test-plumbing] for its own file (it adds no new sweep mechanics), but the assertions
// below are this spec's AC-20260827-04-5 coverage.

// ---------------------------------------------------------------------------
// AC-20260827-04-5
// ---------------------------------------------------------------------------
test('AC-20260827-04-5: spec/doctrine/genesis.md carries the Conventions Probe Suite heading, spec/commands/genesis.md\'s chain bullet names /spec:enforce and names neither retired /spec:init literal, spec/templates/status.json carries handoff, and spec/templates/conventions.json parses with the nine floor keys', () => {
  const doctrineSrc = read('spec/doctrine/genesis.md')
  assert.match(doctrineSrc, /^## Genesis: Conventions Probe Suite$/m,
    'D6: spec/doctrine/genesis.md must carry a "## Genesis: Conventions Probe Suite" heading — ' +
    'its absence means the probe-suite/binding-subset invariants this spec introduces have no ' +
    'doctrine home, even though the driver (spec/scripts/genesis-driver.js) already enforces them')

  const cmdSrc = read('spec/commands/genesis.md')
  const chainLine = (cmdSrc.match(/^- Chain:.*$/m) || [])[0]
  assert.ok(chainLine,
    'D5: spec/commands/genesis.md must carry a "- Chain:" bullet naming the commands after ' +
    'genesis — its absence means the doctrine no longer tells the session what comes next')
  assert.match(chainLine, /\/spec:enforce/,
    'D5: the chain bullet must name /spec:enforce — greenfield genesis is now init + enforce, ' +
    'and a chain bullet that stops at /spec:init leaves the session with no printed pointer to ' +
    'the enforcement step this spec adds: ' + JSON.stringify(chainLine))
  assert.doesNotMatch(cmdSrc, /next: \/spec:init/i,
    'D5: spec/commands/genesis.md must not contain the literal "next: /spec:init" (in any case) ' +
    '— the driver\'s own HANDOFF step no longer prints it (D4), and a surviving mention here ' +
    '(including the filled-example\'s "Next: /spec:init") would document a state transition the ' +
    'driver no longer performs')
  assert.ok(!cmdSrc.includes("text: '/spec:init'"),
    'D5: spec/commands/genesis.md must not contain the literal "text: \'/spec:init\'" — the ' +
    'HANDOFF report\'s own `next` slot must point at /spec:enforce now, since HANDOFF stops ' +
    'being the terminal state and stops being the report\'s own close')

  const statusTemplate = JSON.parse(read('spec/templates/status.json'))
  assert.ok(Object.prototype.hasOwnProperty.call(statusTemplate, 'handoff'),
    'D7: spec/templates/status.json must carry the key "handoff" — its absence means a fresh ' +
    'project\'s status.json template has no field for the driver to record ' +
    'handoff.initGenExit/at into, contradicting the Contracts section\'s own status.handoff ' +
    'shape: ' + JSON.stringify(Object.keys(statusTemplate)))

  const conventionsPath = path.join(SPEC, 'templates/conventions.json')
  assert.ok(fs.existsSync(conventionsPath),
    'D1: spec/templates/conventions.json must exist — its absence means the shipped ' +
    'starting-point template this spec introduces was never created: ' + conventionsPath)
  const conventions = JSON.parse(fs.readFileSync(conventionsPath, 'utf8'))
  assert.strictEqual(conventions.schemaVersion, 1,
    'D1: the shipped conventions.json template must carry schemaVersion 1, per the Contracts ' +
    'block\'s own shape: ' + JSON.stringify(conventions.schemaVersion))
  assert.strictEqual(conventions.testTree, 'tests',
    'D1: the shipped conventions.json template must carry testTree "tests", per the Contracts ' +
    'block\'s own worked example: ' + JSON.stringify(conventions.testTree))
  const floorKeys = [
    'error-taxonomy', 'logging', 'naming-identifiers', 'wire-representations',
    'cross-plane-constants', 'env-config', 'ci', 'background-async', 'success-metric',
  ]
  const rowKeys = Array.isArray(conventions.rows) ? conventions.rows.map((r) => r.key) : []
  for (const key of floorKeys) {
    assert.ok(rowKeys.includes(key),
      'D1: the shipped conventions.json template must carry a row for the floor key "' + key +
      '" — its absence means the template does not demonstrate the full nine-key floor this ' +
      'spec requires every genesis project to record: ' + JSON.stringify(rowKeys))
  }
})
