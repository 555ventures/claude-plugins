'use strict'
const { test, mock } = require('node:test')
const assert = require('node:assert')

// spec: specs/20260801/01-telegram-adapter.md — pins AC-20260801-01-1..9 for the
// zero-dependency Telegram adapter (autopilot/daemon/telegram.js). Every network call is
// routed through an injected fetchImpl (D1); no real transport, no SDK imports. Tests are
// written against the Contracts/Behavior/AC sections only — the module does not exist yet,
// so every test here fails at require() time until autopilot/daemon/telegram.js lands.
const { createTelegramAdapter } = require('../../autopilot/daemon/telegram.js')

const BOT_TOKEN = 'TEST:TOKEN'
const SUPERGROUP_ID = -1001234567890
const TOPIC_MAP = { prax: 555, other: 777 }
const ALLOWED_USER_IDS = [111]

// Records every call the adapter makes through fetchImpl, keyed by Telegram API method (the
// last URL path segment). getUpdates defaults to an empty batch so the long-poll loop can run
// freely in tests without a real network; every other method defaults to a bare ok:true.
function makeFetch({ hangGetUpdates = false } = {}) {
  const calls = []
  const queues = {}
  function queue(method, resp) {
    ;(queues[method] = queues[method] || []).push(resp)
  }
  function methodOf(url) {
    return url.split('?')[0].split('/').pop()
  }
  function parseQuery(url) {
    const q = url.split('?')[1]
    const out = {}
    if (!q) return out
    for (const pair of q.split('&')) {
      const [k, v] = pair.split('=')
      out[decodeURIComponent(k)] = decodeURIComponent(v || '')
    }
    return out
  }
  async function fetchImpl(url, opts = {}) {
    const method = methodOf(url)
    let body
    if (opts.body) {
      try { body = JSON.parse(opts.body) } catch { body = opts.body }
    }
    const query = parseQuery(url)
    calls.push({ method, url, body, query })
    if (method === 'getUpdates' && hangGetUpdates) {
      return new Promise((resolve, reject) => {
        if (opts.signal) {
          if (opts.signal.aborted) { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); return }
          opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }
        // otherwise never resolves — simulates a long-poll genuinely in flight
      })
    }
    const q = queues[method]
    let r = q && q.length ? q.shift() : undefined
    if (!r) r = method === 'getUpdates' ? { status: 200, json: { ok: true, result: [] } } : { status: 200, json: { ok: true, result: {} } }
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

// Lets queued microtasks/setImmediate work (fetch resolution, promise chains) settle before
// asserting on captured calls.
async function flush(times = 8) {
  for (let i = 0; i < times; i++) await new Promise(resolve => setImmediate(resolve))
}

test('AC-20260801-01-1: askButtons posts one sendMessage into the project topic with SQLite/Postgres/Other… buttons wired to a:1:0:0 · a:1:0:1 · o:1:0', async () => {
  const { fetchImpl, calls } = makeFetch()
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl,
  })
  adapter.askButtons('prax', {
    questions: [{
      question: 'Which storage?', header: 'Storage',
      options: [{ label: 'SQLite', description: 'single file' }, { label: 'Postgres', description: 'needs server' }],
      multiSelect: false,
    }],
  })
  await flush()
  const sendCalls = calls.filter(c => c.method === 'sendMessage')
  assert.strictEqual(sendCalls.length, 1, 'a single-question ask must post exactly one sendMessage or AC-1 wiring never fires')
  const call = sendCalls[0]
  assert.strictEqual(call.body.message_thread_id, TOPIC_MAP.prax, 'wrong forum topic id would land the question in the wrong project thread')
  const buttons = call.body.reply_markup.inline_keyboard.flat()
  const byLabel = Object.fromEntries(buttons.map(b => [b.text, b.callback_data]))
  assert.strictEqual(byLabel.SQLite, 'a:1:0:0', 'SQLite button must carry callback_data a:1:0:0 or a tap cannot be routed back to option 0')
  assert.strictEqual(byLabel.Postgres, 'a:1:0:1', 'Postgres button must carry callback_data a:1:0:1 or a tap cannot be routed back to option 1')
  assert.strictEqual(byLabel['Other…'], 'o:1:0', 'Other… button must carry callback_data o:1:0 or the free-text path (D3) breaks')
})

test('AC-20260801-01-2: an allowed-user callback_query with data a:1:0:1 answers the callback and resolves the ask with {"Which storage?":"Postgres"}', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl,
  })
  adapter.start()
  const askPromise = adapter.askButtons('prax', {
    questions: [{
      question: 'Which storage?', header: 'Storage',
      options: [{ label: 'SQLite', description: 'single file' }, { label: 'Postgres', description: 'needs server' }],
      multiSelect: false,
    }],
  })
  await flush()
  queue('getUpdates', { status: 200, json: { ok: true, result: [
    { update_id: 100, callback_query: { id: 'cb-1', from: { id: ALLOWED_USER_IDS[0] }, data: 'a:1:0:1', message: { message_thread_id: TOPIC_MAP.prax } } },
  ] } })
  await flush()
  const answers = await askPromise
  assert.deepStrictEqual(answers, { answers: { 'Which storage?': 'Postgres' } }, 'tapping option 1 must resolve the ask with the exact literal answers shape from AC-2')
  const answered = calls.filter(c => c.method === 'answerCallbackQuery').some(c => c.body.callback_query_id === 'cb-1')
  assert.ok(answered, 'the tapped callback must be acknowledged (answerCallbackQuery) or the tapper\'s Telegram client spins forever')
  await adapter.stop()
})

