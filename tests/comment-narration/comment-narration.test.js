'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash, gitRepo, read, ROOT } = require('../helpers')

// Behavioral pins for spec/scripts/comment-narration.js — the plugin scan, the ratchet
// baseline, the code-identical oracle, the rules-mode scan, and the spec-paths/entrypoints
// wiring. Owner: specs/20260902/01-comment-narration-gate.md, AC-20260902-01-1 through
// AC-20260902-01-12.
//
// This file does not exercise the live repository tree or its tracked baseline — that
// standing coverage lives in tests/consistency/comment-narration-live.test.js. Every
// synthetic fixture below embeds its narration tokens as quoted string data on lines that do
// not themselves start with `//` or `#`, so this file's own source stays clean of the six
// classes it exists to pin.

const SCRIPT = 'scripts/comment-narration.js'

function writeTree(root, files) {
  for (const [rel, lines] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    const content = Array.isArray(lines) ? lines.join('\n') + '\n' : lines
    fs.writeFileSync(full, content)
  }
}

function baseRepo(dir, files) {
  const g = gitRepo(dir)
  writeTree(dir, files)
  g('add', '-A')
  g('commit', '-q', '-m', 'seed')
  return { g, base: g('rev-parse', 'HEAD').trim() }
}

test('AC-20260902-01-1: a whole-line comment matching a class exits 1 and prints the file:line, class list, and trimmed text, both human and --json', () => {
  const root = tmpdir('cn-ac1')
  writeTree(root, {
    'spec/scripts/x.js': [
      'const a = 1',
      'const b = 2',
      'const c = 3',
      '// 2026-09-02 fix: previously crashed'
    ]
  })

  const r = runNode(SCRIPT, ['--root', root])
  assert.strictEqual(r.status, 1,
    'a narrated comment line must fail the scan (exit 1), never pass silently: ' + r.stderr)
  assert.ok(r.stdout.includes('spec/scripts/x.js:4 [date,prior] // 2026-09-02 fix: previously crashed'),
    'the finding line must name the file, line 4, both classes in order, and the trimmed comment text — without it the sweep worker has nothing to act on: ' + r.stdout)
  assert.ok(r.stdout.includes('1 findings in 1 files'),
    'the summary line must total 1 finding across 1 file: ' + r.stdout)

  const rj = runNode(SCRIPT, ['--root', root, '--json'])
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(rj.stdout) },
    '--json must print exactly one parseable JSON object: ' + rj.stdout)
  assert.strictEqual(parsed.total, 1, 'the JSON total must match the human count: ' + JSON.stringify(parsed))
  assert.deepStrictEqual(parsed.files, { 'spec/scripts/x.js': 1 },
    'the JSON files map must key the finding under its repo-relative path: ' + JSON.stringify(parsed))
})

test('AC-20260902-01-2: a clean tree exits 0, and a trailing // or a proper D11-shaped header comment reports nothing', () => {
  const root = tmpdir('cn-ac2')
  writeTree(root, {
    'spec/scripts/clean1.js': ['const cap = 15 // 2026-09-02'],
    'spec/scripts/clean2.js': ['// x.js — usage; specs/20260902/01-comment-narration-gate.md D1; Exit codes: 0 ok']
  })

  const r = runNode(SCRIPT, ['--root', root])
  assert.strictEqual(r.status, 0,
    'a code line with a trailing comment is not a whole-line comment (D3) and a proper header line carries no narration class — either firing here is a false positive: ' + r.stderr)
  assert.ok(r.stdout.includes('0 findings in 2 files'),
    'the summary must report 0 findings across the 2 scanned files: ' + r.stdout)
})

