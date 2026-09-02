'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260821/01-red-check.md: build's red-check — classify every tests-layer
// file's expected pre-image colour, execute it, explain every mismatch — was hand-run from
// prose every build (build.md Phase 0 step 2 + Phase 1), and its recurring failure class (an
// AC that structurally cannot go red before implementation) lived only in a thrice-amended
// Gotchas paragraph. This suite pins the mechanized replacement, spec/scripts/red-check.js, by
// executing it against synthetic host trees rooted in real git repos (tmpdir() + gitRepo()) —
// the script does not exist yet at HEAD, so every test below is expected RED. D2's exit
// alphabet (0 = every file matches its expectation, 1 = findings, 2 = usage error or a
// pre-image-impurity refusal) and its finding classes (unsanctioned-green, broken-pin,
// missing-test-file, invalid-pre-green) are the reconciliation table this file exists to prove.
// AC-20260821-01-1 additionally pins lib/spec-sections.js's parseAcBullets `preGreen` field and
// PRE_GREEN_REASONS export directly (a plain require()able library, unlike a workflow script).
//
// specs/20260823/03-silent-drop-hardening.md D1/D2 (the silent-drop incident): a carried AC's
// `[pre-green: <reason>]` tag, when it ends the bullet
// backticked, is refused as a declaration by lib/spec-sections.js's bare-only trailing rule
// (escape rv_640c582f4902) — today that refusal misreports as a plain `unsanctioned-green`
// finding with no hint that a refused pre-green tag is the actual cause. AC-20260823-03-3 pins
// the loud replacement: `rejected-trailing-tag`, naming the AC-ID and remedy, in place of
// `unsanctioned-green`, whenever the refusal is causally relevant (the carried AC's bullet is the
// one whose refused tag would have sanctioned the finding). Confirmed RED at HEAD by executed
// run: today's red-check.js reports `class: 'unsanctioned-green'` for this exact fixture.

// D11 amendment (supersedes D8's rationale and D2's predicate formula): AC-20260823-03-3
// above pins the TRUE-end backticked shape; live evidence
// (specs/20260823/01 AC-20260823-01-18/-20, review row rv_6825fa48c98d) showed a genuine
// declaration written just before the bullet's final `→ tests/…` reference is ALSO silently
// dropped — neither the bare-only rule nor D2's null-test formula saw it, so it neither parsed nor
// set trailingRejected. AC-20260823-03-17 below pins that not-at-end shape end-to-end through this
// same red-check.js consumer: a NEW fixture (D8's build-time ruling that AC-3's own fixture must
// sit at the true end stands — this is a sibling AC, not a retarget of AC-3's). RED at HEAD:
// lib/spec-sections.js's tolerant run does not yet tolerate a trailing → reference suffix, so
// b.trailingRejected is null for this shape and red-check.js falls through to unsanctioned-green.

const { parseAcBullets, PRE_GREEN_REASONS } = require('../../spec/scripts/lib/spec-sections')

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    filePlanRows.join('\n') + '\n'
}

function writeConfig(dir, config) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
}

// A synthetic host: a real git repo (so --base always resolves to a real ref) whose initial
// commit is the pre-image, with a plain `node --test` testCommand declared unless overridden.
function newHost(prefix, config = { testCommand: 'node --test' }) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  if (config) writeConfig(dir, config)
  return { dir, base }
}

function run(specPath, root, base, extraArgs = []) {
  return runNode('scripts/red-check.js', ['--spec', specPath, '--root', root, '--base', base, ...extraArgs])
}

