'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')

// spec: specs/20260801/04-live-smoke.md — pins AC-20260801-04-7..9, all deliberately
// opt-in (D6). This suite posts real questions into a real Telegram topic and waits for a
// real human tap; it activates ONLY when AUTOPILOT_LIVE=1 is set IN ADDITION to all four
// AUTOPILOT_LIVE_{TOKEN,SUPERGROUP,TOPIC,USER} credentials — credential presence alone is
// deliberately insufficient (a stray exported token must never turn `npm test` into a hang
// waiting for a tap that never comes). Absent that opt-in, every test below is
// skip-by-declaration, which is the sanctioned state for CI and any local run without an
// operator at the keyboard. AC-9 additionally needs AUTOPILOT_LIVE_REPO, an operator-
// prepared /spec:init-grounded throwaway repo path — no such env var is contracted by this
// spec (Contracts names only the four credential vars); this is the one-line deviation
// recorded in specs/20260801/04-live-smoke.deviations.md.

const LIVE = process.env.AUTOPILOT_LIVE === '1'
  && !!process.env.AUTOPILOT_LIVE_TOKEN
  && !!process.env.AUTOPILOT_LIVE_SUPERGROUP
  && !!process.env.AUTOPILOT_LIVE_TOPIC
  && !!process.env.AUTOPILOT_LIVE_USER
const SKIP_REASON = 'set AUTOPILOT_LIVE=1 plus AUTOPILOT_LIVE_TOKEN/_SUPERGROUP/_TOPIC/_USER to run the live suite (D6)'

const { createTelegramAdapter } = require(path.join(ROOT, 'autopilot', 'daemon', 'telegram.js'))
const { runStage } = require(path.join(ROOT, 'autopilot', 'daemon', 'session.js'))

function makeLiveAdapter(project) {
  return createTelegramAdapter({
    botToken: process.env.AUTOPILOT_LIVE_TOKEN,
    supergroupId: Number(process.env.AUTOPILOT_LIVE_SUPERGROUP),
    topicMap: { [project]: Number(process.env.AUTOPILOT_LIVE_TOPIC) },
    allowedUserIds: [Number(process.env.AUTOPILOT_LIVE_USER)],
  })
}

test('AC-20260801-04-7: posting a two-option question into the live topic returns a message id and the adapter keeps long-polling without error', { skip: !LIVE && SKIP_REASON }, async () => {
  const project = 'live'
  const adapter = makeLiveAdapter(project)
  adapter.start()
  try {
    let postError = null
    const askPromise = adapter.askButtons(project, {
      questions: [{ question: 'Which storage?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }],
    }).catch((err) => { postError = err; throw err })
    // A real sendMessage round-trip completes well within a few seconds; this grace period
    // is long enough to observe a post failure without waiting out the whole ask.
    await new Promise((resolve) => setTimeout(resolve, 5000))
    assert.strictEqual(postError, null,
      `posting the two-option question must not error — a message id came back only if sendMessage succeeded; got ${postError && postError.message}`)
    assert.ok(adapter.pendingAsk(project),
      'the ask must still be registered as pending after the post grace period, proving a message id came back and the adapter is now waiting on a real tap')
    adapter.cancelAsk(project)
    await askPromise.catch(() => {})
  } finally {
    await adapter.stop()
  }
})

test('AC-20260801-04-8: tapping "Postgres" on a live "Which storage?" question resolves the pending ask to {"Which storage?":"Postgres"}', { skip: !LIVE && SKIP_REASON }, async () => {
  const project = 'live'
  const adapter = makeLiveAdapter(project)
  adapter.start()
  try {
    const askPromise = adapter.askButtons(project, {
      questions: [{ question: 'Which storage?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }],
    })
    const result = await Promise.race([
      askPromise,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('no tap received within 120s — check that no other daemon is polling this bot token')),
        120000
      )),
    ])
    assert.deepStrictEqual(result.answers, { 'Which storage?': 'Postgres' },
      `tapping Postgres must resolve the ask to an answers object mapping the question text to the tapped label exactly, or the relay between a Telegram callback_query and the daemon's ask contract is broken; got ${JSON.stringify(result.answers)}`)
  } finally {
    await adapter.stop()
  }
})

// Lists every file under <repoRoot>/specs, relative to repoRoot, so a before/after diff
// can prove a new spec document was actually written (not merely that the stage said done).
function listSpecFiles(repoRoot) {
  const specsDir = path.join(repoRoot, 'specs')
  if (!fs.existsSync(specsDir)) return []
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(path.relative(repoRoot, full))
    }
  }
  walk(specsDir)
  return out
}

test('AC-20260801-04-9: one real runStage running a /spec:plan stage against a throwaway repo, answered from the live topic, returns outcome done with resultText and writes a new spec file to disk', { skip: !LIVE && SKIP_REASON }, async () => {
  const repoRoot = process.env.AUTOPILOT_LIVE_REPO
  assert.ok(repoRoot && fs.existsSync(repoRoot),
    'AUTOPILOT_LIVE_REPO must point at an operator-prepared, /spec:init-grounded throwaway repo (see specs/20260801/04-live-smoke.deviations.md) — this AC has no repo to drive without it')

  const project = 'live'
  const adapter = makeLiveAdapter(project)
  adapter.start()
  const before = listSpecFiles(repoRoot)
  try {
    const result = await Promise.race([
      runStage({
        repoRoot,
        prompt: '/spec:plan',
        pluginPaths: [path.join(ROOT, 'spec'), path.join(ROOT, 'git')],
        onQuestion: async (questions) => {
          const { answers } = await adapter.askButtons(project, { questions })
          return answers
        },
        onPermission: async () => ({ allow: true }),
      }),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('no tap received within 600s — check that no other daemon is polling this bot token')),
        600000
      )),
    ])
    assert.strictEqual(result.outcome, 'done',
      `the /spec:plan stage must finish done, or a live phone tap never reached the model as a usable answer; got outcome=${result.outcome} detail=${result.detail}`)
    assert.ok(result.resultText && result.resultText.length > 0,
      'a done outcome with empty resultText means the stage produced no answer text an operator could read')
    const after = listSpecFiles(repoRoot)
    const created = after.filter((f) => !before.includes(f))
    assert.ok(created.length > 0,
      `the /spec:plan stage must write a new spec document under ${repoRoot}/specs — none appeared, so "the stage completed done" and "the stage produced a real spec" are not the same claim`)
  } finally {
    await adapter.stop()
  }
})
