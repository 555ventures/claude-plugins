'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, tmpdir } = require('../helpers')

// specs/20260815/01-recurrence-carriers.md (2026-08-15, D5/D7): `readConfigStrict(root)` is the
// fail-loud sibling of the swallow-to-{} `readConfig`, needed by strict callers that structurally
// cannot degrade to {}. AC-20260815-01-10 pins its throw contract and its verbatim (no coercion)
// return; AC-20260815-01-11 pins `readConfig`'s untouched swallow-to-{} regression.
//
// specs/20260820/08-config-name-ban.md (2026-08-20, D1): SUPERSEDES the locked ruling
// `d10-predicate-v1` — its four-clause read-detection predicate and its display-join exemption
// regex are DELETED, not amended: "does this line READ the config?" is undecidable from one line
// of text. The replacement bans NAMING the config instead — a line is an offender when it
// contains the literal stem `spec.config` outside a comment (`//`, or `#` NOT immediately
// followed by an identifier character — `*`, `/*`, and a trailing `//` are NOT prose, since all
// three begin or carry executable JavaScript). The walk covers every file under spec/scripts/ at
// any depth with no extension/name-shape filter, skipping exactly three literal exempt paths.
// Accepted residual evasions: a literal split across the stem itself (e.g. `'spec'+'.config.json'`),
// an encoded or computed filename, and readdir-based discovery. No AST checker — zero-dependency.

function writeConfig(dir, content) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), content)
}

test('AC-20260815-01-10: readConfigStrict(root) throws an Error naming the config path and "cannot read/parse" when the config is absent, occupied by a directory, or unparsable JSON', () => {
  const { readConfigStrict } = require('../../spec/scripts/lib/host-config')

  const absentDir = tmpdir('host-config-absent')
  assert.throws(() => readConfigStrict(absentDir),
    err => err instanceof Error && err.message.includes('cannot read/parse') &&
      err.message.includes(path.join(absentDir, '.claude', 'spec.config.json')),
    'readConfigStrict must throw naming the config path and "cannot read/parse" when the config ' +
    'file is absent — a strict caller (ci-gate-parity.js, spec-design-driver.js) relies on this ' +
    'exact message text to compose its own remedy suffix without re-wrapping (D6)')

  const dirAsFileDir = tmpdir('host-config-dirasfile')
  fs.mkdirSync(path.join(dirAsFileDir, '.claude', 'spec.config.json'), { recursive: true })
  assert.throws(() => readConfigStrict(dirAsFileDir),
    err => err instanceof Error && err.message.includes('cannot read/parse'),
    'readConfigStrict must throw "cannot read/parse" when the config path is occupied by a ' +
    'directory (an unreadable read) — silently swallowing this and returning {} would make a ' +
    'strict caller believe the host has no config at all rather than a broken one')

  const garbageDir = tmpdir('host-config-garbage')
  writeConfig(garbageDir, '{ this is not valid json')
  assert.throws(() => readConfigStrict(garbageDir),
    err => err instanceof Error && err.message.includes('cannot read/parse'),
    'readConfigStrict must throw "cannot read/parse" when the config file exists but fails to ' +
    'parse as JSON — a strict caller must fail loud here instead of degrading to {}')
})

test('AC-20260815-01-10: readConfigStrict(root) returns a successful parse verbatim with no shape coercion, including non-object scalars and null', () => {
  const { readConfigStrict } = require('../../spec/scripts/lib/host-config')

  const objDir = tmpdir('host-config-obj')
  writeConfig(objDir, JSON.stringify({ gateCommand: 'true' }))
  assert.deepStrictEqual(readConfigStrict(objDir), { gateCommand: 'true' },
    'readConfigStrict must round-trip a valid object config verbatim — every existing caller\'s ' +
    'own shape guard (e.g. typeof config.gateCommand === "string") owns validation, so the lib ' +
    'must not pre-filter or coerce the object it hands back')

  const scalarDir = tmpdir('host-config-scalar')
  writeConfig(scalarDir, '3')
  assert.strictEqual(readConfigStrict(scalarDir), 3,
    'readConfigStrict must return the bare number 3 (no non-object throw, no coercion to {}) — ' +
    'a coercing implementation would silently flip ci-gate-parity.js\'s locked exit-0 ' +
    '"inapplicable — no gateCommand" degrade on a scalar config into an exit-2 crash (the exact ' +
    'adversarial finding D5 folds)')

  const nullDir = tmpdir('host-config-null')
  writeConfig(nullDir, 'null')
  assert.strictEqual(readConfigStrict(nullDir), null,
    'readConfigStrict must return the parsed value null verbatim rather than throwing or ' +
    'substituting {} — the contract is "no non-object throw", and null is valid JSON that parses ' +
    'successfully')
})