function findings(res) {
  let parsed
  try { parsed = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return parsed
}

test('AC-20260821-01-1: parseAcBullets parses a [pre-green: absence-invariant] tag into preGreen, an untagged bullet parses preGreen: null, and PRE_GREEN_REASONS exports the three-member closed enum', () => {
  const section =
    '- **AC-20260821-99-1**: WHEN x THE SYSTEM SHALL y [pre-green: absence-invariant]\n' +
    '- **AC-20260821-99-2**: WHEN x THE SYSTEM SHALL y\n'
  const bullets = parseAcBullets(section)
  assert.strictEqual(bullets[0].preGreen, 'absence-invariant',
    'a bullet carrying [pre-green: absence-invariant] must parse preGreen as the raw trimmed reason string, or every downstream consumer (ac-matrix.js D6, red-check.js D2) that gates on this field sees an untagged bullet instead')
  assert.strictEqual(bullets[1].preGreen, null,
    'a bullet with no [pre-green:] tag must parse preGreen: null, not an empty string or undefined — a truthy-but-wrong value would let an untagged AC silently sanction itself')
  const reasons = new Set(PRE_GREEN_REASONS)
  assert.strictEqual(reasons.size, 3,
    `PRE_GREEN_REASONS must be the single enum authority naming exactly the three recorded sub-shapes — got ${JSON.stringify([...reasons])}`)
  for (const r of ['fallback-rejection', 'absence-invariant', 'predicate-in-test']) {
    assert.ok(reasons.has(r), `PRE_GREEN_REASONS must include "${r}" — a consumer validating against an incomplete enum would reject a legitimately-tagged AC`)
  }
})

test('AC-20260821-01-3: a tests-layer file whose only carried AC is unsanctioned but whose test passes against the pre-image is a mechanized unsanctioned-green finding, exit 1', () => {
  const { dir, base } = newHost('rc3')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x3.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-93-1: vacuously true, no implementation required', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-93-1**: WHEN x THE SYSTEM SHALL y → tests/x3.test.js'],
    ['| tests/x3.test.js | CREATE | tests | unsanctioned pin, no SHALL CONTINUE TO, no pre-green tag |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    `an unsanctioned AC whose test already passes pre-implementation must exit 1 — a silent exit 0 here is exactly the vacuous-pin class this spec mechanizes (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'unsanctioned-green' && f.path === 'tests/x3.test.js' &&
    Array.isArray(f.acs) && f.acs.includes('AC-20260821-93-1')),
    `the finding must name both the file and its carried AC-ID so a human can diagnose which pin is vacuous — got ${JSON.stringify(out.findings)}`)
})

test('AC-20260823-03-3: WHEN red-check finds an expected-red file observed green and a carried AC\'s bullet ends in a backticked pre-green tag THE SYSTEM emits rejected-trailing-tag (not unsanctioned-green), naming the AC-ID and remedy', () => {
  const { dir, base } = newHost('rtt3')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x3.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260823-33-1: vacuously true, no implementation required', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260823-33-1**: WHEN x THE SYSTEM SHALL y `[pre-green: absence-invariant]`'],
    ['| tests/x3.test.js | CREATE | tests | carried AC\'s bullet ends in a backticked pre-green tag, refused as a declaration |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    `a carried AC whose only pre-green sanction was refused for being backticked must still exit 1 — the finding CLASS changes, severity does not (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.class === 'unsanctioned-green' && f.path === 'tests/x3.test.js'),
    `D1: rejected-trailing-tag REPLACES unsanctioned-green — never both for the same file/AC. A surviving unsanctioned-green finding here means the refusal's cause is still hidden, the exact silent misreport this spec fixes — got ${JSON.stringify(out.findings)}`)
  const f = out.findings.find(x => x.class === 'rejected-trailing-tag' && x.path === 'tests/x3.test.js')
  assert.ok(f, `tests/x3.test.js's carried AC-20260823-33-1 has a refused trailing [pre-green:] tag and passes vacuously against the pre-image — it must produce a rejected-trailing-tag finding naming the file — got ${JSON.stringify(out.findings)}`)
  assert.ok(f.detail.includes('AC-20260823-33-1'),
    `the finding's detail must name the AC-ID so a human can find the offending bullet — got detail "${f.detail}"`)
  assert.match(f.detail, /\[pre-green:\s*absence-invariant\]/,
    `the detail must name the refused tag's literal text — got detail "${f.detail}"`)
  assert.match(f.detail, /backtick/i,
    `the detail must explain the refusal was due to the tag being backticked (the bare-only trailing rule, rv_640c582f4902) — got detail "${f.detail}"`)
  assert.match(f.detail, /declaration slot/i,
    `the detail must name the declaration-slot remedy — got detail "${f.detail}"`)
})