test('AC-20260801-01-3: a 429 with retry_after=2 on sendMessage is retried with the identical call after the wait and ultimately delivered', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  queue('sendMessage', { status: 429, json: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 2 } } })
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl,
  })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const sendPromise = adapter.send('prax', 'hello there')
    await flush()
    assert.strictEqual(calls.filter(c => c.method === 'sendMessage').length, 1, 'the first attempt must actually reach the transport before any retry logic can run')
    mock.timers.tick(2000)
    await flush()
    const result = await sendPromise
    const sendCalls = calls.filter(c => c.method === 'sendMessage')
    assert.strictEqual(sendCalls.length, 2, 'a 429 with retry_after must produce exactly one retry of the identical call, not a silent drop or a duplicate storm')
    assert.strictEqual(sendCalls[1].body.text, 'hello there', 'the retried call must resend the identical text or the retry silently mutates the outgoing message')
    assert.ok(result && Array.isArray(result.messageIds), 'send() must ultimately resolve with delivered message ids once the retry succeeds, per D6\'s "ultimately deliver it"')
  } finally {
    mock.timers.reset()
  }
})

test('AC-20260801-01-4: a callback_query from a user id outside allowedUserIds is never answered or resolved, and the loop still processes the next update in the same batch', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl,
  })
  adapter.start()
  const askPromise = adapter.askButtons('prax', {
    questions: [{ question: 'Which storage?', options: [{ label: 'SQLite' }, { label: 'Postgres' }], multiSelect: false }],
  })
  await flush()
  const strangerId = 999
  queue('getUpdates', { status: 200, json: { ok: true, result: [
    { update_id: 200, callback_query: { id: 'cb-stranger', from: { id: strangerId }, data: 'a:1:0:0', message: { message_thread_id: TOPIC_MAP.prax } } },
    { update_id: 201, callback_query: { id: 'cb-allowed', from: { id: ALLOWED_USER_IDS[0] }, data: 'a:1:0:1', message: { message_thread_id: TOPIC_MAP.prax } } },
  ] } })
  await flush()
  const answers = await askPromise
  assert.deepStrictEqual(answers, { answers: { 'Which storage?': 'Postgres' } }, 'the allowed user\'s tap right after a disallowed one must still resolve the ask — an ignored update must not stall the batch')
  const answeredIds = calls.filter(c => c.method === 'answerCallbackQuery').map(c => c.body.callback_query_id)
  assert.ok(!answeredIds.includes('cb-stranger'), 'a disallowed user\'s tap must never be acknowledged — that would let anyone answer fork questions past D4\'s allowlist')
  assert.ok(answeredIds.includes('cb-allowed'), 'the allowed user\'s own tap must still be acknowledged')
  await adapter.stop()
})

test('AC-20260801-01-5: send() splits a 9000-char text of 80-char lines into 3 sequential sendMessage calls, each within the 4096-char limit, on line boundaries', async () => {
  const { fetchImpl, calls } = makeFetch()
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl,
  })
  const line = 'x'.repeat(79)
  const text = (line + '\n').repeat(115).slice(0, 9000)
  assert.strictEqual(text.length, 9000, 'test fixture bug: source text must be exactly 9000 chars per AC-5')
  const result = await adapter.send('prax', text)
  const sendCalls = calls.filter(c => c.method === 'sendMessage')
  assert.strictEqual(sendCalls.length, 3, 'a 9000-char message must split into exactly 3 sendMessage calls per AC-5, not truncate or over/under-split')
  for (const c of sendCalls) {
    assert.ok(c.body.text.length <= 4096, `each split chunk must be <=4096 chars (Telegram hard limit); got ${c.body.text.length}`)
  }
  for (let i = 0; i < sendCalls.length - 1; i++) {
    assert.ok(sendCalls[i].body.text.endsWith('\n'),
      `chunk ${i} must end on a line boundary (trailing newline) — splitting mid-line was explicitly rejected (D8)`)
  }
  const joined = sendCalls.map(c => c.body.text).join('')
  assert.strictEqual(joined.replace(/\n/g, ''), text.replace(/\n/g, ''), 'splitting must not drop or corrupt characters from the original message')
  assert.ok(result && Array.isArray(result.messageIds) && result.messageIds.length === 3, 'send() must resolve messageIds for all 3 delivered parts')
})

