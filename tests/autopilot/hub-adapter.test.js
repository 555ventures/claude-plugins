'use strict'
const { test, mock } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')

// spec: specs/20260810/04-hub-wired-daemon.md — pins AC-20260810-04-1..7 for the new hub
// messaging seam (autopilot/daemon/hub-adapter.js, D2-D6). createHubAdapter() replaces the
// deleted Telegram adapter behind the same start/stop/send/askButtons/pendingAsk/cancelAsk
// surface, adds report(), and talks to the hub over an injected fetchImpl only — no real
// network, no SDK. The module does not exist yet, so every test here fails at require() time
// until autopilot/daemon/hub-adapter.js lands.

const MODULE_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'hub-adapter.js')
const { createHubAdapter } = require(MODULE_PATH)

const HUB_URL = 'https://hub.example.test'
const TOKEN = 'spoke-token-abc'
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

// Records every call the adapter makes through fetchImpl, keyed by hub route. Unqueued calls
// get a sane default (2xx, empty poll page) so the poll loop can run freely without a real
// network. `hangPoll` makes the poll endpoint a genuinely in-flight request that only settles
// when its AbortSignal fires (AC-6); `failPoll` makes it reject like a network failure.
function makeFetch({ hangPoll = false, failPoll = false } = {}) {
  const calls = []
  const queues = {}
  function queue(key, resp) {
    ;(queues[key] = queues[key] || []).push(resp)
  }
  function keyOf(url) {
    const u = new URL(url)
    if (u.pathname === '/api/spokes/report') return 'report'
    if (u.pathname === '/api/spokes/poll') return 'poll'
    if (u.pathname === '/api/spokes/asks') return 'asksCreate'
    const m = u.pathname.match(/^\/api\/spokes\/asks\/([^/]+)\/cancel$/)
    if (m) return 'asksCancel'
    return 'unknown:' + u.pathname
  }
  async function fetchImpl(url, opts = {}) {
    const u = new URL(url)
    const key = keyOf(url)
    let body
    if (opts.body) {
      try { body = JSON.parse(opts.body) } catch { body = opts.body }
    }
    const call = { key, url, pathname: u.pathname, method: opts.method, body, query: Object.fromEntries(u.searchParams) }
    calls.push(call)

    if (key === 'poll' && failPoll) {
      throw new Error('simulated network failure reaching the hub')
    }
    if (key === 'poll' && hangPoll) {
      return new Promise((resolve, reject) => {
        if (opts.signal) {
          if (opts.signal.aborted) { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); return }
          opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }
        // otherwise never resolves — simulates a long-poll genuinely in flight
      })
    }

    const q = queues[key]
    let r = q && q.length ? q.shift() : undefined
    if (!r) {
      if (key === 'poll') r = { status: 200, json: { contractVersion: 1, cursor: '0', events: [], asks: [] } }
      else if (key === 'report') r = { status: 200, json: { contractVersion: 1, accepted: 1, duplicates: 0 } }
      else if (key === 'asksCreate') r = { status: 201, json: { contractVersion: 1, askId: 'ask-default', status: 'pending' } }
      else if (key === 'asksCancel') r = { status: 200, json: { contractVersion: 1, askId: u.pathname.split('/')[4], status: 'cancelled' } }
      else r = { status: 200, json: {} }
    }
    if (typeof r === 'function') r = r()
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json,
      text: async () => JSON.stringify(r.json),
    }
  }
  return { fetchImpl, calls, queue }
}

// Lets queued microtasks/setImmediate work (fetch resolution, promise chains, the poll loop's
// own macrotask yield) settle before asserting on captured calls.
async function flush(times = 10) {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setImmediate(resolve))
}

test('AC-20260810-04-1: send() POSTs one narration event to /api/spokes/report with a 26-char ULID eventId, the resolved projectId, and the literal text', async () => {
  const { fetchImpl, calls } = makeFetch()
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac1a'), fetchImpl })
  await adapter.send('prax', '💤 idle')
  const reportCalls = calls.filter((c) => c.key === 'report')
  assert.strictEqual(reportCalls.length, 1, 'AC-1: send() must POST exactly one /api/spokes/report call or narration is lost/duplicated')
  const events = reportCalls[0].body && reportCalls[0].body.events
  assert.ok(Array.isArray(events) && events.length === 1, 'AC-1: the report body must carry exactly one event in its events array')
  const event = events[0]
  assert.match(event.eventId, ULID_RE, 'AC-1: eventId must be a 26-char Crockford ULID or the hub cannot dedupe at-least-once delivery')
  assert.strictEqual(event.type, 'narration', 'AC-1: send() must mint a narration-typed event, not some other event type')
  assert.strictEqual(event.projectId, 'prax', 'AC-1: the event must carry the resolved projectId or the hub cannot route it to the right project')
  assert.deepStrictEqual(event.payload, { text: '💤 idle' }, 'AC-1: the payload must carry the literal text verbatim')
})

