'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { ROOT, tmpdir, read } = require('../helpers')

// Pins the session wrap-up Stop hook (autopilot/hooks/session-wrapup.js +
// autopilot/daemon/wrapup.js, autopilot 0.7.0) against the binding wire contract in
// autopilot-hub docs/canonical/spoke-hooks.md § "Session wrap-up Stop hook (brief 06)":
// verdict/summary/queueCount derivation from the transcript's last assistant message, the
// silent-skip rules (non-verdict line, emoji-only line, missing credential), the idempotent
// project registration → report POST sequence with the bearer token, and the hook's
// exit-0-always guarantee (a Stop hook that exits non-zero would block session end).
// Stub-hub tests use async `spawn`, never `spawnSync` — the stub http.Server lives in this
// process (tests/autopilot/enroll.test.js repair round 1, 2026-08-08: spawnSync starves the
// stub's event loop and deadlocks every live-stub test).

const HOOK = path.join(ROOT, 'autopilot', 'hooks', 'session-wrapup.js')
const {
  deriveWrapup,
  lastAssistantText,
  mintEventId,
} = require(path.join(ROOT, 'autopilot', 'daemon', 'wrapup.js'))

function writeTranscript(entries) {
  const dir = tmpdir('wrapup-transcript')
  const file = path.join(dir, 'transcript.jsonl')
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return file
}

function assistantEntry(text, extra = {}) {
  return { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, ...extra }
}

function writeHubJson(home, hubUrl) {
  const dir = path.join(home, '.config', 'autopilot')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'hub.json'),
    JSON.stringify({ hubUrl, spokeId: 'spoke-1', token: 'secret-token', contractVersion: 1 })
  )
}

function runHook(stdinJson, { home = tmpdir('wrapup-home') } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, 5000)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ status: timedOut ? null : code, signal, stdout, stderr, home })
    })
    child.stdin.end(JSON.stringify(stdinJson))
  })
}

function startStub(handler) {
  return new Promise((resolve) => {
    const requests = []
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, headers: req.headers, body })
        handler(req, res, body)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, requests }))
  })
}

function stopStub(server) {
  return new Promise((resolve) => server.close(resolve))
}

// Answers both endpoints the way the live hub does.
function hubHandler(req, res) {
  if (req.url === '/api/spokes/projects') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ projectId: 'proj-1', name: 'x', created: true, contractVersion: 1 }))
    return
  }
  if (req.url === '/api/spokes/report') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ contractVersion: 1, accepted: 1, duplicates: 0 }))
    return
  }
  res.writeHead(404).end()
}

// --- derivation ---

test('deriveWrapup maps 🟢/🟡/🔴 first lines to green/yellow/red with the emoji stripped from the summary', () => {
  for (const [emoji, word] of [['🟢', 'green'], ['🟡', 'yellow'], ['🔴', 'red']]) {
    const result = deriveWrapup(`${emoji} shipped the thing\nevidence below`)
    assert.strictEqual(result.verdict, word,
      `a ${emoji} verdict line relayed as "${result && result.verdict}" would narrate the wrong verdict on JJ's phone`)
    assert.strictEqual(result.summary, 'shipped the thing',
      'an unstripped or untrimmed summary would render the emoji twice in the hub narration')
  }
})

test('deriveWrapup returns null for a first line without a verdict emoji — quick Q&A turns must not POST', () => {
  assert.strictEqual(deriveWrapup('Here is the answer to your question.\n🟢 not on line 1'), null,
    'a non-verdict turn producing a payload would spam a wrap-up event for every conversational answer')
})

test('deriveWrapup returns null for an emoji-only verdict line (empty summary is a skip, never a best-effort POST)', () => {
  assert.strictEqual(deriveWrapup('🟢  \nrest of message'), null,
    'an empty summary would violate SessionWrapupPayload minLength:1 — the retainer ruling makes this a skip')
})