test('AC-20260902-01-2: the plugin scan follows a symlink that resolves to a regular file as its own scanned entry and skips a symlink whose target is missing', () => {
  const root = tmpdir('cn-ac2-symlink')
  writeTree(root, {
    'spec/scripts/noext.js': ['// 2026-01-01 previously crashed']
  })
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.symlinkSync(path.join(root, 'spec/scripts/noext.js'), path.join(root, 'scripts/linked.js'))
  fs.symlinkSync(path.join(root, 'scripts/does-not-exist.js'), path.join(root, 'scripts/dangling.js'))

  const r = runNode(SCRIPT, ['--root', root, '--json'])
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout) },
    '--json must print exactly one parseable JSON object even with a symlinked entry in the walk: ' + r.stdout)
  assert.strictEqual(r.status, 1,
    'a narrated comment line reached only through a symlink must still fail the scan (exit 1), or the walk is silently blind to symlinked files: ' + r.stderr)
  assert.deepStrictEqual(parsed.files['spec/scripts/noext.js'], 1,
    'the real file under spec/scripts must still be scanned and counted once regardless of a symlink pointing at it: ' + JSON.stringify(parsed))
  assert.deepStrictEqual(parsed.files['scripts/linked.js'], 1,
    'a symlink under scripts that resolves to a regular file must be admitted and counted as its own scanned entry, or the walk skips every file reached only through a symlink: ' + JSON.stringify(parsed))
  assert.ok(!('scripts/dangling.js' in parsed.files),
    'a symlink whose target does not exist must be skipped silently, never crash the walk or surface as a scanned entry: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.total, 2,
    'the total must count exactly the real file and the resolving symlink once each, or the walk is double-counting or under-counting symlinked entries: ' + JSON.stringify(parsed))
})

test('AC-20260902-01-2: the plugin scan skips a symlink resolving outside --root and traverses a directory symlink inside root without following a symlink cycle', () => {
  const root = fs.realpathSync(tmpdir('cn-ac2-outside'))
  const outsideDir = fs.realpathSync(tmpdir('cn-ac2-outside-sibling'))
  writeTree(outsideDir, {
    'outside.js': ['// 2026-01-01 previously crashed']
  })
  writeTree(root, {
    'real-scripts/a.js': ['// 2026-01-01 previously crashed']
  })
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.symlinkSync(path.join(outsideDir, 'outside.js'), path.join(root, 'scripts/pointer.js'))
  fs.symlinkSync(path.join(root, 'real-scripts'), path.join(root, 'scripts/subdir-link'))
  fs.symlinkSync(path.join(root, 'scripts'), path.join(root, 'scripts/loop'))

  const r = runNode(SCRIPT, ['--root', root, '--json'])
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout) },
    '--json must print exactly one parseable JSON object even with an out-of-root symlink and a directory symlink cycle in the walk: ' + r.stdout)
  assert.strictEqual(r.status, 1,
    'the narrated comment reached only through the in-root directory symlink must still fail the scan (exit 1), or a directory symlink is invisible to the gate: ' + r.stderr)
  assert.deepStrictEqual(parsed.files['scripts/subdir-link/a.js'], 1,
    'a symlink to a directory inside root must be traversed and its file reported under the in-tree relative path, or the walk cannot see a file reached only through a directory symlink: ' + JSON.stringify(parsed))
  assert.ok(!('scripts/pointer.js' in parsed.files),
    'a symlink whose real target resolves outside --root must never be read, or the scan can be pointed at arbitrary files off the host: ' + JSON.stringify(parsed))
  assert.ok(!Object.keys(parsed.files).some((f) => f.startsWith('scripts/loop/')),
    'a symlink cycle back to an ancestor directory must not be followed, or the walk never terminates or double-reports entries through the cycle: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.total, 1,
    'only the one file reached through the in-root directory symlink may count — the outside-root symlink and the cycle must each contribute nothing: ' + JSON.stringify(parsed))
})

