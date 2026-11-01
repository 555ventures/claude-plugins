'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, ROOT, SPEC } = require('../helpers')

// specs/20261101/02-the-host-declares-its-file-shapes.md: AC-20261101-02-1 .. AC-20261101-02-10 pin
// lib/file-shapes.js (the one home of the test/code/manifest classification) and every consumer
// that now reads through it, by executing each script against synthetic hosts A and B (Behavior).

const SHAPES_PATH = path.join(SPEC, 'scripts/lib/file-shapes.js')

function loadShapes() {
  assert.ok(fs.existsSync(SHAPES_PATH),
    'spec/scripts/lib/file-shapes.js does not exist — the one classification home is unbuilt, so every consumer still carries a private table')
  return require(SHAPES_PATH)
}

function put(root, rel, body) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

function config(root, cfg) {
  put(root, '.claude/spec.config.json', JSON.stringify(cfg))
}

// Fixture host A: Ruby/Java/.NET/Go layout, no fileShapes (Behavior).
function hostA(prefix, cfg) {
  const root = tmpdir(prefix)
  if (cfg) config(root, cfg)
  put(root, 'spec/models/user_spec.rb', "# exercises src/app.rb\nrequire 'app'\n")
  put(root, 'src/test/java/FooTest.java', 'class FooTest {}\n')
  put(root, 'Foo.Tests/BarTests.cs', 'class BarTests {}\n')
  put(root, 'src/pkg/test_foo.py', 'def test_foo(): pass\n')
  put(root, 'crates/a/tests/it.rs', '#[test] fn it() {}\n')
  put(root, 'packages/a/tests/x.ts', "test('ts case', () => {})\n")
  put(root, 'src/app.rb', 'class App; end\n')
  put(root, 'pom.xml', '<project/>\n')
  put(root, 'Api/Api.csproj', '<Project/>\n')
  put(root, 'tools/run.py', 'print("run")\n')
  return root
}

// Fixture host B: a declared block replacing all three lists.
function hostB(prefix) {
  const root = tmpdir(prefix)
  config(root, { fileShapes: { testGlobs: ['qa/**'], codeExtensions: ['.rb'], manifests: ['Gemfile'] } })
  put(root, 'qa/a_spec.rb', 'describe\n')
  put(root, 'tests/b.test.js', "test('b case', () => {})\n")
  put(root, 'Gemfile', "source 'x'\n")
  put(root, 'pom.xml', '<project/>\n')
  return root
}

test('AC-20261101-02-1: fileShapes({}) returns the three stack-neutral default arrays verbatim and a one-key block overrides only that key', () => {
  const m = loadShapes()
  const d = m.fileShapes({})
  assert.deepStrictEqual(d.testGlobs, m.DEFAULT_TEST_GLOBS, 'an absent block must yield DEFAULT_TEST_GLOBS verbatim or a host that declares nothing is classified differently')
  assert.deepStrictEqual(d.codeExtensions, m.DEFAULT_CODE_EXTENSIONS, 'an absent block must yield DEFAULT_CODE_EXTENSIONS verbatim')
  assert.deepStrictEqual(d.manifests, m.DEFAULT_MANIFESTS, 'an absent block must yield DEFAULT_MANIFESTS verbatim')
  assert.strictEqual(d.testGlobs[0], 'tests/**', 'the first default test glob anchors this repo\'s own classification')
  assert.strictEqual(d.testGlobs.length, 13, 'the widened default is the thirteen contract entries — fewer leaves audit layouts unclassified')
  assert.ok(d.codeExtensions.includes('.cs'), 'a .NET host\'s code files must be recognised by default')
  assert.strictEqual(d.codeExtensions.length, 33, 'the Contracts literal list of code extensions is 33 entries')
  assert.ok(d.manifests.includes('pom.xml'), 'a Maven host\'s manifest must be recognised by default')
  assert.strictEqual(d.manifests.length, 37, 'the Contracts literal list of manifests is 37 entries')
  const o = m.fileShapes({ fileShapes: { testGlobs: ['qa/**'] } })
  assert.deepStrictEqual(o.testGlobs, ['qa/**'], 'a declared key replaces its default, never extends it')
  assert.deepStrictEqual(o.codeExtensions, m.DEFAULT_CODE_EXTENSIONS, 'an absent sibling key keeps its default or a one-key block silently drops the other lists')
  assert.deepStrictEqual(o.manifests, m.DEFAULT_MANIFESTS, 'an absent sibling key keeps its default (manifests)')
})

