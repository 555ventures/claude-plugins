#!/usr/bin/env node
'use strict'
// tests/fixtures/genesis/storybook-build-stub.js --index <fixture.json> -o <dir> [--no-iframe]
// [--fail] — a synthetic `storybook build` standing in for genesis-driver.js's runStorybookBuild
// (specs/20260926/05-the-kit-and-the-journey-stories.md D3/D5/D8): copies the named index.json
// fixture into <dir>/index.json and writes <dir>/iframe.html unless --no-iframe; --fail prints one
// line and exits 1 before writing anything. Every invocation bumps the counter file named by the
// STORYBOOK_BUILD_CALL_COUNTER env var when set (unset means no counter is kept) — callers use it
// to assert how many times a mark actually ran the build.
//
// Does NOT: read or validate any real Storybook config, or produce any file beyond index.json and
// iframe.html.
//
// Exit codes: 0 success · 1 --fail was given (one line on stdout naming the forced failure) ·
// 2 usage error (missing --index or -o)

const fs = require('fs')
const path = require('path')

function flag(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}
const has = (name) => process.argv.includes(name)

const indexPath = flag('--index')
const outDir = flag('-o')
if (!indexPath || !outDir) {
  process.stderr.write('usage: storybook-build-stub.js --index <fixture.json> -o <dir> [--no-iframe] [--fail]\n')
  process.exit(2)
}

const counterPath = process.env.STORYBOOK_BUILD_CALL_COUNTER
if (counterPath) {
  let n = 0
  try { n = parseInt(fs.readFileSync(counterPath, 'utf8'), 10) || 0 } catch { n = 0 }
  fs.writeFileSync(counterPath, String(n + 1))
}

if (has('--fail')) {
  process.stdout.write('storybook build: fixture-forced failure (--fail)\n')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
fs.copyFileSync(indexPath, path.join(outDir, 'index.json'))
if (!has('--no-iframe')) fs.writeFileSync(path.join(outDir, 'iframe.html'), '<!doctype html><html></html>\n')
process.exit(0)
