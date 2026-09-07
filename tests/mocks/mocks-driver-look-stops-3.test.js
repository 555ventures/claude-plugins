'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT, LABELS, DENSE,
  writeWireframe,
  freePort, startServe, stopServe,
  advanceToJourneyApproved, advanceToDirectionComposed, advanceToShortJourneyDrawn,
  stubNpx,
} = require('./mocks-driver-fixtures')

// specs/20260906/05-gray-states-on-every-wireframe.md D7 (per-file 45 s budget guard,
// specs/20260903/07-test-file-budget-guard.md): split from
// tests/mocks/mocks-driver-look-stops.test.js — the AC-20260906-04-8/-9/-3 tests below (the
// review-page-vs-atlas URL distinction and `look --port`'s served-URL screenshot path) move here
// verbatim, test logic and AC tags unchanged.
//
// specs/20260906/04-journey-review-page.md D6: a journey stop's link is the review page, never
// the atlas (AC-20260906-04-8); `stop open theme` SHALL CONTINUE TO write the atlas URL
// (AC-20260906-04-9). Review fix round F4/F9 (AC-20260906-04-3): `look --port` prefers
// design-atlas.js's own `?state=` injection over the file:// sibling path, and an undeclared or
// invalid `--state` refuses before any screenshot CLI invocation.

// ---------------------------------------------------------------------------
// AC-20260906-04-8 / AC-20260906-04-9
// ---------------------------------------------------------------------------
// A5 (specs/20260906/04-journey-review-page.md): specs/20260905/03's `variants:<j>` stop is still
// `hardened`, not built — buildStopSpec() in mocks-driver.js has no `variants:` arm at all yet, so
// that arm of this AC cannot be exercised against the current tree. Per A5 it is omitted here,
// tagged `[pre-green: specs/20260905/03]`, rather than asserted or env-gated-skipped; once 03
// lands this test gains a third stop open variants:onboarding case asserting the atlas URL.
test('AC-20260906-04-8: stop open journey:<j> --port <free> writes/prints the stop\'s url as http://localhost:<port>/review/<j>.html#stop-<id> and probes that page (never the atlas)', async () => {
  const dir = tmpdir('mocks-driver-review-stop')
  advanceToShortJourneyDrawn(dir, 'onboarding', ['signin', 'invite'])
  const port = await freePort()
  let serveChild = null
  try {
    serveChild = await startServe(dir, port)

    const r = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'journey:onboarding', '--port', String(port)])
    assert.strictEqual(r.status, 0, 'AC-8: stop open journey:onboarding must exit 0 once /review/<j>.html exists and the journey is drawn: ' + r.stdout + r.stderr)
    const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
    assert.match(lines[0], /^🎨 ready for review — http:\/\/localhost:\d+\/review\/onboarding\.html#stop-P\d+$/,
      'AC-8: the printed link must be the D6 review-page URL (http://localhost:<port>/review/onboarding.html#stop-<id>), never the atlas: got ' + JSON.stringify(lines[0]))
    assert.match(lines[0], new RegExp('localhost:' + port + '/'), 'AC-8: the printed link must name the project\'s own --port ' + port + ': ' + JSON.stringify(lines[0]))

    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const openStop = stops.find((s) => s.status === 'open')
    assert.ok(openStop, 'test setup requires exactly one open stop to exist after stop open journey:onboarding')
    assert.match(openStop.url, /^http:\/\/localhost:\d+\/review\/onboarding\.html#stop-P\d+$/,
      'AC-8: the stop\'s recorded url must be the review-page URL, not the atlas URL: got ' + JSON.stringify(openStop.url))
    assert.strictEqual(openStop.url, lines[0].replace('🎨 ready for review — ', ''), 'the stop\'s recorded url must equal the printed link')
  } finally {
    if (serveChild) await stopServe(serveChild)
  }
})

test('AC-20260906-04-9: stop open theme SHALL CONTINUE TO write the atlas URL (never the review page) once 2+ directions are composed', async () => {
  const dir = tmpdir('mocks-driver-review-stop-theme')
  advanceToJourneyApproved(dir)
  advanceToDirectionComposed(dir, 'ocean', [DENSE, LABELS[0]], 'P15')
  advanceToDirectionComposed(dir, 'ember', [DENSE, LABELS[1]], 'P16')
  const port = await freePort()
  let serveChild = null
  try {
    serveChild = await startServe(dir, port)
    const r = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'theme', '--port', String(port)])
    assert.strictEqual(r.status, 0, 'AC-9: stop open theme must exit 0 once 2+ directions are composed: ' + r.stdout + r.stderr)
    const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
    assert.match(lines[0], /atlas\/index\.html#stop-P\d+$/, 'AC-9: stop open theme must CONTINUE TO write/print the atlas URL, never a review-page URL: got ' + JSON.stringify(lines[0]))
    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const themeStop = stops.find((s) => s.key === 'theme-picked')
    assert.match(themeStop.url, /atlas\/index\.html#stop-/, 'AC-9: the theme stop\'s recorded url must CONTINUE TO be the atlas URL: got ' + JSON.stringify(themeStop.url))
  } finally {
    if (serveChild) await stopServe(serveChild)
  }
})