test('AC-20261101-02-2: isTestClassified marks the six audit layouts as tests and isManifest recognises pom.xml, *.csproj and requirements*.txt under the defaults', () => {
  const m = loadShapes()
  const shapes = m.fileShapes({})
  for (const p of ['spec/models/user_spec.rb', 'src/test/java/FooTest.java', 'Foo.Tests/BarTests.cs',
    'src/pkg/test_foo.py', 'crates/a/tests/it.rs', 'packages/a/tests/x.ts']) {
    assert.strictEqual(m.isTestClassified(p, shapes), true, p + ' must classify as a test or the at-risk leg and ac-drift miss it on that stack')
  }
  for (const p of ['spec/scripts/count-tests.js', 'src/app.rb']) {
    assert.strictEqual(m.isTestClassified(p, shapes), false, p + ' must NOT classify as a test or implementation files get treated as pins')
  }
  for (const b of ['pom.xml', 'Api.csproj', 'requirements-dev.txt']) {
    assert.strictEqual(m.isManifest(b, shapes), true, b + ' must be a manifest or a dependency change skips the structural lint silently')
  }
  assert.strictEqual(m.isManifest('README.md', shapes), false, 'README.md is not a manifest, so flagging it would cry wolf on every doc row')
  assert.strictEqual(m.isCodeFile('tools/run.py', shapes), true, 'a .py file is a code file under the defaults or Python gate scripts stay unprotected')
  assert.strictEqual(m.isCodeFile('Api/Svc.CS', shapes), true, 'extension comparison is case-insensitive or upper-case extensions fall out of the universe')
  assert.strictEqual(m.isCodeFile('notes.txt', shapes), false, 'a .txt file is not a code file, so the universe would swallow prose')
})

test('AC-20261101-02-3: validateFileShapes names the first bad key and returns null for a valid block', () => {
  const m = loadShapes()
  assert.strictEqual(m.validateFileShapes({ testGlobs: 'tests/**' }), 'fileShapes.testGlobs must be an array of non-empty strings',
    'a string testGlobs must be refused with the exact message init-gen quotes to the author')
  const ext = m.validateFileShapes({ codeExtensions: ['rb'] })
  assert.ok(typeof ext === 'string' && ext.endsWith('must start with "."'),
    'an extension without a leading dot would never match path.extname and must be refused: ' + ext)
  assert.strictEqual(m.validateFileShapes([]), 'fileShapes must be an object', 'an array is not a block and would be read as one')
  assert.strictEqual(m.validateFileShapes({ manifests: ['Gemfile'] }), null, 'a valid block must pass or init-gen refuses good hosts')
})

test('AC-20261101-02-4: host-config exports no DEFAULT_TEST_GLOBS and no private classification table survives under spec/scripts outside lib/file-shapes.js', () => {
  const hc = require(path.join(SPEC, 'scripts/lib/host-config.js'))
  assert.ok(!('DEFAULT_TEST_GLOBS' in hc), 'host-config.js must not export DEFAULT_TEST_GLOBS — a second home lets the two lists drift')
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(d, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full)
    return e.isFile() && e.name.endsWith('.js') ? [full] : []
  })
  const re = /DEFAULT_TEST_GLOBS|TRACKED_EXT_RE|CODE_EXT\b|MANIFEST_RE/
  const hits = walk(path.join(SPEC, 'scripts'))
    .filter((f) => re.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f))
  assert.deepStrictEqual(hits, ['spec/scripts/lib/file-shapes.js'],
    'only lib/file-shapes.js may name the default lists; any other hit is a private table that disagrees with the host\'s declared shapes')
})

test('AC-20261101-02-5: count-tests counts a .ts case under host A and counts nothing under host B whose declared testGlobs replace the default', () => {
  const a = runNode('scripts/count-tests.js', ['--root', hostA('fs5a'), '--json'])
  assert.strictEqual(a.status, 0, 'count-tests must exit 0: ' + a.stderr)
  assert.strictEqual(JSON.parse(a.stdout).count, 1, 'packages/a/tests/x.ts is a test under the widened defaults; count 0 means the host\'s layout is invisible to the case count: ' + a.stdout)
  const b = runNode('scripts/count-tests.js', ['--root', hostB('fs5b'), '--json'])
  assert.strictEqual(b.status, 0, 'count-tests must exit 0 on host B: ' + b.stderr)
  assert.strictEqual(JSON.parse(b.stdout).count, 0, 'tests/b.test.js is not test-classified once the host declares testGlobs [qa/**]; counting it means fileShapes.testGlobs is ignored: ' + b.stdout)
})

