'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')

// Escape class from review rv_e028d73852e2 (smoke-port exit-143 flake). smoke.sh stops the
// boot the moment its ready marker appears; a boot string that touches the marker before its
// `trap … TERM` lets that signal land with no handler. bash cannot be paused between two
// builtins, so the race is pinned by shape, not timing.

const TESTS = path.join(ROOT, 'tests')

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : jsFiles(p)
    return e.name.endsWith('.js') ? [p] : []
  })
}

test('every test boot string that traps TERM installs the trap before touching its ready marker', () => {
  const self = path.basename(__filename)
  const offenders = []
  let checked = 0
  for (const file of jsFiles(TESTS)) {
    if (path.basename(file) === self) continue
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return
      const trap = line.search(/\btrap\s+(?:'[^']*'|"[^"]*"|\S+)(?:\s+\w+)*?\s+(?:SIG)?TERM\b/)
      const touch = line.search(/\btouch\s/)
      if (trap < 0 || touch < 0) return
      checked++
      if (touch < trap) offenders.push(`${path.relative(TESTS, file)}:${i + 1}: ${line.trim()}`)
    })
  }
  assert.ok(checked > 0, 'the scan found no trap+touch boot strings — the pattern no longer matches the fixtures')
  assert.deepStrictEqual(offenders, [],
    'a boot string touches its ready marker before trapping TERM — smoke.sh can stop it before the handler exists (exit 143). Move the trap first:\n' + offenders.join('\n'))
})
