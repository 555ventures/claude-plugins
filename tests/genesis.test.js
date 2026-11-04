'use strict'
// Pins genesis.js by walking the whole chain on a tmp git repo, playing the session's writes.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode } = require('./helpers')
const S = require('../spec/scripts/lib/state')

function setup() {
  const dir = tmpdir('gen')
  gitRepo(dir)
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  const run = (...a) => runNode('scripts/genesis.js', ['--root', dir, ...a])
  const mark = (verb, ...a) => run('--mark', verb, ...a)
  const step = () => run('--state').stdout.trim()
  return { dir, w, run, mark, step }
}
const brief = (dims) => `# Genesis brief\n\n## Idea\n\nclinic booking\n\n## Users\n\nclinics\n\n## Open dimensions\n\n${dims.map((d) => `- ${d}`).join('\n')}\n`
const BRIEF = (n, extra = '') => `# ${n}\n\nPhase: P0 · Depends on: — · Primary workspaces: app\n\n## Result\n\nx\n\n## Scope\n\n1. y\n\n## Out of scope\n\nz\n${extra}`

test('genesis walks idea to GROUNDED', () => {
  const g = setup()
  const first = g.run('clinic booking app for clinics')
  assert.strictEqual(first.status, 0, first.stderr)
  assert.match(first.stdout, /^▶ DISCOVERY/)
  assert.ok(!/clinic booking app/.test(first.stdout.split('when done')[1]), 'the mark line must not repeat the idea')
  assert.strictEqual(S.readGenesis(g.dir).idea, 'clinic booking app for clinics')
  assert.match(fs.readFileSync(path.join(g.dir, '.claude/genesis/brief.md'), 'utf8'), /clinic booking app for clinics/, 'the brief is seeded from the template')
  assert.strictEqual(g.mark('menus-done').status, 2, 'wrong mark refused')

  g.w('.claude/genesis/brief.md', '## Idea\nx\n')
  assert.strictEqual(g.mark('discovery-done').status, 2, 'a brief without Open dimensions is refused')
  g.w('.claude/genesis/brief.md', brief(['Framework', 'hosting']))
  assert.strictEqual(g.mark('discovery-done').status, 0)
  assert.strictEqual(g.step(), 'MENUS')

  assert.strictEqual(g.mark('menus-done').status, 2, 'menus-done needs every menu')
  g.w('.claude/genesis/menus/framework.md', '- **Next.js** — x\n')
  assert.strictEqual(g.mark('menu-written', '--file', '.claude/genesis/menus/framework.md').status, 0)
  assert.strictEqual(g.mark('menu-written', '--file', '.claude/genesis/menus/bogus.md').status, 2)
  g.w('.claude/genesis/menus/hosting.md', '- **Fly** — x\n')
  g.mark('menu-written', '--file', '.claude/genesis/menus/hosting.md')
  assert.deepStrictEqual(S.readGenesis(g.dir).menus, ['framework', 'hosting'])
  assert.strictEqual(g.mark('menus-done').status, 0)
  assert.strictEqual(g.step(), 'DECIDE')

  assert.strictEqual(g.mark('decided').status, 2, 'no descriptor yet')
  const desc = { name: 'clinic', language: 'js', framework: 'next', db: 'pg', auth: 'x', hosting: 'fly',
    testCommand: 'npm test', setupCommand: 'npm install', decided: [{ dimension: 'framework', choice: 'next', why: 'x' }] }
  g.w('.claude/genesis/stack-descriptor.json', JSON.stringify(desc))
  g.w('docs/adr/0001-framework.md', '# 0001. Framework\n')
  assert.strictEqual(g.mark('decided').status, 0)
  assert.strictEqual(g.step(), 'SCAFFOLD')

  g.w('package.json', JSON.stringify({ scripts: { test: 'node -e "console.log(\'boom\');process.exit(1)"' } }))
  g.mark('skeleton-landed')
  assert.strictEqual(g.step(), 'SCAFFOLD', 'a red gate stays at SCAFFOLD')
  assert.match(g.run().stdout, /RED[\s\S]*boom/, 'the tail is shown')
  g.w('package.json', JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }))
  assert.strictEqual(g.mark('skeleton-landed').status, 0)
  assert.strictEqual(g.step(), 'ROADMAP')

  g.w('docs/roadmap/00-overview.md', '# overview\n')
  g.w('docs/roadmap/01-first-light.md', BRIEF('01'))
  g.w('docs/roadmap/02-booking.md', BRIEF('02'))
  assert.strictEqual(g.mark('roadmap-written').status, 2, 'fewer than 3 briefs refused')
  g.w('docs/roadmap/03-billing.md', 'no header\n')
  assert.strictEqual(g.mark('roadmap-written').status, 2, 'a malformed brief refused')
  g.w('docs/roadmap/03-billing.md', BRIEF('03'))
  assert.strictEqual(g.mark('roadmap-written').status, 0)
  assert.deepStrictEqual(S.readQueue(g.dir).items.map((i) => [i.kind, i.payload]),
    ['01-first-light', '02-booking', '03-billing'].map((b) => ['brief', `docs/roadmap/${b}.md`]))
  assert.strictEqual(g.step(), 'HANDOFF')

  g.w('.claude/spec.config.json', JSON.stringify({ lanes: 5, trunk: 'trunk' }))
  assert.strictEqual(g.mark('profile-written').status, 0)
  assert.deepStrictEqual(S.readJson(S.configPath(g.dir)), { lanes: 5, trunk: 'trunk', testCommand: 'npm test', setupCommand: 'npm install' })
  const end = g.run()
  assert.match(end.stdout, /✅ architected \+ grounded — scaffold green, 1 ADRs, roadmap of 3 briefs/)
  assert.match(end.stdout, /Next: \/spec:plan docs\/roadmap\/01-first-light\.md/)
  assert.strictEqual(g.step(), 'GROUNDED')
})

test('genesis refuses a first run without an idea', () => {
  const g = setup()
  assert.strictEqual(g.run().status, 2)
})