test('AC-20260815-01-11: readConfig(root) continues to return {} without throwing when the config is absent or unparsable (regression pin, declared green pre-change by the spec)', () => {
  const { readConfig } = require('../../spec/scripts/lib/host-config')

  const absentDir = tmpdir('host-config-degrade-absent')
  assert.deepStrictEqual(readConfig(absentDir), {},
    'readConfig must continue to degrade to {} when the config is absent — every existing ' +
    'caller (glob-match.js, the CI scripts, design-atlas.js) relies on this swallow-to-{} ' +
    'contract staying byte-identical; D5 adds readConfigStrict alongside it, it does not touch ' +
    'this function')

  const garbageDir = tmpdir('host-config-degrade-garbage')
  writeConfig(garbageDir, '{ not json')
  assert.deepStrictEqual(readConfig(garbageDir), {},
    'readConfig must continue to degrade to {} on unparsable JSON without throwing — a throw ' +
    'here would break every caller that depends on the current swallow-to-{} degrade path')
})

// D2/D3/D4/D5's replacement predicate and walk, per the Contracts block — kept local to the test
// (there is no separate closure script — the walk IS the pin) rather than imported, so this test
// exercises the predicate as specified, not an implementation's restatement of it. Root is a
// PARAMETER, never a constant, so the canary below exercises this exact walk against a synthetic
// tree rather than only the predicate function (D11).
const CONFIG_STEM = 'spec.config' // the stem, not the full filename (D2)

const EXEMPT = [ // literal relative paths; never a pattern (D5)
  path.join('lib', 'host-config.js'), // the sole Node reader
  'smoke.sh', // reads via jq; bash cannot require() the lib
  'spec-state-gate.sh', // same; session hook, untouched by D6
]

function offendingLine(line) {
  if (!line.includes(CONFIG_STEM)) return false // clause 1
  const t = line.trim()
  if (t.startsWith('//')) return false // clause 2a — JS/prose comment
  if (t.startsWith('#') && !/[A-Za-z0-9_$]/.test(t[1] || ''))
    return false // clause 2b — shell comment or shebang, never a `#field` private class member
  return true // clause 3
}

function scanConfigReadOffenders(scriptsRoot) {
  const offenders = []
  ;(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      const rel = path.relative(scriptsRoot, full).split(path.sep).join('/')
      if (EXEMPT.includes(rel)) continue
      let lines
      try {
        lines = fs.readFileSync(full, 'utf8').split('\n')
      } catch {
        offenders.push(rel + ':read-error')
        continue
      }
      lines.forEach((line, i) => {
        if (offendingLine(line)) offenders.push(rel + ':' + (i + 1))
      })
    }
  })(scriptsRoot)
  return offenders
}

test('AC-20260820-08-1: offendingLine flags any line naming the config stem regardless of readFileSync or path.join co-occurring on the line, and clears a line built only from an already-hoisted identifier', () => {
  assert.strictEqual(offendingLine("const CONFIG_NAME = 'spec.config.json'"), true,
    'a hoisted constant naming the config is an offender even with no readFileSync or path.join on the same line — requiring their co-occurrence is exactly the clause that let this evasion pass under d10-predicate-v1')
  assert.strictEqual(offendingLine("const p = path.join(root, '.claude', CONFIG_NAME)"), false,
    'a line that builds a path from an already-hoisted identifier never spells the filename itself, so it must stay green — flagging it would make every legitimate use of a config-holding variable an offender')
})

test('AC-20260820-08-2: a line naming the config stem in executable text is an offender even when it also carries a trailing // comment', () => {
  assert.strictEqual(offendingLine("const p = root + '//.claude/spec.config.json' // presence probe"), true,
    'a trailing-comment exemption would reopen the hole this predicate closes: the // here sits inside a string built by live code, not before it, so exempting any line containing // anywhere would launder this exact evasion as green')
})

test('AC-20260820-08-3: the walk inspects every file under scriptsRoot regardless of extension, name shape, or the absence of an extension', () => {
  const root = tmpdir('config-read-noext')
  fs.writeFileSync(path.join(root, 'probe.py'), "cfg = 'spec.config.json'\n")
  fs.writeFileSync(path.join(root, 'probe'), "cfg = 'spec.config.json'\n")
  fs.writeFileSync(path.join(root, 'README.md'), 'mentions spec.config.json in prose\n')
  const offenders = scanConfigReadOffenders(root).sort()
  assert.deepStrictEqual(offenders, ['README.md:1', 'probe.py:1', 'probe:1'],
    'a .py file, an extensionless file, and a .md file must all be scanned and reported when they name the config in non-comment text — a name-shape or extension filter is the exact hole the entry-point conformance guard was evaded through in this repo (specs/20260820/04), and this walk must not repeat it')
})

