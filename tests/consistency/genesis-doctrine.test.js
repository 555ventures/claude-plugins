'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read, runBash } = require('../helpers')

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
  // (spec/commands/genesis.md) is the greenfield entry point. The banned-literal pin follows the
  // command to its new file in place — never weakened, never dropped.
  for (const rel of ['spec/commands/genesis.md', 'spec/commands/genesis-design.md']) {
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
  const files = [
    'spec/doctrine/genesis.md',
    'spec/commands/genesis.md',
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

// specs/20260825/03-genesis-currency-executed.md (2026-08-25): D8 replaces the model-placement
// paragraph's Haiku-currency sentence in genesis.md with one naming registry-check.js
// (`spec-paths registry-check`) as the mechanism, and D7 wires the same script into all three
// genesis commands' menu steps. AC-20260825-03-9 cannot pass yet — as of 2026-08-26 none of the
// four files name `registry-check`, and genesis.md/genesis-architect.md/genesis-design.md still
// carry `verifyKeys`/`Haiku pass` (grep confirmed at authoring time; TDD red).

// ---------------------------------------------------------------------------
// AC-20260825-03-9
// ---------------------------------------------------------------------------

test('AC-20260825-03-9: genesis.md, genesis-driver.js, and both remaining genesis command files name registry-check, and none of them carry still_current, Haiku pass, Haiku currency, or verifyKeys', () => {
  const banned = [
    [/still_current/, 'still_current'],
    [wordsRe('Haiku pass'), 'Haiku pass'],
    [wordsRe('Haiku currency'), 'Haiku currency'],
    [/verifyKeys/, 'verifyKeys']
  ]
  // specs/20260825/04-genesis-driver.md D4/D13: the architect stage's menu step no longer
  // narrates the registry check — genesis-driver.js RUNS it on `--mark menu-written`. The pin
  // follows the mechanism to its new home in place; the invariant (every file that owns a menu
  // step names the deterministic currency script) is unchanged.
  //
  // specs/20260827/02-genesis-explore-state.md D10 (2026-08-27): spec/commands/genesis-explore.md
  // is deleted — read()ing it here would throw once the file is gone. Dropped from this list in
  // place (its own deletion is pinned separately, in this file's new AC-20260827-02-8 test); the
  // three remaining files still carry the invariant unchanged.
  const files = [
    'spec/doctrine/genesis.md',
    'spec/scripts/genesis-driver.js',
    'spec/commands/genesis-design.md',
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

// specs/20260825/04-genesis-driver.md (2026-08-26): the architect stage becomes driver-stepped.
// `/spec:genesis-architect` is retired and replaced by a thin `spec/commands/genesis.md` looping
// on `spec/scripts/genesis-driver.js`; the ops-conventions ADR paragraph, the day-zero skeleton
// list, and the roadmap decomposition rules move verbatim out of the command into three new
// `spec/doctrine/genesis.md` sections; the `shared-for` section list is rekeyed
// genesis-architect -> genesis. AC-20260825-04-9 is the conformance pin over all of it, plus the
// D15 regression that genesis-explore keeps being served § Design Canon. TDD red at authoring
// time: neither genesis.md (command) nor genesis-driver.js existed.
//
// 2026-08-26 review ruling: the stale-name sweep below used to be a hand-enumerated file list,
// and it was wrong twice on this one rename — it missed tests/ (caught during the build, see
// specs/20260825/04-genesis-driver.deviations.md) and it missed the repo-root
// .claude-plugin/marketplace.json, the public marketplace listing, which was still advertising
// the deleted command as the greenfield entry point until this review caught it. Per this repo's
// own rules § Gotchas, a conformance guard that decides what to inspect by name-shape is a hole
// evadable by the exact thing it guards. The sweep is inverted: walk the whole repo from ROOT and
// read everything, then subtract an explicit, justified waive-list — never enumerate what to
// check.

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

  // D14, inverted 2026-08-26: waived by explicit path (never by name-shape or extension), each
  // entry justified. Re-verify a waived entry's own hit before trusting it — a fix landing
  // concurrently can remove the very mention it waives.
  const waivedPaths = [
    // D14 waives it by name: a wording edit re-stamps every host repo's grounding as stale
    // (rules § Risk Tiers), and the contract hash is not paid for a word.
    'spec/templates/grounding-contract.md',
    // its `description` is the changelog surface; historical entries legitimately record that
    // the command was deleted.
    'spec/.claude-plugin/plugin.json',
    // its header comment states the incident history (the choreography it replaced).
    'spec/scripts/genesis-driver.js',
    // this file's own header/body names the retired literal as the string under test.
    'tests/consistency/genesis-doctrine.test.js',
    // dated incident-header comments recording the rename (Test Rules require those headers).
    'tests/genesis-gate.test.js',
    'tests/genesis/research-menu.test.js',
  ]
  const waivedPrefixes = [
    // dated historical records — a spec that renamed a command must keep naming it.
    'specs/',
    'docs/roadmap/',
    'docs/audit/',
  ]
  function isWaived(rel) {
    return waivedPaths.includes(rel) || waivedPrefixes.some(p => rel.startsWith(p))
  }
  function walk(dir, acc) {
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
    if (fs.readFileSync(abs, 'utf8').includes('genesis-architect')) offenders.push(rel)
  }
  assert.deepStrictEqual(offenders, [],
    'D14: these files outside the waive-list still name the retired `genesis-architect` command: ' +
    offenders.join(', ') + ' — a surviving mention points a reader, or a future session, at a ' +
    'command that no longer exists, which is exactly the stale-reference class the ' +
    'one-binding-home rule exists to prevent. A repo-wide sweep replaces the old hand-enumerated ' +
    'file list because that list missed tests/ and .claude-plugin/marketplace.json on this same ' +
    'rename (rules § Gotchas: classify by location, never by name-shape)')

  // D15 regression pin, retargeted specs/20260827/02-genesis-explore-state.md D10 (2026-08-27):
  // the explore stage is no longer untouched by a later spec — D10 deletes genesis-explore's own
  // `shared-for` map entry outright and folds Design Canon into `genesis` instead (the driver now
  // runs the taste funnel end-to-end from the entry point). AC-20260825-04-9's own sibling-list
  // regression pin is retargeted in place from `genesis-explore` to `genesis`, never weakened;
  // AC-20260827-02-8's own test below pins genesis-explore's NEW fall-through-to-full-doctrine
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

// specs/20260827/01-genesis-tournament.md (2026-08-27): D10 deletes spec/commands/genesis.md's
// own "## Per-state judgment pointers" section — the driver now prints a Doctrine: line per
// state instead (the behavioral half of AC-20260827-01-8, pinned by step-text assertions in
// tests/genesis/tournament.test.js) — and D11 adds spec/doctrine/genesis.md's
// "## Genesis: Tournament of Scaffolds" section. D1 adds the `tournament` key to
// spec/templates/status.json, and D3 introduces spec/templates/finalists.json. None of this can
// pass yet: as of 2026-08-27 genesis.md (command) still carries the pointer section,
// genesis.md (doctrine) has no Tournament of Scaffolds heading, status.json has no `tournament`
// key, and spec/templates/finalists.json does not exist (TDD red).

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

// specs/20260827/02-genesis-explore-state.md (2026-08-27): explore's Round 0 folds into the
// driver as states between MENUS and FINALISTS; `/spec:genesis-explore` and its hook arm are
// deleted, and the name is swept from every live surface. D11 gains this file's own standing
// repo-wide emptiness sweep for the retired literal, on the AC-20260825-04-9 pattern just above
// (same inverted walk-then-waive shape, its own justified waive-list — narrower than
// AC-20260825-04-9's, since fewer files legitimately still need the retired name). None of this
// can pass yet: as of 2026-08-27 spec/commands/genesis-explore.md still exists, spec/entrypoints.json
// still names it in four rows, spec/doctrine/genesis.md still carries "## Genesis: Explore Stage"
// (not "## Genesis: Explore State"), and `spec-paths shared-for genesis` does not yet serve
// § Design Canon (TDD red, grep/run confirmed at authoring time 2026-08-29).

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

  // D11/§ Gotchas: classify by location (a repo-wide walk), never by name-shape — a narrower,
  // hand-enumerated file list is the exact hole a prior incident on this same pattern (the
  // genesis-architect sweep above) was built to close. Waived by explicit path/prefix, each
  // entry justified; re-verify a waived entry's own hit before trusting it (a concurrent fix
  // can remove the very mention it waives).
  const waivedPaths = [
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
    // append-only run ledger: /spec:plan's own lock-stage row for THIS spec records its path
    // verbatim (verified 2026-08-29: `{"stage":"plan","spec":"specs/20260827/02-genesis-explore-
    // state.md",...,"verdict":"locked"}`, committed 2026-08-27) — a dated historical record of
    // the same kind `specs/` itself is, never a live pointer at the deleted command. Ledger rows
    // are never rewritten, so omitting this waiver would make this sweep permanently red.
    '.claude/spec-runs.jsonl',
    // "the three sibling specs' dated headers in tests/": THIS spec's own filename
    // (specs/20260827/02-genesis-explore-state.md) is the one of the three (01-genesis-
    // tournament.md, 02-genesis-explore-state.md, 03-genesis-design-state.md) whose filename
    // contains the literal substring "genesis-explore" — every test file below carries only a
    // dated header comment citing that filename as provenance (never a live pointer at the
    // deleted /spec:genesis-explore command); each is also this file's own File Plan sibling row
    // (verified empirically 2026-08-29 via a standalone repo walk — omitting any of these six
    // would make this sweep permanently red once the rest of the spec lands, since dated header
    // citations are never retroactively edited):
    'tests/genesis-gate.test.js',
    'tests/consistency/red-fixture-coverage.test.js',
    'tests/genesis/genesis-driver.test.js',
    'tests/genesis/tournament.test.js',
    'tests/genesis/explore-states.test.js',
    'tests/spec-paths.test.js',
  ]
  const waivedPrefixes = [
    // driver-written retained review evidence: spec-review-driver.js writes one
    // .claude/spec-runs/<runId>.json per review pass recording the spec path verbatim, and
    // never rewrites it — the same dated-record class as .claude/spec-runs.jsonl above, and
    // structurally incapable of being a live pointer at the deleted command (it is a machine
    // artifact keyed by run id, read by the fleet reader, never by a human looking for a command).
    '.claude/spec-runs/',
    // dated historical records — a spec that retires a command must keep naming it in its own
    // (and its siblings') spec documents and the roadmap/audit trail.
    'specs/',
    'docs/roadmap/',
    'docs/audit/',
    'docs/adr/',
  ]
  function isWaived(rel) {
    return waivedPaths.includes(rel) || waivedPrefixes.some((p) => rel.startsWith(p))
  }
  function walk(dir, acc) {
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
    if (fs.readFileSync(abs, 'utf8').includes('genesis-explore')) offenders.push(rel)
  }
  assert.deepStrictEqual(offenders, [],
    'D11: these files outside the waive-list still name the retired `genesis-explore` command: ' +
    offenders.join(', ') + ' — one binding home for the command name means every live surface ' +
    '(doctrine, commands, README, marketplace listing, canonical docs) must be swept in the same ' +
    'spec that deletes the command, not left for a later pass to discover')
})
