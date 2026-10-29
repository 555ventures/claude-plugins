'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260926/04-the-design-brief.md — catalog-inventory.js locates components.json from the recorded kit path and re-checks its own output as current.

const SCRIPT = 'scripts/catalog-inventory.js'
const STUB = path.join(__dirname, '..', 'fixtures', 'genesis', 'shadcn-stub.js')

const FIELD_DOC = [
  '# Field', '', '## Composition', '',
  '### Field', 'One labelled control.', '',
  '```md', '## not the end', '### not a heading', '```', '',
  '### With label and value', 'A read-only pair.', '',
  '## Usage', 'after the section',
].join('\n') + '\n'

function host(name, { kit } = {}) {
  const dir = tmpdir(name)
  const docs = path.join(dir, 'docs-src')
  fs.mkdirSync(docs, { recursive: true })
  fs.writeFileSync(path.join(docs, 'field.md'), FIELD_DOC)
  fs.writeFileSync(path.join(docs, 'button.md'), '# Button\n\n## Composition\n\nA button.\n')
  if (kit) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), JSON.stringify({ design: { kit } }))
  }
  const env = { ...process.env, STUB_COMPONENTS: 'field,button', STUB_DOCS_DIR: docs, STUB_COUNTER: path.join(dir, 'calls.txt') }
  const run = (argv) => runNode(SCRIPT, [...argv, '--shadcn', 'node ' + STUB], { env })
  return { dir, run }
}

test('a monorepo with components.json beside its app generates and re-checks from the repo root', () => {
  const { dir, run } = host('catalog-monorepo', { kit: 'apps/web/src/components/kit' })
  fs.mkdirSync(path.join(dir, 'apps/web/src/components/kit'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'apps/web/components.json'), '{}')
  const out = path.join(dir, 'docs/design/catalog.md')

  const gen = run(['--root', dir, '--out', 'docs/design/catalog.md'])
  assert.strictEqual(gen.status, 0, 'generating from the repo root failed, so genesis records no catalog: ' + gen.stderr)
  const md = fs.readFileSync(out, 'utf8')
  assert.doesNotMatch(md, /catalog: none/, 'the root had no components.json, so the kit config beside the app was never found and the catalog was emptied')
  assert.match(md, /^### field$/m, 'a listed component is missing from the catalog page')
  assert.match(md, /^### button$/m, 'a listed component is missing from the catalog page')

  const check = run(['--root', dir, '--out', 'docs/design/catalog.md', '--check'])
  assert.strictEqual(check.stdout, 'current\n', 'checking from the repo root did not read the kit config beside the app: ' + check.stdout)
  assert.strictEqual(check.status, 0, 'doctor would warn on a current catalog')
})

test('no components.json on the kit chain never overwrites a catalog that lists components', () => {
  const { dir, run } = host('catalog-no-kit-config', { kit: 'apps/web/src/components/kit' })
  const out = path.join(dir, 'docs/design/catalog.md')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const before = '# Catalog\n\n## Components\n### button\nA button.\n'
  fs.writeFileSync(out, before)

  const r = run(['--root', dir, '--out', 'docs/design/catalog.md'])
  assert.strictEqual(r.status, 1, 'a missing kit config passed silently while a populated catalog stood: ' + r.stdout)
  assert.match(r.stdout, /apps\/web\/src\/components\/kit/, 'the refusal does not name the chain it searched: ' + r.stdout)
  assert.strictEqual(fs.readFileSync(out, 'utf8'), before, 'a populated catalog was overwritten with "none"')
})

test('--check with no components.json on the kit chain names the search, never lists every entry removed', () => {
  const { dir, run } = host('catalog-check-no-kit-config', { kit: 'apps/web/src/components/kit' })
  const out = path.join(dir, 'docs/design/catalog.md')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, '# Catalog\n\n## Components\n### button\nA button.\n')

  const r = run(['--root', dir, '--out', 'docs/design/catalog.md', '--check'])
  assert.strictEqual(r.status, 1, 'doctor would read a missing kit config as a current catalog: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /removed:/, 'doctor reports every component removed instead of the missing kit config: ' + r.stdout)
  assert.match(r.stdout, /searched apps\/web\/src\/components\/kit → .*\./, 'the refusal does not name the chain it searched: ' + r.stdout)
})

test('genesis design-paths.json locates components.json before the config has a design block', () => {
  const { dir, run } = host('catalog-design-paths')
  fs.mkdirSync(path.join(dir, '.claude/genesis'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/design-paths.json'), JSON.stringify({ kit: 'app/components/kit' }))
  fs.mkdirSync(path.join(dir, 'app/components/kit'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'app/components.json'), '{}')

  assert.strictEqual(run(['--root', dir, '--out', 'docs/design/catalog.md']).status, 0, 'genesis generation failed on a host whose kit config sits beside the app')
  assert.match(fs.readFileSync(path.join(dir, 'docs/design/catalog.md'), 'utf8'), /^### field$/m, 'genesis wrote an empty catalog because design-paths.json was not read')
})

test('a catalog generated from compositions with their own headings re-checks as current', () => {
  const { dir, run } = host('catalog-idempotent')
  fs.writeFileSync(path.join(dir, 'components.json'), '{}')
  const out = path.join(dir, 'docs/design/catalog.md')

  assert.strictEqual(run(['--root', dir, '--out', 'docs/design/catalog.md']).status, 0, 'generation failed, so no catalog exists to re-check')
  const md = fs.readFileSync(out, 'utf8')
  assert.match(md, /^#### With label and value$/m, 'a composition heading was not demoted below the component heading')
  assert.match(md, /^### not a heading$/m, 'a line inside a code fence was rewritten')
  assert.match(md, /A read-only pair\./, 'a "## " line inside a code fence ended the composition early')
  assert.doesNotMatch(md, /after the section/, 'the section after Composition leaked into the catalog entry')

  const check = run(['--root', dir, '--out', 'docs/design/catalog.md', '--check'])
  assert.strictEqual(check.stdout, 'current\n', 'a fresh catalog read back composition headings as components: ' + check.stdout)
  assert.strictEqual(check.status, 0, 'doctor would warn on a catalog generated a moment ago')
})