test('AC-20260902-01-3: --baseline passes a file at or under its recorded count and fails one over it or absent from the baseline entirely', () => {
  const passRoot = tmpdir('cn-ac3-pass')
  writeTree(passRoot, {
    'spec/scripts/x.js': ['// 2026-01-01 note', '// 2026-02-02 note']
  })
  const passBaseline = path.join(tmpdir('cn-ac3-pass-b'), 'baseline.json')
  fs.writeFileSync(passBaseline, JSON.stringify({ 'spec/scripts/x.js': 2 }))
  const rPass = runNode(SCRIPT, ['--root', passRoot, '--baseline', passBaseline])
  assert.strictEqual(rPass.status, 0,
    'a file at exactly its baseline count must pass — the ratchet only fails on an overage: ' + rPass.stderr)

  const overRoot = tmpdir('cn-ac3-over')
  writeTree(overRoot, {
    'spec/scripts/x.js': ['// 2026-01-01 note', '// 2026-02-02 note', '// 2026-03-03 note']
  })
  const overBaseline = path.join(tmpdir('cn-ac3-over-b'), 'baseline.json')
  fs.writeFileSync(overBaseline, JSON.stringify({ 'spec/scripts/x.js': 2 }))
  const rOver = runNode(SCRIPT, ['--root', overRoot, '--baseline', overBaseline])
  assert.strictEqual(rOver.status, 1,
    'one finding over the recorded baseline must fail the ratchet, or new narration can accrue silently: ' + rOver.stderr)
  assert.match(rOver.stderr, /spec\/scripts\/x\.js: 3 findings > baseline 2/,
    'stderr must name the file, its actual count, and the baseline it exceeded, or the sweep worker cannot locate the overage: ' + rOver.stderr)

  const absentRoot = tmpdir('cn-ac3-absent')
  writeTree(absentRoot, {
    'spec/scripts/y.js': ['// 2026-04-04 note']
  })
  const absentBaseline = path.join(tmpdir('cn-ac3-absent-b'), 'baseline.json')
  fs.writeFileSync(absentBaseline, JSON.stringify({}))
  const rAbsent = runNode(SCRIPT, ['--root', absentRoot, '--baseline', absentBaseline])
  assert.strictEqual(rAbsent.status, 1,
    'a file with no baseline entry must be treated as baseline 0 — any finding there fails, or a renamed file quietly escapes the ratchet: ' + rAbsent.stderr)
  assert.match(rAbsent.stderr, /spec\/scripts\/y\.js: 1 findings > baseline 0/,
    'the absent-path overage message must still name the file, its count, and the implied 0 baseline: ' + rAbsent.stderr)
})