test('AC-20260823-03-17: WHEN red-check finds an expected-red file observed green and the carried AC\'s bullet carries a refused pre-green tag before its final → reference THE SYSTEM emits rejected-trailing-tag (not unsanctioned-green), whose detail carries the not-at-end remedy', () => {
  const { dir, base } = newHost('rtt17')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x3.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260823-34-1: vacuously true, no implementation required', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260823-34-1**: WHEN x THE SYSTEM SHALL y `[pre-green: absence-invariant]` → tests/x3.test.js'],
    ['| tests/x3.test.js | CREATE | tests | carried AC\'s bullet carries a refused pre-green tag before its final → reference — the not-at-end shape |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    `a carried AC whose only pre-green sanction sits before the bullet's final → reference — never a recognized declaration position — must still exit 1; the finding CLASS changes, severity does not (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.class === 'unsanctioned-green' && f.path === 'tests/x3.test.js'),
    `D1/D11: rejected-trailing-tag REPLACES unsanctioned-green for the not-at-end shape too — a surviving unsanctioned-green here means the refusal's cause is still hidden, exactly the silent misreport specs/20260823/01's AC-20260823-01-18/-20 suffered — got ${JSON.stringify(out.findings)}`)
  const f = out.findings.find(x => x.class === 'rejected-trailing-tag' && x.path === 'tests/x3.test.js')
  assert.ok(f, `tests/x3.test.js's carried AC-20260823-34-1 has a refused not-at-end [pre-green:] tag and passes vacuously against the pre-image — it must produce a rejected-trailing-tag finding naming the file — got ${JSON.stringify(out.findings)}`)
  assert.ok(f.detail.includes('AC-20260823-34-1'),
    `the finding's detail must name the AC-ID so a human can find the offending bullet — got detail "${f.detail}"`)
  assert.ok(!f.detail.includes('remove the backticks'),
    `D11: the not-at-end remedy must never say "remove the backticks" — removing them alone would not make this tag parse, since it still sits before the bullet's final → reference, not a recognized declaration position — a wrong remedy here sends the host chasing the wrong fix — got detail "${f.detail}"`)
  assert.match(f.detail, /declaration slot/i,
    `the not-at-end detail must still name the move-into-the-declaration-slot remedy — got detail "${f.detail}"`)
})

test('AC-20260821-01-4: a fixture spec whose SHALL-CONTINUE-TO file passes AND whose unsanctioned file fails BOTH matches their expected colour, so red-check exits 0', () => {
  const { dir, base } = newHost('rc4')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/pass4.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-92-1: sanctioned regression pin', () => { assert.ok(true) })\n")
  fs.writeFileSync(path.join(dir, 'tests/fail4.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-92-2: correctly red pre-implementation', () => { assert.strictEqual(1, 2) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-92-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/pass4.test.js',
      '- **AC-20260821-92-2**: WHEN x THE SYSTEM SHALL y → tests/fail4.test.js'],
    ['| tests/pass4.test.js | CREATE | tests | sanctioned regression pin, expected+observed green |',
      '| tests/fail4.test.js | CREATE | tests | unsanctioned pin, expected+observed red |']))
  const res = run(spec, dir, base, ['--json'])
  const out = findings(res)
  assert.strictEqual(res.status, 0,
    `every resolved file matches its expectation (sanctioned-green passing, unsanctioned-red failing) — a nonzero exit here is a false positive that would pause every build with a matching fixture: findings=${JSON.stringify(out.findings)}, stderr=${res.stderr}`)
  assert.deepStrictEqual(out.findings, [],
    `no file diverges from its expected colour, so findings must be empty — got ${JSON.stringify(out.findings)}`)
})