test('AC-20260801-01-6: toggling a multiSelect option on then off, then tapping Done, resolves that question with an empty array', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl,
  })
  adapter.start()
  const askPromise = adapter.askButtons('prax', {
    questions: [{ question: 'Which features?', options: [{ label: 'A' }, { label: 'B' }], multiSelect: true }],
  })
  await flush()
  const uid = ALLOWED_USER_IDS[0]
  queue('getUpdates', { status: 200, json: { ok: true, result: [
    { update_id: 300, callback_query: { id: 'cb-t1', from: { id: uid }, data: 'a:1:0:0', message: { message_thread_id: TOPIC_MAP.prax } } },
  ] } })
  await flush()
  queue('getUpdates', { status: 200, json: { ok: true, result: [
    { update_id: 301, callback_query: { id: 'cb-t2', from: { id: uid }, data: 'a:1:0:0', message: { message_thread_id: TOPIC_MAP.prax } } },
  ] } })
  await flush()
  queue('getUpdates', { status: 200, json: { ok: true, result: [
    { update_id: 302, callback_query: { id: 'cb-done', from: { id: uid }, data: 'd:1:0', message: { message_thread_id: TOPIC_MAP.prax } } },
  ] } })
  await flush()
  const answers = await askPromise
  assert.deepStrictEqual(answers, { answers: { 'Which features?': [] } }, 'toggle-on then toggle-off then Done must commit an empty selection literally, not drop the question or keep the last tap')
  await adapter.stop()
})

test('AC-20260801-01-7: after a getUpdates batch delivers update_id 7 and 8, the next getUpdates call carries offset=9', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  queue('getUpdates', { status: 200, json: { ok: true, result: [
    { update_id: 7, message: { message_id: 1, chat: { id: SUPERGROUP_ID }, message_thread_id: TOPIC_MAP.prax, from: { id: ALLOWED_USER_IDS[0] }, text: 'hello' } },
    { update_id: 8, message: { message_id: 2, chat: { id: SUPERGROUP_ID }, message_thread_id: TOPIC_MAP.prax, from: { id: ALLOWED_USER_IDS[0] }, text: 'world' } },
  ] } })
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl,
  })
  adapter.start()
  await flush()
  await adapter.stop()
  const getUpdatesCalls = calls.filter(c => c.method === 'getUpdates')
  assert.ok(getUpdatesCalls.length >= 2, 'need both the batch call and its follow-up to check the offset advanced')
  const offsetOf = c => (c.body && c.body.offset !== undefined) ? c.body.offset : (c.query.offset !== undefined ? Number(c.query.offset) : undefined)
  assert.strictEqual(offsetOf(getUpdatesCalls[1]), 9, 'the follow-up getUpdates must request offset=9 (max update_id 8, +1) or updates 7/8 get re-served on the next poll')
})

test('AC-20260801-01-8: stop() aborts an in-flight long-poll, resolves, and no transport calls happen after it resolves', { timeout: 5000 }, async () => {
  const { fetchImpl, calls } = makeFetch({ hangGetUpdates: true })
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl, pollTimeoutSec: 1,
  })
  adapter.start()
  await flush()
  assert.ok(calls.filter(c => c.method === 'getUpdates').length >= 1, 'stop() must be exercised against a genuinely in-flight poll — the mock never resolves getUpdates on its own')
  await adapter.stop()
  const countAtStop = calls.length
  await flush()
  assert.strictEqual(calls.length, countAtStop, 'a transport call after stop() resolved means the poll loop kept running behind stop()\'s back')
})

test('AC-20260801-01-9: cancelAsk rejects the pending ask and clears pendingAsk; a late callback for the cancelled promptKey is still answered but resolves nothing', async () => {
  const { fetchImpl, calls, queue } = makeFetch()
  const adapter = createTelegramAdapter({
    botToken: BOT_TOKEN, supergroupId: SUPERGROUP_ID, topicMap: TOPIC_MAP, allowedUserIds: ALLOWED_USER_IDS, fetchImpl,
  })
  adapter.start()
  const askPromise = adapter.askButtons('prax', {
    questions: [{ question: 'Which storage?', options: [{ label: 'SQLite' }, { label: 'Postgres' }], multiSelect: false }],
  })
  await flush()
  assert.strictEqual(adapter.pendingAsk('prax'), true, 'test fixture bug: askButtons must register a pending ask before cancelAsk can be exercised')
  adapter.cancelAsk('prax')
  await assert.rejects(askPromise, undefined, 'cancelAsk must reject the pending ask\'s promise or a stopped lane hangs forever awaiting an answer that will never come')
  assert.strictEqual(adapter.pendingAsk('prax'), false, 'cancelAsk must clear the topic\'s pending-ask flag or the topic is permanently stranded (D7 free-text matching breaks)')
  queue('getUpdates', { status: 200, json: { ok: true, result: [
    { update_id: 400, callback_query: { id: 'cb-late', from: { id: ALLOWED_USER_IDS[0] }, data: 'a:1:0:0', message: { message_thread_id: TOPIC_MAP.prax } } },
  ] } })
  await flush()
  const answeredIds = calls.filter(c => c.method === 'answerCallbackQuery').map(c => c.body.callback_query_id)
  assert.ok(answeredIds.includes('cb-late'), 'a tap on a cancelled ask must still be answered (answerCallbackQuery) so the tapper\'s client stops spinning')
  await adapter.stop()
})