// ---------------------------------------------------------------------------
// review fix round F4 (AC-20260906-04-3): `look --port` prefers design-atlas.js's own `?state=`
// injection on the served mock over the file:// sibling-with-injected-script path.
// ---------------------------------------------------------------------------
test('AC-20260906-04-3: mocks-driver.js look <label> --state <s> --port <p> screenshots the served URL (design-atlas.js\'s own ?state= injection, D2) and never creates the .look-<label>.html sibling; without --port the sibling path is used exactly as before', async () => {
  const dir = tmpdir('mocks-driver-look-port')
  advanceToShortJourneyDrawn(dir, 'onboarding', ['signin', 'invite'])
  // review fix round F9 refuses an undeclared --state — signin must actually declare "empty" for
  // this test to exercise the --port path rather than F9's refusal.
  writeWireframe(dir, 'signin', { stateBtn: '<button data-state-btn="empty">empty</button>' })
  const port = await freePort()
  const siblingPath = path.join(dir, 'design/mocks/.look-signin.html')
  const outPath = path.join(dir, 'design/mocks/.looks/signin.empty.png')
  let serveChild = null
  try {
    serveChild = await startServe(dir, port)
    const r = runNode(SCRIPT, ['--root', dir, 'look', 'signin', '--state', 'empty', '--port', String(port)])
    assert.ok(!fs.existsSync(siblingPath), 'F4: look --port must never create the file:// sibling .look-signin.html: ' + JSON.stringify(r))
    if (r.status === 0) {
      assert.ok(fs.existsSync(outPath), 'F4: look --port must write the screenshot once playwright succeeds: ' + r.stdout + r.stderr)
    } else {
      assert.strictEqual(r.status, 2, 'a failed look must CONTINUE TO exit 2 on the existing playwright-failure remedy path: ' + r.stdout + r.stderr)
      assert.match(r.stderr, new RegExp('http://localhost:' + port + '/mocks/signin\\.html\\?clean&state=empty'),
        'F4: the failure remedy must name the SERVED url (?clean&state=empty) once --port is given, never a sibling file: ' + JSON.stringify(r.stderr))
    }
  } finally {
    if (serveChild) await stopServe(serveChild)
  }

  const dir2 = tmpdir('mocks-driver-look-noport')
  advanceToShortJourneyDrawn(dir2, 'onboarding', ['signin', 'invite'])
  writeWireframe(dir2, 'signin', { stateBtn: '<button data-state-btn="empty">empty</button>' })
  const r2 = runNode(SCRIPT, ['--root', dir2, 'look', 'signin', '--state', 'empty'])
  if (r2.status === 0) {
    assert.ok(!fs.existsSync(path.join(dir2, 'design/mocks/.look-signin.html')),
      'without --port, once playwright succeeds the sibling must still be cleaned up exactly as before: ' + JSON.stringify(r2))
  } else {
    assert.strictEqual(r2.status, 2, 'a failed look without --port must CONTINUE TO exit 2 on the existing remedy path: ' + r2.stdout + r2.stderr)
    assert.match(r2.stderr, /file:\/\/.*\.look-signin\.html/,
      'without --port the failure remedy must CONTINUE TO name the file:// sibling target, unchanged: ' + JSON.stringify(r2.stderr))
  }
})

// ---------------------------------------------------------------------------
// review fix round F9: an undeclared/invalid --state must refuse BEFORE any target is built —
// silently dropping it (design-atlas.js's own validState) would otherwise write a state-named PNG
// of the HAPPY state, which looks like a captured state but is not one.
// ---------------------------------------------------------------------------
test('AC-20260906-04-3 (F9): look <label> --state "x\'y" refuses naming the mock\'s declared states before invoking the screenshot CLI at all — never a silently-dropped state producing a state-named PNG of the happy state', () => {
  const dir = tmpdir('mocks-driver-look-badstate')
  advanceToShortJourneyDrawn(dir, 'onboarding', ['signin', 'invite'])
  writeWireframe(dir, 'signin', { stateBtn: '<button data-state-btn="empty">empty</button><button data-state-btn="loading">loading</button>' })
  const argvLog = path.join(dir, 'npx-argv.log')
  const okPath = stubNpx(dir, { exitCode: 0, logArgvTo: argvLog })

  const r = runNode(SCRIPT, ['--root', dir, 'look', 'signin', '--state', "x'y", '--port', '4599'],
    { env: { ...process.env, PATH: okPath } })
  assert.notStrictEqual(r.status, 0, 'F9: an undeclared/invalid --state must refuse, never exit 0: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /empty/, 'F9: the refusal must name the mock\'s declared states, including "empty": ' + JSON.stringify(r.stderr))
  assert.match(r.stderr, /loading/, 'F9: the refusal must name the mock\'s declared states, including "loading": ' + JSON.stringify(r.stderr))
  assert.ok(!fs.existsSync(argvLog), 'F9: the refusal must happen before the screenshot CLI is ever invoked — the stub\'s argv log must not exist: got ' + (fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8') : ''))
  assert.ok(!fs.existsSync(path.join(dir, "design/mocks/.looks/signin.x'y.png")),
    'F9: a silently-dropped state would write a state-named PNG of the happy state (looks captured, is not) — no such file may exist')
})