test('AC-20260902-01-4: --code-identical exits 0 on comment/blank-only edits and exits 1 naming the file and reason for a code edit, a new trailing comment, or a rename', () => {
  const idDir = tmpdir('cn-ac4-identical')
  const idBase = baseRepo(idDir, {
    'spec/scripts/a.js': ['const cap = 15', '// old note', '', 'const other = 2']
  }).base
  fs.writeFileSync(path.join(idDir, 'spec/scripts/a.js'),
    ['const cap = 15', '// a completely different note', '', '', 'const other = 2'].join('\n') + '\n')
  const rId = runNode(SCRIPT, ['--root', idDir, '--code-identical', idBase])
  assert.strictEqual(rId.status, 0,
    'a comment-text rewrite plus an extra blank line must strip to the identical executable text, or the oracle cannot certify a comment-only sweep: ' + rId.stderr)
  assert.ok(rId.stdout.includes('identical: 1 files'),
    'the summary must report exactly the 1 tracked code-group file as identical: ' + rId.stdout)

  const ccDir = tmpdir('cn-ac4-codechange')
  const ccBase = baseRepo(ccDir, { 'spec/scripts/b.js': ['let cap = 15'] }).base
  fs.writeFileSync(path.join(ccDir, 'spec/scripts/b.js'), 'let cap = 16\n')
  const rCc = runNode(SCRIPT, ['--root', ccDir, '--code-identical', ccBase, '--json'])
  assert.strictEqual(rCc.status, 1,
    'an executable-line edit must fail the oracle — a comment-only sweep never touches executable text: ' + rCc.stderr)
  let ccParsed
  assert.doesNotThrow(() => { ccParsed = JSON.parse(rCc.stdout) }, 'oracle --json must parse: ' + rCc.stdout)
  assert.ok(ccParsed.differ.some((d) => d.file === 'spec/scripts/b.js' && d.reason === 'code-changed'),
    'the differ list must name spec/scripts/b.js with reason code-changed: ' + JSON.stringify(ccParsed))

  const tcDir = tmpdir('cn-ac4-trailing')
  const tcBase = baseRepo(tcDir, { 'spec/scripts/c.js': ['const cap = 15'] }).base
  fs.writeFileSync(path.join(tcDir, 'spec/scripts/c.js'), 'const cap = 15 // added trailing note\n')
  const rTc = runNode(SCRIPT, ['--root', tcDir, '--code-identical', tcBase])
  assert.strictEqual(rTc.status, 1,
    'a new trailing comment changes the raw line text and the oracle never strips trailing comments — this must read as a code change (D7), not a laundered sweep: ' + rTc.stderr)
  assert.ok(rTc.stdout.includes('spec/scripts/c.js code-changed'),
    'the human output must name spec/scripts/c.js and reason code-changed: ' + rTc.stdout)

  const rnDir = tmpdir('cn-ac4-renamed')
  const rnRepo = baseRepo(rnDir, { 'spec/scripts/d.js': ['const cap = 1'] })
  rnRepo.g('mv', 'spec/scripts/d.js', 'spec/scripts/d2.js')
  const rRn = runNode(SCRIPT, ['--root', rnDir, '--code-identical', rnRepo.base, '--json'])
  assert.strictEqual(rRn.status, 1,
    'a rename must fail the oracle — a renamed file with no entry in the sweep is exactly what D6 forbids from escaping the ratchet: ' + rRn.stderr)
  let rnParsed
  assert.doesNotThrow(() => { rnParsed = JSON.parse(rRn.stdout) }, 'oracle --json must parse: ' + rRn.stdout)
  assert.ok(rnParsed.differ.some((d) => d.file === 'spec/scripts/d2.js' && d.reason === 'missing-at-base'),
    'the new path must be reported missing-at-base: ' + JSON.stringify(rnParsed))
  assert.ok(rnParsed.differ.some((d) => d.file === 'spec/scripts/d.js' && d.reason === 'deleted'),
    'the old path must be reported deleted, or a rename silently drops half the story: ' + JSON.stringify(rnParsed))
})

test('AC-20260902-01-5: --rules-mode scans only .claude/rules/**/*.md, .claude/agents/*.md, and enforcement.json notes strings, never a host repo’s source tree', () => {
  const hostRoot = tmpdir('cn-ac5')
  writeTree(hostRoot, {
    '.claude/rules/spec-pipeline.md': [
      '# Rules',
      'Some other line',
      '- [host] fixed 2026-07-11 after UpWell shipped'
    ]
  })
  fs.writeFileSync(path.join(hostRoot, '.claude/rules/enforcement.json'),
    JSON.stringify([{ id: 'web:x', notes: 'pinned as of 2026-07-11' }]))
  writeTree(hostRoot, { 'src/a.js': ['// 2026-01-01'] })

  const r = runNode(SCRIPT, ['--rules-mode', hostRoot])
  assert.strictEqual(r.status, 1,
    'the fixture carries two narrated lines in the rules layer — a clean exit means the rules-mode scan missed them: ' + r.stderr)
  assert.ok(r.stdout.includes('.claude/rules/spec-pipeline.md:3 [date]'),
    'the rules-file date finding must be reported at its true line 3: ' + r.stdout)
  assert.ok(r.stdout.includes('.claude/rules/enforcement.json#web:x:1 [date]'),
    'the enforcement.json notes finding must be reported as file#entry-id:1 per D2, or doctor check 16 cannot locate a legacy host’s narrated notes: ' + r.stdout)
  assert.ok(!r.stdout.includes('a.js'),
    'rules-mode must never read a host’s source tree — only rules, agents, and enforcement.json notes: ' + r.stdout)
  assert.ok(r.stdout.includes('2 findings in 2 files'),
    'the summary must total exactly 2 findings across the 2 rules-layer locations: ' + r.stdout)
})

