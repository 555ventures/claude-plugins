'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, SPEC } = require('../helpers')

// specs/20260926/02-the-design-contract-is-code.md D2/D3: spec/scripts/design-contract-check.js
// is the presence oracle for a host's design contract (kit/tokens/rules) — this file owns
// AC-20260926-02-1 through AC-20260926-02-6 and AC-20260926-02-10.

const SCRIPT = 'scripts/design-contract-check.js'

const FULL_RULES = `---
paths:
  - "src/components/**"
---
# Design rules

## Intent to pattern

| Intent | Pattern | Composite |
|--------|---------|-----------|
| edit one record | side sheet | RecordEditSheet |
| confirm destructive | modal | DestructiveConfirmDialog |

## Naming

### code
| Kind | Convention | Example |
|------|------------|---------|
| component | PascalCase noun | RecordEditSheet |

### schema
| Kind | Convention | Example |
|------|------------|---------|
| table | snake_case plural | salon_clients |

### routes
| Kind | Convention | Example |
|------|------------|---------|
| path segment | kebab-case plural | /salon-clients/:id |

### wire
| Kind | Convention | Example |
|------|------------|---------|
| JSON key | camelCase | createdAt |
`

// Builds a synthetic host tree. Each of config/rules/kitFiles/tokens defaults to a fully
// conforming value when omitted (undefined), is skipped entirely when explicitly `null`, and is
// written verbatim otherwise — so each AC only has to spell the one thing it deliberately breaks.
function writeHost(dir, { config, rules, kitFiles, tokens } = {}) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config === undefined
    ? { design: { kit: 'src/kit', tokens: 'src/tokens.css', rules: '.claude/rules/design.md' } }
    : config, null, 2))

  if (rules !== null) {
    fs.mkdirSync(path.join(dir, '.claude/rules'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude/rules/design.md'), rules === undefined ? FULL_RULES : rules)
  }

  if (kitFiles !== null) {
    fs.mkdirSync(path.join(dir, 'src/kit'), { recursive: true })
    const files = kitFiles === undefined
      ? {
          'record-edit-sheet.tsx': 'export function RecordEditSheet() { return null }\n',
          'index.ts': 'export function DestructiveConfirmDialog() { return null }\n',
        }
      : kitFiles
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, 'src/kit', name), content)
    }
  }

  if (tokens !== null) {
    fs.writeFileSync(path.join(dir, 'src/tokens.css'), tokens === undefined ? '@theme {}\n' : tokens)
  }
}

function runCheck(dir, extraArgs = []) {
  return runNode(SCRIPT, ['--root', dir, '--json', ...extraArgs])
}

test('AC-20260926-02-1: WHEN a synthetic host has all three design paths, both intent-to-pattern rows, all four naming subsections, and both composites present THE SYSTEM SHALL exit 0 with stdout parsing to {ok:true, findings:[]}', () => {
  const dir = tmpdir('design-contract-ac1')
  writeHost(dir, {})
  const r = runCheck(dir)
  assert.strictEqual(r.status, 0,
    'a fully-conforming design contract must exit 0 — a false positive here would block every host that has already done everything the check asks for: ' + r.stderr + r.stdout)
  let out
  try {
    out = JSON.parse(r.stdout)
  } catch {
    assert.fail('--json must print parseable JSON on a clean host, or no caller can branch on `ok`: ' + JSON.stringify(r.stdout))
  }
  assert.deepStrictEqual(out, { ok: true, findings: [] },
    'a fully-conforming host must report ok:true with an empty findings array — any finding here means the check is inventing a defect against a host that has every table row, naming section, and composite it demands: ' + JSON.stringify(out))
})