// Escape (unanchored-marker-match, specs/20260821/01-red-check.md review passed CLEAN with
// this present): isSanctioned() tested `/SHALL CONTINUE TO/` unanchored over the
// bullet's raw text, so an AC that merely QUOTES the marker inside backticks while discussing
// it — exactly how this spec's own AC-20260821-01-4 bullet reads ("a `SHALL CONTINUE TO`
// pin-carrier file passing AND an unsanctioned file failing") — was wrongly sanctioned: a
// vacuous test passing against the pre-image raised nothing, the false CLEAN this script exists
// to prevent. Fixed: isSanctioned now strips inline code spans before matching, so a quoted
// mention is not a declaration.
test('AC-20260821-01-4: an AC bullet that only quotes `SHALL CONTINUE TO` in backticks mid-sentence, discussing it rather than declaring it — matching how this spec\'s own AC-20260821-01-4 bullet reads — is not sanctioned, so its vacuously-green pre-image test is an unsanctioned-green finding, exit 1', () => {
  const { dir, base } = newHost('rc4-quoted')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/quoted.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-95-1: vacuously true, no implementation required', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-95-1**: WHEN every resolved tests-layer file matches its expectation ' +
      '(a `SHALL CONTINUE TO` pin-carrier file passing AND an unsanctioned file failing) ' +
      'THE SYSTEM SHALL exit 0 → tests/quoted.test.js'],
    ['| tests/quoted.test.js | CREATE | tests | quotes SHALL CONTINUE TO in backticks mid-sentence — must NOT be sanctioned |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    `a bullet that only QUOTES the marker in backticks — never declares it — must not be sanctioned, so its ` +
    `green pre-image test must be an unsanctioned-green finding, exit 1 — an exit 0 here is exactly the false ` +
    `CLEAN this script exists to prevent (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'unsanctioned-green' && f.path === 'tests/quoted.test.js' &&
    Array.isArray(f.acs) && f.acs.includes('AC-20260821-95-1')),
    `the finding must be classed unsanctioned-green, name tests/quoted.test.js, and carry AC-20260821-95-1 — got ${JSON.stringify(out.findings)}`)
})

// Sibling pin, same escape: a GENUINE marker hard-wrapped mid-phrase across two lines — matching
// how the real specs/20260810/02-terminal-observable-acs.md AC-20260810-02-4 bullet wraps
// ("AND SHALL" / "CONTINUE TO require the existing...") — was MISSED by the pre-fix literal
// regex, since a single space never matches a newline. Fixed: isSanctioned now collapses
// whitespace runs (including newlines) before matching, so the wrapped genuine pin still counts.
test('AC-20260821-01-4: a genuine SHALL CONTINUE TO marker hard-wrapped across two lines — matching how the real AC-20260810-02-4 bullet wraps ("AND SHALL" / "CONTINUE TO require") — is still sanctioned, so its green pre-image test matches its expectation with no finding', () => {
  const { dir, base } = newHost('rc4-wrapped')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/wrapped.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260810-96-1: genuine regression pin, hard-wrapped in its AC bullet', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260810-96-1**: WHEN x THE SYSTEM SHALL y, AND SHALL\n' +
      '  CONTINUE TO require the existing pin check in the same step → tests/wrapped.test.js'],
    ['| tests/wrapped.test.js | CREATE | tests | genuine SHALL CONTINUE TO pin hard-wrapped across two lines — must be sanctioned, expected+observed green |']))
  const res = run(spec, dir, base, ['--json'])
  const out = findings(res)
  assert.strictEqual(res.status, 0,
    `a genuine marker split across two lines by hard-wrap must still be recognized as sanctioned — a nonzero ` +
    `exit here means a routine markdown line-wrap breaks a legitimate regression pin: findings=${JSON.stringify(out.findings)}, stderr=${res.stderr}`)
  assert.deepStrictEqual(out.findings, [],
    `the wrapped file matches its sanctioned-green expectation, so findings must be empty — got ${JSON.stringify(out.findings)}`)
})

// Guard pin, same escape: the marker written normally on one line, unbackticked, must keep
// working once the fix adds code-span stripping and whitespace collapsing — the ordinary case
// must not regress. (Observed to pass both before and after the isSanctioned fix — the ordinary
// case was never broken; this pin only guards against the fix itself introducing a regression.)
test('AC-20260821-01-4: a SHALL CONTINUE TO marker written normally on one line, unbackticked, stays sanctioned after the quoting/wrap fix', () => {
  const { dir, base } = newHost('rc4-normal')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/normal.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-97-1: ordinary sanctioned regression pin', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-97-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/normal.test.js'],
    ['| tests/normal.test.js | CREATE | tests | ordinary one-line marker, no backticks — must stay sanctioned |']))
  const res = run(spec, dir, base, ['--json'])
  const out = findings(res)
  assert.strictEqual(res.status, 0,
    `the ordinary one-line, unbackticked marker must remain sanctioned — a nonzero exit here means the ` +
    `code-span-stripping/whitespace-collapsing fix broke the common case: findings=${JSON.stringify(out.findings)}, stderr=${res.stderr}`)
  assert.deepStrictEqual(out.findings, [],
    `the normal file matches its sanctioned-green expectation, so findings must be empty — got ${JSON.stringify(out.findings)}`)
})

test('AC-20260821-01-5: a file whose every carried AC is sanctioned (SHALL CONTINUE TO) but whose test fails is a broken-pin finding naming the file, exit 1', () => {
  const { dir, base } = newHost('rc5')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/broken.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-91-1: deliberately broken regression pin', () => { assert.strictEqual(1, 2) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-91-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/broken.test.js'],
    ['| tests/broken.test.js | CREATE | tests | sanctioned pin, expected green, but the test itself fails |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    `a sanctioned SHALL-CONTINUE-TO file that fails its run must exit 1 — silently letting it pass as red-expected would hide a real regression as if it were a normal pre-implementation red (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'broken-pin' && f.path === 'tests/broken.test.js'),
    `the finding must be classed broken-pin and name tests/broken.test.js — got ${JSON.stringify(out.findings)}`)
})