test('AC-20260810-04-1: send() resolves (never rejects) even when the POST to /api/spokes/report fails', async () => {
  const { fetchImpl } = makeFetch()
  const failingFetch = async (url, opts) => {
    if (new URL(url).pathname === '/api/spokes/report') throw new Error('simulated hub outage')
    return fetchImpl(url, opts)
  }
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac1b'), fetchImpl: failingFetch })
  let rejected = false
  await adapter.send('prax', '💤 idle').catch(() => { rejected = true })
  assert.strictEqual(rejected, false, 'AC-1: a persistently failing report POST must resolve and log — throwing into the lane would take the whole daemon process down on a mere hub outage (D3)')
})

test('AC-20260810-04-2: askButtons resolves {answers} once a poll delivers answer_given for the created askId, ignoring the extra answeredBy field', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac2'), fetchImpl })
  queue('asksCreate', { status: 201, json: { contractVersion: 1, askId: 'ask_1', status: 'pending' } })
  adapter.start()
  await flush()
  const askPromise = adapter.askButtons('prax', {
    questions: [{ question: 'Deploy?', options: [{ label: 'Now' }, { label: 'Later' }] }],
  })
  await flush()
  const createCalls = calls.filter((c) => c.key === 'asksCreate')
  assert.strictEqual(createCalls.length, 1, 'AC-2: askButtons must POST exactly one ask-create call before an answer can resolve it')
  assert.match(createCalls[0].body.clientAskId, ULID_RE, 'AC-2: the ask create request must carry a spoke-minted ULID clientAskId (D4 dedupe key)')
  assert.strictEqual(createCalls[0].body.projectId, 'prax', 'AC-2: the ask create request must name the resolved projectId')

  queue('poll', { status: 200, json: {
    contractVersion: 1, cursor: '11', asks: [],
    events: [{ seq: '11', type: 'answer_given', payload: { askId: 'ask_1', answers: { 'Deploy?': 'Later' }, answeredBy: 7214666699 }, createdAt: '2026-08-10T00:00:00Z' }],
  } })
  await flush()
  const answers = await askPromise
  assert.deepStrictEqual(answers, { answers: { 'Deploy?': 'Later' } }, 'AC-2: the ask must resolve with exactly {answers: {...}} — the extra answeredBy field must be ignored, not merged into the resolved shape')
  await adapter.stop()
})

test('AC-20260810-04-3: a 409 on ask creation adopts a poll-reported pending ask whose questions deep-equal ours (key order insensitive), never re-creating', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac3-adopt'), fetchImpl })
  queue('asksCreate', { status: 409, json: { code: 'conflict', message: 'ask already pending' } })
  adapter.start()
  await flush()
  const askPromise = adapter.askButtons('prax', {
    questions: [{ question: 'Deploy?', options: [{ label: 'Now' }, { label: 'Later' }] }],
  })
  await flush()

  // Key order deliberately reversed relative to the ask above (jsonb round-trip does not
  // preserve key order, D5) — the adapter must still recognize this as the same ask.
  queue('poll', { status: 200, json: {
    contractVersion: 1, cursor: '20', events: [],
    asks: [{ askId: 'ask_existing', projectId: 'prax', createdAt: '2026-08-10T00:00:00Z',
      questions: [{ options: [{ label: 'Now' }, { label: 'Later' }], question: 'Deploy?' }] }],
  } })
  await flush()

  queue('poll', { status: 200, json: {
    contractVersion: 1, cursor: '21', asks: [],
    events: [{ seq: '21', type: 'answer_given', payload: { askId: 'ask_existing', answers: { 'Deploy?': 'Now' }, answeredBy: 1 }, createdAt: '2026-08-10T00:00:01Z' }],
  } })
  await flush()

  const answers = await askPromise
  assert.deepStrictEqual(answers, { answers: { 'Deploy?': 'Now' } }, 'AC-3: adopting the existing ask must resolve on its own answer_given')
  assert.strictEqual(calls.filter((c) => c.key === 'asksCreate').length, 1, 'AC-3: adopting a deep-equal pending ask must never re-POST a create — that would duplicate the question on the phone')
  assert.strictEqual(calls.filter((c) => c.key === 'asksCancel').length, 0, 'AC-3: adopting a deep-equal pending ask must never cancel it')
  await adapter.stop()
})

