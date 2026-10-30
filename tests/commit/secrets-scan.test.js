'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261029/04-the-four-questions-that-did-not-exist.md D1/D1a:
// AC-20261029-04-1 (the scanner's exit codes and hits), AC-20261029-04-2 (commit.md's question).

const SCRIPT = 'scripts/secrets-scan.js'
// Assembled at runtime so this tracked file never holds a literal the scanner flags itself.
const AWS_KEY = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP'

function write(dir, rel, content) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), content)
}

function hostWith(files) {
  const dir = fs.realpathSync(tmpdir('ss'))
  gitRepo(dir)
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content)
  return dir
}

const byPath = (hits) => [...hits].sort((a, b) => (a.path < b.path ? -1 : 1))

test('AC-20261029-04-1: WHEN the uncommitted set holds .env, id_rsa, an AWS-key line, .env.example and an allow-marked line THE SYSTEM SHALL exit 1 with exactly the three real hits', () => {
  const dir = hostWith({
    '.env': 'X=1\n',
    'id_rsa': 'anything\n',
    'src/a.js': AWS_KEY + '\nconst a = 1\n',
    '.env.example': 'X=\n',
    'src/ok.js': 'const k = "' + AWS_KEY + '" // secrets-scan:allow\n',
  })
  const r = runNode(SCRIPT, ['--root', dir, '--worktree', '--json'])
  assert.strictEqual(r.status, 1, 'a scan with hits must exit 1 so commit.md asks its question; a wrong exit lets a secret stage silently: ' + r.stdout + r.stderr)
  const hits = byPath(JSON.parse(r.stdout).hits)
  assert.deepStrictEqual(hits, [
    { path: '.env', reason: 'path:.env', line: null },
    { path: 'id_rsa', reason: 'path:id_rsa', line: null },
    { path: 'src/a.js', reason: 'content:AKIA[0-9A-Z]{16}', line: 1 },
  ], 'the hit set must be exactly the three real secrets — an extra hit (.env.example, the allow-marked line) trains users to dismiss the question, a missing one stages a secret: ' + r.stdout)
})

test('AC-20261029-04-1: WHEN the uncommitted set is only a file containing hello THE SYSTEM SHALL exit 0 printing {"hits":[]}', () => {
  const dir = hostWith({ 'src/b.js': 'hello\n' })
  const r = runNode(SCRIPT, ['--root', dir, '--worktree', '--json'])
  assert.strictEqual(r.status, 0, 'a clean tree must exit 0 or every commit would prompt: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(JSON.parse(r.stdout), { hits: [] }, 'a clean tree must print an empty hits list so --json consumers parse it: ' + r.stdout)
})

test('AC-20261029-04-1: WHEN --root is not a git work tree THE SYSTEM SHALL exit 2 with a reason on stderr', () => {
  const dir = fs.realpathSync(tmpdir('ss-nogit'))
  const r = runNode(SCRIPT, ['--root', dir, '--worktree', '--json'])
  assert.strictEqual(r.status, 2, 'a usage error must exit 2 so commit.md prints its skipped line instead of treating it as a hit: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /\S/, 'exit 2 must say why on stderr — commit.md prints that line verbatim: ' + r.stderr)
})

test('AC-20261029-04-1: WHEN --paths lists one file THE SYSTEM SHALL scan only that file, print plain hit lines, and print "no secrets found" on a clean list', () => {
  const dir = hostWith({ 'src/a.js': AWS_KEY + '\n', 'src/b.js': 'hello\n', 'server.pem': 'x\n' })
  const list = path.join(dir, 'paths.txt')
  fs.writeFileSync(list, 'src/a.js\n')
  const hit = runNode(SCRIPT, ['--root', dir, '--paths', list])
  assert.strictEqual(hit.status, 1, '--paths with a secret must exit 1: ' + hit.stdout + hit.stderr)
  assert.match(hit.stdout, /^src\/a\.js\s+content:AKIA\[0-9A-Z\]\{16\}:1$/m, 'the plain format is "<path>  <reason>:<line>"; a different shape breaks the human render: ' + hit.stdout)
  assert.ok(!/server\.pem/.test(hit.stdout), '--paths must scan only the listed files, or an unrelated untracked file blocks the commit: ' + hit.stdout)
  fs.writeFileSync(list, 'src/b.js\n')
  const clean = runNode(SCRIPT, ['--root', dir, '--paths', list])
  assert.strictEqual(clean.status, 0, 'a clean --paths list must exit 0: ' + clean.stdout + clean.stderr)
  assert.match(clean.stdout, /no secrets found/, 'a clean plain run must say so, or silence is indistinguishable from a crash: ' + clean.stdout)
})

test('AC-20261029-04-1: WHEN a file is binary, or a path hit also holds a content match THE SYSTEM SHALL skip the binary and report the path hit once', () => {
  const dir = hostWith({
    'logo.bin': Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(AWS_KEY)]).toString('latin1'),
    'my.pem': AWS_KEY + '\n',
  })
  const r = runNode(SCRIPT, ['--root', dir, '--worktree', '--json'])
  assert.strictEqual(r.status, 1, 'the path hit must still exit 1: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(JSON.parse(r.stdout).hits, [{ path: 'my.pem', reason: 'path:*.pem', line: null }],
    'a NUL-bearing file must be skipped and a path hit must short-circuit its content scan — otherwise one secret file asks twice or binaries cause noise: ' + r.stdout)
})

test('AC-20261029-04-2: WHEN git/commands/commit.md is read THE SYSTEM SHALL carry the scan in Step 1, the Exclude question, the reset line and the new rule, and no longer promise to stage sensitive files', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../../git/commands/commit.md')), 'commit.md is missing, so the secrets question cannot exist')
  const text = read('git/commands/commit.md')
  const m = text.match(/^## Step 1[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)
  assert.ok(m, 'commit.md lost its Step 1 section, so no batch can carry the scan')
  assert.ok(m[1].includes('spec-paths secrets-scan'), 'Step 1 must run the scan in its batch, or secrets stage with no question')
  assert.match(text, /AskUserQuestion[\s\S]*Exclude them \(Recommended\)/, 'the first option must be "Exclude them (Recommended)" so the safe default is one keypress')
  assert.ok(text.includes('git reset -q -- '), 'the exclude arm must unstage the hit paths with a quiet reset, or "exclude" excludes nothing')
  assert.ok(text.includes('Secrets never stage silently'), 'rule 5 must state that a hit is a question, not a warning')
  assert.ok(!text.includes('but still stage them'), 'the old "warn but still stage" rule contradicts the new question and must be gone')
})