test('AC-20260821-01-6: a non-DELETE tests-layer File Plan path that does not exist is a missing-test-file finding, and the runner is never invoked on that path', () => {
  const argvLog = path.join(tmpdir('rc6-log'), 'argv.txt')
  const { dir, base } = newHost('rc6', null)
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'bin/recorder.js'),
    'const fs = require("fs")\n' +
    `fs.appendFileSync(${JSON.stringify(argvLog)}, process.argv.slice(2).join("\\n") + "\\n")\n` +
    'process.exit(0)\n')
  writeConfig(dir, { testCommand: `node ${JSON.stringify(path.join(dir, 'bin/recorder.js'))}` })
  fs.writeFileSync(path.join(dir, 'tests/exists.test.js'), '// covers AC-20260821-90-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-90-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/exists.test.js'],
    ['| tests/exists.test.js | CREATE | tests | present, sanctioned, recorder-invoked |',
      '| tests/missing.test.js | CREATE | tests | D3/spike A: non-DELETE row naming a file that does not exist on disk |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    `a non-DELETE tests row naming a missing file must be a hard finding (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'missing-test-file' && f.path === 'tests/missing.test.js'),
    `the missing row must surface as missing-test-file naming tests/missing.test.js — got ${JSON.stringify(out.findings)}`)
  assert.ok(fs.existsSync(argvLog),
    'precondition: the present, sanctioned file must actually be run by the recorder, or this test proves nothing about selective invocation')
  const invoked = fs.readFileSync(argvLog, 'utf8')
  assert.match(invoked, /tests\/exists\.test\.js/,
    `the recorder log must show the existing file was actually invoked — got "${invoked}"`)
  assert.ok(!invoked.includes('tests/missing.test.js'),
    `spike A: node --test exits 1 on a missing file, which would fake a satisfied red expectation — the runner must NEVER be invoked on tests/missing.test.js at all (existence is probed first), but the recorder log shows it was: "${invoked}"`)
})

