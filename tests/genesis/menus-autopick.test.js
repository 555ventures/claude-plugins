'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { bare, mark, writeJSON, writeBrief } = require('./tournament.fixtures')

// specs/20261029/06-the-genesis-question-diet.md — AC-20261029-06-3 (D3 auto-pick line),
// AC-20261029-06-4 (D3 ask reasons), AC-20261029-06-5 (D4 race-or-skip default).

function option(label, rank, extra = {}) {
  return Object.assign({
    label, tradeoff: 'one honest line', recency: 'stable', rank, because: 'because payer=none',
    priced: 'n/a — no number in the brief', why_recommended: 'fits the brief', packages: [],
  }, extra)
}

function writeMenu(dir, dim, options) {
  writeJSON(path.join(dir, '.claude/genesis/interview-research', dim + '.json'), {
    dimension: dim, why_recommended: 'fits the brief', version_bearing: false, options,
  })
  const r = mark(dir, 'menu-written', 'interview-research/' + dim + '.json')
  assert.strictEqual(r.status, 0, 'test setup requires menu-written to be accepted for ' + dim + ': ' + r.stderr)
}

// Drives to MENUS for archetype `archetype` with `dims` open and no picks beyond the archetype.
function toMenus(dir, archetype, dims) {
  bare(dir)
  const open = {}
  for (const d of dims) open[d] = 'open'
  writeBrief(dir, { dims: open, picks: ['- archetype: ' + archetype] })
  const d = mark(dir, 'discovery-done')
  assert.strictEqual(d.status, 0, 'test setup requires discovery-done to be accepted: ' + d.stderr)
  const b = mark(dir, 'brief-written')
  assert.strictEqual(b.status, 0, 'test setup requires brief-written to be accepted for ' + archetype + ': ' + b.stderr)
}

test('AC-20261029-06-3: the MENUS step prints an Auto-picked line and a write line for an unpriced single rank-1 leader and lists a priced leader under ask', () => {
  const dir = tmpdir('menus-autopick-ac3')
  toMenus(dir, 'data-ml', ['framework', 'llm-provider'])
  writeMenu(dir, 'framework', [option('Next.js', 1), option('Remix', 2)])
  writeMenu(dir, 'llm-provider', [option('Claude', 1, { priced: '$20/month at 1k users' }), option('Gemini', 2)])
  const r = bare(dir)
  assert.match(r.stdout, /📌 Auto-picked framework: Next\.js — fits the brief \(veto anytime\)\n  write: - framework: Next\.js/, 'an unpriced non-minority sole leader must be printed as a veto-able pick with its write line, or the owner is asked a stack mechanic the research already answered: ' + r.stdout)
  assert.match(r.stdout, /ask \(1\): llm-provider \(priced: \$20\/month at 1k users\)/, 'a priced leader must stay a question, or a paid service is chosen without the owner: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /📌 Auto-picked llm-provider/, 'a paid service must never be auto-picked: ' + r.stdout)
})

test('AC-20261029-06-4: the MENUS step lists a rank tie, a minority leader and a missing rank under ask with their reasons and prints no Auto-picked line for them', () => {
  const dir = tmpdir('menus-autopick-ac4')
  toMenus(dir, 'data-ml', ['hosting', 'auth', 'persistence'])
  writeMenu(dir, 'hosting', [option('AWS', 1), option('GCP', 1)])
  writeMenu(dir, 'auth', [option('Passkeys', 1, { is_minority: true }), option('Password', 2)])
  const noRank = option('SQLite', 1)
  delete noRank.rank
  writeMenu(dir, 'persistence', [noRank, option('Postgres', 2)])
  const r = bare(dir)
  assert.match(r.stdout, /ask \(3\): hosting \(rank tie\), auth \(minority leader\), persistence \(no rank\)/, 'each ask reason must be named verbatim so the owner sees why a dimension was not picked for them: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /📌 Auto-picked (hosting|auth|persistence)/, 'a tie, a minority leader or an unranked menu must never be auto-picked: ' + r.stdout)
})

test('AC-20261029-06-5: the FINALISTS step prints a race default when framework was asked and a skip default when every dimension was auto-picked', () => {
  const asked = tmpdir('menus-autopick-ac5-ask')
  toMenus(asked, 'backend-api', ['framework'])
  writeMenu(asked, 'framework', [option('Express', 1), option('Fastify', 1)])
  writeBrief(asked, { dims: { framework: 'open' }, picks: ['- archetype: backend-api', '- framework: Express'] })
  const a = mark(asked, 'menus-done')
  assert.match(a.stdout, /state: FINALISTS/, 'test setup requires a tournament archetype to reach FINALISTS: ' + a.stdout + a.stderr)
  assert.match(a.stdout, /^cost: roughly one mini-build per finalist[^\n]*\ndefault: race \(Recommended\) — framework was asked$/m, 'an asked framework must make racing the printed default right after the cost line, or nobody is named as decider: ' + a.stdout)

  const auto = tmpdir('menus-autopick-ac5-auto')
  toMenus(auto, 'backend-api', ['framework'])
  writeMenu(auto, 'framework', [option('Express', 1), option('Fastify', 2)])
  writeBrief(auto, { dims: { framework: 'open' }, picks: ['- archetype: backend-api', '- framework: Express'] })
  const b = mark(auto, 'menus-done')
  assert.match(b.stdout, /state: FINALISTS/, 'test setup requires a tournament archetype to reach FINALISTS: ' + b.stdout + b.stderr)
  assert.match(b.stdout, /^default: skip \(Recommended\) — every tournament dimension was auto-picked$/m, 'an all-auto run must default to skipping the paid race, or tokens are spent racing nothing: ' + b.stdout)
})
