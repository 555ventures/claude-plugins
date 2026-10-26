'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC } = require('../helpers')

// specs/20261026/01-one-runner-for-host-commands.md: AC-20261026-01-1, AC-20261026-01-2,
// AC-20261026-01-3, AC-20261026-01-4 pin spec/scripts/lib/host-run.js, the one module that runs
// or prints a host command string.

const LIB = path.join(SPEC, 'scripts/lib/host-run.js')

function load() {
  assert.ok(fs.existsSync(LIB),
    'spec/scripts/lib/host-run.js is missing — without the one runner every driver keeps its own shell line, quoting and env scrubbing')
  return require(LIB)
}

function printfBack(quoted) {
  return spawnSync('bash', ['-c', 'printf %s ' + quoted], { encoding: 'utf8' })
}

test('AC-20261026-01-1: quote returns a safe value bare and single-quotes everything else so bash -c printf prints the original', () => {
  const { quote } = load()
  const cases = [
    ['tests/a.test.js', 'tests/a.test.js'],
    ['customers.$memberId.test.tsx', "'customers.$memberId.test.tsx'"],
    ["it's `x`", "'it'\\''s `x`'"],
    ['', "''"],
  ]
  for (const [raw, expected] of cases) {
    const q = quote(raw)
    assert.strictEqual(q, expected,
      'quote must follow the contract form byte-for-byte, or a spliced path/filter changes meaning in the shell: ' + JSON.stringify(raw))
    const r = printfBack(q)
    assert.strictEqual(r.stdout, raw,
      'a quoted value must round-trip through bash unchanged, or a host command receives a different argument than the plugin meant: ' + JSON.stringify(raw))
  }
  const glob = quote('tests/*.test.js')
  assert.strictEqual(printfBack(glob).stdout, 'tests/*.test.js',
    'a glob must stay literal after quoting, or the shell expands it before the host command sees it: ' + glob)
})

test('AC-20261026-01-2: printable returns an export line whose every command of a compound sees the values under sh -c, drops null entries and quotes unsafe values', () => {
  const { printable } = load()
  const compound = 'echo "a=$PORT" && cd / && exec sh -c \'echo "b=$PORT"\''
  const line = printable(compound, { PORT: 4321 })
  const r = spawnSync('sh', ['-c', line], { encoding: 'utf8', env: { PATH: process.env.PATH } })
  assert.strictEqual(r.stdout, 'a=4321\nb=4321\n',
    'a bare VAR= prefix reaches only the first command; the export form must reach the server at the end of a compound boot line: ' + JSON.stringify(line))
  assert.strictEqual(printable('pnpm dev', { PORT: undefined }), 'pnpm dev',
    'a fixed-address host gets the command untouched — no variable it never opted into')
  assert.strictEqual(printable('pnpm dev', { PORT: null }), 'pnpm dev',
    'a null entry is dropped like an undefined one, or the printed line exports PORT=null')
  assert.strictEqual(printable('pnpm dev'), 'pnpm dev',
    'no env at all must return the command unchanged')
  assert.strictEqual(printable('x', { BASE_URL: 'http://h/?a=1&b=2' }), "export BASE_URL='http://h/?a=1&b=2'; x",
    'a value carrying & must be single-quoted or the shell backgrounds the command at the ampersand')
  assert.strictEqual(printable('x', { A: 1, B: 'two words' }), "export A=1 B='two words'; x",
    'several entries share one export statement in insertion order')
})

test('AC-20261026-01-3: run gives env additions to every command of a compound, keeps the parent PATH, and strips NODE_TEST_CONTEXT from the child', () => {
  const { run } = load()
  const prev = process.env.NODE_TEST_CONTEXT
  process.env.NODE_TEST_CONTEXT = 'child-v8'
  try {
    const r = run('echo "$X" && cd / && sh -c \'echo "$X-${NODE_TEST_CONTEXT:-none}"\'', { env: { X: 'v' }, encoding: 'utf8' })
    assert.strictEqual(r.stdout, 'v\nv-none\n',
      'a host command must never inherit this repo\'s test-runner context (a nested node --test would exit 0 over failing tests) and every command of a compound must see the additions: ' + JSON.stringify(r))
    const p = run('echo "$PATH"', { env: { X: 'v' }, encoding: 'utf8' })
    assert.strictEqual(p.stdout.trim(), process.env.PATH,
      'env is additions over process.env — dropping the parent PATH makes every host binary unresolvable: ' + JSON.stringify(p))
    const forced = run('echo "${NODE_TEST_CONTEXT:-none}"', { env: { NODE_TEST_CONTEXT: 'explicit' }, encoding: 'utf8' })
    assert.strictEqual(forced.stdout.trim(), 'none',
      'NODE_TEST_CONTEXT is deleted whatever the caller passed, or one site can quietly re-leak the runner context: ' + JSON.stringify(forced))
  } finally {
    if (prev === undefined) delete process.env.NODE_TEST_CONTEXT
    else process.env.NODE_TEST_CONTEXT = prev
  }
})

test('AC-20261026-01-4: runAsync resolves { code, out, err } with the exit code, 127 when bash cannot be spawned and 1 when the child is killed by a signal', async () => {
  const { runAsync } = load()
  const ok = await runAsync('echo o; echo e >&2; exit 3')
  assert.deepStrictEqual(ok, { code: 3, out: 'o\n', err: 'e\n' },
    'legs read the exit code and both streams from this shape — any drift silently changes what review and release record: ' + JSON.stringify(ok))
  const killed = await runAsync('kill -9 $$')
  assert.strictEqual(killed.code, 1,
    'a signal-killed child has a null code; resolving it as success would let a crashed leg pass: ' + JSON.stringify(killed))
  const missing = await runAsync('true', { cwd: '/nonexistent-dir-for-host-run-test' })
  assert.strictEqual(missing.code, 127,
    'a spawn failure must resolve code 127, never reject — a leg awaiting it would crash instead of recording a red row: ' + JSON.stringify(missing))
})