test('AC-20260902-01-6: prose scanning skips fenced content and includes frontmatter and HTML-comment lines outside the fence', () => {
  const root = tmpdir('cn-ac6')
  writeTree(root, {
    'spec/commands/x.md': [
      '---',
      'description: JJ’s queue',
      '---',
      '',
      '```',
      '2026-01-01',
      '```',
      '',
      '<!-- 2026-03-03 note -->',
      ''
    ]
  })

  const r = runNode(SCRIPT, ['--root', root, '--people', 'JJ', '--json'])
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout) }, 'must print parseable JSON: ' + r.stdout)
  const lines = parsed.findings.map((f) => f.line).sort((a, b) => a - b)
  assert.deepStrictEqual(lines, [2, 9],
    'the fenced date on line 6 must never be reported, and the frontmatter line (2) and the HTML-comment line (9) outside the fence must both be reported — a wrong set means the fence discriminator in D3 leaks or over-suppresses: ' + JSON.stringify(parsed.findings))
  const byLine = {}
  parsed.findings.forEach((f) => { byLine[f.line] = f.classes })
  assert.deepStrictEqual(byLine[2], ['person'], 'the frontmatter description line must classify as person given --people JJ: ' + JSON.stringify(byLine))
  assert.deepStrictEqual(byLine[9], ['date'], 'the HTML-comment line must classify as date: ' + JSON.stringify(byLine))
})

test('AC-20260902-01-7: a backticked version is never reported, a bare one is, and a date-shaped run inside an AC-ID, spec path, or run id is never mistaken for a narrated date', () => {
  const root = tmpdir('cn-ac7')
  writeTree(root, {
    'spec/scripts/v.js': [
      '// `7.9.0` sorts after `7.11.0`',
      '// bumped to 7.54.0',
      '// AC-20260820-04-5 pins specs/20260820/04-x.md, run rv_640c582f4902',
      '// Aug 2026 measurement'
    ]
  })

  const r = runNode(SCRIPT, ['--root', root, '--json'])
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout) }, 'must print parseable JSON: ' + r.stdout)
  const byLine = {}
  parsed.findings.forEach((f) => { byLine[f.line] = f.classes })
  assert.deepStrictEqual(Object.keys(byLine).map(Number).sort((a, b) => a - b), [2, 4],
    'lines 1 and 3 must report nothing — backticked versions are example literals (D4) and the AC-ID/spec-path/run-id digit runs never match the date grammar (D4/A4): ' + JSON.stringify(parsed.findings))
  assert.deepStrictEqual(byLine[2], ['version'], 'the bare version bump must classify as version: ' + JSON.stringify(byLine))
  assert.deepStrictEqual(byLine[4], ['date'], 'the month-name date form must classify as date: ' + JSON.stringify(byLine))
})

test('AC-20260902-01-8: --hosts and --people literals trigger whole-word host/person findings only when the flag supplies them, and a superstring never false-matches', () => {
  const root = tmpdir('cn-ac8')
  writeTree(root, {
    'spec/scripts/host.js': [
      '# UpWell shipped 10 days',
      '// upwelling tide',
      '// JJ ruling'
    ]
  })

  const rHosts = runNode(SCRIPT, ['--root', root, '--hosts', 'upwell', '--json'])
  let hostsParsed
  assert.doesNotThrow(() => { hostsParsed = JSON.parse(rHosts.stdout) }, 'must print parseable JSON: ' + rHosts.stdout)
  assert.strictEqual(hostsParsed.total, 1,
    'only the whole-word "UpWell" match on line 1 must fire — "upwelling" on line 2 is a superstring and must never match: ' + JSON.stringify(hostsParsed))
  assert.deepStrictEqual(hostsParsed.findings[0].classes, ['host'], 'the line-1 finding must classify as host: ' + JSON.stringify(hostsParsed))

  const rPeople = runNode(SCRIPT, ['--root', root, '--people', 'JJ', '--json'])
  let peopleParsed
  assert.doesNotThrow(() => { peopleParsed = JSON.parse(rPeople.stdout) }, 'must print parseable JSON: ' + rPeople.stdout)
  assert.strictEqual(peopleParsed.total, 1,
    'only the line-3 person match must fire with --people JJ: ' + JSON.stringify(peopleParsed))
  assert.deepStrictEqual(peopleParsed.findings[0].classes, ['person'], 'the line-3 finding must classify as person: ' + JSON.stringify(peopleParsed))

  const rNone = runNode(SCRIPT, ['--root', root, '--json'])
  let noneParsed
  assert.doesNotThrow(() => { noneParsed = JSON.parse(rNone.stdout) }, 'must print parseable JSON: ' + rNone.stdout)
  assert.strictEqual(noneParsed.total, 0,
    'without --hosts or --people neither literal has a class to fire under — reporting anything here means the classes are not flag-gated (D4): ' + JSON.stringify(noneParsed))
})

