'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, SPEC, ROOT } = require('../helpers')

// specs/20260926/04-the-design-brief.md D4: spec/scripts/catalog-inventory.js is the new
// shadcn-catalog inventory script — this file owns AC-20260926-04-6, AC-20260926-04-7,
// AC-20260926-04-8. The script does not exist yet, so every test below is red for that reason.

const SCRIPT = 'scripts/catalog-inventory.js'
const STUB = path.join(ROOT, 'tests/fixtures/genesis/shadcn-stub.js')
const CARD_DOCS_DIR = path.join(ROOT, 'tests/fixtures/genesis/catalog-docs')

function run(args, opts) {
  return runNode(SCRIPT, args, opts)
}

// Builds the exact `--shadcn "node <stub>"` argument catalog-inventory.js's own contract expects
// (D4: "default npx shadcn@latest, split on spaces") — the stub carries no argument-shaped
// config, so its behavior is threaded entirely through the child's own environment.
function shadcnArg() {
  return 'node ' + STUB
}

test('AC-20260926-04-6: WHEN catalog-inventory.js runs on a root with no components.json THE SYSTEM writes "catalog: none (no components.json)" to --out and exits 0', () => {
  const dir = tmpdir('catalog-inventory-ac6-none')
  const out = path.join(dir, 'catalog.md')
  const r = run(['--root', dir, '--out', out])
  assert.strictEqual(r.status, 0,
    'a root with no components.json must exit 0 — this is the ordinary non-UI/no-catalog host, never a failure: ' + r.stderr + r.stdout)
  assert.ok(fs.existsSync(out), '--out must be written even in the no-catalog case, or a caller has nothing to read: ' + out)
  assert.match(fs.readFileSync(out, 'utf8'), /catalog: none \(no components\.json\)/,
    'the written file must contain the literal "catalog: none (no components.json)" so a session reading it knows why the catalog is empty')
})

test('AC-20260926-04-6: WHEN a components.json exists and --shadcn is a stub listing button and card, with card\'s file: doc carrying a ## Composition section before ## API Reference THE SYSTEM writes ### button as composition: unavailable and ### card with only the Composition lines, and --json reports unavailable:1', () => {
  const dir = tmpdir('catalog-inventory-ac6-shadcn')
  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify({ aliases: { ui: 'src/components/ui' } }))
  const counter = path.join(dir, 'stub-calls.txt')
  const env = Object.assign({}, process.env, {
    STUB_COMPONENTS: 'button,card',
    STUB_DOCS_DIR: CARD_DOCS_DIR,
    STUB_COUNTER: counter,
  })

  const out = path.join(dir, 'catalog.md')
  const r = run(['--root', dir, '--out', out, '--shadcn', shadcnArg()], { env })
  assert.strictEqual(r.status, 0,
    'a components.json host with a working (stubbed) shadcn CLI must exit 0 — button has no matching fixture doc so it degrades to unavailable, never a failure: ' + r.stderr + r.stdout)

  const written = fs.readFileSync(out, 'utf8')
  assert.match(written, /### button\ncomposition: unavailable/,
    'button has no matching file: fixture doc (only card.md exists) — its section must read "composition: unavailable" verbatim: ' + written)
  const cardMatch = written.match(/### card\n([\s\S]*?)(?=\n### |$)/)
  assert.ok(cardMatch, 'a ### card heading must exist in the written catalog: ' + written)
  assert.match(cardMatch[1], /CardHeader/,
    'the ### card section must carry the Composition section\'s own lines (the CardHeader tree): ' + cardMatch[1])
  assert.ok(!cardMatch[1].includes('API Reference') && !cardMatch[1].includes('Prop'),
    'the ### card section must never carry lines from the API Reference heading that follows Composition in the fixture doc — their presence means the excerpt was not stopped at the next "## " heading: ' + cardMatch[1])

  const jsonRun = run(['--root', dir, '--out', out, '--shadcn', shadcnArg(), '--json'], { env: Object.assign({}, env, { STUB_COUNTER: path.join(dir, 'stub-calls-2.txt') }) })
  assert.strictEqual(jsonRun.status, 0, '--json must also exit 0 on the same host: ' + jsonRun.stderr + jsonRun.stdout)
  let parsed
  try {
    parsed = JSON.parse(jsonRun.stdout)
  } catch {
    assert.fail('--json must print parseable JSON: ' + JSON.stringify(jsonRun.stdout))
  }
  assert.strictEqual(parsed.ok, true, '--json ok must be true on a successful run: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.catalog, 'shadcn', '--json catalog must be "shadcn" once a shadcn CLI actually ran: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.unavailable, 1,
    '--json must report unavailable:1 — exactly button lacks a Composition section, and a wrong count means the unavailable derivation double-counts or misses a component: ' + JSON.stringify(parsed))
})