test('AC-20260926-02-2: WHEN the host lacks any file or export naming DestructiveConfirmDialog under src/kit THE SYSTEM SHALL exit 1 with exactly one composite-missing finding whose remedy names DestructiveConfirmDialog and src/kit', () => {
  const dir = tmpdir('design-contract-ac2')
  writeHost(dir, {
    kitFiles: { 'record-edit-sheet.tsx': 'export function RecordEditSheet() { return null }\n' },
  })
  const r = runCheck(dir)
  assert.strictEqual(r.status, 1,
    'a missing composite must exit 1 — a 0 here means a host can ship an intent row with no matching component and never find out: ' + r.stderr + r.stdout)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.findings.length, 1,
    'exactly one finding is expected — RecordEditSheet is present and every other path is valid, so a second finding means the check is reporting a defect that does not exist: ' + JSON.stringify(out.findings))
  const [finding] = out.findings
  assert.strictEqual(finding.kind, 'composite-missing', 'the one finding must be composite-missing: ' + JSON.stringify(finding))
  assert.strictEqual(finding.intent, 'confirm destructive', 'the finding must carry the intent row the missing composite belongs to: ' + JSON.stringify(finding))
  assert.strictEqual(finding.composite, 'DestructiveConfirmDialog', 'the finding must name the exact missing composite: ' + JSON.stringify(finding))
  assert.strictEqual(finding.path, 'src/kit', 'the finding must name the kit directory that was searched: ' + JSON.stringify(finding))
  assert.match(finding.remedy, /DestructiveConfirmDialog/,
    'the remedy must name the missing composite, or a session reading it has no idea what to author: ' + JSON.stringify(finding))
  assert.match(finding.remedy, /src\/kit/,
    'the remedy must name the kit directory, or a session reading it has no idea where to put the new file: ' + JSON.stringify(finding))
})

test('AC-20260926-02-3: WHEN the rules file has ## Naming with ### code, ### routes, ### wire but no ### schema THE SYSTEM SHALL exit 1 with a naming-section-missing finding for layer schema and no other naming-section-missing finding', () => {
  const dir = tmpdir('design-contract-ac3')
  const rulesNoSchema = FULL_RULES.replace(
    '### schema\n| Kind | Convention | Example |\n|------|------------|---------|\n| table | snake_case plural | salon_clients |\n\n',
    '')
  assert.notStrictEqual(rulesNoSchema, FULL_RULES, 'the fixture edit must actually remove the ### schema subsection, or this test proves nothing')
  writeHost(dir, { rules: rulesNoSchema })
  const r = runCheck(dir)
  assert.strictEqual(r.status, 1,
    'a missing ### schema naming subsection must exit 1 — a host with three of four naming layers documented is still an incomplete contract: ' + r.stderr + r.stdout)
  const out = JSON.parse(r.stdout)
  const namingMissing = out.findings.filter(f => f.kind === 'naming-section-missing')
  assert.strictEqual(namingMissing.length, 1,
    'exactly one naming-section-missing finding is expected — code, routes and wire are all present, so a second finding means the check is flagging a layer that is actually there: ' + JSON.stringify(out.findings))
  assert.strictEqual(namingMissing[0].layer, 'schema', 'the one finding must name the missing layer as schema, not another layer: ' + JSON.stringify(namingMissing[0]))
  assert.strictEqual(namingMissing[0].path, '.claude/rules/design.md', 'the finding must name the rules file the missing section belongs to: ' + JSON.stringify(namingMissing[0]))
})

test('AC-20260926-02-4: WHEN the host config has no design key THE SYSTEM SHALL exit 0 with {ok:true, findings:[], skipped:"no-design-block"} and print "skipped: no design block" in the human render', () => {
  const dir = tmpdir('design-contract-ac4')
  writeHost(dir, { config: {} })
  const r = runCheck(dir)
  assert.strictEqual(r.status, 0,
    'a host with no design block must exit 0 — a host with no UI stack must never be blocked by a check meant only for hosts that opted in: ' + r.stderr + r.stdout)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out, { ok: true, findings: [], skipped: 'no-design-block' },
    'the --json shape for a design-less host must be exactly this literal — a caller branching on `skipped` would otherwise see an inconsistent shape: ' + JSON.stringify(out))

  const human = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(human.status, 0, 'the human-render invocation must also exit 0 on a design-less host: ' + human.stderr + human.stdout)
  assert.match(human.stdout, /skipped: no design block/,
    'the human render must print "skipped: no design block" in plain words — a session reading /spec:doctor\'s output otherwise has no idea why check 8 reported nothing: ' + human.stdout)
})