test('AC-20260902-01-9: --json prints one complete, parseable payload even past the 64 KiB pipe-buffer boundary', () => {
  const root = tmpdir('cn-ac9')
  const bigLines = []
  for (let i = 0; i < 3000; i++) bigLines.push('// 2026-01-01 entry ' + i)
  writeTree(root, { 'spec/scripts/big.js': bigLines })

  const r = runNode(SCRIPT, ['--root', root, '--json'])
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout) },
    'a payload of this size must still round-trip through JSON.parse whole — console.log + process.exit truncates async pipe writes at 64 KiB while still exiting cleanly, and a synchronous fd-1 writer is the fix (D1, host § Gotchas): ' + (r.stderr || r.stdout.slice(0, 200)))
  assert.strictEqual(parsed.total, 3000,
    'all 3,000 narrated lines must be counted — a truncated write would silently undercount instead of failing loudly: ' + (parsed && JSON.stringify(parsed).slice(0, 200)))
})

test('AC-20260902-01-10: a missing mode, two modes together, an unreadable --baseline, or an unresolvable --code-identical ref all exit 2 with a comment-narration: usage: stderr', () => {
  const dir = tmpdir('cn-ac10')
  fs.mkdirSync(path.join(dir, 'spec/scripts'), { recursive: true })

  const rNoMode = runNode(SCRIPT, ['--json'])
  assert.strictEqual(rNoMode.status, 2, 'no mode flag at all must exit 2, never guess a default mode: ' + rNoMode.stderr)
  assert.match(rNoMode.stderr, /^comment-narration:/, 'stderr must open with the script’s own name so the remedy is attributable: ' + rNoMode.stderr)
  assert.match(rNoMode.stderr, /usage:/, 'stderr must contain the usage string: ' + rNoMode.stderr)

  const rTwoModes = runNode(SCRIPT, ['--root', dir, '--rules-mode', dir])
  assert.strictEqual(rTwoModes.status, 2, 'two modes given together must exit 2, never silently pick one: ' + rTwoModes.stderr)
  assert.match(rTwoModes.stderr, /usage:/, 'stderr must contain the usage string: ' + rTwoModes.stderr)

  const badBaselinePath = path.join(dir, 'nonexistent-baseline.json')
  const rBadBaseline = runNode(SCRIPT, ['--root', dir, '--baseline', badBaselinePath])
  assert.strictEqual(rBadBaseline.status, 2, 'an unreadable --baseline path must exit 2: ' + rBadBaseline.stderr)
  assert.ok(rBadBaseline.stderr.includes(badBaselinePath) || rBadBaseline.stderr.includes('nonexistent-baseline.json'),
    'stderr must name the unreadable baseline path, or the remedy is undiscoverable: ' + rBadBaseline.stderr)

  const gdir = tmpdir('cn-ac10-git')
  gitRepo(gdir)
  const rBadRef = runNode(SCRIPT, ['--root', gdir, '--code-identical', 'nope-not-a-ref'])
  assert.strictEqual(rBadRef.status, 2, 'an unresolvable --code-identical ref must exit 2, not crash on a git failure: ' + rBadRef.stderr)
  assert.ok(rBadRef.stderr.includes('nope-not-a-ref'),
    'stderr must name the unresolvable ref: ' + rBadRef.stderr)
})