test('AC-20260820-08-4: the sweep skips exactly the three literal exempt paths lib/host-config.js, smoke.sh, spec-state-gate.sh — and no other path, so a similarly-named file like lib/host-config-helper.js is still reported', () => {
  assert.deepStrictEqual(EXEMPT, [path.join('lib', 'host-config.js'), 'smoke.sh', 'spec-state-gate.sh'],
    'the exempt list must be exactly these three literal relative paths — a silent fourth entry, or a renamed/removed one, reopens or narrows the ban without a reviewed diff, which is the entire point of a closed literal list instead of a pattern')

  const root = tmpdir('config-read-exempt')
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(root, 'lib', 'host-config.js'),
    "fs.readFileSync(path.join(root, '.claude', 'spec.config.json'))\n")
  fs.writeFileSync(path.join(root, 'lib', 'host-config-helper.js'), "const NAME = 'spec.config.json'\n")
  fs.writeFileSync(path.join(root, 'smoke.sh'), 'jq -r ".gateCommand" ".claude/spec.config.json"\n')
  fs.writeFileSync(path.join(root, 'spec-state-gate.sh'), 'jq -r ".gateCommand" ".claude/spec.config.json"\n')

  const offenders = scanConfigReadOffenders(root).sort()
  assert.deepStrictEqual(offenders, ['lib/host-config-helper.js:1'],
    'lib/host-config.js, smoke.sh, and spec-state-gate.sh must be skipped (their real or jq reads are the sanctioned routes), but lib/host-config-helper.js is not on the exempt list and must be reported even though its name is similar — an exempt-by-similar-name walk is exactly the extension-filter-shaped hole this predicate replaces')
})

test('AC-20260820-08-15: offendingLine treats *, /*, and a bare identifier-following # as live code — never as a comment prefix — while a legacy #-with-space and a shebang comment stay green', () => {
  assert.strictEqual(offendingLine("#cfg = fs.readFileSync('.claude/spec.config.json', 'utf8')"), true,
    'a private class field spells the filename in executable text; the trimmed line starts with # immediately followed by an identifier character (c), so it must not be treated as a shell comment')
  assert.strictEqual(offendingLine("*readCfg () { return fs.readFileSync('.claude/spec.config.json') }"), true,
    'a generator method signature is live code, not prose — * was never a sanctioned comment prefix and must not be treated as one')
  assert.strictEqual(offendingLine("/* */ const raw = fs.readFileSync('.claude/spec.config.json')"), true,
    'a same-line-closed block comment followed by live code reading the config is an offender — the code after /* */ still executes')
  assert.strictEqual(offendingLine('# CONFIG=".claude/spec.config.json" (legacy)'), false,
    'a shell comment with a space after # (no identifier character) must stay green — this is the one shape the identifier test is designed to admit')
  assert.strictEqual(offendingLine('#!/usr/bin/env bash  # reads .claude/spec.config.json'), false,
    'a shebang line carrying a trailing shell comment mentioning the config must stay green — # immediately followed by ! is not an identifier character')
})

test('AC-20260820-08-16: offendingLine flags a line that splits the filename after the stem, e.g. string concatenation', () => {
  assert.strictEqual(offendingLine("const n = 'spec.config.' + 'json'"), true,
    'splitting the filename after the stem still spells the full stem `spec.config` in one literal on this line — only a split BEFORE the stem is an accepted residual gap (D12), and this predicate must not treat the two as equivalent')
})

