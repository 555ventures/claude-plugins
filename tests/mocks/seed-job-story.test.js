'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./wireframe-fixtures')

// specs/20261103/01-the-user-reaches-build.md — AC-20261103-01-1..3: `--mark seed-done` refuses a
// journey with no job story or no off-path beat and records a seed that has both.

const STORY = 'When I open the invitation for the first time, I want to see my roster, so I can confirm it.'
const NAMED = 'Mika (clinic owner) is invited, confirms her roster, and ends at the brief.'

// A one-journey seed: first body line, then the beats given as `"sentence" -> screen[@state]` strings.
function root(firstLine, beats) {
  const dir = fx.makeRoot({ seed: false })
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/seed.md'),
    '# Seed — Hearwell\n\n## Product\n\nA clinic roster tool.\n\n## Journeys\n\n### owner-onboarding\n' + firstLine + '\n' +
    beats.map((b, i) => (i + 1) + '. ' + b).join('\n') + '\n')
  fx.writeStatus(dir, { state: 'SEED', marks: { seedDone: null, approved: null } })
  return dir
}

const seedDone = (dir) => fx.runDriver(dir, ['--mark', 'seed-done'])

test('AC-20261103-01-1: --mark seed-done on a journey opening with a named-person line exits 1 naming the journey, job story and --mark seed-done, and records nothing', () => {
  const dir = root(NAMED, ['"I open the invitation" -> owner-intro', '"I see nobody is listed yet" -> roster-confirm@empty'])
  const r = seedDone(dir)
  assert.strictEqual(r.status, 1, 'a named-person first line would be accepted as the user image and never reach plan or build: ' + r.stdout + r.stderr)
  assert.doesNotMatch(r.stdout, /✅ seed-done recorded/, 'the seed must not be recorded with no job story, or the refusal is only advice')
  assert.match(r.stderr, /owner-onboarding/, 'the refusal must name the journey or the author cannot find the block: ' + r.stderr)
  assert.match(r.stderr, /job story/, 'the refusal must name what is missing: ' + r.stderr)
  assert.match(r.stderr, /--mark seed-done/, 'the refusal must name the command to re-run: ' + r.stderr)
  assert.strictEqual(fx.readStatus(dir).marks.seedDone, null, 'a refused mark must leave marks.seedDone null, or the driver moves on to SCREENS over an invalid seed')
})

test('AC-20261103-01-2: --mark seed-done on a job-story journey with no first-run/empty beat exits 1 naming the journey, off-path, @first-run and @empty; an @draft beat is refused too', () => {
  const none = root(STORY, ['"I open the invitation" -> owner-intro', '"I see my team" -> roster-confirm'])
  const a = seedDone(none)
  assert.strictEqual(a.status, 1, 'a journey with no off-path beat would reach build with only the happy path drawn: ' + a.stdout + a.stderr)
  for (const token of ['owner-onboarding', 'off-path', '@first-run', '@empty']) {
    assert.ok(a.stderr.includes(token), 'the refusal must name ' + token + ' so the author knows the remedy: ' + a.stderr)
  }
  assert.strictEqual(fx.readStatus(none).marks.seedDone, null, 'a refused mark must leave marks.seedDone null')

  const draft = root(STORY, ['"I open the invitation" -> owner-intro', '"I see my team" -> roster-confirm@draft'])
  const b = seedDone(draft)
  assert.strictEqual(b.status, 1, 'the off-path set is closed: an arbitrary @state must not satisfy it: ' + b.stdout + b.stderr)
  assert.match(b.stderr, /off-path/, 'the @draft refusal must be the off-path one: ' + b.stderr)
})

test('AC-20261103-01-3: a seed whose journey has a job story and an @empty or @first-run beat is recorded, the SEED step asks for a job story, and SCREENS prints the story verbatim under its journey', () => {
  for (const state of ['empty', 'first-run']) {
    const dir = root(STORY, ['"I open the invitation" -> owner-intro', '"I see nobody is listed yet" -> roster-confirm@' + state])
    const r = seedDone(dir)
    assert.strictEqual(r.status, 0, '@' + state + ' is an off-path state; refusing it blocks every valid seed: ' + r.stderr)
    assert.match(r.stdout, /✅ seed-done recorded/, 'the sentinel line is the machine contract of the mark: ' + r.stdout)
    const next = fx.runDriver(dir, [])
    assert.ok(next.stdout.includes('### owner-onboarding\n' + STORY + '\n'),
      'the terminal block must print the job story line verbatim under its journey, or the owner confirms a story they cannot see: ' + next.stdout)
  }
  const cold = fx.makeRoot({ seed: false, ledger: false })
  const step = fx.runDriver(cold, [])
  assert.match(step.stdout, /job story/, 'the SEED step must tell the author to write a job story, or the new refusal is met blind: ' + step.stdout)
  assert.doesNotMatch(step.stdout, /persona line/, 'the SEED step must not still ask for a persona line: ' + step.stdout)
})