test('AC-20260810-04-3: a 409 on ask creation cancels a poll-reported pending ask whose questions differ, then re-creates', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac3-mismatch'), fetchImpl })
  queue('asksCreate', { status: 409, json: { code: 'conflict', message: 'ask already pending' } })
  adapter.start()
  await flush()
  const askPromise = adapter.askButtons('prax', {
    questions: [{ question: 'Deploy?', options: [{ label: 'Now' }, { label: 'Later' }] }],
  })
  await flush()

  queue('poll', { status: 200, json: {
    contractVersion: 1, cursor: '30', events: [],
    asks: [{ askId: 'ask_stale', projectId: 'prax', createdAt: '2026-08-10T00:00:00Z',
      questions: [{ question: 'Different question?', options: [{ label: 'X' }] }] }],
  } })
  queue('asksCreate', { status: 201, json: { contractVersion: 1, askId: 'ask_new', status: 'pending' } })
  await flush()

  assert.strictEqual(calls.filter((c) => c.key === 'asksCancel').length, 1, 'AC-3: a mismatched pending ask must be cancelled before re-creating, or the phone shows two conflicting asks')
  const cancelCall = calls.find((c) => c.key === 'asksCancel')
  assert.strictEqual(cancelCall.pathname, '/api/spokes/asks/ask_stale/cancel', 'AC-3: the cancel must target the stale askId reported by the poll')
  assert.strictEqual(calls.filter((c) => c.key === 'asksCreate').length, 2, 'AC-3: a mismatched pending ask must be followed by exactly one re-create POST')

  queue('poll', { status: 200, json: {
    contractVersion: 1, cursor: '31', asks: [],
    events: [{ seq: '31', type: 'answer_given', payload: { askId: 'ask_new', answers: { 'Deploy?': 'Later' }, answeredBy: 1 }, createdAt: '2026-08-10T00:00:01Z' }],
  } })
  await flush()
  const answers = await askPromise
  assert.deepStrictEqual(answers, { answers: { 'Deploy?': 'Later' } }, 'AC-3: after cancel+recreate, the ask must still resolve once the new askId is answered')
  await adapter.stop()
})

test('AC-20260810-04-4: the poll loop cold-starts with since=0 when no cursor file exists', async () => {
  const { fetchImpl, calls } = makeFetch()
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac4-cold'), fetchImpl })
  adapter.start()
  await flush()
  const pollCalls = calls.filter((c) => c.key === 'poll')
  assert.ok(pollCalls.length >= 1, 'AC-4: the poll loop must issue at least one poll call after start()')
  assert.strictEqual(pollCalls[0].query.since, '0', 'AC-4: a cold start with no cursor file must poll since=0, never an invented high cursor that would skip real history')
  await adapter.stop()
})

test('AC-20260810-04-4: the poll loop persists {cursor} after handling a batch and a new adapter over the same stateDir resumes from it', async () => {
  const stateDir = tmpdir('hub-adapter-ac4-resume')
  const first = makeFetch()
  first.queue('poll', { status: 200, json: {
    contractVersion: 1, cursor: '42', asks: [],
    events: [{ seq: '42', type: 'narration', payload: { text: 'x' }, createdAt: '2026-08-10T00:00:00Z' }],
  } })
  const adapterA = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir, fetchImpl: first.fetchImpl })
  adapterA.start()
  await flush()
  await adapterA.stop()

  const cursorPath = path.join(stateDir, 'hub-cursor.json')
  const persisted = JSON.parse(fs.readFileSync(cursorPath, 'utf8'))
  assert.strictEqual(persisted.cursor, '42', 'AC-4: the cursor file must persist the exact cursor returned by the handled batch')

  const second = makeFetch()
  const adapterB = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir, fetchImpl: second.fetchImpl })
  adapterB.start()
  await flush()
  const pollCallsB = second.calls.filter((c) => c.key === 'poll')
  assert.ok(pollCallsB.length >= 1, 'AC-4: the resumed adapter must poll at least once')
  assert.strictEqual(pollCallsB[0].query.since, '42', 'AC-4: a restart must resume polling from the persisted cursor, not replay from 0 again')
  await adapterB.stop()
})