test('AC-20260820-08-7: this test file contains no trace of the retired display-join-exemption identifier and no clause conditioned on the literal readFileSync or path.join', () => {
  const src = read('tests/host-config/config-read.test.js')
  // Built from fragments, never spelled as one contiguous token, so this pin's own source text
  // (including this explanatory comment) can never self-match the identifier it forbids.
  const retiredIdentifier = ['DISPLAY', 'JOIN', 'EXEMPT'].join('_')
  assert.doesNotMatch(src, new RegExp(retiredIdentifier),
    'the retired display-join exemption regex constant was deleted by D1, not amended — its reappearance means the superseded ruling d10-predicate-v1 crept back into this file')
  assert.doesNotMatch(src, /includes\(['"]readFileSync['"]\)/,
    'the predicate must not condition offender status on the literal string "readFileSync" appearing on the line — that co-occurrence requirement is exactly what let a hoisted-constant read stay green under the superseded predicate')
  assert.doesNotMatch(src, /includes\(['"]path\.join['"]\)/,
    'the predicate must not condition offender status on the literal string "path.join" appearing on the line — that co-occurrence requirement, plus its display-join carve-out, is exactly what the superseded predicate leaned on')
})

test('AC-20260820-08-13: this file\'s header states the three accepted residual evasions and that no AST checker is used', () => {
  const src = read('tests/host-config/config-read.test.js')
  const header = src.slice(0, src.indexOf('function writeConfig'))
  assert.match(header, /split across the stem itself/,
    'the header must name a literal split across the stem itself as an accepted residual evasion — pretending this gap is closed would mislead the next reader into treating a broken predicate as complete')
  assert.match(header, /encoded or computed filename/,
    'the header must name an encoded or computed filename as an accepted residual evasion')
  assert.match(header, /readdir-based discovery/,
    'the header must name readdir-based discovery as an accepted residual evasion')
  assert.match(header, /No AST checker/,
    'the header must state that no AST checker is used, so a future reader does not assume this predicate parses source rather than pattern-matching lines')
})

test('AC-20260820-08-10 / AC-20260820-08-11: an end-to-end canary over a synthetic tree exercises the walk, the predicate, and the exemption together, reporting exactly the three evasions at any depth', () => {
  const root = tmpdir('config-read-canary')
  fs.writeFileSync(path.join(root, 'hoist.js'),
    '// unrelated comment\n// another comment\n' + "const CONFIG_NAME = 'spec.config.json'\n")
  fs.writeFileSync(path.join(root, 'probe.sh'),
    '#!/usr/bin/env bash\n' + 'jq -r \'.gateCommand\' ".claude/spec.config.json"\n')
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(root, 'lib', 'host-config.js'),
    "const fs = require('fs')\nconst path = require('path')\n" +
    "fs.readFileSync(path.join(root, '.claude', 'spec.config.json'))\n")
  fs.writeFileSync(path.join(root, 'prose.js'), '// reads .claude/spec.config.json\n')
  fs.mkdirSync(path.join(root, 'nested', 'deep'), { recursive: true })
  fs.writeFileSync(path.join(root, 'nested', 'deep', 'evade.js'), "const N = 'spec.config.json'\n")

  const offenders = scanConfigReadOffenders(root).sort()
  assert.deepStrictEqual(offenders, ['hoist.js:3', 'nested/deep/evade.js:1', 'probe.sh:2'],
    'the canary must catch the hoisted-constant .js evasion, the two-levels-deep evasion, and the jq .sh evasion, while skipping the exempt lib/host-config.js read and the //-comment-only prose mention — a fixture-string test alone exercises only the predicate and would miss a walk that stopped recursing, or a name-shape filter reappearing in the walk or the exemption (D11)')
})

test('Behavior: scanConfigReadOffenders reports a file it cannot read as `<path>:read-error` rather than skipping it silently', () => {
  const isRoot = !!(process.getuid && process.getuid() === 0)
  if (isRoot) return // chmod cannot block a root-owned process from reading; this pin cannot distinguish the fix from the bug under root, so it is skipped rather than asserting a false pass

  const root = tmpdir('config-read-unreadable')
  const target = path.join(root, 'locked.js')
  fs.writeFileSync(target, "const N = 'spec.config.json'\n")
  fs.chmodSync(target, 0o000)
  try {
    const offenders = scanConfigReadOffenders(root)
    assert.deepStrictEqual(offenders, ['locked.js:read-error'],
      'an unreadable file under the guarded directory must be reported as an offender-shaped read-error, never silently skipped — a file the walk cannot inspect is exactly the uninspected-surface failure mode this guard\'s entire defect history is made of')
  } finally {
    fs.chmodSync(target, 0o644)
  }
})

test('production pin: scanConfigReadOffenders(spec/scripts/) returns no offenders on the real tree, so every private mention of the config filename in this repo already routes through the sanctioned exemption or the library', () => {
  const offenders = scanConfigReadOffenders(path.join(ROOT, 'spec', 'scripts'))
  assert.deepStrictEqual(offenders, [],
    'a non-empty result here means a live script under spec/scripts/ names the config outside the three exempt paths and outside a comment — the migration sites this spec fixes must all interpolate CONFIG_RELPATH or route through configPath/configExists instead of spelling the filename; offending file:line(s): ' + offenders.join(', '))
})