test('AC-20260821-01-7: a non-tests File Plan path that already differs from --base — as a tracked modification OR as an untracked new file — refuses the run at exit 2, naming both offending paths, with zero test files executed', () => {
  const argvLog = path.join(tmpdir('rc7-log'), 'argv.txt')
  const dir = tmpdir('rc7')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'bin/recorder.js'),
    'const fs = require("fs")\n' +
    `fs.appendFileSync(${JSON.stringify(argvLog)}, process.argv.slice(2).join("\\n") + "\\n")\n` +
    'process.exit(0)\n')
  fs.writeFileSync(path.join(dir, 'lib/tracked.js'), 'module.exports = 1\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  writeConfig(dir, { testCommand: `node ${JSON.stringify(path.join(dir, 'bin/recorder.js'))}` })

  // Tracked modification after base (A2 arm 1: `git diff --name-only` sees this).
  fs.writeFileSync(path.join(dir, 'lib/tracked.js'), 'module.exports = 2\n')
  // Untracked new file (A2 arm 2: plain `git diff` is blind to this — spike B).
  fs.writeFileSync(path.join(dir, 'lib/untracked.js'), 'module.exports = 3\n')
  fs.writeFileSync(path.join(dir, 'tests/pass7.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-89-1: sanctioned', () => { assert.ok(true) })\n")

  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-89-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/pass7.test.js'],
    ['| tests/pass7.test.js | CREATE | tests | tests-layer row, exempt from purity |',
      '| lib/tracked.js | MODIFY | scripts | non-tests row, TRACKED modification after --base |',
      '| lib/untracked.js | CREATE | scripts | non-tests row, UNTRACKED new file, invisible to plain git diff |']))
  const res = run(spec, dir, base)
  assert.strictEqual(res.status, 2,
    `a non-tests File Plan path already differing from --base means the working tree is not a clean pre-image — the run must refuse at exit 2, not silently reconcile a post-image tree (stderr: ${res.stderr})`)
  assert.match(res.stderr, /lib\/tracked\.js/,
    `the refusal must name the TRACKED modified path lib/tracked.js so a human can diagnose it — stderr: ${res.stderr}`)
  assert.match(res.stderr, /lib\/untracked\.js/,
    `spike B: plain \`git diff --name-only\` alone is blind to an untracked path — the refusal must still name lib/untracked.js, proving the union with \`git status --porcelain --untracked-files=all\` fired — stderr: ${res.stderr}`)
  assert.ok(!fs.existsSync(argvLog),
    `a purity refusal must run ZERO test files — a post-image run proves nothing about vacuity, so the recorder must never have been invoked (its log would exist otherwise): ${fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8') : '(absent)'}`)
})

test('AC-20260821-01-8: a host config declaring no testCommand exits 2 with a remedy naming the testCommand key and /spec:init', () => {
  const { dir, base } = newHost('rc8', {})
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/pass8.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-88-1: sanctioned', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-88-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/pass8.test.js'],
    ['| tests/pass8.test.js | CREATE | tests | only a tests-layer row — no non-tests path exists to trip the purity refusal instead |']))
  const res = run(spec, dir, base)
  assert.strictEqual(res.status, 2,
    `an absent testCommand means red-check cannot observe anything and must fail closed at exit 2, never silently skip execution or crash uninformatively (stderr: ${res.stderr})`)
  assert.match(res.stderr, /testCommand/,
    `the exit-2 message must name the missing config key "testCommand" so a host operator knows what to add — stderr: ${res.stderr}`)
  assert.match(res.stderr, /\/spec:init/,
    `the exit-2 message must name the remedy command /spec:init — stderr: ${res.stderr}`)
})

test('AC-20260821-01-9: a red-expected file passed via --expect-green is treated green-expected (matching its green pass, no finding) and a warning names the flag and the path — proven against the same file WITHOUT the flag, which is unsanctioned-green', () => {
  const { dir, base } = newHost('rc9')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/design.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-87-1: a design-stage pre-landed component, already green', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-87-1**: WHEN x THE SYSTEM SHALL y → tests/design.test.js'],
    ['| tests/design.test.js | CREATE | tests | unsanctioned pin, but a design-stage component already landed it green |']))

  const without = findings(run(spec, dir, base, ['--json']))
  assert.ok(without.findings.some(f => f.class === 'unsanctioned-green' && f.path === 'tests/design.test.js'),
    `precondition: without --expect-green this file is an ordinary unsanctioned-green finding — otherwise this test cannot show the flag changed anything: ${JSON.stringify(without.findings)}`)

  const withFlag = findings(run(spec, dir, base, ['--expect-green', 'tests/design.test.js', '--json']))
  assert.ok(!withFlag.findings.some(f => f.path === 'tests/design.test.js'),
    `--expect-green tests/design.test.js must flip this file's expectation to green so its actual green pass is a match, not a finding — got ${JSON.stringify(withFlag.findings)}`)
  const row = withFlag.files.find(f => f.path === 'tests/design.test.js')
  assert.ok(row && row.expected === 'green',
    `the files[] row for the flagged path must record expected: "green" (flipped from red) — got ${JSON.stringify(row)}`)
  assert.ok(withFlag.warnings.some(w => w.includes('--expect-green') && w.includes('tests/design.test.js')),
    `--expect-green is an orchestrator-derived sanction and must be visible, never silent — a warning must name both the flag and the path: ${JSON.stringify(withFlag.warnings)}`)
})

