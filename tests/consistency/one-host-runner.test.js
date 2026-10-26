'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, tmpdir } = require('../helpers')

// specs/20261026/01-one-runner-for-host-commands.md: AC-20261026-01-8 (no shell spawn outside
// spec/scripts/lib/host-run.js) and AC-20261026-01-9 (the retired helper names are gone).

const HOST_RUN = path.join('lib', 'host-run.js')

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

// One finding per (file, pattern) hit. `exec(`/`execSync(` count only when not preceded by `.` or
// a word character, so `regex.exec(` and `foo_exec(` never match.
const SHELL_PATTERNS = [
  ["['-c'", (s) => s.includes("['-c'")],
  ['["-c"', (s) => s.includes('["-c"')],
  ['shell: true', (s) => s.includes('shell: true')],
  ['exec(', (s) => /(?<![.\w])(exec|execSync)\(/.test(s)],
]

function shellSpawnFindings(scriptsDir) {
  const findings = []
  for (const file of walk(scriptsDir, [])) {
    if (path.relative(scriptsDir, file) === HOST_RUN) continue
    const src = fs.readFileSync(file, 'utf8')
    for (const [name, hit] of SHELL_PATTERNS) {
      if (hit(src)) findings.push(path.relative(scriptsDir, file) + ': ' + name)
    }
  }
  return findings
}

test('AC-20261026-01-8: spec/scripts contains no shell spawn outside lib/host-run.js', () => {
  assert.ok(fs.existsSync(path.join(SPEC, 'scripts/lib/host-run.js')),
    'lib/host-run.js is missing — the ban has no sanctioned home to point at')
  assert.deepStrictEqual(shellSpawnFindings(path.join(SPEC, 'scripts')), [],
    'a shell spawn outside lib/host-run.js is a site with its own cwd, env scrubbing and quoting — the defect class this ban exists to end')
})

test('AC-20261026-01-8: a planted bash -c spawn in a scanned copy is reported once, naming its file', () => {
  const dir = tmpdir('one-runner-plant')
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib/host-run.js'), "spawnSync('bash', ['-c', x])\n")
  fs.writeFileSync(path.join(dir, 'clean.js'), "const m = /a/.exec('a')\n")
  fs.writeFileSync(path.join(dir, 'planted.js'), "spawnSync('bash', ['-c', x])\n")
  assert.deepStrictEqual(shellSpawnFindings(dir), ["planted.js: ['-c'"],
    'the scan must flag a new site by file, exempt only lib/host-run.js and ignore regex.exec — otherwise the ban fails open or blocks innocent code')
})

// The retired names are assembled from fragments so this tracked file never matches its own scan.
const RETIRED = ['boot' + 'Line', 'shell' + 'Quote' + 'Single']

test('AC-20261026-01-9: spec/scripts and tests hold zero live hits of the retired identifiers', () => {
  const hits = []
  for (const dir of [path.join(SPEC, 'scripts'), path.join(ROOT, 'tests')]) {
    for (const file of walk(dir, [])) {
      const src = fs.readFileSync(file, 'utf8')
      for (const name of RETIRED) if (src.includes(name)) hits.push(path.relative(ROOT, file) + ': ' + name)
    }
  }
  assert.deepStrictEqual(hits, [],
    'a live retired helper name means a second quoting/boot-line form survived beside lib/host-run.js')
})