test('AC-20260926-02-5: WHEN design.tokens and design.kit both name paths that do not exist THE SYSTEM SHALL exit 1 with tokens-missing and kit-missing findings and no composite-missing finding', () => {
  const dir = tmpdir('design-contract-ac5')
  writeHost(dir, { rules: FULL_RULES, kitFiles: null, tokens: null })
  const r = runCheck(dir)
  assert.strictEqual(r.status, 1,
    'a host missing both its tokens file and its kit directory must exit 1: ' + r.stderr + r.stdout)
  const out = JSON.parse(r.stdout)
  const kinds = out.findings.map(f => f.kind).sort()
  assert.deepStrictEqual(kinds, ['kit-missing', 'tokens-missing'],
    'exactly tokens-missing and kit-missing are expected, with no composite-missing — the kit directory does not exist at all, so there is nothing to walk for composites: ' + JSON.stringify(out.findings))
  const tokensFinding = out.findings.find(f => f.kind === 'tokens-missing')
  assert.strictEqual(tokensFinding.path, 'src/tokens.css', 'the tokens-missing finding must name the configured tokens path: ' + JSON.stringify(tokensFinding))
  const kitFinding = out.findings.find(f => f.kind === 'kit-missing')
  assert.strictEqual(kitFinding.path, 'src/kit', 'the kit-missing finding must name the configured kit path: ' + JSON.stringify(kitFinding))
})

test('AC-20260926-02-6: WHEN the script runs with no --root THE SYSTEM SHALL exit 2 and print a usage line on stderr containing --root <dir> and [--json]', () => {
  const r = runNode(SCRIPT, [])
  assert.strictEqual(r.status, 2,
    'a missing --root is a usage error and must exit 2, distinct from the 0/1 exits that carry findings — a caller cannot tell "no host given" from "clean host" otherwise: ' + r.stderr + r.stdout)
  assert.match(r.stderr, /--root <dir>/,
    'the usage line must name --root <dir> so a caller who forgot the flag can fix the invocation: ' + r.stderr)
  assert.match(r.stderr, /\[--json\]/,
    'the usage line must name [--json] as the optional machine-output flag: ' + r.stderr)
})

test('AC-20260926-02-10: WHEN a host is seeded by copying spec/templates/design-rules.md unchanged, with an existing empty kit directory and an existing empty tokens file THE SYSTEM SHALL exit 1 with exactly five table-empty findings (the intent table plus the four naming layers) and no table-missing or naming-section-missing finding', () => {
  const templatePath = path.join(SPEC, 'templates/design-rules.md')
  assert.ok(fs.existsSync(templatePath),
    'spec/templates/design-rules.md must exist for this pin to mean anything — D4 seeds it as the empty-tables template /spec:init copies onto a brownfield host that has no rules file yet')
  const seedContent = fs.readFileSync(templatePath, 'utf8')

  const dir = tmpdir('design-contract-ac10')
  fs.mkdirSync(path.join(dir, '.claude/rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/rules/design.md'), seedContent)
  fs.mkdirSync(path.join(dir, 'src/kit'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/tokens.css'), '')
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    design: { kit: 'src/kit', tokens: 'src/tokens.css', rules: '.claude/rules/design.md' },
  }))

  const r = runCheck(dir)
  assert.strictEqual(r.status, 1,
    'a seeded-but-never-filled-in rules file must exit 1 — an empty template is a visible gap, never a silent pass: ' + r.stderr + r.stdout)
  const out = JSON.parse(r.stdout)
  const kinds = out.findings.map(f => f.kind).sort()
  assert.deepStrictEqual(kinds, ['table-empty', 'table-empty', 'table-empty', 'table-empty', 'table-empty'],
    'exactly five table-empty findings are expected — one for the intent table and one per naming layer (code, schema, routes, wire) — any other count means empty tables are silently tolerated, double-counted, or misclassified: ' + JSON.stringify(out.findings))
  assert.ok(out.findings.every(f => f.kind !== 'table-missing' && f.kind !== 'naming-section-missing'),
    'the seeded template carries every heading and table, only empty — a table-missing or naming-section-missing finding here means the check cannot tell "absent" from "present but empty": ' + JSON.stringify(out.findings))
})