test('AC-20260821-01-13: --json prints the Contracts shape — files[] rows carrying path/expected/observed/carriedAcs, findings[] rows carrying class/path/acs', () => {
  const { dir, base } = newHost('rc13')
  fs.mkdirSync(path.join(dir, 'tests/t'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/t/v.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-99-1: vacuously true', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-99-1**: WHEN x THE SYSTEM SHALL y → tests/t/v.test.js'],
    ['| tests/t/v.test.js | CREATE | tests | unsanctioned, passes vacuously |']))
  const res = run(spec, dir, base, ['--json'])
  const out = findings(res)
  assert.ok(Array.isArray(out.files) && Array.isArray(out.findings) && Array.isArray(out.warnings),
    `--json must print the three top-level arrays files/findings/warnings from the Contracts shape — got keys ${JSON.stringify(Object.keys(out))}`)
  const row = out.files.find(f => f.path === 'tests/t/v.test.js')
  assert.ok(row, `files[] must carry a row for tests/t/v.test.js — got ${JSON.stringify(out.files)}`)
  assert.strictEqual(row.expected, 'red',
    `an unsanctioned AC must yield expected: "red" in the files[] row — got ${JSON.stringify(row)}`)
  assert.strictEqual(row.observed, 'green',
    `the file's actual node --test run passes, so observed must be "green" — got ${JSON.stringify(row)}`)
  assert.deepStrictEqual(row.carriedAcs, ['AC-20260821-99-1'],
    `carriedAcs must list every AC-ID literally greppable in the file — got ${JSON.stringify(row.carriedAcs)}`)
  const finding = out.findings.find(f => f.class === 'unsanctioned-green')
  assert.ok(finding, `findings[] must carry an unsanctioned-green row — got ${JSON.stringify(out.findings)}`)
  assert.strictEqual(finding.path, 'tests/t/v.test.js', `the finding's path must name the file — got ${JSON.stringify(finding)}`)
  assert.deepStrictEqual(finding.acs, ['AC-20260821-99-1'], `the finding's acs must list the carried AC-ID — got ${JSON.stringify(finding)}`)
})

test('AC-20260821-01-14: a tests-row file carrying zero AC-IDs is reported unclassified and is never executed — a probe file that writes a marker when loaded leaves no marker', () => {
  const markerPath = path.join(tmpdir('rc14-marker'), 'marker.txt')
  const { dir, base } = newHost('rc14')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/pass14.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260821-86-1: sanctioned', () => { assert.ok(true) })\n")
  // Zero AC-IDs anywhere in this file's content — a top-level side effect (before any node:test
  // registration) fires the instant the runner loads/requires the file at all.
  fs.writeFileSync(path.join(dir, 'tests/probe.test.js'),
    `require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'loaded\\n')\n`)
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-86-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/pass14.test.js'],
    ['| tests/pass14.test.js | CREATE | tests | sanctioned, carries the spec\'s only AC |',
      '| tests/probe.test.js | CREATE | tests | zero AC-IDs — must be reported unclassified and never run |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 0,
    `unclassified is a warning, not a finding — with the spec's only real AC sanctioned and passing, the run must exit 0 (stderr: ${res.stderr})`)
  const out = findings(res)
  const row = out.files.find(f => f.path === 'tests/probe.test.js')
  assert.ok(row && row.expected === 'unclassified',
    `a file with zero carried AC-IDs must be reported expected: "unclassified" — got ${JSON.stringify(row)}`)
  assert.deepStrictEqual(row.carriedAcs, [],
    `tests/probe.test.js carries no AC-ID literal, so carriedAcs must be empty — got ${JSON.stringify(row && row.carriedAcs)}`)
  assert.ok(!out.findings.some(f => f.path === 'tests/probe.test.js'),
    `an unclassified file must never surface as a hard finding — got ${JSON.stringify(out.findings)}`)
  assert.ok(!fs.existsSync(markerPath),
    `D3: a zero-AC file must never be executed at all — the probe writes its marker the instant node --test loads the file, and the marker's presence would prove it was run despite carrying no AC-ID: ${fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8') : '(absent, as required)'}`)
})