function lintRow(root, row) {
  const spec = path.join(root, 'spec-under-test.md')
  put(root, 'rules.md', '# Rules\n\n## Risk Tiers\n\nauth and billing are critical.\n')
  const cfgPath = path.join(root, '.claude/spec.config.json')
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {}
  config(root, { ...cfg, pipelineRules: 'rules.md' })
  fs.writeFileSync(spec, '---\ntier: standard\nbreaking: false\n---\n\n# T\n\n## Decisions\n\n| ID | Decision | Why |\n|----|----------|-----|\n' +
    '| D1 | Rename the export route. | because |\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    row + '\n\n## Acceptance Criteria\n\n- **AC-1**: x\n')
  const r = runNode('scripts/decision-lint.js', ['--spec', spec, '--root', root, '--json'])
  let j = null
  try { j = JSON.parse(r.stdout) } catch { /* asserted by caller */ }
  return { r, j }
}

test('AC-20261101-02-6: decision-lint flags a name-less pom.xml and .csproj row on host A and flags nothing for pom.xml on host B', () => {
  for (const p of ['pom.xml', 'Api/Api.csproj']) {
    const { r, j } = lintRow(hostA('fs6a'), `| ${p} | MODIFY | other | adds a dependency |`)
    assert.ok(j, 'decision-lint --json must print JSON: ' + r.stderr + r.stdout)
    assert.ok(j.findings.some((f) => f.class === 'missing-dependency-names' && f.id === p),
      p + ' is a dependency manifest under the defaults; no finding means the structural lint skipped it silently: ' + r.stdout)
  }
  const b = lintRow(hostB('fs6b'), '| pom.xml | MODIFY | other | adds a dependency |')
  assert.ok(b.j, 'decision-lint must run on host B: ' + b.r.stderr)
  assert.ok(!b.j.findings.some((f) => f.class === 'missing-dependency-names'),
    'host B declared manifests [Gemfile], so pom.xml is not a manifest there; a finding means the declared list is ignored: ' + b.r.stdout)
})

test('AC-20261101-02-7: scope-reconcile --probe-at-risk reports a user_spec.rb citing app.rb as an at-risk hit on host A', () => {
  const root = hostA('fs7')
  const list = path.join(root, 'sample.txt')
  fs.writeFileSync(list, 'src/app.rb\n')
  const r = runNode('scripts/scope-reconcile.js', ['--probe-at-risk', list, '--root', root])
  assert.strictEqual(r.status, 0, 'the probe must exit 0: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.testFiles >= 1 && out.refs >= 1,
    'spec/models/user_spec.rb is a test file under the defaults and names app.rb; zero hits means the at-risk leg is inert on this layout: ' + r.stdout)
})

test('AC-20261101-02-8: expire-tests --invariants lists a python gate script named in gateCommand', () => {
  const root = hostA('fs8', { gateCommand: 'python3 tools/run.py' })
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--invariants', '--json'])
  assert.strictEqual(r.status, 0, 'invariants listing must exit 0: ' + r.stderr)
  assert.ok(JSON.parse(r.stdout).scripts.includes('tools/run.py'),
    'tools/run.py is the gate script; unlisted, expire-tests deletes the tests that protect it: ' + r.stdout)
})

test('AC-20261101-02-9: coverage-scope lists a .cs check that parses AC ids next to a done status', () => {
  const root = hostA('fs9')
  put(root, 'Checks/AcGate.cs', 'var re = new Regex(@"AC-\\d{8}"); if (status == "done") { }\n')
  const r = runNode('scripts/coverage-scope.js', ['--root', root, '--json'])
  assert.ok(JSON.parse(r.stdout).findings.includes('Checks/AcGate.cs'),
    '.cs is a code extension under the defaults; unscanned, a .NET host\'s coverage check that exempts done specs is never reported: ' + r.stdout + r.stderr)
})

function closure(root, rows, files) {
  for (const [rel, body] of Object.entries(files)) put(root, rel, body)
  const spec = path.join(root, 'specs/20261101/01-x.md')
  put(root, 'specs/20261101/01-x.md', '---\nstatus: hardened\n---\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    rows.join('\n') + '\n| `tests/other.test.js` | MODIFY | tests | x |\n')
  put(root, 'tests/other.test.js', '\n')
  const r = runNode('scripts/collision-closure.js', ['--root', root, '--spec', spec, '--json'])
  assert.ok(r.status === 0 || r.status === 1, 'collision-closure must run: ' + r.stderr)
  return JSON.parse(r.stdout)
}

test('AC-20261101-02-10: collision-closure tiers a shebang-less tools/run.py hit as executes and never a notes.txt hit', () => {
  const out = closure(hostA('fs10'), ['| `tools/run.py` | MODIFY | scripts | x |'],
    { 'tests/ref.test.js': '// references tools/run.py\n' })
  assert.ok(out.paths.find((p) => p.target === 'tools/run.py').hits.includes('tests/ref.test.js'),
    'the fixture must hit tools/run.py or this pins nothing: ' + JSON.stringify(out))
  assert.ok(out.executes.includes('tests/ref.test.js'),
    'tools/run.py is runnable under the defaults, so its citing test must tier executes; otherwise a planner is not told a test runs the script: ' + JSON.stringify(out))
  const ctl = closure(tmpdir('fs10c'), ['| `notes.txt` | MODIFY | other | x |'],
    { 'notes.txt': 'x\n', 'tests/ref.test.js': '// notes.txt\n' })
  assert.deepStrictEqual(ctl.executes, [],
    'a .txt target is not runnable; tiering it executes would cry wolf on every prose file: ' + JSON.stringify(ctl))
})