test('deriveWrapup truncates the summary to 500 code points', () => {
  const long = '🟢 ' + '🎯'.repeat(600)
  const result = deriveWrapup(long)
  assert.strictEqual(Array.from(result.summary).length, 500,
    'a summary over 500 code points would be rejected by the schema hub-side and lose the wrap-up')
})

test('deriveWrapup counts 📋/👤/📌 queue items across bare, bulleted, and numbered lines', () => {
  const message = [
    '🟡 shipped with friction',
    '📋 Paste this: npm test',
    '- 👤 Do this: log into the dashboard',
    '2. 📌 Decide this: default X',
    '---',
    'evidence mentioning a clipboard but starting with no emoji',
  ].join('\n')
  assert.strictEqual(deriveWrapup(message).queueCount, 3,
    'a wrong queueCount mis-renders the "· n for you" suffix that tells JJ whether action is needed')
})

test('deriveWrapup reports queueCount 0 for the explicit empty queue', () => {
  const result = deriveWrapup('🟢 all clean\n✅ Nothing needs you.\n---\nevidence')
  assert.strictEqual(result.queueCount, 0,
    'a nonzero count on an empty queue would show a phantom "for you" suffix')
})

// --- transcript parsing ---

test('lastAssistantText returns the last non-sidechain assistant text, skipping tool-use-only and sidechain entries', () => {
  const file = writeTranscript([
    { type: 'user', message: { role: 'user', content: 'go' } },
    assistantEntry('🟢 the real wrap-up'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] } },
    assistantEntry('🔴 subagent noise', { isSidechain: true }),
  ])
  assert.strictEqual(lastAssistantText(file), '🟢 the real wrap-up',
    'picking a tool-use entry or a subagent sidechain message would relay the wrong (or no) verdict')
})

test('lastAssistantText returns null for a missing or assistant-free transcript', () => {
  assert.strictEqual(lastAssistantText(path.join(tmpdir('wrapup-none'), 'nope.jsonl')), null,
    'a throw here would bubble out of the hook and risk noise at session end')
  const file = writeTranscript([{ type: 'user', message: { role: 'user', content: 'hi' } }])
  assert.strictEqual(lastAssistantText(file), null,
    'a transcript with no assistant text must be a skip, not a crash')
})

// --- eventId ---

test('mintEventId mints 26-char Crockford ULIDs matching the contract dedupe-key pattern', () => {
  const id = mintEventId()
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/,
    'an eventId outside the ReportedEvent pattern is rejected by the hub and the wrap-up is lost')
  assert.notStrictEqual(mintEventId(), mintEventId(),
    'colliding eventIds would dedupe distinct wrap-ups into one')
})

// --- hook end-to-end (stub hub) ---

test('hook posts project registration then one session_wrapup event with the bearer token and derived payload', async () => {
  const { server, port, requests } = await startStub(hubHandler)
  const home = tmpdir('wrapup-home')
  writeHubJson(home, `http://127.0.0.1:${port}`)
  const cwd = tmpdir('wrapup-repo')
  const transcript = writeTranscript([
    assistantEntry('🟡 shipped with one flaky test\n📋 Paste this: npm test\n---\nevidence'),
  ])

  const result = await runHook({ transcript_path: transcript, cwd, hook_event_name: 'Stop' }, { home })
  await stopStub(server)

  assert.strictEqual(result.status, 0, `a non-zero Stop hook blocks session end (stderr: ${result.stderr})`)
  assert.strictEqual(requests.length, 2,
    'the contract is exactly two POSTs: idempotent project resolution, then the report')

  const [projects, report] = requests
  assert.strictEqual(projects.url, '/api/spokes/projects',
    'resolving the projectId anywhere else breaks D5 auto-registration')
  assert.deepStrictEqual(JSON.parse(projects.body), { name: path.basename(cwd) },
    'a project name other than the repo dir basename lands the wrap-up in the wrong Telegram topic')
  assert.strictEqual(projects.headers.authorization, 'Bearer secret-token',
    'without the brief-02 spoke bearer token the hub answers 401 and the wrap-up is lost')

  assert.strictEqual(report.url, '/api/spokes/report',
    'the event must ride the existing report API, not a new endpoint')
  const body = JSON.parse(report.body)
  assert.strictEqual(body.events.length, 1, 'the contract is one event per session end')
  const event = body.events[0]
  assert.strictEqual(event.type, 'session_wrapup',
    'any other type is not narrated as a wrap-up line')
  assert.strictEqual(event.projectId, 'proj-1',
    'reporting without the resolved projectId makes the narrator skip the event (NULL-project rule)')
  assert.match(event.eventId, /^[0-9A-HJKMNP-TV-Z]{26}$/,
    'a non-ULID eventId fails ReportedEvent validation hub-side')
  assert.deepStrictEqual(event.payload,
    { verdict: 'yellow', summary: 'shipped with one flaky test', queueCount: 1 },
    'the payload is the narrated content — any drift here mis-renders the phone notification')
  assert.strictEqual(result.stdout, '', 'Stop-hook stdout would leak into the session transcript')
})