test('AC-20260926-04-7: WHEN --check runs against an existing inventory whose ### names are button, card and the stub now lists button, card, sheet THE SYSTEM exits 1 printing stale with added: sheet; WHEN the lists match THE SYSTEM exits 0 printing current; WHEN --out is absent THE SYSTEM exits 1 printing missing', () => {
  const dir = tmpdir('catalog-inventory-ac7-check')
  const out = path.join(dir, 'catalog.md')

  const missing = run(['--root', dir, '--out', out, '--check'])
  assert.strictEqual(missing.status, 1,
    '--check against a nonexistent --out must exit 1 — there is nothing to compare against, and a 0 here would let a stale-catalog check pass on a host that never generated one: ' + missing.stderr + missing.stdout)
  assert.match(missing.stdout + missing.stderr, /missing/,
    '--check on an absent --out must print "missing" so a caller knows to run the inventory without --check first')

  fs.writeFileSync(dir + '/components.json', JSON.stringify({ aliases: { ui: 'src/components/ui' } }))
  const env2 = Object.assign({}, process.env, { STUB_COMPONENTS: 'button,card', STUB_DOCS_DIR: CARD_DOCS_DIR, STUB_COUNTER: path.join(dir, 'c1.txt') })
  const gen = run(['--root', dir, '--out', out, '--shadcn', shadcnArg()], { env: env2 })
  assert.strictEqual(gen.status, 0, 'generating the baseline inventory must exit 0: ' + gen.stderr + gen.stdout)

  const current = run(['--root', dir, '--out', out, '--check', '--shadcn', shadcnArg()], { env: Object.assign({}, env2, { STUB_COUNTER: path.join(dir, 'c2.txt') }) })
  assert.strictEqual(current.status, 0,
    '--check against an inventory whose ### names still match the live component list must exit 0: ' + current.stderr + current.stdout)
  assert.match(current.stdout, /current/, '--check on a matching set must print "current": ' + current.stdout)

  const env3 = Object.assign({}, env2, { STUB_COMPONENTS: 'button,card,sheet', STUB_COUNTER: path.join(dir, 'c3.txt') })
  const stale = run(['--root', dir, '--out', out, '--check', '--shadcn', shadcnArg()], { env: env3 })
  assert.strictEqual(stale.status, 1,
    '--check against a live component list that has grown (sheet added) must exit 1 — the on-disk catalog is now stale: ' + stale.stderr + stale.stdout)
  assert.match(stale.stdout + stale.stderr, /stale/, 'the stale case must print the word "stale": ' + stale.stdout + stale.stderr)
  assert.match(stale.stdout + stale.stderr, /added:\s*sheet/,
    'the stale case must name the added component "sheet" so a session knows what changed: ' + stale.stdout + stale.stderr)
})

test('AC-20260926-04-8: WHEN catalog-inventory.js runs without --root or without --out THE SYSTEM exits 2 with a usage line on stderr', () => {
  const dir = tmpdir('catalog-inventory-ac8-usage')
  const noRoot = run(['--out', path.join(dir, 'catalog.md')])
  assert.strictEqual(noRoot.status, 2, 'a missing --root must exit 2 (usage), never a silent default: ' + noRoot.stderr + noRoot.stdout)
  assert.match(noRoot.stderr, /^usage:/, 'the usage error must start with "usage:" on stderr: ' + noRoot.stderr)

  const noOut = run(['--root', dir])
  assert.strictEqual(noOut.status, 2, 'a missing --out must exit 2 (usage): ' + noOut.stderr + noOut.stdout)
  assert.match(noOut.stderr, /^usage:/, 'the usage error must start with "usage:" on stderr: ' + noOut.stderr)
})