test('AC-20260810-04-5: a poll answering 5xx backs off 1s doubling to 2s and keeps polling, never rejecting the loop', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  queue('poll', { status: 503, json: { code: 'unavailable' } })
  queue('poll', { status: 503, json: { code: 'unavailable' } })
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac5-5xx'), fetchImpl })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    adapter.start()
    await flush()
    assert.strictEqual(calls.filter((c) => c.key === 'poll').length, 1, 'AC-5: the first poll attempt must actually reach the transport before any backoff can be observed')
    mock.timers.tick(1000)
    await flush()
    assert.strictEqual(calls.filter((c) => c.key === 'poll').length, 2, 'AC-5: a 5xx must be retried after a 1s backoff, not abandoned or retried immediately')
    mock.timers.tick(2000)
    await flush()
    assert.strictEqual(calls.filter((c) => c.key === 'poll').length, 3, 'AC-5: the second retry must wait the doubled 2s backoff before polling again')
    await adapter.stop()
  } finally {
    mock.timers.reset()
  }
})

test('AC-20260810-04-5: a poll transport rejection (thrown network error) backs off and keeps the loop running instead of crashing it', async () => {
  const { fetchImpl, calls } = makeFetch({ failPoll: true })
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac5-throw'), fetchImpl })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    adapter.start()
    await flush()
    const afterFirst = calls.filter((c) => c.key === 'poll').length
    assert.ok(afterFirst >= 1, 'AC-5: a thrown fetch must still register as an attempted poll call')
    mock.timers.tick(1000)
    await flush()
    assert.ok(calls.filter((c) => c.key === 'poll').length > afterFirst, 'AC-5: after a thrown poll error and its 1s backoff, the loop must poll again rather than stalling forever')
    await adapter.stop()
  } finally {
    mock.timers.reset()
  }
})

test('AC-20260810-04-6: stop() aborts an in-flight poll and resolves, while a pending askButtons wait stays unresolved', { timeout: 5000 }, async () => {
  const { fetchImpl, calls, queue } = makeFetch({ hangPoll: true })
  queue('asksCreate', { status: 201, json: { contractVersion: 1, askId: 'ask_1', status: 'pending' } })
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac6'), fetchImpl })
  adapter.start()
  await flush()
  assert.ok(calls.filter((c) => c.key === 'poll').length >= 1, 'AC-6: stop() must be exercised against a genuinely in-flight poll — the mock never resolves poll on its own')

  const askPromise = adapter.askButtons('prax', { questions: [{ question: 'Deploy?', options: [{ label: 'Now' }] }] })
  await flush()
  let settled = false
  askPromise.then(() => { settled = true }, () => { settled = true })

  await adapter.stop()
  await flush()
  assert.strictEqual(settled, false, 'AC-6: a pending askButtons wait must stay unresolved after stop() — the ask survives hub-side and a restart re-adopts it (D5), so resolving or rejecting it here would be wrong')
})

test('AC-20260810-04-7: report() POSTs one stage_finished event carrying the given payload verbatim', async () => {
  const { fetchImpl, calls } = makeFetch()
  const adapter = createHubAdapter({ credential: { hubUrl: HUB_URL, token: TOKEN }, stateDir: tmpdir('hub-adapter-ac7'), fetchImpl })
  await adapter.report('prax', 'stage_finished', { stage: '/spec:build · $1.23' })
  const reportCalls = calls.filter((c) => c.key === 'report')
  assert.strictEqual(reportCalls.length, 1, 'AC-7: report() must POST exactly one /api/spokes/report call')
  const event = reportCalls[0].body.events[0]
  assert.strictEqual(event.type, 'stage_finished', 'AC-7: report() must mint an event of the given type, not narration')
  assert.strictEqual(event.projectId, 'prax', 'AC-7: the event must carry the resolved projectId')
  assert.deepStrictEqual(event.payload, { stage: '/spec:build · $1.23' }, 'AC-7: the payload must be carried verbatim, not reshaped or dropped')
  assert.match(event.eventId, ULID_RE, 'AC-7: report() must mint the same 26-char ULID eventId discipline as send()')
})