test('AC-20260902-01-11: spec-paths comment-narration prints the absolute path to the script, and the usage line for an unknown key names it', () => {
  const r = runBash('bin/spec-paths', ['comment-narration'])
  assert.strictEqual(r.status, 0,
    'spec-paths must resolve the comment-narration key, or every command that invokes the scanner resolves nothing (§ Risk Tiers, spec-paths): ' + r.stderr)
  const p = r.stdout.trim()
  assert.match(p, /comment-narration\.js$/,
    'the key must resolve to comment-narration.js: got ' + JSON.stringify(p))
  assert.ok(fs.existsSync(p), 'comment-narration -> ' + p + ' must exist on disk, or the resolved path is dead')

  const r2 = runBash('bin/spec-paths', ['bogus-key-nowhere'])
  assert.match(r2.stderr, /comment-narration/,
    'the usage line printed for an unknown key must list comment-narration, or the key is undiscoverable to a caller: ' + r2.stderr)
})

test('AC-20260902-01-12: the entrypoints manifest maps comment-narration.js to doctor.md, and doctor.md invokes it via spec-paths comment-narration', () => {
  const manifest = JSON.parse(read('spec/entrypoints.json'))
  assert.deepStrictEqual(manifest['spec/scripts/comment-narration.js'], { entryPoints: ['spec/commands/doctor.md'] },
    'the manifest row must map the new script to exactly its one declared caller, or the entrypoint-conformance guard flags it as never activated: ' + JSON.stringify(manifest['spec/scripts/comment-narration.js']))
  const doctorMd = read('spec/commands/doctor.md')
  assert.match(doctorMd, /spec-paths comment-narration/,
    'doctor.md must invoke the scanner via spec-paths comment-narration — a hand-rolled path here breaks silently on any script move')
})

// specs/20260902/04-host-generators-owner-citations.md D2/D3/D4: the three host-generator
// command surfaces that write Gotchas entries all carry the same owner-citation grammar, so a
// worker following any one of them writes tag + rule + one owner citation, never a story.
test('AC-20260902-04-2: spec/commands/review.md, spec/commands/escape.md, and spec/commands/init.md each contain the literal never-narrate grammar', () => {
  const files = ['spec/commands/review.md', 'spec/commands/escape.md', 'spec/commands/init.md']
  for (const rel of files) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), 'setup: ' + rel + ' must exist for this pin to be meaningful')
    const src = read(rel)
    assert.ok(src.includes('never dates, people, hosts, versions, or prior behavior'),
      'D2/D3/D4: ' + rel + ' must contain the literal "never dates, people, hosts, versions, or prior behavior" — without it this surface still lets a worker write a Gotchas entry that narrates instead of citing an owner: ' + rel)
  }
})

// specs/20260902/04-host-generators-owner-citations.md D5: the contract must state the
// owner-citation duty and must not contain either retired narrated phrase.
test('AC-20260902-04-3: spec/templates/grounding-contract.md contains the owner-citation duty sentence and neither retired narrated phrase', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'spec/templates/grounding-contract.md')),
    'setup: spec/templates/grounding-contract.md must exist for this pin to be meaningful')
  const src = read('spec/templates/grounding-contract.md')
  assert.ok(src.includes('state the current invariant plus one owner citation'),
    'D5: the contract must state the rule-notes duty verbatim — without this sentence hosts\' rules layers carry no textual source for the owner-citation invariant doctor check 16 enforces: ' + src.slice(0, 200))
  assert.ok(!src.includes('UpWell, 2026-07'),
    'D5: the contract\'s own narrated runtime-verification example (a dated host anecdote) must be reworded away — its survival here is exactly the pattern this spec exists to stop the contract itself from teaching: ' + src.slice(0, 200))
  assert.ok(!src.includes('used to hardcode'),
    'D5: the contract\'s own "used to hardcode" prior-behavior sentence must be reworded away — its survival here means the contract still narrates history instead of stating the current invariant: ' + src.slice(0, 200))
})
