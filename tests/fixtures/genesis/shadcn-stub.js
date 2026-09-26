#!/usr/bin/env node
'use strict'
// tests/fixtures/genesis/shadcn-stub.js — a synthetic `shadcn` CLI standing in for
// catalog-inventory.js's `--shadcn`/GENESIS_SHADCN_COMMAND override (specs/20260926/04-the-
// design-brief.md D4, A9). `node shadcn-stub.js info --json` prints a canned info payload whose
// `links.components` is a `file:` URL into a fixture docs directory, and bumps a call-count file
// so a caller (AC-9) can assert the real inventory script never re-runs it. Configurable via env
// (STUB_COMPONENTS csv, STUB_DOCS_DIR, STUB_COUNTER) or a stub-config.json in cwd — no argument
// parsing beyond the one `info --json` invocation catalog-inventory.js ever makes.
//
// Does NOT: implement any other shadcn subcommand, hit the network, or validate its own config.
//
// Exit codes: 0 on `info --json` · 2 on any other invocation.

const fs = require('fs')
const path = require('path')

function loadConfig() {
  const cfgPath = path.join(process.cwd(), 'stub-config.json')
  let cfg = {}
  if (fs.existsSync(cfgPath)) {
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch { cfg = {} }
  }
  const components = process.env.STUB_COMPONENTS
    ? process.env.STUB_COMPONENTS.split(',')
    : (cfg.components || ['button', 'card'])
  const docsDir = process.env.STUB_DOCS_DIR || cfg.docsDir || process.cwd()
  const counterPath = process.env.STUB_COUNTER || cfg.counterPath || path.join(process.cwd(), 'shadcn-stub-calls.txt')
  return { components, docsDir, counterPath }
}

function bumpCounter(counterPath) {
  let n = 0
  try { n = parseInt(fs.readFileSync(counterPath, 'utf8'), 10) || 0 } catch { n = 0 }
  fs.writeFileSync(counterPath, String(n + 1))
}

const [sub, ...rest] = process.argv.slice(2)
const { components, docsDir, counterPath } = loadConfig()

if (sub === 'info' && rest.includes('--json')) {
  bumpCounter(counterPath)
  const linksBase = 'file://' + path.resolve(docsDir) + '/'
  process.stdout.write(JSON.stringify({
    components,
    links: { components: linksBase + '[component].md' },
    config: { base: 'radix' },
  }) + '\n')
  process.exit(0)
}

process.stderr.write('shadcn-stub: unknown invocation "' + process.argv.slice(2).join(' ') + '"\n')
process.exit(2)