// specs/20260821/03-cross-spec-skip-mapping.md D7 (amendment): the carried-AC
// classifier at line ~233 (`wellFormed.filter(b => content.includes(b.id))`) is the SAME
// bare-substring class as ac-matrix.js's coverage grep (tests/ac-matrix-coverage-holes.test.js's
// Hole 3) — a shorter red-expected AC-ID phantom-carries into a file that only ever cites a
// LONGER AC-ID sharing its prefix, forcing a false red expectation onto a file that genuinely
// carries only a sanctioned pin. The false `unsanctioned-green` this produces is exactly what
// stopped specs/20260822/02's build (this spec's own D7 provenance note). The fix
// is the same exported `acIdOccurs(text, id)` full-token check, replacing the bare `.includes` at
// this one call site.
test('AC-20260821-03-12: a tests-layer file whose only ACTUAL citation is a longer AC-ID, sharing a shorter red-expected AC-ID\'s prefix, is classified by the full-token citation ALONE — carriedAcs names only the longer id, expected green, zero findings, exit 0 — red-first, since the pre-image bare-substring classifier phantom-carries the shorter red-expected id and reports a false unsanctioned-green, exit 1', () => {
  const { dir, base } = newHost('rc12-prefix')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260101-01-12: sanctioned regression pin, passes against the pre-image', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260101-01-1**: WHEN x THE SYSTEM SHALL y → tests/x.test.js',
      '- **AC-20260101-01-12**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/x.test.js'],
    ['| tests/x.test.js | CREATE | tests | cites only the LONGER id, AC-20260101-01-12 — AC-20260101-01-1 is red-expected and unsanctioned, and must NOT be phantom-carried into this file |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 0,
    `the file genuinely cites only AC-20260101-01-12 (SHALL CONTINUE TO, sanctioned-green) and ` +
    `passes against the pre-image — classifying it by full-token citation alone must match its ` +
    `expectation exactly and exit 0; a nonzero exit here means the shorter AC-20260101-01-1 ` +
    `(red-expected, unsanctioned, cited nowhere in this file) was phantom-carried in via a ` +
    `bare-substring match, forcing a false red expectation onto a file that never mentions it: ` +
    `stderr=${res.stderr}`)
  const out = findings(res)
  assert.deepStrictEqual(out.findings, [],
    `no finding may be raised for this file — a false unsanctioned-green here is exactly the ` +
    `2026-08-22 defect that stopped specs/20260822/02's build: got ${JSON.stringify(out.findings)}`)
  const row = out.files.find(f => f.path === 'tests/x.test.js')
  assert.ok(row, `files[] must carry a row for tests/x.test.js — got ${JSON.stringify(out.files)}`)
  assert.deepStrictEqual(row.carriedAcs, ['AC-20260101-01-12'],
    `carriedAcs must list ONLY AC-20260101-01-12 — AC-20260101-01-1 appearing here would prove the ` +
    `classifier is still matching it as a bare substring of the longer id's full token: got ${JSON.stringify(row.carriedAcs)}`)
  assert.strictEqual(row.expected, 'green',
    `full-token classification must see this file as carrying only a SANCTIONED AC and expect ` +
    `green — got ${JSON.stringify(row)}`)
  assert.strictEqual(row.observed, 'green',
    `the file's own test genuinely passes against the pre-image — got ${JSON.stringify(row)}`)
})