test('hook exits 0 silently and never touches the hub when the first line has no verdict emoji', async () => {
  const { server, port, requests } = await startStub(hubHandler)
  const home = tmpdir('wrapup-home')
  writeHubJson(home, `http://127.0.0.1:${port}`)
  const transcript = writeTranscript([assistantEntry('Just answering a quick question.')])

  const result = await runHook({ transcript_path: transcript, cwd: tmpdir('wrapup-repo') }, { home })
  await stopStub(server)

  assert.strictEqual(result.status, 0, 'a skip must still exit 0 or session end is blocked')
  assert.strictEqual(requests.length, 0,
    'POSTing for a non-verdict turn would create a hub event for every Q&A answer')
  assert.strictEqual(result.stdout + result.stderr, '',
    'skip turns must be silent — any output is session-end noise')
})

test('hook exits 0 silently when no spoke credential exists (unenrolled machine)', async () => {
  const transcript = writeTranscript([assistantEntry('🟢 all done')])
  const result = await runHook({ transcript_path: transcript, cwd: tmpdir('wrapup-repo') })
  assert.strictEqual(result.status, 0,
    'an unenrolled machine must not have every session end blocked or noisy')
  assert.strictEqual(result.stdout + result.stderr, '',
    'a missing ~/.config/autopilot/hub.json is the normal pre-enrollment state, not an error')
})

test('hook exits 0 even when the hub rejects the report', async () => {
  const { server, port } = await startStub((req, res) => {
    if (req.url === '/api/spokes/projects') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ projectId: 'proj-1', name: 'x', created: false, contractVersion: 1 }))
      return
    }
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 'internal', message: 'boom' }))
  })
  const home = tmpdir('wrapup-home')
  writeHubJson(home, `http://127.0.0.1:${port}`)
  const transcript = writeTranscript([assistantEntry('🔴 hot-patched, see queue')])

  const result = await runHook({ transcript_path: transcript, cwd: tmpdir('wrapup-repo') }, { home })
  await stopStub(server)

  assert.strictEqual(result.status, 0,
    'a hub outage must never block or noise up session end — at-least-once means the event is simply lost this time')
  assert.strictEqual(result.stdout + result.stderr, '', 'hub failures are silent by contract')
})

// --- registration ---

test('plugin.json registers the Stop hook via hooks/hooks.json', () => {
  const manifest = JSON.parse(read('autopilot/.claude-plugin/plugin.json'))
  assert.strictEqual(manifest.hooks, './hooks/hooks.json',
    'without the manifest hooks pointer the Stop hook never runs and no wrap-up is ever relayed')
  const hooks = JSON.parse(read('autopilot/hooks/hooks.json'))
  const stop = hooks.hooks.Stop
  assert.ok(Array.isArray(stop) && stop.length === 1,
    'exactly one Stop matcher group keeps the wrap-up relay single-fire per session end')
  assert.match(stop[0].hooks[0].command, /session-wrapup\.js/,
    'the Stop entry must invoke the wrap-up hook script')
})
